package service

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntelligentSchedulingIgnoresLegacyChannelWeights(t *testing.T) {
	key := schedulingPoolKey{Group: "scheduler-test", Model: "gpt-test", Priority: 10}
	channelScheduler.poolsMu.Lock()
	delete(channelScheduler.pools, key)
	channelScheduler.poolsMu.Unlock()

	weight100 := uint(100)
	weight50 := uint(50)
	channels := []*model.Channel{
		{Id: 1, Name: "primary", Weight: &weight100},
		{Id: 2, Name: "secondary", Weight: &weight50},
	}
	selected := map[int]int{}
	for range 6 {
		channel := selectSmoothWeightedChannel(key, channels)
		require.NotNil(t, channel)
		selected[channel.Id]++
	}

	assert.Equal(t, 3, selected[1])
	assert.Equal(t, 3, selected[2])
}

func TestHighestPrioritySchedulingTierKeepsFailoverBoundary(t *testing.T) {
	high := int64(20)
	low := int64(10)
	channels := []*model.Channel{
		{Id: 1, Priority: &low},
		{Id: 2, Priority: &high},
		{Id: 3, Priority: &high},
	}

	priority, tier := highestPrioritySchedulingTier(channels)

	assert.Equal(t, int64(20), priority)
	require.Len(t, tier, 2)
	assert.Equal(t, []int{2, 3}, []int{tier[0].Id, tier[1].Id})
}

func TestCalculatePerformanceFactorUsesWarmupConfidence(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{
		MinimumFactor:       0.1,
		MaximumFactor:       2,
		PerformanceExponent: 1,
		WarmupSamples:       10,
		SevereTtftMs:        60_000,
	}

	slow := calculatePerformanceFactor(&channelSchedulingState{EstimatedTtftMs: 2000, Samples: 1}, 1000, setting)
	fastWarmup := calculatePerformanceFactor(&channelSchedulingState{EstimatedTtftMs: 500, Samples: 1}, 1000, setting)
	fastReady := calculatePerformanceFactor(&channelSchedulingState{EstimatedTtftMs: 500, Samples: 10}, 1000, setting)

	assert.Equal(t, 0.95, slow)
	assert.Equal(t, 1.1, fastWarmup)
	assert.Equal(t, 2.0, fastReady)
}

func TestSingleThirtySecondSampleDoesNotDominateColdStart(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{
		MinimumFactor: 0.2, MaximumFactor: 1.5, PerformanceExponent: 0.5,
		WarmupSamples: 5, SevereTtftMs: 60_000,
	}

	factor := calculatePerformanceFactor(&channelSchedulingState{EstimatedTtftMs: 30_000, LastTtftMs: 30_000, Samples: 1}, 1000, setting)

	assert.InDelta(t, 0.8365, factor, 0.001)
}

func TestCalculatePerformanceFactorImmediatelyPenalizesSevereTtft(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{
		MinimumFactor:       0.1,
		MaximumFactor:       2,
		PerformanceExponent: 0.7,
		WarmupSamples:       10,
		SevereTtftMs:        60_000,
	}

	factor := calculatePerformanceFactor(&channelSchedulingState{EstimatedTtftMs: 43_000, LastTtftMs: 60_000, Samples: 1}, 43_000, setting)

	assert.Equal(t, 0.1, factor)
}

func TestSchedulingTtftSamplesUseRecentBoundedMedian(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{SampleWindowSize: 4, SampleMaxAgeMinutes: 15}
	state := &channelSchedulingState{}
	now := int64(10_000)
	for _, ttft := range []int64{1000, 30_000, 1100, 1200, 1300} {
		addSchedulingTtftSample(state, now, ttft, setting)
		now++
	}

	assert.Equal(t, int64(4), state.Samples)
	assert.Equal(t, float64(1200), state.EstimatedTtftMs)
	assert.Equal(t, int64(1300), state.LastTtftMs)
}

func TestSchedulingTtftSamplesExpireToNeutral(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{
		MinimumFactor: 0.2, MaximumFactor: 1.5, PerformanceExponent: 0.5,
		InflightPenalty: 0.25, WarmupSamples: 5, SampleWindowSize: 20,
		SampleMaxAgeMinutes: 15, SevereTtftMs: 60_000,
	}
	state := &channelSchedulingState{
		BaseWeight:  intelligentSchedulingBaseWeight,
		TtftSamples: []channelSchedulingTtftSample{{Ts: 100, TtftMs: 30_000}},
	}
	pool := &channelSchedulingPool{channels: map[int]*channelSchedulingState{1: state}}

	refreshSchedulingPoolWeights(pool, setting, 100+15*60+1)

	assert.Zero(t, state.Samples)
	assert.Zero(t, state.EstimatedTtftMs)
	assert.Equal(t, 1.0, state.PerformanceFactor)
	assert.Equal(t, float64(intelligentSchedulingBaseWeight), state.EffectiveWeight)
}

