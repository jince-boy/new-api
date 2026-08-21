package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateTextOtherInfoUsesUpstreamTTFTAndKeepsInternalTimingAdminOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	start := time.Unix(100, 0)
	info := &common.RelayInfo{
		StartTime:                 start,
		FirstResponseTime:         start.Add(6 * time.Second),
		ChannelRateLimitQueueTime: 5 * time.Second,
		SmartProtectionReviewTime: 1500 * time.Millisecond,
		IsStream:                  true,
		UpstreamStartTime:         start.Add(5 * time.Second),
		UpstreamFirstContentTime:  start.Add(6 * time.Second),
		ChannelMeta:               &common.ChannelMeta{},
	}

	other := GenerateTextOtherInfo(ctx, info, 1, 1, 1, 0, 0, 0, 1)

	assert.Equal(t, float64(1000), other["frt"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, int64(5000), adminInfo["channel_rate_limit_queue_ms"])
	assert.Equal(t, int64(1500), adminInfo["smart_protection_review_ms"])
	assert.NotContains(t, other, "smart_protection_review_ms")
}
