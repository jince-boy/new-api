package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

type smartProtectionRequest struct {
	Model     string                   `json:"model"`
	Messages  []smartProtectionMessage `json:"messages"`
	MaxTokens int                      `json:"max_tokens"`
	Stream    bool                     `json:"stream"`
}

type smartProtectionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type smartProtectionResponse struct {
	Choices []struct {
		Message struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"`
		} `json:"message"`
	} `json:"choices"`
}

type smartProtectionStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

type smartProtectionDecision struct {
	Safety     string
	Categories []string
	Raw        string
	Content    string
	Latency    int64
}

type smartProtectionActions struct {
	Record          bool
	Block           bool
	SendEmail       bool
	EmailTemplateID string
	MatchedRules    []string
}

// Qwen3Guard normally returns two lines, but compatible OpenAI endpoints may
// wrap the labels in Markdown or place both labels on one line. Keep parsing
// anchored to the label names while accepting those harmless variations.
var smartProtectionLabelPattern = regexp.MustCompile("(?i)(?:[\\\"']?Safety[\\\"']?)\\s*:\\s*[\\\"'*_`\\[\\{\\s]*(Safe|Controversial|Unsafe)\\b")
var smartProtectionCategoryPattern = regexp.MustCompile(`(?i)(?:["']?Categories["']?)\s*:\s*([^\r\n]+)`)

const (
	smartProtectionMaxSafetyRunes      = 32
	smartProtectionMaxCategoryRunes    = 128
	smartProtectionMaxCategoryCount    = 64
	smartProtectionMaxRawResultRunes   = 4096
	smartProtectionRecentMessages      = 5
	smartProtectionMaxLatestChunks     = 4
	smartProtectionDecisionCacheTTL    = 10 * time.Minute
	smartProtectionDecisionCacheMax    = 2048
	smartProtectionDecisionCacheBytes  = 8 * 1024 * 1024
	smartProtectionRiskStateTTL        = 30 * time.Minute
	smartProtectionRiskStateMax        = 10000
	smartProtectionUpstreamMaxAttempts = 2
	// Cortecs may return Retry-After on 429. A sub-second retry loop causes a
	// free-tier quota window to be exhausted even faster, so honor that signal
	// for a bounded but useful interval.
	smartProtectionMaxRetryDelay     = 30 * time.Second
	smartProtectionEmailRedisTimeout = 500 * time.Millisecond
)

var smartProtectionContextReferencePattern = regexp.MustCompile(`(?i)(continue|above|previous|earlier|as discussed|same (?:instructions|steps)|继续|上面|上述|前面|刚才|之前|照旧|按.{0,12}(?:内容|步骤|要求)|基于.{0,12}(?:内容|对话))`)

var errSmartProtectionUpstreamTimeout = errors.New("smart protection upstream timed out after retries")

var smartProtectionLimiter = struct {
	sync.Mutex
	active  int
	changed chan struct{}
}{changed: make(chan struct{})}

var smartProtectionLastCleanup atomic.Int64

type smartProtectionEmailLimitEntry struct {
	expires time.Time
}

var smartProtectionEmailLimit = struct {
	sync.Mutex
	entries map[string]smartProtectionEmailLimitEntry
}{entries: make(map[string]smartProtectionEmailLimitEntry)}

type smartProtectionReviewCall struct {
	done     chan struct{}
	decision smartProtectionDecision
	err      error
}

type smartProtectionCachedDecision struct {
	decision smartProtectionDecision
	expires  time.Time
	usedAt   time.Time
	size     int
}

var smartProtectionDecisionCache = struct {
	sync.Mutex
	entries     map[string]smartProtectionCachedDecision
	inFlight    map[string]*smartProtectionReviewCall
	totalBytes  int
	lastCleanup time.Time
}{entries: make(map[string]smartProtectionCachedDecision), inFlight: make(map[string]*smartProtectionReviewCall)}

var smartProtectionRiskState = struct {
	sync.Mutex
	entries map[string]time.Time
}{entries: make(map[string]time.Time)}

func SmartProtectionEnabled() bool {
	setting := operation_setting.GetSmartProtectionSetting()
	return setting.Enabled && len(setting.ChannelIDs) > 0
}

func ShouldProtectChannel(channelId int) bool {
	setting := operation_setting.GetSmartProtectionSetting()
	return setting.Enabled && containsInt(setting.ChannelIDs, channelId)
}

