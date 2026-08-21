package controller

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func relayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	switch info.RelayMode {
	case relayconstant.RelayModeImagesGenerations, relayconstant.RelayModeImagesEdits:
		err = relay.ImageHelper(c, info)
	case relayconstant.RelayModeAudioSpeech:
		fallthrough
	case relayconstant.RelayModeAudioTranslation:
		fallthrough
	case relayconstant.RelayModeAudioTranscription:
		err = relay.AudioHelper(c, info)
	case relayconstant.RelayModeRerank:
		err = relay.RerankHelper(c, info)
	case relayconstant.RelayModeEmbeddings:
		err = relay.EmbeddingHelper(c, info)
	case relayconstant.RelayModeResponses, relayconstant.RelayModeResponsesCompact:
		err = relay.ResponsesHelper(c, info)
	case relayconstant.RelayModeAlphaSearch:
		err = relay.AlphaSearchHelper(c, info)
	default:
		err = relay.TextHelper(c, info)
	}
	return err
}

func publicModelUnavailableError(requestId string) *types.NewAPIError {
	message := common.MessageWithRequestId("当前模型不可用", requestId)
	return types.WithOpenAIError(types.OpenAIError{
		Message: message,
		Type:    "server_error",
		Code:    "model_unavailable",
	}, http.StatusInternalServerError)
}

func writeRelayError(c *gin.Context, ws *websocket.Conn, relayFormat types.RelayFormat, relayErr *types.NewAPIError, requestId string) {
	clientErr := relayErr
	if relayErr.IsUpstream() {
		clientErr = publicModelUnavailableError(requestId)
	} else {
		clientErr.SetMessage(common.MessageWithRequestId(clientErr.Error(), requestId))
	}

	if relayFormat == types.RelayFormatOpenAIRealtime {
		helper.WssError(c, ws, clientErr.ToOpenAIError())
		return
	}
	if relayErr.IsUpstream() && c.Writer.Written() {
		writeRelayStreamError(c, relayFormat, clientErr)
		return
	}
	if relayFormat == types.RelayFormatClaude {
		c.JSON(clientErr.StatusCode, gin.H{
			"type":  "error",
			"error": clientErr.ToClaudeError(),
		})
		return
	}
	c.JSON(clientErr.StatusCode, gin.H{
		"error": clientErr.ToOpenAIError(),
	})
}

func writeRelayStreamError(c *gin.Context, relayFormat types.RelayFormat, relayErr *types.NewAPIError) {
	if relayFormat == types.RelayFormatClaude {
		body, err := common.Marshal(gin.H{
			"type":  "error",
			"error": relayErr.ToClaudeError(),
		})
		if err == nil {
			c.Render(-1, common.CustomEvent{Data: "event: error\ndata: " + string(body)})
			_ = helper.FlushWriter(c)
		}
		return
	}
	_ = helper.ObjectData(c, gin.H{"error": relayErr.ToOpenAIError()})
}

func geminiRelayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	if strings.Contains(c.Request.URL.Path, "embed") {
		err = relay.GeminiEmbeddingHandler(c, info)
	} else {
		err = relay.GeminiHelper(c, info)
	}
	return err
}

