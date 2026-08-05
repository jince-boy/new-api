package setting

import (
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var userGroups = map[string]string{
	"default": "Default user group",
	"vip":     "VIP user group",
	"svip":    "SVIP user group",
}
var userGroupsMutex sync.RWMutex

var groupDescriptions = map[string]string{
	"default": "Default service group",
	"vip":     "VIP service group",
	"svip":    "SVIP service group",
}
var groupDescriptionsMutex sync.RWMutex

func GetUserGroupsCopy() map[string]string {
	userGroupsMutex.RLock()
	defer userGroupsMutex.RUnlock()

	groups := make(map[string]string, len(userGroups))
	for name, description := range userGroups {
		groups[name] = description
	}
	return groups
}

func UserGroups2JSONString() string {
	userGroupsMutex.RLock()
	defer userGroupsMutex.RUnlock()

	data, err := common.Marshal(userGroups)
	if err != nil {
		common.SysLog("error marshalling user groups: " + err.Error())
		return "{}"
	}
	return string(data)
}

func UpdateUserGroupsByJSONString(jsonStr string) error {
	if err := ValidateUserGroupsJSONString(jsonStr); err != nil {
		return err
	}
	groups := make(map[string]string)
	if err := common.UnmarshalJsonStr(jsonStr, &groups); err != nil {
		return err
	}

	userGroupsMutex.Lock()
	userGroups = groups
	userGroupsMutex.Unlock()
	return nil
}

func ValidateUserGroupsJSONString(jsonStr string) error {
	groups := make(map[string]string)
	if err := common.UnmarshalJsonStr(jsonStr, &groups); err != nil {
		return err
	}
	if len(groups) == 0 {
		return fmt.Errorf("at least one user group is required")
	}
	if _, ok := groups["default"]; !ok {
		return fmt.Errorf("default user group is required")
	}
	for name := range groups {
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" || trimmedName != name {
			return fmt.Errorf("invalid user group name: %q", name)
		}
		if len(name) > 64 {
			return fmt.Errorf("user group name is too long: %s", name)
		}
	}
	return nil
}

func IsUserGroup(name string) bool {
	userGroupsMutex.RLock()
	defer userGroupsMutex.RUnlock()
	_, ok := userGroups[name]
	return ok
}

func GetGroupDescriptionsCopy() map[string]string {
	groupDescriptionsMutex.RLock()
	defer groupDescriptionsMutex.RUnlock()

	descriptions := make(map[string]string, len(groupDescriptions))
	for name, description := range groupDescriptions {
		descriptions[name] = description
	}
	return descriptions
}

func GroupDescriptions2JSONString() string {
	groupDescriptionsMutex.RLock()
	defer groupDescriptionsMutex.RUnlock()

	data, err := common.Marshal(groupDescriptions)
	if err != nil {
		common.SysLog("error marshalling service group descriptions: " + err.Error())
		return "{}"
	}
	return string(data)
}

func UpdateGroupDescriptionsByJSONString(jsonStr string) error {
	descriptions := make(map[string]string)
	if err := common.UnmarshalJsonStr(jsonStr, &descriptions); err != nil {
		return err
	}

	groupDescriptionsMutex.Lock()
	groupDescriptions = descriptions
	groupDescriptionsMutex.Unlock()
	return nil
}

func GetGroupDescription(groupName string) string {
	groupDescriptionsMutex.RLock()
	defer groupDescriptionsMutex.RUnlock()

	if description, ok := groupDescriptions[groupName]; ok {
		return description
	}
	return groupName
}
