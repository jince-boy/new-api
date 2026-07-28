package advancedcustom

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/tidwall/gjson"
)

var advancedCustomTemplatePlaceholder = regexp.MustCompile(`\{(model|request(?:\.[^{}]+)?|response(?:\.[^{}]+)?)\}`)

type advancedCustomTemplateValues struct {
	model        string
	requestBody  []byte
	responseBody []byte
}

func resolveAdvancedCustomTemplate(value any, values advancedCustomTemplateValues) (any, bool) {
	switch typed := value.(type) {
	case map[string]any:
		resolved := make(map[string]any, len(typed))
		for key, item := range typed {
			mapped, keep := resolveAdvancedCustomTemplate(item, values)
			if keep {
				resolved[key] = mapped
			}
		}
		return resolved, true
	case []any:
		resolved := make([]any, 0, len(typed))
		for _, item := range typed {
			mapped, keep := resolveAdvancedCustomTemplate(item, values)
			if keep {
				resolved = append(resolved, mapped)
			}
		}
		return resolved, true
	case string:
		matches := advancedCustomTemplatePlaceholder.FindAllStringSubmatchIndex(typed, -1)
		if len(matches) == 0 {
			return typed, true
		}
		if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(typed) {
			return lookupAdvancedCustomTemplateValue(typed[matches[0][2]:matches[0][3]], values)
		}
		mapped := advancedCustomTemplatePlaceholder.ReplaceAllStringFunc(typed, func(placeholder string) string {
			name := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{"), "}")
			value, ok := lookupAdvancedCustomTemplateValue(name, values)
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

func lookupAdvancedCustomTemplateValue(name string, values advancedCustomTemplateValues) (any, bool) {
	if name == "model" {
		return values.model, values.model != ""
	}
	if name == "request" {
		return decodeAdvancedCustomTemplateJSON(values.requestBody)
	}
	if name == "response" {
		return decodeAdvancedCustomTemplateJSON(values.responseBody)
	}
	if strings.HasPrefix(name, "request.") {
		return lookupAdvancedCustomTemplateJSON(values.requestBody, strings.TrimPrefix(name, "request."))
	}
	if strings.HasPrefix(name, "response.") {
		return lookupAdvancedCustomTemplateJSON(values.responseBody, strings.TrimPrefix(name, "response."))
	}
	return nil, false
}

func decodeAdvancedCustomTemplateJSON(body []byte) (any, bool) {
	if len(body) == 0 {
		return nil, false
	}
	var value any
	if err := common.Unmarshal(body, &value); err != nil {
		return nil, false
	}
	return value, true
}

func lookupAdvancedCustomTemplateJSON(body []byte, path string) (any, bool) {
	if len(body) == 0 {
		return nil, false
	}
	result := gjson.GetBytes(body, path)
	if !result.Exists() {
		return nil, false
	}
	return result.Value(), true
}

func applyAdvancedCustomTemplate(templateBody []byte, values advancedCustomTemplateValues) ([]byte, error) {
	var template any
	if err := common.Unmarshal(templateBody, &template); err != nil {
		return nil, fmt.Errorf("decode JSON template: %w", err)
	}
	resolved, keep := resolveAdvancedCustomTemplate(template, values)
	if !keep {
		return nil, fmt.Errorf("JSON template resolved to an empty value")
	}
	return common.Marshal(resolved)
}
