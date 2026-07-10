package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestXaiVideoModelUsesOpenAIVideoEndpoint(t *testing.T) {
	endpoints := GetEndpointTypesByChannelType(constant.ChannelTypeXai, "grok-imagine-video-1.5")

	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIVideo}, endpoints)
}

func TestDefaultEndpointInfoIncludesOpenAIVideo(t *testing.T) {
	endpoint, ok := GetDefaultEndpointInfo(constant.EndpointTypeOpenAIVideo)

	assert.True(t, ok)
	assert.Equal(t, "/v1/videos", endpoint.Path)
	assert.Equal(t, "POST", endpoint.Method)
}

func TestDefaultEndpointInfoIncludesAllModelConfigurableRoutes(t *testing.T) {
	tests := []struct {
		name         string
		endpointType constant.EndpointType
		path         string
		method       string
	}{
		{name: "completions", endpointType: constant.EndpointTypeOpenAICompletions, path: "/v1/completions", method: "POST"},
		{name: "image edits", endpointType: constant.EndpointTypeImageEdits, path: "/v1/images/edits", method: "POST"},
		{name: "audio speech", endpointType: constant.EndpointTypeAudioSpeech, path: "/v1/audio/speech", method: "POST"},
		{name: "audio transcriptions", endpointType: constant.EndpointTypeAudioTranscriptions, path: "/v1/audio/transcriptions", method: "POST"},
		{name: "audio translations", endpointType: constant.EndpointTypeAudioTranslations, path: "/v1/audio/translations", method: "POST"},
		{name: "moderations", endpointType: constant.EndpointTypeModerations, path: "/v1/moderations", method: "POST"},
		{name: "realtime", endpointType: constant.EndpointTypeRealtime, path: "/v1/realtime", method: "GET"},
		{name: "video retrieve", endpointType: constant.EndpointTypeOpenAIVideoRetrieve, path: "/v1/videos/{task_id}", method: "GET"},
		{name: "video content", endpointType: constant.EndpointTypeOpenAIVideoContent, path: "/v1/videos/{task_id}/content", method: "GET"},
		{name: "video remix", endpointType: constant.EndpointTypeOpenAIVideoRemix, path: "/v1/videos/{video_id}/remix", method: "POST"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			endpoint, ok := GetDefaultEndpointInfo(tt.endpointType)

			assert.True(t, ok)
			assert.Equal(t, tt.path, endpoint.Path)
			assert.Equal(t, tt.method, endpoint.Method)
		})
	}
}
