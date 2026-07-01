package controller

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type tokenAPIResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type tokenPageResponse struct {
	Items []tokenResponseItem `json:"items"`
}

type tokenResponseItem struct {
	ID              int      `json:"id"`
	Name            string   `json:"name"`
	Key             string   `json:"key"`
	Status          int      `json:"status"`
	DefaultChat     bool     `json:"default_chat"`
	DefaultPurposes []string `json:"default_purposes"`
}

type tokenKeyResponse struct {
	Key string `json:"key"`
}

type tokenDefaultPurposeResponseItem struct {
	Purpose string `json:"purpose"`
	Label   string `json:"label"`
	Token   string `json:"token"`
}

type sqliteColumnInfo struct {
	Name string `gorm:"column:name"`
	Type string `gorm:"column:type"`
}

type legacyToken struct {
	Id                 int    `gorm:"primaryKey"`
	UserId             int    `gorm:"index"`
	Key                string `gorm:"column:key;type:char(48);uniqueIndex"`
	Status             int    `gorm:"default:1"`
	Name               string `gorm:"index"`
	CreatedTime        int64  `gorm:"bigint"`
	AccessedTime       int64  `gorm:"bigint"`
	ExpiredTime        int64  `gorm:"bigint;default:-1"`
	RemainQuota        int    `gorm:"default:0"`
	UnlimitedQuota     bool
	ModelLimitsEnabled bool
	ModelLimits        string  `gorm:"type:text"`
	AllowIps           *string `gorm:"default:''"`
	UsedQuota          int     `gorm:"default:0"`
	Group              string  `gorm:"column:group;default:''"`
	CrossGroupRetry    bool
	DeletedAt          gorm.DeletedAt `gorm:"index"`
}

func (legacyToken) TableName() string {
	return "tokens"
}

func openTokenControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}
	model.DB = db
	model.LOG_DB = db

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func migrateTokenControllerTestDB(t *testing.T, db *gorm.DB) {
	t.Helper()

	if err := db.AutoMigrate(&model.Token{}, &model.TokenDefault{}); err != nil {
		t.Fatalf("failed to migrate token table: %v", err)
	}
}

func setupTokenControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db := openTokenControllerTestDB(t)
	migrateTokenControllerTestDB(t, db)
	return db
}

func withTokenDefaultPurposeOption(t *testing.T, value string) {
	t.Helper()

	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	nextOptionMap := make(map[string]string, len(originalOptionMap)+1)
	for key, optionValue := range originalOptionMap {
		nextOptionMap[key] = optionValue
	}
	nextOptionMap[model.TokenDefaultKeyPurposesOptionKey] = value
	common.OptionMap = nextOptionMap
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
	})
}

func openTokenControllerExternalDB(t *testing.T, dialect string, dsn string) (*gorm.DB, *bool) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.RedisEnabled = false

	var (
		db     *gorm.DB
		dbType common.DatabaseType
		err    error
	)
	switch dialect {
	case "mysql":
		dbType = common.DatabaseTypeMySQL
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
	case "postgres":
		dbType = common.DatabaseTypePostgreSQL
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	default:
		t.Fatalf("unsupported dialect %q", dialect)
	}
	common.SetDatabaseTypes(dbType, dbType)
	if err != nil {
		t.Fatalf("failed to open %s db: %v", dialect, err)
	}

	model.DB = db
	model.LOG_DB = db

	if db.Migrator().HasTable("tokens") {
		t.Skipf("refusing to run %s migration compatibility test against external database because tokens table already exists", dialect)
	}

	managedTokensTable := new(bool)

	t.Cleanup(func() {
		if *managedTokensTable && db.Migrator().HasTable("tokens") {
			_ = db.Migrator().DropTable("tokens")
		}
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db, managedTokensTable
}

func seedToken(t *testing.T, db *gorm.DB, userID int, name string, rawKey string) *model.Token {
	t.Helper()

	token := &model.Token{
		UserId:         userID,
		Name:           name,
		Key:            rawKey,
		Status:         common.TokenStatusEnabled,
		CreatedTime:    1,
		AccessedTime:   1,
		ExpiredTime:    -1,
		RemainQuota:    100,
		UnlimitedQuota: true,
		Group:          "default",
	}
	if err := db.Create(token).Error; err != nil {
		t.Fatalf("failed to create token: %v", err)
	}
	return token
}

func newAuthenticatedContext(t *testing.T, method string, target string, body any, userID int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	var requestBody *bytes.Reader
	if body != nil {
		payload, err := common.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		requestBody = bytes.NewReader(payload)
	} else {
		requestBody = bytes.NewReader(nil)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, target, requestBody)
	if body != nil {
		ctx.Request.Header.Set("Content-Type", "application/json")
	}
	ctx.Set("id", userID)
	return ctx, recorder
}

func decodeAPIResponse(t *testing.T, recorder *httptest.ResponseRecorder) tokenAPIResponse {
	t.Helper()

	var response tokenAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode api response: %v", err)
	}
	return response
}

