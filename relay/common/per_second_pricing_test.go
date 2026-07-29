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
package common

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	rootcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolvePerSecondUnitPriceReadsRawCustomFieldsAndResolutionAlias(t *testing.T) {
	gin.SetMode(gin.TestMode)
	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(saved))
	})
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.per_second_rules": `{"video-model":[{"name":"720p premium","price":0.04,"conditions":[{"path":"resolution","operator":"eq","value":"720p"},{"path":"vendor.quality","operator":"eq","value":"premium"}]}]}`,
	}))

	body := `{"model":"video-model","prompt":"demo","size":"720P","duration":8,"vendor":{"quality":"premium"}}`
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	require.NoError(t, rootcommon.UnmarshalBodyReusable(context, &TaskSubmitReq{}))
	context.Set("task_request", TaskSubmitReq{Size: "720P", Duration: 8})

	price, ruleName, configured, err := ResolvePerSecondUnitPrice(context, "video-model", 0.02)

	require.NoError(t, err)
	require.True(t, configured)
	assert.Equal(t, 0.04, price)
	assert.Equal(t, "720p premium", ruleName)
}
