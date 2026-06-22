package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	groupChatQRCodeExpiresAtOptionKey       = "GroupChatQRCodeExpiresAt"
	groupChatQRCodeReminderSentForOptionKey = "GroupChatQRCodeReminderSentFor"
	groupChatQRCodeReminderTickInterval     = time.Hour
	groupChatQRCodeReminderThreshold        = 24 * time.Hour
)

var (
	groupChatQRCodeReminderOnce    sync.Once
	groupChatQRCodeReminderRunning atomic.Bool
)

func parseGroupChatQRCodeExpiresAt(raw string) (time.Time, string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return time.Time{}, "", false
	}

	if timestamp, err := strconv.ParseInt(value, 10, 64); err == nil {
		if timestamp > 1_000_000_000_000 {
			timestamp /= 1000
		}
		expiresAt := time.Unix(timestamp, 0)
		return expiresAt, expiresAt.UTC().Format(time.RFC3339), true
	}

	for _, format := range []string{time.RFC3339Nano, time.RFC3339} {
		expiresAt, err := time.Parse(format, value)
		if err == nil {
			return expiresAt, expiresAt.UTC().Format(time.RFC3339), true
		}
	}

	localFormats := []string{
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	for _, format := range localFormats {
		expiresAt, err := time.ParseInLocation(format, value, time.Local)
		if err == nil {
			return expiresAt, expiresAt.UTC().Format(time.RFC3339), true
		}
	}

	return time.Time{}, "", false
}

func NormalizeGroupChatQRCodeExpiresAt(raw string, now time.Time) (time.Time, string, error) {
	expiresAt, normalized, ok := parseGroupChatQRCodeExpiresAt(raw)
	if !ok {
		return time.Time{}, "", fmt.Errorf("invalid QR code expiration time")
	}
	if !expiresAt.After(now) {
		return time.Time{}, "", fmt.Errorf("QR code expiration time must be in the future")
	}
	return expiresAt, normalized, nil
}

func getGroupChatQRCodeReminderOption(key string) string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return strings.TrimSpace(common.OptionMap[key])
}

func shouldSendGroupChatQRCodeExpirationReminder(now, expiresAt time.Time, sentFor, normalizedExpiresAt string) bool {
	if normalizedExpiresAt == "" || sentFor == normalizedExpiresAt {
		return false
	}
	return !now.Before(expiresAt.Add(-groupChatQRCodeReminderThreshold))
}

func groupChatQRCodeExpirationTimeText(expiresAt time.Time) string {
	return expiresAt.Local().Format("2006-01-02 15:04:05 MST")
}

func buildGroupChatQRCodeExpirationNotification(expiresAt time.Time, now time.Time) (string, string) {
	expiresAtText := groupChatQRCodeExpirationTimeText(expiresAt)
	if now.After(expiresAt) {
		return "Group chat QR code has expired", fmt.Sprintf("The group chat QR code expired at %s. Please upload a new QR code.", expiresAtText)
	}
	return "Group chat QR code expires soon", fmt.Sprintf("The group chat QR code will expire at %s. Please upload a new QR code.", expiresAtText)
}

func runGroupChatQRCodeExpirationReminderOnce() {
	if !groupChatQRCodeReminderRunning.CompareAndSwap(false, true) {
		return
	}
	defer groupChatQRCodeReminderRunning.Store(false)

	rawExpiresAt := getGroupChatQRCodeReminderOption(groupChatQRCodeExpiresAtOptionKey)
	expiresAt, normalizedExpiresAt, ok := parseGroupChatQRCodeExpiresAt(rawExpiresAt)
	if !ok {
		return
	}

	sentFor := getGroupChatQRCodeReminderOption(groupChatQRCodeReminderSentForOptionKey)
	now := time.Now()
	if !shouldSendGroupChatQRCodeExpirationReminder(now, expiresAt, sentFor, normalizedExpiresAt) {
		return
	}

	subject, content := buildGroupChatQRCodeExpirationNotification(expiresAt, now)
	NotifyRootUser(dto.NotifyTypeGroupChatQRCodeExpiry, subject, content)
	if err := model.UpdateOption(groupChatQRCodeReminderSentForOptionKey, normalizedExpiresAt); err != nil {
		logger.LogWarn(context.Background(), fmt.Sprintf("group chat QR code reminder: failed to mark reminder sent: %v", err))
	}
}

func StartGroupChatQRCodeExpirationReminderTask() {
	groupChatQRCodeReminderOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("group chat QR code expiration reminder task started: tick=%s threshold=%s", groupChatQRCodeReminderTickInterval, groupChatQRCodeReminderThreshold))

			runGroupChatQRCodeExpirationReminderOnce()
			ticker := time.NewTicker(groupChatQRCodeReminderTickInterval)
			defer ticker.Stop()
			for range ticker.C {
				runGroupChatQRCodeExpirationReminderOnce()
			}
		})
	})
}
