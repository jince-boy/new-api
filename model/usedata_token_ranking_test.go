package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertTokenRankingQuotaData(t *testing.T, userID int, username string, modelName string, tokenUsed int) {
	t.Helper()
	require.NoError(t, DB.Create(&QuotaData{
		UserID:    userID,
		Username:  username,
		ModelName: modelName,
		CreatedAt: 1715000000,
		TokenUsed: tokenUsed,
		Count:     1,
		Quota:     tokenUsed,
	}).Error)
}

func clearTokenRankingQuotaData(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&QuotaData{}))
	require.NoError(t, DB.Exec("DELETE FROM quota_data").Error)
	t.Cleanup(func() {
		_ = DB.Exec("DELETE FROM quota_data").Error
	})
}

func TestGetTokenRanking_LimitsAndCountsAllUsers(t *testing.T) {
	truncateTables(t)
	clearTokenRankingQuotaData(t)

	for i := 1; i <= 12; i++ {
		insertTokenRankingQuotaData(t, i, "rank_user_"+string(rune('a'+i-1)), "gpt-4o", i*100)
	}

	items, total, err := GetTokenRanking(TokenRankingQuery{
		StartTime: 1714990000,
		EndTime:   1715010000,
		Limit:     10,
	})
	require.NoError(t, err)

	assert.Len(t, items, 10)
	assert.Equal(t, int64(12), total)
	assert.Equal(t, "rank_user_l", items[0].Username)
	assert.Equal(t, int64(1200), items[0].TokenUsed)
}

func TestGetTokenRanking_AdminCanReadAllAndSelfRank(t *testing.T) {
	truncateTables(t)
	clearTokenRankingQuotaData(t)

	insertTokenRankingQuotaData(t, 1, "alpha", "gpt-4o", 100)
	insertTokenRankingQuotaData(t, 2, "bravo", "gpt-4o", 300)
	insertTokenRankingQuotaData(t, 3, "charlie", "gpt-4o-mini", 200)

	items, total, err := GetTokenRanking(TokenRankingQuery{
		StartTime: 1714990000,
		EndTime:   1715010000,
	})
	require.NoError(t, err)

	rank, tokens, err := GetUserTokenRanking(TokenRankingQuery{
		StartTime: 1714990000,
		EndTime:   1715010000,
		UserID:    3,
	})
	require.NoError(t, err)

	assert.Len(t, items, 3)
	assert.Equal(t, int64(3), total)
	assert.Equal(t, "bravo", items[0].Username)
	assert.Equal(t, 2, rank)
	assert.Equal(t, int64(200), tokens)
}