func CheckSmartProtection(c *gin.Context, info *relaycommon.RelayInfo, channelId int, channelName string, meta *types.TokenCountMeta) *types.NewAPIError {
	setting := operation_setting.GetSmartProtectionSetting()
	if !setting.Enabled || !containsInt(setting.ChannelIDs, channelId) || meta == nil || strings.TrimSpace(meta.CombineText) == "" {
		return nil
	}
	started := time.Now()
	riskKey := strconv.Itoa(info.UserId) + ":" + strconv.Itoa(info.TokenId) + ":" + info.OriginModelName
	decisions, err := reviewSmartProtectionContext(c.Request.Context(), setting, meta, riskKey)
	reviewDuration := time.Since(started)
	info.AddSmartProtectionReviewTime(reviewDuration)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			err = errSmartProtectionUpstreamTimeout
		}
		info.SmartProtectionReviewError = err.Error()
	}
	for _, decision := range decisions {
		if !containsString(info.SmartProtectionSafeties, decision.Safety) {
			info.SmartProtectionSafeties = append(info.SmartProtectionSafeties, decision.Safety)
		}
		for _, category := range decision.Categories {
			if !containsString(info.SmartProtectionCategories, category) {
				info.SmartProtectionCategories = append(info.SmartProtectionCategories, category)
			}
		}
	}
	// Each guard call is evaluated independently. Rule matching is first-match:
	// once a rule matches one decision, later rules must not add actions to it.
	actions := smartProtectionActions{}
	matchedRules := make([]string, 0, len(decisions))
	for _, decision := range decisions {
		decisionActions := smartProtectionEvaluateDecisionActions(setting, decision)
		mergeSmartProtectionActions(&actions, decisionActions)
		for _, rule := range decisionActions.MatchedRules {
			if !containsString(matchedRules, rule) {
				matchedRules = append(matchedRules, rule)
			}
		}
		if decisionActions.Record || decisionActions.Block {
			action := "observed"
			if decisionActions.Block {
				action = "blocked"
			}
			if recordErr := recordSmartProtectionEvent(c, info, channelId, channelName, setting, decision, action, decisionActions); recordErr != nil {
				logger.LogWarn(c, fmt.Sprintf("failed to record smart protection event: %v", recordErr))
			}
		} else if decisionActions.SendEmail && decisionActions.EmailTemplateID != "" {
			sendSmartProtectionWarningEmail(c, info, setting, decision, decisionActions.EmailTemplateID)
		}
	}
	info.SmartProtectionReviewStatus, info.SmartProtectionReviewReason = smartProtectionReviewOutcome(decisions, actions, err)
	if len(decisions) > 0 {
		info.SmartProtectionMatchedRules = append([]string{}, matchedRules...)
		decision := aggregateSmartProtectionDecisions(decisions, reviewDuration.Milliseconds())
		info.SmartProtectionReviewRaw = decision.Raw
		if rawRunes := []rune(info.SmartProtectionReviewRaw); len(rawRunes) > smartProtectionMaxRawResultRunes {
			info.SmartProtectionReviewRaw = string(rawRunes[:smartProtectionMaxRawResultRunes]) + "…"
		}
	}
	if actions.Block {
		logger.LogWarn(c, fmt.Sprintf("smart protection blocked request: safeties=%s categories=%s latency=%dms", strings.Join(info.SmartProtectionSafeties, ","), strings.Join(info.SmartProtectionCategories, ","), reviewDuration.Milliseconds()))
		return types.NewErrorWithStatusCode(errors.New("request blocked by smart protection"), types.ErrorCodeSmartProtectionBlocked, http.StatusForbidden, types.ErrOptionWithSkipRetry())
	}
	if err != nil {
		logger.LogWarn(c, fmt.Sprintf("smart protection review failed: %v", err))
		// The guard is an auxiliary safety service. If it is unavailable,
		// preserve the normal relay path instead of blocking customer traffic.
	}
	return nil
}

func aggregateSmartProtectionDecisions(decisions []smartProtectionDecision, latency int64) smartProtectionDecision {
	aggregated := smartProtectionDecision{Latency: latency}
	highestRisk := -1
	contents := make([]string, 0, len(decisions))
	rawResults := make([]string, 0, len(decisions))
	for _, decision := range decisions {
		risk := 1
		switch {
		case strings.EqualFold(strings.TrimSpace(decision.Safety), "Unsafe"):
			risk = 3
		case strings.EqualFold(strings.TrimSpace(decision.Safety), "Controversial"):
			risk = 2
		case strings.EqualFold(strings.TrimSpace(decision.Safety), "Safe"):
			risk = 0
		}
		if risk > highestRisk {
			highestRisk = risk
			aggregated.Safety = strings.TrimSpace(decision.Safety)
		}
		for _, category := range decision.Categories {
			if !containsString(aggregated.Categories, category) {
				aggregated.Categories = append(aggregated.Categories, strings.TrimSpace(category))
			}
		}
		if content := strings.TrimSpace(decision.Content); content != "" {
			contents = append(contents, content)
		}
		if raw := strings.TrimSpace(decision.Raw); raw != "" {
			rawResults = append(rawResults, raw)
		}
	}
	aggregated.Content = strings.Join(contents, "\n\n--- reviewed chunk ---\n\n")
	aggregated.Raw = strings.Join(rawResults, "\n\n--- review result ---\n\n")
	return aggregated
}

func reviewSmartProtectionContext(ctx context.Context, setting operation_setting.SmartProtectionSetting, meta *types.TokenCountMeta, riskKey string) ([]smartProtectionDecision, error) {
	primaryChunks, expandedContext, referencesHistory := buildSmartProtectionReviewPlan(meta, setting.MaxContextChars)
	if len(primaryChunks) == 0 {
		return nil, nil
	}
	timeoutSeconds := setting.TimeoutSeconds
	if timeoutSeconds <= 0 || timeoutSeconds > operation_setting.SmartProtectionMaxTimeout {
		timeoutSeconds = 15
	}
	// The relay request context may carry a much shorter upstream/client
	// deadline. Smart protection is an independent preflight call, so use its
	// own bounded timeout instead of letting the relay deadline abort Cortecs
	// halfway through a classification.
	reviewParent := context.WithoutCancel(ctx)
	concurrencyLimit := setting.MaxConcurrent
	if concurrencyLimit <= 0 {
		concurrencyLimit = 1
	}
	if concurrencyLimit > operation_setting.SmartProtectionMaxConcurrent {
		concurrencyLimit = operation_setting.SmartProtectionMaxConcurrent
	}
	phaseTimeout := time.Duration(timeoutSeconds*smartProtectionUpstreamMaxAttempts)*time.Second + smartProtectionMaxRetryDelay
	primaryCtx, primaryCancel := context.WithTimeout(reviewParent, phaseTimeout)
	decisions, firstErr := reviewSmartProtectionChunks(primaryCtx, setting, primaryChunks, concurrencyLimit)
	primaryTimedOut := primaryCtx.Err() != nil
	primaryCancel()
	suspicious := false
	for _, decision := range decisions {
		if !strings.EqualFold(strings.TrimSpace(decision.Safety), "Safe") || len(decision.Categories) > 0 {
			suspicious = true
		}
	}
	if suspicious && riskKey != "" {
		markSmartProtectionRisk(riskKey)
	}
	if firstErr != nil && len(decisions) == 0 {
		return nil, firstErr
	}
	if expandedContext == "" || primaryTimedOut || (!referencesHistory && !suspicious && !hasSmartProtectionRisk(riskKey)) {
		return decisions, firstErr
	}
	expandedCtx, expandedCancel := context.WithTimeout(reviewParent, phaseTimeout)
	expandedDecisions, expandedErr := reviewSmartProtectionChunks(expandedCtx, setting, []string{expandedContext}, concurrencyLimit)
	expandedCancel()
	decisions = append(decisions, expandedDecisions...)
	if firstErr == nil {
		firstErr = expandedErr
	}
	return decisions, firstErr
}

