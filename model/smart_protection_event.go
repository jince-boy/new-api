package model

import (
	"strconv"
	"strings"
	"time"
)

type SmartProtectionEvent struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"index;index:idx_smart_protection_user_created,priority:1"`
	Username      string `json:"username" gorm:"type:varchar(64);index"`
	Email         string `json:"email" gorm:"type:varchar(255)"`
	TokenId       int    `json:"token_id" gorm:"index"`
	TokenName     string `json:"token_name" gorm:"type:varchar(64)"`
	ChannelId     int    `json:"channel_id" gorm:"index"`
	ChannelName   string `json:"channel_name" gorm:"type:varchar(191)"`
	RequestId     string `json:"request_id" gorm:"type:varchar(64);index"`
	ModelName     string `json:"model_name" gorm:"type:varchar(191);index"`
	GuardModel    string `json:"guard_model" gorm:"type:varchar(191)"`
	Safety        string `json:"safety" gorm:"type:varchar(32);index"`
	Categories    string `json:"categories" gorm:"type:text"`
	Content       string `json:"content" gorm:"type:text"`
	ContentHash   string `json:"content_hash" gorm:"type:char(64);index"`
	RawResult     string `json:"raw_result" gorm:"type:text"`
	Action        string `json:"action" gorm:"type:varchar(32);index"`
	ReviewTimeMs  int64  `json:"review_time_ms"`
	EmailSent     bool   `json:"email_sent"`
	EmailStatus   string `json:"email_status" gorm:"type:varchar(32);index"`
	EmailRuleName string `json:"email_rule_name,omitempty" gorm:"type:varchar(64)"`
	EmailError    string `json:"email_error,omitempty" gorm:"type:varchar(255)"`
	UserStatus    int    `json:"user_status" gorm:"column:user_status;->;-:migration"`
	CreatedAt     int64  `json:"created_at" gorm:"autoCreateTime;index;index:idx_smart_protection_user_created,priority:2"`
}

type SmartProtectionEventFilter struct {
	UserId    int
	ChannelId int
	Safety    string
	Category  string
	Keyword   string
	StartTime int64
	EndTime   int64
	Offset    int
	Limit     int
}

func CreateSmartProtectionEvent(event *SmartProtectionEvent) error {
	return DB.Create(event).Error
}

func UpdateSmartProtectionEmailResult(id int, sent bool, status string, emailError string) error {
	return DB.Model(&SmartProtectionEvent{}).Where("id = ?", id).Updates(map[string]any{
		"email_sent":   sent,
		"email_status": status,
		"email_error":  emailError,
	}).Error
}

func ListSmartProtectionEvents(filter SmartProtectionEventFilter) ([]*SmartProtectionEvent, int64, error) {
	query := DB.Table("smart_protection_events AS events").Joins("LEFT JOIN users ON users.id = events.user_id")
	if filter.UserId > 0 {
		query = query.Where("events.user_id = ?", filter.UserId)
	}
	if filter.ChannelId > 0 {
		query = query.Where("events.channel_id = ?", filter.ChannelId)
	}
	if safety := strings.TrimSpace(filter.Safety); safety != "" {
		query = query.Where("events.safety = ?", safety)
	}
	if category := strings.TrimSpace(filter.Category); category != "" {
		query = query.Where("events.categories LIKE ?", "%\""+category+"\"%")
	}
	if keyword := strings.ToLower(strings.TrimSpace(filter.Keyword)); keyword != "" {
		like := "%" + keyword + "%"
		condition := "(LOWER(events.username) LIKE ? OR LOWER(events.email) LIKE ? OR LOWER(events.channel_name) LIKE ? OR LOWER(events.model_name) LIKE ? OR LOWER(events.request_id) LIKE ? OR LOWER(events.safety) LIKE ? OR LOWER(events.categories) LIKE ?)"
		args := []any{like, like, like, like, like, like, like}
		if numeric, err := strconv.Atoi(keyword); err == nil && numeric > 0 {
			condition = strings.TrimSuffix(condition, ")") + " OR events.user_id = ? OR events.channel_id = ?)"
			args = append(args, numeric, numeric)
		}
		query = query.Where(condition, args...)
	}
	if filter.StartTime > 0 {
		query = query.Where("events.created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("events.created_at <= ?", filter.EndTime)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	events := make([]*SmartProtectionEvent, 0)
	err := query.Select(
		"events.id", "events.user_id", "events.username", "events.email", "events.token_id", "events.token_name",
		"events.channel_id", "events.channel_name", "events.request_id", "events.model_name", "events.guard_model",
		"events.safety", "events.categories", "events.content_hash", "events.action", "events.review_time_ms",
		"events.email_sent", "events.email_status", "events.email_rule_name", "events.created_at", "users.status AS user_status",
	).Order("events.created_at desc").Order("events.id desc").Offset(filter.Offset).Limit(limit).Scan(&events).Error
	return events, total, err
}

func GetSmartProtectionEvent(id int) (*SmartProtectionEvent, error) {
	var event SmartProtectionEvent
	if err := DB.Table("smart_protection_events AS events").
		Select("events.*, users.status AS user_status").
		Joins("LEFT JOIN users ON users.id = events.user_id").
		Where("events.id = ?", id).Take(&event).Error; err != nil {
		return nil, err
	}
	return &event, nil
}

func DeleteAllSmartProtectionEvents() (int64, error) {
	result := DB.Where("id > ?", 0).Delete(&SmartProtectionEvent{})
	return result.RowsAffected, result.Error
}

func CleanupSmartProtectionEvents(retentionDays int) error {
	if retentionDays <= 0 {
		return nil
	}
	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour).Unix()
	return DB.Where("created_at < ?", cutoff).Delete(&SmartProtectionEvent{}).Error
}

func GetUserIdentityForSmartProtection(userId int) (User, error) {
	var user User
	err := DB.Select("id", "username", "email", "status").First(&user, userId).Error
	return user, err
}
