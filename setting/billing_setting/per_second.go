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
package billing_setting

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const (
	PerSecondOperatorEquals         = "eq"
	PerSecondOperatorNotEquals      = "not_eq"
	PerSecondOperatorContains       = "contains"
	PerSecondOperatorNotContains    = "not_contains"
	PerSecondOperatorExists         = "exists"
	PerSecondOperatorNotExists      = "not_exists"
	PerSecondOperatorGreaterThan    = "gt"
	PerSecondOperatorGreaterOrEqual = "gte"
	PerSecondOperatorLessThan       = "lt"
	PerSecondOperatorLessOrEqual    = "lte"

	maxPerSecondRules          = 100
	maxPerSecondRuleConditions = 16
)

type PerSecondCondition struct {
	Path     string `json:"path"`
	Operator string `json:"operator"`
	Value    string `json:"value,omitempty"`
}

type PerSecondRule struct {
	Name       string               `json:"name"`
	Price      float64              `json:"price"`
	Conditions []PerSecondCondition `json:"conditions"`
}

func GetPerSecondRules(model string) []PerSecondRule {
	rules := billingSetting.PerSecondRules[model]
	if len(rules) == 0 {
		return nil
	}
	result := make([]PerSecondRule, len(rules))
	for index, rule := range rules {
		result[index] = rule
		result[index].Conditions = append([]PerSecondCondition(nil), rule.Conditions...)
	}
	return result
}

func GetPerSecondRulesCopy() map[string][]PerSecondRule {
	result := make(map[string][]PerSecondRule, len(billingSetting.PerSecondRules))
	for model := range billingSetting.PerSecondRules {
		result[model] = GetPerSecondRules(model)
	}
	return result
}

func ValidatePerSecondRules(rules []PerSecondRule) error {
	if len(rules) > maxPerSecondRules {
		return fmt.Errorf("per-second pricing supports at most %d rules", maxPerSecondRules)
	}
	for ruleIndex, rule := range rules {
		if math.IsNaN(rule.Price) || math.IsInf(rule.Price, 0) || rule.Price < 0 {
			return fmt.Errorf("per-second pricing rule %d has an invalid price", ruleIndex+1)
		}
		if len(rule.Conditions) == 0 {
			return fmt.Errorf("per-second pricing rule %d must contain at least one condition", ruleIndex+1)
		}
		if len(rule.Conditions) > maxPerSecondRuleConditions {
			return fmt.Errorf("per-second pricing rule %d supports at most %d conditions", ruleIndex+1, maxPerSecondRuleConditions)
		}
		for conditionIndex, condition := range rule.Conditions {
			if strings.TrimSpace(condition.Path) == "" {
				return fmt.Errorf("per-second pricing rule %d condition %d has no request path", ruleIndex+1, conditionIndex+1)
			}
			switch condition.Operator {
			case PerSecondOperatorEquals,
				PerSecondOperatorNotEquals,
				PerSecondOperatorContains,
				PerSecondOperatorNotContains,
				PerSecondOperatorExists,
				PerSecondOperatorNotExists,
				PerSecondOperatorGreaterThan,
				PerSecondOperatorGreaterOrEqual,
				PerSecondOperatorLessThan,
				PerSecondOperatorLessOrEqual:
			default:
				return fmt.Errorf("per-second pricing rule %d condition %d has an unsupported operator", ruleIndex+1, conditionIndex+1)
			}
		}
	}
	return nil
}

func MatchPerSecondRule(rules []PerSecondRule, lookup func(path string) (any, bool)) (float64, string, bool, error) {
	if err := ValidatePerSecondRules(rules); err != nil {
		return 0, "", false, err
	}
	for ruleIndex, rule := range rules {
		matched := true
		for _, condition := range rule.Conditions {
			actual, exists := lookup(condition.Path)
			if !matchPerSecondCondition(condition, actual, exists) {
				matched = false
				break
			}
		}
		if matched {
			name := strings.TrimSpace(rule.Name)
			if name == "" {
				name = fmt.Sprintf("rule_%d", ruleIndex+1)
			}
			return rule.Price, name, true, nil
		}
	}
	return 0, "", false, nil
}

func matchPerSecondCondition(condition PerSecondCondition, actual any, exists bool) bool {
	switch condition.Operator {
	case PerSecondOperatorExists:
		return exists
	case PerSecondOperatorNotExists:
		return !exists
	}
	if !exists {
		return false
	}

	actualText := strings.TrimSpace(fmt.Sprint(actual))
	expectedText := strings.TrimSpace(condition.Value)
	switch condition.Operator {
	case PerSecondOperatorEquals:
		return strings.EqualFold(actualText, expectedText)
	case PerSecondOperatorNotEquals:
		return !strings.EqualFold(actualText, expectedText)
	case PerSecondOperatorContains:
		return strings.Contains(strings.ToLower(actualText), strings.ToLower(expectedText))
	case PerSecondOperatorNotContains:
		return !strings.Contains(strings.ToLower(actualText), strings.ToLower(expectedText))
	}

	actualNumber, actualErr := strconv.ParseFloat(actualText, 64)
	expectedNumber, expectedErr := strconv.ParseFloat(expectedText, 64)
	if actualErr != nil || expectedErr != nil || math.IsNaN(actualNumber) || math.IsNaN(expectedNumber) || math.IsInf(actualNumber, 0) || math.IsInf(expectedNumber, 0) {
		return false
	}
	switch condition.Operator {
	case PerSecondOperatorGreaterThan:
		return actualNumber > expectedNumber
	case PerSecondOperatorGreaterOrEqual:
		return actualNumber >= expectedNumber
	case PerSecondOperatorLessThan:
		return actualNumber < expectedNumber
	case PerSecondOperatorLessOrEqual:
		return actualNumber <= expectedNumber
	default:
		return false
	}
}
