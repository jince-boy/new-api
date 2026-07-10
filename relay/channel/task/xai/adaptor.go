package xai

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	if taskErr := relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionTextGenerate); taskErr != nil {
		return taskErr
	}

	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "get_task_request_failed", http.StatusBadRequest)
	}
	if err := validateMetadataDuration(req); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_seconds", http.StatusBadRequest)
	}

	switch normalizeMode(req) {
	case "extend", "extension", "extend-video", "video-extension":
		info.Action = ActionVideoExtend
	case "edit", "edit-video", "video-edit":
		info.Action = ActionVideoEdit
	case "reference", "reference-to-video":
		info.Action = constant.TaskActionReferenceGenerate
	default:
		if len(normalizedImages(req)) > 0 {
			info.Action = constant.TaskActionGenerate
		} else {
			info.Action = constant.TaskActionTextGenerate
		}
	}
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, _ *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	return map[string]float64{
		"seconds": float64(resolveDurationSeconds(req)),
	}
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	switch currentAction(info) {
	case ActionVideoExtend:
		return fmt.Sprintf("%s%s", a.baseURL, VideoExtensionEndpoint), nil
	case ActionVideoEdit:
		return fmt.Sprintf("%s%s", a.baseURL, VideoEditEndpoint), nil
	default:
		return fmt.Sprintf("%s%s", a.baseURL, TextToVideoEndpoint), nil
	}
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}

	payload, err := buildRequestPayload(req, info)
	if err != nil {
		return nil, errors.Wrap(err, "build xai video request failed")
	}

	data, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	var xResp responseTask
	if err := common.Unmarshal(responseBody, &xResp); err != nil {
		return "", nil, service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
	}

	if xResp.Error != nil && xResp.Error.Message != "" {
		code := xResp.Error.Code
		if code == "" {
			code = "upstream_error"
		}
		return "", nil, service.TaskErrorWrapperLocal(fmt.Errorf("%s", xResp.Error.Message), code, http.StatusBadRequest)
	}

	upstreamID := firstNonEmpty(xResp.RequestID, xResp.ID, xResp.TaskID)
	if upstreamID == "" {
		return "", nil, service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.CreatedAt = time.Now().Unix()
	video.Model = info.OriginModelName
	c.JSON(http.StatusOK, video)

	return upstreamID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}

	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/v1/videos/%s", baseUrl, taskID), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var resTask responseTask
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := &relaycommon.TaskInfo{
		Code:   0,
		TaskID: firstNonEmpty(resTask.RequestID, resTask.ID, resTask.TaskID),
	}

	switch strings.ToLower(strings.TrimSpace(resTask.Status)) {
	case "queued", "pending", "submitted":
		taskResult.Status = model.TaskStatusQueued
		taskResult.Progress = taskcommon.ProgressQueued
	case "generating", "processing", "in_progress", "running":
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = taskcommon.ProgressInProgress
	case "done", "completed", "succeeded", "success":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Progress = taskcommon.ProgressComplete
		taskResult.Url = extractVideoURL(resTask)
	case "failed", "error", "cancelled", "canceled", "expired":
		taskResult.Status = model.TaskStatusFailure
		taskResult.Progress = taskcommon.ProgressComplete
		taskResult.Reason = xaiFailureReason(resTask)
	default:
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = taskcommon.ProgressInProgress
	}

	if resTask.Progress > 0 && resTask.Progress < 100 {
		taskResult.Progress = fmt.Sprintf("%d%%", resTask.Progress)
	}

	return taskResult, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var xResp responseTask
	if err := common.Unmarshal(originTask.Data, &xResp); err != nil {
		return nil, errors.Wrap(err, "unmarshal xai task data failed")
	}

	openAIVideo := dto.NewOpenAIVideo()
	openAIVideo.ID = originTask.TaskID
	openAIVideo.TaskID = originTask.TaskID
	openAIVideo.Status = originTask.Status.ToVideoStatus()
	openAIVideo.SetProgressStr(originTask.Progress)
	openAIVideo.CreatedAt = originTask.CreatedAt
	openAIVideo.CompletedAt = originTask.FinishTime
	if openAIVideo.CompletedAt == 0 {
		openAIVideo.CompletedAt = originTask.UpdatedAt
	}
	openAIVideo.Model = firstNonEmpty(originTask.Properties.OriginModelName, xResp.Model)
	if url := firstNonEmpty(originTask.GetResultURL(), extractVideoURL(xResp)); url != "" {
		openAIVideo.SetMetadata("url", url)
	}
	if originTask.Status == model.TaskStatusFailure {
		openAIVideo.Error = &dto.OpenAIVideoError{
			Message: xaiFailureReason(xResp),
			Code:    firstNonEmpty(errorCode(xResp), strings.ToLower(xResp.Status)),
		}
	}

	return common.Marshal(openAIVideo)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func buildRequestPayload(req relaycommon.TaskSubmitReq, info *relaycommon.RelayInfo) (map[string]any, error) {
	payload := copyMetadata(req.Metadata)
	delete(payload, "model")
	delete(payload, "prompt")

	modelName := firstNonEmpty(upstreamModelName(info), req.Model, "grok-imagine-video")
	payload["model"] = modelName
	payload["prompt"] = req.Prompt

	payload["duration"] = resolveDurationSeconds(req)

	aspectRatio, resolution := parseVideoSize(req.Size)
	if _, ok := payload["aspect_ratio"]; !ok && aspectRatio != "" {
		payload["aspect_ratio"] = aspectRatio
	}
	if _, ok := payload["resolution"]; !ok && resolution != "" {
		payload["resolution"] = resolution
	}

	images := normalizedImages(req)
	switch currentAction(info) {
	case ActionVideoExtend, ActionVideoEdit:
		if len(images) > 0 {
			setDefaultMedia(payload, "video", images[0])
		}
	default:
		if len(images) > 1 || currentAction(info) == constant.TaskActionReferenceGenerate {
			refs := make([]mediaObject, 0, len(images))
			for _, image := range images {
				if media := mediaObjectFromString(image); media != nil {
					refs = append(refs, *media)
				}
			}
			if len(refs) > 0 {
				payload["reference_images"] = refs
			}
		} else if len(images) == 1 {
			setDefaultMedia(payload, "image", images[0])
		}
	}

	return payload, nil
}

