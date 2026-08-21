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
	Model    string                   `json:"model"`
	Messages []smartProtectionMessage `json:"messages"`
}

type smartProtectionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type smartProtectionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type smartProtectionDecision struct {
	Safety     string
	Categories []string
	Raw        string
	Content    string
	Latency    int64
}

var smartProtectionLabelPattern = regexp.MustCompile(`(?im)^\s*Safety\s*:\s*([^\r\n]+)`)
var smartProtectionCategoryPattern = regexp.MustCompile(`(?im)^\s*Categories\s*:\s*([^\r\n]+)`)

const (
	smartProtectionMaxSafetyRunes     = 32
	smartProtectionMaxCategoryRunes   = 128
	smartProtectionMaxCategoryCount   = 64
	smartProtectionMaxRawResultRunes  = 4096
	smartProtectionRecentMessages     = 5
	smartProtectionMaxLatestChunks    = 4
	smartProtectionDecisionCacheTTL   = 10 * time.Minute
	smartProtectionDecisionCacheMax   = 2048
	smartProtectionDecisionCacheBytes = 8 * 1024 * 1024
	smartProtectionRiskStateTTL       = 30 * time.Minute
	smartProtectionRiskStateMax       = 10000
)

var smartProtectionContextReferencePattern = regexp.MustCompile(`(?i)(continue|above|previous|earlier|as discussed|same (?:instructions|steps)|继续|上面|上述|前面|刚才|之前|照旧|按.{0,12}(?:内容|步骤|要求)|基于.{0,12}(?:内容|对话))`)

var smartProtectionLimiter = struct {
	sync.Mutex
	active  int
	changed chan struct{}
}{changed: make(chan struct{})}

var smartProtectionLastCleanup atomic.Int64

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

var smartProtectionCacheCleanupOnce sync.Once

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
	info.AddSmartProtectionReviewTime(time.Since(started))
	for _, decision := range decisions {
		if !smartProtectionShouldBlock(setting, decision) {
			continue
		}
		if err := recordSmartProtectionEvent(c, info, channelId, channelName, setting, decision); err != nil {
			logger.LogWarn(c, fmt.Sprintf("failed to record smart protection event: %v", err))
		}
		logger.LogWarn(c, fmt.Sprintf("smart protection blocked request: safety=%s categories=%s latency=%dms", decision.Safety, strings.Join(decision.Categories, ","), time.Since(started).Milliseconds()))
		return types.NewErrorWithStatusCode(errors.New("request blocked by smart protection"), types.ErrorCodeSmartProtectionBlocked, http.StatusForbidden, types.ErrOptionWithSkipRetry())
	}
	if err != nil {
		logger.LogWarn(c, fmt.Sprintf("smart protection review failed: %v", err))
		// The guard is an auxiliary safety service. If it is unavailable,
		// preserve the normal relay path instead of blocking customer traffic.
	}
	return nil
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
	reviewCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()
	concurrencyLimit := setting.MaxConcurrent
	if concurrencyLimit <= 0 {
		concurrencyLimit = 1
	}
	if concurrencyLimit > operation_setting.SmartProtectionMaxConcurrent {
		concurrencyLimit = operation_setting.SmartProtectionMaxConcurrent
	}
	decisions, firstErr := reviewSmartProtectionChunks(reviewCtx, cancel, setting, primaryChunks, concurrencyLimit)
	blocked := false
	suspicious := false
	for _, decision := range decisions {
		if smartProtectionShouldBlock(setting, decision) {
			blocked = true
		}
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
	if blocked || expandedContext == "" || (!referencesHistory && !suspicious && !hasSmartProtectionRisk(riskKey)) {
		return decisions, firstErr
	}
	expandedDecisions, expandedErr := reviewSmartProtectionChunks(reviewCtx, cancel, setting, []string{expandedContext}, concurrencyLimit)
	decisions = append(decisions, expandedDecisions...)
	if firstErr == nil {
		firstErr = expandedErr
	}
	return decisions, firstErr
}

