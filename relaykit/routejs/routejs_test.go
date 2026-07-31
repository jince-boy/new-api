package routejs

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunFunctionSupportsTypeScriptControlFlow(t *testing.T) {
	source := `
const result: Record<string, string> = {}
for (const [name, value] of Object.entries(header as Record<string, string>)) {
  if (name.startsWith("x-")) result[name] = value
}
return { ...result, prompt: (body as { prompt: string }).prompt }
`
	output, err := RunFunction(source, map[string]any{
		"header": map[string]any{"x-region": "cn", "accept": "json"},
		"body":   map[string]any{"prompt": "draw a fox"},
	}, "header", "body")

	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"x-region": "cn",
		"prompt":   "draw a fox",
	}, output)
}

func TestRunFunctionInterruptsUnboundedLoop(t *testing.T) {
	_, err := RunFunction(`while (true) {}`, map[string]any{
		"row_response": map[string]any{},
	}, "row_response")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "execution exceeded")
}

func TestValidateFunctionRejectsOversizedSource(t *testing.T) {
	err := ValidateFunction(strings.Repeat("x", MaxSourceLength+1), "body")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds")
}
