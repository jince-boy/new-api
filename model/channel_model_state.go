package model

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm/clause"
)

const ChannelSchedulingFaultReasonPrefix = "[intelligent-scheduling] "

// ChannelModelState stores durable model-specific scheduling faults. Whole
// channel faults continue to use channels.status so all existing channel
// management and cache invalidation behavior remains authoritative.
type ChannelModelState struct {
	ChannelId  int    `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	Model      string `json:"model" gorm:"type:varchar(191);primaryKey;autoIncrement:false"`
	Disabled   bool   `json:"disabled" gorm:"index"`
	Reason     string `json:"reason" gorm:"type:text"`
	ErrorCode  string `json:"error_code" gorm:"size:128"`
	StatusCode int    `json:"status_code"`
	DisabledAt int64  `json:"disabled_at" gorm:"bigint;index"`
	UpdatedAt  int64  `json:"updated_at" gorm:"bigint"`
}

func IsChannelSchedulingFault(channel *Channel) bool {
	if channel == nil {
		return false
	}
	reason, _ := channel.GetOtherInfo()["status_reason"].(string)
	return strings.HasPrefix(reason, ChannelSchedulingFaultReasonPrefix)
}

func GetChannelSchedulingFaultReason(channel *Channel) string {
	if channel == nil {
		return ""
	}
	reason, _ := channel.GetOtherInfo()["status_reason"].(string)
	return strings.TrimPrefix(reason, ChannelSchedulingFaultReasonPrefix)
}

func DisableChannelForScheduling(channelId int, reason string) error {
	markedReason := ChannelSchedulingFaultReasonPrefix + reason
	if UpdateChannelStatus(channelId, "", common.ChannelStatusAutoDisabled, markedReason) {
		return nil
	}

	pollingLock := GetChannelPollingLock(channelId)
	pollingLock.Lock()
	defer pollingLock.Unlock()

	channel, err := GetChannelById(channelId, true)
	if err != nil {
		return err
	}
	if channel.Status != common.ChannelStatusAutoDisabled {
		InitChannelCache()
		return fmt.Errorf("channel %d was not disabled", channelId)
	}
	info := channel.GetOtherInfo()
	info["status_reason"] = markedReason
	info["status_time"] = common.GetTimestamp()
	channel.SetOtherInfo(info)
	if err := channel.saveStatusState(); err != nil {
		return err
	}
	CacheUpdateChannel(channel)
	return nil
}

func DisableChannelModel(channelId int, modelName string, reason string, errorCode string, statusCode int) error {
	now := time.Now().Unix()
	state := ChannelModelState{
		ChannelId:  channelId,
		Model:      modelName,
		Disabled:   true,
		Reason:     reason,
		ErrorCode:  errorCode,
		StatusCode: statusCode,
		DisabledAt: now,
		UpdatedAt:  now,
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "channel_id"}, {Name: "model"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"disabled":    true,
			"reason":      reason,
			"error_code":  errorCode,
			"status_code": statusCode,
			"disabled_at": now,
			"updated_at":  now,
		}),
	}).Create(&state).Error
}

func RestoreChannelModel(channelId int, modelName string) (bool, error) {
	result := DB.Model(&ChannelModelState{}).
		Where("channel_id = ? AND model = ? AND disabled = ?", channelId, modelName, true).
		Updates(map[string]interface{}{
			"disabled":    false,
			"reason":      "",
			"error_code":  "",
			"status_code": 0,
			"updated_at":  time.Now().Unix(),
		})
	return result.RowsAffected > 0, result.Error
}

func ListChannelModelStates(disabledOnly bool) ([]ChannelModelState, error) {
	var states []ChannelModelState
	query := DB.Model(&ChannelModelState{})
	if disabledOnly {
		query = query.Where("disabled = ?", true)
	}
	err := query.Order("updated_at DESC").Find(&states).Error
	return states, err
}

func ListAutoDisabledChannels() ([]Channel, error) {
	var channels []Channel
	err := DB.Where("status = ?", common.ChannelStatusAutoDisabled).
		Order("id ASC").Find(&channels).Error
	return channels, err
}
