package operation_setting

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	SmartProtectionMaxTimeout              = 60
	SmartProtectionMinContext              = 1000
	SmartProtectionMaxContext              = 24000
	SmartProtectionMaxConcurrent           = 32
	SmartProtectionMaxAPIKeys              = 100
	SmartProtectionMaxEmailCooldownMinutes = 7 * 24 * 60
)

type SmartProtectionSetting struct {
	Enabled              bool                       `json:"enabled"`
	BaseURL              string                     `json:"base_url"`
	APIKey               string                     `json:"api_key"`
	APIKeys              []string                   `json:"api_keys"`
	Model                string                     `json:"model"`
	TimeoutSeconds       int                        `json:"timeout_seconds"`
	MaxContextChars      int                        `json:"max_context_chars"`
	MaxConcurrent        int                        `json:"max_concurrent"`
	BlockedSafeties      []string                   `json:"blocked_safeties"`
	BlockedCategories    []string                   `json:"blocked_categories"`
	BlockedRules         []SmartProtectionRule      `json:"blocked_rules"`
	ChannelIDs           []int                      `json:"channel_ids"`
	SaveContent          bool                       `json:"save_content"`
	WarningEmail         bool                       `json:"warning_email"`
	EmailCooldownMinutes int                        `json:"email_cooldown_minutes"`
	EmailRules           []SmartProtectionEmailRule `json:"email_rules"`
	RetentionDays        int                        `json:"retention_days"`
}

// SmartProtectionRule matches a single guard decision. When Safety is set it
// is the severity gate; MatchMode selects OR ("any") or AND ("all") among
// the selected Categories. Category-only rules support both modes as well.
type SmartProtectionRule struct {
	ID                string   `json:"id,omitempty"`
	Name              string   `json:"name"`
	Safety            string   `json:"safety"`
	Categories        []string `json:"categories"`
	MatchMode         string   `json:"match_mode"`
	SendEmail         bool     `json:"send_email"`
	Record            bool     `json:"record"`
	Block             bool     `json:"block"`
	EmailTemplateID   string   `json:"email_template_id,omitempty"`
	ActionsConfigured bool     `json:"actions_configured,omitempty"`
}

// SmartProtectionEmailRule selects the first event that should send an email.
// Action may be "blocked", "observed", or empty for either action.
type SmartProtectionEmailRule struct {
	ID         string   `json:"id,omitempty"`
	Name       string   `json:"name"`
	Action     string   `json:"action"`
	Safety     string   `json:"safety"`
	Categories []string `json:"categories"`
	MatchMode  string   `json:"match_mode"`
	Subject    string   `json:"subject"`
	Body       string   `json:"body"`
	Enabled    bool     `json:"enabled"`
}

const (
	SmartProtectionDefaultEmailSubject = "【安全警告】请求已被智能保护机制拦截"
	SmartProtectionDefaultEmailBody    = "<h2>安全警告</h2><p><strong>当前请求已被智能保护机制拦截。</strong></p><p>如后续管理员确认本次请求确实包含越狱、破限或其他绕过安全限制的操作，对应的账号将直接冻结。</p><p>请勿继续尝试绕过平台安全策略。</p><hr><p>Safety: {{safety}}</p><p>Categories: {{categories}}</p><p>Request ID: {{request_id}}</p>"
)

