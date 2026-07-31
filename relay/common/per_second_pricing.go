/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package common

import (
	"fmt"
	"net/url"
	"strings"

	rootcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// ResolvePerSecondUnitPrice applies the first matching conditional price rule.
// Rules read fields from the original JSON, URL-encoded, or multipart request
// without changing the body sent upstream, then fall back to the normalized
// task request for protocol aliases.
func ResolvePerSecondUnitPrice(c *gin.Context, modelName string, defaultPrice float64) (float64, string, bool, error) {
	rules := billing_setting.GetPerSecondRules(modelName)
	if len(rules) == 0 {
		return defaultPrice, "", false, nil
	}

	var rawBody []byte
	if storage, err := rootcommon.GetBodyStorage(c); err == nil {
		rawBody, _ = storage.Bytes()
	}
	jsonBody := gjson.ValidBytes(rawBody)

	var formValues url.Values
	contentType := strings.ToLower(c.GetHeader("Content-Type"))
	switch {
	case strings.Contains(contentType, "multipart/form-data"):
		form, err := rootcommon.ParseMultipartFormReusable(c)
		if err != nil {
			return 0, "", true, fmt.Errorf("parse multipart per-second pricing fields: %w", err)
		}
		defer form.RemoveAll()
		formValues = url.Values(form.Value)
		for field, files := range form.File {
			if _, exists := formValues[field]; exists {
				continue
			}
			for _, file := range files {
				formValues[field] = append(formValues[field], file.Filename)
			}
		}
	case strings.Contains(contentType, "application/x-www-form-urlencoded"):
		values, err := url.ParseQuery(string(rawBody))
		if err != nil {
			return 0, "", true, fmt.Errorf("parse form per-second pricing fields: %w", err)
		}
		formValues = values
	}

	var normalizedBody []byte
	if request, err := GetTaskRequest(c); err == nil {
		normalizedBody, _ = rootcommon.Marshal(request)
	}

	price, ruleName, matched, err := billing_setting.MatchPerSecondRule(rules, func(path string) (any, bool) {
		for _, candidate := range perSecondRuleCandidatePaths(path) {
			if jsonBody {
				if result := gjson.GetBytes(rawBody, candidate); result.Exists() {
					return result.Value(), true
				}
			}
			if value, exists := perSecondFormValue(formValues, candidate); exists {
				return value, true
			}
			if result := gjson.GetBytes(normalizedBody, candidate); result.Exists() {
				return result.Value(), true
			}
		}
		return nil, false
	})
	if err != nil {
		return 0, "", true, err
	}
	if !matched {
		return defaultPrice, "", true, nil
	}
	return price, ruleName, true, nil
}

func perSecondFormValue(values url.Values, path string) (any, bool) {
	if len(values) == 0 {
		return nil, false
	}
	if fieldValues, exists := values[path]; exists && len(fieldValues) > 0 {
		return fieldValues[0], true
	}

	root, nestedPath, nested := strings.Cut(path, ".")
	if !nested {
		return nil, false
	}
	for _, value := range values[root] {
		if result := gjson.Get(value, nestedPath); result.Exists() {
			return result.Value(), true
		}
	}
	return nil, false
}

func perSecondRuleCandidatePaths(path string) []string {
	path = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(path), "request."))
	switch strings.ToLower(path) {
	case "resolution":
		return []string{"resolution_name", "resolution", "metadata.resolution_name", "metadata.resolution", "size", "metadata.size"}
	case "quality":
		return []string{"quality", "metadata.quality"}
	case "mode":
		return []string{"mode", "metadata.mode"}
	default:
		return []string{path}
	}
}
