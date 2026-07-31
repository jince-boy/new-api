package advancedcustom

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
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

func TestMultipartPassThroughPreservesAllFieldsAndFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pngContent, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	require.NoError(t, err)
	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	require.NoError(t, writer.WriteField("model", "client-video"))
	require.NoError(t, writer.WriteField("prompt", "reference @image_file_1 and @image_file_2"))
	require.NoError(t, writer.WriteField("ratio", "16:9"))
	require.NoError(t, writer.WriteField("resolution", "480p"))
	require.NoError(t, writer.WriteField("duration", "5"))
	require.NoError(t, writer.WriteField("functionMode", "omni_reference"))
	fileHeader := textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="image_file_1"; filename="first.png"`},
		"Content-Type":        {"image/png"},
		"X-Upload-Marker":     {"preserve-me"},
	}
	firstImage, err := writer.CreatePart(fileHeader)
	require.NoError(t, err)
	_, err = firstImage.Write(pngContent)
	require.NoError(t, err)
	secondImage, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="image_file_2"; filename="second.png"`},
		"Content-Type":        {"image/png"},
	})
	require.NoError(t, err)
	_, err = secondImage.Write(pngContent)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	originalContentType := writer.FormDataContentType()

	request := httptest.NewRequest(http.MethodPost, "/v1/videos", &requestBody)
	request.Header.Set("Content-Type", originalContentType)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var validatedRequest relaycommon.TaskSubmitReq
	require.NoError(t, common.UnmarshalBodyReusable(context, &validatedRequest))

	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			RequestMode:   relaykitdto.AdvancedCustomTaskRequestModePassthrough,
			HeadersScript: `return { "X-Resolution": body.resolution }`,
			BodyScript:    `return body`,
		}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "seedance-2.0"},
	}

	body, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	upstreamRequest := httptest.NewRequest(http.MethodPost, "https://provider.example/submit", body)
	require.NoError(t, adaptor.BuildRequestHeader(context, upstreamRequest, info))
	assert.Equal(t, originalContentType, upstreamRequest.Header.Get("Content-Type"))
	assert.Equal(t, "480p", upstreamRequest.Header.Get("X-Resolution"))
	require.NoError(t, upstreamRequest.ParseMultipartForm(32<<20))
	t.Cleanup(func() {
		if upstreamRequest.MultipartForm != nil {
			_ = upstreamRequest.MultipartForm.RemoveAll()
		}
	})

	assert.Equal(t, "seedance-2.0", upstreamRequest.FormValue("model"))
	assert.Equal(t, "reference @image_file_1 and @image_file_2", upstreamRequest.FormValue("prompt"))
	assert.Equal(t, "16:9", upstreamRequest.FormValue("ratio"))
	assert.Equal(t, "480p", upstreamRequest.FormValue("resolution"))
	assert.Equal(t, "5", upstreamRequest.FormValue("duration"))
	assert.Equal(t, "omni_reference", upstreamRequest.FormValue("functionMode"))

	firstFiles := upstreamRequest.MultipartForm.File["image_file_1"]
	require.Len(t, firstFiles, 1)
	assert.Equal(t, "image/png", firstFiles[0].Header.Get("Content-Type"))
	assert.Equal(t, "preserve-me", firstFiles[0].Header.Get("X-Upload-Marker"))
	assert.Equal(t, fileHeader.Get("Content-Disposition"), firstFiles[0].Header.Get("Content-Disposition"))
	first, err := firstFiles[0].Open()
	require.NoError(t, err)
	firstContent, err := io.ReadAll(first)
	require.NoError(t, err)
	require.NoError(t, first.Close())
	assert.Equal(t, sha256.Sum256(pngContent), sha256.Sum256(firstContent))

	secondFiles := upstreamRequest.MultipartForm.File["image_file_2"]
	require.Len(t, secondFiles, 1)
	assert.Equal(t, "image/png", secondFiles[0].Header.Get("Content-Type"))
	second, err := secondFiles[0].Open()
	require.NoError(t, err)
	secondContent, err := io.ReadAll(second)
	require.NoError(t, err)
	require.NoError(t, second.Close())
	assert.Equal(t, sha256.Sum256(pngContent), sha256.Sum256(secondContent))
}

