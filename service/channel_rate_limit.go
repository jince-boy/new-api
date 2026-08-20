package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

const (
	channelRateLimitNamespace        = "channelRateLimit:v1"
	channelRateLimitShardCount       = 64
	channelRateLimitTimeout          = 2 * time.Second
	channelRateLimitQueuePollMin     = 10 * time.Millisecond
	channelRateLimitQueuePollMax     = 5 * time.Second
	channelRateLimitWaiterStaleAfter = 20 * time.Second
)

const redisChannelRateLimitTakeScript = `
local redis_time = redis.call('TIME')
local now = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local stale_after = tonumber(ARGV[4])
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local stale_waiters = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now - stale_after, 'LIMIT', 0, 1000)
for _, stale_member in ipairs(stale_waiters) do
  redis.call('ZREM', KEYS[2], stale_member)
  redis.call('ZREM', KEYS[3], stale_member)
end
local count = redis.call('ZCARD', KEYS[1])
if redis.call('ZCARD', KEYS[2]) > 0 then
  local retry_after = 10
  if count >= limit then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    if #oldest == 2 then
      retry_after = math.max(1, tonumber(oldest[2]) + window - now)
    end
  end
  return {0, count, retry_after}
end
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry_after = 1
  if #oldest == 2 then
    retry_after = math.max(1, tonumber(oldest[2]) + window - now)
  end
  return {0, count, retry_after}
end
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window + 1000)
return {1, count + 1, 0}
`

const redisChannelRateLimitWaitScript = `
local redis_time = redis.call('TIME')
local now = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local stale_after = tonumber(ARGV[4])
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local stale_waiters = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now - stale_after, 'LIMIT', 0, 1000)
for _, stale_member in ipairs(stale_waiters) do
  redis.call('ZREM', KEYS[2], stale_member)
  redis.call('ZREM', KEYS[3], stale_member)
end
if not redis.call('ZSCORE', KEYS[2], member) then
  local sequence = redis.call('INCR', KEYS[4])
  redis.call('ZADD', KEYS[2], sequence, member)
end
redis.call('ZADD', KEYS[3], now, member)
local count = redis.call('ZCARD', KEYS[1])
local head = redis.call('ZRANGE', KEYS[2], 0, 0)
if #head == 1 and head[1] == member and count < limit then
  redis.call('ZREM', KEYS[2], member)
  redis.call('ZREM', KEYS[3], member)
  redis.call('ZADD', KEYS[1], now, member)
  redis.call('PEXPIRE', KEYS[1], window + 1000)
  redis.call('PEXPIRE', KEYS[2], stale_after * 2)
  redis.call('PEXPIRE', KEYS[3], stale_after * 2)
  redis.call('PEXPIRE', KEYS[4], stale_after * 2)
  return {1, count + 1, 0}
end
local retry_after = 10
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if #oldest == 2 then
    retry_after = math.max(1, tonumber(oldest[2]) + window - now)
  end
end
redis.call('PEXPIRE', KEYS[2], stale_after * 2)
redis.call('PEXPIRE', KEYS[3], stale_after * 2)
redis.call('PEXPIRE', KEYS[4], stale_after * 2)
return {0, count, retry_after}
`

type ChannelRateLimitDecision struct {
	Allowed          bool
	Used             int
	Limit            int
	RetryAfterMillis int64
}

type ChannelRateLimitReservation struct {
	channelId int
	member    string
	redis     bool
}

type channelRateLimitEntry struct {
	member string
	atMs   int64
}

type channelRateLimitShard struct {
	mu      sync.Mutex
	entries map[int][]channelRateLimitEntry
	waiters map[int][]string
}

var channelRateLimitShards [channelRateLimitShardCount]channelRateLimitShard
var channelRateLimitMemberSequence atomic.Uint64

func ReserveChannelRequest(ctx context.Context, channel *model.Channel) (*ChannelRateLimitReservation, ChannelRateLimitDecision, error) {
	limit, err := channelRequestRateLimit(channel)
	if err != nil {
		return nil, ChannelRateLimitDecision{}, err
	}
	if limit == nil {
		return nil, ChannelRateLimitDecision{Allowed: true}, nil
	}
	member := fmt.Sprintf("%s:%d", common.NewRequestId(), channelRateLimitMemberSequence.Add(1))
	if common.RedisEnabled {
		decision, err := takeRedisChannelRequestRateLimit(ctx, channel.Id, member, limit)
		if err != nil || !decision.Allowed {
			return nil, decision, err
		}
		return &ChannelRateLimitReservation{channelId: channel.Id, member: member, redis: true}, decision, nil
	}
	decision := takeLocalChannelRequestRateLimit(channel.Id, member, limit, time.Now())
	if !decision.Allowed {
		return nil, decision, nil
	}
	return &ChannelRateLimitReservation{channelId: channel.Id, member: member}, decision, nil
}

