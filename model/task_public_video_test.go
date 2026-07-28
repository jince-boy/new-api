package model

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
)

func TestToOpenAIVideoHidesPrivateUpstreamResultURL(t *testing.T) {
	originalServerAddress := system_setting.ServerAddress
	t.Cleanup(func() { system_setting.ServerAddress = originalServerAddress })
	system_setting.ServerAddress = "https://gateway.example.com"

	task := &Task{
		TaskID: "task_public_123",
		Status: TaskStatusSuccess,
		PrivateData: TaskPrivateData{
			ResultURL: "https://private-upstream.example/video.mp4?secret=value",
		},
	}

	video := task.ToOpenAIVideo()

	assert.Equal(t, "https://gateway.example.com/v1/videos/task_public_123/content", video.Metadata["url"])
	assert.NotContains(t, video.Metadata["url"], "private-upstream")
}

func TestToOpenAIVideoOmitsContentURLBeforeSuccess(t *testing.T) {
	task := &Task{TaskID: "task_pending", Status: TaskStatusInProgress}

	video := task.ToOpenAIVideo()

	assert.NotContains(t, video.Metadata, "url")
}
