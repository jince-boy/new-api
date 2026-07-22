package xai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRequestPayloadUsesMappedModelAndMedia(t *testing.T) {
	req := relaycommon.TaskSubmitReq{
		Prompt:   "animate the city",
		Model:    "client-model",
		Images:   []string{"https://example.com/input.png"},
		Duration: 8,
		Size:     "1280x720",
		Metadata: map[string]any{
			"model":       "metadata-model",
			"prompt":      "metadata prompt",
			"temperature": 0.3,
		},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "grok-imagine-video-1.5-preview"},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			Action: constant.TaskActionGenerate,
		},
	}
	info.UpstreamModelName = "grok-imagine-video-1.5-preview"
	info.Action = constant.TaskActionGenerate

	payload, err := buildRequestPayload(req, info)

	require.NoError(t, err)
	assert.Equal(t, "grok-imagine-video-1.5-preview", payload["model"])
	assert.Equal(t, "animate the city", payload["prompt"])
	assert.Equal(t, 8, payload["duration"])
	assert.Equal(t, "16:9", payload["aspect_ratio"])
	assert.Equal(t, "1080p", payload["resolution"])
	assert.Equal(t, 0.3, payload["temperature"])
	assert.NotContains(t, payload, "reference_images")

	image, ok := payload["image"].(*mediaObject)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/input.png", image.URL)
}

func TestBuildRequestPayloadUsesReferenceImages(t *testing.T) {
	req := relaycommon.TaskSubmitReq{
		Prompt: "mix these references",
		Images: []string{"file-reference-a", "https://example.com/reference-b.png"},
	}
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{Action: constant.TaskActionReferenceGenerate},
	}
	info.Action = constant.TaskActionReferenceGenerate

	payload, err := buildRequestPayload(req, info)

	require.NoError(t, err)
	assert.Equal(t, "grok-imagine-video", payload["model"])
	refs, ok := payload["reference_images"].([]mediaObject)
	require.True(t, ok)
	require.Len(t, refs, 2)
	assert.Equal(t, "file-reference-a", refs[0].FileID)
	assert.Equal(t, "https://example.com/reference-b.png", refs[1].URL)
}

func TestBuildRequestPayloadAcceptsOpenAIVideoFields(t *testing.T) {
	req := relaycommon.TaskSubmitReq{
		Model:          "grok-imagine-video-1.5-preview",
		Prompt:         "animate the first frame",
		Seconds:        "12",
		Size:           "1920x1080",
		InputReference: "data:image/png;base64,aGVsbG8=",
		Metadata: map[string]any{
			"aspect_ratio": "4:3",
			"resolution":   "1080p",
		},
	}
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{Action: constant.TaskActionGenerate},
	}
	info.Action = constant.TaskActionGenerate

	payload, err := buildRequestPayload(req, info)

	require.NoError(t, err)
	assert.Equal(t, "grok-imagine-video-1.5-preview", payload["model"])
	assert.Equal(t, 12, payload["duration"])
	assert.Equal(t, "4:3", payload["aspect_ratio"])
	assert.Equal(t, "1080p", payload["resolution"])
	image, ok := payload["image"].(*mediaObject)
	require.True(t, ok)
	assert.Equal(t, req.InputReference, image.URL)
}

func TestValidateMetadataDurationRejectsOutOfRangeMultiplier(t *testing.T) {
	req := relaycommon.TaskSubmitReq{
		Prompt: "too long",
		Metadata: map[string]any{
			"duration": float64(relaycommon.MaxTaskDurationSeconds + 1),
		},
	}

	require.Error(t, validateMetadataDuration(req))
}

