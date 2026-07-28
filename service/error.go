package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
)

func MidjourneyErrorWrapper(code int, desc string) *taskdto.MidjourneyResponse {
	return &taskdto.MidjourneyResponse{
		Code:        code,
		Description: desc,
	}
}

func MidjourneyErrorWithStatusCodeWrapper(code int, desc string, statusCode int) *taskdto.MidjourneyResponseWithStatusCode {
	return &taskdto.MidjourneyResponseWithStatusCode{
		StatusCode: statusCode,
		Response:   *MidjourneyErrorWrapper(code, desc),
	}
}

//// OpenAIErrorWrapper wraps an error into an OpenAIErrorWithStatusCode
//func OpenAIErrorWrapper(err error, code string, statusCode int) *dto.OpenAIErrorWithStatusCode {
//	text := err.Error()
//	lowerText := strings.ToLower(text)
//	if !strings.HasPrefix(lowerText, "get file base64 from url") && !strings.HasPrefix(lowerText, "mime type is not supported") {
//		if strings.Contains(lowerText, "post") || strings.Contains(lowerText, "dial") || strings.Contains(lowerText, "http") {
//			common.SysLog(fmt.Sprintf("error: %s", text))
//			text = "请求上游地址失败"
//		}
//	}
//	openAIError := dto.OpenAIError{
//		Message: text,
//		Type:    "new_api_error",
//		Code:    code,
//	}
//	return &dto.OpenAIErrorWithStatusCode{
//		Error:      openAIError,
//		StatusCode: statusCode,
//	}
//}
//
//func OpenAIErrorWrapperLocal(err error, code string, statusCode int) *dto.OpenAIErrorWithStatusCode {
//	openaiErr := OpenAIErrorWrapper(err, code, statusCode)
//	openaiErr.LocalError = true
//	return openaiErr
//}

func ClaudeErrorWrapper(err error, code string, statusCode int) *dto.ClaudeErrorWithStatusCode {
	text := err.Error()
	lowerText := strings.ToLower(text)
	if !strings.HasPrefix(lowerText, "get file base64 from url") {
		if strings.Contains(lowerText, "post") || strings.Contains(lowerText, "dial") || strings.Contains(lowerText, "http") {
			common.SysLog(fmt.Sprintf("error: %s", text))
			text = "请求上游地址失败"
		}
	}
	claudeError := types.ClaudeError{
		Message: text,
		Type:    "new_api_error",
	}
	return &dto.ClaudeErrorWithStatusCode{
		Error:      claudeError,
		StatusCode: statusCode,
	}
}

func ClaudeErrorWrapperLocal(err error, code string, statusCode int) *dto.ClaudeErrorWithStatusCode {
	claudeErr := ClaudeErrorWrapper(err, code, statusCode)
	claudeErr.LocalError = true
	return claudeErr
}

func RelayErrorHandler(ctx context.Context, resp *http.Response, showBodyWhenFail bool) (newApiErr *types.NewAPIError) {
	newApiErr = types.InitOpenAIError(types.ErrorCodeBadResponseStatusCode, resp.StatusCode)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}
	CloseResponseBodyGracefully(resp)
	var errResponse dto.GeneralErrorResponse
	responseBodyText := string(responseBody)
	responseBodyPreview := common.LocalLogPreview(responseBodyText)
	buildErrWithBody := func(message string) error {
		if message == "" {
			return fmt.Errorf("bad response status code %d, body: %s", resp.StatusCode, responseBodyText)
		}
		return fmt.Errorf("bad response status code %d, message: %s, body: %s", resp.StatusCode, message, responseBodyText)
	}

	err = common.Unmarshal(responseBody, &errResponse)
	if err != nil {
		if showBodyWhenFail {
			newApiErr.Err = buildErrWithBody("")
			newApiErr.RelayError = types.OpenAIError{
				Message: newApiErr.Error(),
				Type:    string(types.ErrorCodeBadResponseStatusCode),
				Code:    types.ErrorCodeBadResponseStatusCode,
			}
		} else {
			logger.LogError(ctx, fmt.Sprintf("bad response status code %d, body: %s", resp.StatusCode, responseBodyPreview))
			newApiErr.Err = fmt.Errorf("bad response status code %d", resp.StatusCode)
		}
		return
	}

	if common.GetJsonType(errResponse.Error) == "object" {
		// General format error (OpenAI, Anthropic, Gemini, etc.)
		oaiError := errResponse.TryToOpenAIError()
		if oaiError != nil {
			newApiErr = types.WithOpenAIError(*oaiError, resp.StatusCode)
			if showBodyWhenFail {
				newApiErr.Err = buildErrWithBody(newApiErr.Error())
			}
			return
		}
	}
	message := errResponse.ToMessage()
	if message == "" {
		// The body parsed as JSON but carried no usable error message; log the
		// raw body so the upstream failure remains diagnosable.
		logger.LogError(ctx, fmt.Sprintf("bad response status code %d with empty error message, body: %s", resp.StatusCode, responseBodyPreview))
	}
	newApiErr = types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponseStatusCode, resp.StatusCode)
	if showBodyWhenFail {
		newApiErr.Err = buildErrWithBody(newApiErr.Error())
	}
	return
}

