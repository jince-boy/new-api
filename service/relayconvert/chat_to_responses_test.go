package relayconvert

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChatCompletionsRequestToResponsesRequestAddsWebSearchTool(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{
		Model: "gpt-5",
		Messages: []dto.Message{
			{Role: "user", Content: "Find the latest release notes."},
		},
		WebSearchOptions: &dto.WebSearchOptions{
			SearchContextSize: "high",
		},
	}

	got, err := ChatCompletionsRequestToResponsesRequest(req)

	require.NoError(t, err)
	require.NotNil(t, got)
	var tools []map[string]any
	require.NoError(t, common.Unmarshal(got.Tools, &tools))
	require.Len(t, tools, 1)
	assert.Equal(t, dto.BuildInToolWebSearchPreview, tools[0]["type"])
	assert.Equal(t, "high", tools[0]["search_context_size"])
}
