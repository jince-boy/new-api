package model

import (
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var groupCatalogOptionKeys = map[string]struct{}{
	"UserGroups":        {},
	"GroupRatio":        {},
	"TopupGroupRatio":   {},
	"GroupDescriptions": {},
	"UserUsableGroups":  {},
	"AutoGroups":        {},
	"GroupGroupRatio":   {},
	"group_ratio_setting.group_special_usable_group": {},
}

func isGroupCatalogOptionKey(key string) bool {
	_, ok := groupCatalogOptionKeys[key]
	return ok
}

func migrateLegacyUserGroups() error {
	groups := setting.GetUserGroupsCopy()

	topupRatios := make(map[string]float64)
	if err := common.UnmarshalJsonStr(common.TopupGroupRatio2JSONString(), &topupRatios); err != nil {
		return err
	}
	for group := range topupRatios {
		if _, ok := groups[group]; !ok {
			groups[group] = group
		}
	}

	if DB.Migrator().HasTable(&User{}) {
		var userGroupNames []string
		if err := DB.Model(&User{}).Distinct(commonGroupCol).Pluck(commonGroupCol, &userGroupNames).Error; err != nil {
			return err
		}
		for _, group := range userGroupNames {
			group = strings.TrimSpace(group)
			if group != "" {
				if _, ok := groups[group]; !ok {
					groups[group] = group
				}
			}
		}
	}

	if DB.Migrator().HasTable(&SubscriptionPlan{}) {
		var planGroups []struct {
			UpgradeGroup   string
			DowngradeGroup string
		}
		if err := DB.Model(&SubscriptionPlan{}).Select("upgrade_group", "downgrade_group").Find(&planGroups).Error; err != nil {
			return err
		}
		for _, plan := range planGroups {
			for _, group := range []string{plan.UpgradeGroup, plan.DowngradeGroup} {
				group = strings.TrimSpace(group)
				if group != "" {
					if _, ok := groups[group]; !ok {
						groups[group] = group
					}
				}
			}
		}
	}

	groupsJSON, err := common.Marshal(groups)
	if err != nil {
		return err
	}
	if err := updateOptionMap("UserGroups", string(groupsJSON)); err != nil {
		return err
	}

	for group := range groups {
		if _, ok := topupRatios[group]; !ok {
			topupRatios[group] = 1
		}
	}
	topupJSON, err := common.Marshal(topupRatios)
	if err != nil {
		return err
	}
	return updateOptionMap("TopupGroupRatio", string(topupJSON))
}

func validateGroupOptionSet(overrides map[string]string) error {
	values := map[string]string{
		"UserGroups":        setting.UserGroups2JSONString(),
		"GroupRatio":        ratio_setting.GroupRatio2JSONString(),
		"TopupGroupRatio":   common.TopupGroupRatio2JSONString(),
		"GroupDescriptions": setting.GroupDescriptions2JSONString(),
		"UserUsableGroups":  setting.UserUsableGroups2JSONString(),
		"AutoGroups":        setting.AutoGroups2JsonString(),
		"GroupGroupRatio":   ratio_setting.GroupGroupRatio2JSONString(),
		"group_ratio_setting.group_special_usable_group": ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.MarshalJSONString(),
	}
	for key, value := range overrides {
		if isGroupCatalogOptionKey(key) {
			values[key] = value
		}
	}

	if err := setting.ValidateUserGroupsJSONString(values["UserGroups"]); err != nil {
		return err
	}
	if err := ratio_setting.CheckGroupRatio(values["GroupRatio"]); err != nil {
		return err
	}

	userGroups := make(map[string]string)
	if err := common.UnmarshalJsonStr(values["UserGroups"], &userGroups); err != nil {
		return err
	}
	serviceGroups := make(map[string]float64)
	if err := common.UnmarshalJsonStr(values["GroupRatio"], &serviceGroups); err != nil {
		return err
	}

	topupRatios := make(map[string]float64)
	if err := common.UnmarshalJsonStr(values["TopupGroupRatio"], &topupRatios); err != nil {
		return err
	}
	for userGroup := range userGroups {
		if _, ok := topupRatios[userGroup]; !ok {
			return fmt.Errorf("top-up ratio is missing for user group: %s", userGroup)
		}
	}
	for userGroup, ratio := range topupRatios {
		if _, ok := userGroups[userGroup]; !ok {
			return fmt.Errorf("top-up ratio references unknown user group: %s", userGroup)
		}
		if ratio <= 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
			return fmt.Errorf("top-up ratio must be a finite positive number: %s", userGroup)
		}
	}

	for _, key := range []string{"GroupDescriptions", "UserUsableGroups"} {
		groups := make(map[string]string)
		if err := common.UnmarshalJsonStr(values[key], &groups); err != nil {
			return err
		}
		for serviceGroup := range groups {
			if serviceGroup == "auto" {
				continue
			}
			if _, ok := serviceGroups[serviceGroup]; !ok {
				return fmt.Errorf("%s references unknown service group: %s", key, serviceGroup)
			}
		}
	}

	autoGroups := make([]string, 0)
	if err := common.UnmarshalJsonStr(values["AutoGroups"], &autoGroups); err != nil {
		return err
	}
	seenAutoGroups := make(map[string]struct{}, len(autoGroups))
	for _, serviceGroup := range autoGroups {
		if _, ok := serviceGroups[serviceGroup]; !ok || serviceGroup == "auto" {
			return fmt.Errorf("auto groups reference unknown service group: %s", serviceGroup)
		}
		if _, ok := seenAutoGroups[serviceGroup]; ok {
			return fmt.Errorf("auto groups contain duplicate service group: %s", serviceGroup)
		}
		seenAutoGroups[serviceGroup] = struct{}{}
	}

	if err := ratio_setting.CheckGroupGroupRatio(values["GroupGroupRatio"]); err != nil {
		return err
	}
	specialRatios := make(map[string]map[string]float64)
	if err := common.UnmarshalJsonStr(values["GroupGroupRatio"], &specialRatios); err != nil {
		return err
	}
	for userGroup, ratios := range specialRatios {
		if _, ok := userGroups[userGroup]; !ok {
			return fmt.Errorf("special ratio references unknown user group: %s", userGroup)
		}
		for serviceGroup := range ratios {
			if _, ok := serviceGroups[serviceGroup]; !ok || serviceGroup == "auto" {
				return fmt.Errorf("special ratio references unknown service group: %s", serviceGroup)
			}
		}
	}

	availabilityRules := make(map[string]map[string]string)
	if err := common.UnmarshalJsonStr(values["group_ratio_setting.group_special_usable_group"], &availabilityRules); err != nil {
		return err
	}
	for userGroup, rules := range availabilityRules {
		if _, ok := userGroups[userGroup]; !ok {
			return fmt.Errorf("special availability rule references unknown user group: %s", userGroup)
		}
		seenServiceGroups := make(map[string]struct{}, len(rules))
		for rawServiceGroup := range rules {
			serviceGroup := strings.TrimPrefix(strings.TrimPrefix(rawServiceGroup, "+:"), "-:")
			if serviceGroup == rawServiceGroup && strings.Contains(serviceGroup, ":") {
				return fmt.Errorf("invalid special availability service group: %s", rawServiceGroup)
			}
			if serviceGroup != "auto" {
				if _, ok := serviceGroups[serviceGroup]; !ok {
					return fmt.Errorf("special availability rule references unknown service group: %s", serviceGroup)
				}
			}
			if _, ok := seenServiceGroups[serviceGroup]; ok {
				return fmt.Errorf("special availability rule contains conflicting service group: %s", serviceGroup)
			}
			seenServiceGroups[serviceGroup] = struct{}{}
		}
	}

	return nil
}
