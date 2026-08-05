package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadFromJsonStringKeepsExistingMapOnParseFailure(t *testing.T) {
	values := NewRWMap[string, int]()
	values.Set("existing", 7)

	err := LoadFromJsonString(values, `{`)
	require.Error(t, err)
	assert.Equal(t, map[string]int{"existing": 7}, values.ReadAll())
}

func TestLoadFromJsonStringWithCallbackKeepsExistingMapOnParseFailure(t *testing.T) {
	values := NewRWMap[string, int]()
	values.Set("existing", 7)
	called := false

	err := LoadFromJsonStringWithCallback(values, `{`, func() { called = true })
	require.Error(t, err)
	assert.False(t, called)
	assert.Equal(t, map[string]int{"existing": 7}, values.ReadAll())
}
