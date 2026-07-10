package xai

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
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
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "grok-imagine-video-1.5"},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			Action: constant.TaskActionGenerate,
		},
	}
	info.UpstreamModelName = "grok-imagine-video-1.5"
	info.Action = constant.TaskActionGenerate

	payload, err := buildRequestPayload(req, info)

	require.NoError(t, err)
	assert.Equal(t, "grok-imagine-video-1.5", payload["model"])
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
	refs, ok := payload["reference_images"].([]mediaObject)
	require.True(t, ok)
	require.Len(t, refs, 2)
	assert.Equal(t, "file-reference-a", refs[0].FileID)
	assert.Equal(t, "https://example.com/reference-b.png", refs[1].URL)
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