func WaitForChannelRequest(ctx context.Context, channel *model.Channel) (*ChannelRateLimitReservation, error) {
	limit, err := channelRequestRateLimit(channel)
	if err != nil {
		return nil, err
	}
	if limit == nil {
		return nil, nil
	}
	member := fmt.Sprintf("%s:%d", common.NewRequestId(), channelRateLimitMemberSequence.Add(1))
	if common.RedisEnabled {
		return waitRedisChannelRequestRateLimit(ctx, channel.Id, member, limit)
	}
	return waitLocalChannelRequestRateLimit(ctx, channel.Id, member, limit)
}

func ReleaseChannelRequestReservation(reservation *ChannelRateLimitReservation) {
	if reservation == nil {
		return
	}
	if reservation.redis {
		ctx, cancel := context.WithTimeout(context.Background(), channelRateLimitTimeout)
		defer cancel()
		if common.RDB == nil {
			logger.LogWarn(ctx, fmt.Sprintf("failed to release channel rate limit reservation: channel_id=%d Redis client is not initialized", reservation.channelId))
			return
		}
		if err := common.RDB.ZRem(ctx, channelRateLimitKey(reservation.channelId), reservation.member).Err(); err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("failed to release channel rate limit reservation: channel_id=%d error=%v", reservation.channelId, err))
		}
		return
	}
	releaseLocalChannelRequestRateLimit(reservation.channelId, reservation.member)
}

func channelRequestRateLimit(channel *model.Channel) (*dto.ChannelRequestRateLimit, error) {
	if channel == nil || channel.Id <= 0 {
		return nil, nil
	}
	limit := channel.GetOtherSettings().RequestRateLimit
	if err := limit.Validate(); err != nil {
		return nil, fmt.Errorf("invalid request rate limit for channel %d: %w", channel.Id, err)
	}
	return limit, nil
}

func channelRateLimitKey(channelId int) string {
	return fmt.Sprintf("%s:%d", channelRateLimitNamespace, channelId)
}

func channelRateLimitQueueKey(channelId int) string {
	return fmt.Sprintf("%s:queue:%d", channelRateLimitNamespace, channelId)
}

func channelRateLimitQueueHeartbeatKey(channelId int) string {
	return fmt.Sprintf("%s:queue-heartbeat:%d", channelRateLimitNamespace, channelId)
}

func channelRateLimitQueueSequenceKey(channelId int) string {
	return fmt.Sprintf("%s:queue-sequence:%d", channelRateLimitNamespace, channelId)
}

func takeRedisChannelRequestRateLimit(ctx context.Context, channelId int, member string, limit *dto.ChannelRequestRateLimit) (ChannelRateLimitDecision, error) {
	return evalRedisChannelRateLimit(
		ctx,
		redisChannelRateLimitTakeScript,
		[]string{
			channelRateLimitKey(channelId),
			channelRateLimitQueueKey(channelId),
			channelRateLimitQueueHeartbeatKey(channelId),
		},
		limit,
		member,
		channelRateLimitWaiterStaleAfter.Milliseconds(),
	)
}

func waitRedisChannelRequestRateLimit(ctx context.Context, channelId int, member string, limit *dto.ChannelRequestRateLimit) (*ChannelRateLimitReservation, error) {
	for {
		decision, err := pollRedisChannelRequestRateLimitWaiter(ctx, channelId, member, limit)
		if err != nil {
			releaseRedisChannelRateLimitWaiter(channelId, member)
			return nil, err
		}
		if decision.Allowed {
			return &ChannelRateLimitReservation{channelId: channelId, member: member, redis: true}, nil
		}
		if err := waitForChannelRateLimitRetry(ctx, decision.RetryAfterMillis); err != nil {
			releaseRedisChannelRateLimitWaiter(channelId, member)
			return nil, err
		}
	}
}

