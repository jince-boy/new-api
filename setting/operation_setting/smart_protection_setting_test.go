/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package operation_setting

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeAndValidateSmartProtectionSettingRestoresMissingArrayDefaults(t *testing.T) {
	setting, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{
		BaseURL:         "https://guard.example/v1",
		Model:           "Qwen3Guard-Gen-4B",
		TimeoutSeconds:  15,
		MaxContextChars: 24000,
		MaxConcurrent:   8,
		WarningEmail:    true,
		RetentionDays:   30,
	})

	require.NoError(t, err)
	assert.Equal(t, []string{"Controversial", "Unsafe"}, setting.BlockedSafeties)
	assert.Equal(t, []string{"Jailbreak"}, setting.BlockedCategories)
	assert.Equal(t, []SmartProtectionRule{
		{ID: "rule-1", Safety: "Controversial", MatchMode: "all", Record: true, Block: true},
		{ID: "rule-2", Safety: "Unsafe", MatchMode: "all", Record: true, Block: true},
		{ID: "rule-3", Categories: []string{"Jailbreak"}, MatchMode: "all", Record: true, Block: true},
	}, setting.BlockedRules)
	require.Len(t, setting.EmailRules, 1)
	assert.Equal(t, "blocked", setting.EmailRules[0].Action)
	assert.NotNil(t, setting.ChannelIDs)
}

func TestNormalizeAndValidateSmartProtectionSettingKeepsEmailTemplates(t *testing.T) {
	setting, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{
		WarningEmail: true,
		EmailRules: []SmartProtectionEmailRule{{
			Name: " Illegal requests ", Action: " BLOCKED ", Safety: " Unsafe ",
			Categories: []string{" Non-violent Illegal Acts "}, Subject: " Security warning ", Body: "<p>{{request_id}}</p>",
		}},
	})

	require.NoError(t, err)
	require.Len(t, setting.EmailRules, 1)
	assert.Equal(t, SmartProtectionEmailRule{
		ID: "template-1", Name: "Illegal requests", Action: "blocked", Safety: "Unsafe",
		Categories: []string{"Non-violent Illegal Acts"}, MatchMode: "any", Subject: "Security warning", Body: "<p>{{request_id}}</p>", Enabled: true,
	}, setting.EmailRules[0])
}

func TestNormalizeAndValidateSmartProtectionSettingAllowsEmptyProviderWhileDisabled(t *testing.T) {
	setting, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{})

	require.NoError(t, err)
	assert.Empty(t, setting.BaseURL)
	assert.Empty(t, setting.Model)
	assert.Empty(t, setting.APIKey)
}

func TestNormalizeAndValidateSmartProtectionSettingKeepsExplicitCombinedRules(t *testing.T) {
	setting, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{
		BlockedRules: []SmartProtectionRule{{Safety: " Controversial ", Categories: []string{" Jailbreak "}}},
	})

	require.NoError(t, err)
	assert.Equal(t, []SmartProtectionRule{{ID: "rule-1", Safety: "Controversial", Categories: []string{"Jailbreak"}, MatchMode: "any", Record: true, Block: true}}, setting.BlockedRules)
	assert.Empty(t, setting.BlockedSafeties)
	assert.Empty(t, setting.BlockedCategories)
}

func TestNormalizeAndValidateSmartProtectionSettingDoesNotAddBlockToExplicitActions(t *testing.T) {
	setting, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{
		BlockedRules: []SmartProtectionRule{{
			Safety: "Controversial", Categories: []string{"Jailbreak"}, MatchMode: "any",
			Record: true, SendEmail: true, EmailTemplateID: "template-1",
		}},
		WarningEmail: true,
		EmailRules: []SmartProtectionEmailRule{{
			ID: "template-1", Name: "Warning", Subject: "Warning", Body: "Warning", Enabled: true,
		}},
	})

	require.NoError(t, err)
	require.Len(t, setting.BlockedRules, 1)
	assert.True(t, setting.BlockedRules[0].Record)
	assert.True(t, setting.BlockedRules[0].SendEmail)
	assert.False(t, setting.BlockedRules[0].Block)
}

func TestNormalizeAndValidateSmartProtectionSettingRequiresProviderWhenEnabled(t *testing.T) {
	_, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{Enabled: true})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "URL is required")
}

func TestNormalizeAndValidateSmartProtectionSettingRejectsMissingEmailTemplateReference(t *testing.T) {
	_, err := NormalizeAndValidateSmartProtectionSetting(SmartProtectionSetting{
		BlockedRules: []SmartProtectionRule{{
			ID: "rule-1", Safety: "Unsafe", MatchMode: "all", SendEmail: true,
			EmailTemplateID: "missing", ActionsConfigured: true,
		}},
		EmailRules: []SmartProtectionEmailRule{},
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "email template is invalid")
}

func TestApplySmartProtectionConfigKeepsAPIKeyWhenOtherSettingsAreSaved(t *testing.T) {
	previous := GetSmartProtectionSetting()
	previousRules, err := common.Marshal(previous.BlockedRules)
	require.NoError(t, err)
	previousChannels, err := common.Marshal(previous.ChannelIDs)
	require.NoError(t, err)
	previousEmailRules, err := common.Marshal(previous.EmailRules)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, ApplySmartProtectionConfig(map[string]string{
			"enabled":           strconv.FormatBool(previous.Enabled),
			"base_url":          previous.BaseURL,
			"api_key":           previous.APIKey,
			"model":             previous.Model,
			"timeout_seconds":   strconv.Itoa(previous.TimeoutSeconds),
			"max_context_chars": strconv.Itoa(previous.MaxContextChars),
			"max_concurrent":    strconv.Itoa(previous.MaxConcurrent),
			"blocked_rules":     string(previousRules),
			"channel_ids":       string(previousChannels),
			"email_rules":       string(previousEmailRules),
		}))
	})

	require.NoError(t, ApplySmartProtectionConfig(map[string]string{"api_key": "secret-key"}))
	require.NoError(t, ApplySmartProtectionConfig(map[string]string{"model": "updated-model"}))
	assert.Equal(t, "secret-key", GetSmartProtectionSetting().APIKey)
}
