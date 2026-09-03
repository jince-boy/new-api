package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestProcessChannelErrorAlwaysRecordsSmartProtectionBlock(t *testing.T) {
	previousLogDB := model.LOG_DB
	previousErrorLogEnabled := constant.ErrorLogEnabled
	logDB, err := gorm.Open(sqlite.Open("file:smart-protection-error-log?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, logDB.AutoMigrate(&model.Log{}))
	model.LOG_DB = logDB
	constant.ErrorLogEnabled = false
	t.Cleanup(func() {
		model.LOG_DB = previousLogDB
		constant.ErrorLogEnabled = previousErrorLogEnabled
	})

	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	context.Set("id", 42)
	context.Set("username", "risk-user")
	context.Set("token_id", 9)
	context.Set("token_name", "risk-token")
	context.Set("channel_id", 7)
	context.Set("original_model", "gpt-risk")
	context.Set(common.RequestIdKey, "req-smart-protection-block")

	relayInfo := &relaycommon.RelayInfo{
		StartTime:                   time.Now().Add(-time.Second),
		SmartProtectionReviewTime:   125 * time.Millisecond,
		SmartProtectionReviewStatus: "blocked",
		SmartProtectionReviewReason: "blocking_rule_matched",
		SmartProtectionMatchedRules: []string{"unsafe-safety"},
		SmartProtectionSafeties:     []string{"Unsafe"},
		SmartProtectionCategories:   []string{"Non-violent Illegal Acts"},
	}
	blockErr := types.NewErrorWithStatusCode(
		errors.New("request blocked by smart protection"),
		types.ErrorCodeSmartProtectionBlocked,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
	)

	processChannelError(context, types.ChannelError{
		ChannelId: 7, ChannelType: 1, ChannelName: "protected-channel",
	}, blockErr, relayInfo)

	var log model.Log
	require.NoError(t, logDB.Where("request_id = ?", "req-smart-protection-block").Take(&log).Error)
	assert.Equal(t, model.LogTypeError, log.Type)
	assert.Equal(t, 42, log.UserId)
	assert.Equal(t, 7, log.ChannelId)
	var other map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(log.Other, &other))
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(125), adminInfo["smart_protection_review_ms"])
	assert.Equal(t, []interface{}{"Unsafe"}, adminInfo["smart_protection_safeties"])
	assert.Equal(t, []interface{}{"Non-violent Illegal Acts"}, adminInfo["smart_protection_categories"])
	assert.Equal(t, "blocked", adminInfo["smart_protection_review_status"])
	assert.Equal(t, "blocking_rule_matched", adminInfo["smart_protection_review_reason"])
	assert.Equal(t, []interface{}{"unsafe-safety"}, adminInfo["smart_protection_matched_rules"])
}
