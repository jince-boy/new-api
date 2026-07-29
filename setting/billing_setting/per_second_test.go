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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMatchPerSecondRuleUsesFirstRuleWhoseConditionsAllMatch(t *testing.T) {
	rules := []PerSecondRule{
		{
			Name:  "720p with audio",
			Price: 0.06,
			Conditions: []PerSecondCondition{
				{Path: "resolution", Operator: PerSecondOperatorEquals, Value: "720p"},
				{Path: "audio", Operator: PerSecondOperatorEquals, Value: "true"},
			},
		},
		{
			Name:       "720p",
			Price:      0.04,
			Conditions: []PerSecondCondition{{Path: "resolution", Operator: PerSecondOperatorEquals, Value: "720p"}},
		},
	}
	values := map[string]any{"resolution": "720P", "audio": true}

	price, name, matched, err := MatchPerSecondRule(rules, func(path string) (any, bool) {
		value, ok := values[path]
		return value, ok
	})

	require.NoError(t, err)
	require.True(t, matched)
	assert.Equal(t, 0.06, price)
	assert.Equal(t, "720p with audio", name)
}

func TestMatchPerSecondRuleSupportsNumericComparisonAndDefaultFallback(t *testing.T) {
	rules := []PerSecondRule{{
		Name:       "high fps",
		Price:      0.08,
		Conditions: []PerSecondCondition{{Path: "fps", Operator: PerSecondOperatorGreaterOrEqual, Value: "60"}},
	}}

	price, _, matched, err := MatchPerSecondRule(rules, func(string) (any, bool) {
		return 30, true
	})

	require.NoError(t, err)
	assert.False(t, matched)
	assert.Zero(t, price)
}

func TestValidatePerSecondRulesRejectsUnsafePrice(t *testing.T) {
	err := ValidatePerSecondRules([]PerSecondRule{{
		Price:      -0.01,
		Conditions: []PerSecondCondition{{Path: "resolution", Operator: PerSecondOperatorEquals, Value: "720p"}},
	}})

	require.ErrorContains(t, err, "invalid price")
}
