package service

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildVideoWorkerURLEncryptsOriginAndCredentials(t *testing.T) {
	originalURL := system_setting.VideoWorkerUrl
	originalSecret := system_setting.VideoWorkerSecret
	t.Cleanup(func() {
		system_setting.VideoWorkerUrl = originalURL
		system_setting.VideoWorkerSecret = originalSecret
	})
	system_setting.VideoWorkerUrl = "https://video.example.workers.dev/deliver"
	system_setting.VideoWorkerSecret = "0123456789abcdef0123456789abcdef"

	headers := http.Header{}
	headers.Set("Authorization", "Bearer upstream-secret")
	headers.Set("Range", "bytes=0-99")
	now := time.Unix(1_800_000_000, 0)
	nonce := bytes.Repeat([]byte{0x42}, 12)

	workerURL, err := buildVideoWorkerURL(
		"https://cdn.example.com/private/video.mp4?signature=secret",
		headers,
		now,
		bytes.NewReader(nonce),
	)
	require.NoError(t, err)
	assert.NotContains(t, workerURL, "cdn.example.com")
	assert.NotContains(t, workerURL, "upstream-secret")

	parsedURL, err := url.Parse(workerURL)
	require.NoError(t, err)
	tokenBytes, err := base64.RawURLEncoding.DecodeString(parsedURL.Query().Get("token"))
	require.NoError(t, err)
	require.Greater(t, len(tokenBytes), len(nonce))
	assert.Equal(t, nonce, tokenBytes[:len(nonce)])

	key := sha256.Sum256([]byte(system_setting.VideoWorkerSecret))
	block, err := aes.NewCipher(key[:])
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	plaintext, err := gcm.Open(nil, tokenBytes[:gcm.NonceSize()], tokenBytes[gcm.NonceSize():], videoWorkerTokenAAD)
	require.NoError(t, err)

	var payload videoWorkerTokenPayload
	require.NoError(t, common.Unmarshal(plaintext, &payload))
	assert.Equal(t, 1, payload.Version)
	assert.Equal(t, "https://cdn.example.com/private/video.mp4?signature=secret", payload.URL)
	assert.Equal(t, "Bearer upstream-secret", payload.Headers["Authorization"])
	assert.NotContains(t, payload.Headers, "Range")
	assert.Equal(t, now.Add(videoWorkerTokenTTL).Unix(), payload.Expires)
}

func TestBuildVideoWorkerURLRejectsInvalidConfiguration(t *testing.T) {
	originalURL := system_setting.VideoWorkerUrl
	originalSecret := system_setting.VideoWorkerSecret
	t.Cleanup(func() {
		system_setting.VideoWorkerUrl = originalURL
		system_setting.VideoWorkerSecret = originalSecret
	})

	system_setting.VideoWorkerUrl = "file:///tmp/worker"
	system_setting.VideoWorkerSecret = "0123456789abcdef0123456789abcdef"
	_, err := buildVideoWorkerURL("https://cdn.example.com/video.mp4", nil, time.Now(), bytes.NewReader(make([]byte, 12)))
	assert.ErrorContains(t, err, "invalid")

	system_setting.VideoWorkerUrl = "https://video.example.workers.dev"
	system_setting.VideoWorkerSecret = ""
	_, err = buildVideoWorkerURL("https://cdn.example.com/video.mp4", nil, time.Now(), bytes.NewReader(make([]byte, 12)))
	assert.ErrorContains(t, err, "secret")
}
