package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteRelayErrorHidesUpstreamResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	relayErr := types.NewOpenAIError(errors.New("upstream account balance exhausted"), types.ErrorCodeBadResponseStatusCode, http.StatusForbidden)
	service.MarkUpstreamError(relayErr, http.StatusForbidden, "application/json", `{"error":"upstream account balance exhausted"}`)

	writeRelayError(context, nil, types.RelayFormatOpenAI, relayErr, "req-private-error")

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "当前模型不可用")
	assert.Contains(t, recorder.Body.String(), "model_unavailable")
	assert.NotContains(t, recorder.Body.String(), "balance exhausted")
}

func TestWriteRelayErrorKeepsGatewayValidationError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	relayErr := types.NewErrorWithStatusCode(errors.New("model is required"), types.ErrorCodeInvalidRequest, http.StatusBadRequest)
	writeRelayError(context, nil, types.RelayFormatOpenAI, relayErr, "req-validation")

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "model is required")
	assert.NotContains(t, recorder.Body.String(), "当前模型不可用")
}

func TestWriteRelayErrorKeepsClaudeEnvelopeWhileHidingUpstreamResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)

	relayErr := types.NewOpenAIError(errors.New("upstream authentication failed"), types.ErrorCodeBadResponseStatusCode, http.StatusUnauthorized)
	service.MarkUpstreamError(relayErr, http.StatusUnauthorized, "application/json", `{"error":"invalid upstream api key"}`)

	writeRelayError(context, nil, types.RelayFormatClaude, relayErr, "req-claude-private-error")

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"type":"error"`)
	assert.Contains(t, recorder.Body.String(), "当前模型不可用")
	assert.Contains(t, recorder.Body.String(), "model_unavailable")
	assert.NotContains(t, recorder.Body.String(), "authentication failed")
	assert.NotContains(t, recorder.Body.String(), "api key")
}

func TestWriteRelayErrorAppendsGenericEventAfterStreamStarted(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	_, writeErr := context.Writer.Write([]byte("data: {\"choices\":[]}\n\n"))
	require.NoError(t, writeErr)

	relayErr := types.NewOpenAIError(errors.New("upstream quota exhausted"), types.ErrorCodeBadResponse, http.StatusTooManyRequests)
	service.MarkUpstreamError(relayErr, http.StatusTooManyRequests, "text/event-stream", `{"error":{"message":"upstream quota exhausted"}}`)

	writeRelayError(context, nil, types.RelayFormatOpenAI, relayErr, "req-stream-error")

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "data:")
	assert.Contains(t, recorder.Body.String(), "当前模型不可用")
	assert.NotContains(t, recorder.Body.String(), "quota exhausted")
}
