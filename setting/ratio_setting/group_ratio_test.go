package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateGroupRatioRejectsInvalidConfigurationWithoutReplacingCurrentRatios(t *testing.T) {
	original := GroupRatio2JSONString()
	require.NoError(t, UpdateGroupRatioByJSONString(`{"codex":1,"claude":2}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateGroupRatioByJSONString(original))
	})

	for name, value := range map[string]string{
		"empty":        `{}`,
		"virtual auto": `{"auto":1}`,
		"negative":     `{"codex":-1}`,
		"blank name":   `{"":1}`,
		"invalid json": `{`,
	} {
		t.Run(name, func(t *testing.T) {
			err := UpdateGroupRatioByJSONString(value)
			require.Error(t, err)
			assert.Equal(t, map[string]float64{"codex": 1, "claude": 2}, GetGroupRatioCopy())
		})
	}
}
