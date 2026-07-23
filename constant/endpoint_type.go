package constant

type EndpointType string

const (
	EndpointTypeOpenAI                EndpointType = "openai"
	EndpointTypeOpenAICompletions     EndpointType = "openai-completions"
	EndpointTypeOpenAIResponse        EndpointType = "openai-response"
	EndpointTypeOpenAIResponseCompact EndpointType = "openai-response-compact"
	EndpointTypeAnthropic             EndpointType = "anthropic"
	EndpointTypeGemini                EndpointType = "gemini"
	EndpointTypeJinaRerank            EndpointType = "jina-rerank"
	EndpointTypeImageGeneration       EndpointType = "image-generation"
	EndpointTypeImageEdits            EndpointType = "image-edits"
	EndpointTypeEmbeddings            EndpointType = "embeddings"
	EndpointTypeAudioSpeech           EndpointType = "audio-speech"
	EndpointTypeAudioTranscriptions   EndpointType = "audio-transcriptions"
	EndpointTypeAudioTranslations     EndpointType = "audio-translations"
	EndpointTypeModerations           EndpointType = "moderations"
	EndpointTypeRealtime              EndpointType = "realtime"
	EndpointTypeOpenAIVideo           EndpointType = "openai-video"
	//EndpointTypeMidjourney     EndpointType = "midjourney-proxy"
	//EndpointTypeSuno           EndpointType = "suno-proxy"
	//EndpointTypeKling          EndpointType = "kling"
	//EndpointTypeJimeng         EndpointType = "jimeng"
)