func Relay(c *gin.Context, relayFormat types.RelayFormat) {

	requestId := c.GetString(common.RequestIdKey)
	//group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	//originalModel := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)

	var (
		newAPIError *types.NewAPIError
		ws          *websocket.Conn
		relayInfo   *relaycommon.RelayInfo
	)

	if relayFormat == types.RelayFormatOpenAIRealtime {
		var err error
		ws, err = upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			helper.WssError(c, ws, types.NewError(err, types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry()).ToOpenAIError())
			return
		}
		defer ws.Close()
	}

	defer func() {
		if newAPIError != nil {
			logger.LogError(c, fmt.Sprintf("relay error: %s", common.LocalLogPreview(newAPIError.Error())))
			writeRelayError(c, ws, relayFormat, newAPIError, requestId)
		}
	}()

	request, err := helper.GetAndValidateRequest(c, relayFormat)
	if err != nil {
		// Map "request body too large" to 413 so clients can handle it correctly
		if common.IsRequestBodyTooLargeError(err) || errors.Is(err, common.ErrRequestBodyTooLarge) {
			newAPIError = types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
		} else {
			newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest)
		}
		return
	}

	relayInfo, err = relaycommon.GenRelayInfo(c, relayFormat, request, ws)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeGenRelayInfoFailed)
		return
	}

	needSensitiveCheck := setting.ShouldCheckPromptSensitive()
	needSmartProtection := service.SmartProtectionEnabled()
	needCountToken := constant.CountToken
	// Avoid building huge CombineText (strings.Join) when token counting and sensitive check are both disabled.
	var meta *types.TokenCountMeta
	if needSensitiveCheck || needSmartProtection || needCountToken {
		meta = request.GetTokenCountMeta()
	} else {
		meta = fastTokenCountMetaForPricing(request)
	}

	if needSensitiveCheck && meta != nil {
		contains, words := service.CheckSensitiveText(meta.CombineText)
		if contains {
			logger.LogWarn(c, fmt.Sprintf("user sensitive words detected: %s", strings.Join(words, ", ")))
			newAPIError = types.NewError(err, types.ErrorCodeSensitiveWordsDetected)
			return
		}
	}

	tokens, err := service.EstimateRequestToken(c, meta, relayInfo)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeCountTokenFailed)
		return
	}

	relayInfo.SetEstimatePromptTokens(tokens)

	priceData, err := helper.ModelPriceHelper(c, relayInfo, tokens, meta)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
		return
	}

	// common.SetContextKey(c, constant.ContextKeyTokenCountMeta, meta)

	if priceData.FreeModel {
		logger.LogInfo(c, fmt.Sprintf("模型 %s 免费，跳过预扣费", relayInfo.OriginModelName))
	} else {
		newAPIError = service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
		if newAPIError != nil {
			return
		}
	}

	defer func() {
		// Only return quota if downstream failed and quota was actually pre-consumed
		if newAPIError != nil {
			newAPIError = service.NormalizeViolationFeeError(newAPIError)
			if relayInfo.Billing != nil {
				relayInfo.Billing.Refund(c)
			}
			service.ChargeViolationFeeIfNeeded(c, relayInfo, newAPIError)
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:         c,
		TokenGroup:  relayInfo.TokenGroup,
		ModelName:   relayInfo.OriginModelName,
		RequestPath: c.Request.URL.Path,
		Retry:       common.GetPointer(0),
	}
	relayInfo.RetryIndex = 0
	relayInfo.LastError = nil
	smartProtectionReviewed := false

	attemptLimit := service.GetRelayAttemptLimit(retryParam)
	for attempt := 0; attempt < attemptLimit; attempt++ {
		retryParam.ResetRateLimitState()
		if attempt > 0 {
			retryParam.IncreaseRetry()
		}
		relayInfo.RetryIndex = retryParam.GetRetry()
		var channel *model.Channel
		var reservation *service.ChannelRateLimitReservation
		var channelErr *types.NewAPIError
		var waitCandidate *channelRateLimitWaitCandidate
		for {
			channel, channelErr = getChannel(c, relayInfo, retryParam)
			if channelErr != nil {
				if channelErr.GetErrorCode() == types.ErrorCodeChannelRateLimited && waitCandidate != nil {
					channel, reservation, channelErr = waitForRateLimitedChannel(c, relayInfo, retryParam, waitCandidate)
				}
				break
			}
			var decision service.ChannelRateLimitDecision
			var reserveErr error
			reservation, decision, reserveErr = service.ReserveChannelRequest(c.Request.Context(), channel)
			if reserveErr != nil {
				rateLimitErr := fmt.Errorf("check request rate limit for channel %d: %w", channel.Id, reserveErr)
				retryParam.MarkRateLimitUnavailable(channel.Id, rateLimitErr)
				if _, specificChannel := c.Get("specific_channel_id"); specificChannel {
					channelErr = types.NewErrorWithStatusCode(
						rateLimitErr,
						types.ErrorCodeGetChannelFailed,
						http.StatusServiceUnavailable,
						types.ErrOptionWithSkipRetry(),
					)
					break
				}
				relayInfo.ChannelMeta = nil
				continue
			}
			if decision.Allowed {
				break
			}
			retryParam.MarkRateLimited(channel.Id, decision.RetryAfterMillis)
			if _, specificChannel := c.Get("specific_channel_id"); specificChannel {
				candidate := &channelRateLimitWaitCandidate{channel: channel, group: relayInfo.UsingGroup, retryAfterMillis: decision.RetryAfterMillis}
				channel, reservation, channelErr = waitForRateLimitedChannel(c, relayInfo, retryParam, candidate)
				break
			}
			if waitCandidate == nil || decision.RetryAfterMillis < waitCandidate.retryAfterMillis {
				waitCandidate = &channelRateLimitWaitCandidate{
					channel: channel, group: relayInfo.UsingGroup, retryAfterMillis: decision.RetryAfterMillis,
				}
			}
			relayInfo.ChannelMeta = nil
		}
		if channelErr != nil {
			logger.LogError(c, channelErr.Error())
			if waitCandidate == nil && channelErr.GetErrorCode() != types.ErrorCodeChannelRateLimited && retryParam.RateLimitError() == nil &&
				service.IsIntelligentSchedulingForGroup(common.GetContextKeyString(c, constant.ContextKeyUsingGroup)) && relayInfo.LastError != nil {
				newAPIError = relayInfo.LastError
			} else {
				newAPIError = channelErr
			}
			break
		}
		addUsedChannel(c, channel.Id)
		retryParam.MarkAttempted(channel.Id)
		if billingErr := service.PrepareTieredBillingForSelectedGroup(c, relayInfo); billingErr != nil {
			service.ReleaseChannelRequestReservation(reservation)
			newAPIError = billingErr
			break
		}
		if !smartProtectionReviewed && service.ShouldProtectChannel(channel.Id) {
			if smartProtectionErr := service.CheckSmartProtection(c, relayInfo, channel.Id, channel.Name, meta); smartProtectionErr != nil {
				service.ReleaseChannelRequestReservation(reservation)
				newAPIError = smartProtectionErr
				break
			}
			smartProtectionReviewed = true
		}

		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			service.ReleaseChannelRequestReservation(reservation)
			// Ensure consistent 413 for oversized bodies even when error occurs later (e.g., retry path)
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
			} else {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		relayInfo.UpstreamStreamError = nil
		relayInfo.ResetUpstreamTiming()
		service.BeginScheduledChannelAttempt(c, relayInfo, channel)
		switch relayFormat {
		case types.RelayFormatOpenAIRealtime:
			newAPIError = relay.WssHelper(c, relayInfo)
		case types.RelayFormatClaude:
			newAPIError = relay.ClaudeHelper(c, relayInfo)
		case types.RelayFormatGemini:
			newAPIError = geminiRelayHandler(c, relayInfo)
		default:
			newAPIError = relayHandler(c, relayInfo)
		}
		if newAPIError == nil && relayInfo.UpstreamStreamError != nil {
			newAPIError = relayInfo.UpstreamStreamError
		}
		if newAPIError != nil && (newAPIError.IsUpstream() || !relayInfo.UpstreamStartTime.IsZero()) {
			newAPIError.MarkUpstream()
		}
		service.FinishScheduledChannelAttempt(relayInfo, channel, newAPIError == nil, newAPIError)
		if relayInfo.UpstreamStartTime.IsZero() {
			service.ReleaseChannelRequestReservation(reservation)
		}

		if newAPIError == nil {
			relayInfo.LastError = nil
			return
		}

		newAPIError = service.NormalizeViolationFeeError(newAPIError)
		relayInfo.LastError = newAPIError

		processChannelError(c, *types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey, common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()), newAPIError)

		if !shouldRetry(c, relayInfo, newAPIError, attemptLimit-attempt-1) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}
	if newAPIError != nil {
		gopool.Go(func() {
			perfmetrics.RecordRelaySample(relayInfo, false, 0)
		})
	}
}