func reviewSmartProtectionChunks(ctx context.Context, cancel context.CancelFunc, setting operation_setting.SmartProtectionSetting, chunks []string, concurrencyLimit int) ([]smartProtectionDecision, error) {
	workerCount := min(concurrencyLimit, len(chunks))
	jobs := make(chan string, len(chunks))
	results := make(chan smartProtectionDecision, len(chunks))
	errorsCh := make(chan error, len(chunks))
	for _, chunk := range chunks {
		jobs <- chunk
	}
	close(jobs)
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for chunk := range jobs {
				decision, err := reviewSmartProtectionChunkCached(ctx, setting, chunk, concurrencyLimit)
				if err != nil {
					errorsCh <- err
					continue
				}
				results <- decision
				if smartProtectionShouldBlock(setting, decision) {
					cancel()
				}
			}
		}()
	}
	wg.Wait()
	close(results)
	close(errorsCh)
	decisions := make([]smartProtectionDecision, 0, len(chunks))
	for decision := range results {
		decisions = append(decisions, decision)
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
	startSmartProtectionCacheCleanup()
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

func startSmartProtectionCacheCleanup() {
	smartProtectionCacheCleanupOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for now := range ticker.C {
				smartProtectionDecisionCache.Lock()
				pruneSmartProtectionDecisionCache(now)
				smartProtectionDecisionCache.Unlock()
				smartProtectionRiskState.Lock()
				for key, expires := range smartProtectionRiskState.entries {
					if !now.Before(expires) {
						delete(smartProtectionRiskState.entries, key)
					}
				}
				smartProtectionRiskState.Unlock()
			}
		}()
	})
}

