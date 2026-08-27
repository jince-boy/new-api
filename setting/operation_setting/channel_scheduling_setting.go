package operation_setting

import (
	"errors"
	"math"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	ChannelSchedulingStrategyLegacy      = "legacy"
	ChannelSchedulingStrategyIntelligent = "intelligent"
	ChannelSchedulingMaxFactor           = 10.0
	ChannelSchedulingMaxExponent         = 4.0
	ChannelSchedulingMaxInflightPenalty  = 10.0
	ChannelSchedulingMaxWarmupSamples    = 10_000
	ChannelSchedulingMaxSampleWindow     = 1_000
	ChannelSchedulingMaxSampleAgeMinutes = 24 * 60
	ChannelSchedulingMaxSevereTtftMs     = int64(24 * 60 * 60 * 1000)
	ChannelSchedulingMaxFailureThreshold = 100
	ChannelSchedulingMaxFailureWindowSec = 60 * 60
	ChannelSchedulingMinRecoverySec      = 5
	ChannelSchedulingMaxRecoverySec      = 24 * 60 * 60
	ChannelSchedulingDefaultFailureCount = 5
	ChannelSchedulingDefaultFailureSec   = 60
	ChannelSchedulingDefaultRecoverySec  = 60
)

type ChannelSchedulingSetting struct {
	DefaultStrategy             string            `json:"default_strategy"`
	GroupStrategies             map[string]string `json:"group_strategies"`
	MinimumFactor               float64           `json:"minimum_factor"`
	MaximumFactor               float64           `json:"maximum_factor"`
	PerformanceExponent         float64           `json:"performance_exponent"`
	InflightPenalty             float64           `json:"inflight_penalty"`
	WarmupSamples               int               `json:"warmup_samples"`
	SampleWindowSize            int               `json:"sample_window_size"`
	SampleMaxAgeMinutes         int               `json:"sample_max_age_minutes"`
	SevereTtftMs                int64             `json:"severe_ttft_ms"`
	FailureThreshold            int               `json:"failure_threshold"`
	FailureWindowSeconds        int               `json:"failure_window_seconds"`
	AutoRecoveryIntervalSeconds int               `json:"auto_recovery_interval_seconds"`
	MaxAttempts                 int               `json:"max_attempts"`
	RealtimeRetentionMin        int               `json:"realtime_retention_minutes"`
}

var channelSchedulingSetting = ChannelSchedulingSetting{
	DefaultStrategy:             ChannelSchedulingStrategyLegacy,
	GroupStrategies:             map[string]string{},
	MinimumFactor:               0.2,
	MaximumFactor:               1.5,
	PerformanceExponent:         0.5,
	InflightPenalty:             0.25,
	WarmupSamples:               5,
	SampleWindowSize:            20,
	SampleMaxAgeMinutes:         15,
	SevereTtftMs:                60_000,
	FailureThreshold:            ChannelSchedulingDefaultFailureCount,
	FailureWindowSeconds:        ChannelSchedulingDefaultFailureSec,
	AutoRecoveryIntervalSeconds: ChannelSchedulingDefaultRecoverySec,
	MaxAttempts:                 8,
	RealtimeRetentionMin:        60,
}

var channelSchedulingSettingMu sync.RWMutex

func init() {
	config.GlobalConfig.Register("channel_scheduling_setting", &channelSchedulingSetting)
}

