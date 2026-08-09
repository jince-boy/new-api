package controller

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func configureIntelligentRetryGroupForTest(t *testing.T, group string) {
	t.Helper()
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
}

func TestIntelligentSchedulingRetriesAnyUpstreamStatusBeforeResponseStarts(t *testing.T) {
	const group = "controller-intelligent-retry"
	configureIntelligentRetryGroupForTest(t, group)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	info := &relaycommon.RelayInfo{UpstreamStartTime: time.Now()}

	for _, statusCode := range []int{http.StatusBadRequest, http.StatusForbidden, http.StatusNotFound, http.StatusTooManyRequests, 524} {
		relayErr := types.NewOpenAIError(errors.New("upstream failed"), types.ErrorCodeBadResponseStatusCode, statusCode)
		assert.True(t, shouldRetry(c, info, relayErr, 1), "status code %d should fail over", statusCode)
	}
}

func TestIntelligentSchedulingDoesNotRetryLocalAbortOrStartedResponse(t *testing.T) {
	const group = "controller-intelligent-retry-boundary"
	configureIntelligentRetryGroupForTest(t, group)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	startedAt := time.Now()
	info := &relaycommon.RelayInfo{StartTime: startedAt.Add(-time.Second), UpstreamStartTime: startedAt}

	clientCancel := types.NewOpenAIError(context.Canceled, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	assert.False(t, shouldRetry(c, info, clientCancel, 1))

	localError := types.NewErrorWithStatusCode(errors.New("invalid local request"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	assert.False(t, shouldRetry(c, &relaycommon.RelayInfo{}, localError, 1))

	_, err := c.Writer.Write([]byte("started"))
	require.NoError(t, err)
	assert.False(t, shouldRetry(c, info, types.NewOpenAIError(errors.New("late failure"), types.ErrorCodeBadResponse, 500), 1))

	streamContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(streamContext, constant.ContextKeyUsingGroup, group)
	streamInfo := &relaycommon.RelayInfo{
		StartTime:                startedAt.Add(-time.Second),
		UpstreamStartTime:        startedAt,
		UpstreamFirstContentTime: startedAt.Add(time.Second),
		IsStream:                 true,
	}
	assert.False(t, shouldRetry(streamContext, streamInfo, types.NewOpenAIError(errors.New("stream interrupted"), types.ErrorCodeBadResponse, 500), 1))
}