func reviewSmartProtectionChunks(ctx context.Context, setting operation_setting.SmartProtectionSetting, chunks []string, concurrencyLimit int) ([]smartProtectionDecision, error) {
	type reviewJob struct {
		index   int
		content string
	}
	type reviewResult struct {
		index    int
		decision smartProtectionDecision
	}
	workerCount := min(concurrencyLimit, len(chunks))
	jobs := make(chan reviewJob, len(chunks))
	results := make(chan reviewResult, len(chunks))
	errorsCh := make(chan error, len(chunks))
	for index, chunk := range chunks {
		jobs <- reviewJob{index: index, content: chunk}
	}
	close(jobs)
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				decision, err := reviewSmartProtectionChunkCached(ctx, setting, job.content, concurrencyLimit)
				if err != nil {
					errorsCh <- err
					continue
				}
				results <- reviewResult{index: job.index, decision: decision}
			}
		}()
	}
	wg.Wait()
	close(results)
	close(errorsCh)
	ordered := make([]*smartProtectionDecision, len(chunks))
	for result := range results {
		decision := result.decision
		ordered[result.index] = &decision
	}
	decisions := make([]smartProtectionDecision, 0, len(chunks))
	for _, decision := range ordered {
		if decision != nil {
			decisions = append(decisions, *decision)
		}
	}
	var firstErr error
	for err := range errorsCh {
		if firstErr == nil {
			firstErr = err
		}
	}
	return decisions, firstErr
}

func reviewSmartProtectionChunkCached(ctx context.Context, setting operation_setting.SmartProtectionSetting, content string, concurrencyLimit int) (smartProtectionDecision, error) {
	// Include the credential fingerprint in the key without retaining the credential itself.
	hash := sha256.Sum256([]byte(setting.BaseURL + "\x00" + setting.Model + "\x00" + setting.APIKey + "\x00" + content))
	key := hex.EncodeToString(hash[:])
	now := time.Now()
	smartProtectionDecisionCache.Lock()
	if cached, ok := smartProtectionDecisionCache.entries[key]; ok {
		if now.Before(cached.expires) {
			cached.usedAt = now
			smartProtectionDecisionCache.entries[key] = cached
			decision := cached.decision
			decision.Categories = append([]string(nil), decision.Categories...)
			decision.Content = content
			decision.Latency = 0
			smartProtectionDecisionCache.Unlock()
			return decision, nil
		}
		delete(smartProtectionDecisionCache.entries, key)
		smartProtectionDecisionCache.totalBytes -= cached.size
	}
	if call, ok := smartProtectionDecisionCache.inFlight[key]; ok {
		smartProtectionDecisionCache.Unlock()
		select {
		case <-ctx.Done():
			return smartProtectionDecision{}, ctx.Err()
		case <-call.done:
			decision := call.decision
			decision.Categories = append([]string(nil), decision.Categories...)
			decision.Content = content
			return decision, call.err
		}
	}
	call := &smartProtectionReviewCall{done: make(chan struct{})}
	smartProtectionDecisionCache.inFlight[key] = call
	smartProtectionDecisionCache.Unlock()

	if err := acquireSmartProtectionSlot(ctx, concurrencyLimit); err != nil {
		call.err = err
	} else {
		call.decision, call.err = reviewSmartProtectionChunk(ctx, setting, content)
		releaseSmartProtectionSlot()
	}

	smartProtectionDecisionCache.Lock()
	delete(smartProtectionDecisionCache.inFlight, key)
	if call.err == nil {
		cachedDecision := call.decision
		cachedDecision.Content = ""
		cachedDecision.Categories = append([]string(nil), cachedDecision.Categories...)
		size := len(cachedDecision.Raw) + len(cachedDecision.Safety) + 64
		for _, category := range cachedDecision.Categories {
			size += len(category)
		}
		smartProtectionDecisionCache.entries[key] = smartProtectionCachedDecision{
			decision: cachedDecision, expires: now.Add(smartProtectionDecisionCacheTTL), usedAt: now, size: size,
		}
		smartProtectionDecisionCache.totalBytes += size
		pruneSmartProtectionDecisionCache(now)
	}
	close(call.done)
	smartProtectionDecisionCache.Unlock()
	return call.decision, call.err
}

