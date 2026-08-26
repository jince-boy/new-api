package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetLogoServesConfiguredImage(t *testing.T) {
	originalDir, err := os.Getwd()
	require.NoError(t, err)
	tempDir := t.TempDir()
	t.Cleanup(func() {
		require.NoError(t, os.Chdir(originalDir))
	})
	require.NoError(t, os.Chdir(tempDir))

	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = map[string]string{logoOptionKey: logoPublicURL}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	imageBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	require.NoError(t, os.MkdirAll(logoDir(), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(logoDir(), "current.png"), imageBytes, 0644))

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, logoPublicURL, nil)

	GetLogo(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "no-store, no-cache, must-revalidate, max-age=0", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, imageBytes, recorder.Body.Bytes())
}

func TestUploadLogoRejectsNonImageContent(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileWriter, err := writer.CreateFormFile("file", "logo.png")
	require.NoError(t, err)
	_, err = fileWriter.Write([]byte("not an image"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/option/logo", &body)
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())

	UploadLogo(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "logo image must be PNG, JPEG, WebP, GIF, or SVG")
}

func TestIsSafeLogoSVGValidatesActiveContent(t *testing.T) {
	require.True(t, isSafeLogoSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>`)))
	require.False(t, isSafeLogoSVG([]byte(`<svg><script>alert(1)</script></svg>`)))
	require.False(t, isSafeLogoSVG([]byte(`<svg><image href="javascript:alert(1)"/></svg>`)))
}
