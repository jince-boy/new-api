package dto

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validAdvancedCustomTaskRoute() AdvancedCustomRoute {
	return AdvancedCustomRoute{
		IncomingPath: "/v1/videos",
		UpstreamPath: "/v1/videos/generations",
		Models:       []string{"seedance-2.0"},
		Headers: map[string]string{
			"X-Provider": "custom",
		},
		Task: &AdvancedCustomTask{
			SubmitMethod: "POST",
			RequestMode:  AdvancedCustomTaskRequestModeTemplate,
			BodyTemplate: json.RawMessage(`{
				"model":"{model}",
				"prompt":"{request.prompt}",
				"duration":"{request.duration}"
			}`),
			SubmitResponse: AdvancedCustomTaskResponse{
				TaskIDPath: "data.task_id",
			},
			Poll: AdvancedCustomTaskPoll{
				Method:       "GET",
				UpstreamPath: "/v1/videos/tasks/{task_id}",
				Response: AdvancedCustomTaskResponse{
					StatusPath:    "data.status",
					ProgressPath:  "data.progress",
					ResultURLPath: "data.video_url",
					ErrorPath:     "error.message",
					StatusMap: map[string]string{
						"pending": "QUEUED",
						"running": "IN_PROGRESS",
						"done":    "SUCCESS",
						"failed":  "FAILURE",
					},
				},
			},
		},
	}
}

func TestAdvancedCustomTaskRouteValidationAndMatching(t *testing.T) {
	route := validAdvancedCustomTaskRoute()
	config := &AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}

	require.NoError(t, config.Validate())

	matched, ok := config.MatchTaskPathForModel("/v1/videos", "seedance-2.0")
	require.True(t, ok)
	assert.Equal(t, route.Task.Poll.UpstreamPath, matched.Task.Poll.UpstreamPath)
	assert.Equal(t, []types.EndpointType{types.EndpointTypeOpenAIVideo}, config.SupportedEndpointTypesForModel("seedance-2.0"))

	_, ok = config.MatchTaskPathForModel("/v1/videos", "another-model")
	assert.False(t, ok)
}

