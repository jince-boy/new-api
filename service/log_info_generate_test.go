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
		SmartProtectionSafeties:   []string{"Controversial"},
		SmartProtectionCategories: []string{"Jailbreak"},
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
	assert.Equal(t, []string{"Controversial"}, adminInfo["smart_protection_safeties"])
	assert.Equal(t, []string{"Jailbreak"}, adminInfo["smart_protection_categories"])
	assert.NotContains(t, other, "smart_protection_review_ms")
}

func TestAttachSmartProtectionReviewTimeKeepsCachedClassification(t *testing.T) {
	other := map[string]interface{}{}
	info := &common.RelayInfo{
		SmartProtectionSafeties:   []string{"Controversial"},
		SmartProtectionCategories: []string{"Non-violent Illegal Acts"},
	}

	attachSmartProtectionReviewTime(other, info)

	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, []string{"Controversial"}, adminInfo["smart_protection_safeties"])
	assert.Equal(t, []string{"Non-violent Illegal Acts"}, adminInfo["smart_protection_categories"])
}

func TestAppendSmartProtectionReviewAdminInfoKeepsEmptySafeCategories(t *testing.T) {
	adminInfo := map[string]interface{}{}
	info := &common.RelayInfo{
		SmartProtectionReviewTime: 25 * time.Millisecond,
		SmartProtectionSafeties:   []string{"Safe"},
	}

	AppendSmartProtectionReviewAdminInfo(adminInfo, info)

	assert.Equal(t, int64(25), adminInfo["smart_protection_review_ms"])
	assert.Equal(t, []string{"Safe"}, adminInfo["smart_protection_safeties"])
	assert.Equal(t, []string{}, adminInfo["smart_protection_categories"])
}

func TestAppendSmartProtectionReviewAdminInfoKeepsEveryReviewStatusAndReason(t *testing.T) {
	cases := []struct {
		status string
		reason string
	}{
		{status: "safe", reason: "safe_classification"},
		{status: "observed", reason: "non_blocking_risk"},
		{status: "blocked", reason: "blocking_rule_matched"},
		{status: "partial", reason: "partial_failure"},
		{status: "failed", reason: "guard_unavailable"},
	}
	for _, testCase := range cases {
		t.Run(testCase.status, func(t *testing.T) {
			adminInfo := map[string]interface{}{}
			info := &common.RelayInfo{
				SmartProtectionReviewStatus: testCase.status,
				SmartProtectionReviewReason: testCase.reason,
				SmartProtectionMatchedRules: []string{"rule-1"},
			}

			AppendSmartProtectionReviewAdminInfo(adminInfo, info)

			assert.Equal(t, testCase.status, adminInfo["smart_protection_review_status"])
			assert.Equal(t, testCase.reason, adminInfo["smart_protection_review_reason"])
			assert.Equal(t, []string{"rule-1"}, adminInfo["smart_protection_matched_rules"])
		})
	}
}

func TestAppendSmartProtectionReviewAdminInfoKeepsReviewFailure(t *testing.T) {
	adminInfo := map[string]interface{}{}
	info := &common.RelayInfo{
		SmartProtectionReviewTime:   25 * time.Millisecond,
		SmartProtectionReviewError:  "smart protection upstream returned status 401",
		SmartProtectionReviewStatus: "failed",
		SmartProtectionReviewReason: "guard_unavailable",
	}

	AppendSmartProtectionReviewAdminInfo(adminInfo, info)

	assert.Equal(t, int64(25), adminInfo["smart_protection_review_ms"])
	assert.Equal(t, []string{}, adminInfo["smart_protection_safeties"])
	assert.Equal(t, []string{}, adminInfo["smart_protection_categories"])
	assert.Equal(t, "failed", adminInfo["smart_protection_review_status"])
	assert.Equal(t, "guard_unavailable", adminInfo["smart_protection_review_reason"])
	assert.Equal(t, "smart protection upstream returned status 401", adminInfo["smart_protection_review_error"])
}
