package operation_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelSchedulingStrategySupportsGlobalAndGroupOverrides(t *testing.T) {
	original := GetChannelSchedulingSetting()
	originalGroups, err := common.Marshal(original.GroupStrategies)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, ApplyChannelSchedulingConfig(map[string]string{
			"default_strategy": original.DefaultStrategy,
			"group_strategies": string(originalGroups),
		}))
	})

	require.NoError(t, ApplyChannelSchedulingConfig(map[string]string{
		"default_strategy": ChannelSchedulingStrategyIntelligent,
		"group_strategies": `{"legacy-group":"legacy"}`,
	}))

	assert.Equal(t, ChannelSchedulingStrategyIntelligent, GetChannelSchedulingStrategy("default"))
	assert.Equal(t, ChannelSchedulingStrategyLegacy, GetChannelSchedulingStrategy("legacy-group"))
}

func validChannelSchedulingSettingForTest() ChannelSchedulingSetting {
	return ChannelSchedulingSetting{
		DefaultStrategy:             ChannelSchedulingStrategyIntelligent,
		GroupStrategies:             map[string]string{"default": ChannelSchedulingStrategyLegacy},
		MinimumFactor:               0.1,
		MaximumFactor:               2,
		PerformanceExponent:         0.7,
		InflightPenalty:             0.35,
		WarmupSamples:               10,
		SampleWindowSize:            20,
		SampleMaxAgeMinutes:         15,
		SevereTtftMs:                60_000,
		FailureThreshold:            8,
		FailureWindowSeconds:        120,
		AutoRecoveryIntervalSeconds: 60,
		MaxAttempts:                 8,
		RealtimeRetentionMin:        60,
	}
}

func TestNormalizeAndValidateChannelSchedulingSetting(t *testing.T) {
	setting := validChannelSchedulingSettingForTest()
	setting.DefaultStrategy = " INTELLIGENT "
	setting.GroupStrategies = map[string]string{" vip ": " LEGACY "}

	normalized, err := NormalizeAndValidateChannelSchedulingSetting(setting)

	require.NoError(t, err)
	assert.Equal(t, ChannelSchedulingStrategyIntelligent, normalized.DefaultStrategy)
	assert.Equal(t, map[string]string{"vip": ChannelSchedulingStrategyLegacy}, normalized.GroupStrategies)
}

func TestNormalizeAndValidateChannelSchedulingSettingDefaultsMissingFailureProtection(t *testing.T) {
	setting := validChannelSchedulingSettingForTest()
	setting.FailureThreshold = 0
	setting.FailureWindowSeconds = 0
	setting.AutoRecoveryIntervalSeconds = 0

	normalized, err := NormalizeAndValidateChannelSchedulingSetting(setting)

	require.NoError(t, err)
	assert.Equal(t, ChannelSchedulingDefaultFailureCount, normalized.FailureThreshold)
	assert.Equal(t, ChannelSchedulingDefaultFailureSec, normalized.FailureWindowSeconds)
	assert.Equal(t, ChannelSchedulingDefaultRecoverySec, normalized.AutoRecoveryIntervalSeconds)
}

func TestNormalizeAndValidateChannelSchedulingSettingRejectsUnsafeFactors(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*ChannelSchedulingSetting)
	}{
		{name: "minimum above one", mutate: func(setting *ChannelSchedulingSetting) { setting.MinimumFactor = 1.1 }},
		{name: "maximum below one", mutate: func(setting *ChannelSchedulingSetting) { setting.MaximumFactor = 0.9 }},
		{name: "maximum too large", mutate: func(setting *ChannelSchedulingSetting) { setting.MaximumFactor = ChannelSchedulingMaxFactor + 1 }},
		{name: "exponent too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.PerformanceExponent = ChannelSchedulingMaxExponent + 1
		}},
		{name: "inflight penalty too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.InflightPenalty = ChannelSchedulingMaxInflightPenalty + 1
		}},
		{name: "warmup too large", mutate: func(setting *ChannelSchedulingSetting) { setting.WarmupSamples = ChannelSchedulingMaxWarmupSamples + 1 }},
		{name: "sample window too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.SampleWindowSize = ChannelSchedulingMaxSampleWindow + 1
		}},
		{name: "warmup exceeds sample window", mutate: func(setting *ChannelSchedulingSetting) {
			setting.SampleWindowSize = setting.WarmupSamples - 1
		}},
		{name: "sample age too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.SampleMaxAgeMinutes = ChannelSchedulingMaxSampleAgeMinutes + 1
		}},
		{name: "severe ttft too large", mutate: func(setting *ChannelSchedulingSetting) { setting.SevereTtftMs = ChannelSchedulingMaxSevereTtftMs + 1 }},
		{name: "failure threshold too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.FailureThreshold = ChannelSchedulingMaxFailureThreshold + 1
		}},
		{name: "failure window too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.FailureWindowSeconds = ChannelSchedulingMaxFailureWindowSec + 1
		}},
		{name: "recovery interval too small", mutate: func(setting *ChannelSchedulingSetting) {
			setting.AutoRecoveryIntervalSeconds = ChannelSchedulingMinRecoverySec - 1
		}},
		{name: "recovery interval too large", mutate: func(setting *ChannelSchedulingSetting) {
			setting.AutoRecoveryIntervalSeconds = ChannelSchedulingMaxRecoverySec + 1
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setting := validChannelSchedulingSettingForTest()
			test.mutate(&setting)
			_, err := NormalizeAndValidateChannelSchedulingSetting(setting)
			assert.Error(t, err)
		})
	}
}

func TestChannelSchedulingRecommendedDefaults(t *testing.T) {
	setting := GetChannelSchedulingSetting()

	assert.Equal(t, ChannelSchedulingStrategyLegacy, setting.DefaultStrategy)
	assert.Equal(t, 0.2, setting.MinimumFactor)
	assert.Equal(t, 1.5, setting.MaximumFactor)
	assert.Equal(t, 0.5, setting.PerformanceExponent)
	assert.Equal(t, 0.25, setting.InflightPenalty)
	assert.Equal(t, 5, setting.WarmupSamples)
	assert.Equal(t, 20, setting.SampleWindowSize)
	assert.Equal(t, 15, setting.SampleMaxAgeMinutes)
	assert.Equal(t, int64(60_000), setting.SevereTtftMs)
	assert.Equal(t, ChannelSchedulingDefaultFailureCount, setting.FailureThreshold)
	assert.Equal(t, ChannelSchedulingDefaultFailureSec, setting.FailureWindowSeconds)
	assert.Equal(t, ChannelSchedulingDefaultRecoverySec, setting.AutoRecoveryIntervalSeconds)
	assert.Equal(t, 8, setting.MaxAttempts)
	assert.Equal(t, 60, setting.RealtimeRetentionMin)
}
