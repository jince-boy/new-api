package controller

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertModelsDevToRatioDataIncludesRichPricing(t *testing.T) {
	raw := `{
		"openai": {
			"models": {
				"gpt-rich": {
					"cost": {
						"input": 3,
						"output": 15,
						"cache_read": 0.75,
						"cache_write": 3,
						"input_audio": 40,
						"output_audio": 80
					}
				}
			}
		}
	}`

	converted, err := convertModelsDevToRatioData(strings.NewReader(raw))
	require.NoError(t, err)

	assert.Equal(t, 1.5, converted["model_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, 5.0, converted["completion_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, 0.25, converted["cache_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, 1.0, converted["create_cache_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, 13.333333, converted["audio_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, 26.666667, converted["audio_completion_ratio"].(map[string]any)["gpt-rich"])
	assert.Equal(t, billing_setting.BillingModeTieredExpr, converted[billing_setting.BillingModeField].(map[string]any)["gpt-rich"])
	expr, ok := converted[billing_setting.BillingExprField].(map[string]any)["gpt-rich"].(string)
	require.True(t, ok)
	assert.Equal(
		t,
		`tier("base", p * 3 + c * 15 + cr * 0.75 + cc * 3 + ai * 40 + ao * 80)`,
		expr,
	)
	require.NoError(t, billing_setting.SmokeTestExpr(expr))

	items, ok := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.True(t, ok)
	require.Len(t, items, 1)
	assert.Equal(t, "gpt-rich", items[0].ModelName)
	assert.Equal(t, 3.0, *items[0].InputPrice)
	assert.Equal(t, 3.0, *items[0].CacheWritePrice)
	assert.Equal(t, expr, items[0].BillingExpr)
}

func TestConvertModelsDevToRatioDataIncludesTieredPricing(t *testing.T) {
	raw := `{
		"requesty": {
			"models": {
				"google/gemini-2.5-pro": {
					"cost": {
						"input": 1.25,
						"output": 10,
						"cache_read": 0.31,
						"cache_write": 2.375,
						"tiers": [
							{
								"input": 2.5,
								"output": 15,
								"cache_read": 0.25,
								"tier": { "type": "context", "size": 200000 }
							}
						]
					}
				}
			}
		}
	}`

	converted, err := convertModelsDevToRatioData(strings.NewReader(raw))
	require.NoError(t, err)

	assert.Equal(t, 0.625, converted["model_ratio"].(map[string]any)["google/gemini-2.5-pro"])
	assert.Equal(t, 8.0, converted["completion_ratio"].(map[string]any)["google/gemini-2.5-pro"])
	assert.Equal(t, 0.248, converted["cache_ratio"].(map[string]any)["google/gemini-2.5-pro"])
	assert.Equal(t, 1.9, converted["create_cache_ratio"].(map[string]any)["google/gemini-2.5-pro"])
	assert.Equal(t, billing_setting.BillingModeTieredExpr, converted[billing_setting.BillingModeField].(map[string]any)["google/gemini-2.5-pro"])
	expr, ok := converted[billing_setting.BillingExprField].(map[string]any)["google/gemini-2.5-pro"].(string)
	require.True(t, ok)
	assert.Equal(
		t,
		`len <= 200000 ? tier("base", p * 1.25 + c * 10 + cr * 0.31 + cc * 2.375) : tier("context_over_200k", p * 2.5 + c * 15 + cr * 0.25)`,
		expr,
	)
	require.NoError(t, billing_setting.SmokeTestExpr(expr))

	items, ok := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.True(t, ok)
	require.Len(t, items, 1)
	require.Len(t, items[0].Tiers, 2)
	assert.Equal(t, "base", items[0].Tiers[0].Label)
	assert.Equal(t, "context_over_200k", items[0].Tiers[1].Label)
	assert.Equal(t, 2.5, *items[0].Tiers[1].InputPrice)
}
