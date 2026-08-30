package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestToOpenAIVideoHidesPrivateUpstreamResultURL(t *testing.T) {
	task := &Task{
		TaskID: "task_public_123",
		Status: TaskStatusSuccess,
		PrivateData: TaskPrivateData{
			ResultURL: "https://private-upstream.example/video.mp4?secret=value",
		},
	}

	video := task.ToOpenAIVideo()

	assert.Nil(t, video.Metadata)
}

func TestToOpenAIVideoOmitsContentURLBeforeSuccess(t *testing.T) {
	task := &Task{TaskID: "task_pending", Status: TaskStatusInProgress}

	video := task.ToOpenAIVideo()

	assert.NotContains(t, video.Metadata, "url")
}
