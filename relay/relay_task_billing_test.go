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
package relay

import (
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrepareTaskBillingRatiosAppliesPerSecondDuration(t *testing.T) {
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
		"billing_setting.billing_mode": `{"video-per-second":"per_second"}`,
	}))

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Set("task_request", relaycommon.TaskSubmitReq{Duration: 6})

	ratios, err := prepareTaskBillingRatios(context, "video-per-second", map[string]float64{
		"resolution": 1.5,
	})

	require.NoError(t, err)
	assert.Equal(t, float64(6), ratios["seconds"])
	assert.Equal(t, 1.5, ratios["resolution"])
}

func TestPrepareTaskBillingRatiosKeepsProviderDurationAndRejectsMissingDuration(t *testing.T) {
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
		"billing_setting.billing_mode": `{"video-per-second":"per_second"}`,
	}))

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Set("task_request", relaycommon.TaskSubmitReq{})

	ratios, err := prepareTaskBillingRatios(context, "video-per-second", map[string]float64{"seconds": 8})
	require.NoError(t, err)
	assert.Equal(t, float64(8), ratios["seconds"])

	_, err = prepareTaskBillingRatios(context, "video-per-second", nil)
	require.ErrorContains(t, err, "requires duration or seconds")
}

func TestFilterConditionalPerSecondRatiosKeepsOnlyDuration(t *testing.T) {
	ratioInput := map[string]float64{
		"seconds":    8,
		"resolution": 2,
		"quality":    1.5,
	}

	filtered := filterConditionalPerSecondRatios(ratioInput, true)

	assert.Equal(t, map[string]float64{"seconds": 8}, filtered)
	assert.Equal(t, ratioInput, filterConditionalPerSecondRatios(ratioInput, false))
	assert.Nil(t, filterConditionalPerSecondRatios(map[string]float64{"resolution": 2}, true))
}
