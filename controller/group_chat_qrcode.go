package controller

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const (
	groupChatQRCodeOptionKey                = "GroupChatQRCodeImageURL"
	groupChatQRCodeExpiresAtOptionKey       = "GroupChatQRCodeExpiresAt"
	groupChatQRCodeReminderSentForOptionKey = "GroupChatQRCodeReminderSentFor"
	groupChatQRCodePublicURL                = "/api/group-chat-qrcode"
	groupChatQRCodeMaxBytes                 = int64(5 << 20)
)

var groupChatQRCodeContentTypes = map[string]string{
	"image/gif":  ".gif",
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func groupChatQRCodeDir() string {
	return filepath.Join("upload", "group-chat-qrcode")
}

func currentGroupChatQRCodeFile() (string, string, bool) {
	dir := groupChatQRCodeDir()
	for contentType, ext := range groupChatQRCodeContentTypes {
		filePath := filepath.Join(dir, "current"+ext)
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			return filePath, contentType, true
		}
	}
	return "", "", false
}

func UploadGroupChatQRCode(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, groupChatQRCodeMaxBytes+(1<<20))

	_, normalizedExpiresAt, err := service.NormalizeGroupChatQRCodeExpiresAt(c.PostForm("expires_at"), time.Now())
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "missing QR code image")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, groupChatQRCodeMaxBytes+1))
	if err != nil {
		common.ApiErrorMsg(c, "failed to read QR code image")
		return
	}
	if len(data) == 0 {
		common.ApiErrorMsg(c, "QR code image is empty")
		return
	}
	if int64(len(data)) > groupChatQRCodeMaxBytes {
		common.ApiErrorMsg(c, "QR code image must be 5 MB or smaller")
		return
	}

	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	contentType := http.DetectContentType(head)
	ext, ok := groupChatQRCodeContentTypes[contentType]
	if !ok {
		common.ApiErrorMsg(c, "QR code image must be PNG, JPEG, WebP, or GIF")
		return
	}

	dir := groupChatQRCodeDir()
	if err = os.MkdirAll(dir, 0755); err != nil {
		common.ApiError(c, fmt.Errorf("failed to create upload directory: %w", err))
		return
	}

	targetPath := filepath.Join(dir, "current"+ext)
	tempPath := filepath.Join(dir, "current.tmp")
	if err = os.WriteFile(tempPath, data, 0644); err != nil {
		common.ApiError(c, fmt.Errorf("failed to save QR code image: %w", err))
		return
	}
	if err = os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tempPath)
		common.ApiError(c, fmt.Errorf("failed to replace QR code image: %w", err))
		return
	}
	if err = os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		common.ApiError(c, fmt.Errorf("failed to replace QR code image: %w", err))
		return
	}
	for _, oldExt := range groupChatQRCodeContentTypes {
		oldPath := filepath.Join(dir, "current"+oldExt)
		if oldPath != targetPath {
			_ = os.Remove(oldPath)
		}
	}

	if err = model.UpdateOptionsBulk(map[string]string{
		groupChatQRCodeOptionKey:                groupChatQRCodePublicURL,
		groupChatQRCodeExpiresAtOptionKey:       normalizedExpiresAt,
		groupChatQRCodeReminderSentForOptionKey: "",
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.group_chat_qrcode.upload", map[string]interface{}{
		"key":        groupChatQRCodeOptionKey,
		"expires_at": normalizedExpiresAt,
	})
	common.ApiSuccess(c, gin.H{
		"url":        groupChatQRCodePublicURL,
		"expires_at": normalizedExpiresAt,
	})
}

func GetGroupChatQRCode(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	configuredURL := common.OptionMap[groupChatQRCodeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if configuredURL == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "group chat QR code is not configured",
		})
		return
	}

	filePath, contentType, ok := currentGroupChatQRCodeFile()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "group chat QR code image not found",
		})
		return
	}

	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("Content-Type", contentType)
	c.File(filePath)
}
