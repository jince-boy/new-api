package operation_setting

import (
	"errors"
	"net/url"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	SmartProtectionMaxTimeout    = 60
	SmartProtectionMinContext    = 1000
	SmartProtectionMaxContext    = 24000
	SmartProtectionMaxConcurrent = 32
)

type SmartProtectionSetting struct {
	Enabled           bool     `json:"enabled"`
	BaseURL           string   `json:"base_url"`
	APIKey            string   `json:"api_key"`
	Model             string   `json:"model"`
	TimeoutSeconds    int      `json:"timeout_seconds"`
	MaxContextChars   int      `json:"max_context_chars"`
	MaxConcurrent     int      `json:"max_concurrent"`
	BlockedSafeties   []string `json:"blocked_safeties"`
	BlockedCategories []string `json:"blocked_categories"`
	ChannelIDs        []int    `json:"channel_ids"`
	SaveContent       bool     `json:"save_content"`
	WarningEmail      bool     `json:"warning_email"`
	RetentionDays     int      `json:"retention_days"`
}

var smartProtectionSetting = SmartProtectionSetting{
	TimeoutSeconds:    15,
	MaxContextChars:   24000,
	MaxConcurrent:     8,
	BlockedSafeties:   []string{"Controversial", "Unsafe"},
	BlockedCategories: []string{"Jailbreak"},
	SaveContent:       true,
	WarningEmail:      true,
	RetentionDays:     30,
}

var smartProtectionSettingMu sync.RWMutex

func init() {
	config.GlobalConfig.Register("smart_protection_setting", &smartProtectionSetting)
}

func GetSmartProtectionSetting() SmartProtectionSetting {
	smartProtectionSettingMu.RLock()
	setting := smartProtectionSetting
	setting.BlockedSafeties = append([]string(nil), setting.BlockedSafeties...)
	setting.BlockedCategories = append([]string(nil), setting.BlockedCategories...)
	setting.ChannelIDs = append([]int(nil), setting.ChannelIDs...)
	smartProtectionSettingMu.RUnlock()
	setting = normalizeSmartProtectionSetting(setting)
	if setting.TimeoutSeconds > SmartProtectionMaxTimeout {
		setting.TimeoutSeconds = 15
	}
	if setting.MaxContextChars < SmartProtectionMinContext || setting.MaxContextChars > SmartProtectionMaxContext {
		setting.MaxContextChars = 24000
	}
	if setting.MaxConcurrent > SmartProtectionMaxConcurrent {
		setting.MaxConcurrent = 8
	}
	if setting.RetentionDays < 0 || setting.RetentionDays > 3650 {
		setting.RetentionDays = 30
	}
	return setting
}

func NormalizeAndValidateSmartProtectionSetting(setting SmartProtectionSetting) (SmartProtectionSetting, error) {
	setting = normalizeSmartProtectionSetting(setting)
	if setting.Enabled && setting.BaseURL == "" {
		return SmartProtectionSetting{}, errors.New("smart protection URL is required")
	}
	if setting.BaseURL != "" {
		parsed, err := url.Parse(setting.BaseURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return SmartProtectionSetting{}, errors.New("smart protection URL must use http or https")
		}
	}
	if setting.Enabled && setting.Model == "" {
		return SmartProtectionSetting{}, errors.New("smart protection model is required")
	}
	if setting.TimeoutSeconds <= 0 || setting.TimeoutSeconds > SmartProtectionMaxTimeout {
		return SmartProtectionSetting{}, errors.New("smart protection timeout is out of range")
	}
	if setting.MaxContextChars < SmartProtectionMinContext || setting.MaxContextChars > SmartProtectionMaxContext {
		return SmartProtectionSetting{}, errors.New("smart protection context limit is out of range")
	}
	if setting.MaxConcurrent <= 0 || setting.MaxConcurrent > SmartProtectionMaxConcurrent {
		return SmartProtectionSetting{}, errors.New("smart protection concurrency is out of range")
	}
	if setting.RetentionDays < 0 || setting.RetentionDays > 3650 {
		return SmartProtectionSetting{}, errors.New("smart protection retention is out of range")
	}
	if len(setting.ChannelIDs) > 10000 {
		return SmartProtectionSetting{}, errors.New("too many smart protection channels")
	}
	channelIDs := make(map[int]struct{}, len(setting.ChannelIDs))
	for _, channelID := range setting.ChannelIDs {
		if channelID <= 0 {
			return SmartProtectionSetting{}, errors.New("smart protection channel IDs must be positive")
		}
		if _, exists := channelIDs[channelID]; exists {
			return SmartProtectionSetting{}, errors.New("smart protection channel IDs must be unique")
		}
		channelIDs[channelID] = struct{}{}
	}
	return setting, nil
}

func ApplySmartProtectionConfig(configMap map[string]string) error {
	smartProtectionSettingMu.Lock()
	defer smartProtectionSettingMu.Unlock()
	return config.UpdateConfigFromMap(&smartProtectionSetting, configMap)
}

func normalizeSmartProtectionSetting(setting SmartProtectionSetting) SmartProtectionSetting {
	setting.BaseURL = strings.TrimRight(strings.TrimSpace(setting.BaseURL), "/")
	setting.Model = strings.TrimSpace(setting.Model)
	if setting.TimeoutSeconds <= 0 {
		setting.TimeoutSeconds = 15
	}
	if setting.MaxContextChars <= 0 {
		setting.MaxContextChars = 24000
	}
	if setting.MaxConcurrent <= 0 {
		setting.MaxConcurrent = 8
	}
	if setting.RetentionDays == 0 {
		setting.RetentionDays = 30
	}
	if setting.BlockedSafeties == nil {
		setting.BlockedSafeties = []string{"Controversial", "Unsafe"}
	}
	if setting.BlockedCategories == nil {
		setting.BlockedCategories = []string{"Jailbreak"}
	}
	if setting.ChannelIDs == nil {
		setting.ChannelIDs = []int{}
	}
	for index := range setting.BlockedSafeties {
		setting.BlockedSafeties[index] = strings.TrimSpace(setting.BlockedSafeties[index])
	}
	for index := range setting.BlockedCategories {
		setting.BlockedCategories[index] = strings.TrimSpace(setting.BlockedCategories[index])
	}
	return setting
}
