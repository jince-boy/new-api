package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/assert"
)

func TestShouldUseResponsesCompatibilityForPlaygroundGPT5(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		IsPlayground:    true,
		OriginModelName: "gpt-5.4-mini",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeOpenAI,
			UpstreamModelName: "gpt-5.4-mini",
		},
	}

	assert.True(t, shouldUseResponsesCompatibility(info, false))
}

func TestShouldUseResponsesCompatibilityDoesNotAffectNormalChatAPI(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		IsPlayground:    false,
		OriginModelName: "gpt-5.4-mini",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeOpenAI,
			UpstreamModelName: "gpt-5.4-mini",
		},
	}

	assert.False(t, shouldUseResponsesCompatibility(info, false))
}

func TestShouldUseResponsesCompatibilityRespectsPassThrough(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		IsPlayground:    true,
		OriginModelName: "gpt-5.4-mini",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeOpenAI,
			UpstreamModelName: "gpt-5.4-mini",
		},
	}

	assert.False(t, shouldUseResponsesCompatibility(info, true))
}
