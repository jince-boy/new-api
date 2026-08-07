package model

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetTokenUsageQuotasScopesPeriodsUserAndLogType(t *testing.T) {
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	previousLogDB := LOG_DB
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	LOG_DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		LOG_DB = previousLogDB
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	location := time.FixedZone("UTC+8", 8*60*60)
	now := time.Date(2026, time.August, 6, 12, 0, 0, 0, location)
	todayStart := time.Date(2026, time.August, 6, 0, 0, 0, 0, location)
	logs := []Log{
		{UserId: 7, TokenId: 101, Type: LogTypeConsume, CreatedAt: now.Add(-time.Hour).Unix(), Quota: 100},
		{UserId: 7, TokenId: 101, Type: LogTypeConsume, CreatedAt: todayStart.AddDate(0, 0, -10).Unix(), Quota: 200},
		{UserId: 7, TokenId: 101, Type: LogTypeConsume, CreatedAt: todayStart.AddDate(0, 0, -29).Unix(), Quota: 300},
		{UserId: 7, TokenId: 101, Type: LogTypeConsume, CreatedAt: todayStart.AddDate(0, 0, -30).Unix(), Quota: 400},
		{UserId: 7, TokenId: 101, Type: LogTypeRefund, CreatedAt: now.Add(-time.Hour).Unix(), Quota: 50},
		{UserId: 8, TokenId: 101, Type: LogTypeConsume, CreatedAt: now.Add(-time.Hour).Unix(), Quota: 900},
		{UserId: 7, TokenId: 102, Type: LogTypeConsume, CreatedAt: now.Add(-time.Minute).Unix(), Quota: 40},
		{UserId: 7, TokenId: 103, Type: LogTypeConsume, CreatedAt: now.Add(-time.Minute).Unix(), Quota: 800},
		{UserId: 7, TokenId: 101, Type: LogTypeConsume, CreatedAt: now.Add(time.Hour).Unix(), Quota: 700},
	}
	require.NoError(t, db.Create(&logs).Error)

	usage, err := GetTokenUsageQuotas(7, []int{101, 102}, now)
	require.NoError(t, err)

	assert.Equal(t, TokenUsageQuota{Today: 100, Last30Days: 600}, usage[101])
	assert.Equal(t, TokenUsageQuota{Today: 40, Last30Days: 40}, usage[102])
	_, found := usage[103]
	assert.False(t, found)
}

func TestGetTokenUsageQuotasHandlesEmptyTokenPage(t *testing.T) {
	usage, err := GetTokenUsageQuotas(7, nil, time.Now())
	require.NoError(t, err)
	assert.Empty(t, usage)
}
