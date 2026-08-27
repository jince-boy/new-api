package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type channelModelRestoreRequest struct {
	ChannelId int    `json:"channel_id"`
	Model     string `json:"model"`
}

type channelRestoreRequest struct {
	ChannelId int `json:"channel_id"`
}

func GetChannelSchedulingOverview(c *gin.Context) {
	var priority *int64
	if rawPriority := strings.TrimSpace(c.Query("priority")); rawPriority != "" {
		value, err := strconv.ParseInt(rawPriority, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid priority"})
			return
		}
		priority = &value
	}
	since := int64(0)
	if rawSince := strings.TrimSpace(c.Query("since")); rawSince != "" {
		value, err := strconv.ParseInt(rawSince, 10, 64)
		if err != nil || value < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid since"})
			return
		}
		since = value
	}
	overview, err := service.GetChannelSchedulingOverview(c.Query("group"), c.Query("model"), priority, since)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": overview})
}

func GetChannelSchedulingSetting(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": operation_setting.GetChannelSchedulingSetting()})
}

func UpdateChannelSchedulingSetting(c *gin.Context) {
	request := operation_setting.ChannelSchedulingSetting{}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	request, err := operation_setting.NormalizeAndValidateChannelSchedulingSetting(request)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	groupStrategies, err := common.Marshal(request.GroupStrategies)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	values := map[string]string{
		"channel_scheduling_setting.default_strategy":               request.DefaultStrategy,
		"channel_scheduling_setting.group_strategies":               string(groupStrategies),
		"channel_scheduling_setting.minimum_factor":                 strconv.FormatFloat(request.MinimumFactor, 'f', -1, 64),
		"channel_scheduling_setting.maximum_factor":                 strconv.FormatFloat(request.MaximumFactor, 'f', -1, 64),
		"channel_scheduling_setting.performance_exponent":           strconv.FormatFloat(request.PerformanceExponent, 'f', -1, 64),
		"channel_scheduling_setting.inflight_penalty":               strconv.FormatFloat(request.InflightPenalty, 'f', -1, 64),
		"channel_scheduling_setting.warmup_samples":                 strconv.Itoa(request.WarmupSamples),
		"channel_scheduling_setting.sample_window_size":             strconv.Itoa(request.SampleWindowSize),
		"channel_scheduling_setting.sample_max_age_minutes":         strconv.Itoa(request.SampleMaxAgeMinutes),
		"channel_scheduling_setting.severe_ttft_ms":                 strconv.FormatInt(request.SevereTtftMs, 10),
		"channel_scheduling_setting.failure_threshold":              strconv.Itoa(request.FailureThreshold),
		"channel_scheduling_setting.failure_window_seconds":         strconv.Itoa(request.FailureWindowSeconds),
		"channel_scheduling_setting.auto_recovery_interval_seconds": strconv.Itoa(request.AutoRecoveryIntervalSeconds),
		"channel_scheduling_setting.max_attempts":                   strconv.Itoa(request.MaxAttempts),
		"channel_scheduling_setting.realtime_retention_minutes":     strconv.Itoa(request.RealtimeRetentionMin),
		"channel_scheduling_setting.soft_affinity_enabled":          strconv.FormatBool(request.SoftAffinityEnabled),
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "channel.scheduling_settings_update", map[string]interface{}{
		"default_strategy": request.DefaultStrategy,
		"group_overrides":  len(request.GroupStrategies),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": operation_setting.GetChannelSchedulingSetting()})
}

func RestoreChannelModelScheduling(c *gin.Context) {
	request := channelModelRestoreRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.ChannelId <= 0 || strings.TrimSpace(request.Model) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	changed, err := service.RestoreScheduledChannelModel(request.ChannelId, request.Model)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "channel.scheduling_model_restore", map[string]interface{}{
		"channel_id": request.ChannelId,
		"model":      strings.TrimSpace(request.Model),
		"changed":    changed,
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": changed})
}

func DisableChannelModelScheduling(c *gin.Context) {
	request := channelModelRestoreRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.ChannelId <= 0 || strings.TrimSpace(request.Model) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	if err := service.MarkScheduledChannelModelManualDisabled(request.ChannelId, request.Model); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "channel.scheduling_model_manual_disable", map[string]interface{}{
		"channel_id": request.ChannelId,
		"model":      strings.TrimSpace(request.Model),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": true})
}

func RestoreChannelScheduling(c *gin.Context) {
	request := channelRestoreRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.ChannelId <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	changed, err := service.RestoreScheduledChannel(request.ChannelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "channel.scheduling_channel_restore", map[string]interface{}{
		"channel_id": request.ChannelId,
		"changed":    changed,
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": changed})
}

func DisableChannelScheduling(c *gin.Context) {
	request := channelRestoreRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.ChannelId <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	changed, err := service.MarkScheduledChannelManualDisabled(request.ChannelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "channel.scheduling_channel_manual_disable", map[string]interface{}{"channel_id": request.ChannelId, "changed": changed})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": changed})
}
