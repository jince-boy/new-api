package routeexpr

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunReturnsConfiguredObjectForMatchingResponse(t *testing.T) {
	source := `raw_body contains "500063" ? {"status": "FAILURE", "message": "blocked"} : nil`
	output, err := Run(source, map[string]any{
		"body":              map[string]any{},
		"original_body":     map[string]any{},
		"raw_body":          `warn {"code":500063}`,
		"original_raw_body": "",
		"headers":           map[string]string{},
		"query":             map[string]string{},
		"http_status":       200,
		"method":            "POST",
		"path":              "/v1/videos",
		"model":             "video-model",
		"task_id":           "",
		"public_task_id":    "public-task",
		"json_path":         func(string) any { return nil },
		"has_json_path":     func(string) bool { return false },
		"header":            func(string) string { return "" },
		"query_value":       func(string) string { return "" },
	})

	require.NoError(t, err)
	assert.Equal(t, map[string]any{"status": "FAILURE", "message": "blocked"}, output)
}

func TestValidateRejectsUnboundedOrOversizedExpressions(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   string
	}{
		{name: "range", source: `1..100`, want: "range operator is not allowed"},
		{name: "repeat", source: `repeat("x", 100)`, want: "unknown name repeat"},
		{name: "oversized", source: strings.Repeat("x", MaxSourceLength+1), want: "exceeds"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.source)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.want)
		})
	}
}
