package advancedcustom

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaykitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/routeexpr"
	"github.com/tidwall/gjson"
)

const (
	maxTaskScriptBodyBytes = 16 * 1024 * 1024
	maxTaskScriptMapItems  = 128
)

type taskScriptInput struct {
	Body         []byte
	OriginalBody []byte
	Headers      http.Header
	Query        url.Values
	HTTPStatus   int
	Method       string
	Path         string
	Model        string
	TaskID       string
	PublicTaskID string
}

type taskRequestScriptResult struct {
	Body    []byte
	BodySet bool
	Headers map[string]*string
	Query   map[string]*string
	Method  string
}

type taskResponseScriptResult struct {
	TaskID         string
	UpstreamStatus string
	Status         string
	Message        string
	Progress       string
	ResultURL      string
}

func runTaskRequestScript(source string, input taskScriptInput) (taskRequestScriptResult, error) {
	if strings.TrimSpace(source) == "" {
		return taskRequestScriptResult{}, nil
	}
	output, err := routeexpr.Run(source, newTaskScriptEnvironment(input))
	if err != nil {
		return taskRequestScriptResult{}, err
	}
	if output == nil {
		return taskRequestScriptResult{}, nil
	}
	object, ok := output.(map[string]any)
	if !ok {
		return taskRequestScriptResult{}, fmt.Errorf("request script must return an object or nil, got %T", output)
	}

	result := taskRequestScriptResult{}
	for key := range object {
		switch key {
		case "body", "raw_body", "headers", "query", "method":
		default:
			return taskRequestScriptResult{}, fmt.Errorf("request script returned unsupported field %q", key)
		}
	}
	bodyValue, hasBody := object["body"]
	rawBodyValue, hasRawBody := object["raw_body"]
	if hasBody && hasRawBody {
		return taskRequestScriptResult{}, fmt.Errorf("request script cannot return both body and raw_body")
	}
	if hasBody {
		result.Body, err = common.Marshal(bodyValue)
		if err != nil {
			return taskRequestScriptResult{}, fmt.Errorf("encode request script body: %w", err)
		}
		result.BodySet = true
	}
	if hasRawBody {
		rawBody, ok := rawBodyValue.(string)
		if !ok {
			return taskRequestScriptResult{}, fmt.Errorf("request script raw_body must be a string")
		}
		result.Body = []byte(rawBody)
		result.BodySet = true
	}
	if result.BodySet && len(result.Body) > maxTaskScriptBodyBytes {
		return taskRequestScriptResult{}, fmt.Errorf("request script body exceeds %d bytes", maxTaskScriptBodyBytes)
	}

	if headersValue, exists := object["headers"]; exists {
		result.Headers, err = taskScriptStringOverrides("headers", headersValue)
		if err != nil {
			return taskRequestScriptResult{}, err
		}
	}
	if queryValue, exists := object["query"]; exists {
		result.Query, err = taskScriptStringOverrides("query", queryValue)
		if err != nil {
			return taskRequestScriptResult{}, err
		}
	}
	if methodValue, exists := object["method"]; exists {
		result.Method, err = taskScriptScalarString("method", methodValue)
		if err != nil {
			return taskRequestScriptResult{}, err
		}
		result.Method = strings.ToUpper(strings.TrimSpace(result.Method))
		if !isAdvancedCustomScriptMethodAllowed(result.Method) {
			return taskRequestScriptResult{}, fmt.Errorf("request script returned invalid method %q", result.Method)
		}
	}
	return result, nil
}