type channelRateLimitWaitCandidate struct {
	channel          *model.Channel
	group            string
	retryAfterMillis int64
}

func waitForRateLimitedChannel(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	retryParam *service.RetryParam,
	candidate *channelRateLimitWaitCandidate,
) (*model.Channel, *service.ChannelRateLimitReservation, *types.NewAPIError) {
	if candidate == nil || candidate.channel == nil {
		return nil, nil, types.NewErrorWithStatusCode(
			errors.New("request rate limit wait candidate is unavailable"),
			types.ErrorCodeGetChannelFailed,
			http.StatusServiceUnavailable,
			types.ErrOptionWithSkipRetry(),
		)
	}
	reservation, err := service.WaitForChannelRequest(c.Request.Context(), candidate.channel)
	if err != nil {
		return nil, nil, types.NewErrorWithStatusCode(
			fmt.Errorf("wait for channel %d request rate limit: %w", candidate.channel.Id, err),
			types.ErrorCodeGetChannelFailed,
			http.StatusServiceUnavailable,
			types.ErrOptionWithSkipRetry(),
		)
	}
	channel, err := model.CacheGetChannel(candidate.channel.Id)
	if err != nil || channel.Status != common.ChannelStatusEnabled {
		service.ReleaseChannelRequestReservation(reservation)
		if err == nil {
			err = fmt.Errorf("channel %d became unavailable while waiting", candidate.channel.Id)
		}
		return nil, nil, types.NewErrorWithStatusCode(
			err,
			types.ErrorCodeGetChannelFailed,
			http.StatusServiceUnavailable,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if candidate.group != "" {
		info.UsingGroup = candidate.group
		common.SetContextKey(c, constant.ContextKeyUsingGroup, candidate.group)
	}
	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
	if setupErr := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName); setupErr != nil {
		service.ReleaseChannelRequestReservation(reservation)
		return nil, nil, setupErr
	}
	retryParam.ResetRateLimitState()
	return channel, reservation, nil
}

var upgrader = websocket.Upgrader{
	Subprotocols: []string{"realtime"}, // WS 握手支持的协议，如果有使用 Sec-WebSocket-Protocol，则必须在此声明对应的 Protocol TODO add other protocol
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

func addUsedChannel(c *gin.Context, channelId int) {
	useChannel := c.GetStringSlice("use_channel")
	useChannel = append(useChannel, fmt.Sprintf("%d", channelId))
	c.Set("use_channel", useChannel)
}

func fastTokenCountMetaForPricing(request dto.Request) *types.TokenCountMeta {
	if request == nil {
		return &types.TokenCountMeta{}
	}
	meta := &types.TokenCountMeta{
		TokenType: types.TokenTypeTokenizer,
	}
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
		maxTokens := lo.FromPtrOr(r.MaxTokens, uint(0))
		if maxCompletionTokens > maxTokens {
			meta.MaxTokens = int(maxCompletionTokens)
		} else {
			meta.MaxTokens = int(maxTokens)
		}
	case *dto.OpenAIResponsesRequest:
		meta.MaxTokens = int(lo.FromPtrOr(r.MaxOutputTokens, uint(0)))
	case *dto.ClaudeRequest:
		meta.MaxTokens = int(lo.FromPtr(r.MaxTokens))
	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	default:
		// Best-effort: leave CombineText empty to avoid large allocations.
	}
	return meta
}

func getChannel(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, *types.NewAPIError) {
	if info.ChannelMeta == nil && !retryParam.HasRateLimited(c.GetInt("channel_id")) {
		channelId := c.GetInt("channel_id")
		channel, err := model.CacheGetChannel(channelId)
		if err != nil {
			return nil, types.NewError(err, types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
		}
		return channel, nil
	}
	channel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)
	if err != nil {
		return nil, types.NewError(fmt.Errorf("获取分组 %s 下模型 %s 的可用渠道失败（retry）: %s", selectGroup, info.OriginModelName, err.Error()), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}
	if channel == nil {
		if rateLimitErr := retryParam.RateLimitError(); rateLimitErr != nil {
			return nil, types.NewErrorWithStatusCode(rateLimitErr, types.ErrorCodeGetChannelFailed, http.StatusServiceUnavailable, types.ErrOptionWithSkipRetry())
		}
		if retryParam.HasRateLimitedChannels() {
			return nil, types.NewErrorWithStatusCode(
				fmt.Errorf("all available channels in group %s reached their request rate limits", selectGroup),
				types.ErrorCodeChannelRateLimited,
				http.StatusServiceUnavailable,
				types.ErrOptionWithSkipRetry(),
			)
		}
		return nil, types.NewError(fmt.Errorf("分组 %s 下模型 %s 的可用渠道不存在（retry）", selectGroup, info.OriginModelName), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}

	if selectGroup != "" {
		info.UsingGroup = selectGroup
		common.SetContextKey(c, constant.ContextKeyUsingGroup, selectGroup)
	}
	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)

	newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
	if newAPIError != nil {
		return nil, newAPIError
	}
	return channel, nil
}

func shouldRetry(c *gin.Context, relayInfo *relaycommon.RelayInfo, openaiErr *types.NewAPIError, retryTimes int) bool {
	if openaiErr == nil {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if service.IsIntelligentSchedulingForGroup(usingGroup) {
		return retryTimes > 0 && service.ShouldRetryIntelligentSchedulingError(
			usingGroup, relayInfo, openaiErr,
		) && canRetryIntelligentRelayResponse(c, relayInfo)
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if types.IsChannelError(openaiErr) {
		return true
	}
	if types.IsSkipRetryError(openaiErr) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	code := openaiErr.StatusCode
	if code >= 200 && code < 300 {
		return false
	}
	if code < 100 || code > 599 {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(openaiErr.GetErrorCode()) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(code)
}

func canRetryIntelligentRelayResponse(c *gin.Context, relayInfo *relaycommon.RelayInfo) bool {
	if c == nil || relayInfo == nil {
		return false
	}
	if c.Writer.Status() == http.StatusSwitchingProtocols {
		return false
	}
	if relayInfo.IsStream {
		return !relayInfo.HasSendResponse() && relayInfo.UpstreamFirstContentTime.IsZero()
	}
	return !relayInfo.HasSendResponse() && !c.Writer.Written()
}

func processChannelError(c *gin.Context, channelError types.ChannelError, err *types.NewAPIError) {
	logger.LogError(c, fmt.Sprintf("channel error (channel #%d, status code: %d): %s", channelError.ChannelId, err.StatusCode, common.LocalLogPreview(err.Error())))
	// 不要使用context获取渠道信息，异步处理时可能会出现渠道信息不一致的情况
	// do not use context to get channel info, there may be inconsistent channel info when processing asynchronously
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if !service.IsIntelligentSchedulingForGroup(usingGroup) && service.ShouldDisableChannel(err) && channelError.AutoBan {
		gopool.Go(func() {
			service.DisableChannel(channelError, err.ErrorWithStatusCode())
		})
	}

	if constant.ErrorLogEnabled && types.IsRecordErrorLog(err) {
		// 保存错误日志到mysql中
		userId := c.GetInt("id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		tokenId := c.GetInt("token_id")
		channelId := c.GetInt("channel_id")
		other := make(map[string]interface{})
		if c.Request != nil && c.Request.URL != nil {
			other["request_path"] = c.Request.URL.Path
		}
		other["error_type"] = err.GetErrorType()
		other["error_code"] = err.GetErrorCode()
		if err.IsUpstream() {
			other["status_code"] = http.StatusInternalServerError
		} else {
			other["status_code"] = err.StatusCode
		}
		adminInfo := make(map[string]interface{})
		usedChannels := c.GetStringSlice("use_channel")
		adminInfo["use_channel"] = usedChannels
		adminInfo["channel_id"] = channelError.ChannelId
		adminInfo["channel_name"] = channelError.ChannelName
		adminInfo["channel_type"] = channelError.ChannelType
		if err.IsUpstream() {
			details := err.UpstreamError()
			if details == nil || details.Body == "" {
				body, marshalErr := common.Marshal(err.RelayError)
				if marshalErr != nil || string(body) == "null" {
					body = []byte(err.Error())
				}
				service.MarkUpstreamError(err, err.StatusCode, "", string(body))
				details = err.UpstreamError()
			}
			upstreamError := map[string]interface{}{
				"attempt":      len(usedChannels),
				"status_code":  err.StatusCode,
				"channel_id":   channelError.ChannelId,
				"channel_name": channelError.ChannelName,
				"channel_type": channelError.ChannelType,
				"stream":       common.GetContextKeyBool(c, constant.ContextKeyIsStream),
			}
			if details != nil {
				if details.StatusCode != 0 {
					upstreamError["status_code"] = details.StatusCode
				}
				if details.ContentType != "" {
					upstreamError["content_type"] = details.ContentType
				}
				if details.Body != "" {
					upstreamError["body"] = details.Body
				}
			}
			adminInfo["upstream_error"] = upstreamError
		}
		isMultiKey := common.GetContextKeyBool(c, constant.ContextKeyChannelIsMultiKey)
		if isMultiKey {
			adminInfo["is_multi_key"] = true
			adminInfo["multi_key_index"] = common.GetContextKeyInt(c, constant.ContextKeyChannelMultiKeyIndex)
		}
		service.AppendChannelAffinityAdminInfo(c, adminInfo)
		other["admin_info"] = adminInfo
		startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
		if startTime.IsZero() {
			startTime = time.Now()
		}
		useTimeSeconds := int(time.Since(startTime).Seconds())
		content := err.MaskSensitiveErrorWithStatusCode()
		if err.IsUpstream() {
			content = "当前模型不可用"
		}
		model.RecordErrorLog(c, userId, channelId, modelName, tokenName, content, tokenId, useTimeSeconds, common.GetContextKeyBool(c, constant.ContextKeyIsStream), usingGroup, other)
	}

}

func RelayMidjourney(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatMjProxy, nil, nil)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"description": fmt.Sprintf("failed to generate relay info: %s", err.Error()),
			"type":        "upstream_error",
			"code":        4,
		})
		return
	}

	var mjErr *taskdto.MidjourneyResponse
	switch relayInfo.RelayMode {
	case relayconstant.RelayModeMidjourneyNotify:
		mjErr = relay.RelayMidjourneyNotify(c)
	case relayconstant.RelayModeMidjourneyTaskFetch, relayconstant.RelayModeMidjourneyTaskFetchByCondition:
		mjErr = relay.RelayMidjourneyTask(c, relayInfo.RelayMode)
	case relayconstant.RelayModeMidjourneyTaskImageSeed:
		mjErr = relay.RelayMidjourneyTaskImageSeed(c)
	case relayconstant.RelayModeSwapFace:
		mjErr = relay.RelaySwapFace(c, relayInfo)
	default:
		mjErr = relay.RelayMidjourneySubmit(c, relayInfo)
	}
	//err = relayMidjourneySubmit(c, relayMode)
	log.Println(mjErr)
	if mjErr != nil {
		upstreamMessage := strings.TrimSpace(fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result))
		upstreamErr := types.NewOpenAIError(errors.New(upstreamMessage), types.ErrorCodeBadResponse, http.StatusBadRequest)
		body, _ := common.Marshal(mjErr)
		service.MarkUpstreamError(upstreamErr, http.StatusBadRequest, "application/json", string(body))
		processChannelError(c, *types.NewChannelError(
			c.GetInt("channel_id"),
			c.GetInt("channel_type"),
			c.GetString("channel_name"),
			common.GetContextKeyBool(c, constant.ContextKeyChannelIsMultiKey),
			common.GetContextKeyString(c, constant.ContextKeyChannelKey),
			c.GetBool("auto_ban"),
		), upstreamErr)
		c.JSON(http.StatusInternalServerError, gin.H{
			"description": "当前模型不可用",
			"type":        "upstream_error",
			"code":        4,
		})
	}
}

func RelayNotImplemented(c *gin.Context) {
	err := types.OpenAIError{
		Message: "API not implemented",
		Type:    "new_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := types.OpenAIError{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}

func RelayTaskFetch(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &taskdto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}
	if taskErr := relay.RelayTaskFetch(c, relayInfo.RelayMode); taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

func RelayTask(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &taskdto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}

	if taskErr := relay.ResolveOriginTask(c, relayInfo); taskErr != nil {
		respondTaskError(c, taskErr)
		return
	}

	var result *relay.TaskSubmitResult
	var taskErr *taskdto.TaskError
	defer func() {
		if taskErr != nil && relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:         c,
		TokenGroup:  relayInfo.TokenGroup,
		ModelName:   relayInfo.OriginModelName,
		RequestPath: c.Request.URL.Path,
		Retry:       common.GetPointer(0),
	}

	attemptLimit := service.GetRelayAttemptLimit(retryParam)
	for attempt := 0; attempt < attemptLimit; attempt++ {
		retryParam.ResetRateLimitState()
		if attempt > 0 {
			retryParam.IncreaseRetry()
		}
		var channel *model.Channel
		var reservation *service.ChannelRateLimitReservation
		lockedChannel, channelLocked := relayInfo.LockedChannel.(*model.Channel)
		channelLocked = channelLocked && lockedChannel != nil
		_, specificChannel := c.Get("specific_channel_id")
		fixedChannel := channelLocked || specificChannel
		channelSelectionFailed := false
		var waitCandidate *channelRateLimitWaitCandidate
		for {
			if channelLocked {
				channel = lockedChannel
				if retryParam.GetRetry() > 0 {
					if setupErr := middleware.SetupContextForSelectedChannel(c, channel, relayInfo.OriginModelName); setupErr != nil {
						taskErr = service.TaskErrorWrapperLocal(setupErr.Err, "setup_locked_channel_failed", http.StatusInternalServerError)
						channelSelectionFailed = true
						break
					}
				}
			} else {
				var channelErr *types.NewAPIError
				channel, channelErr = getChannel(c, relayInfo, retryParam)
				if channelErr != nil {
					if channelErr.GetErrorCode() == types.ErrorCodeChannelRateLimited && waitCandidate != nil {
						channel, reservation, channelErr = waitForRateLimitedChannel(c, relayInfo, retryParam, waitCandidate)
						if channelErr == nil {
							break
						}
					}
					logger.LogError(c, channelErr.Error())
					if taskErr == nil ||
						channelErr.GetErrorCode() == types.ErrorCodeChannelRateLimited ||
						retryParam.RateLimitError() != nil ||
						!service.IsIntelligentSchedulingForGroup(common.GetContextKeyString(c, constant.ContextKeyUsingGroup)) {
						code := string(channelErr.GetErrorCode())
						if code == "" {
							code = "get_channel_failed"
						}
						taskErr = service.TaskErrorWrapperLocal(channelErr.Err, code, channelErr.StatusCode)
					}
					channelSelectionFailed = true
					break
				}
			}

			var decision service.ChannelRateLimitDecision
			var reserveErr error
			reservation, decision, reserveErr = service.ReserveChannelRequest(c.Request.Context(), channel)
			if reserveErr != nil {
				rateLimitErr := fmt.Errorf("check request rate limit for channel %d: %w", channel.Id, reserveErr)
				retryParam.MarkRateLimitUnavailable(channel.Id, rateLimitErr)
				if fixedChannel {
					taskErr = service.TaskErrorWrapperLocal(rateLimitErr, "channel_rate_limit_unavailable", http.StatusServiceUnavailable)
					channelSelectionFailed = true
					break
				}
				relayInfo.ChannelMeta = nil
				continue
			}
			if decision.Allowed {
				break
			}
			retryParam.MarkRateLimited(channel.Id, decision.RetryAfterMillis)
			if fixedChannel {
				candidate := &channelRateLimitWaitCandidate{channel: channel, group: relayInfo.UsingGroup, retryAfterMillis: decision.RetryAfterMillis}
				var waitErr *types.NewAPIError
				channel, reservation, waitErr = waitForRateLimitedChannel(c, relayInfo, retryParam, candidate)
				if waitErr != nil {
					taskErr = service.TaskErrorWrapperLocal(waitErr.Err, string(waitErr.GetErrorCode()), waitErr.StatusCode)
					channelSelectionFailed = true
				}
				break
			}
			if waitCandidate == nil || decision.RetryAfterMillis < waitCandidate.retryAfterMillis {
				waitCandidate = &channelRateLimitWaitCandidate{
					channel: channel, group: relayInfo.UsingGroup, retryAfterMillis: decision.RetryAfterMillis,
				}
			}
			relayInfo.ChannelMeta = nil
		}
		if channelSelectionFailed {
			break
		}

		addUsedChannel(c, channel.Id)
		retryParam.MarkAttempted(channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			service.ReleaseChannelRequestReservation(reservation)
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusRequestEntityTooLarge)
			} else {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusBadRequest)
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		relayInfo.ResetUpstreamTiming()
		service.BeginScheduledChannelAttempt(c, relayInfo, channel)
		result, taskErr = relay.RelayTaskSubmit(c, relayInfo)
		if relayInfo.UpstreamStartTime.IsZero() {
			service.ReleaseChannelRequestReservation(reservation)
		}
		if taskErr == nil {
			service.FinishScheduledChannelAttempt(relayInfo, channel, true, nil)
			break
		}
		schedulingErr := types.NewOpenAIError(taskErr.Error, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode)
		if !taskErr.LocalError {
			if diagnostics := relayInfo.TaskUpstreamDiagnostics; diagnostics != nil {
				service.MarkUpstreamError(schedulingErr, diagnostics.HTTPStatus, diagnostics.ContentType, diagnostics.ResponseBody)
			} else {
				schedulingErr.MarkUpstream()
			}
		}
		service.FinishScheduledChannelAttempt(relayInfo, channel, false, schedulingErr)

		if !taskErr.LocalError {
			processChannelError(c,
				*types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey,
					common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()),
				schedulingErr)
		}
		if relayInfo.LockedChannel != nil && service.IsHandledByIntelligentChannelScheduling(
			common.GetContextKeyString(c, constant.ContextKeyUsingGroup), schedulingErr,
		) {
			break
		}

		if !shouldRetryTaskRelay(c, relayInfo, channel.Id, taskErr, attemptLimit-attempt-1) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}

	// ── 成功：结算 + 日志 + 插入任务 ──
	if taskErr == nil {
		if settleErr := service.SettleBilling(c, relayInfo, result.Quota); settleErr != nil {
			common.SysError("settle task billing error: " + settleErr.Error())
		}
		service.LogTaskConsumption(c, relayInfo)

		task := model.InitTask(result.Platform, relayInfo)
		task.Ip = c.ClientIP()
		task.PrivateData.UpstreamTaskID = result.UpstreamTaskID
		task.PrivateData.TaskRoute = result.TaskRoute
		task.PrivateData.BillingSource = relayInfo.BillingSource
		task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
		task.PrivateData.TokenId = relayInfo.TokenId
		task.PrivateData.NodeName = common.NodeName
		task.PrivateData.BillingContext = service.NewTaskBillingContext(relayInfo)
		task.Quota = result.Quota
		task.Data = result.TaskData
		task.Action = relayInfo.Action
		if insertErr := task.Insert(); insertErr != nil {
			common.SysError("insert task error: " + insertErr.Error())
		}
	}

	if taskErr != nil {
		platform := constant.TaskPlatform(c.GetString("platform"))
		if platform == "" {
			platform = relay.GetTaskPlatform(c)
		}
		service.RecordTaskSubmissionFailure(c, relayInfo, platform, taskErr)
		respondTaskError(c, taskErr)
	}
}

