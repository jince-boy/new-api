package controller

import (
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

func TestGetGroupChatQRCodeServesConfiguredImage(t *testing.T) {
	originalDir, err := os.Getwd()
	require.NoError(t, err)
	tempDir := t.TempDir()
	t.Cleanup(func() {
		require.NoError(t, os.Chdir(originalDir))
	})
	require.NoError(t, os.Chdir(tempDir))

	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = map[string]string{
		groupChatQRCodeOptionKey: groupChatQRCodePublicURL,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	imageBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	dir := groupChatQRCodeDir()
	require.NoError(t, os.MkdirAll(dir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "current.png"), imageBytes, 0644))

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, groupChatQRCodePublicURL, nil)

	GetGroupChatQRCode(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "no-store, no-cache, must-revalidate, max-age=0", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "no-cache", recorder.Header().Get("Pragma"))
	assert.Equal(t, "0", recorder.Header().Get("Expires"))
	assert.Equal(t, imageBytes, recorder.Body.Bytes())
}

func TestEffectiveGroupChatQRCodeURLRecoversOrphanedImage(t *testing.T) {
	originalDir, err := os.Getwd()
	require.NoError(t, err)
	tempDir := t.TempDir()
	t.Cleanup(func() {
		require.NoError(t, os.Chdir(originalDir))
	})
	require.NoError(t, os.Chdir(tempDir))

	assert.Empty(t, effectiveGroupChatQRCodeURL(""))
	require.NoError(t, os.MkdirAll(groupChatQRCodeDir(), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(groupChatQRCodeDir(), "current.png"), []byte("image"), 0644))

	assert.Equal(t, groupChatQRCodePublicURL, effectiveGroupChatQRCodeURL(""))
}