func runTaskResponseScript(source string, input taskScriptInput) (*taskResponseScriptResult, error) {
	if strings.TrimSpace(source) == "" {
		return nil, nil
	}
	output, err := routeexpr.Run(source, newTaskScriptEnvironment(input))
	if err != nil {
		return nil, err
	}
	if output == nil {
		return nil, nil
	}
	object, ok := output.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("response script must return an object or nil, got %T", output)
	}
	result := &taskResponseScriptResult{}
	for key, value := range object {
		var target *string
		switch key {
		case "task_id":
			target = &result.TaskID
		case "upstream_status":
			target = &result.UpstreamStatus
		case "status":
			target = &result.Status
		case "message":
			target = &result.Message
		case "progress":
			target = &result.Progress
		case "result_url":
			target = &result.ResultURL
		default:
			return nil, fmt.Errorf("response script returned unsupported field %q", key)
		}
		*target, err = taskScriptScalarString(key, value)
		if err != nil {
			return nil, err
		}
	}
	if len(object) == 0 {
		return nil, fmt.Errorf("response script returned an empty object; return nil when it does not match")
	}
	if result.Status != "" {
		result.Status = strings.ToUpper(strings.TrimSpace(result.Status))
		if !relaykitdto.IsAdvancedCustomCanonicalTaskStatus(result.Status) {
			return nil, fmt.Errorf("response script returned invalid status %q", result.Status)
		}
	}
	return result, nil
}

func newTaskScriptEnvironment(input taskScriptInput) map[string]any {
	body := decodeTaskScriptBody(input.Body)
	originalBody := decodeTaskScriptBody(input.OriginalBody)
	headers := make(map[string]string, len(input.Headers))
	for name, values := range input.Headers {
		headers[strings.ToLower(name)] = strings.Join(values, ", ")
	}
	query := make(map[string]string, len(input.Query))
	for name, values := range input.Query {
		query[name] = strings.Join(values, ",")
	}
	return map[string]any{
		"body":              body,
		"original_body":     originalBody,
		"raw_body":          string(input.Body),
		"original_raw_body": string(input.OriginalBody),
		"headers":           headers,
		"query":             query,
		"http_status":       input.HTTPStatus,
		"method":            input.Method,
		"path":              input.Path,
		"model":             input.Model,
		"task_id":           input.TaskID,
		"public_task_id":    input.PublicTaskID,
		"json_path": func(path string) any {
			value := gjson.GetBytes(input.Body, path)
			if !value.Exists() {
				return nil
			}
			return value.Value()
		},
		"has_json_path": func(path string) bool {
			return gjson.GetBytes(input.Body, path).Exists()
		},
		"header": func(name string) string {
			return input.Headers.Get(name)
		},
		"query_value": func(name string) string {
			return input.Query.Get(name)
		},
	}
}

func decodeTaskScriptBody(body []byte) any {
	var value any
	if len(body) > 0 && common.Unmarshal(body, &value) == nil {
		return value
	}
	return map[string]any{}
}

func taskScriptStringOverrides(field string, value any) (map[string]*string, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("request script %s must be an object", field)
	}
	if len(object) > maxTaskScriptMapItems {
		return nil, fmt.Errorf("request script %s exceeds %d entries", field, maxTaskScriptMapItems)
	}
	result := make(map[string]*string, len(object))
	for name, item := range object {
		name = strings.TrimSpace(name)
		if name == "" || strings.ContainsAny(name, "\r\n") {
			return nil, fmt.Errorf("request script %s contains an invalid name", field)
		}
		if item == nil {
			result[name] = nil
			continue
		}
		text, err := taskScriptScalarString(field+"."+name, item)
		if err != nil {
			return nil, err
		}
		if strings.ContainsAny(text, "\r\n") {
			return nil, fmt.Errorf("request script %s.%s contains an invalid value", field, name)
		}
		result[name] = &text
	}
	return result, nil
}

func taskScriptScalarString(field string, value any) (string, error) {
	switch typed := value.(type) {
	case string:
		return typed, nil
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), nil
	case int:
		return strconv.Itoa(typed), nil
	case int64:
		return strconv.FormatInt(typed, 10), nil
	case bool:
		return strconv.FormatBool(typed), nil
	default:
		return "", fmt.Errorf("script field %s must be a scalar string, number, or boolean", field)
	}
}

func isAdvancedCustomScriptMethodAllowed(method string) bool {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

func applyTaskScriptHeaderOverrides(header http.Header, overrides map[string]*string) {
	for name, value := range overrides {
		if value == nil {
			header.Del(name)
			continue
		}
		header.Set(name, *value)
	}
}

func applyTaskScriptQueryOverrides(values url.Values, overrides map[string]*string) {
	for name, value := range overrides {
		if value == nil {
			values.Del(name)
			continue
		}
		values.Set(name, *value)
	}
}
