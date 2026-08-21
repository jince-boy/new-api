package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDeleteAllSmartProtectionEventsRemovesEveryEvent(t *testing.T) {
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, DB.Create(&[]SmartProtectionEvent{
		{UserId: 1, ContentHash: "first"},
		{UserId: 2, ContentHash: "second"},
	}).Error)

	deleted, err := DeleteAllSmartProtectionEvents()

	require.NoError(t, err)
	assert.Equal(t, int64(2), deleted)
	var remaining int64
	require.NoError(t, DB.Model(&SmartProtectionEvent{}).Count(&remaining).Error)
	assert.Zero(t, remaining)
}
