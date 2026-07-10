package xai

type mediaObject struct {
	URL    string `json:"url,omitempty"`
	FileID string `json:"file_id,omitempty"`
}

type responseError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type responseTask struct {
	ID          string         `json:"id,omitempty"`
	TaskID      string         `json:"task_id,omitempty"`
	RequestID   string         `json:"request_id,omitempty"`
	Object      string         `json:"object,omitempty"`
	Model       string         `json:"model,omitempty"`
	Status      string         `json:"status,omitempty"`
	Progress    int            `json:"progress,omitempty"`
	CreatedAt   int64          `json:"created_at,omitempty"`
	CompletedAt int64          `json:"completed_at,omitempty"`
	ExpiresAt   int64          `json:"expires_at,omitempty"`
	URL         string         `json:"url,omitempty"`
	VideoURL    string         `json:"video_url,omitempty"`
	Video       mediaObject    `json:"video,omitempty"`
	Result      responseResult `json:"result,omitempty"`
	Output      []mediaObject  `json:"output,omitempty"`
	Error       *responseError `json:"error,omitempty"`
}

type responseResult struct {
	URL      string      `json:"url,omitempty"`
	VideoURL string      `json:"video_url,omitempty"`
	Video    mediaObject `json:"video,omitempty"`
}