func TestNormalSampleClearsImmediateSeverePenalty(t *testing.T) {
	setting := operation_setting.ChannelSchedulingSetting{
		MinimumFactor: 0.2, MaximumFactor: 1.5, PerformanceExponent: 0.5,
		WarmupSamples: 5, SampleWindowSize: 20, SampleMaxAgeMinutes: 15, SevereTtftMs: 60_000,
	}
	state := &channelSchedulingState{}
	addSchedulingTtftSample(state, 100, 60_000, setting)
	assert.Equal(t, 0.2, calculatePerformanceFactor(state, 1000, setting))

	addSchedulingTtftSample(state, 101, 1000, setting)

	assert.Greater(t, calculatePerformanceFactor(state, 1000, setting), setting.MinimumFactor)
}

func TestClassifySchedulingFaultSeparatesModelAndChannelFaults(t *testing.T) {
	modelFault := types.NewOpenAIError(errors.New("model is not supported"), types.ErrorCodeModelNotFound, http.StatusNotFound)
	rateLimitFault := types.NewOpenAIError(errors.New("rate limited"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests)
	providerOverload := types.NewOpenAIError(errors.New("provider overloaded"), types.ErrorCodeBadResponseStatusCode, 529)
	genericNotFound := types.NewOpenAIError(errors.New("resource unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusNotFound)
	invalidKeyWithBadStatus := types.NewOpenAIError(errors.New("invalid api key"), types.ErrorCodeBadResponseStatusCode, http.StatusBadRequest)
	clientFault := types.NewErrorWithStatusCode(errors.New("invalid request"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	localUnsupportedModel := types.NewErrorWithStatusCode(errors.New("model is not supported"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	awsTimeout := types.NewOpenAIError(context.DeadlineExceeded, types.ErrorCodeAwsInvokeError, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	clientCancel := types.NewOpenAIError(context.Canceled, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	clientCancelWithoutSkip := types.NewOpenAIError(context.Canceled, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	clientDeadline := types.NewOpenAIError(errors.New("client context deadline exceeded"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	invalidOverride := types.NewError(errors.New("invalid channel override"), types.ErrorCodeChannelParamOverrideInvalid, types.ErrOptionWithSkipRetry())
	invalidModelMapping := types.NewError(errors.New("invalid model mapping"), types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	invalidAPIType := types.NewError(errors.New("invalid api type"), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())

	assert.Equal(t, "model", classifySchedulingFault(modelFault))
	assert.Equal(t, "channel", classifySchedulingFault(rateLimitFault))
	assert.Equal(t, "channel", classifySchedulingFault(providerOverload))
	assert.Equal(t, "model", classifySchedulingFault(genericNotFound))
	assert.Equal(t, "channel", classifySchedulingFault(invalidKeyWithBadStatus))
	assert.Empty(t, classifySchedulingFault(clientFault))
	assert.Empty(t, classifySchedulingFault(localUnsupportedModel))
	assert.Equal(t, "channel", classifySchedulingFault(awsTimeout))
	assert.Empty(t, classifySchedulingFault(clientCancel))
	assert.Empty(t, classifySchedulingFault(clientCancelWithoutSkip))
	assert.Empty(t, classifySchedulingFault(clientDeadline))
	assert.Equal(t, "channel", classifySchedulingFault(invalidOverride))
	assert.Equal(t, "model", classifySchedulingFault(invalidModelMapping))
	assert.Equal(t, "model", classifySchedulingFault(invalidAPIType))
}

func TestShouldEnableChannelRequiresManualRecoveryForSchedulingFault(t *testing.T) {
	previous := common.AutomaticEnableChannelEnabled
	common.AutomaticEnableChannelEnabled = true
	t.Cleanup(func() { common.AutomaticEnableChannelEnabled = previous })

	channel := &model.Channel{Status: common.ChannelStatusAutoDisabled}
	assert.True(t, ShouldEnableChannel(nil, channel))

	channel.SetOtherInfo(map[string]interface{}{
		"status_reason": model.ChannelSchedulingFaultReasonPrefix + "rate limited",
	})
	assert.True(t, model.IsChannelSchedulingFault(channel))
	assert.Equal(t, "rate limited", model.GetChannelSchedulingFaultReason(channel))
	assert.False(t, ShouldEnableChannel(nil, channel))
}

func TestChannelUsesIntelligentSchedulingWhenAnyConfiguredGroupOptsIn(t *testing.T) {
	original := operation_setting.GetChannelSchedulingSetting()
	originalGroups, err := common.Marshal(original.GroupStrategies)
	require.NoError(t, err)
	require.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
		"group_strategies": `{"legacy-group":"legacy","smart-group":"intelligent"}`,
	}))
	t.Cleanup(func() {
		require.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
			"group_strategies": string(originalGroups),
		}))
	})

	assert.True(t, ChannelUsesIntelligentScheduling(&model.Channel{Group: "legacy-group, smart-group"}))
	assert.False(t, ChannelUsesIntelligentScheduling(&model.Channel{Group: "legacy-group"}))
	group, ok := GetIntelligentSchedulingGroupForChannel(&model.Channel{Group: "legacy-group, smart-group"})
	assert.True(t, ok)
	assert.Equal(t, "smart-group", group)
}

func TestSchedulingFaultRemainsUnavailableInLegacyMode(t *testing.T) {
	key := channelModelKey{ChannelId: 41, Model: "gpt-test"}
	channelScheduler.disabledMu.Lock()
	previous, existed := channelScheduler.disabled[key]
	channelScheduler.disabled[key] = model.ChannelModelState{ChannelId: key.ChannelId, Model: key.Model, Disabled: true}
	channelScheduler.disabledMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.disabledMu.Lock()
		if existed {
			channelScheduler.disabled[key] = previous
		} else {
			delete(channelScheduler.disabled, key)
		}
		channelScheduler.disabledMu.Unlock()
	})

	assert.False(t, IsChannelUsableForScheduling("legacy-test-group", key.Model, key.ChannelId))
}

func TestSmoothWeightedSchedulingKeepsSeverelySlowChannelInRotation(t *testing.T) {
	key := schedulingPoolKey{Group: "slow-channel-test", Model: "gpt-test", Priority: 10}
	channelScheduler.poolsMu.Lock()
	channelScheduler.pools[key] = &channelSchedulingPool{channels: map[int]*channelSchedulingState{
		1: {ChannelId: 1, BaseWeight: 100, TtftSamples: schedulerSamples(time.Now().Unix(), 10, 1000), Buckets: map[int64]*ChannelSchedulingBucket{}},
		2: {ChannelId: 2, BaseWeight: 100, TtftSamples: schedulerSamples(time.Now().Unix(), 10, 60_000), Buckets: map[int64]*ChannelSchedulingBucket{}},
	}}
	channelScheduler.poolsMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.poolsMu.Lock()
		delete(channelScheduler.pools, key)
		channelScheduler.poolsMu.Unlock()
	})

	weight := uint(100)
	channels := []*model.Channel{{Id: 1, Name: "fast", Weight: &weight}, {Id: 2, Name: "slow", Weight: &weight}}
	selected := map[int]int{}
	for range 50 {
		channel := selectSmoothWeightedChannel(key, channels)
		require.NotNil(t, channel)
		selected[channel.Id]++
	}

	assert.Positive(t, selected[2])
	assert.Greater(t, selected[1], selected[2])
}

func TestSmoothWeightedSchedulingRotatesAcrossFiveChannelsAndFavorsLowerTtft(t *testing.T) {
	key := schedulingPoolKey{Group: "five-channel-test", Model: "gpt-test", Priority: 10}
	weight := uint(100)
	channels := []*model.Channel{
		{Id: 11, Name: "channel-1", Weight: &weight},
		{Id: 12, Name: "channel-2", Weight: &weight},
		{Id: 13, Name: "channel-3", Weight: &weight},
		{Id: 14, Name: "channel-4", Weight: &weight},
		{Id: 15, Name: "channel-5", Weight: &weight},
	}
	channelScheduler.poolsMu.Lock()
	delete(channelScheduler.pools, key)
	channelScheduler.poolsMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.poolsMu.Lock()
		delete(channelScheduler.pools, key)
		channelScheduler.poolsMu.Unlock()
	})

	equalSelections := map[int]int{}
	for range 50 {
		selected := selectSmoothWeightedChannel(key, channels)
		require.NotNil(t, selected)
		equalSelections[selected.Id]++
	}
	for _, channel := range channels {
		assert.Equal(t, 10, equalSelections[channel.Id])
	}

	pool := getSchedulingPool(key)
	pool.mu.Lock()
	ttfts := map[int]int64{11: 3000, 12: 5000, 13: 4000, 14: 6000, 15: 4500}
	for channelId, ttft := range ttfts {
		state := pool.channels[channelId]
		state.CurrentWeight = 0
		state.TtftSamples = schedulerSamples(time.Now().Unix(), 10, ttft)
	}
	pool.mu.Unlock()

	adaptiveSelections := map[int]int{}
	for range 200 {
		selected := selectSmoothWeightedChannel(key, channels)
		require.NotNil(t, selected)
		adaptiveSelections[selected.Id]++
	}
	for _, channel := range channels {
		assert.Positive(t, adaptiveSelections[channel.Id])
	}
	assert.Greater(t, adaptiveSelections[11], adaptiveSelections[14])
}

func TestScheduledAttemptRecordsStreamingFirstContentTtft(t *testing.T) {
	const group = "scheduler-ttft-test"
	original := operation_setting.GetChannelSchedulingSetting()
	originalGroups, err := common.Marshal(original.GroupStrategies)
	require.NoError(t, err)
	strategies := original.GroupStrategies
	strategies[group] = operation_setting.ChannelSchedulingStrategyIntelligent
	strategiesJSON, err := common.Marshal(strategies)
	require.NoError(t, err)
	require.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
		"group_strategies": string(strategiesJSON),
	}))
	t.Cleanup(func() {
		require.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
			"group_strategies": string(originalGroups),
		}))
	})

	priority := int64(10)
	weight := uint(100)
	channel := &model.Channel{Id: 21, Name: "timed-channel", Priority: &priority, Weight: &weight}
	key := schedulingPoolKey{Group: group, Model: "gpt-test", Priority: priority}
	channelScheduler.poolsMu.Lock()
	channelScheduler.pools[key] = &channelSchedulingPool{channels: map[int]*channelSchedulingState{
		channel.Id: {ChannelId: channel.Id, ChannelName: channel.Name, BaseWeight: 100, Buckets: map[int64]*ChannelSchedulingBucket{}},
	}}
	channelScheduler.poolsMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.poolsMu.Lock()
		delete(channelScheduler.pools, key)
		channelScheduler.poolsMu.Unlock()
	})

	info := &relaycommon.RelayInfo{UsingGroup: group, OriginModelName: "gpt-test", IsStream: true}
	BeginScheduledChannelAttempt(nil, info, channel)
	start := time.Unix(100, 0)
	info.UpstreamStartTime = start
	info.UpstreamResponseTime = start.Add(200 * time.Millisecond)
	info.UpstreamFirstContentTime = start.Add(3 * time.Second)
	FinishScheduledChannelAttempt(info, channel, true, nil)

	pool := getSchedulingPool(key)
	pool.mu.Lock()
	state := *pool.channels[channel.Id]
	pool.mu.Unlock()
	assert.Equal(t, int64(1), state.RequestCount)
	assert.Equal(t, int64(1), state.SuccessCount)
	assert.Equal(t, int64(1), state.Samples)
	assert.Equal(t, int64(3000), state.LastTtftMs)
	assert.Equal(t, float64(3000), state.EstimatedTtftMs)
	assert.Zero(t, state.Inflight)
}