func getSQLiteColumnType(t *testing.T, db *gorm.DB, tableName string, columnName string) string {
	t.Helper()

	var columns []sqliteColumnInfo
	if err := db.Raw("PRAGMA table_info(" + tableName + ")").Scan(&columns).Error; err != nil {
		t.Fatalf("failed to inspect %s schema: %v", tableName, err)
	}

	for _, column := range columns {
		if column.Name == columnName {
			return strings.ToLower(column.Type)
		}
	}

	t.Fatalf("column %s not found in %s schema", columnName, tableName)
	return ""
}

func getTokenKeyColumnType(t *testing.T, db *gorm.DB, dialect string) string {
	t.Helper()

	switch dialect {
	case "sqlite":
		return getSQLiteColumnType(t, db, "tokens", "key")
	case "mysql":
		var columnType string
		if err := db.Raw(`SELECT COLUMN_TYPE FROM information_schema.columns
			WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
			"tokens", "key").Scan(&columnType).Error; err != nil {
			t.Fatalf("failed to inspect mysql token key column: %v", err)
		}
		return strings.ToLower(columnType)
	case "postgres":
		var dataType string
		var maxLength sql.NullInt64
		if err := db.Raw(`SELECT data_type, character_maximum_length
			FROM information_schema.columns
			WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
			"tokens", "key").Row().Scan(&dataType, &maxLength); err != nil {
			t.Fatalf("failed to inspect postgres token key column: %v", err)
		}
		switch strings.ToLower(dataType) {
		case "character varying":
			return fmt.Sprintf("varchar(%d)", maxLength.Int64)
		case "character":
			return fmt.Sprintf("char(%d)", maxLength.Int64)
		default:
			if maxLength.Valid {
				return fmt.Sprintf("%s(%d)", strings.ToLower(dataType), maxLength.Int64)
			}
			return strings.ToLower(dataType)
		}
	default:
		t.Fatalf("unsupported dialect %q", dialect)
		return ""
	}
}

