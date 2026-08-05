package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateTopupGroupRatioRejectsInvalidValuesWithoutReplacingCurrentRatios(t *testing.T) {
	original := TopupGroupRatio2JSONString()
	require.NoError(t, UpdateTopupGroupRatioByJSONString(`{"default":1,"vip":1.2}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateTopupGroupRatioByJSONString(original))
	})

	for name, value := range map[string]string{
		"zero":         `{"default":0}`,
		"negative":     `{"default":-1}`,
		"invalid json": `{`,
	} {
		t.Run(name, func(t *testing.T) {
			err := UpdateTopupGroupRatioByJSONString(value)
			require.Error(t, err)
			assert.Equal(t, 1.0, GetTopupGroupRatio("default"))
			assert.Equal(t, 1.2, GetTopupGroupRatio("vip"))
		})
	}
}