func TestChannelAffinityIsSkippedForIntelligentGroups(t *testing.T) {
	const intelligentGroup = "scheduler-affinity-smart"
	const legacyGroup = "scheduler-affinity-legacy"
	configureSchedulerGroupStrategyForTest(t, intelligentGroup, operation_setting.ChannelSchedulingStrategyIntelligent)
	configureSchedulerGroupStrategyForTest(t, legacyGroup, operation_setting.ChannelSchedulingStrategyLegacy)

	assert.False(t, ShouldUseChannelAffinityForRequest(&RetryParam{TokenGroup: intelligentGroup}))
	assert.True(t, ShouldUseChannelAffinityForRequest(&RetryParam{TokenGroup: legacyGroup}))
}

func TestScheduledAttemptDoesNotCountLocalErrorBeforeUpstreamRequest(t *testing.T) {
	const group = "scheduler-local-error-test"
	configureSchedulerGroupStrategyForTest(t, group, operation_setting.ChannelSchedulingStrategyIntelligent)
	priority := int64(10)
	weight := uint(100)
	channel := &model.Channel{Id: 31, Name: "local-error-channel", Priority: &priority, Weight: &weight}
	key := schedulingPoolKey{Group: group, Model: "gpt-test", Priority: priority}
	channelScheduler.poolsMu.Lock()
	channelScheduler.pools[key] = &channelSchedulingPool{channels: map[int]*channelSchedulingState{
		channel.Id: {ChannelId: channel.Id, ChannelName: channel.Name, BaseWeight: 100, Buckets: map[int64]*ChannelSchedulingBucket{}},
	}}
	channelScheduler.poolsMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.poolsMu.Lock()
		delete(channelScheduler.pools, key)
		channelScheduler.poolsMu.Unlock()
	})

	info := &relaycommon.RelayInfo{UsingGroup: group, OriginModelName: "gpt-test"}
	BeginScheduledChannelAttempt(nil, info, channel)
	FinishScheduledChannelAttempt(info, channel, false, types.NewErrorWithStatusCode(
		errors.New("invalid client request"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry(),
	))

	pool := getSchedulingPool(key)
	pool.mu.Lock()
	state := *pool.channels[channel.Id]
	pool.mu.Unlock()
	assert.Zero(t, state.RequestCount)
	assert.Zero(t, state.SuccessCount)
	assert.Zero(t, state.ErrorCount)
	assert.Zero(t, state.Inflight)
}

