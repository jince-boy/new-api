package advancedcustom

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relaykitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveTaskTemplatePreservesJSONTypesAndOmitsMissingFields(t *testing.T) {
	template := map[string]any{
		"model":    "{model}",
		"prompt":   "{request.prompt}",
		"duration": "{request.duration}",
		"images":   "{request.images}",
		"optional": "{request.not_present}",
		"label":    "video-{request.duration}",
	}
	requestBody := []byte(`{"prompt":"draw a fox","duration":5,"images":["a","b"]}`)

	resolved, keep := resolveTaskTemplate(template, taskTemplateValues{
		model:       "provider-video-v2",
		requestBody: requestBody,
	})

	require.True(t, keep)
	result, ok := resolved.(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "provider-video-v2", result["model"])
	assert.Equal(t, "draw a fox", result["prompt"])
	assert.Equal(t, float64(5), result["duration"])
	assert.Equal(t, []any{"a", "b"}, result["images"])
	assert.Equal(t, "video-5", result["label"])
	assert.NotContains(t, result, "optional")
}

func TestPassThroughSubmissionPreservesDimensioFieldsAndMapsModel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	requestBody := `{"model":"client-video","prompt":"cinematic tracking shot","ratio":"16:9","resolution":"720p","duration":5,"functionMode":"first_last_frames","file_paths":["https://example.com/frame.png"]}`
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(requestBody))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var parsed map[string]any
	require.NoError(t, common.UnmarshalBodyReusable(context, &parsed))

	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			RequestMode: relaykitdto.AdvancedCustomTaskRequestModePassthrough,
		}},
	}
	body, err := adaptor.BuildRequestBody(context, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "seedance-2.0"},
	})
	require.NoError(t, err)
	encoded, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"seedance-2.0","prompt":"cinematic tracking shot","ratio":"16:9","resolution":"720p","duration":5,"functionMode":"first_last_frames","file_paths":["https://example.com/frame.png"]}`, string(encoded))
}

func TestFetchTaskUsesConfiguredMethodHeadersBodyAndResponseMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/tasks/upstream-123", r.URL.Path)
		assert.Equal(t, "secret-key", r.Header.Get("X-API-Key"))
		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		assert.JSONEq(t, `{"id":"upstream-123","model":"video-v1"}`, string(body))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"state":"done","progress":1,"output":{"url":"/media/video.mp4"}}}`))
	}))
	defer server.Close()

	route := relaykitdto.AdvancedCustomRoute{
		IncomingPath: "/v1/videos",
		UpstreamPath: "/submit",
		Converter:    "none",
		Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{TaskIDPath: "data.id"},
			Poll: relaykitdto.AdvancedCustomTaskPoll{
				Method:       http.MethodPost,
				UpstreamPath: "/tasks/{task_id}",
				Auth: &relaykitdto.AdvancedCustomRouteAuth{
					Type:  relaykitdto.AdvancedCustomAuthTypeHeader,
					Name:  "X-API-Key",
					Value: "{api_key}",
				},
				BodyTemplate: []byte(`{"id":"{task_id}","model":"{model}"}`),
				Response: relaykitdto.AdvancedCustomTaskResponse{
					StatusPath:    "data.state",
					ProgressPath:  "data.progress",
					ResultURLPath: "data.output.url",
					StatusMap:     map[string]string{"done": "SUCCESS"},
				},
			},
		},
	}

	adaptor := &TaskAdaptor{}
	resp, err := adaptor.FetchTask(server.URL, "secret-key", map[string]any{
		"task_id":                    "upstream-123",
		"model":                      "video-v1",
		"advanced_custom_task_route": &route,
	}, "")
	require.NoError(t, err)
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	result, err := adaptor.ParseTaskResult(responseBody)
	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusSuccess), result.Status)
	assert.Equal(t, "100%", result.Progress)
	assert.Equal(t, server.URL+"/media/video.mp4", result.Url)
}