func reviewSmartProtectionChunk(ctx context.Context, setting operation_setting.SmartProtectionSetting, content string) (smartProtectionDecision, error) {
	started := time.Now()
	payload := smartProtectionRequest{
		Model:     setting.Model,
		Messages:  []smartProtectionMessage{{Role: "user", Content: content}},
		MaxTokens: 128,
		Stream:    false,
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return smartProtectionDecision{}, err
	}
	endpoint, err := smartProtectionEndpoint(setting.BaseURL)
	if err != nil {
		return smartProtectionDecision{}, err
	}
	client := &http.Client{}
	var responseBody []byte
	for attempt := 1; attempt <= smartProtectionUpstreamMaxAttempts; attempt++ {
		attemptCtx, attemptCancel := context.WithTimeout(ctx, time.Duration(setting.TimeoutSeconds)*time.Second)
		request, err := http.NewRequestWithContext(attemptCtx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			attemptCancel()
			return smartProtectionDecision{}, err
		}
		request.Header.Set("Content-Type", "application/json")
		if setting.APIKey != "" {
			request.Header.Set("Authorization", "Bearer "+setting.APIKey)
		}
		response, err := client.Do(request)
		if err != nil {
			attemptCancel()
			if ctx.Err() != nil {
				return smartProtectionDecision{}, ctx.Err()
			}
			var requestError *url.Error
			timedOut := errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &requestError) && requestError.Timeout())
			if attempt < smartProtectionUpstreamMaxAttempts && timedOut {
				if retryErr := waitForSmartProtectionRetry(ctx, "", attempt, 0); retryErr != nil {
					return smartProtectionDecision{}, retryErr
				}
				continue
			}
			if timedOut {
				return smartProtectionDecision{}, errSmartProtectionUpstreamTimeout
			}
			return smartProtectionDecision{}, err
		}
		responseBody, err = io.ReadAll(io.LimitReader(response.Body, 256*1024))
		response.Body.Close()
		attemptCancel()
		if err != nil {
			if ctx.Err() != nil {
				return smartProtectionDecision{}, ctx.Err()
			}
			if attempt < smartProtectionUpstreamMaxAttempts && errors.Is(err, context.DeadlineExceeded) {
				if retryErr := waitForSmartProtectionRetry(ctx, "", attempt, 0); retryErr != nil {
					return smartProtectionDecision{}, retryErr
				}
				continue
			}
			if errors.Is(err, context.DeadlineExceeded) {
				return smartProtectionDecision{}, errSmartProtectionUpstreamTimeout
			}
			return smartProtectionDecision{}, err
		}
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			break
		}
		if attempt == smartProtectionUpstreamMaxAttempts || !smartProtectionRetryableStatus(response.StatusCode) {
			bodyText := smartProtectionUpstreamBody(responseBody)
			if bodyText == "" {
				return smartProtectionDecision{}, fmt.Errorf("smart protection upstream returned status %d", response.StatusCode)
			}
			return smartProtectionDecision{}, fmt.Errorf("smart protection upstream returned status %d: %s", response.StatusCode, bodyText)
		}
		if err := waitForSmartProtectionRetry(ctx, response.Header.Get("Retry-After"), attempt, response.StatusCode); err != nil {
			return smartProtectionDecision{}, err
		}
	}
	raw, err := smartProtectionResponseContent(responseBody)
	if err != nil {
		return smartProtectionDecision{}, smartProtectionErrorWithBody(err, responseBody)
	}
	if strings.TrimSpace(raw) == "" {
		return smartProtectionDecision{}, smartProtectionErrorWithBody(errors.New("smart protection upstream returned no classification"), responseBody)
	}
	raw = strings.TrimSpace(raw)
	decision := smartProtectionDecision{Raw: raw, Content: content, Latency: time.Since(started).Milliseconds()}
	if match := smartProtectionLabelPattern.FindStringSubmatch(raw); len(match) == 2 {
		decision.Safety = canonicalSmartProtectionSafety(match[1])
	}
	if len([]rune(decision.Safety)) > smartProtectionMaxSafetyRunes {
		return smartProtectionDecision{}, smartProtectionErrorWithBody(errors.New("smart protection upstream returned an invalid safety label"), responseBody)
	}
	if match := smartProtectionCategoryPattern.FindStringSubmatch(raw); len(match) == 2 {
		categoryValue := strings.TrimSpace(match[1])
		categoryValue = strings.Trim(categoryValue, "[]")
		for _, category := range strings.Split(categoryValue, ",") {
			category = strings.Trim(strings.TrimSpace(category), " \t\"'`*_[]{}()")
			if category != "" && !strings.EqualFold(category, "None") {
				if len([]rune(category)) > smartProtectionMaxCategoryRunes || len(decision.Categories) >= smartProtectionMaxCategoryCount {
					return smartProtectionDecision{}, smartProtectionErrorWithBody(errors.New("smart protection upstream returned invalid categories"), responseBody)
				}
				decision.Categories = append(decision.Categories, category)
			}
		}
	}
	if decision.Safety == "" {
		return smartProtectionDecision{}, smartProtectionErrorWithBody(errors.New("smart protection upstream returned an invalid safety label"), responseBody)
	}
	// Qwen3Guard's contract defines Safe as Categories: None. Some
	// OpenAI-compatible gateways occasionally append a stale category from
	// another generation; never let that contradiction trigger a category
	// rule or appear as a false positive in the audit log.
	if strings.EqualFold(decision.Safety, "Safe") {
		decision.Categories = nil
	}
	return decision, nil
}

const smartProtectionMaxErrorBodyRunes = 4096

func smartProtectionUpstreamBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len([]rune(text)) > smartProtectionMaxErrorBodyRunes {
		text = string([]rune(text)[:smartProtectionMaxErrorBodyRunes]) + "…"
	}
	return text
}

func smartProtectionErrorWithBody(err error, body []byte) error {
	if bodyText := smartProtectionUpstreamBody(body); bodyText != "" {
		return fmt.Errorf("%w: upstream response: %s", err, bodyText)
	}
	return err
}

func smartProtectionRetryableStatus(status int) bool {
	return status == http.StatusTooManyRequests || status == http.StatusBadGateway || status == http.StatusServiceUnavailable || status == http.StatusGatewayTimeout
}

func waitForSmartProtectionRetry(ctx context.Context, retryAfter string, attempt int, status int) error {
	delay := time.Duration(attempt) * 250 * time.Millisecond
	if status == http.StatusTooManyRequests && strings.TrimSpace(retryAfter) == "" {
		delay = time.Second
	}
	if seconds, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && seconds >= 0 {
		delay = time.Duration(seconds) * time.Second
	} else if retryAt, err := http.ParseTime(strings.TrimSpace(retryAfter)); err == nil {
		delay = time.Until(retryAt)
	}
	if delay < 0 {
		delay = 0
	}
	if delay > smartProtectionMaxRetryDelay {
		delay = smartProtectionMaxRetryDelay
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func smartProtectionResponseContent(responseBody []byte) (string, error) {
	var parsed smartProtectionResponse
	if err := common.Unmarshal(responseBody, &parsed); err == nil && len(parsed.Choices) > 0 {
		content := parsed.Choices[0].Message.Content
		if strings.TrimSpace(content) == "" {
			content = parsed.Choices[0].Message.ReasoningContent
		}
		if strings.TrimSpace(content) != "" {
			return content, nil
		}
	}

	// Some OpenAI-compatible gateways return SSE even when the request asks for
	// non-streaming output. Reassemble delta.content fields before classifying.
	var content strings.Builder
	for _, line := range bytes.Split(responseBody, []byte{'\n'}) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 || bytes.Equal(line, []byte("data: [DONE]")) {
			continue
		}
		line = bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if len(line) == 0 {
			continue
		}
		var chunk smartProtectionStreamChunk
		if err := common.Unmarshal(line, &chunk); err != nil {
			continue
		}
		for _, choice := range chunk.Choices {
			content.WriteString(choice.Delta.Content)
		}
	}
	if content.Len() == 0 {
		return "", errors.New("smart protection upstream returned invalid response")
	}
	return content.String(), nil
}

// smartProtectionEndpoint accepts either an OpenAI-compatible base URL (for
// example https://guard.example/v1) or the complete /chat/completions URL.
// Keep query parameters on the URL when normalizing the path.
func smartProtectionEndpoint(baseURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		if err == nil {
			err = errors.New("smart protection URL is invalid")
		}
		return "", err
	}
	path := strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(strings.ToLower(path), "/chat/completions") {
		path += "/chat/completions"
	}
	parsed.Path = path
	return parsed.String(), nil
}

