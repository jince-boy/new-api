package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupInvitationDetailsLegacyDB(t *testing.T) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db

	require.NoError(t, db.AutoMigrate(&model.User{}))
	require.NoError(t, db.Exec(`
		CREATE TABLE top_ups (
			id integer PRIMARY KEY,
			user_id integer,
			amount integer,
			money real,
			trade_no text,
			payment_method text,
			payment_provider text,
			create_time integer,
			complete_time integer,
			status text
		)
	`).Error)

	t.Cleanup(func() {
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
}

func TestGetInvitationDetailsSucceedsWithLegacyTables(t *testing.T) {
	setupInvitationDetailsLegacyDB(t)

	require.NoError(t, model.DB.Create(&model.User{
		Id:              41,
		Username:        "details_inviter",
		DisplayName:     "Inviter",
		Status:          common.UserStatusEnabled,
		AffCount:        1,
		AffQuota:        500,
		AffHistoryQuota: 500,
		AffCode:         "INV41",
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Id:          42,
		Username:    "details_invitee",
		DisplayName: "Invitee",
		Status:      common.UserStatusEnabled,
		InviterId:   41,
		AffCode:     "INV42",
		CreatedAt:   1779783729,
	}).Error)
	require.NoError(t, model.DB.Exec(
		"INSERT INTO top_ups (id, user_id, amount, money, trade_no, payment_method, payment_provider, create_time, complete_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		43, 42, 2, 2, "reward-details-legacy", model.PaymentMethodStripe, model.PaymentProviderStripe, int64(100), int64(200), common.TopUpStatusSuccess,
	).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/aff/details", nil)
	ctx.Set("id", 41)

	GetInvitationDetails(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			InvitedUsers  []model.InvitedUserDetail   `json:"invited_users"`
			InvitedTotal  int64                       `json:"invited_total"`
			RebateDetails []model.InviterRebateDetail `json:"rebate_details"`
			RebateTotal   int64                       `json:"rebate_total"`
			AffCount      int                         `json:"aff_count"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.EqualValues(t, 1, payload.Data.InvitedTotal)
	require.Len(t, payload.Data.InvitedUsers, 1)
	require.Equal(t, 42, payload.Data.InvitedUsers[0].Id)
	require.EqualValues(t, 1779783729, payload.Data.InvitedUsers[0].CreatedAt)
	require.EqualValues(t, 1, payload.Data.RebateTotal)
	require.Len(t, payload.Data.RebateDetails, 1)
	require.Equal(t, "reward-details-legacy", payload.Data.RebateDetails[0].TradeNo)
	require.Equal(t, 1, payload.Data.AffCount)
}

func TestGetAffCodeCanReturnInvitationDetails(t *testing.T) {
	setupInvitationDetailsLegacyDB(t)

	require.NoError(t, model.DB.Create(&model.User{
		Id:          51,
		Username:    "details_query_inviter",
		DisplayName: "Inviter",
		Status:      common.UserStatusEnabled,
		AffCount:    1,
		AffCode:     "INV51",
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Id:          52,
		Username:    "details_query_invitee",
		DisplayName: "Invitee",
		Status:      common.UserStatusEnabled,
		InviterId:   51,
		AffCode:     "INV52",
		CreatedAt:   1779783729,
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/aff?details=1", nil)
	ctx.Set("id", 51)

	GetAffCode(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			InvitedUsers []model.InvitedUserDetail `json:"invited_users"`
			InvitedTotal int64                     `json:"invited_total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.EqualValues(t, 1, payload.Data.InvitedTotal)
	require.Len(t, payload.Data.InvitedUsers, 1)
	require.Equal(t, 52, payload.Data.InvitedUsers[0].Id)
	require.EqualValues(t, 1779783729, payload.Data.InvitedUsers[0].CreatedAt)
}
