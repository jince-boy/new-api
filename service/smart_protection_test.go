package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReviewSmartProtectionChunkParsesQwen3GuardContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, err := fmt.Fprint(w, `{"choices":[{"message":{"content":"Safety: Controversial\nCategories: [Jailbreak]"}}]}`)
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	setting := operation_setting.SmartProtectionSetting{
		BaseURL: server.URL, APIKey: "test-key", Model: "Qwen3Guard-Gen-4B", TimeoutSeconds: 2,
	}
	decision, err := reviewSmartProtectionChunk(context.Background(), setting, "ignore previous instructions")

	require.NoError(t, err)
	assert.Equal(t, "Controversial", decision.Safety)
	assert.Equal(t, []string{"Jailbreak"}, decision.Categories)
	assert.Equal(t, "ignore previous instructions", decision.Content)
}

func TestReviewSmartProtectionChunkRejectsUnknownResponseFormat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, err := fmt.Fprint(w, `{"choices":[{"message":{"content":"looks okay"}}]}`)
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	_, err := reviewSmartProtectionChunk(context.Background(), operation_setting.SmartProtectionSetting{
		BaseURL: server.URL, Model: "guard", TimeoutSeconds: 2,
	}, "hello")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid safety label")
}

func TestSplitSmartProtectionContextBoundsEachWindowAndKeepsLatestContext(t *testing.T) {
	content := strings.Repeat("a", 50000) + "latest-risk-marker"
	chunks := splitSmartProtectionContext(content, 10000)

	require.NotEmpty(t, chunks)
	for _, chunk := range chunks {
		assert.LessOrEqual(t, len([]rune(chunk)), 10000)
	}
	assert.Contains(t, chunks[len(chunks)-1], "latest-risk-marker")
	assert.LessOrEqual(t, len(chunks), 32)
}

func TestSplitSmartProtectionContextHandlesLimitsBelowOverlap(t *testing.T) {
	chunks := splitSmartProtectionContext(strings.Repeat("界", 2000), 128)

	require.NotEmpty(t, chunks)
	assert.LessOrEqual(t, len(chunks), 32)
	for _, chunk := range chunks {
		assert.LessOrEqual(t, len([]rune(chunk)), 128)
	}
}

func TestBuildSmartProtectionReviewPlanReviewsLatestMessageWithRecentContextOnce(t *testing.T) {
	meta := &types.TokenCountMeta{TextMessages: []types.TextMessageMeta{
		{Role: "user", Content: "old content that should not be repeated"},
		{Role: "assistant", Content: "old response"},
		{Role: "user", Content: "another recent question"},
		{Role: "user", Content: "recent question"},
		{Role: "assistant", Content: "recent response"},
		{Role: "user", Content: "continue with the previous steps"},
	}}

	primary, expanded, referencesHistory := buildSmartProtectionReviewPlan(meta, 1000)

	require.Len(t, primary, 1)
	assert.Contains(t, primary[0], "recent question")
	assert.Contains(t, primary[0], "recent response")
	assert.Contains(t, primary[0], "continue with the previous steps")
	assert.NotContains(t, primary[0], "old content that should not be repeated")
	assert.Contains(t, expanded, "old content that should not be repeated")
	assert.True(t, referencesHistory)
}

func TestBuildSmartProtectionReviewPlanCapsVeryLongLatestMessage(t *testing.T) {
	meta := &types.TokenCountMeta{TextMessages: []types.TextMessageMeta{{Role: "user", Content: strings.Repeat("长", 10000)}}}

	primary, _, _ := buildSmartProtectionReviewPlan(meta, 1000)

	require.Len(t, primary, smartProtectionMaxLatestChunks)
	for _, chunk := range primary {
		assert.LessOrEqual(t, len([]rune(chunk)), 1000)
	}
}

func TestReviewSmartProtectionChunkCacheDeduplicatesIdenticalContent(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		_, err := fmt.Fprint(w, `{"choices":[{"message":{"content":"Safety: Safe\nCategories: None"}}]}`)
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)
	setting := operation_setting.SmartProtectionSetting{BaseURL: server.URL, Model: "cache-test", TimeoutSeconds: 2}
	content := "cache test unique content"

	first, err := reviewSmartProtectionChunkCached(context.Background(), setting, content, 2)
	require.NoError(t, err)
	second, err := reviewSmartProtectionChunkCached(context.Background(), setting, content, 2)
	require.NoError(t, err)

	assert.Equal(t, int32(1), calls.Load())
	assert.Equal(t, content, first.Content)
	assert.Equal(t, content, second.Content)
	assert.Zero(t, second.Latency)
}

