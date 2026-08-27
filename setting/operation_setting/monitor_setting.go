package operation_setting

import (
	"fmt"
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

type MonitorSetting struct {
	AutoTestChannelEnabled       bool    `json:"auto_test_channel_enabled"`
	AutoTestChannelMinutes       float64 `json:"auto_test_channel_minutes"`
	AutoRecoveryIntervalSeconds  int     `json:"auto_recovery_interval_seconds"` // deprecated; use channel scheduling setting
	ChannelTestMode              string  `json:"channel_test_mode"`
	AsyncTaskPollIntervalSeconds int     `json:"async_task_poll_interval_seconds"`
	ChannelTestConcurrency       int     `json:"channel_test_concurrency"`
}

const (
	AsyncTaskPollIntervalOptionKey = "MonitorSetting.AsyncTaskPollIntervalSeconds"
	minAsyncTaskPollInterval       = 5

	ChannelTestModeScheduledAll     = "scheduled_all"
	ChannelTestModeAutoBanOnly      = "auto_ban_only"
	ChannelTestModePassiveRecovery  = "passive_recovery"
	ChannelTestConcurrencyOptionKey = "monitor_setting.channel_test_concurrency"
	AutoRecoveryIntervalOptionKey   = "monitor_setting.auto_recovery_interval_seconds"
	DefaultChannelTestConcurrency   = 1
	MaxChannelTestConcurrency       = 32
	MinAutoRecoveryIntervalSeconds  = 5
	MaxAutoRecoveryIntervalSeconds  = 24 * 60 * 60
)

// 默认配置
var monitorSetting = MonitorSetting{
	AutoTestChannelEnabled:       false,
	AutoTestChannelMinutes:       10,
	AutoRecoveryIntervalSeconds:  60,
	ChannelTestMode:              ChannelTestModeScheduledAll,
	AsyncTaskPollIntervalSeconds: 15,
	ChannelTestConcurrency:       DefaultChannelTestConcurrency,
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("monitor_setting", &monitorSetting)
}

func GetMonitorSetting() *MonitorSetting {
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err == nil && frequency > 0 {
			monitorSetting.AutoTestChannelEnabled = true
			monitorSetting.AutoTestChannelMinutes = float64(frequency)
			monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
		}
	}
	if enabled, ok := os.LookupEnv("CHANNEL_TEST_ENABLED"); ok {
		parsed, err := strconv.ParseBool(enabled)
		if err == nil {
			monitorSetting.AutoTestChannelEnabled = parsed
		}
	}
	switch monitorSetting.ChannelTestMode {
	case ChannelTestModeAutoBanOnly:
	default:
		monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
	}
	if monitorSetting.AsyncTaskPollIntervalSeconds < minAsyncTaskPollInterval {
		monitorSetting.AsyncTaskPollIntervalSeconds = minAsyncTaskPollInterval
	}
	monitorSetting.ChannelTestConcurrency = NormalizeChannelTestConcurrency(monitorSetting.ChannelTestConcurrency)
	return &monitorSetting
}

func ValidateAsyncTaskPollInterval(value string) error {
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < minAsyncTaskPollInterval || seconds%minAsyncTaskPollInterval != 0 {
		return fmt.Errorf("async task poll interval must be a multiple of %d seconds", minAsyncTaskPollInterval)
	}
	return nil
}

func NormalizeChannelTestConcurrency(concurrency int) int {
	if concurrency < 1 {
		return DefaultChannelTestConcurrency
	}
	if concurrency > MaxChannelTestConcurrency {
		return MaxChannelTestConcurrency
	}
	return concurrency
}

func ValidateChannelTestConcurrency(value string) error {
	concurrency, err := strconv.Atoi(value)
	if err != nil || concurrency < 1 || concurrency > MaxChannelTestConcurrency {
		return fmt.Errorf("channel test concurrency must be between 1 and %d", MaxChannelTestConcurrency)
	}
	return nil
}

// ValidateAutoRecoveryInterval is retained for compatibility with older
// monitor-setting clients; intelligent scheduling now owns this setting.
func ValidateAutoRecoveryInterval(value string) error {
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < MinAutoRecoveryIntervalSeconds || seconds > MaxAutoRecoveryIntervalSeconds {
		return fmt.Errorf("automatic recovery interval must be between %d and %d seconds", MinAutoRecoveryIntervalSeconds, MaxAutoRecoveryIntervalSeconds)
	}
	return nil
}