func TestMultipartPassThroughWithSameModelPreservesWireBodyExactly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	pngContent, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	require.NoError(t, err)

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	require.NoError(t, writer.SetBoundary("new-api-byte-preservation-boundary"))
	require.NoError(t, writer.WriteField("model", "seedance-2.0"))
	require.NoError(t, writer.WriteField("resolution", "480p"))
	image, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="image_file_1"; filename="source.png"`},
		"Content-Type":        {"image/png"},
		"X-Upload-Marker":     {"unchanged"},
	})
	require.NoError(t, err)
	_, err = image.Write(pngContent)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	originalBody := bytes.Clone(requestBody.Bytes())
	originalContentType := writer.FormDataContentType()

	request := httptest.NewRequest(http.MethodPost, "/v1/videos", bytes.NewReader(originalBody))
	request.Header.Set("Content-Type", originalContentType)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var validatedRequest relaycommon.TaskSubmitReq
	require.NoError(t, common.UnmarshalBodyReusable(context, &validatedRequest))

	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			RequestMode:   relaykitdto.AdvancedCustomTaskRequestModePassthrough,
			HeadersScript: `return header`,
			BodyScript:    `return body`,
		}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "seedance-2.0"},
	}

	body, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	forwardedBody, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Equal(t, originalContentType, adaptor.submitContentType)
	assert.Equal(t, sha256.Sum256(originalBody), sha256.Sum256(forwardedBody))
	assert.Equal(t, originalBody, forwardedBody)
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

func TestDoResponseUsesSafeMessageForBusinessErrorCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				TaskIDPath:          "task_id",
				StatusPath:          "status",
				ErrorPath:           "message",
				ErrorCodePath:       "code",
				ErrorMessageMap:     map[string]string{"-2000": "请求参数非法，请检查后重试。"},
				DefaultErrorMessage: "请求处理失败，请稍后重试。",
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(
			`{"code":-2000,"message":"private provider rejection detail","data":null}`,
		)),
	}

	taskID, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Empty(t, taskID)
	assert.Equal(t, "upstream_task_failed", taskErr.Code)
	assert.Equal(t, "请求参数非法，请检查后重试。", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private provider rejection detail")
	require.NotNil(t, info.TaskUpstreamDiagnostics)
	assert.Equal(t, "-2000", info.TaskUpstreamDiagnostics.UpstreamStatus)
	assert.Equal(t, "FAILURE", info.TaskUpstreamDiagnostics.MappedStatus)
	assert.False(t, info.TaskUpstreamDiagnostics.ErrorPathMatched)
}

func TestDoResponseUsesDefaultSafeMessageForUnknownBusinessErrorCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				TaskIDPath:          "task_id",
				ErrorPath:           "message",
				ErrorCodePath:       "code",
				ErrorMessageMap:     map[string]string{"-2000": "请求参数非法。"},
				DefaultErrorMessage: "请求处理失败，请稍后重试。",
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(
			`{"code":-2999,"message":"private unknown provider detail","data":null}`,
		)),
	}

	_, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, "请求处理失败，请稍后重试。", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private unknown provider detail")
}

func TestDoResponseAcceptsSuccessWithoutBusinessErrorCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	info := &relaycommon.RelayInfo{
		TaskRelayInfo:   &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
		OriginModelName: "video-model",
	}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				TaskIDPath:          "task_id",
				StatusPath:          "status",
				StatusMap:           map[string]string{"submitted": "SUBMITTED"},
				ErrorCodePath:       "code",
				DefaultErrorMessage: "请求处理失败，请稍后重试。",
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"task_id":"upstream-123","status":"submitted"}`)),
	}

	taskID, _, taskErr := adaptor.DoResponse(context, response, info)

	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-123", taskID)
	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestDoResponseScriptMatchesCodeInsidePlainTextBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				Script: `raw_body matches '"code"[[:space:]]*:[[:space:]]*500063' ? {"status":"FAILURE","message":"Content was blocked by policy."} : nil`,
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/plain"}},
		Body: io.NopCloser(strings.NewReader(
			`warn Model "seedance-2.0-mini" does not support multi-shot. { "error": "private prompt detail", "code": 500063 }`,
		)),
	}

	taskID, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Empty(t, taskID)
	assert.Equal(t, "Content was blocked by policy.", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private prompt detail")
}