func reviewSmartProtectionChunk(ctx context.Context, setting operation_setting.SmartProtectionSetting, content string) (smartProtectionDecision, error) {
	started := time.Now()
	payload := smartProtectionRequest{
		Model:    setting.Model,
		Messages: []smartProtectionMessage{{Role: "system", Content: "You are a helpful and harmless assistant. You should think step-by-step."}, {Role: "user", Content: content}},
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return smartProtectionDecision{}, err
	}
	endpoint := strings.TrimRight(setting.BaseURL, "/") + "/chat/completions"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return smartProtectionDecision{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	if setting.APIKey != "" {
		request.Header.Set("Authorization", "Bearer "+setting.APIKey)
	}
	client := &http.Client{Timeout: time.Duration(setting.TimeoutSeconds) * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return smartProtectionDecision{}, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 256*1024))
	if err != nil {
		return smartProtectionDecision{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return smartProtectionDecision{}, fmt.Errorf("smart protection upstream returned status %d", response.StatusCode)
	}
	var parsed smartProtectionResponse
	if err := common.Unmarshal(responseBody, &parsed); err != nil {
		return smartProtectionDecision{}, err
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return smartProtectionDecision{}, errors.New("smart protection upstream returned no classification")
	}
	raw := strings.TrimSpace(parsed.Choices[0].Message.Content)
	decision := smartProtectionDecision{Raw: raw, Content: content, Latency: time.Since(started).Milliseconds()}
	if match := smartProtectionLabelPattern.FindStringSubmatch(raw); len(match) == 2 {
		decision.Safety = strings.TrimSpace(match[1])
	}
	if len([]rune(decision.Safety)) > smartProtectionMaxSafetyRunes {
		return smartProtectionDecision{}, errors.New("smart protection upstream returned an invalid safety label")
	}
	if match := smartProtectionCategoryPattern.FindStringSubmatch(raw); len(match) == 2 {
		categoryValue := strings.TrimSpace(match[1])
		categoryValue = strings.Trim(categoryValue, "[]")
		for _, category := range strings.Split(categoryValue, ",") {
			category = strings.Trim(strings.TrimSpace(category), "\"'")
			if category != "" && !strings.EqualFold(category, "None") {
				if len([]rune(category)) > smartProtectionMaxCategoryRunes || len(decision.Categories) >= smartProtectionMaxCategoryCount {
					return smartProtectionDecision{}, errors.New("smart protection upstream returned invalid categories")
				}
				decision.Categories = append(decision.Categories, category)
			}
		}
	}
	if decision.Safety == "" {
		return smartProtectionDecision{}, errors.New("smart protection upstream returned an invalid safety label")
	}
	return decision, nil
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
	primaryChunks := make([]string, 0, smartProtectionMaxLatestChunks)
	start := max(0, latestIndex-smartProtectionRecentMessages+1)
	var contextBuilder strings.Builder
	for index := start; index <= latestIndex; index++ {
		content := strings.TrimSpace(messages[index].Content)
		if content == "" {
			continue
		}
		contextBuilder.WriteString(strings.ToUpper(strings.TrimSpace(messages[index].Role)))
		contextBuilder.WriteString(":\n")
		contextBuilder.WriteString(content)
		contextBuilder.WriteString("\n\n")
	}
	recentContext := trimSmartProtectionContextTail(contextBuilder.String(), limit)
	if len([]rune(latest)) <= limit {
		primaryChunks = append(primaryChunks, recentContext)
	} else {
		primaryChunks = splitSmartProtectionContext(latest, limit)
		if len(primaryChunks) > smartProtectionMaxLatestChunks {
			primaryChunks = primaryChunks[len(primaryChunks)-smartProtectionMaxLatestChunks:]
		}
	}
	expandedStart := 0
	expandedEnd := start
	if len([]rune(latest)) > limit {
		expandedStart = start
		expandedEnd = latestIndex
	}
	var expandedBuilder strings.Builder
	for index := expandedStart; index < expandedEnd; index++ {
		content := strings.TrimSpace(messages[index].Content)
		if content == "" {
			continue
		}
		expandedBuilder.WriteString(strings.ToUpper(strings.TrimSpace(messages[index].Role)))
		expandedBuilder.WriteString(":\n")
		expandedBuilder.WriteString(content)
		expandedBuilder.WriteString("\n\n")
	}
	expanded := trimSmartProtectionContextTail(expandedBuilder.String(), limit)
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
	for _, safety := range setting.BlockedSafeties {
		if strings.EqualFold(strings.TrimSpace(safety), strings.TrimSpace(decision.Safety)) {
			return true
		}
	}
	for _, blocked := range setting.BlockedCategories {
		for _, category := range decision.Categories {
			if strings.EqualFold(strings.TrimSpace(blocked), strings.TrimSpace(category)) {
				return true
			}
		}
	}
	return false
}

func recordSmartProtectionEvent(c *gin.Context, info *relaycommon.RelayInfo, channelId int, channelName string, setting operation_setting.SmartProtectionSetting, decision smartProtectionDecision) error {
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
	sendWarningEmail := shouldSendSmartProtectionWarningEmail(setting, user.Email)
	event := &model.SmartProtectionEvent{
		UserId: user.Id, Username: user.Username, Email: user.Email,
		TokenId: info.TokenId, TokenName: c.GetString("token_name"), ChannelId: channelId, ChannelName: channelName,
		RequestId: c.GetString(common.RequestIdKey), ModelName: info.OriginModelName, GuardModel: setting.Model,
		Safety: decision.Safety, Categories: string(categories), Content: content, ContentHash: hex.EncodeToString(hash[:]), RawResult: rawResult,
		Action: "blocked", ReviewTimeMs: decision.Latency, CreatedAt: time.Now().Unix(),
	}
	if err := model.CreateSmartProtectionEvent(event); err != nil {
		return err
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
	if sendWarningEmail {
		gopool.Go(func() {
			subject, body := buildSmartProtectionWarningEmail(decision, event.RequestId)
			emailErr := common.SendEmail(subject, user.Email, body)
			emailError := errorString(emailErr)
			if emailErrorRunes := []rune(emailError); len(emailErrorRunes) > 255 {
				emailError = string(emailErrorRunes[:255])
			}
			if emailErr != nil {
				common.SysError(fmt.Sprintf("smart protection warning email failed for user %d: %v", user.Id, emailErr))
			}
			if updateErr := model.UpdateSmartProtectionEmailResult(event.Id, emailErr == nil, emailError); updateErr != nil {
				common.SysError(fmt.Sprintf("failed to save smart protection email result for event %d: %v", event.Id, updateErr))
			}
		})
	}
	return nil
}

func buildSmartProtectionWarningEmail(decision smartProtectionDecision, requestId string) (string, string) {
	subject := "【安全警告】请求已被智能保护机制拦截"
	body := fmt.Sprintf(
		"<h2>安全警告</h2><p><strong>当前请求已被智能保护机制拦截。</strong></p><p>如后续管理员确认本次请求确实包含越狱、破限或其他绕过安全限制的操作，对应的账号将直接冻结。</p><p>请勿继续尝试绕过平台安全策略。</p><hr><p>Safety: %s</p><p>Categories: %s</p><p>Request ID: %s</p>",
		html.EscapeString(decision.Safety),
		html.EscapeString(strings.Join(decision.Categories, ", ")),
		html.EscapeString(requestId),
	)
	return subject, body
}

func shouldSendSmartProtectionWarningEmail(setting operation_setting.SmartProtectionSetting, email string) bool {
	return setting.WarningEmail && strings.TrimSpace(email) != ""
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