func GetChannelSchedulingSetting() ChannelSchedulingSetting {
	channelSchedulingSettingMu.RLock()
	setting := channelSchedulingSetting
	setting.GroupStrategies = cloneGroupStrategies(setting.GroupStrategies)
	channelSchedulingSettingMu.RUnlock()

	setting.DefaultStrategy = normalizeChannelSchedulingStrategy(setting.DefaultStrategy)
	if setting.MinimumFactor <= 0 || setting.MinimumFactor > 1 || math.IsNaN(setting.MinimumFactor) || math.IsInf(setting.MinimumFactor, 0) {
		setting.MinimumFactor = 0.2
	}
	if setting.MaximumFactor < 1 || setting.MaximumFactor < setting.MinimumFactor || setting.MaximumFactor > ChannelSchedulingMaxFactor || math.IsNaN(setting.MaximumFactor) || math.IsInf(setting.MaximumFactor, 0) {
		setting.MaximumFactor = 1.5
	}
	if setting.PerformanceExponent <= 0 || setting.PerformanceExponent > ChannelSchedulingMaxExponent || math.IsNaN(setting.PerformanceExponent) || math.IsInf(setting.PerformanceExponent, 0) {
		setting.PerformanceExponent = 0.5
	}
	if setting.InflightPenalty < 0 || setting.InflightPenalty > ChannelSchedulingMaxInflightPenalty || math.IsNaN(setting.InflightPenalty) || math.IsInf(setting.InflightPenalty, 0) {
		setting.InflightPenalty = 0.25
	}
	if setting.WarmupSamples <= 0 || setting.WarmupSamples > ChannelSchedulingMaxWarmupSamples {
		setting.WarmupSamples = 5
	}
	if setting.SampleWindowSize <= 0 || setting.SampleWindowSize > ChannelSchedulingMaxSampleWindow {
		setting.SampleWindowSize = 20
	}
	if setting.WarmupSamples > setting.SampleWindowSize {
		setting.WarmupSamples = setting.SampleWindowSize
	}
	if setting.SampleMaxAgeMinutes <= 0 || setting.SampleMaxAgeMinutes > ChannelSchedulingMaxSampleAgeMinutes {
		setting.SampleMaxAgeMinutes = 15
	}
	if setting.SevereTtftMs <= 0 || setting.SevereTtftMs > ChannelSchedulingMaxSevereTtftMs {
		setting.SevereTtftMs = 60_000
	}
	if setting.FailureThreshold <= 0 || setting.FailureThreshold > ChannelSchedulingMaxFailureThreshold {
		setting.FailureThreshold = ChannelSchedulingDefaultFailureCount
	}
	if setting.FailureWindowSeconds <= 0 || setting.FailureWindowSeconds > ChannelSchedulingMaxFailureWindowSec {
		setting.FailureWindowSeconds = ChannelSchedulingDefaultFailureSec
	}
	if setting.AutoRecoveryIntervalSeconds < ChannelSchedulingMinRecoverySec || setting.AutoRecoveryIntervalSeconds > ChannelSchedulingMaxRecoverySec {
		setting.AutoRecoveryIntervalSeconds = ChannelSchedulingDefaultRecoverySec
	}
	if setting.MaxAttempts <= 0 {
		setting.MaxAttempts = 8
	}
	if setting.MaxAttempts > 64 {
		setting.MaxAttempts = 64
	}
	if setting.RealtimeRetentionMin <= 0 {
		setting.RealtimeRetentionMin = 60
	}
	if setting.RealtimeRetentionMin > 24*60 {
		setting.RealtimeRetentionMin = 24 * 60
	}
	return setting
}

