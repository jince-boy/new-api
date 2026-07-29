package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchUpstreamRatiosPreservesPerSecondPricingMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"video-model","quota_type":1,"model_price":0.02,"billing_mode":"per_second"}]}`))
	}))
	t.Cleanup(upstream.Close)

	requestBody, err := common.Marshal(dto.UpstreamRequest{
		Upstreams: []dto.UpstreamDTO{{
			Name:    "media-upstream",
			BaseURL: upstream.URL,
		}},
		Timeout:     2,
		CatalogOnly: true,
	})
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/ratio_sync/fetch", bytes.NewReader(requestBody))
	context.Request.Header.Set("Content-Type", "application/json")

	FetchUpstreamRatios(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []dto.UpstreamPricingItem `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "video-model", response.Data.Items[0].ModelName)
	assert.Equal(t, billing_setting.BillingModePerSecond, response.Data.Items[0].BillingMode)
	assert.Equal(t, billing_setting.BillingModePerSecond, response.Data.Items[0].SyncValues[billing_setting.BillingModeField])
	assert.Equal(t, 0.02, response.Data.Items[0].SyncValues["model_price"])
}

func TestConvertModelsDevToRatioDataIncludesRichPricing(t *testing.T) {
	raw := `{
		"openai": {
			"id": "openai",
			"name": "OpenAI",
			"models": {
				"gpt-rich": {
					"id": "gpt-rich",
					"name": "GPT Rich",
					"reasoning": true,
					"tool_call": true,
					"structured_output": true,
					"attachment": true,
					"experimental": {"modes": {"fast": {}}},
					"knowledge": "2026-02-16",
					"modalities": {"input": ["text", "image"], "output": ["text"]},
					"limit": {"context": 1000000, "input": 900000, "output": 100000},
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
	assert.Equal(t, "OpenAI", items[0].ProviderName)
	assert.Contains(t, items[0].Key, "::openai::gpt-rich")
	assert.Equal(t, 3.0, *items[0].InputPrice)
	assert.Equal(t, 3.0, *items[0].CacheWritePrice)
	assert.Equal(t, int64(1000000), items[0].Context)
	assert.Equal(t, int64(900000), items[0].InputLimit)
	assert.Equal(t, int64(100000), items[0].OutputLimit)
	assert.Equal(t, []string{"text", "image"}, items[0].InputModalities)
	assert.Equal(t, []string{"text"}, items[0].OutputModalities)
	assert.Equal(t, []string{"Reasoning", "Tool call", "Structured output", "Attachment", "Experimental"}, items[0].Capabilities)
	assert.Equal(t, "2026-02-16", items[0].Knowledge)
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
		`len <= 200000 ? tier("base", p * 1.25 + c * 10 + cr * 0.31 + cc * 2.375) : tier("tier_context_over_200k", p * 2.5 + c * 15 + cr * 0.25)`,
		expr,
	)
	require.NoError(t, billing_setting.SmokeTestExpr(expr))

	items, ok := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.True(t, ok)
	require.Len(t, items, 1)
	require.Len(t, items[0].Tiers, 2)
	assert.Equal(t, "base", items[0].Tiers[0].Label)
	assert.Equal(t, "tier_context_over_200k", items[0].Tiers[1].Label)
	assert.Equal(t, 2.5, *items[0].Tiers[1].InputPrice)
}

func TestConvertModelsDevToRatioDataPrefersExplicitTierOverLegacyAlias(t *testing.T) {
	raw := `{
		"openai": {
			"id": "openai",
			"name": "OpenAI",
			"models": {
				"gpt-5.6-luna": {
					"cost": {
						"input": 1,
						"output": 6,
						"cache_read": 0.1,
						"cache_write": 1.25,
						"context_over_200k": {
							"input": 2,
							"output": 9,
							"cache_read": 0.2,
							"cache_write": 2.5
						},
						"tiers": [{
							"input": 2,
							"output": 9,
							"cache_read": 0.2,
							"cache_write": 2.5,
							"tier": {"type": "context", "size": 272000}
						}]
					}
				}
			}
		}
	}`

	converted, err := convertModelsDevToRatioData(strings.NewReader(raw))
	require.NoError(t, err)

	expr := converted[billing_setting.BillingExprField].(map[string]any)["gpt-5.6-luna"].(string)
	assert.Equal(
		t,
		`len <= 272000 ? tier("base", p * 1 + c * 6 + cr * 0.1 + cc * 1.25) : tier("tier_context_over_272k", p * 2 + c * 9 + cr * 0.2 + cc * 2.5)`,
		expr,
	)
	require.NoError(t, billing_setting.SmokeTestExpr(expr))

	items := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.Len(t, items, 1)
	require.Len(t, items[0].Tiers, 2)
	assert.Equal(t, []string{"base", "tier_context_over_272k"}, []string{
		items[0].Tiers[0].Label,
		items[0].Tiers[1].Label,
	})
	assert.Equal(t, "len > 272000", items[0].Tiers[1].Condition)
}

func TestConvertModelsDevToRatioDataKeepsProviderSpecificRows(t *testing.T) {
	raw := `{
		"provider-a": {
			"id": "provider-a",
			"name": "Provider A",
			"models": {"shared-model": {"cost": {"input": 2, "output": 8}}}
		},
		"provider-b": {
			"id": "provider-b",
			"name": "Provider B",
			"models": {"shared-model": {"cost": {"input": 1, "output": 6}}}
		}
	}`

	converted, err := convertModelsDevToRatioData(strings.NewReader(raw))
	require.NoError(t, err)

	assert.Equal(t, 0.5, converted["model_ratio"].(map[string]any)["shared-model"])
	items, ok := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.True(t, ok)
	require.Len(t, items, 2)
	assert.Equal(t, []string{"Provider A", "Provider B"}, []string{items[0].ProviderName, items[1].ProviderName})
	assert.NotEqual(t, items[0].Key, items[1].Key)
	assert.Equal(t, 2.0, *items[0].InputPrice)
	assert.Equal(t, 1.0, *items[1].InputPrice)
}

func TestConvertModelsDevToRatioDataKeepsUnpricedCatalogRows(t *testing.T) {
	raw := `{
		"openai": {
			"id": "openai",
			"name": "OpenAI",
			"models": {
				"priced-model": {"cost": {"input": 1, "output": 4}},
				"unpriced-model": {
					"name": "Unpriced Model",
					"description": "Catalog metadata without pricing",
					"modalities": {"input": ["text"], "output": ["text"]}
				}
			}
		}
	}`

	converted, err := convertModelsDevToRatioData(strings.NewReader(raw))
	require.NoError(t, err)

	items, ok := converted[upstreamPricingItemsField].([]dto.UpstreamPricingItem)
	require.True(t, ok)
	require.Len(t, items, 2)
	assert.Equal(t, "priced-model", items[0].ModelName)
	assert.NotEmpty(t, items[0].SyncValues)
	assert.Equal(t, "unpriced-model", items[1].ModelName)
	assert.Nil(t, items[1].InputPrice)
	assert.Empty(t, items[1].SyncValues)
	assert.Empty(t, items[1].Tiers)
}
