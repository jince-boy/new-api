package advancedcustom

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	synccustom "github.com/QuantumNous/new-api/relay/channel/advancedcustom"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relaykitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const ChannelName = "advanced-custom-task"

var taskTemplatePlaceholder = regexp.MustCompile(`\{(model|request(?:\.[^{}]+)?|task_id|public_task_id)\}`)

type TaskAdaptor struct {
	taskcommon.BaseBilling
	config       *relaykitdto.AdvancedCustomConfig
	route        relaykitdto.AdvancedCustomRoute
	routeMatched bool
	baseURL      string
	apiKey       string
	submitScript taskRequestScriptResult
	pollModel    string
	pollTaskID   string
	pollPublicID string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	if info == nil || info.ChannelMeta == nil {
		return
	}
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
	a.config = info.ChannelOtherSettings.AdvancedCustom
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *taskdto.TaskError {
	if a.config == nil {
		return service.TaskErrorWrapperLocal(fmt.Errorf("advanced_custom is required"), "invalid_advanced_custom", http.StatusBadRequest)
	}
	if err := a.config.Validate(); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_advanced_custom", http.StatusBadRequest)
	}
	route, ok := a.config.MatchTaskPathForModel(c.Request.URL.Path, info.OriginModelName)
	if !ok {
		return service.TaskErrorWrapperLocal(
			fmt.Errorf("advanced custom task route does not support request path %s for model %s", c.Request.URL.Path, info.OriginModelName),
			"advanced_custom_task_route_not_found",
			http.StatusBadRequest,
		)
	}
	a.route = route
	a.routeMatched = true
	return relaycommon.ValidateMultipartDirect(c, info)
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if !a.routeMatched {
		return "", fmt.Errorf("advanced custom task route is not resolved")
	}
	requestURL, err := synccustom.BuildTaskRouteURL(a.baseURL, a.route.UpstreamPath, info.UpstreamModelName, "", a.apiKey, a.route.Auth)
	if err != nil || len(a.submitScript.Query) == 0 {
		return requestURL, err
	}
	parsedURL, err := url.Parse(requestURL)
	if err != nil {
		return "", err
	}
	query := parsedURL.Query()
	applyTaskScriptQueryOverrides(query, a.submitScript.Query)
	parsedURL.RawQuery = query.Encode()
	return parsedURL.String(), nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, &req.Header)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if err := synccustom.ApplyTaskRouteHeaders(req.Header, a.route.Headers, a.route.Auth, a.apiKey, info.UpstreamModelName, ""); err != nil {
		return err
	}
	applyTaskScriptHeaderOverrides(req.Header, a.submitScript.Headers)
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	rawBody, err := storage.Bytes()
	if err != nil {
		return nil, err
	}
	originalRawBody := append([]byte(nil), rawBody...)
	publicTaskID := ""
	if info.TaskRelayInfo != nil {
		publicTaskID = info.PublicTaskID
	}
	if strings.Contains(strings.ToLower(c.GetHeader("Content-Type")), "multipart/form-data") {
		taskRequest, taskRequestErr := relaycommon.GetTaskRequest(c)
		if taskRequestErr != nil {
			return nil, taskRequestErr
		}
		rawBody, err = common.Marshal(taskRequest)
		if err != nil {
			return nil, err
		}
	}

	requestMode := strings.ToLower(strings.TrimSpace(a.route.Task.RequestMode))
	if requestMode == "" {
		requestMode = relaykitdto.AdvancedCustomTaskRequestModePassthrough
	}
	if requestMode == relaykitdto.AdvancedCustomTaskRequestModePassthrough {
		var body any
		if err := common.Unmarshal(rawBody, &body); err != nil {
			return nil, fmt.Errorf("decode pass-through request: %w", err)
		}
		if object, ok := body.(map[string]any); ok {
			object["model"] = info.UpstreamModelName
		}
		encoded, err := common.Marshal(body)
		if err != nil {
			return nil, err
		}
		rawBody = encoded
	} else {
		var template any
		if err := common.Unmarshal(a.route.Task.BodyTemplate, &template); err != nil {
			return nil, fmt.Errorf("decode body template: %w", err)
		}
		resolved, keep := resolveTaskTemplate(template, taskTemplateValues{
			model:        info.UpstreamModelName,
			publicTaskID: publicTaskID,
			requestBody:  rawBody,
		})
		if !keep {
			return nil, fmt.Errorf("body template resolved to an empty value")
		}
		rawBody, err = common.Marshal(resolved)
		if err != nil {
			return nil, err
		}
	}
	a.submitScript, err = runTaskRequestScript(a.route.Task.RequestScript, taskScriptInput{
		Body:         rawBody,
		OriginalBody: originalRawBody,
		Headers:      c.Request.Header,
		Query:        c.Request.URL.Query(),
		Method:       a.route.Task.SubmitMethod,
		Path:         c.Request.URL.Path,
		Model:        info.UpstreamModelName,
		PublicTaskID: publicTaskID,
	})
	if err != nil {
		return nil, fmt.Errorf("run submit request script: %w", err)
	}
	if a.submitScript.BodySet {
		rawBody = a.submitScript.Body
	}
	return bytes.NewReader(rawBody), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	method := strings.ToUpper(strings.TrimSpace(a.route.Task.SubmitMethod))
	if a.submitScript.Method != "" {
		method = a.submitScript.Method
	}
	if method == "" {
		method = http.MethodPost
	}
	return channel.DoTaskApiRequestWithMethod(a, c, info, method, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *taskdto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	scriptInput := taskScriptInput{Body: responseBody, Headers: resp.Header, HTTPStatus: resp.StatusCode}
	if info.ChannelMeta != nil {
		scriptInput.Model = info.UpstreamModelName
	}
	if info.TaskRelayInfo != nil {
		scriptInput.PublicTaskID = info.PublicTaskID
	}
	if resp.Request != nil {
		scriptInput.Method = resp.Request.Method
		scriptInput.Path = resp.Request.URL.Path
	}
	inspection, inspectErr := inspectConfiguredTaskResponse(responseBody, scriptInput, a.route.Task.SubmitResponse)
	if inspectErr != nil {
		return "", responseBody, service.TaskErrorWrapper(inspectErr, "invalid_response", http.StatusBadGateway)
	}
	info.TaskUpstreamDiagnostics = &relaycommon.TaskUpstreamDiagnostics{
		HTTPStatus:           resp.StatusCode,
		UpstreamStatus:       inspection.UpstreamStatus,
		MappedStatus:         inspection.Status,
		StatusMappingApplied: inspection.UpstreamStatus != "" && inspection.Status != "",
		ErrorPathMatched:     inspection.ErrorPathMatched,
	}
	if inspection.UpstreamStatus != "" && len(a.route.Task.SubmitResponse.StatusMap) > 0 && inspection.Status == "" && strings.TrimSpace(a.route.Task.SubmitResponse.Script) == "" {
		return "", responseBody, service.TaskErrorWrapper(
			fmt.Errorf("unmapped upstream task status %q at path %s", inspection.UpstreamStatus, a.route.Task.SubmitResponse.StatusPath),
			"invalid_response",
			http.StatusBadGateway,
		)
	}
	if inspection.Status == string(model.TaskStatusFailure) {
		if inspection.ErrorMessage == "" {
			inspection.ErrorMessage = fmt.Sprintf("upstream task submission failed with status %s", inspection.UpstreamStatus)
		}
		return "", responseBody, service.TaskErrorWrapper(
			fmt.Errorf("%s", inspection.ErrorMessage),
			"upstream_task_failed",
			http.StatusBadGateway,
		)
	}

	taskID := inspection.TaskID
	if taskID == "" {
		return "", responseBody, service.TaskErrorWrapper(
			fmt.Errorf("upstream task id is empty at path %s", a.route.Task.SubmitResponse.TaskIDPath),
			"invalid_response",
			http.StatusBadGateway,
		)
	}

	video := relaykitdto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.Model = info.OriginModelName
	video.CreatedAt = time.Now().Unix()
	if inspection.Status != "" {
		video.Status = model.TaskStatus(inspection.Status).ToVideoStatus()
	}
	c.JSON(http.StatusOK, video)
	return taskID, responseBody, nil
}

