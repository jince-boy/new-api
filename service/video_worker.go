package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

const videoWorkerTokenTTL = 15 * time.Minute

var videoWorkerTokenAAD = []byte("new-api-video-worker-v1")

type videoWorkerTokenPayload struct {
	Version int               `json:"v"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Expires int64             `json:"exp"`
}

// BuildVideoWorkerURL creates a short-lived authenticated encrypted URL. The
// browser sees only ciphertext; the upstream URL and credentials are decrypted
// inside the Cloudflare Worker and never pass through the gateway response.
func BuildVideoWorkerURL(originURL string, headers http.Header) (string, error) {
	return buildVideoWorkerURL(originURL, headers, time.Now(), rand.Reader)
}

func buildVideoWorkerURL(originURL string, headers http.Header, now time.Time, nonceSource io.Reader) (string, error) {
	workerURL, err := url.Parse(strings.TrimSpace(system_setting.VideoWorkerUrl))
	if err != nil || workerURL.Scheme == "" || workerURL.Host == "" {
		return "", fmt.Errorf("video worker URL is invalid")
	}
	if workerURL.Scheme != "https" && workerURL.Scheme != "http" {
		return "", fmt.Errorf("video worker URL must use http or https")
	}
	secret := strings.TrimSpace(system_setting.VideoWorkerSecret)
	if secret == "" {
		return "", fmt.Errorf("video worker secret is required")
	}

	payload := videoWorkerTokenPayload{
		Version: 1,
		URL:     originURL,
		Headers: videoWorkerForwardHeaders(headers),
		Expires: now.Add(videoWorkerTokenTTL).Unix(),
	}
	plaintext, err := common.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal video worker token: %w", err)
	}

	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", fmt.Errorf("initialize video worker cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("initialize video worker token: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(nonceSource, nonce); err != nil {
		return "", fmt.Errorf("generate video worker nonce: %w", err)
	}
	tokenBytes := append(nonce, gcm.Seal(nil, nonce, plaintext, videoWorkerTokenAAD)...)
	query := workerURL.Query()
	query.Set("token", base64.RawURLEncoding.EncodeToString(tokenBytes))
	workerURL.RawQuery = query.Encode()
	return workerURL.String(), nil
}

func videoWorkerForwardHeaders(headers http.Header) map[string]string {
	forward := make(map[string]string)
	for name, values := range headers {
		canonicalName := http.CanonicalHeaderKey(name)
		switch canonicalName {
		case "", "Host", "Connection", "Content-Length", "Transfer-Encoding", "Range", "If-Range":
			continue
		}
		if len(values) > 0 {
			forward[canonicalName] = values[0]
		}
	}
	if len(forward) == 0 {
		return nil
	}
	return forward
}
