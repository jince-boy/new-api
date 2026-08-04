package controller

import (
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
