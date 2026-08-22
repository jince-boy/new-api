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
package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSmartProtectionSettingsOmitsAPIKey(t *testing.T) {
	previous := operation_setting.GetSmartProtectionSetting()
	t.Cleanup(func() {
		require.NoError(t, operation_setting.ApplySmartProtectionConfig(map[string]string{"api_key": previous.APIKey}))
	})
	require.NoError(t, operation_setting.ApplySmartProtectionConfig(map[string]string{"api_key": "secret-value"}))

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	GetSmartProtectionSettings(ctx)

	var response struct {
		Data map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	_, hasAPIKey := response.Data["api_key"]
	assert.False(t, hasAPIKey)
	assert.Equal(t, true, response.Data["api_key_configured"])
	assert.Equal(t, "••••alue", response.Data["api_key_hint"])
}
