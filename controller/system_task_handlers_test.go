package controller

import (
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/assert"
)

func TestAsyncTaskPollHandlerUsesConfiguredInterval(t *testing.T) {
	setting := operation_setting.GetMonitorSetting()
	originalInterval := setting.AsyncTaskPollIntervalSeconds
	t.Cleanup(func() {
		setting.AsyncTaskPollIntervalSeconds = originalInterval
	})
	setting.AsyncTaskPollIntervalSeconds = 10

	assert.Equal(t, 10*time.Second, (asyncTaskPollHandler{}).Interval())
}

func TestChannelTestHandlerUsesConfiguredInterval(t *testing.T) {
	setting := operation_setting.GetMonitorSetting()
	originalMode := setting.ChannelTestMode
	originalMinutes := setting.AutoTestChannelMinutes
	t.Cleanup(func() {
		setting.ChannelTestMode = originalMode
		setting.AutoTestChannelMinutes = originalMinutes
	})
	setting.AutoTestChannelMinutes = 1

	assert.Equal(t, 1*time.Minute, (channelTestHandler{}).Interval())
}

func TestChannelSchedulingRecoveryHandlerUsesSchedulingInterval(t *testing.T) {
	original := operation_setting.GetChannelSchedulingSetting()
	t.Cleanup(func() {
		assert.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
			"auto_recovery_interval_seconds": strconv.Itoa(original.AutoRecoveryIntervalSeconds),
		}))
	})
	assert.NoError(t, operation_setting.ApplyChannelSchedulingConfig(map[string]string{
		"auto_recovery_interval_seconds": "17",
	}))

	assert.Equal(t, 17*time.Second, (channelSchedulingRecoveryHandler{}).Interval())
}
