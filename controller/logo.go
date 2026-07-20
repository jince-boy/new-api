package controller

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	logoOptionKey = "Logo"
	logoPublicURL = "/api/logo"
	logoMaxBytes  = int64(5 << 20)
)

var logoContentTypes = map[string]string{
	"image/gif":  ".gif",
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func logoDir() string {
	return filepath.Join("upload", "logo")
}

func currentLogoFile() (string, string, bool) {
	dir := logoDir()
	for contentType, ext := range logoContentTypes {
		filePath := filepath.Join(dir, "current"+ext)
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			return filePath, contentType, true
		}
	}
	return "", "", false
}

func UploadLogo(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, logoMaxBytes+(1<<20))

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "missing logo image")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, logoMaxBytes+1))
	if err != nil {
		common.ApiErrorMsg(c, "failed to read logo image")
		return
	}
	if len(data) == 0 {
		common.ApiErrorMsg(c, "logo image is empty")
		return
	}
	if int64(len(data)) > logoMaxBytes {
		common.ApiErrorMsg(c, "logo image must be 5 MB or smaller")
		return
	}

	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	contentType := http.DetectContentType(head)
	ext, ok := logoContentTypes[contentType]
	if !ok {
		common.ApiErrorMsg(c, "logo image must be PNG, JPEG, WebP, or GIF")
		return
	}

	dir := logoDir()
	if err = os.MkdirAll(dir, 0755); err != nil {
		common.ApiError(c, fmt.Errorf("failed to create logo upload directory: %w", err))
		return
	}

	targetPath := filepath.Join(dir, "current"+ext)
	tempPath := filepath.Join(dir, "current.tmp")
	if err = os.WriteFile(tempPath, data, 0644); err != nil {
		common.ApiError(c, fmt.Errorf("failed to save logo image: %w", err))
		return
	}
	if err = os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tempPath)
		common.ApiError(c, fmt.Errorf("failed to replace logo image: %w", err))
		return
	}
	if err = os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		common.ApiError(c, fmt.Errorf("failed to replace logo image: %w", err))
		return
	}
	for _, oldExt := range logoContentTypes {
		oldPath := filepath.Join(dir, "current"+oldExt)
		if oldPath != targetPath {
			_ = os.Remove(oldPath)
		}
	}

	nextLogoURL := fmt.Sprintf("%s?v=%d", logoPublicURL, time.Now().UnixMilli())
	if err = model.UpdateOption(logoOptionKey, nextLogoURL); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.logo.upload", map[string]interface{}{
		"key": logoOptionKey,
	})
	common.ApiSuccess(c, gin.H{"url": nextLogoURL})
}

func DeleteLogo(c *gin.Context) {
	if err := model.UpdateOption(logoOptionKey, ""); err != nil {
		common.ApiError(c, err)
		return
	}

	for _, ext := range logoContentTypes {
		filePath := filepath.Join(logoDir(), "current"+ext)
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			common.ApiError(c, fmt.Errorf("failed to remove logo image: %w", err))
			return
		}
	}

	recordManageAudit(c, "option.logo.delete", map[string]interface{}{
		"key": logoOptionKey,
	})
	common.ApiSuccess(c, nil)
}

func GetLogo(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	configuredURL := common.OptionMap[logoOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if configuredURL != logoPublicURL && !strings.HasPrefix(configuredURL, logoPublicURL+"?") {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "uploaded logo is not configured",
		})
		return
	}

	filePath, contentType, ok := currentLogoFile()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "logo image not found",
		})
		return
	}

	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("Content-Type", contentType)
	c.File(filePath)
}