func TestDoResponseScriptCanExplicitlyReturnSelectedUpstreamMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				Script: `body.code == -2001 ? {"status":"FAILURE","message":type(json_path("message")) == "string" ? string(json_path("message")) : "Request failed."} : nil`,
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"code":-2001,"message":"Provider is temporarily unavailable."}`)),
	}

	_, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, "Provider is temporarily unavailable.", taskErr.Message)
}

func TestDoResponseScriptDoesNotReturnStructuredUpstreamMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				Script: `body.code == -2001 ? {"status":"FAILURE","message":type(json_path("message")) == "string" ? string(json_path("message")) : "Request failed."} : nil`,
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"code":-2001,"message":{"debug":"private detail"}}`)),
	}

	_, _, taskErr := adaptor.DoResponse(context, response, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, "Request failed.", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private detail")
}

func TestDoResponseJavaScriptReadsRowResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	info := &relaycommon.RelayInfo{
		OriginModelName: "video-model",
		TaskRelayInfo:   &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	}
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				Script: `{"task_id":"legacy-task","status":"SUBMITTED"}`,
				ResponseScript: `
					const response = row_response as any
					if (response.status_code !== 202 || response.header["x-provider"] !== "video") {
						return { status: "FAILURE", message: "Unexpected provider response." }
					}
					return { task_id: response.body.data.id, status: "SUBMITTED" }
				`,
			},
		}},
	}
	response := &http.Response{
		StatusCode: http.StatusAccepted,
		Header:     http.Header{"X-Provider": []string{"video"}},
		Body:       io.NopCloser(strings.NewReader(`{"data":{"id":"upstream-123"}}`)),
	}

	taskID, _, taskErr := adaptor.DoResponse(context, response, info)

	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-123", taskID)
	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestMapTaskErrorResponseScriptCanInspectHTTPStatusAndHeader(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				Script: `http_status == 429 && header("X-Error-Class") == "quota" ? {"status":"FAILURE","message":"Service capacity is temporarily unavailable."} : nil`,
			},
		}},
	}
	info := &relaycommon.RelayInfo{}

	taskErr := adaptor.MapTaskErrorResponse(
		nil,
		http.StatusTooManyRequests,
		http.Header{"X-Error-Class": []string{"quota"}},
		[]byte(`private upstream body`),
		info,
	)

	require.NotNil(t, taskErr)
	assert.Equal(t, "Service capacity is temporarily unavailable.", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private upstream body")
}