func ResetStatusCode(newApiErr *types.NewAPIError, statusCodeMappingStr string) {
	if newApiErr == nil {
		return
	}
	if statusCodeMappingStr == "" || statusCodeMappingStr == "{}" {
		return
	}
	statusCodeMapping := make(map[string]any)
	err := common.Unmarshal([]byte(statusCodeMappingStr), &statusCodeMapping)
	if err != nil {
		return
	}
	if newApiErr.StatusCode == http.StatusOK {
		return
	}
	codeStr := strconv.Itoa(newApiErr.StatusCode)
	if value, ok := statusCodeMapping[codeStr]; ok {
		intCode, ok := parseStatusCodeMappingValue(value)
		if !ok {
			return
		}
		newApiErr.StatusCode = intCode
	}
}

type errorResponseMappingRule struct {
	StatusCode       int
	Message          string
	Type             string
	Code             any
	MessageContains  []string
	HasCode          bool
	HasResponseField bool
}

func ApplyStatusCodeAndErrorResponseMapping(newApiErr *types.NewAPIError, statusCodeMappingStr string, errorResponseMappingStr string) {
	if newApiErr == nil {
		return
	}
	originalStatusCode := newApiErr.StatusCode
	ResetStatusCode(newApiErr, statusCodeMappingStr)
	ApplyErrorResponseMapping(newApiErr, errorResponseMappingStr, originalStatusCode)
}

func ApplyErrorResponseMapping(newApiErr *types.NewAPIError, errorResponseMappingStr string, originalStatusCode int) {
	if newApiErr == nil {
		return
	}
	if errorResponseMappingStr == "" || errorResponseMappingStr == "{}" {
		return
	}

	mapping := make(map[string]any)
	if err := common.Unmarshal([]byte(errorResponseMappingStr), &mapping); err != nil {
		return
	}

	rule, ok := lookupErrorResponseMappingRule(mapping, originalStatusCode, newApiErr.StatusCode)
	if !ok || !ruleMatchesErrorResponse(rule, newApiErr.Error()) {
		return
	}
	if rule.StatusCode >= http.StatusContinue && rule.StatusCode <= http.StatusNetworkAuthenticationRequired {
		newApiErr.StatusCode = rule.StatusCode
	}
	if rule.HasResponseField {
		var code any
		if rule.HasCode {
			code = rule.Code
		}
		newApiErr.OverrideOpenAIErrorResponse(rule.Message, rule.Type, code)
	}
}

func lookupErrorResponseMappingRule(mapping map[string]any, originalStatusCode int, currentStatusCode int) (errorResponseMappingRule, bool) {
	keys := []string{strconv.Itoa(originalStatusCode)}
	currentKey := strconv.Itoa(currentStatusCode)
	if currentKey != keys[0] {
		keys = append(keys, currentKey)
	}
	keys = append(keys, "*")

	for _, key := range keys {
		rawRule, ok := mapping[key]
		if !ok {
			continue
		}
		rule, ok := parseErrorResponseMappingRule(rawRule)
		if ok {
			return rule, true
		}
	}
	return errorResponseMappingRule{}, false
}

