package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type smartProtectionSettingsResponse struct {
	operation_setting.SmartProtectionSetting
	APIKeyConfigured bool   `json:"api_key_configured"`
	APIKeyHint       string `json:"api_key_hint,omitempty"`
}

type smartProtectionUpdateRequest struct {
	Enabled           bool                                         `json:"enabled"`
	BaseURL           string                                       `json:"base_url"`
	APIKey            *string                                      `json:"api_key"`
	Model             string                                       `json:"model"`
	TimeoutSeconds    int                                          `json:"timeout_seconds"`
	MaxContextChars   int                                          `json:"max_context_chars"`
	MaxConcurrent     int                                          `json:"max_concurrent"`
	BlockedSafeties   []string                                     `json:"blocked_safeties"`
	BlockedCategories []string                                     `json:"blocked_categories"`
	BlockedRules      []operation_setting.SmartProtectionRule      `json:"blocked_rules"`
	ChannelIDs        []int                                        `json:"channel_ids"`
	SaveContent       bool                                         `json:"save_content"`
	WarningEmail      bool                                         `json:"warning_email"`
	EmailRules        []operation_setting.SmartProtectionEmailRule `json:"email_rules"`
	RetentionDays     int                                          `json:"retention_days"`
}

func GetSmartProtectionSettings(c *gin.Context) {
	setting := operation_setting.GetSmartProtectionSetting()
	key := strings.TrimSpace(setting.APIKey)
	setting.APIKey = ""
	response := smartProtectionSettingsResponse{SmartProtectionSetting: setting, APIKeyConfigured: key != ""}
	if len(key) > 4 {
		response.APIKeyHint = "••••" + key[len(key)-4:]
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": response})
}

func UpdateSmartProtectionSettings(c *gin.Context) {
	var request smartProtectionUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	current := operation_setting.GetSmartProtectionSetting()
	apiKey := current.APIKey
	if request.APIKey != nil {
		apiKey = strings.TrimSpace(*request.APIKey)
	}
	setting := operation_setting.SmartProtectionSetting{
		Enabled: request.Enabled, BaseURL: strings.TrimSpace(request.BaseURL), APIKey: apiKey, Model: strings.TrimSpace(request.Model),
		TimeoutSeconds: request.TimeoutSeconds, MaxContextChars: request.MaxContextChars, MaxConcurrent: request.MaxConcurrent,
		BlockedSafeties: request.BlockedSafeties, BlockedCategories: request.BlockedCategories,
		BlockedRules: request.BlockedRules,
		ChannelIDs:   request.ChannelIDs, SaveContent: request.SaveContent, WarningEmail: request.WarningEmail, EmailRules: request.EmailRules, RetentionDays: request.RetentionDays,
	}
	if request.BlockedRules != nil {
		setting.BlockedSafeties = []string{}
		setting.BlockedCategories = []string{}
	}
	normalized, err := operation_setting.NormalizeAndValidateSmartProtectionSetting(setting)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	blockedSafeties, err := common.Marshal(normalized.BlockedSafeties)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	blockedCategories, err := common.Marshal(normalized.BlockedCategories)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	blockedRules, err := common.Marshal(normalized.BlockedRules)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	emailRules, err := common.Marshal(normalized.EmailRules)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channelIDs, err := common.Marshal(normalized.ChannelIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	values := map[string]string{
		"smart_protection_setting.enabled":            strconv.FormatBool(normalized.Enabled),
		"smart_protection_setting.base_url":           normalized.BaseURL,
		"smart_protection_setting.api_key":            normalized.APIKey,
		"smart_protection_setting.model":              normalized.Model,
		"smart_protection_setting.timeout_seconds":    strconv.Itoa(normalized.TimeoutSeconds),
		"smart_protection_setting.max_context_chars":  strconv.Itoa(normalized.MaxContextChars),
		"smart_protection_setting.max_concurrent":     strconv.Itoa(normalized.MaxConcurrent),
		"smart_protection_setting.blocked_safeties":   string(blockedSafeties),
		"smart_protection_setting.blocked_categories": string(blockedCategories),
		"smart_protection_setting.blocked_rules":      string(blockedRules),
		"smart_protection_setting.email_rules":        string(emailRules),
		"smart_protection_setting.channel_ids":        string(channelIDs),
		"smart_protection_setting.save_content":       strconv.FormatBool(normalized.SaveContent),
		"smart_protection_setting.warning_email":      strconv.FormatBool(normalized.WarningEmail),
		"smart_protection_setting.retention_days":     strconv.Itoa(normalized.RetentionDays),
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "smart_protection.settings_update", map[string]interface{}{"enabled": normalized.Enabled, "channels": len(normalized.ChannelIDs)})
	GetSmartProtectionSettings(c)
}

func ListSmartProtectionChannels(c *gin.Context) {
	type channelOption struct {
		Id     int    `json:"id"`
		Name   string `json:"name"`
		Type   int    `json:"type"`
		Status int    `json:"status"`
	}
	var channels []channelOption
	err := model.DB.Model(&model.Channel{}).Select("id, name, type, status").Order("id asc").Find(&channels).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": channels})
}

func ListSmartProtectionEvents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	userID, _ := strconv.Atoi(c.Query("user_id"))
	channelID, _ := strconv.Atoi(c.Query("channel_id"))
	startTime, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	endTime, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)
	events, total, err := model.ListSmartProtectionEvents(model.SmartProtectionEventFilter{
		UserId: userID, ChannelId: channelID, Safety: c.Query("safety"), Category: c.Query("category"),
		Keyword: c.Query("keyword"), StartTime: startTime, EndTime: endTime, Offset: (page - 1) * pageSize, Limit: pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": events, "total": total, "page": page, "page_size": pageSize}})
}

func GetSmartProtectionEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid event id"})
		return
	}
	event, err := model.GetSmartProtectionEvent(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "smart protection event not found"})
			return
		}
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": event})
}

func DeleteAllSmartProtectionEvents(c *gin.Context) {
	deleted, err := model.DeleteAllSmartProtectionEvents()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "smart_protection.events_clear", map[string]interface{}{"deleted": deleted})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"deleted": deleted}})
}