func respondTaskError(c *gin.Context, taskErr *taskdto.TaskError) {
	if !taskErr.LocalError {
		c.JSON(http.StatusInternalServerError, &taskdto.TaskError{
			Code:       "model_unavailable",
			Message:    "当前模型不可用",
			StatusCode: http.StatusInternalServerError,
		})
		return
	}
	c.JSON(taskErr.StatusCode, taskErr)
}

func shouldRetryTaskRelay(c *gin.Context, relayInfo *relaycommon.RelayInfo, channelId int, taskErr *taskdto.TaskError, retryTimes int) bool {
	if taskErr == nil {
		return false
	}
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if service.IsIntelligentSchedulingForGroup(usingGroup) {
		return retryTimes > 0 && !taskErr.LocalError && service.ShouldRetryIntelligentSchedulingError(
			usingGroup,
			relayInfo,
			types.NewOpenAIError(taskErr.Error, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode),
		)
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	if taskErr.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if taskErr.StatusCode == 307 {
		return true
	}
	if taskErr.StatusCode/100 == 5 {
		// 超时不重试
		if operation_setting.IsAlwaysSkipRetryStatusCode(taskErr.StatusCode) {
			return false
		}
		return true
	}
	if taskErr.StatusCode == http.StatusBadRequest {
		return false
	}
	if taskErr.StatusCode == 408 {
		// azure处理超时不重试
		return false
	}
	if taskErr.LocalError {
		return false
	}
	if taskErr.StatusCode/100 == 2 {
		return false
	}
	return true
}
