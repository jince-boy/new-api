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
	"bytes"
	"mime/multipart"
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

func TestResolvePerSecondUnitPricePrefersResolutionNameOverFrameSize(t *testing.T) {
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
		"billing_setting.per_second_rules": `{"video-model":[{"name":"480p","price":0.02,"conditions":[{"path":"resolution","operator":"eq","value":"480p"}]},{"name":"720p premium","price":0.04,"conditions":[{"path":"resolution","operator":"eq","value":"720p"},{"path":"vendor.quality","operator":"eq","value":"premium"}]}]}`,
	}))

	body := `{"model":"video-model","prompt":"demo","size":"1280x720","resolution_name":"720P","duration":8,"vendor":{"quality":"premium"}}`
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	require.NoError(t, rootcommon.UnmarshalBodyReusable(context, &TaskSubmitReq{}))
	context.Set("task_request", TaskSubmitReq{Size: "1280x720", Duration: 8})

	price, ruleName, configured, err := ResolvePerSecondUnitPrice(context, "video-model", 0.02)

	require.NoError(t, err)
	require.True(t, configured)
	assert.Equal(t, 0.04, price)
	assert.Equal(t, "720p premium", ruleName)
}

func TestResolvePerSecondUnitPriceReadsConfiguredMultipartFields(t *testing.T) {
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
		"billing_setting.per_second_rules": `{"video-model":[{"name":"480p omni","price":0.02,"conditions":[{"path":"resolution","operator":"eq","value":"480p"},{"path":"functionMode","operator":"eq","value":"omni_reference"},{"path":"image_file_1","operator":"exists"}]},{"name":"720p","price":0.04,"conditions":[{"path":"resolution","operator":"eq","value":"720p"}]}]}`,
	}))

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("model", "video-model"))
	require.NoError(t, writer.WriteField("prompt", "demo"))
	require.NoError(t, writer.WriteField("seconds", "8"))
	require.NoError(t, writer.WriteField("size", "1280x720"))
	require.NoError(t, writer.WriteField("resolution", "480p"))
	require.NoError(t, writer.WriteField("functionMode", "omni_reference"))
	file, err := writer.CreateFormFile("image_file_1", "reference.png")
	require.NoError(t, err)
	_, err = file.Write([]byte("reference image"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/v1/videos", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	info := &RelayInfo{TaskRelayInfo: &TaskRelayInfo{}}
	require.Nil(t, ValidateMultipartDirect(context, info))

	storedRequest, err := GetTaskRequest(context)
	require.NoError(t, err)
	assert.Empty(t, storedRequest.ResolutionName)

	price, ruleName, configured, err := ResolvePerSecondUnitPrice(context, "video-model", 0.04)

	require.NoError(t, err)
	require.True(t, configured)
	assert.Equal(t, 0.02, price)
	assert.Equal(t, "480p omni", ruleName)
}

func TestResolvePerSecondUnitPriceKeepsLegacySizeAlias(t *testing.T) {
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
		"billing_setting.per_second_rules": `{"video-model":[{"name":"720p","price":0.04,"conditions":[{"path":"resolution","operator":"eq","value":"720p"}]}]}`,
	}))

	body := `{"model":"video-model","prompt":"demo","size":"720p","duration":8}`
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	require.NoError(t, rootcommon.UnmarshalBodyReusable(context, &TaskSubmitReq{}))
	context.Set("task_request", TaskSubmitReq{Size: "720p", Duration: 8})

	price, ruleName, configured, err := ResolvePerSecondUnitPrice(context, "video-model", 0.02)

	require.NoError(t, err)
	require.True(t, configured)
	assert.Equal(t, 0.04, price)
	assert.Equal(t, "720p", ruleName)
}