func (a *TaskAdaptor) MapTaskErrorResponse(c *gin.Context, statusCode int, responseHeader http.Header, responseBody []byte, info *relaycommon.RelayInfo) *taskdto.TaskError {
	scriptInput := taskScriptInput{Body: responseBody, Headers: responseHeader, HTTPStatus: statusCode}
	if info.ChannelMeta != nil {
		scriptInput.Model = info.UpstreamModelName
	}
	if info.TaskRelayInfo != nil {
		scriptInput.PublicTaskID = info.PublicTaskID
	}
	if c != nil && c.Request != nil {
		scriptInput.Method = c.Request.Method
		scriptInput.Path = c.Request.URL.Path
	}
	inspection, err := inspectConfiguredTaskResponse(responseBody, scriptInput, a.route.Task.SubmitResponse)
	if err != nil {
		return service.TaskErrorWrapper(err, "invalid_response", http.StatusBadGateway)
	}
	info.TaskUpstreamDiagnostics = &relaycommon.TaskUpstreamDiagnostics{
		HTTPStatus:           statusCode,
		UpstreamStatus:       inspection.UpstreamStatus,
		MappedStatus:         inspection.Status,
		StatusMappingApplied: inspection.UpstreamStatus != "" && inspection.Status != "",
		ErrorPathMatched:     inspection.ErrorPathMatched,
	}
	if inspection.ErrorMessage == "" {
		inspection.ErrorMessage = fmt.Sprintf("upstream task submission failed with HTTP status %d", statusCode)
	}
	code := "fail_to_fetch_task"
	if inspection.Status == string(model.TaskStatusFailure) {
		code = "upstream_task_failed"
	}
	return service.TaskErrorWrapper(fmt.Errorf("%s", inspection.ErrorMessage), code, statusCode)
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	a.baseURL = baseURL
	a.apiKey = key
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	modelName, _ := body["model"].(string)
	publicTaskID, _ := body["public_task_id"].(string)
	a.pollModel = modelName
	a.pollTaskID = taskID
	a.pollPublicID = publicTaskID

	route, ok := body["advanced_custom_task_route"].(*relaykitdto.AdvancedCustomRoute)
	if !ok || route == nil {
		if routeValue, valueOK := body["advanced_custom_task_route"].(relaykitdto.AdvancedCustomRoute); valueOK {
			route = &routeValue
		}
	}
	if route == nil {
		if a.config == nil {
			return nil, fmt.Errorf("advanced custom task configuration is unavailable")
		}
		matched, matchedOK := a.config.MatchTaskForModel(modelName)
		if !matchedOK {
			return nil, fmt.Errorf("advanced custom task route not found for model %s", modelName)
		}
		route = &matched
	}
	if route.Task == nil {
		return nil, fmt.Errorf("advanced custom route is not an asynchronous task route")
	}
	a.route = *route
	a.routeMatched = true

	poll := route.Task.Poll
	auth := poll.Auth
	if auth == nil {
		auth = route.Auth
	}
	headers := poll.Headers
	if len(headers) == 0 {
		headers = route.Headers
	}
	requestURL, err := synccustom.BuildTaskRouteURL(baseURL, poll.UpstreamPath, modelName, taskID, key, auth)
	if err != nil {
		return nil, err
	}

	var requestBody io.Reader
	var requestBodyBytes []byte
	if len(poll.BodyTemplate) > 0 {
		var template any
		if err := common.Unmarshal(poll.BodyTemplate, &template); err != nil {
			return nil, fmt.Errorf("decode poll body template: %w", err)
		}
		resolved, keep := resolveTaskTemplate(template, taskTemplateValues{model: modelName, taskID: taskID, publicTaskID: publicTaskID})
		if keep {
			encoded, err := common.Marshal(resolved)
			if err != nil {
				return nil, err
			}
			requestBodyBytes = encoded
			requestBody = bytes.NewReader(requestBodyBytes)
		}
	}
	method := strings.ToUpper(strings.TrimSpace(poll.Method))
	if method == "" {
		method = http.MethodGet
	}
	req, err := http.NewRequest(method, requestURL, requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if requestBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if err := synccustom.ApplyTaskRouteHeaders(req.Header, headers, auth, key, modelName, taskID); err != nil {
		return nil, err
	}
	scriptResult, err := runTaskRequestScript(poll.RequestScript, taskScriptInput{
		Body:         requestBodyBytes,
		OriginalBody: requestBodyBytes,
		Headers:      req.Header,
		Query:        req.URL.Query(),
		Method:       method,
		Path:         req.URL.Path,
		Model:        modelName,
		TaskID:       taskID,
		PublicTaskID: publicTaskID,
	})
	if err != nil {
		return nil, fmt.Errorf("run poll request script: %w", err)
	}
	if scriptResult.Method != "" {
		req.Method = scriptResult.Method
	}
	if scriptResult.BodySet {
		req.Body = io.NopCloser(bytes.NewReader(scriptResult.Body))
		req.ContentLength = int64(len(scriptResult.Body))
		if len(scriptResult.Body) == 0 {
			req.Body = http.NoBody
		}
		if req.Header.Get("Content-Type") == "" && len(scriptResult.Body) > 0 {
			req.Header.Set("Content-Type", "application/json")
		}
	}
	applyTaskScriptHeaderOverrides(req.Header, scriptResult.Headers)
	if len(scriptResult.Query) > 0 {
		query := req.URL.Query()
		applyTaskScriptQueryOverrides(query, scriptResult.Query)
		req.URL.RawQuery = query.Encode()
	}
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(responseBody []byte) (*relaycommon.TaskInfo, error) {
	return a.ParseTaskResultResponse(0, nil, responseBody)
}

func (a *TaskAdaptor) ParseTaskResultResponse(statusCode int, responseHeader http.Header, responseBody []byte) (*relaycommon.TaskInfo, error) {
	if !a.routeMatched || a.route.Task == nil {
		return nil, fmt.Errorf("advanced custom task route is not resolved")
	}
	mapping := a.route.Task.Poll.Response
	inspection, err := inspectConfiguredTaskResponse(responseBody, taskScriptInput{
		Body:         responseBody,
		Headers:      responseHeader,
		HTTPStatus:   statusCode,
		Model:        a.pollModel,
		TaskID:       a.pollTaskID,
		PublicTaskID: a.pollPublicID,
	}, mapping)
	if err != nil {
		return nil, err
	}
	if inspection.Status == "" {
		return nil, fmt.Errorf("unmapped upstream task status %q at path %s", inspection.UpstreamStatus, mapping.StatusPath)
	}

	result := &relaycommon.TaskInfo{
		Status:   inspection.Status,
		Progress: inspection.Progress,
		Reason:   inspection.ErrorMessage,
	}
	if inspection.Status == string(model.TaskStatusFailure) && result.Reason == "" {
		result.Reason = fmt.Sprintf("upstream task failed with status %s", inspection.UpstreamStatus)
	}
	if inspection.Status == string(model.TaskStatusSuccess) {
		result.Url = inspection.ResultURL
		if result.Url == "" {
			return nil, fmt.Errorf("successful task response has no result URL at path %s", mapping.ResultURLPath)
		}
		if strings.HasPrefix(result.Url, "/") {
			resolvedURL, err := synccustom.BuildTaskRouteURL(a.baseURL, result.Url, "", "", "", nil)
			if err != nil {
				return nil, fmt.Errorf("resolve relative task result URL: %w", err)
			}
			result.Url = resolvedURL
		}
	}
	return result, nil
}

type configuredTaskResponseInspection struct {
	TaskID           string
	UpstreamStatus   string
	Status           string
	ErrorMessage     string
	Progress         string
	ResultURL        string
	ErrorPathMatched bool
}

func inspectConfiguredTaskResponse(responseBody []byte, scriptInput taskScriptInput, mapping relaykitdto.AdvancedCustomTaskResponse) (configuredTaskResponseInspection, error) {
	inspection := inspectLegacyConfiguredTaskResponse(responseBody, mapping)
	scriptInput.Body = responseBody
	scriptResult, err := runTaskResponseScript(mapping.Script, scriptInput)
	if err != nil {
		return configuredTaskResponseInspection{}, fmt.Errorf("run response script: %w", err)
	}
	if scriptResult == nil {
		return inspection, nil
	}
	if scriptResult.TaskID != "" {
		inspection.TaskID = strings.TrimSpace(scriptResult.TaskID)
	}
	if scriptResult.UpstreamStatus != "" {
		inspection.UpstreamStatus = strings.TrimSpace(scriptResult.UpstreamStatus)
	}
	if scriptResult.Status != "" {
		inspection.Status = scriptResult.Status
		if inspection.UpstreamStatus == "" {
			inspection.UpstreamStatus = scriptResult.Status
		}
	}
	if scriptResult.Message != "" {
		inspection.ErrorMessage = strings.TrimSpace(scriptResult.Message)
	}
	if scriptResult.Progress != "" {
		inspection.Progress = normalizeTaskProgress(gjson.Result{Type: gjson.String, Str: scriptResult.Progress})
	}
	if scriptResult.ResultURL != "" {
		inspection.ResultURL = strings.TrimSpace(scriptResult.ResultURL)
	}
	return inspection, nil
}

func inspectLegacyConfiguredTaskResponse(responseBody []byte, mapping relaykitdto.AdvancedCustomTaskResponse) configuredTaskResponseInspection {
	inspection := configuredTaskResponseInspection{
		TaskID:    extractTaskString(responseBody, mapping.TaskIDPath),
		Progress:  normalizeTaskProgress(gjson.GetBytes(responseBody, mapping.ProgressPath)),
		ResultURL: extractTaskString(responseBody, mapping.ResultURLPath),
	}
	errorCode := extractTaskString(responseBody, mapping.ErrorCodePath)
	if errorCode != "" && (len(mapping.ErrorMessageMap) > 0 || strings.TrimSpace(mapping.DefaultErrorMessage) != "") {
		errorMessage := mapConfiguredTaskErrorMessage(errorCode, mapping.ErrorMessageMap)
		if errorMessage == "" {
			errorMessage = strings.TrimSpace(mapping.DefaultErrorMessage)
		}
		if errorMessage == "" {
			errorMessage = "upstream task failed"
		}
		inspection.UpstreamStatus = errorCode
		inspection.Status = string(model.TaskStatusFailure)
		inspection.ErrorMessage = errorMessage
		return inspection
	}

	inspection.UpstreamStatus = extractTaskString(responseBody, mapping.StatusPath)
	inspection.Status = mapConfiguredTaskStatus(inspection.UpstreamStatus, mapping.StatusMap)
	inspection.ErrorMessage = extractTaskString(responseBody, mapping.ErrorPath)
	inspection.ErrorPathMatched = inspection.ErrorMessage != ""
	return inspection
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	video := task.ToOpenAIVideo()
	video.TaskID = task.TaskID
	return common.Marshal(video)
}

func (a *TaskAdaptor) TaskRouteSnapshot() *relaykitdto.AdvancedCustomRoute {
	if !a.routeMatched {
		return nil
	}
	data, err := common.Marshal(a.route)
	if err != nil {
		return nil
	}
	var snapshot relaykitdto.AdvancedCustomRoute
	if err := common.Unmarshal(data, &snapshot); err != nil {
		return nil
	}
	return &snapshot
}

func (a *TaskAdaptor) GetModelList() []string {
	return nil
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

type taskTemplateValues struct {
	model        string
	taskID       string
	publicTaskID string
	requestBody  []byte
}

func resolveTaskTemplate(value any, values taskTemplateValues) (any, bool) {
	switch typed := value.(type) {
	case map[string]any:
		resolved := make(map[string]any, len(typed))
		for key, item := range typed {
			mapped, keep := resolveTaskTemplate(item, values)
			if keep {
				resolved[key] = mapped
			}
		}
		return resolved, true
	case []any:
		resolved := make([]any, 0, len(typed))
		for _, item := range typed {
			mapped, keep := resolveTaskTemplate(item, values)
			if keep {
				resolved = append(resolved, mapped)
			}
		}
		return resolved, true
	case string:
		matches := taskTemplatePlaceholder.FindAllStringSubmatchIndex(typed, -1)
		if len(matches) == 0 {
			return typed, true
		}
		if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(typed) {
			return lookupTaskTemplateValue(typed[matches[0][2]:matches[0][3]], values)
		}
		mapped := taskTemplatePlaceholder.ReplaceAllStringFunc(typed, func(placeholder string) string {
			name := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{"), "}")
			value, ok := lookupTaskTemplateValue(name, values)
			if !ok {
				return ""
			}
			switch scalar := value.(type) {
			case string:
				return scalar
			case float64:
				return strconv.FormatFloat(scalar, 'f', -1, 64)
			case bool:
				return strconv.FormatBool(scalar)
			default:
				encoded, err := common.Marshal(value)
				if err != nil {
					return ""
				}
				return string(encoded)
			}
		})
		return mapped, true
	default:
		return value, true
	}
}

func lookupTaskTemplateValue(name string, values taskTemplateValues) (any, bool) {
	switch name {
	case "model":
		return values.model, values.model != ""
	case "task_id":
		return values.taskID, values.taskID != ""
	case "public_task_id":
		return values.publicTaskID, values.publicTaskID != ""
	case "request":
		if len(values.requestBody) == 0 {
			return nil, false
		}
		var request any
		if err := common.Unmarshal(values.requestBody, &request); err != nil {
			return nil, false
		}
		return request, true
	}
	if strings.HasPrefix(name, "request.") && len(values.requestBody) > 0 {
		result := gjson.GetBytes(values.requestBody, strings.TrimPrefix(name, "request."))
		if result.Exists() {
			return result.Value(), true
		}
	}
	return nil, false
}

func extractTaskString(body []byte, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	result := gjson.GetBytes(body, path)
	if !result.Exists() {
		return ""
	}
	if result.IsArray() || result.IsObject() {
		return ""
	}
	return strings.TrimSpace(result.String())
}

func mapConfiguredTaskStatus(upstream string, statusMap map[string]string) string {
	if mapped, ok := statusMap[upstream]; ok {
		return strings.ToUpper(strings.TrimSpace(mapped))
	}
	for configured, mapped := range statusMap {
		if strings.EqualFold(strings.TrimSpace(configured), strings.TrimSpace(upstream)) {
			return strings.ToUpper(strings.TrimSpace(mapped))
		}
	}
	return ""
}

func mapConfiguredTaskErrorMessage(errorCode string, messageMap map[string]string) string {
	if message, ok := messageMap[errorCode]; ok {
		return strings.TrimSpace(message)
	}
	for configured, message := range messageMap {
		if strings.EqualFold(strings.TrimSpace(configured), strings.TrimSpace(errorCode)) {
			return strings.TrimSpace(message)
		}
	}
	return ""
}

func normalizeTaskProgress(result gjson.Result) string {
	if !result.Exists() {
		return ""
	}
	if result.Type == gjson.Number {
		value := result.Float()
		if value >= 0 && value <= 1 {
			value *= 100
		}
		return fmt.Sprintf("%.0f%%", value)
	}
	value := strings.TrimSpace(result.String())
	if value == "" || strings.HasSuffix(value, "%") {
		return value
	}
	if number, err := strconv.ParseFloat(value, 64); err == nil {
		if number >= 0 && number <= 1 {
			number *= 100
		}
		return fmt.Sprintf("%.0f%%", number)
	}
	return value
}

var _ channel.TaskAdaptor = (*TaskAdaptor)(nil)
var _ channel.OpenAIVideoConverter = (*TaskAdaptor)(nil)
