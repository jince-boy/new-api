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
	logoOptionKey      = "Logo"
	logoLightOptionKey = "LogoLight"
	logoDarkOptionKey  = "LogoDark"
	logoPublicURL      = "/api/logo"
	logoMaxBytes       = int64(5 << 20)
)

type logoVariant string

const (
	logoVariantLight logoVariant = "light"
	logoVariantDark  logoVariant = "dark"
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

func parseLogoVariant(value string) (logoVariant, bool) {
	variant := logoVariant(value)
	return variant, variant == logoVariantLight || variant == logoVariantDark
}

func logoConfig(variant *logoVariant) (string, string, string) {
	if variant == nil {
		return logoOptionKey, logoPublicURL, "current"
	}
	if *variant == logoVariantLight {
		return logoLightOptionKey, logoPublicURL + "/light", string(logoVariantLight)
	}
	return logoDarkOptionKey, logoPublicURL + "/dark", string(logoVariantDark)
}

func currentLogoFile(fileName string) (string, string, bool) {
	dir := logoDir()
	for contentType, ext := range logoContentTypes {
		filePath := filepath.Join(dir, fileName+ext)
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			return filePath, contentType, true
		}
	}
	return "", "", false
}

func UploadLogo(c *gin.Context) {
	uploadLogo(c, nil)
}

func UploadThemeLogo(c *gin.Context) {
	variant, ok := parseLogoVariant(c.Param("variant"))
	if !ok {
		common.ApiErrorMsg(c, "logo variant must be light or dark")
		return
	}
	uploadLogo(c, &variant)
}

func uploadLogo(c *gin.Context, variant *logoVariant) {
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

	optionKey, publicURL, fileName := logoConfig(variant)
	targetPath := filepath.Join(dir, fileName+ext)
	tempPath := filepath.Join(dir, fileName+".tmp")
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
		oldPath := filepath.Join(dir, fileName+oldExt)
		if oldPath != targetPath {
			_ = os.Remove(oldPath)
		}
	}

	nextLogoURL := fmt.Sprintf("%s?v=%d", publicURL, time.Now().UnixMilli())
	if err = model.UpdateOption(optionKey, nextLogoURL); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.logo.upload", map[string]interface{}{
		"key": optionKey,
	})
	common.ApiSuccess(c, gin.H{"url": nextLogoURL})
}

func DeleteLogo(c *gin.Context) {
	deleteLogo(c, nil)
}

func DeleteThemeLogo(c *gin.Context) {
	variant, ok := parseLogoVariant(c.Param("variant"))
	if !ok {
		common.ApiErrorMsg(c, "logo variant must be light or dark")
		return
	}
	deleteLogo(c, &variant)
}

func deleteLogo(c *gin.Context, variant *logoVariant) {
	optionKey, _, fileName := logoConfig(variant)
	if err := model.UpdateOption(optionKey, ""); err != nil {
		common.ApiError(c, err)
		return
	}

	for _, ext := range logoContentTypes {
		filePath := filepath.Join(logoDir(), fileName+ext)
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			common.ApiError(c, fmt.Errorf("failed to remove logo image: %w", err))
			return
		}
	}

	recordManageAudit(c, "option.logo.delete", map[string]interface{}{
		"key": optionKey,
	})
	common.ApiSuccess(c, nil)
}

func GetLogo(c *gin.Context) {
	getLogo(c, nil)
}

func GetThemeLogo(c *gin.Context) {
	variant, ok := parseLogoVariant(c.Param("variant"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "logo variant must be light or dark"})
		return
	}
	getLogo(c, &variant)
}

func getLogo(c *gin.Context, variant *logoVariant) {
	optionKey, publicURL, fileName := logoConfig(variant)
	common.OptionMapRWMutex.RLock()
	configuredURL := common.OptionMap[optionKey]
	common.OptionMapRWMutex.RUnlock()
	if configuredURL != publicURL && !strings.HasPrefix(configuredURL, publicURL+"?") {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "uploaded logo is not configured",
		})
		return
	}

	filePath, contentType, ok := currentLogoFile(fileName)
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
