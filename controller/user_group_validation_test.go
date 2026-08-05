package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateUserRejectsServiceGroupBeforeDatabaseWrite(t *testing.T) {
	originalUserGroups := setting.UserGroups2JSONString()
	require.NoError(t, setting.UpdateUserGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserGroupsByJSONString(originalUserGroups))
	})
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))

	request := model.User{
		Id:       42,
		Username: "user-group-test",
		Group:    "codex",
	}
	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/", request, 1)
	UpdateUser(ctx)

	response := decodeAPIResponse(t, recorder)
	assert.False(t, response.Success)
	assert.NotEmpty(t, response.Message)
	var count int64
	require.NoError(t, db.Model(&model.User{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestCreateUserPersistsSelectedUserGroup(t *testing.T) {
	originalUserGroups := setting.UserGroups2JSONString()
	require.NoError(t, setting.UpdateUserGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserGroupsByJSONString(originalUserGroups))
	})

	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}))
	request := model.User{
		Username: "created-vip-user",
		Password: "password123",
		Role:     common.RoleCommonUser,
		Group:    "vip",
	}
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/user/", request, 1)
	ctx.Set("role", common.RoleAdminUser)
	CreateUser(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var stored model.User
	require.NoError(t, db.Where("username = ?", request.Username).First(&stored).Error)
	assert.Equal(t, "vip", stored.Group)
	assert.NotEqual(t, "codex", stored.Group)
}