func runTokenMigrationCompatibilityTest(t *testing.T, db *gorm.DB, dialect string, managedTokensTable *bool) {
	t.Helper()

	legacyKey := strings.Repeat("a", 48)
	longKey := strings.Repeat("b", 64)

	if err := db.AutoMigrate(&legacyToken{}); err != nil {
		t.Fatalf("failed to create legacy token schema: %v", err)
	}
	if managedTokensTable != nil {
		*managedTokensTable = true
	}
	if err := db.Create(&legacyToken{
		UserId:             7,
		Key:                legacyKey,
		Status:             common.TokenStatusEnabled,
		Name:               "legacy-token",
		CreatedTime:        1,
		AccessedTime:       1,
		ExpiredTime:        -1,
		RemainQuota:        100,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: false,
		ModelLimits:        "",
		AllowIps:           common.GetPointer(""),
		UsedQuota:          0,
		Group:              "default",
		CrossGroupRetry:    false,
	}).Error; err != nil {
		t.Fatalf("failed to seed legacy token row: %v", err)
	}

	if got := getTokenKeyColumnType(t, db, dialect); got != "char(48)" {
		t.Fatalf("expected legacy key column type char(48), got %q", got)
	}

	migrateTokenControllerTestDB(t, db)

	if got := getTokenKeyColumnType(t, db, dialect); got != "varchar(128)" {
		t.Fatalf("expected migrated key column type varchar(128), got %q", got)
	}

	var migratedToken model.Token
	if err := db.First(&migratedToken, "name = ?", "legacy-token").Error; err != nil {
		t.Fatalf("failed to load migrated token row: %v", err)
	}
	if migratedToken.Key != legacyKey {
		t.Fatalf("expected migrated token key %q, got %q", legacyKey, migratedToken.Key)
	}
	if migratedToken.Name != "legacy-token" {
		t.Fatalf("expected migrated token name to be preserved, got %q", migratedToken.Name)
	}

	inserted := model.Token{
		UserId:             8,
		Name:               "long-token",
		Key:                longKey,
		Status:             common.TokenStatusEnabled,
		CreatedTime:        1,
		AccessedTime:       1,
		ExpiredTime:        -1,
		RemainQuota:        200,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: false,
		ModelLimits:        "",
		AllowIps:           common.GetPointer(""),
		UsedQuota:          0,
		Group:              "default",
		CrossGroupRetry:    false,
	}
	if err := db.Create(&inserted).Error; err != nil {
		t.Fatalf("failed to insert long token after migration: %v", err)
	}

	var fetched model.Token
	if err := db.First(&fetched, "id = ?", inserted.Id).Error; err != nil {
		t.Fatalf("failed to fetch long token after migration: %v", err)
	}
	if fetched.Key != longKey {
		t.Fatalf("expected long token key %q, got %q", longKey, fetched.Key)
	}
}

func TestTokenAutoMigrateUsesVarchar128KeyColumn(t *testing.T) {
	db := setupTokenControllerTestDB(t)

	if got := getTokenKeyColumnType(t, db, "sqlite"); got != "varchar(128)" {
		t.Fatalf("expected key column type varchar(128), got %q", got)
	}
}

func TestTokenMigrationFromChar48ToVarchar128(t *testing.T) {
	db := openTokenControllerTestDB(t)
	runTokenMigrationCompatibilityTest(t, db, "sqlite", nil)
}

func TestTokenMigrationFromChar48ToVarchar128MySQL(t *testing.T) {
	dsn := os.Getenv("TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set TEST_MYSQL_DSN to run mysql migration compatibility test")
	}

	db, managedTokensTable := openTokenControllerExternalDB(t, "mysql", dsn)
	runTokenMigrationCompatibilityTest(t, db, "mysql", managedTokensTable)
}

func TestTokenMigrationFromChar48ToVarchar128Postgres(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("set TEST_POSTGRES_DSN to run postgres migration compatibility test")
	}

	db, managedTokensTable := openTokenControllerExternalDB(t, "postgres", dsn)
	runTokenMigrationCompatibilityTest(t, db, "postgres", managedTokensTable)
}

func TestGetAllTokensMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "list-token", "abcd1234efgh5678")
	seedToken(t, db, 2, "other-user-token", "zzzz1234yyyy5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/?p=1&size=10", nil, 1)
	GetAllTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode token page response: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected exactly one token, got %d", len(page.Items))
	}
	if page.Items[0].Key != token.GetMaskedKey() {
		t.Fatalf("expected masked key %q, got %q", token.GetMaskedKey(), page.Items[0].Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("list response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestGetAllTokensWorksBeforeTokenDefaultMigration(t *testing.T) {
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	token := seedToken(t, db, 1, "list-token", "missingdefaults1234")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/?p=1&size=10", nil, 1)
	GetAllTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var page tokenPageResponse
	require.NoError(t, common.Unmarshal(response.Data, &page))
	require.Len(t, page.Items, 1)
	assert.Equal(t, token.GetMaskedKey(), page.Items[0].Key)
	assert.NotContains(t, recorder.Body.String(), `"default_purposes":null`)
}

func TestSearchTokensMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "searchable-token", "ijkl1234mnop5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/search?keyword=searchable-token&p=1&size=10", nil, 1)
	SearchTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode search response: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected exactly one search result, got %d", len(page.Items))
	}
	if page.Items[0].Key != token.GetMaskedKey() {
		t.Fatalf("expected masked search key %q, got %q", token.GetMaskedKey(), page.Items[0].Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("search response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestGetTokenMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "detail-token", "qrst1234uvwx5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/"+strconv.Itoa(token.Id), nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetToken(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var detail tokenResponseItem
	if err := common.Unmarshal(response.Data, &detail); err != nil {
		t.Fatalf("failed to decode token detail response: %v", err)
	}
	if detail.Key != token.GetMaskedKey() {
		t.Fatalf("expected masked detail key %q, got %q", token.GetMaskedKey(), detail.Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("detail response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestUpdateTokenMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "editable-token", "yzab1234cdef5678")

	body := map[string]any{
		"id":                   token.Id,
		"name":                 "updated-token",
		"expired_time":         -1,
		"remain_quota":         100,
		"unlimited_quota":      true,
		"model_limits_enabled": false,
		"model_limits":         "",
		"group":                "default",
		"cross_group_retry":    false,
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", body, 1)
	UpdateToken(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var detail tokenResponseItem
	if err := common.Unmarshal(response.Data, &detail); err != nil {
		t.Fatalf("failed to decode token update response: %v", err)
	}
	if detail.Key != token.GetMaskedKey() {
		t.Fatalf("expected masked update key %q, got %q", token.GetMaskedKey(), detail.Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("update response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestGetTokenKeyRequiresOwnershipAndReturnsFullKey(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "owned-token", "owner1234token5678")

	authorizedCtx, authorizedRecorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/"+strconv.Itoa(token.Id)+"/key", nil, 1)
	authorizedCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetTokenKey(authorizedCtx)

	authorizedResponse := decodeAPIResponse(t, authorizedRecorder)
	if !authorizedResponse.Success {
		t.Fatalf("expected authorized key fetch to succeed, got message: %s", authorizedResponse.Message)
	}

	var keyData tokenKeyResponse
	if err := common.Unmarshal(authorizedResponse.Data, &keyData); err != nil {
		t.Fatalf("failed to decode token key response: %v", err)
	}
	if keyData.Key != token.GetFullKey() {
		t.Fatalf("expected full key %q, got %q", token.GetFullKey(), keyData.Key)
	}

	unauthorizedCtx, unauthorizedRecorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/"+strconv.Itoa(token.Id)+"/key", nil, 2)
	unauthorizedCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetTokenKey(unauthorizedCtx)

	unauthorizedResponse := decodeAPIResponse(t, unauthorizedRecorder)
	if unauthorizedResponse.Success {
		t.Fatalf("expected unauthorized key fetch to fail")
	}
	if strings.Contains(unauthorizedRecorder.Body.String(), token.Key) {
		t.Fatalf("unauthorized key response leaked raw token key: %s", unauthorizedRecorder.Body.String())
	}
}

func TestSetDefaultChatTokenMarksOnlySelectedToken(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	firstToken := seedToken(t, db, 1, "first-token", "first1234token5678")
	secondToken := seedToken(t, db, 1, "second-token", "second1234token5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(secondToken.Id)+"/default_chat", nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(secondToken.Id)}}

	SetDefaultChatToken(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success)

	var responseToken tokenResponseItem
	require.NoError(t, common.Unmarshal(response.Data, &responseToken))
	assert.Equal(t, secondToken.Id, responseToken.ID)
	assert.True(t, responseToken.DefaultChat)

	var tokens []model.Token
	require.NoError(t, db.Order("id asc").Find(&tokens).Error)
	require.Len(t, tokens, 2)
	assert.False(t, tokens[0].DefaultChat)
	assert.True(t, tokens[1].DefaultChat)

	ctx, recorder = newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(firstToken.Id)+"/default_chat", nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(firstToken.Id)}}

	SetDefaultChatToken(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	response = decodeAPIResponse(t, recorder)
	require.True(t, response.Success)

	require.NoError(t, db.Order("id asc").Find(&tokens).Error)
	require.Len(t, tokens, 2)
	assert.True(t, tokens[0].DefaultChat)
	assert.False(t, tokens[1].DefaultChat)
}

func TestSetDefaultChatTokenRejectsDisabledToken(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "disabled-token", "disabled1234token5678")
	require.NoError(t, db.Model(token).Update("status", common.TokenStatusDisabled).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(token.Id)+"/default_chat", nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}

	SetDefaultChatToken(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeAPIResponse(t, recorder)
	assert.False(t, response.Success)

	var persisted model.Token
	require.NoError(t, db.First(&persisted, token.Id).Error)
	assert.False(t, persisted.DefaultChat)
}

func TestSetDefaultTokenSupportsSeparatePurposes(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	chatToken := seedToken(t, db, 1, "chat-token", "chat1234token5678")
	imageToken := seedToken(t, db, 1, "image-token", "image1234token5678")

	chatCtx, chatRecorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(chatToken.Id)+"/default/chat", nil, 1)
	chatCtx.Params = gin.Params{
		{Key: "id", Value: strconv.Itoa(chatToken.Id)},
		{Key: "purpose", Value: "chat"},
	}
	SetDefaultToken(chatCtx)

	require.Equal(t, http.StatusOK, chatRecorder.Code)
	chatResponse := decodeAPIResponse(t, chatRecorder)
	require.True(t, chatResponse.Success)

	imageCtx, imageRecorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(imageToken.Id)+"/default/image", nil, 1)
	imageCtx.Params = gin.Params{
		{Key: "id", Value: strconv.Itoa(imageToken.Id)},
		{Key: "purpose", Value: "image"},
	}
	SetDefaultToken(imageCtx)

	require.Equal(t, http.StatusOK, imageRecorder.Code)
	imageResponse := decodeAPIResponse(t, imageRecorder)
	require.True(t, imageResponse.Success)

	defaultChat, err := model.GetDefaultToken(1, model.TokenDefaultPurposeChat)
	require.NoError(t, err)
	assert.Equal(t, chatToken.Id, defaultChat.Id)

	defaultImage, err := model.GetDefaultToken(1, model.TokenDefaultPurposeImage)
	require.NoError(t, err)
	assert.Equal(t, imageToken.Id, defaultImage.Id)

	defaultChatCtx, defaultChatRecorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/default_key/chat", nil, 1)
	defaultChatCtx.Params = gin.Params{{Key: "purpose", Value: "chat"}}
	GetDefaultTokenKey(defaultChatCtx)

	require.Equal(t, http.StatusOK, defaultChatRecorder.Code)
	defaultChatResponse := decodeAPIResponse(t, defaultChatRecorder)
	require.True(t, defaultChatResponse.Success)
	var defaultChatKey tokenKeyResponse
	require.NoError(t, common.Unmarshal(defaultChatResponse.Data, &defaultChatKey))
	assert.Equal(t, chatToken.Key, defaultChatKey.Key)

	defaultImageCtx, defaultImageRecorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/default_key/image", nil, 1)
	defaultImageCtx.Params = gin.Params{{Key: "purpose", Value: "image"}}
	GetDefaultTokenKey(defaultImageCtx)

	require.Equal(t, http.StatusOK, defaultImageRecorder.Code)
	defaultImageResponse := decodeAPIResponse(t, defaultImageRecorder)
	require.True(t, defaultImageResponse.Success)
	var defaultImageKey tokenKeyResponse
	require.NoError(t, common.Unmarshal(defaultImageResponse.Data, &defaultImageKey))
	assert.Equal(t, imageToken.Key, defaultImageKey.Key)

	var chatPersisted model.Token
	require.NoError(t, db.First(&chatPersisted, chatToken.Id).Error)
	assert.True(t, chatPersisted.DefaultChat)

	var imagePersisted model.Token
	require.NoError(t, db.First(&imagePersisted, imageToken.Id).Error)
	assert.False(t, imagePersisted.DefaultChat)
}

func TestSetDefaultTokenSupportsConfiguredPurposes(t *testing.T) {
	withTokenDefaultPurposeOption(t, `[{"purpose":"chat","label":"Chat","token":"chatKey"},{"purpose":"rerank","label":"Rerank","token":"rerankKey"}]`)
	db := setupTokenControllerTestDB(t)
	rerankToken := seedToken(t, db, 1, "rerank-token", "rerank1234token5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/"+strconv.Itoa(rerankToken.Id)+"/default/rerank", nil, 1)
	ctx.Params = gin.Params{
		{Key: "id", Value: strconv.Itoa(rerankToken.Id)},
		{Key: "purpose", Value: "rerank"},
	}
	SetDefaultToken(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	defaultRerankCtx, defaultRerankRecorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/default_key/rerank", nil, 1)
	defaultRerankCtx.Params = gin.Params{{Key: "purpose", Value: "rerank"}}
	GetDefaultTokenKey(defaultRerankCtx)

	require.Equal(t, http.StatusOK, defaultRerankRecorder.Code)
	defaultRerankResponse := decodeAPIResponse(t, defaultRerankRecorder)
	require.True(t, defaultRerankResponse.Success, defaultRerankResponse.Message)
	var defaultRerankKey tokenKeyResponse
	require.NoError(t, common.Unmarshal(defaultRerankResponse.Data, &defaultRerankKey))
	assert.Equal(t, rerankToken.Key, defaultRerankKey.Key)
}

func TestGetDefaultTokenKeyPurposesUsesConfiguredPurposes(t *testing.T) {
	withTokenDefaultPurposeOption(t, `[{"purpose":"chat","label":"Chat","token":"chatKey"},{"purpose":"rerank","label":"Rerank","token":"rerankKey"}]`)
	openTokenControllerTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/default_key_purposes", nil, 1)
	GetDefaultTokenKeyPurposes(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var purposes []tokenDefaultPurposeResponseItem
	require.NoError(t, common.Unmarshal(response.Data, &purposes))
	require.Len(t, purposes, 2)
	assert.Equal(t, tokenDefaultPurposeResponseItem{Purpose: "rerank", Label: "Rerank", Token: "rerankKey"}, purposes[1])
}

func TestUpdateTokenDefaultKeyPurposesValidatesBeforePersisting(t *testing.T) {
	validPurposes := `[{"purpose":"chat","label":"Chat","token":"chatKey"}]`
	withTokenDefaultPurposeOption(t, validPurposes)
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Option{}))

	err := model.UpdateOption(model.TokenDefaultKeyPurposesOptionKey, `[{"purpose":"image","label":"Image","token":"imageKey"}]`)
	require.Error(t, err)

	var persisted model.Option
	err = db.Where("key = ?", model.TokenDefaultKeyPurposesOptionKey).First(&persisted).Error
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)

	common.OptionMapRWMutex.RLock()
	optionValue := common.OptionMap[model.TokenDefaultKeyPurposesOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, validPurposes, optionValue)

	err = model.UpdateOption(
		model.TokenDefaultKeyPurposesOptionKey,
		`[{"purpose":" Chat ","label":"","token":""},{"purpose":"Rerank","label":" Rerank ","token":"rerankKey"}]`,
	)
	require.NoError(t, err)

	require.NoError(t, db.Where("key = ?", model.TokenDefaultKeyPurposesOptionKey).First(&persisted).Error)
	assert.JSONEq(t, `[{"purpose":"chat","label":"chat","token":"chatKey"},{"purpose":"rerank","label":"Rerank","token":"rerankKey"}]`, persisted.Value)
}