func parseErrorResponseMappingRule(rawRule any) (errorResponseMappingRule, bool) {
	switch value := rawRule.(type) {
	case string:
		if strings.TrimSpace(value) == "" {
			return errorResponseMappingRule{}, false
		}
		return errorResponseMappingRule{
			Message:          value,
			HasResponseField: true,
		}, true
	case map[string]any:
		rule := errorResponseMappingRule{}
		if statusRaw, ok := value["status_code"]; ok {
			statusCode, ok := parseStatusCodeMappingValue(statusRaw)
			if ok {
				rule.StatusCode = statusCode
			}
		} else if statusRaw, ok := value["status"]; ok {
			statusCode, ok := parseStatusCodeMappingValue(statusRaw)
			if ok {
				rule.StatusCode = statusCode
			}
		}
		if message, ok := value["message"].(string); ok {
			rule.Message = message
			rule.HasResponseField = true
		}
		if errorType, ok := value["type"].(string); ok {
			rule.Type = errorType
			rule.HasResponseField = true
		}
		if code, ok := value["code"]; ok {
			rule.Code = code
			rule.HasCode = true
			rule.HasResponseField = true
		}
		rule.MessageContains = parseErrorResponseMappingStringList(value["message_contains"])
		return rule, rule.StatusCode != 0 || rule.HasResponseField
	default:
		return errorResponseMappingRule{}, false
	}
}

func parseErrorResponseMappingStringList(raw any) []string {
	switch value := raw.(type) {
	case string:
		if strings.TrimSpace(value) == "" {
			return nil
		}
		return []string{value}
	case []any:
		result := make([]string, 0, len(value))
		for _, item := range value {
			if str, ok := item.(string); ok && strings.TrimSpace(str) != "" {
				result = append(result, str)
			}
		}
		return result
	default:
		return nil
	}
}

func ruleMatchesErrorResponse(rule errorResponseMappingRule, message string) bool {
	if len(rule.MessageContains) == 0 {
		return true
	}
	lowerMessage := strings.ToLower(message)
	for _, keyword := range rule.MessageContains {
		if strings.Contains(lowerMessage, strings.ToLower(keyword)) {
			return true
		}
	}
	return false
}

func parseStatusCodeMappingValue(value any) (int, bool) {
	switch v := value.(type) {
	case string:
		if v == "" {
			return 0, false
		}
		statusCode, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return statusCode, true
	case float64:
		if v != math.Trunc(v) {
			return 0, false
		}
		return int(v), true
	case int:
		return v, true
	case json.Number:
		statusCode, err := strconv.Atoi(v.String())
		if err != nil {
			return 0, false
		}
		return statusCode, true
	default:
		return 0, false
	}
}

func TaskErrorWrapperLocal(err error, code string, statusCode int) *taskdto.TaskError {
	openaiErr := TaskErrorWrapper(err, code, statusCode)
	openaiErr.LocalError = true
	return openaiErr
}

func TaskErrorWrapper(err error, code string, statusCode int) *taskdto.TaskError {
	text := err.Error()
	lowerText := strings.ToLower(text)
	if strings.Contains(lowerText, "post") || strings.Contains(lowerText, "dial") || strings.Contains(lowerText, "http") {
		common.SysLog(fmt.Sprintf("error: %s", text))
		//text = "请求上游地址失败"
		text = common.MaskSensitiveInfo(text)
	}
	//避免暴露内部错误
	taskError := &taskdto.TaskError{
		Code:       code,
		Message:    text,
		StatusCode: statusCode,
		Error:      err,
	}

	return taskError
}

// TaskErrorFromAPIError 将 PreConsumeBilling 返回的 NewAPIError 转换为 TaskError。
func TaskErrorFromAPIError(apiErr *types.NewAPIError) *taskdto.TaskError {
	if apiErr == nil {
		return nil
	}
	return &taskdto.TaskError{
		Code:       string(apiErr.GetErrorCode()),
		Message:    apiErr.Err.Error(),
		StatusCode: apiErr.StatusCode,
		Error:      apiErr.Err,
	}
}