func currentAction(info *relaycommon.RelayInfo) string {
	if info == nil || info.TaskRelayInfo == nil {
		return ""
	}
	return info.TaskRelayInfo.Action
}

func upstreamModelName(info *relaycommon.RelayInfo) string {
	if info == nil || info.ChannelMeta == nil {
		return ""
	}
	return info.ChannelMeta.UpstreamModelName
}

func setDefaultMedia(payload map[string]any, key string, raw string) {
	if _, ok := payload[key]; ok {
		return
	}
	if media := mediaObjectFromString(raw); media != nil {
		payload[key] = media
	}
}

func mediaObjectFromString(raw string) *mediaObject {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if strings.HasPrefix(raw, "file-") || strings.HasPrefix(raw, "file_") {
		return &mediaObject{FileID: raw}
	}
	return &mediaObject{URL: raw}
}

func normalizedImages(req relaycommon.TaskSubmitReq) []string {
	seen := map[string]struct{}{}
	images := make([]string, 0, len(req.Images)+2)
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		images = append(images, value)
	}

	add(req.Image)
	add(req.InputReference)
	for _, image := range req.Images {
		add(image)
	}
	return images
}

func normalizeMode(req relaycommon.TaskSubmitReq) string {
	mode := strings.TrimSpace(req.Mode)
	if mode == "" && req.Metadata != nil {
		if value, ok := req.Metadata["mode"].(string); ok {
			mode = value
		} else if value, ok := req.Metadata["action"].(string); ok {
			mode = value
		}
	}
	return strings.ToLower(strings.TrimSpace(mode))
}

func copyMetadata(metadata map[string]any) map[string]any {
	if metadata == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(metadata))
	for key, value := range metadata {
		out[key] = value
	}
	return out
}

func resolveDurationSeconds(req relaycommon.TaskSubmitReq) int {
	if req.Duration > 0 {
		return req.Duration
	}
	if seconds, err := strconv.Atoi(req.Seconds); err == nil && seconds > 0 {
		return seconds
	}
	if seconds, ok := metadataDuration(req); ok && seconds > 0 {
		return seconds
	}
	return DefaultVideoSeconds
}

func validateMetadataDuration(req relaycommon.TaskSubmitReq) error {
	seconds, ok := metadataDuration(req)
	if !ok {
		return nil
	}
	if seconds < 0 || seconds > relaycommon.MaxTaskDurationSeconds {
		return fmt.Errorf("seconds must be between 1 and %d", relaycommon.MaxTaskDurationSeconds)
	}
	return nil
}

func metadataDuration(req relaycommon.TaskSubmitReq) (int, bool) {
	if req.Metadata == nil {
		return 0, false
	}
	value, ok := req.Metadata["duration"]
	if !ok {
		value, ok = req.Metadata["seconds"]
	}
	if !ok {
		return 0, false
	}
	switch v := value.(type) {
	case int:
		return v, true
	case float64:
		return int(v), true
	case string:
		seconds, err := strconv.Atoi(v)
		return seconds, err == nil
	default:
		return 0, false
	}
}

func parseVideoSize(size string) (string, string) {
	size = strings.TrimSpace(strings.ToLower(size))
	if size == "" {
		return DefaultVideoAspectRatio, DefaultVideoResolution
	}

	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return size, DefaultVideoResolution
	}

	width, widthErr := strconv.Atoi(parts[0])
	height, heightErr := strconv.Atoi(parts[1])
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 {
		return DefaultVideoAspectRatio, DefaultVideoResolution
	}

	aspectRatio := "1:1"
	switch {
	case width > height:
		aspectRatio = "16:9"
	case height > width:
		aspectRatio = "9:16"
	}

	resolution := DefaultVideoResolution
	if width >= 1080 || height >= 1080 {
		resolution = "1080p"
	}
	return aspectRatio, resolution
}

func extractVideoURL(task responseTask) string {
	return firstNonEmpty(
		task.URL,
		task.VideoURL,
		task.Video.URL,
		task.Result.URL,
		task.Result.VideoURL,
		task.Result.Video.URL,
		firstOutputURL(task.Output),
	)
}

func firstOutputURL(outputs []mediaObject) string {
	for _, output := range outputs {
		if strings.TrimSpace(output.URL) != "" {
			return output.URL
		}
	}
	return ""
}

func xaiFailureReason(task responseTask) string {
	if task.Error != nil && task.Error.Message != "" {
		return task.Error.Message
	}
	if strings.EqualFold(task.Status, "expired") {
		return "task expired"
	}
	if strings.TrimSpace(task.Status) != "" {
		return "task " + task.Status
	}
	return "task failed"
}

func errorCode(task responseTask) string {
	if task.Error == nil {
		return ""
	}
	return task.Error.Code
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
