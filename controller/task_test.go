package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTasksToDtoUserViewHidesUpstreamTaskDetails(t *testing.T) {
	task := &model.Task{
		ID:         11,
		TaskID:     "task_public_123",
		Platform:   constant.TaskPlatform("advanced_custom"),
		UserId:     7,
		Group:      "default",
		ChannelId:  9,
		Quota:      1200,
		Action:     "generate",
		Status:     model.TaskStatusSuccess,
		FailReason: "private upstream failure",
		SubmitTime: 100,
		FinishTime: 105,
		Properties: model.Properties{
			Input:             "private prompt",
			OriginModelName:   "video-public-model",
			UpstreamModelName: "provider-secret-model",
		},
		PrivateData: model.TaskPrivateData{ResultURL: "https://provider.example/private.mp4"},
	}
	task.SetData(map[string]any{
		"provider_trace": "private-trace",
		"result_url":     "https://provider.example/private.mp4",
	})

	items := tasksToDto([]*model.Task{task}, false)
	require.Len(t, items, 1)
	item := items[0]

	assert.Empty(t, item.FailReason)
	assert.Empty(t, item.ResultURL)
	assert.Empty(t, item.Data)
	assert.Equal(t, map[string]string{
		"origin_model_name": "video-public-model",
	}, item.Properties)

	encoded, err := common.Marshal(item)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "provider-secret-model")
	assert.NotContains(t, string(encoded), "private prompt")
	assert.NotContains(t, string(encoded), "private-trace")
	assert.NotContains(t, string(encoded), "private upstream failure")
	assert.NotContains(t, string(encoded), "private.mp4")
	assert.NotContains(t, string(encoded), `"data"`)
	assert.Contains(t, string(encoded), "video-public-model")
}