func pollRedisChannelRequestRateLimitWaiter(ctx context.Context, channelId int, member string, limit *dto.ChannelRequestRateLimit) (ChannelRateLimitDecision, error) {
	keys := []string{
		channelRateLimitKey(channelId),
		channelRateLimitQueueKey(channelId),
		channelRateLimitQueueHeartbeatKey(channelId),
		channelRateLimitQueueSequenceKey(channelId),
	}
	return evalRedisChannelRateLimit(
		ctx,
		redisChannelRateLimitWaitScript,
		keys,
		limit,
		member,
		channelRateLimitWaiterStaleAfter.Milliseconds(),
	)
}

func evalRedisChannelRateLimit(ctx context.Context, script string, keys []string, limit *dto.ChannelRequestRateLimit, extraArgs ...any) (ChannelRateLimitDecision, error) {
	decision := ChannelRateLimitDecision{Limit: limit.MaxRequests}
	if common.RDB == nil {
		return decision, errors.New("Redis client is not initialized")
	}
	redisCtx, cancel := context.WithTimeout(ctx, channelRateLimitTimeout)
	defer cancel()
	args := []any{int64(limit.WindowSeconds) * 1000, limit.MaxRequests}
	args = append(args, extraArgs...)
	values, err := common.RDB.Eval(redisCtx, script, keys, args...).Slice()
	if err != nil {
		return decision, err
	}
	if len(values) != 3 {
		return decision, fmt.Errorf("unexpected channel rate limit reply length %d", len(values))
	}
	allowed, err := channelRateLimitReplyInteger(values[0])
	if err != nil {
		return decision, err
	}
	used, err := channelRateLimitReplyInteger(values[1])
	if err != nil {
		return decision, err
	}
	retryAfter, err := channelRateLimitReplyInteger(values[2])
	if err != nil {
		return decision, err
	}
	decision.Allowed = allowed == 1
	decision.Used = int(used)
	decision.RetryAfterMillis = retryAfter
	return decision, nil
}

func releaseRedisChannelRateLimitWaiter(channelId int, member string) {
	ctx, cancel := context.WithTimeout(context.Background(), channelRateLimitTimeout)
	defer cancel()
	if common.RDB == nil {
		return
	}
	if err := common.RDB.ZRem(ctx, channelRateLimitQueueKey(channelId), member).Err(); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("failed to release channel rate limit waiter: channel_id=%d error=%v", channelId, err))
	}
	if err := common.RDB.ZRem(ctx, channelRateLimitQueueHeartbeatKey(channelId), member).Err(); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("failed to release channel rate limit waiter heartbeat: channel_id=%d error=%v", channelId, err))
	}
}

func channelRateLimitReplyInteger(value any) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case string:
		return strconv.ParseInt(typed, 10, 64)
	case []byte:
		return strconv.ParseInt(string(typed), 10, 64)
	default:
		return 0, fmt.Errorf("unexpected channel rate limit reply type %T", value)
	}
}

func takeLocalChannelRequestRateLimit(channelId int, member string, limit *dto.ChannelRequestRateLimit, now time.Time) ChannelRateLimitDecision {
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	defer shard.mu.Unlock()
	nowMs := now.UnixMilli()
	entries := pruneLocalChannelRateLimitEntries(shard, channelId, int64(limit.WindowSeconds)*1000, nowMs)
	if len(shard.waiters[channelId]) > 0 {
		decision := localChannelRateLimitDecision(entries, limit, nowMs)
		decision.Allowed = false
		if decision.RetryAfterMillis == 0 {
			decision.RetryAfterMillis = channelRateLimitQueuePollMin.Milliseconds()
		}
		return decision
	}
	decision := localChannelRateLimitDecision(entries, limit, nowMs)
	if !decision.Allowed {
		return decision
	}
	if shard.entries == nil {
		shard.entries = make(map[int][]channelRateLimitEntry)
	}
	entries = append(entries, channelRateLimitEntry{member: member, atMs: nowMs})
	shard.entries[channelId] = entries
	decision.Used = len(entries)
	return decision
}

