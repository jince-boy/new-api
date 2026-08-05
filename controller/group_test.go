package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetGroupsReturnsOnlyServiceGroups(t *testing.T) {
	originalUserGroups := setting.UserGroups2JSONString()
	originalServiceGroups := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"codex":1,"claude":1.2}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserGroupsByJSONString(originalUserGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalServiceGroups))
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	GetGroups(context)

	var response struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.ElementsMatch(t, []string{"codex", "claude"}, response.Data)
}

func TestGetUserGroupNamesReturnsOnlyUserGroups(t *testing.T) {
	originalUserGroups := setting.UserGroups2JSONString()
	originalServiceGroups := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"codex":1,"claude":1.2}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserGroupsByJSONString(originalUserGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalServiceGroups))
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	GetUserGroupNames(context)

	var response struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.ElementsMatch(t, []string{"default", "vip"}, response.Data)
}

func TestFilterPricingByUsableGroupsRemovesHiddenGroupMetadata(t *testing.T) {
	pricing := []model.Pricing{
		{ModelName: "shared", EnableGroup: []string{"visible", "hidden"}},
		{ModelName: "hidden-only", EnableGroup: []string{"hidden"}},
		{ModelName: "all", EnableGroup: []string{"all", "hidden"}},
	}

	filtered := filterPricingByUsableGroups(pricing, map[string]string{"visible": "Visible"})

	require.Len(t, filtered, 2)
	assert.Equal(t, "shared", filtered[0].ModelName)
	assert.Equal(t, []string{"visible"}, filtered[0].EnableGroup)
	assert.Equal(t, "all", filtered[1].ModelName)
	assert.Equal(t, []string{"all"}, filtered[1].EnableGroup)
}
