package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestValidateGroupOptionSetKeepsUserAndServiceCatalogsSeparate(t *testing.T) {
	base := map[string]string{
		"UserGroups":        `{"default":"Default","vip":"VIP"}`,
		"GroupRatio":        `{"codex":1,"claude":2}`,
		"TopupGroupRatio":   `{"default":1,"vip":1.2}`,
		"GroupDescriptions": `{"codex":"Codex","claude":"Claude"}`,
		"UserUsableGroups":  `{"codex":"Codex","claude":"Claude"}`,
		"AutoGroups":        `["codex"]`,
		"GroupGroupRatio":   `{"vip":{"claude":0.8}}`,
		"group_ratio_setting.group_special_usable_group": `{"vip":{"+:claude":"Claude"}}`,
	}
	require.NoError(t, validateGroupOptionSet(base))
	withVirtualAuto := make(map[string]string, len(base))
	for key, value := range base {
		withVirtualAuto[key] = value
	}
	withVirtualAuto["GroupDescriptions"] = `{"codex":"Codex","claude":"Claude","auto":"Automatic"}`
	withVirtualAuto["UserUsableGroups"] = `{"codex":"Codex","claude":"Claude","auto":"Automatic"}`
	withVirtualAuto["group_ratio_setting.group_special_usable_group"] = `{"vip":{"-:auto":""}}`
	require.NoError(t, validateGroupOptionSet(withVirtualAuto))

	tests := []struct {
		name  string
		key   string
		value string
		match string
	}{
		{name: "service group used as top-up group", key: "TopupGroupRatio", value: `{"default":1,"vip":1.2,"codex":1}`, match: "unknown user group"},
		{name: "missing user top-up ratio", key: "TopupGroupRatio", value: `{"default":1}`, match: "missing for user group"},
		{name: "zero top-up ratio", key: "TopupGroupRatio", value: `{"default":1,"vip":0}`, match: "finite positive"},
		{name: "user group used as description group", key: "GroupDescriptions", value: `{"vip":"VIP"}`, match: "unknown service group"},
		{name: "user group made globally selectable", key: "UserUsableGroups", value: `{"vip":"VIP"}`, match: "unknown service group"},
		{name: "user group used as auto service group", key: "AutoGroups", value: `["vip"]`, match: "unknown service group"},
		{name: "service group used as special ratio owner", key: "GroupGroupRatio", value: `{"codex":{"claude":0.8}}`, match: "unknown user group"},
		{name: "user group used as special ratio target", key: "GroupGroupRatio", value: `{"vip":{"vip":0.8}}`, match: "unknown service group"},
		{name: "negative special ratio", key: "GroupGroupRatio", value: `{"vip":{"claude":-0.1}}`, match: "finite non-negative"},
		{name: "service group used as availability owner", key: "group_ratio_setting.group_special_usable_group", value: `{"codex":{"+:claude":"Claude"}}`, match: "unknown user group"},
		{name: "user group used as availability target", key: "group_ratio_setting.group_special_usable_group", value: `{"vip":{"+:vip":"VIP"}}`, match: "unknown service group"},
		{name: "conflicting availability rules", key: "group_ratio_setting.group_special_usable_group", value: `{"vip":{"+:claude":"Claude","-:claude":"Claude"}}`, match: "conflicting service group"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			values := make(map[string]string, len(base))
			for key, value := range base {
				values[key] = value
			}
			values[test.key] = test.value

			err := validateGroupOptionSet(values)
			require.Error(t, err)
			assert.Contains(t, err.Error(), test.match)
		})
	}
}

func TestUpdateOptionsBulkCommitsGroupCatalogAsOneValidatedSet(t *testing.T) {
	originalDB := DB
	originalGroupCol := commonGroupCol
	originalKeyCol := commonKeyCol
	originalTrueVal := commonTrueVal
	originalFalseVal := commonFalseVal
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	originalValues := map[string]string{
		"GroupRatio":        ratio_setting.GroupRatio2JSONString(),
		"UserGroups":        setting.UserGroups2JSONString(),
		"TopupGroupRatio":   common.TopupGroupRatio2JSONString(),
		"GroupDescriptions": setting.GroupDescriptions2JSONString(),
		"UserUsableGroups":  setting.UserUsableGroups2JSONString(),
		"GroupGroupRatio":   ratio_setting.GroupGroupRatio2JSONString(),
		"AutoGroups":        setting.AutoGroups2JsonString(),
		"group_ratio_setting.group_special_usable_group": ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.MarshalJSONString(),
	}
	t.Cleanup(func() {
		for _, key := range []string{
			"GroupRatio",
			"UserGroups",
			"TopupGroupRatio",
			"GroupDescriptions",
			"UserUsableGroups",
			"GroupGroupRatio",
			"AutoGroups",
			"group_ratio_setting.group_special_usable_group",
		} {
			require.NoError(t, updateOptionMap(key, originalValues[key]))
		}
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
		DB = originalDB
		commonGroupCol = originalGroupCol
		commonKeyCol = originalKeyCol
		commonTrueVal = originalTrueVal
		commonFalseVal = originalFalseVal
	})

	db, err := gorm.Open(sqlite.Open("file:group-options-bulk?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	initCol()
	require.NoError(t, DB.AutoMigrate(&Option{}, &User{}, &SubscriptionPlan{}))
	require.NoError(t, DB.Create(&User{Username: "legacy-group-user", Group: "legacy-pro"}).Error)
	require.NoError(t, DB.Create(&SubscriptionPlan{Title: "legacy-plan", UpgradeGroup: "plan-pro"}).Error)
	require.NoError(t, migrateLegacyUserGroups())
	assert.Contains(t, setting.GetUserGroupsCopy(), "legacy-pro")
	assert.Contains(t, setting.GetUserGroupsCopy(), "plan-pro")
	assert.Equal(t, 1.0, common.GetTopupGroupRatio("legacy-pro"))
	assert.Equal(t, 1.0, common.GetTopupGroupRatio("plan-pro"))

	values := map[string]string{
		"UserGroups":        `{"default":"Default","vip":"VIP"}`,
		"GroupRatio":        `{"codex":1,"claude":2}`,
		"TopupGroupRatio":   `{"default":1,"vip":1.2}`,
		"GroupDescriptions": `{"codex":"Codex","claude":"Claude"}`,
		"UserUsableGroups":  `{"codex":"Codex"}`,
		"AutoGroups":        `["codex"]`,
		"GroupGroupRatio":   `{"vip":{"claude":0.8}}`,
		"group_ratio_setting.group_special_usable_group": `{"vip":{"+:claude":"Claude"}}`,
	}
	require.NoError(t, UpdateOptionsBulk(values))

	var stored Option
	require.NoError(t, DB.Where("key = ?", "GroupRatio").First(&stored).Error)
	assert.JSONEq(t, values["GroupRatio"], stored.Value)
	assert.Equal(t, map[string]float64{"codex": 1, "claude": 2}, ratio_setting.GetGroupRatioCopy())
	assert.Equal(t, map[string]string{"default": "Default", "vip": "VIP"}, setting.GetUserGroupsCopy())

	err = UpdateOptionsBulk(map[string]string{
		"GroupRatio":      `{"gemini":3}`,
		"TopupGroupRatio": `{"default":1,"vip":0}`,
	})
	require.Error(t, err)
	require.NoError(t, DB.Where("key = ?", "GroupRatio").First(&stored).Error)
	assert.JSONEq(t, values["GroupRatio"], stored.Value)
	assert.Equal(t, map[string]float64{"codex": 1, "claude": 2}, ratio_setting.GetGroupRatioCopy())
}