func waitLocalChannelRequestRateLimit(ctx context.Context, channelId int, member string, limit *dto.ChannelRequestRateLimit) (*ChannelRateLimitReservation, error) {
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	if shard.waiters == nil {
		shard.waiters = make(map[int][]string)
	}
	shard.waiters[channelId] = append(shard.waiters[channelId], member)
	shard.mu.Unlock()

	for {
		decision := pollLocalChannelRequestRateLimitWaiter(channelId, member, limit, time.Now())
		if decision.Allowed {
			return &ChannelRateLimitReservation{channelId: channelId, member: member}, nil
		}
		if err := waitForChannelRateLimitRetry(ctx, decision.RetryAfterMillis); err != nil {
			releaseLocalChannelRateLimitWaiter(channelId, member)
			return nil, err
		}
	}
}

func pollLocalChannelRequestRateLimitWaiter(channelId int, member string, limit *dto.ChannelRequestRateLimit, now time.Time) ChannelRateLimitDecision {
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	defer shard.mu.Unlock()
	nowMs := now.UnixMilli()
	entries := pruneLocalChannelRateLimitEntries(shard, channelId, int64(limit.WindowSeconds)*1000, nowMs)
	waiters := shard.waiters[channelId]
	if len(waiters) > 0 && waiters[0] == member && len(entries) < limit.MaxRequests {
		if len(waiters) == 1 {
			delete(shard.waiters, channelId)
		} else {
			shard.waiters[channelId] = waiters[1:]
		}
		if shard.entries == nil {
			shard.entries = make(map[int][]channelRateLimitEntry)
		}
		entries = append(entries, channelRateLimitEntry{member: member, atMs: nowMs})
		shard.entries[channelId] = entries
		return ChannelRateLimitDecision{Allowed: true, Used: len(entries), Limit: limit.MaxRequests}
	}
	decision := localChannelRateLimitDecision(entries, limit, nowMs)
	decision.Allowed = false
	if decision.RetryAfterMillis == 0 {
		decision.RetryAfterMillis = channelRateLimitQueuePollMin.Milliseconds()
	}
	return decision
}

func waitForChannelRateLimitRetry(ctx context.Context, retryAfterMillis int64) error {
	wait := time.Duration(retryAfterMillis) * time.Millisecond
	if wait < channelRateLimitQueuePollMin {
		wait = channelRateLimitQueuePollMin
	}
	if wait > channelRateLimitQueuePollMax {
		wait = channelRateLimitQueuePollMax
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func pruneLocalChannelRateLimitEntries(shard *channelRateLimitShard, channelId int, windowMs int64, nowMs int64) []channelRateLimitEntry {
	if shard.entries == nil {
		return nil
	}
	entries := shard.entries[channelId]
	cutoff := nowMs - windowMs
	firstActive := 0
	for firstActive < len(entries) && entries[firstActive].atMs <= cutoff {
		firstActive++
	}
	if firstActive > 0 {
		entries = append([]channelRateLimitEntry(nil), entries[firstActive:]...)
	}
	if len(entries) == 0 {
		delete(shard.entries, channelId)
		return nil
	}
	shard.entries[channelId] = entries
	return entries
}

func localChannelRateLimitDecision(entries []channelRateLimitEntry, limit *dto.ChannelRequestRateLimit, nowMs int64) ChannelRateLimitDecision {
	decision := ChannelRateLimitDecision{Allowed: len(entries) < limit.MaxRequests, Used: len(entries), Limit: limit.MaxRequests}
	if !decision.Allowed && len(entries) > 0 {
		retryAfter := entries[0].atMs + int64(limit.WindowSeconds)*1000 - nowMs
		if retryAfter < 1 {
			retryAfter = 1
		}
		decision.RetryAfterMillis = retryAfter
	}
	return decision
}

func releaseLocalChannelRequestRateLimit(channelId int, member string) {
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	defer shard.mu.Unlock()
	entries := shard.entries[channelId]
	for index := range entries {
		if entries[index].member != member {
			continue
		}
		entries = append(entries[:index], entries[index+1:]...)
		if len(entries) == 0 {
			delete(shard.entries, channelId)
		} else {
			shard.entries[channelId] = entries
		}
		return
	}
}

func releaseLocalChannelRateLimitWaiter(channelId int, member string) {
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	defer shard.mu.Unlock()
	waiters := shard.waiters[channelId]
	for index := range waiters {
		if waiters[index] != member {
			continue
		}
		waiters = append(waiters[:index], waiters[index+1:]...)
		if len(waiters) == 0 {
			delete(shard.waiters, channelId)
		} else {
			shard.waiters[channelId] = waiters
		}
		return
	}
}
