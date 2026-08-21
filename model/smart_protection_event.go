package model

import (
	"strings"
	"time"
)

type SmartProtectionEvent struct {
	Id           int    `json:"id"`
	UserId       int    `json:"user_id" gorm:"index;index:idx_smart_protection_user_created,priority:1"`
	Username     string `json:"username" gorm:"type:varchar(64);index"`
	Email        string `json:"email" gorm:"type:varchar(255)"`
	TokenId      int    `json:"token_id" gorm:"index"`
	TokenName    string `json:"token_name" gorm:"type:varchar(64)"`
	ChannelId    int    `json:"channel_id" gorm:"index"`
	ChannelName  string `json:"channel_name" gorm:"type:varchar(191)"`
	RequestId    string `json:"request_id" gorm:"type:varchar(64);index"`
	ModelName    string `json:"model_name" gorm:"type:varchar(191);index"`
	GuardModel   string `json:"guard_model" gorm:"type:varchar(191)"`
	Safety       string `json:"safety" gorm:"type:varchar(32);index"`
	Categories   string `json:"categories" gorm:"type:text"`
	Content      string `json:"content" gorm:"type:text"`
	ContentHash  string `json:"content_hash" gorm:"type:char(64);index"`
	RawResult    string `json:"raw_result" gorm:"type:text"`
	Action       string `json:"action" gorm:"type:varchar(32);index"`
	ReviewTimeMs int64  `json:"review_time_ms"`
	EmailSent    bool   `json:"email_sent"`
	EmailError   string `json:"email_error,omitempty" gorm:"type:varchar(255)"`
	CreatedAt    int64  `json:"created_at" gorm:"autoCreateTime;index;index:idx_smart_protection_user_created,priority:2"`
}

type SmartProtectionEventFilter struct {
	UserId    int
	ChannelId int
	Safety    string
	Category  string
	StartTime int64
	EndTime   int64
	Offset    int
	Limit     int
}

func CreateSmartProtectionEvent(event *SmartProtectionEvent) error {
	return DB.Create(event).Error
}

func UpdateSmartProtectionEmailResult(id int, sent bool, emailError string) error {
	return DB.Model(&SmartProtectionEvent{}).Where("id = ?", id).Updates(map[string]any{
		"email_sent":  sent,
		"email_error": emailError,
	}).Error
}

func ListSmartProtectionEvents(filter SmartProtectionEventFilter) ([]*SmartProtectionEvent, int64, error) {
	query := DB.Model(&SmartProtectionEvent{})
	if filter.UserId > 0 {
		query = query.Where("user_id = ?", filter.UserId)
	}
	if filter.ChannelId > 0 {
		query = query.Where("channel_id = ?", filter.ChannelId)
	}
	if safety := strings.TrimSpace(filter.Safety); safety != "" {
		query = query.Where("safety = ?", safety)
	}
	if category := strings.TrimSpace(filter.Category); category != "" {
		query = query.Where("categories LIKE ?", "%\""+category+"\"%")
	}
	if filter.StartTime > 0 {
		query = query.Where("created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("created_at <= ?", filter.EndTime)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var events []*SmartProtectionEvent
	err := query.Select(
		"id", "user_id", "username", "email", "token_id", "token_name",
		"channel_id", "channel_name", "request_id", "model_name", "guard_model",
		"safety", "categories", "content_hash", "action", "review_time_ms",
		"email_sent", "created_at",
	).Order("created_at desc").Order("id desc").Offset(filter.Offset).Limit(limit).Find(&events).Error
	return events, total, err
}

func GetSmartProtectionEvent(id int) (*SmartProtectionEvent, error) {
	var event SmartProtectionEvent
	if err := DB.First(&event, id).Error; err != nil {
		return nil, err
	}
	return &event, nil
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
	err := DB.Select("id", "username", "email").First(&user, userId).Error
	return user, err
}
