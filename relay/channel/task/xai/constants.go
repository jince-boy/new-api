package xai

const (
	ChannelName = "xai"

	TextToVideoEndpoint     = "/v1/videos/generations"
	VideoExtensionEndpoint  = "/v1/videos/extensions"
	VideoEditEndpoint       = "/v1/videos/edits"
	DefaultVideoSeconds     = 6
	DefaultVideoAspectRatio = "9:16"
	DefaultVideoResolution  = "720p"
	ActionVideoExtend       = "extendVideo"
	ActionVideoEdit         = "editVideo"
)

var ModelList = []string{
	"grok-imagine-video",
	"grok-imagine-video-1.5",
	"grok-imagine-video-1.5-preview",
}