func TestTaskRouteSnapshotIsIndependentFromConfigurationEdits(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{
			IncomingPath: "/v1/videos",
			UpstreamPath: "https://provider.example/submit",
			Headers:      map[string]string{"X-Version": "v1"},
		},
	}

	snapshot := adaptor.TaskRouteSnapshot()
	require.NotNil(t, snapshot)
	snapshot.Headers["X-Version"] = "changed"

	assert.Equal(t, "v1", adaptor.route.Headers["X-Version"])
}

func TestExtractTaskStringSupportsNestedArrayPath(t *testing.T) {
	body, err := common.Marshal(map[string]any{
		"outputs": []any{map[string]any{"url": "https://cdn.example.com/video.mp4"}},
	})
	require.NoError(t, err)
	assert.Equal(t, "https://cdn.example.com/video.mp4", extractTaskString(body, "outputs.0.url"))
	assert.Equal(t, "", extractTaskString([]byte(strings.TrimSpace(`{"data":{}}`)), "data.id"))
}

func TestDoResponseUsesConfiguredSubmitFailureMappingBeforeTaskID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				TaskIDPath: "task_id",
				StatusPath: "status",
				ErrorPath:  "error.message",
				StatusMap:  map[string]string{"failed": "FAILURE"},
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"status":"failed","error":{"message":"content rejected"}}`)),
	}

	taskID, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Empty(t, taskID)
	assert.Equal(t, "upstream_task_failed", taskErr.Code)
	assert.Equal(t, "content rejected", taskErr.Message)
	require.NotNil(t, info.TaskUpstreamDiagnostics)
	assert.Equal(t, "failed", info.TaskUpstreamDiagnostics.UpstreamStatus)
	assert.Equal(t, "FAILURE", info.TaskUpstreamDiagnostics.MappedStatus)
	assert.True(t, info.TaskUpstreamDiagnostics.StatusMappingApplied)
	assert.True(t, info.TaskUpstreamDiagnostics.ErrorPathMatched)
}

func TestMapTaskErrorResponseExtractsConfiguredMessageWithoutRawBody(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				StatusPath: "status",
				ErrorPath:  "error.message",
				StatusMap:  map[string]string{"failed": "FAILURE"},
			},
		}},
	}
	info := &relaycommon.RelayInfo{}
	body := []byte(`{"status":"failed","error":{"message":"invalid prompt","debug":"must not leak"}}`)

	taskErr := adaptor.MapTaskErrorResponse(nil, http.StatusBadRequest, body, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Equal(t, "upstream_task_failed", taskErr.Code)
	assert.Equal(t, "invalid prompt", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "must not leak")
	require.NotNil(t, info.TaskUpstreamDiagnostics)
	assert.Equal(t, http.StatusBadRequest, info.TaskUpstreamDiagnostics.HTTPStatus)
}

func TestMapTaskErrorResponseDoesNotExposeStructuredErrorValue(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				ErrorPath: "error",
			},
		}},
	}
	info := &relaycommon.RelayInfo{}
	body := []byte(`{"error":{"message":"invalid prompt","debug":"private upstream details"}}`)

	taskErr := adaptor.MapTaskErrorResponse(nil, http.StatusBadRequest, body, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, "upstream task submission failed with HTTP status 400", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private upstream details")
	require.NotNil(t, info.TaskUpstreamDiagnostics)
	assert.False(t, info.TaskUpstreamDiagnostics.ErrorPathMatched)
}

func TestParseTaskResultProvidesFailureReasonWhenErrorPathIsEmpty(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			Poll: relaykitdto.AdvancedCustomTaskPoll{Response: relaykitdto.AdvancedCustomTaskResponse{
				StatusPath: "status",
				ErrorPath:  "error.message",
				StatusMap:  map[string]string{"failed": "FAILURE"},
			}},
		}},
	}

	result, err := adaptor.ParseTaskResult([]byte(`{"status":"failed"}`))

	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusFailure), result.Status)
	assert.Equal(t, "upstream task failed with status failed", result.Reason)
}
