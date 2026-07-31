package taskcommon

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"mime/multipart"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type MultipartFormPayload struct {
	Body        []byte
	ContentType string
	Values      map[string]any
}

// RebuildMultipartForm copies multipart parts in their original order and
// preserves every part header and file byte. Only selected text fields are
// replaced; the original boundary is reused.
func RebuildMultipartForm(c *gin.Context, overrides map[string][]string) (MultipartFormPayload, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return MultipartFormPayload{}, err
	}
	rawBody, err := storage.Bytes()
	if err != nil {
		return MultipartFormPayload{}, err
	}
	contentType := c.GetHeader("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "multipart/form-data" || params["boundary"] == "" {
		return MultipartFormPayload{}, fmt.Errorf("invalid multipart content type %q", contentType)
	}

	reader := multipart.NewReader(bytes.NewReader(rawBody), params["boundary"])
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.SetBoundary(params["boundary"]); err != nil {
		return MultipartFormPayload{}, fmt.Errorf("reuse multipart boundary: %w", err)
	}

	values := make(map[string]any)
	replaced := make(map[string]bool, len(overrides))
	for {
		part, nextErr := reader.NextRawPart()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			return MultipartFormPayload{}, fmt.Errorf("read multipart part: %w", nextErr)
		}

		fieldName := part.FormName()
		output, createErr := writer.CreatePart(part.Header)
		if createErr != nil {
			_ = part.Close()
			return MultipartFormPayload{}, fmt.Errorf("copy multipart part %q: %w", fieldName, createErr)
		}

		if replacements, exists := overrides[fieldName]; exists && part.FileName() == "" {
			if _, discardErr := io.Copy(io.Discard, part); discardErr != nil {
				_ = part.Close()
				return MultipartFormPayload{}, fmt.Errorf("read replaced multipart field %q: %w", fieldName, discardErr)
			}
			for _, value := range replacements {
				if _, writeErr := io.WriteString(output, value); writeErr != nil {
					_ = part.Close()
					return MultipartFormPayload{}, fmt.Errorf("write replaced multipart field %q: %w", fieldName, writeErr)
				}
				addMultipartValue(values, fieldName, value)
			}
			replaced[fieldName] = true
		} else if part.FileName() == "" {
			value, readErr := io.ReadAll(part)
			if readErr != nil {
				_ = part.Close()
				return MultipartFormPayload{}, fmt.Errorf("read multipart field %q: %w", fieldName, readErr)
			}
			if _, writeErr := output.Write(value); writeErr != nil {
				_ = part.Close()
				return MultipartFormPayload{}, fmt.Errorf("write multipart field %q: %w", fieldName, writeErr)
			}
			addMultipartValue(values, fieldName, string(value))
		} else if _, copyErr := io.Copy(output, part); copyErr != nil {
			_ = part.Close()
			return MultipartFormPayload{}, fmt.Errorf("copy multipart file %q: %w", fieldName, copyErr)
		}
		if closeErr := part.Close(); closeErr != nil {
			return MultipartFormPayload{}, fmt.Errorf("close multipart part %q: %w", fieldName, closeErr)
		}
	}

	for fieldName, replacements := range overrides {
		if replaced[fieldName] {
			continue
		}
		for _, value := range replacements {
			if err := writer.WriteField(fieldName, value); err != nil {
				return MultipartFormPayload{}, fmt.Errorf("add multipart field %q: %w", fieldName, err)
			}
			addMultipartValue(values, fieldName, value)
		}
	}
	if err := writer.Close(); err != nil {
		return MultipartFormPayload{}, fmt.Errorf("close multipart writer: %w", err)
	}
	return MultipartFormPayload{
		Body:        body.Bytes(),
		ContentType: contentType,
		Values:      values,
	}, nil
}

func addMultipartValue(values map[string]any, fieldName, value string) {
	existing, exists := values[fieldName]
	if !exists {
		values[fieldName] = value
		return
	}
	if existingValues, ok := existing.([]string); ok {
		values[fieldName] = append(existingValues, value)
		return
	}
	values[fieldName] = []string{existing.(string), value}
}