func TestAdvancedCustomTaskRouteAcceptsSafeErrorMessages(t *testing.T) {
	route := validAdvancedCustomTaskRoute()
	route.Task.SubmitResponse.ErrorCodePath = "code"
	route.Task.SubmitResponse.ErrorMessageMap = map[string]string{
		"-2000": "Invalid request parameters.",
	}
	route.Task.SubmitResponse.DefaultErrorMessage = "The request could not be processed."
	route.Task.Poll.Response.ErrorCodePath = "code"
	route.Task.Poll.Response.ErrorMessageMap = map[string]string{
		"-2008": "Video generation failed.",
	}
	route.Task.Poll.Response.DefaultErrorMessage = "The task could not be processed."

	require.NoError(t, (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate())
}

func TestAdvancedCustomTaskRouteAcceptsScriptsInsteadOfFixedResponsePaths(t *testing.T) {
	route := validAdvancedCustomTaskRoute()
	route.Task.RequestScript = `{"body": body, "headers": {"X-Model": model}}`
	route.Task.SubmitResponse.TaskIDPath = ""
	route.Task.SubmitResponse.Script = `body.code == 0 ? {"task_id": body.data.id, "status": "SUBMITTED"} : nil`
	route.Task.Poll.RequestScript = `{"query": {"task": task_id}}`
	route.Task.Poll.Response.StatusPath = ""
	route.Task.Poll.Response.ResultURLPath = ""
	route.Task.Poll.Response.StatusMap = nil
	route.Task.Poll.Response.Script = `{"status": body.state, "result_url": body.url ?? ""}`

	require.NoError(t, (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate())
}

func TestAdvancedCustomTaskRouteAcceptsJavaScriptInsteadOfFixedResponsePaths(t *testing.T) {
	route := validAdvancedCustomTaskRoute()
	route.Task.RequestMode = AdvancedCustomTaskRequestModePassthrough
	route.Task.BodyTemplate = nil
	route.Task.HeadersScript = `return { token: header.key }`
	route.Task.BodyScript = `for (const item of body.items ?? []) { if (item.skip) continue }; return { prompt: body.prompt }`
	route.Task.SubmitResponse.TaskIDPath = ""
	route.Task.SubmitResponse.ResponseScript = `return { task_id: row_response.body.data.id, status: "SUBMITTED" }`
	route.Task.Poll.HeadersScript = `return { "X-Task-ID": body.task_id }`
	route.Task.Poll.Response.StatusPath = ""
	route.Task.Poll.Response.ResultURLPath = ""
	route.Task.Poll.Response.StatusMap = nil
	route.Task.Poll.Response.ResponseScript = `return { status: row_response.body.state, result_url: row_response.body.url }`

	require.NoError(t, (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate())
}

func TestAdvancedCustomTaskRouteRejectsIncompleteProtocols(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*AdvancedCustomRoute)
		want   string
	}{
		{
			name: "invalid body template",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.BodyTemplate = json.RawMessage(`{"model":`)
			},
			want: "body_template must be valid JSON",
		},
		{
			name: "submit body template and code",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.BodyScript = `return body`
			},
			want: "task.body_script cannot be combined with body_template",
		},
		{
			name: "poll body template and code",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.Poll.Method = "POST"
				route.Task.Poll.BodyTemplate = json.RawMessage(`{"task_id":"{task_id}"}`)
				route.Task.Poll.BodyScript = `return body`
			},
			want: "task.poll.body_script cannot be combined with body_template",
		},
		{
			name: "missing submit task id",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.SubmitResponse.TaskIDPath = ""
			},
			want: "task_id_path is required",
		},
		{
			name: "poll path without task id",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.Poll.UpstreamPath = "/v1/videos/tasks"
			},
			want: "must contain {task_id}",
		},
		{
			name: "unknown canonical status",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.Poll.Response.StatusMap["done"] = "COMPLETED"
			},
			want: "invalid target status",
		},
		{
			name: "unknown submit canonical status",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.SubmitResponse.StatusMap = map[string]string{"failed": "ERROR"}
			},
			want: "task.submit_response.status_map has invalid target status",
		},
		{
			name: "safe submit messages without error code path",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.SubmitResponse.ErrorMessageMap = map[string]string{"-2000": "Invalid request."}
			},
			want: "error_code_path is required when safe error messages are configured",
		},
		{
			name: "empty safe poll message",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.Poll.Response.ErrorCodePath = "code"
				route.Task.Poll.Response.ErrorMessageMap = map[string]string{"-2008": ""}
			},
			want: "error_message_map contains an empty code or message",
		},
		{
			name: "invalid response script",
			mutate: func(route *AdvancedCustomRoute) {
				route.Task.SubmitResponse.Script = `repeat("x", 100)`
			},
			want: "task.submit_response.script is invalid",
		},
		{
			name: "task converter",
			mutate: func(route *AdvancedCustomRoute) {
				route.Converter = advancedCustomConverterOpenAIChatToOpenAIResponses
			},
			want: "converter must be none for task routes",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			route := validAdvancedCustomTaskRoute()
			tt.mutate(&route)
			err := (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate()
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.want)
		})
	}
}

func TestAdvancedCustomJSONTemplateRouteValidation(t *testing.T) {
	route := AdvancedCustomRoute{
		IncomingPath:         "/v1/images/generations",
		UpstreamPath:         "/generate",
		Converter:            advancedCustomConverterNone,
		RequestBodyTemplate:  json.RawMessage(`{"engine":"{model}","text":"{request.prompt}"}`),
		ResponseBodyTemplate: json.RawMessage(`{"data":"{response.outputs}"}`),
	}
	require.NoError(t, (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate())

	route.RequestBodyTemplate = json.RawMessage(`{"engine":`)
	err := (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate()
	require.Error(t, err)
	assert.ErrorContains(t, err, "request_body_template must be valid JSON")
}

func TestAdvancedCustomTaskDownloadRejectsUnsafeHeader(t *testing.T) {
	route := validAdvancedCustomTaskRoute()
	route.Task.Download = &AdvancedCustomTaskDownload{
		Headers: map[string]string{"X-Download": "value\r\ninjected"},
	}

	err := (&AdvancedCustomConfig{Routes: []AdvancedCustomRoute{route}}).Validate()

	require.Error(t, err)
	assert.ErrorContains(t, err, "task.download.headers contains an invalid header")
}