func canonicalSmartProtectionSafety(value string) string {
	switch {
	case strings.EqualFold(strings.TrimSpace(value), "safe"):
		return "Safe"
	case strings.EqualFold(strings.TrimSpace(value), "controversial"):
		return "Controversial"
	case strings.EqualFold(strings.TrimSpace(value), "unsafe"):
		return "Unsafe"
	default:
		return strings.TrimSpace(value)
	}
}

func splitSmartProtectionContext(content string, limit int) []string {
	content = strings.TrimSpace(content)
	if content == "" || limit <= 0 {
		return nil
	}
	runes := []rune(content)
	window := limit
	if window > 24000 {
		window = 24000
	}
	if window < 2 {
		window = 2
	}
	if len(runes) <= window {
		return []string{string(runes)}
	}
	overlap := 512
	if overlap >= window {
		overlap = window / 4
	}
	advance := window - overlap
	chunkCount := 1 + (len(runes)-window+advance-1)/advance
	firstChunk := 0
	if chunkCount > 32 {
		firstChunk = chunkCount - 32
	}
	chunks := make([]string, 0, min(chunkCount, 32))
	for start := firstChunk * advance; start < len(runes); start += advance {
		end := start + window
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
		if end == len(runes) {
			break
		}
	}
	return chunks
}

func buildSmartProtectionReviewPlan(meta *types.TokenCountMeta, limit int) ([]string, string, bool) {
	if meta == nil {
		return nil, "", false
	}
	messages := meta.TextMessages
	latestIndex := -1
	for index := len(messages) - 1; index >= 0; index-- {
		role := strings.TrimSpace(messages[index].Role)
		if (strings.EqualFold(role, "user") || role == "") && strings.TrimSpace(messages[index].Content) != "" {
			latestIndex = index
			break
		}
	}
	if latestIndex < 0 {
		content := strings.TrimSpace(meta.CombineText)
		chunks := splitSmartProtectionContext(content, limit)
		if len(chunks) > smartProtectionMaxLatestChunks {
			chunks = chunks[len(chunks)-smartProtectionMaxLatestChunks:]
		}
		return chunks, "", false
	}
	latest := strings.TrimSpace(messages[latestIndex].Content)
	primaryChunks := splitSmartProtectionContext(latest, limit)
	if len(primaryChunks) > smartProtectionMaxLatestChunks {
		primaryChunks = primaryChunks[len(primaryChunks)-smartProtectionMaxLatestChunks:]
	}
	start := max(0, latestIndex-smartProtectionRecentMessages+1)
	expanded := ""
	if start < latestIndex {
		var expandedBuilder strings.Builder
		for index := start; index < latestIndex; index++ {
			content := strings.TrimSpace(messages[index].Content)
			if content == "" {
				continue
			}
			expandedBuilder.WriteString(strings.ToUpper(strings.TrimSpace(messages[index].Role)))
			expandedBuilder.WriteString(":\n")
			expandedBuilder.WriteString(content)
			expandedBuilder.WriteString("\n\n")
		}
		expanded = trimSmartProtectionContextTail(expandedBuilder.String(), limit)
	}
	return primaryChunks, expanded, smartProtectionContextReferencePattern.MatchString(latest)
}

func trimSmartProtectionContextTail(content string, limit int) string {
	content = strings.TrimSpace(content)
	if content == "" || limit <= 0 {
		return ""
	}
	runes := []rune(content)
	if len(runes) <= limit {
		return content
	}
	return string(runes[len(runes)-limit:])
}

func pruneSmartProtectionDecisionCache(now time.Time) {
	if now.Sub(smartProtectionDecisionCache.lastCleanup) >= time.Minute {
		for key, entry := range smartProtectionDecisionCache.entries {
			if !now.Before(entry.expires) {
				delete(smartProtectionDecisionCache.entries, key)
				smartProtectionDecisionCache.totalBytes -= entry.size
			}
		}
		smartProtectionDecisionCache.lastCleanup = now
	}
	for len(smartProtectionDecisionCache.entries) > smartProtectionDecisionCacheMax || smartProtectionDecisionCache.totalBytes > smartProtectionDecisionCacheBytes {
		oldestKey := ""
		var oldest time.Time
		for key, entry := range smartProtectionDecisionCache.entries {
			if oldestKey == "" || entry.usedAt.Before(oldest) {
				oldestKey = key
				oldest = entry.usedAt
			}
		}
		if oldestKey == "" {
			break
		}
		entry := smartProtectionDecisionCache.entries[oldestKey]
		delete(smartProtectionDecisionCache.entries, oldestKey)
		smartProtectionDecisionCache.totalBytes -= entry.size
	}
}