func NormalizeAndValidateChannelSchedulingSetting(setting ChannelSchedulingSetting) (ChannelSchedulingSetting, error) {
	setting.DefaultStrategy = strings.ToLower(strings.TrimSpace(setting.DefaultStrategy))
	if setting.DefaultStrategy != ChannelSchedulingStrategyLegacy && setting.DefaultStrategy != ChannelSchedulingStrategyIntelligent {
		return ChannelSchedulingSetting{}, errors.New("invalid default strategy")
	}
	// Keep rolling upgrades compatible with older dashboards that do not send
	// the newly added failure-protection fields yet.
	if setting.FailureThreshold == 0 {
		setting.FailureThreshold = ChannelSchedulingDefaultFailureCount
	}
	if setting.FailureWindowSeconds == 0 {
		setting.FailureWindowSeconds = ChannelSchedulingDefaultFailureSec
	}
	if setting.AutoRecoveryIntervalSeconds == 0 {
		setting.AutoRecoveryIntervalSeconds = ChannelSchedulingDefaultRecoverySec
	}

	normalizedGroups := make(map[string]string, len(setting.GroupStrategies))
	for group, strategy := range setting.GroupStrategies {
		group = strings.TrimSpace(group)
		strategy = strings.ToLower(strings.TrimSpace(strategy))
		if group == "" || (strategy != ChannelSchedulingStrategyLegacy && strategy != ChannelSchedulingStrategyIntelligent) {
			return ChannelSchedulingSetting{}, errors.New("invalid group strategy")
		}
		if _, exists := normalizedGroups[group]; exists {
			return ChannelSchedulingSetting{}, errors.New("duplicate group strategy")
		}
		normalizedGroups[group] = strategy
	}
	setting.GroupStrategies = normalizedGroups

	if setting.MinimumFactor <= 0 || setting.MinimumFactor > 1 || math.IsNaN(setting.MinimumFactor) || math.IsInf(setting.MinimumFactor, 0) ||
		setting.MaximumFactor < 1 || setting.MaximumFactor < setting.MinimumFactor || setting.MaximumFactor > ChannelSchedulingMaxFactor || math.IsNaN(setting.MaximumFactor) || math.IsInf(setting.MaximumFactor, 0) ||
		setting.PerformanceExponent <= 0 || setting.PerformanceExponent > ChannelSchedulingMaxExponent || math.IsNaN(setting.PerformanceExponent) || math.IsInf(setting.PerformanceExponent, 0) ||
		setting.InflightPenalty < 0 || setting.InflightPenalty > ChannelSchedulingMaxInflightPenalty || math.IsNaN(setting.InflightPenalty) || math.IsInf(setting.InflightPenalty, 0) ||
		setting.WarmupSamples <= 0 || setting.WarmupSamples > ChannelSchedulingMaxWarmupSamples ||
		setting.SampleWindowSize <= 0 || setting.SampleWindowSize > ChannelSchedulingMaxSampleWindow ||
		setting.WarmupSamples > setting.SampleWindowSize ||
		setting.SampleMaxAgeMinutes <= 0 || setting.SampleMaxAgeMinutes > ChannelSchedulingMaxSampleAgeMinutes ||
		setting.SevereTtftMs <= 0 || setting.SevereTtftMs > ChannelSchedulingMaxSevereTtftMs ||
		setting.FailureThreshold <= 0 || setting.FailureThreshold > ChannelSchedulingMaxFailureThreshold ||
		setting.FailureWindowSeconds <= 0 || setting.FailureWindowSeconds > ChannelSchedulingMaxFailureWindowSec ||
		setting.AutoRecoveryIntervalSeconds < ChannelSchedulingMinRecoverySec || setting.AutoRecoveryIntervalSeconds > ChannelSchedulingMaxRecoverySec ||
		setting.MaxAttempts <= 0 || setting.MaxAttempts > 64 ||
		setting.RealtimeRetentionMin <= 0 || setting.RealtimeRetentionMin > 24*60 {
		return ChannelSchedulingSetting{}, errors.New("invalid scheduling parameters")
	}
	return setting, nil
}

func ApplyChannelSchedulingConfig(configMap map[string]string) error {
	channelSchedulingSettingMu.Lock()
	defer channelSchedulingSettingMu.Unlock()
	return config.UpdateConfigFromMap(&channelSchedulingSetting, configMap)
}

func GetChannelSchedulingStrategy(group string) string {
	setting := GetChannelSchedulingSetting()
	if strategy, ok := setting.GroupStrategies[strings.TrimSpace(group)]; ok {
		return normalizeChannelSchedulingStrategy(strategy)
	}
	return setting.DefaultStrategy
}

func IsIntelligentChannelScheduling(group string) bool {
	return GetChannelSchedulingStrategy(group) == ChannelSchedulingStrategyIntelligent
}

func normalizeChannelSchedulingStrategy(strategy string) string {
	if strings.EqualFold(strings.TrimSpace(strategy), ChannelSchedulingStrategyIntelligent) {
		return ChannelSchedulingStrategyIntelligent
	}
	return ChannelSchedulingStrategyLegacy
}

func cloneGroupStrategies(strategies map[string]string) map[string]string {
	cloned := make(map[string]string, len(strategies))
	for group, strategy := range strategies {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		cloned[group] = normalizeChannelSchedulingStrategy(strategy)
	}
	return cloned
}
