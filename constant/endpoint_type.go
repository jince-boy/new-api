package constant

import "github.com/QuantumNous/new-api/relaykit/types"

// EndpointType moved to types with the conversion kit; aliases keep host
// code compiling unchanged.
type EndpointType = types.EndpointType

const (
	EndpointTypeOpenAI                             = types.EndpointTypeOpenAI
	EndpointTypeOpenAICompletions     EndpointType = "openai-completions"
	EndpointTypeOpenAIResponse                     = types.EndpointTypeOpenAIResponse
	EndpointTypeOpenAIResponseCompact              = types.EndpointTypeOpenAIResponseCompact
	EndpointTypeOpenAIAlphaSearch                  = types.EndpointTypeOpenAIAlphaSearch
	EndpointTypeAnthropic                          = types.EndpointTypeAnthropic
	EndpointTypeGemini                             = types.EndpointTypeGemini
	EndpointTypeJinaRerank                         = types.EndpointTypeJinaRerank
	EndpointTypeImageGeneration                    = types.EndpointTypeImageGeneration
	EndpointTypeImageEdits            EndpointType = "image-edits"
	EndpointTypeEmbeddings                         = types.EndpointTypeEmbeddings
	EndpointTypeAudioSpeech           EndpointType = "audio-speech"
	EndpointTypeAudioTranscriptions   EndpointType = "audio-transcriptions"
	EndpointTypeAudioTranslations     EndpointType = "audio-translations"
	EndpointTypeModerations           EndpointType = "moderations"
	EndpointTypeRealtime              EndpointType = "realtime"
	EndpointTypeOpenAIVideo                        = types.EndpointTypeOpenAIVideo
	//EndpointTypeMidjourney     EndpointType = "midjourney-proxy"
	//EndpointTypeSuno           EndpointType = "suno-proxy"
	//EndpointTypeKling          EndpointType = "kling"
	//EndpointTypeJimeng         EndpointType = "jimeng"
)