func markSmartProtectionRisk(key string) {
	if key == "" {
		return
	}
	now := time.Now()
	smartProtectionRiskState.Lock()
	for entryKey, expires := range smartProtectionRiskState.entries {
		if !now.Before(expires) {
			delete(smartProtectionRiskState.entries, entryKey)
		}
	}
	if len(smartProtectionRiskState.entries) >= smartProtectionRiskStateMax {
		oldestKey := ""
		var oldest time.Time
		for entryKey, expires := range smartProtectionRiskState.entries {
			if oldestKey == "" || expires.Before(oldest) {
				oldestKey = entryKey
				oldest = expires
			}
		}
		delete(smartProtectionRiskState.entries, oldestKey)
	}
	smartProtectionRiskState.entries[key] = now.Add(smartProtectionRiskStateTTL)
	smartProtectionRiskState.Unlock()
}

func hasSmartProtectionRisk(key string) bool {
	if key == "" {
		return false
	}
	now := time.Now()
	smartProtectionRiskState.Lock()
	expires, ok := smartProtectionRiskState.entries[key]
	if ok && !now.Before(expires) {
		delete(smartProtectionRiskState.entries, key)
		ok = false
	}
	smartProtectionRiskState.Unlock()
	return ok
}

func acquireSmartProtectionSlot(ctx context.Context, limit int) error {
	for {
		smartProtectionLimiter.Lock()
		if smartProtectionLimiter.active < limit {
			smartProtectionLimiter.active++
			smartProtectionLimiter.Unlock()
			return nil
		}
		changed := smartProtectionLimiter.changed
		smartProtectionLimiter.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}

func releaseSmartProtectionSlot() {
	smartProtectionLimiter.Lock()
	if smartProtectionLimiter.active > 0 {
		smartProtectionLimiter.active--
	}
	close(smartProtectionLimiter.changed)
	smartProtectionLimiter.changed = make(chan struct{})
	smartProtectionLimiter.Unlock()
}

func smartProtectionShouldBlock(setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision) bool {
	return smartProtectionEvaluateDecisionActions(setting, decision).Block
}

// smartProtectionEvaluateDecisionActions applies only the first matching rule
// to one guard decision. This keeps rule actions deterministic and prevents a
// later, broader rule from changing the response selected by an earlier rule.
func smartProtectionEvaluateDecisionActions(setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision) smartProtectionActions {
	for _, rule := range setting.BlockedRules {
		if !smartProtectionRuleMatches(rule, decision) {
			continue
		}
		actions := smartProtectionActions{}
		ruleLabel := strings.TrimSpace(rule.Name)
		if ruleLabel == "" {
			ruleLabel = strings.TrimSpace(rule.ID)
		}
		if ruleLabel != "" {
			actions.MatchedRules = []string{ruleLabel}
		}
		if smartProtectionRuleUsesLegacyActions(rule) {
			actions.Record = true
			actions.Block = true
		} else {
			actions.Record = rule.Record
			actions.Block = rule.Block
		}
		if setting.WarningEmail && rule.SendEmail {
			actions.SendEmail = true
			actions.EmailTemplateID = strings.TrimSpace(rule.EmailTemplateID)
		}
		if actions.Block {
			actions.Record = true
		}
		return actions
	}

	// Compatibility for settings/tests that still populate only the legacy
	// safety/category lists and have no materialized rule list.
	if len(setting.BlockedRules) == 0 {
		for _, safety := range setting.BlockedSafeties {
			if smartProtectionLabelsEqual(safety, decision.Safety) {
				return smartProtectionActions{Record: true, Block: true}
			}
		}
		for _, blocked := range setting.BlockedCategories {
			for _, category := range decision.Categories {
				if smartProtectionLabelsEqual(blocked, category) {
					return smartProtectionActions{Record: true, Block: true}
				}
			}
		}
	}
	return smartProtectionActions{}
}

func mergeSmartProtectionActions(target *smartProtectionActions, source smartProtectionActions) {
	target.Record = target.Record || source.Record
	target.Block = target.Block || source.Block
	target.SendEmail = target.SendEmail || source.SendEmail
	if target.EmailTemplateID == "" {
		target.EmailTemplateID = source.EmailTemplateID
	}
	for _, rule := range source.MatchedRules {
		if !containsString(target.MatchedRules, rule) {
			target.MatchedRules = append(target.MatchedRules, rule)
		}
	}
}

func smartProtectionEvaluateActions(setting operation_setting.SmartProtectionSetting, decisions []smartProtectionDecision) smartProtectionActions {
	actions := smartProtectionActions{}
	for _, decision := range decisions {
		mergeSmartProtectionActions(&actions, smartProtectionEvaluateDecisionActions(setting, decision))
	}
	return actions
}

func smartProtectionRuleUsesLegacyActions(rule operation_setting.SmartProtectionRule) bool {
	return !rule.ActionsConfigured && !rule.Record && !rule.SendEmail && !rule.Block
}

func smartProtectionDecisionsAreSafe(decisions []smartProtectionDecision) bool {
	if len(decisions) == 0 {
		return false
	}
	for _, decision := range decisions {
		if !strings.EqualFold(strings.TrimSpace(decision.Safety), "Safe") || len(decision.Categories) > 0 {
			return false
		}
	}
	return true
}

func smartProtectionReviewOutcome(decisions []smartProtectionDecision, actions smartProtectionActions, reviewErr error) (string, string) {
	if len(decisions) == 0 {
		if reviewErr != nil {
			return "failed", "guard_unavailable"
		}
		return "", ""
	}
	if actions.Block {
		return "blocked", "blocking_rule_matched"
	}
	if reviewErr != nil {
		return "partial", "partial_failure"
	}
	if smartProtectionDecisionsAreSafe(decisions) {
		return "safe", "safe_classification"
	}
	return "observed", "non_blocking_risk"
}

func smartProtectionRuleMatches(rule operation_setting.SmartProtectionRule, decision smartProtectionDecision) bool {
	// Safety is the severity gate whenever it is configured. MatchMode then
	// controls the selected categories: "any" requires one category and "all"
	// requires every category. Category-only rules still work without a gate.
	if strings.TrimSpace(rule.Safety) != "" && !smartProtectionLabelsEqual(rule.Safety, decision.Safety) {
		return false
	}
	if len(rule.Categories) == 0 {
		return strings.TrimSpace(rule.Safety) != ""
	}
	if rule.MatchMode == "all" {
		return smartProtectionConditionMatches("", rule.Categories, decision)
	}
	for _, requiredCategory := range rule.Categories {
		for _, category := range decision.Categories {
			if smartProtectionLabelsEqual(requiredCategory, category) {
				return true
			}
		}
	}
	return false
}

func smartProtectionConditionMatches(safety string, categories []string, decision smartProtectionDecision) bool {
	if strings.TrimSpace(safety) == "" && len(categories) == 0 {
		return false
	}
	if strings.TrimSpace(safety) != "" && !smartProtectionLabelsEqual(safety, decision.Safety) {
		return false
	}
	if len(categories) == 0 {
		return true
	}
	for _, requiredCategory := range categories {
		matched := false
		for _, category := range decision.Categories {
			if smartProtectionLabelsEqual(requiredCategory, category) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func smartProtectionLabelsEqual(left, right string) bool {
	normalize := func(value string) string {
		value = strings.Trim(strings.TrimSpace(value), "*_`[]{}()\"'.,;:")
		value = strings.NewReplacer("–", "-", "—", "-", "‐", "-", "‑", "-").Replace(value)
		return strings.ToLower(strings.Join(strings.Fields(value), " "))
	}
	return normalize(left) == normalize(right)
}

func recordSmartProtectionEvent(c *gin.Context, info *relaycommon.RelayInfo, channelId int, channelName string, setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision, action string, actions smartProtectionActions) error {
	user, err := model.GetUserIdentityForSmartProtection(info.UserId)
	if err != nil {
		return err
	}
	categories, err := common.Marshal(decision.Categories)
	if err != nil {
		return err
	}
	content := decision.Content
	rawResult := decision.Raw
	if !setting.SaveContent {
		content = ""
		rawResult = ""
	} else if len([]rune(content)) > operation_setting.SmartProtectionMaxContext {
		content = string([]rune(content)[:operation_setting.SmartProtectionMaxContext])
	}
	if rawRunes := []rune(rawResult); len(rawRunes) > smartProtectionMaxRawResultRunes {
		rawResult = string(rawRunes[:smartProtectionMaxRawResultRunes])
	}
	hash := sha256.Sum256([]byte(decision.Content))
	emailTemplateID := ""
	if actions.SendEmail {
		emailTemplateID = actions.EmailTemplateID
	}
	emailRule, emailRuleMatched := selectSmartProtectionEmailTemplate(setting, emailTemplateID)
	emailStatus := "not_configured"
	if emailTemplateID != "" && !emailRuleMatched {
		emailStatus = "not_matched"
	} else if emailRuleMatched && strings.TrimSpace(user.Email) == "" {
		emailStatus = "skipped_no_email"
	} else if emailRuleMatched {
		emailStatus = "pending"
	}
	event := &model.SmartProtectionEvent{
		UserId: user.Id, Username: user.Username, Email: user.Email,
		TokenId: info.TokenId, TokenName: c.GetString("token_name"), ChannelId: channelId, ChannelName: channelName,
		RequestId: c.GetString(common.RequestIdKey), ModelName: info.OriginModelName, GuardModel: setting.Model,
		Safety: decision.Safety, Categories: string(categories), Content: content, ContentHash: hex.EncodeToString(hash[:]), RawResult: rawResult,
		Action: action, ReviewTimeMs: decision.Latency, EmailStatus: emailStatus, EmailRuleName: emailRule.Name, CreatedAt: time.Now().Unix(),
	}
	if err := model.CreateSmartProtectionEvent(event); err != nil {
		return err
	}
	if emailStatus == "pending" && !reserveSmartProtectionEmail(user.Id, user.Email, setting.EmailCooldownMinutes) {
		emailStatus = "rate_limited"
		if updateErr := model.UpdateSmartProtectionEmailResult(event.Id, false, emailStatus, ""); updateErr != nil {
			common.SysError(fmt.Sprintf("failed to save smart protection email cooldown result for event %d: %v", event.Id, updateErr))
		}
	}
	now := time.Now().Unix()
	lastCleanup := smartProtectionLastCleanup.Load()
	if setting.RetentionDays > 0 && now-lastCleanup >= 24*60*60 && smartProtectionLastCleanup.CompareAndSwap(lastCleanup, now) {
		gopool.Go(func() {
			if err := model.CleanupSmartProtectionEvents(setting.RetentionDays); err != nil {
				common.SysError(fmt.Sprintf("failed to clean smart protection events: %v", err))
			}
		})
	}
	if emailStatus == "pending" {
		gopool.Go(func() {
			subject, body := renderSmartProtectionEmail(emailRule, decision, event, user.Username)
			emailErr := common.SendEmail(subject, user.Email, body)
			emailError := errorString(emailErr)
			if emailErrorRunes := []rune(emailError); len(emailErrorRunes) > 255 {
				emailError = string(emailErrorRunes[:255])
			}
			if emailErr != nil {
				common.SysError(fmt.Sprintf("smart protection warning email failed for user %d: %v", user.Id, emailErr))
			}
			status := "sent"
			if emailErr != nil {
				status = "failed"
			}
			if updateErr := model.UpdateSmartProtectionEmailResult(event.Id, emailErr == nil, status, emailError); updateErr != nil {
				common.SysError(fmt.Sprintf("failed to save smart protection email result for event %d: %v", event.Id, updateErr))
			}
		})
	}
	return nil
}

func sendSmartProtectionWarningEmail(c *gin.Context, info *relaycommon.RelayInfo, setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision, emailTemplateID string) {
	rule, matched := selectSmartProtectionEmailTemplate(setting, emailTemplateID)
	if !matched {
		return
	}
	user, err := model.GetUserIdentityForSmartProtection(info.UserId)
	if err != nil || strings.TrimSpace(user.Email) == "" {
		return
	}
	if !reserveSmartProtectionEmail(user.Id, user.Email, setting.EmailCooldownMinutes) {
		return
	}
	event := &model.SmartProtectionEvent{RequestId: c.GetString(common.RequestIdKey), ModelName: info.OriginModelName, Action: "observed", CreatedAt: time.Now().Unix()}
	gopool.Go(func() {
		subject, body := renderSmartProtectionEmail(rule, decision, event, user.Username)
		if emailErr := common.SendEmail(subject, user.Email, body); emailErr != nil {
			common.SysError(fmt.Sprintf("smart protection warning email failed for user %d: %v", user.Id, emailErr))
		}
	})
}

func reserveSmartProtectionEmail(userID int, email string, cooldownMinutes int) bool {
	if cooldownMinutes <= 0 {
		return true
	}
	identity := fmt.Sprintf("%d:%s", userID, strings.ToLower(strings.TrimSpace(email)))
	digest := sha256.Sum256([]byte(identity))
	key := "smart_protection:email_cooldown:" + hex.EncodeToString(digest[:])
	duration := time.Duration(cooldownMinutes) * time.Minute
	if common.RedisEnabled && common.RDB != nil {
		ctx, cancel := context.WithTimeout(context.Background(), smartProtectionEmailRedisTimeout)
		reserved, err := common.RDB.SetNX(ctx, key, "1", duration).Result()
		cancel()
		if err == nil {
			return reserved
		}
		common.SysError(fmt.Sprintf("smart protection email cooldown Redis check failed: %v", err))
	}
	now := time.Now()
	smartProtectionEmailLimit.Lock()
	for entryKey, entry := range smartProtectionEmailLimit.entries {
		if !now.Before(entry.expires) {
			delete(smartProtectionEmailLimit.entries, entryKey)
		}
	}
	if entry, ok := smartProtectionEmailLimit.entries[key]; ok && now.Before(entry.expires) {
		smartProtectionEmailLimit.Unlock()
		return false
	}
	smartProtectionEmailLimit.entries[key] = smartProtectionEmailLimitEntry{expires: now.Add(duration)}
	smartProtectionEmailLimit.Unlock()
	return true
}

func buildSmartProtectionWarningEmail(decision smartProtectionDecision, requestId string) (string, string) {
	event := &model.SmartProtectionEvent{RequestId: requestId, Action: "blocked"}
	rule := operation_setting.SmartProtectionEmailRule{Subject: operation_setting.SmartProtectionDefaultEmailSubject, Body: operation_setting.SmartProtectionDefaultEmailBody}
	return renderSmartProtectionEmail(rule, decision, event, "")
}

func shouldSendSmartProtectionWarningEmail(setting operation_setting.SmartProtectionSetting, email string) bool {
	return setting.WarningEmail && strings.TrimSpace(email) != ""
}

func selectSmartProtectionEmailRule(setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision, action string) (operation_setting.SmartProtectionEmailRule, bool) {
	return selectSmartProtectionEmailRuleForDecisions(setting, []smartProtectionDecision{decision}, action)
}

func selectSmartProtectionEmailTemplate(setting operation_setting.SmartProtectionSetting, templateID string) (operation_setting.SmartProtectionEmailRule, bool) {
	templateID = strings.TrimSpace(templateID)
	if templateID == "" {
		return operation_setting.SmartProtectionEmailRule{}, false
	}
	for _, rule := range setting.EmailRules {
		if !rule.Enabled {
			continue
		}
		if strings.TrimSpace(rule.ID) == templateID {
			return rule, true
		}
	}
	return operation_setting.SmartProtectionEmailRule{}, false
}

func selectSmartProtectionEmailRuleForDecisions(setting operation_setting.SmartProtectionSetting, decisions []smartProtectionDecision, action string) (operation_setting.SmartProtectionEmailRule, bool) {
	if !setting.WarningEmail {
		return operation_setting.SmartProtectionEmailRule{}, false
	}
	for _, rule := range setting.EmailRules {
		if rule.Action != "" && !strings.EqualFold(strings.TrimSpace(rule.Action), strings.TrimSpace(action)) {
			continue
		}
		if strings.TrimSpace(rule.Safety) == "" && len(rule.Categories) == 0 && strings.TrimSpace(rule.Action) != "" {
			return rule, true
		}
		for _, decision := range decisions {
			if smartProtectionEmailRuleMatches(rule, decision) {
				return rule, true
			}
		}
	}
	return operation_setting.SmartProtectionEmailRule{}, false
}

func smartProtectionEmailRuleMatches(rule operation_setting.SmartProtectionEmailRule, decision smartProtectionDecision) bool {
	if rule.MatchMode == "all" {
		return smartProtectionConditionMatches(rule.Safety, rule.Categories, decision)
	}
	if strings.TrimSpace(rule.Safety) != "" && smartProtectionLabelsEqual(rule.Safety, decision.Safety) {
		return true
	}
	for _, requiredCategory := range rule.Categories {
		for _, category := range decision.Categories {
			if smartProtectionLabelsEqual(requiredCategory, category) {
				return true
			}
		}
	}
	return false
}

func renderSmartProtectionEmail(rule operation_setting.SmartProtectionEmailRule, decision smartProtectionDecision, event *model.SmartProtectionEvent, username string) (string, string) {
	createdAt := time.Unix(event.CreatedAt, 0).Format(time.RFC3339)
	values := map[string]string{
		"username":   username,
		"safety":     decision.Safety,
		"categories": strings.Join(decision.Categories, ", "),
		"request_id": event.RequestId,
		"model":      event.ModelName,
		"time":       createdAt,
		"action":     event.Action,
	}
	subject := rule.Subject
	body := rule.Body
	for key, value := range values {
		placeholder := "{{" + key + "}}"
		subject = strings.ReplaceAll(subject, placeholder, value)
		body = strings.ReplaceAll(body, placeholder, html.EscapeString(value))
	}
	subject = strings.NewReplacer("\r", " ", "\n", " ").Replace(subject)
	return subject, body
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func containsInt(values []int, target int) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(target)) {
			return true
		}
	}
	return false
}