func TestParseTaskResultMapsXAIStatuses(t *testing.T) {
	adaptor := &TaskAdaptor{}

	success, err := adaptor.ParseTaskResult([]byte(`{
		"request_id":"req_123",
		"status":"done",
		"video":{"url":"https://example.com/video.mp4"}
	}`))
	require.NoError(t, err)
	assert.Equal(t, "req_123", success.TaskID)
	assert.Equal(t, "SUCCESS", success.Status)
	assert.Equal(t, "https://example.com/video.mp4", success.Url)
	assert.Equal(t, "100%", success.Progress)

	failed, err := adaptor.ParseTaskResult([]byte(`{
		"request_id":"req_456",
		"status":"expired"
	}`))
	require.NoError(t, err)
	assert.Equal(t, "FAILURE", failed.Status)
	assert.Equal(t, "task expired", failed.Reason)
}

func TestTaskAdaptorSubmitsAndPollsBothGrokVideoModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalRelayTimeout := common.RelayTimeout
	common.RelayTimeout = 2
	service.InitHttpClient()
	t.Cleanup(func() {
		common.RelayTimeout = originalRelayTimeout
		service.InitHttpClient()
	})

	for _, modelName := range []string{"grok-imagine-video", "grok-imagine-video-1.5-preview"} {
		t.Run(modelName, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
				w.Header().Set("Content-Type", "application/json")
				switch r.Method {
				case http.MethodPost:
					assert.Equal(t, "/v1/videos/generations", r.URL.Path)
					var payload map[string]any
					if assert.NoError(t, common.DecodeJson(r.Body, &payload)) {
						assert.Equal(t, modelName, payload["model"])
						assert.Equal(t, "a paper boat sailing", payload["prompt"])
						assert.Equal(t, float64(5), payload["duration"])
						assert.Equal(t, "16:9", payload["aspect_ratio"])
						assert.Equal(t, "480p", payload["resolution"])
					}
					_, _ = io.WriteString(w, `{"request_id":"upstream_123","status":"pending"}`)
				case http.MethodGet:
					assert.Equal(t, "/v1/videos/upstream_123", r.URL.Path)
					_, _ = io.WriteString(w, `{"request_id":"upstream_123","status":"done","video":{"url":"https://example.com/video.mp4"}}`)
				default:
					w.WriteHeader(http.StatusMethodNotAllowed)
				}
			}))
			defer server.Close()

			adaptor := &TaskAdaptor{}
			info := &relaycommon.RelayInfo{
				OriginModelName: modelName,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: server.URL,
					ApiKey:         "test-key",
				},
				TaskRelayInfo: &relaycommon.TaskRelayInfo{
					Action:       constant.TaskActionTextGenerate,
					PublicTaskID: "task_public",
				},
			}
			info.Action = constant.TaskActionTextGenerate
			adaptor.Init(info)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("task_request", relaycommon.TaskSubmitReq{
				Model:   modelName,
				Prompt:  "a paper boat sailing",
				Seconds: "5",
				Size:    "854x480",
				Metadata: map[string]any{
					"aspect_ratio": "16:9",
					"resolution":   "480p",
				},
			})

			body, err := adaptor.BuildRequestBody(ctx, info)
			require.NoError(t, err)
			requestURL, err := adaptor.BuildRequestURL(info)
			require.NoError(t, err)
			request, err := http.NewRequest(http.MethodPost, requestURL, body)
			require.NoError(t, err)
			require.NoError(t, adaptor.BuildRequestHeader(ctx, request, info))
			response, err := (&http.Client{Timeout: 2 * time.Second}).Do(request)
			require.NoError(t, err)

			upstreamID, _, taskErr := adaptor.DoResponse(ctx, response, info)
			require.Nil(t, taskErr)
			require.Equal(t, "upstream_123", upstreamID)
			assert.Equal(t, http.StatusOK, recorder.Code)

			pollResponse, err := adaptor.FetchTask(server.URL, "test-key", map[string]any{"task_id": upstreamID}, "")
			require.NoError(t, err)
			defer pollResponse.Body.Close()
			pollBody, err := io.ReadAll(pollResponse.Body)
			require.NoError(t, err)
			result, err := adaptor.ParseTaskResult(pollBody)
			require.NoError(t, err)
			assert.Equal(t, "SUCCESS", result.Status)
			assert.Equal(t, "https://example.com/video.mp4", result.Url)
		})
	}
}
