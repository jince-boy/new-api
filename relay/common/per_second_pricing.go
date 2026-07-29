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
	"strings"

	rootcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// ResolvePerSecondUnitPrice applies the first matching conditional price rule.
// Rules read the original JSON body first so advanced-custom pass-through
// fields remain available, then fall back to the normalized task request.
func ResolvePerSecondUnitPrice(c *gin.Context, modelName string, defaultPrice float64) (float64, string, bool, error) {
	rules := billing_setting.GetPerSecondRules(modelName)
	if len(rules) == 0 {
		return defaultPrice, "", false, nil
	}

	var rawBody []byte
	if storage, err := rootcommon.GetBodyStorage(c); err == nil {
		rawBody, _ = storage.Bytes()
	}

	var normalizedBody []byte
	if request, err := GetTaskRequest(c); err == nil {
		normalizedBody, _ = rootcommon.Marshal(request)
	}

	price, ruleName, matched, err := billing_setting.MatchPerSecondRule(rules, func(path string) (any, bool) {
		for _, candidate := range perSecondRuleCandidatePaths(path) {
			if result := gjson.GetBytes(rawBody, candidate); result.Exists() {
				return result.Value(), true
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

func perSecondRuleCandidatePaths(path string) []string {
	path = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(path), "request."))
	switch strings.ToLower(path) {
	case "resolution":
		return []string{"resolution", "size", "metadata.resolution", "metadata.size"}
	case "quality":
		return []string{"quality", "metadata.quality"}
	case "mode":
		return []string{"mode", "metadata.mode"}
	default:
		return []string{path}
	}
}
