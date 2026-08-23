package model

import (
	"path/filepath"
	"strconv"
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

func TestListSmartProtectionEventsReturnsEmptyArrayAfterAllEventsAreDeleted(t *testing.T) {
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, DB.Create(&SmartProtectionEvent{UserId: 1, ContentHash: "deleted"}).Error)
	deleted, err := DeleteAllSmartProtectionEvents()
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	events, total, err := ListSmartProtectionEvents(SmartProtectionEventFilter{Limit: 10})

	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.NotNil(t, events)
	assert.Empty(t, events)
}

func TestListSmartProtectionEventsSearchesAndReturnsCurrentUserStatus(t *testing.T) {
	previousDB := DB
	db, err := gorm.Open(sqlite.Open("file:smart-protection-list?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, DB.Create(&User{Id: 91, Username: "alice", Status: 2}).Error)
	require.NoError(t, DB.Create(&[]SmartProtectionEvent{
		{UserId: 91, Username: "alice", ChannelId: 7, ChannelName: "Protected channel", ModelName: "gpt-risk", Safety: "Controversial", Categories: `["Non-violent Illegal Acts"]`, CreatedAt: 10},
		{UserId: 92, Username: "bob", ChannelId: 8, ChannelName: "Other channel", ModelName: "gpt-safe", Safety: "Safe", Categories: `[]`, CreatedAt: 9},
	}).Error)

	events, total, err := ListSmartProtectionEvents(SmartProtectionEventFilter{Keyword: "illegal", Limit: 10})

	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, events, 1)
	assert.Equal(t, "alice", events[0].Username)
	assert.Equal(t, 2, events[0].UserStatus)
}

func TestListSmartProtectionEventsFiltersByUsernameSafetyAndCategory(t *testing.T) {
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, DB.Create(&[]SmartProtectionEvent{
		{UserId: 1, Username: "alice", Safety: "Unsafe", Categories: `["Jailbreak"]`, CreatedAt: 3},
		{UserId: 2, Username: "alice", Safety: "Safe", Categories: `[]`, CreatedAt: 2},
		{UserId: 3, Username: "bob", Safety: "Unsafe", Categories: `["Jailbreak"]`, CreatedAt: 1},
	}).Error)

	events, total, err := ListSmartProtectionEvents(SmartProtectionEventFilter{
		Username: "ALI", Safety: "unsafe", Category: "jailbreak", Limit: 10,
	})

	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, events, 1)
	assert.Equal(t, "alice", events[0].Username)
}

func TestSmartProtectionEventPersistsAndDetailsRemainQueryable(t *testing.T) {
	previousDB := DB
	dsn := filepath.Join(t.TempDir(), "smart-protection.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, DB.Create(&User{Id: 101, Username: "persisted-user", Status: 1}).Error)
	event := &SmartProtectionEvent{
		UserId: 101, RequestId: "req-persisted", Safety: "Controversial", Categories: `["Jailbreak"]`,
		Content: "persisted risk content", RawResult: "Safety: Controversial", CreatedAt: 100,
	}
	require.NoError(t, CreateSmartProtectionEvent(event))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	reopened, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	reopenedSQLDB, err := reopened.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, reopenedSQLDB.Close()) })
	DB = reopened
	stored, err := GetSmartProtectionEvent(event.Id)

	require.NoError(t, err)
	assert.Equal(t, "req-persisted", stored.RequestId)
	assert.Equal(t, "persisted risk content", stored.Content)
	assert.Equal(t, "Safety: Controversial", stored.RawResult)
}

func TestListSmartProtectionEventsReturnsStableDatabasePages(t *testing.T) {
	previousDB := DB
	db, err := gorm.Open(sqlite.Open("file:smart-protection-pages?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &SmartProtectionEvent{}))
	DB = db
	t.Cleanup(func() { DB = previousDB })

	events := make([]SmartProtectionEvent, 0, 25)
	for id := 1; id <= 25; id++ {
		events = append(events, SmartProtectionEvent{Id: id, UserId: 1, ContentHash: strconv.Itoa(id), CreatedAt: int64(id)})
	}
	require.NoError(t, DB.Create(&events).Error)

	page, total, err := ListSmartProtectionEvents(SmartProtectionEventFilter{Offset: 10, Limit: 10})

	require.NoError(t, err)
	assert.Equal(t, int64(25), total)
	require.Len(t, page, 10)
	assert.Equal(t, 15, page[0].Id)
	assert.Equal(t, 6, page[9].Id)
}
