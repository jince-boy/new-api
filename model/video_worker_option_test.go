package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVideoWorkerOptionsRequireSecureConfiguration(t *testing.T) {
	assert.Error(t, validateOptionValue("VideoWorkerSecret", "too-short"))
	assert.NoError(t, validateOptionValue("VideoWorkerSecret", "0123456789abcdef0123456789abcdef"))
	assert.Error(t, validateOptionValue("VideoWorkerUrl", "file:///tmp/worker"))
	assert.NoError(t, validateOptionValue("VideoWorkerUrl", "https://video.example.workers.dev"))
}

func TestVideoWorkerOptionsTrimURLAndSecret(t *testing.T) {
	workerURL, err := normalizeOptionValueForStorage("VideoWorkerUrl", "  https://video.example.workers.dev  ")
	require.NoError(t, err)
	assert.Equal(t, "https://video.example.workers.dev", workerURL)

	secret, err := normalizeOptionValueForStorage("VideoWorkerSecret", "  0123456789abcdef0123456789abcdef  ")
	require.NoError(t, err)
	assert.Equal(t, "0123456789abcdef0123456789abcdef", secret)
}