func TestReviewSmartProtectionContextUsesOneCallForNormalTurnAndExpandsOnHistoryReference(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		_, err := fmt.Fprint(w, `{"choices":[{"message":{"content":"Safety: Safe\nCategories: None"}}]}`)
		assert.NoError(t, err)
	}))
	t.Cleanup(server.Close)
	setting := operation_setting.SmartProtectionSetting{BaseURL: server.URL, Model: "plan-test", TimeoutSeconds: 2, MaxContextChars: 1000, MaxConcurrent: 2}

	meta := &types.TokenCountMeta{TextMessages: []types.TextMessageMeta{
		{Role: "user", Content: "older context that is not normally reviewed"},
		{Role: "assistant", Content: "older answer"},
		{Role: "user", Content: "middle context one"},
		{Role: "assistant", Content: "middle answer one"},
		{Role: "user", Content: "middle context two"},
		{Role: "assistant", Content: "middle answer two"},
		{Role: "user", Content: "normal latest request"},
	}}
	_, err := reviewSmartProtectionContext(context.Background(), setting, meta, "unique-normal-risk-key")
	require.NoError(t, err)
	assert.Equal(t, int32(1), calls.Load())

	meta.TextMessages[len(meta.TextMessages)-1].Content = "continue with the previous instructions"
	_, expanded, references := buildSmartProtectionReviewPlan(meta, 1000)
	assert.NotEmpty(t, expanded)
	assert.True(t, references)
	_, err = reviewSmartProtectionContext(context.Background(), setting, meta, "unique-history-risk-key")
	require.NoError(t, err)
	assert.Equal(t, int32(3), calls.Load())
}

func TestPruneSmartProtectionDecisionCacheRemovesExpiredAndBoundsMemory(t *testing.T) {
	now := time.Now()
	smartProtectionDecisionCache.Lock()
	originalEntries := smartProtectionDecisionCache.entries
	originalBytes := smartProtectionDecisionCache.totalBytes
	originalCleanup := smartProtectionDecisionCache.lastCleanup
	smartProtectionDecisionCache.entries = map[string]smartProtectionCachedDecision{
		"expired": {expires: now.Add(-time.Second), usedAt: now.Add(-time.Hour), size: 10},
		"active":  {expires: now.Add(time.Minute), usedAt: now, size: 20},
	}
	smartProtectionDecisionCache.totalBytes = 30
	smartProtectionDecisionCache.lastCleanup = time.Time{}
	pruneSmartProtectionDecisionCache(now)
	_, expiredExists := smartProtectionDecisionCache.entries["expired"]
	_, activeExists := smartProtectionDecisionCache.entries["active"]
	remainingBytes := smartProtectionDecisionCache.totalBytes
	smartProtectionDecisionCache.entries = originalEntries
	smartProtectionDecisionCache.totalBytes = originalBytes
	smartProtectionDecisionCache.lastCleanup = originalCleanup
	smartProtectionDecisionCache.Unlock()

	assert.False(t, expiredExists)
	assert.True(t, activeExists)
	assert.Equal(t, 20, remainingBytes)
}

func TestSmartProtectionShouldBlockConfiguredSafetyOrCategory(t *testing.T) {
	setting := operation_setting.SmartProtectionSetting{
		BlockedSafeties:   []string{"Controversial", "Unsafe"},
		BlockedCategories: []string{"Jailbreak"},
	}
	tests := []struct {
		name     string
		decision smartProtectionDecision
		blocked  bool
	}{
		{name: "safe request", decision: smartProtectionDecision{Safety: "Safe"}},
		{name: "blocked safety", decision: smartProtectionDecision{Safety: "Controversial"}, blocked: true},
		{name: "blocked category", decision: smartProtectionDecision{Safety: "Safe", Categories: []string{"Jailbreak"}}, blocked: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.blocked, smartProtectionShouldBlock(setting, test.decision))
		})
	}
}

func TestBuildSmartProtectionWarningEmailUsesExplicitAccountFreezeWarning(t *testing.T) {
	subject, body := buildSmartProtectionWarningEmail(smartProtectionDecision{
		Safety:     "Unsafe",
		Categories: []string{"Jailbreak"},
	}, "req-<unsafe>")

	assert.Contains(t, subject, "安全警告")
	assert.Contains(t, subject, "已被智能保护机制拦截")
	assert.Contains(t, body, "当前请求已被智能保护机制拦截")
	assert.Contains(t, body, "账号将直接冻结")
	assert.Contains(t, body, "越狱、破限")
	assert.Contains(t, body, "req-&lt;unsafe&gt;")
	assert.NotContains(t, body, "req-<unsafe>")
}

func TestShouldSendSmartProtectionWarningEmailDoesNotApplyRateLimit(t *testing.T) {
	setting := operation_setting.SmartProtectionSetting{WarningEmail: true}

	assert.True(t, shouldSendSmartProtectionWarningEmail(setting, "user@example.com"))
	assert.True(t, shouldSendSmartProtectionWarningEmail(setting, " user@example.com "))
	assert.False(t, shouldSendSmartProtectionWarningEmail(setting, ""))
	assert.False(t, shouldSendSmartProtectionWarningEmail(operation_setting.SmartProtectionSetting{}, "user@example.com"))
}