func TestSubmitRequestScriptTransformsBodyHeadersMethodAndQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodPost, "/v1/videos?client=1", strings.NewReader(`{"prompt":"draw a fox"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Client-Region", "cn")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var parsed map[string]any
	require.NoError(t, common.UnmarshalBodyReusable(context, &parsed))

	adaptor := &TaskAdaptor{
		baseURL:      "https://provider.example",
		apiKey:       "secret",
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{
			UpstreamPath: "/submit",
			Task: &relaykitdto.AdvancedCustomTask{
				SubmitMethod:  "POST",
				RequestMode:   relaykitdto.AdvancedCustomTaskRequestModePassthrough,
				RequestScript: `{"body":{"text":body.prompt,"model":model},"headers":{"X-Region":header("X-Client-Region")},"query":{"mode":"fast"},"method":"PUT"}`,
			},
		},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta:   &relaycommon.ChannelMeta{UpstreamModelName: "provider-video"},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "public-task"},
	}

	bodyReader, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	body, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	assert.JSONEq(t, `{"text":"draw a fox","model":"provider-video"}`, string(body))

	requestURL, err := adaptor.BuildRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://provider.example/submit?mode=fast", requestURL)

	upstreamRequest := httptest.NewRequest(http.MethodPost, requestURL, nil)
	require.NoError(t, adaptor.BuildRequestHeader(context, upstreamRequest, info))
	assert.Equal(t, "cn", upstreamRequest.Header.Get("X-Region"))
	assert.Equal(t, "PUT", adaptor.submitScript.Method)
}

func TestSubmitJavaScriptTransformsHeadersAndBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"prompt":"draw a fox","images":["a","b"]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Key", "client-token")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var parsed map[string]any
	require.NoError(t, common.UnmarshalBodyReusable(context, &parsed))

	adaptor := &TaskAdaptor{
		baseURL:      "https://provider.example",
		apiKey:       "secret",
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{
			UpstreamPath: "/submit",
			Task: &relaykitdto.AdvancedCustomTask{
				SubmitMethod:  "POST",
				RequestMode:   relaykitdto.AdvancedCustomTaskRequestModePassthrough,
				RequestScript: `{"body":{"text":"legacy"}}`,
				HeadersScript: `
					const result: Record<string, string> = {}
					for (const [name, value] of Object.entries(header as Record<string, string>)) {
						if (name === "key") result.Token = value
					}
					return result
				`,
				BodyScript: `
					const images: string[] = Array.isArray((body as any).images) ? (body as any).images : []
					return { text: (body as any).prompt, image_count: images.length }
				`,
			},
		},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta:   &relaycommon.ChannelMeta{UpstreamModelName: "provider-video"},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "public-task"},
	}

	bodyReader, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	body, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	assert.JSONEq(t, `{"text":"draw a fox","image_count":2}`, string(body))

	upstreamRequest := httptest.NewRequest(http.MethodPost, "https://provider.example/submit", nil)
	require.NoError(t, adaptor.BuildRequestHeader(context, upstreamRequest, info))
	assert.Equal(t, "client-token", upstreamRequest.Header.Get("Token"))
}

func TestLegacyPassThroughActionScriptsDoNotOverrideSubmitRequestMapping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"model":"client-video","prompt":"draw a fox"}`))
	request.Header.Set("Authorization", "Bearer client-token")
	request.Header.Set("Content-Type", "application/problem+json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	var parsed map[string]any
	require.NoError(t, common.UnmarshalBodyReusable(context, &parsed))

	adaptor := &TaskAdaptor{
		apiKey:       "provider-secret",
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{
			Auth: &relaykitdto.AdvancedCustomRouteAuth{
				Type:  relaykitdto.AdvancedCustomAuthTypeHeader,
				Name:  "Authorization",
				Value: "Bearer {api_key}",
			},
			Task: &relaykitdto.AdvancedCustomTask{
				RequestMode:   relaykitdto.AdvancedCustomTaskRequestModePassthrough,
				HeadersScript: `return header`,
				BodyScript:    `return body`,
				RequestScript: `{"body":{"text":body.prompt,"model":model}}`,
			},
		},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "provider-video"},
	}

	bodyReader, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	body, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"provider-video","text":"draw a fox"}`, string(body))

	upstreamRequest := httptest.NewRequest(http.MethodPost, "https://provider.example/submit", nil)
	require.NoError(t, adaptor.BuildRequestHeader(context, upstreamRequest, info))
	assert.Equal(t, "Bearer provider-secret", upstreamRequest.Header.Get("Authorization"))
	assert.Equal(t, "application/json", upstreamRequest.Header.Get("Content-Type"))
}

func TestLegacyPassThroughActionScriptsDoNotOverridePollRequestMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "Bearer provider-secret", r.Header.Get("Authorization"))
		assert.Equal(t, "upstream-123", r.URL.Query().Get("task"))
		body, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		assert.Empty(t, body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	route := relaykitdto.AdvancedCustomRoute{
		Auth: &relaykitdto.AdvancedCustomRouteAuth{
			Type:  relaykitdto.AdvancedCustomAuthTypeHeader,
			Name:  "Authorization",
			Value: "Bearer {api_key}",
		},
		Task: &relaykitdto.AdvancedCustomTask{
			Poll: relaykitdto.AdvancedCustomTaskPoll{
				Method:        http.MethodGet,
				UpstreamPath:  "/tasks/{task_id}",
				HeadersScript: `return header`,
				BodyScript:    `return body`,
				RequestScript: `{"query":{"task":task_id}}`,
			},
		},
	}
	adaptor := &TaskAdaptor{}
	response, err := adaptor.FetchTask(server.URL, "provider-secret", map[string]any{
		"task_id":                    "upstream-123",
		"model":                      "video-model",
		"advanced_custom_task_route": &route,
	}, "")
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
}

func TestParseTaskResultResponseUsesPollResponseScript(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		baseURL:      "https://provider.example",
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			Poll: relaykitdto.AdvancedCustomTaskPoll{Response: relaykitdto.AdvancedCustomTaskResponse{
				Script: `body.code == 0 ? {"status":body.state,"progress":body.percent,"result_url":body.output} : {"status":"FAILURE","message":"Polling failed."}`,
			}},
		}},
	}

	result, err := adaptor.ParseTaskResultResponse(
		http.StatusOK,
		http.Header{"X-Provider": []string{"video"}},
		[]byte(`{"code":0,"state":"SUCCESS","percent":0.75,"output":"/video.mp4"}`),
	)

	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusSuccess), result.Status)
	assert.Equal(t, "75%", result.Progress)
	assert.Equal(t, "https://provider.example/video.mp4", result.Url)
}

func TestParseTaskResultResponseUsesJavaScriptRowResponse(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		baseURL:      "https://provider.example",
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			Poll: relaykitdto.AdvancedCustomTaskPoll{Response: relaykitdto.AdvancedCustomTaskResponse{
				ResponseScript: `
					const data = (row_response as any).body.data
					const statuses: Record<string, string> = { done: "SUCCESS", failed: "FAILURE" }
					return {
						status: statuses[data.state],
						progress: data.percent,
						result_url: data.output,
					}
				`,
			}},
		}},
	}

	result, err := adaptor.ParseTaskResultResponse(
		http.StatusOK,
		http.Header{"X-Provider": []string{"video"}},
		[]byte(`{"data":{"state":"done","percent":0.75,"output":"/video.mp4"}}`),
	)

	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusSuccess), result.Status)
	assert.Equal(t, "75%", result.Progress)
	assert.Equal(t, "https://provider.example/video.mp4", result.Url)
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

	taskErr := adaptor.MapTaskErrorResponse(nil, http.StatusBadRequest, nil, body, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Equal(t, "upstream_task_failed", taskErr.Code)
	assert.Equal(t, "invalid prompt", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "must not leak")
	require.NotNil(t, info.TaskUpstreamDiagnostics)
	assert.Equal(t, http.StatusBadRequest, info.TaskUpstreamDiagnostics.HTTPStatus)
}

func TestMapTaskErrorResponseUsesSafeMessageForBusinessErrorCode(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			SubmitResponse: relaykitdto.AdvancedCustomTaskResponse{
				ErrorPath:           "message",
				ErrorCodePath:       "code",
				ErrorMessageMap:     map[string]string{"-2010": "当前服务暂时不可用，请稍后重试。"},
				DefaultErrorMessage: "请求处理失败，请稍后重试。",
			},
		}},
	}
	info := &relaycommon.RelayInfo{}
	body := []byte(`{"code":-2010,"message":"private credential failure detail","data":null}`)

	taskErr := adaptor.MapTaskErrorResponse(nil, http.StatusUnauthorized, nil, body, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusUnauthorized, taskErr.StatusCode)
	assert.Equal(t, "upstream_task_failed", taskErr.Code)
	assert.Equal(t, "当前服务暂时不可用，请稍后重试。", taskErr.Message)
	assert.NotContains(t, taskErr.Message, "private credential failure detail")
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

	taskErr := adaptor.MapTaskErrorResponse(nil, http.StatusBadRequest, nil, body, info)

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

func TestParseTaskResultUsesSafeMessageForBusinessErrorEnvelope(t *testing.T) {
	adaptor := &TaskAdaptor{
		routeMatched: true,
		route: relaykitdto.AdvancedCustomRoute{Task: &relaykitdto.AdvancedCustomTask{
			Poll: relaykitdto.AdvancedCustomTaskPoll{Response: relaykitdto.AdvancedCustomTaskResponse{
				StatusPath:          "status",
				StatusMap:           map[string]string{"running": "IN_PROGRESS", "completed": "SUCCESS"},
				ErrorPath:           "message",
				ErrorCodePath:       "code",
				ErrorMessageMap:     map[string]string{"-2008": "视频生成失败，请调整输入内容后重试。"},
				DefaultErrorMessage: "请求处理失败，请稍后重试。",
			}},
		}},
	}

	result, err := adaptor.ParseTaskResult([]byte(
		`{"code":-2008,"message":"private provider failure reason","data":null}`,
	))

	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusFailure), result.Status)
	assert.Equal(t, "视频生成失败，请调整输入内容后重试。", result.Reason)
	assert.NotContains(t, result.Reason, "private provider failure reason")
}