func TestScheduledAttemptCountsUpstreamClientErrorWithoutDisablingChannel(t *testing.T) {
	const group = "scheduler-upstream-client-error-test"
	configureSchedulerGroupStrategyForTest(t, group, operation_setting.ChannelSchedulingStrategyIntelligent)
	priority := int64(10)
	weight := uint(100)
	channel := &model.Channel{Id: 32, Name: "upstream-client-error-channel", Priority: &priority, Weight: &weight}
	key := schedulingPoolKey{Group: group, Model: "gpt-test", Priority: priority}
	channelScheduler.poolsMu.Lock()
	channelScheduler.pools[key] = &channelSchedulingPool{channels: map[int]*channelSchedulingState{
		channel.Id: {ChannelId: channel.Id, ChannelName: channel.Name, BaseWeight: 100, Buckets: map[int64]*ChannelSchedulingBucket{}},
	}}
	channelScheduler.poolsMu.Unlock()
	t.Cleanup(func() {
		channelScheduler.poolsMu.Lock()
		delete(channelScheduler.pools, key)
		channelScheduler.poolsMu.Unlock()
	})

	info := &relaycommon.RelayInfo{UsingGroup: group, OriginModelName: "gpt-test"}
	BeginScheduledChannelAttempt(nil, info, channel)
	info.UpstreamStartTime = time.Now()
	FinishScheduledChannelAttempt(info, channel, false, types.NewErrorWithStatusCode(
		errors.New("invalid upstream request"), types.ErrorCodeInvalidRequest, http.StatusBadRequest,
	))

	pool := getSchedulingPool(key)
	pool.mu.Lock()
	state := *pool.channels[channel.Id]
	pool.mu.Unlock()
	assert.Equal(t, int64(1), state.RequestCount)
	assert.Zero(t, state.SuccessCount)
	assert.Equal(t, int64(1), state.ErrorCount)
	assert.Zero(t, state.Inflight)
}

func TestSnapshotSchedulingShareUsesVisibleTimeWindow(t *testing.T) {
	state := &channelSchedulingState{
		ChannelId:    1,
		RequestCount: 100,
		Buckets: map[int64]*ChannelSchedulingBucket{
			100: {Ts: 100, RequestCount: 80},
			200: {Ts: 200, RequestCount: 2},
		},
	}

	snapshot := snapshotSchedulingState(schedulingPoolKey{}, state, 10, 150, 0.1)

	assert.Equal(t, 0.2, snapshot.ActualShare)
	require.Len(t, snapshot.Series, 1)
	assert.Equal(t, int64(200), snapshot.Series[0].Ts)
}

func schedulerSamples(now int64, count int, ttftMs int64) []channelSchedulingTtftSample {
	samples := make([]channelSchedulingTtftSample, count)
	for i := range samples {
		samples[i] = channelSchedulingTtftSample{Ts: now, TtftMs: ttftMs}
	}
	return samples
}
