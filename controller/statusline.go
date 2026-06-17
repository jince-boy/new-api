package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type StatuslineMeResponse struct {
	Platform         string  `json:"platform"`
	Balance          float64 `json:"balance"`
	Currency         string  `json:"currency"`
	TodayCost        float64 `json:"todayCost"`
	Channel          string  `json:"channel"`
	ModelDisplayName string  `json:"modelDisplayName"`
}

func GetStatuslineMe(c *gin.Context) {
	userId := c.GetInt("id")
	tokenId := c.GetInt("token_id")

	if userId == 0 || tokenId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "invalid token context",
		})
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	token, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	todayQuota, err := getTodayUsedQuota(userId)
	if err != nil {
		common.SysLog("get statusline today quota failed: " + err.Error())
		todayQuota = 0
	}

	channel := buildStatuslineChannel(user, token)
	modelDisplayName := buildStatuslineModelDisplayName(c, token)

	c.JSON(http.StatusOK, StatuslineMeResponse{
		Platform:         "AxisAPI",
		Balance:          quotaToAmount(user.Quota),
		Currency:         "CNY",
		TodayCost:        quotaToAmount(todayQuota),
		Channel:          channel,
		ModelDisplayName: modelDisplayName,
	})
}

func quotaToAmount(quota int) float64 {
	if common.QuotaPerUnit <= 0 {
		return 0
	}
	return float64(quota) / float64(common.QuotaPerUnit)
}

func getTodayUsedQuota(userId int) (int, error) {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local).Unix()
	end := start + 86400

	var total int64

	err := model.DB.
		Model(&model.Log{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND quota > 0", userId, start, end).
		Select("COALESCE(SUM(quota), 0)").
		Scan(&total).Error

	return int(total), err
}

func buildStatuslineChannel(user *model.User, token *model.Token) string {
	// 推荐：把 token 的分组名称设置成你的状态栏渠道名，例如 Claude-A。
	if token.Group != "" {
		return token.Group
	}

	if user.Group != "" {
		return user.Group
	}

	return "Default"
}

func buildStatuslinePlan(user *model.User) string {
	group := strings.TrimSpace(user.Group)

	if group == "" || group == "default" {
		return "普通用户"
	}

	switch strings.ToLower(group) {
	case "vip":
		return "VIP"
	case "svip":
		return "SVIP"
	case "pro":
		return "Pro"
	default:
		return group
	}
}

func buildStatuslineModelDisplayName(c *gin.Context, token *model.Token) string {
	// 可选：以后 npm 状态栏可以请求 /api/statusline/me?model=claude-sonnet-4-5
	modelName := c.Query("model")

	if modelName == "" && token.ModelLimitsEnabled {
		limits := token.GetModelLimits()
		if len(limits) > 0 {
			modelName = limits[0]
		}
	}

	return shortModelDisplayName(modelName)
}

func shortModelDisplayName(modelName string) string {
	name := strings.ToLower(strings.TrimSpace(modelName))

	if name == "" {
		return ""
	}

	if strings.Contains(name, "sonnet") && strings.Contains(name, "4-5") {
		return "Sonnet 4.5"
	}

	if strings.Contains(name, "sonnet") {
		return "Sonnet"
	}

	if strings.Contains(name, "opus") {
		return "Opus"
	}

	if strings.Contains(name, "haiku") {
		return "Haiku"
	}

	if strings.Contains(name, "gpt-5") || strings.Contains(name, "gpt5") {
		return "GPT-5"
	}

	return modelName
}