var smartProtectionSetting = SmartProtectionSetting{
	TimeoutSeconds:       15,
	MaxContextChars:      24000,
	MaxConcurrent:        8,
	BlockedSafeties:      []string{"Controversial", "Unsafe"},
	BlockedCategories:    []string{"Jailbreak"},
	SaveContent:          true,
	WarningEmail:         true,
	EmailCooldownMinutes: 30,
	RetentionDays:        30,
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
	setting.BlockedRules = cloneSmartProtectionRules(setting.BlockedRules)
	setting.EmailRules = cloneSmartProtectionEmailRules(setting.EmailRules)
	setting.ChannelIDs = append([]int(nil), setting.ChannelIDs...)
	setting.APIKeys = append([]string(nil), setting.APIKeys...)
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
	if setting.EmailCooldownMinutes <= 0 || setting.EmailCooldownMinutes > SmartProtectionMaxEmailCooldownMinutes {
		setting.EmailCooldownMinutes = 30
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
	if setting.EmailCooldownMinutes <= 0 || setting.EmailCooldownMinutes > SmartProtectionMaxEmailCooldownMinutes {
		return SmartProtectionSetting{}, errors.New("smart protection email cooldown is out of range")
	}
	if len(setting.ChannelIDs) > 10000 {
		return SmartProtectionSetting{}, errors.New("too many smart protection channels")
	}
	if len(setting.BlockedRules) > 100 {
		return SmartProtectionSetting{}, errors.New("too many smart protection rules")
	}
	if len(setting.EmailRules) > 50 {
		return SmartProtectionSetting{}, errors.New("too many smart protection email rules")
	}
	if len(setting.APIKeys) > SmartProtectionMaxAPIKeys {
		return SmartProtectionSetting{}, errors.New("too many smart protection API keys")
	}
	apiKeys := make(map[string]struct{}, len(setting.APIKeys))
	for _, key := range setting.APIKeys {
		if key == "" {
			continue
		}
		if _, exists := apiKeys[key]; exists {
			return SmartProtectionSetting{}, errors.New("smart protection API keys must be unique")
		}
		apiKeys[key] = struct{}{}
	}
	templateIDs := make(map[string]struct{}, len(setting.EmailRules))
	for _, rule := range setting.EmailRules {
		if len([]rune(rule.Name)) > 64 || len([]rune(rule.Subject)) > 255 || len([]rune(rule.Body)) > 20000 {
			return SmartProtectionSetting{}, errors.New("smart protection email template is too long")
		}
		if strings.TrimSpace(rule.Name) == "" || strings.TrimSpace(rule.Subject) == "" || strings.TrimSpace(rule.Body) == "" {
			return SmartProtectionSetting{}, errors.New("smart protection email template name, subject and body are required")
		}
		if _, exists := templateIDs[rule.ID]; exists {
			return SmartProtectionSetting{}, errors.New("smart protection email template IDs must be unique")
		}
		templateIDs[rule.ID] = struct{}{}
	}
	ruleIDs := make(map[string]struct{}, len(setting.BlockedRules))
	for _, rule := range setting.BlockedRules {
		if strings.TrimSpace(rule.Safety) == "" && len(rule.Categories) == 0 {
			return SmartProtectionSetting{}, errors.New("smart protection rules cannot be empty")
		}
		if len(rule.Categories) > 32 {
			return SmartProtectionSetting{}, errors.New("too many categories in smart protection rule")
		}
		if rule.MatchMode != "all" && rule.MatchMode != "any" {
			return SmartProtectionSetting{}, errors.New("smart protection rule match mode is invalid")
		}
		if len([]rune(rule.Name)) > 64 {
			return SmartProtectionSetting{}, errors.New("smart protection rule name is too long")
		}
		if _, exists := ruleIDs[rule.ID]; exists {
			return SmartProtectionSetting{}, errors.New("smart protection rule IDs must be unique")
		}
		ruleIDs[rule.ID] = struct{}{}
		if rule.SendEmail {
			if _, exists := templateIDs[rule.EmailTemplateID]; !exists {
				return SmartProtectionSetting{}, errors.New("smart protection rule email template is invalid")
			}
		}
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
	if _, hasLegacyAPIKey := configMap["api_key"]; hasLegacyAPIKey {
		if _, hasAPIKeys := configMap["api_keys"]; !hasAPIKeys {
			// A legacy single-key update replaces the migrated key list.
			smartProtectionSetting.APIKeys = nil
		}
	}
	return config.UpdateConfigFromMap(&smartProtectionSetting, configMap)
}

func normalizeSmartProtectionSetting(setting SmartProtectionSetting) SmartProtectionSetting {
	setting.BaseURL = strings.TrimRight(strings.TrimSpace(setting.BaseURL), "/")
	setting.Model = strings.TrimSpace(setting.Model)
	setting.APIKey = strings.TrimSpace(setting.APIKey)
	keys := make([]string, 0, len(setting.APIKeys)+1)
	seenKeys := make(map[string]struct{}, len(setting.APIKeys)+1)
	for _, key := range setting.APIKeys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := seenKeys[key]; exists {
			continue
		}
		seenKeys[key] = struct{}{}
		keys = append(keys, key)
	}
	if len(keys) == 0 && setting.APIKey != "" {
		keys = append(keys, setting.APIKey)
	}
	setting.APIKeys = keys
	if len(keys) > 0 {
		setting.APIKey = keys[0]
	}
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
	if setting.EmailCooldownMinutes == 0 {
		setting.EmailCooldownMinutes = 30
	}
	if setting.BlockedRules == nil {
		if setting.BlockedSafeties == nil {
			setting.BlockedSafeties = []string{"Controversial", "Unsafe"}
		}
		if setting.BlockedCategories == nil {
			setting.BlockedCategories = []string{"Jailbreak"}
		}
		setting.BlockedRules = legacySmartProtectionRules(setting.BlockedSafeties, setting.BlockedCategories)
	} else {
		if setting.BlockedSafeties == nil {
			setting.BlockedSafeties = []string{}
		}
		if setting.BlockedCategories == nil {
			setting.BlockedCategories = []string{}
		}
	}
	if setting.ChannelIDs == nil {
		setting.ChannelIDs = []int{}
	}
	if setting.EmailRules == nil {
		if setting.WarningEmail {
			setting.EmailRules = []SmartProtectionEmailRule{{
				ID: "template-1", Enabled: true,
				Name: "Blocked requests", Action: "blocked",
				MatchMode: "any",
				Subject:   SmartProtectionDefaultEmailSubject, Body: SmartProtectionDefaultEmailBody,
			}}
		} else {
			setting.EmailRules = []SmartProtectionEmailRule{}
		}
	}
	for index := range setting.BlockedSafeties {
		setting.BlockedSafeties[index] = strings.TrimSpace(setting.BlockedSafeties[index])
	}
	for index := range setting.BlockedCategories {
		setting.BlockedCategories[index] = strings.TrimSpace(setting.BlockedCategories[index])
	}
	for index := range setting.BlockedRules {
		if setting.BlockedRules[index].ID == "" {
			setting.BlockedRules[index].ID = "rule-" + strconv.Itoa(index+1)
		}
		setting.BlockedRules[index].Name = strings.TrimSpace(setting.BlockedRules[index].Name)
		setting.BlockedRules[index].EmailTemplateID = strings.TrimSpace(setting.BlockedRules[index].EmailTemplateID)
		if !setting.BlockedRules[index].ActionsConfigured &&
			!setting.BlockedRules[index].Record &&
			!setting.BlockedRules[index].SendEmail &&
			!setting.BlockedRules[index].Block {
			setting.BlockedRules[index].Record = true
			setting.BlockedRules[index].Block = true
		}
		setting.BlockedRules[index].Safety = strings.TrimSpace(setting.BlockedRules[index].Safety)
		setting.BlockedRules[index].MatchMode = strings.ToLower(strings.TrimSpace(setting.BlockedRules[index].MatchMode))
		if setting.BlockedRules[index].MatchMode == "" {
			setting.BlockedRules[index].MatchMode = "any"
		}
		for categoryIndex := range setting.BlockedRules[index].Categories {
			setting.BlockedRules[index].Categories[categoryIndex] = strings.TrimSpace(setting.BlockedRules[index].Categories[categoryIndex])
		}
	}
	for index := range setting.EmailRules {
		if setting.EmailRules[index].ID == "" {
			setting.EmailRules[index].ID = "template-" + strconv.Itoa(index+1)
			setting.EmailRules[index].Enabled = true
		}
		setting.EmailRules[index].Name = strings.TrimSpace(setting.EmailRules[index].Name)
		setting.EmailRules[index].Action = strings.ToLower(strings.TrimSpace(setting.EmailRules[index].Action))
		setting.EmailRules[index].Safety = strings.TrimSpace(setting.EmailRules[index].Safety)
		setting.EmailRules[index].MatchMode = strings.ToLower(strings.TrimSpace(setting.EmailRules[index].MatchMode))
		if setting.EmailRules[index].MatchMode == "" {
			setting.EmailRules[index].MatchMode = "any"
		}
		setting.EmailRules[index].Subject = strings.TrimSpace(setting.EmailRules[index].Subject)
		setting.EmailRules[index].Body = strings.TrimSpace(setting.EmailRules[index].Body)
		for categoryIndex := range setting.EmailRules[index].Categories {
			setting.EmailRules[index].Categories[categoryIndex] = strings.TrimSpace(setting.EmailRules[index].Categories[categoryIndex])
		}
	}
	return setting
}

func legacySmartProtectionRules(safeties, categories []string) []SmartProtectionRule {
	rules := make([]SmartProtectionRule, 0, len(safeties)+len(categories))
	for _, safety := range safeties {
		if strings.TrimSpace(safety) != "" {
			rules = append(rules, SmartProtectionRule{Safety: strings.TrimSpace(safety), MatchMode: "all"})
		}
	}
	for _, category := range categories {
		if strings.TrimSpace(category) != "" {
			rules = append(rules, SmartProtectionRule{Categories: []string{strings.TrimSpace(category)}, MatchMode: "all"})
		}
	}
	return rules
}

func cloneSmartProtectionRules(rules []SmartProtectionRule) []SmartProtectionRule {
	cloned := make([]SmartProtectionRule, len(rules))
	for index, rule := range rules {
		cloned[index] = rule
		cloned[index].Categories = append([]string(nil), rule.Categories...)
	}
	return cloned
}

func cloneSmartProtectionEmailRules(rules []SmartProtectionEmailRule) []SmartProtectionEmailRule {
	cloned := make([]SmartProtectionEmailRule, len(rules))
	for index, rule := range rules {
		cloned[index] = rule
		cloned[index].Categories = append([]string(nil), rule.Categories...)
	}
	return cloned
}
