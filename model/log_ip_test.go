package model

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRecordConsumeLogAlwaysRecordsClientIP(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:record-consume-log-ip?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))

	originalLogDB := LOG_DB
	originalLogConsumeEnabled := common.LogConsumeEnabled
	LOG_DB = db
	common.LogConsumeEnabled = true
	t.Cleanup(func() {
		LOG_DB = originalLogDB
		common.LogConsumeEnabled = originalLogConsumeEnabled
	})

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Request.RemoteAddr = "203.0.113.7:12345"
	c.Set("username", "ip-test-user")

	RecordConsumeLog(c, 42, RecordConsumeLogParams{
		ModelName: "gpt-test",
		Quota:     10,
	})

	var log Log
	require.NoError(t, db.First(&log).Error)
	assert.Equal(t, "203.0.113.7", log.Ip)
}
