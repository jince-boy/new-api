package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateUserGroupsRejectsInvalidConfigurationWithoutReplacingCurrentGroups(t *testing.T) {
	original := UserGroups2JSONString()
	require.NoError(t, UpdateUserGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateUserGroupsByJSONString(original))
	})

	for name, value := range map[string]string{
		"empty":           `{}`,
		"missing default": `{"vip":"VIP"}`,
		"blank name":      `{"default":"Default","":"Blank"}`,
		"padded name":     `{"default":"Default"," vip ":"VIP"}`,
		"invalid json":    `{`,
	} {
		t.Run(name, func(t *testing.T) {
			err := UpdateUserGroupsByJSONString(value)
			require.Error(t, err)
			assert.Equal(t, map[string]string{"default": "Default", "vip": "VIP"}, GetUserGroupsCopy())
		})
	}
}
