package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeGroupChatQRCodeExpiresAt(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	_, normalized, err := NormalizeGroupChatQRCodeExpiresAt("2026-06-23T10:00:00Z", now)
	require.NoError(t, err)
	assert.Equal(t, "2026-06-23T10:00:00Z", normalized)

	_, _, err = NormalizeGroupChatQRCodeExpiresAt("2026-06-22T09:59:00Z", now)
	require.Error(t, err)

	_, _, err = NormalizeGroupChatQRCodeExpiresAt("", now)
	require.Error(t, err)
}

func TestShouldSendGroupChatQRCodeExpirationReminder(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)
	normalized := "2026-06-23T09:00:00Z"

	assert.False(t, shouldSendGroupChatQRCodeExpirationReminder(
		now,
		now.Add(25*time.Hour),
		"",
		"2026-06-23T11:00:00Z",
	))
	assert.True(t, shouldSendGroupChatQRCodeExpirationReminder(
		now,
		now.Add(23*time.Hour),
		"",
		normalized,
	))
	assert.True(t, shouldSendGroupChatQRCodeExpirationReminder(
		now,
		now.Add(-time.Hour),
		"",
		normalized,
	))
	assert.False(t, shouldSendGroupChatQRCodeExpirationReminder(
		now,
		now.Add(23*time.Hour),
		normalized,
		normalized,
	))
}
