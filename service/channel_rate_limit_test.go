package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetLocalChannelRateLimits() {
	for index := range channelRateLimitShards {
		shard := &channelRateLimitShards[index]
		shard.mu.Lock()
		shard.entries = nil
		shard.waiters = nil
		shard.mu.Unlock()
	}
}

func channelWithRequestRateLimit(t *testing.T, channelId int, maxRequests int, windowSeconds int) *model.Channel {
	t.Helper()
	channel := &model.Channel{Id: channelId}
	channel.SetOtherSettings(dto.ChannelOtherSettings{
		RequestRateLimit: &dto.ChannelRequestRateLimit{
			MaxRequests:   maxRequests,
			WindowSeconds: windowSeconds,
		},
	})
	return channel
}

func TestLocalChannelRequestRateLimitUsesRollingWindow(t *testing.T) {
	resetLocalChannelRateLimits()
	limit := &dto.ChannelRequestRateLimit{MaxRequests: 2, WindowSeconds: 60}
	startedAt := time.Unix(1_700_000_000, 0)

	first := takeLocalChannelRequestRateLimit(101, "first", limit, startedAt)
	second := takeLocalChannelRequestRateLimit(101, "second", limit, startedAt.Add(30*time.Second))
	blocked := takeLocalChannelRequestRateLimit(101, "blocked", limit, startedAt.Add(59*time.Second))
	afterExpiry := takeLocalChannelRequestRateLimit(101, "after-expiry", limit, startedAt.Add(60*time.Second))

	assert.True(t, first.Allowed)
	assert.True(t, second.Allowed)
	assert.False(t, blocked.Allowed)
	assert.Equal(t, int64(1000), blocked.RetryAfterMillis)
	assert.True(t, afterExpiry.Allowed)
	assert.Equal(t, 2, afterExpiry.Used)
}

func TestLocalChannelRequestRateLimitIsAtomicUnderConcurrency(t *testing.T) {
	resetLocalChannelRateLimits()
	limit := &dto.ChannelRequestRateLimit{MaxRequests: 7, WindowSeconds: 60}
	startedAt := time.Unix(1_700_000_000, 0)
	var allowed atomic.Int32
	var waitGroup sync.WaitGroup

	for index := 0; index < 100; index++ {
		waitGroup.Add(1)
		go func(member string) {
			defer waitGroup.Done()
			if takeLocalChannelRequestRateLimit(102, member, limit, startedAt).Allowed {
				allowed.Add(1)
			}
		}(common.GetRandomString(12))
	}
	waitGroup.Wait()

	assert.Equal(t, int32(7), allowed.Load())
}

func TestLocalChannelRequestRateLimitQueuesThirtyFiveRequestsBehindThirtySlots(t *testing.T) {
	resetLocalChannelRateLimits()
	const channelId = 109
	limit := &dto.ChannelRequestRateLimit{MaxRequests: 30, WindowSeconds: 60}
	startedAt := time.Unix(1_700_000_000, 0)

	for index := 0; index < 30; index++ {
		decision := takeLocalChannelRequestRateLimit(channelId, fmt.Sprintf("active-%d", index), limit, startedAt)
		require.True(t, decision.Allowed)
	}
	shard := &channelRateLimitShards[channelId%channelRateLimitShardCount]
	shard.mu.Lock()
	shard.waiters = map[int][]string{channelId: {"wait-1", "wait-2", "wait-3", "wait-4", "wait-5"}}
	shard.mu.Unlock()

	for index := 1; index <= 5; index++ {
		decision := pollLocalChannelRequestRateLimitWaiter(channelId, fmt.Sprintf("wait-%d", index), limit, startedAt.Add(59*time.Second))
		assert.False(t, decision.Allowed)
	}
	bypass := takeLocalChannelRequestRateLimit(channelId, "new-arrival", limit, startedAt.Add(60*time.Second))
	assert.False(t, bypass.Allowed)
	for index := 1; index <= 5; index++ {
		decision := pollLocalChannelRequestRateLimitWaiter(channelId, fmt.Sprintf("wait-%d", index), limit, startedAt.Add(60*time.Second))
		assert.True(t, decision.Allowed)
		assert.Equal(t, index, decision.Used)
	}
}

func TestChannelRequestRateLimitReservationCanBeReleasedBeforeUpstreamStarts(t *testing.T) {
	resetLocalChannelRateLimits()
	originalRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = originalRedisEnabled
		resetLocalChannelRateLimits()
	})
	channel := channelWithRequestRateLimit(t, 103, 1, 60)

	reservation, first, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	require.NotNil(t, reservation)
	assert.True(t, first.Allowed)
	_, blocked, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	assert.False(t, blocked.Allowed)

	ReleaseChannelRequestReservation(reservation)
	_, afterRelease, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	assert.True(t, afterRelease.Allowed)
}

func TestRedisChannelRequestRateLimitIsAtomicAndReleasable(t *testing.T) {
	server := miniredis.RunT(t)
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		require.NoError(t, common.RDB.Close())
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})
	channel := channelWithRequestRateLimit(t, 104, 2, 60)

	firstReservation, first, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	secondReservation, second, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	_, blocked, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)

	assert.True(t, first.Allowed)
	assert.True(t, second.Allowed)
	assert.False(t, blocked.Allowed)
	assert.Positive(t, blocked.RetryAfterMillis)

	ReleaseChannelRequestReservation(firstReservation)
	thirdReservation, afterRelease, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	assert.True(t, afterRelease.Allowed)
	ReleaseChannelRequestReservation(secondReservation)
	ReleaseChannelRequestReservation(thirdReservation)
}

func TestRedisChannelRequestRateLimitIsAtomicUnderConcurrency(t *testing.T) {
	server := miniredis.RunT(t)
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		require.NoError(t, common.RDB.Close())
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})
	channel := channelWithRequestRateLimit(t, 108, 7, 60)
	var allowed atomic.Int32
	var waitGroup sync.WaitGroup

	for range 100 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, decision, err := ReserveChannelRequest(context.Background(), channel)
			if err == nil && decision.Allowed {
				allowed.Add(1)
			}
		}()
	}
	waitGroup.Wait()

	assert.Equal(t, int32(7), allowed.Load())
}

func TestRedisChannelRequestRateLimitQueueIsFIFOAndPreventsBypass(t *testing.T) {
	server := miniredis.RunT(t)
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		require.NoError(t, common.RDB.Close())
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})
	channel := channelWithRequestRateLimit(t, 110, 1, 60)
	firstReservation, first, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	require.True(t, first.Allowed)

	firstWaiter, err := pollRedisChannelRequestRateLimitWaiter(context.Background(), channel.Id, "wait-1", channel.GetOtherSettings().RequestRateLimit)
	require.NoError(t, err)
	assert.False(t, firstWaiter.Allowed)
	ReleaseChannelRequestReservation(firstReservation)

	newReservation, newArrival, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	assert.Nil(t, newReservation)
	assert.False(t, newArrival.Allowed)
	secondWaiter, err := pollRedisChannelRequestRateLimitWaiter(context.Background(), channel.Id, "wait-2", channel.GetOtherSettings().RequestRateLimit)
	require.NoError(t, err)
	assert.False(t, secondWaiter.Allowed)

	firstWaiter, err = pollRedisChannelRequestRateLimitWaiter(context.Background(), channel.Id, "wait-1", channel.GetOtherSettings().RequestRateLimit)
	require.NoError(t, err)
	assert.True(t, firstWaiter.Allowed)
	ReleaseChannelRequestReservation(&ChannelRateLimitReservation{channelId: channel.Id, member: "wait-1", redis: true})
	secondWaiter, err = pollRedisChannelRequestRateLimitWaiter(context.Background(), channel.Id, "wait-2", channel.GetOtherSettings().RequestRateLimit)
	require.NoError(t, err)
	assert.True(t, secondWaiter.Allowed)
}

func TestRedisChannelRequestRateLimitQueueRemovesCanceledWaiter(t *testing.T) {
	server := miniredis.RunT(t)
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		require.NoError(t, common.RDB.Close())
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})
	channel := channelWithRequestRateLimit(t, 111, 1, 60)
	_, decision, err := ReserveChannelRequest(context.Background(), channel)
	require.NoError(t, err)
	require.True(t, decision.Allowed)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	reservation, err := WaitForChannelRequest(ctx, channel)

	assert.Nil(t, reservation)
	assert.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, int64(0), common.RDB.ZCard(context.Background(), channelRateLimitQueueKey(channel.Id)).Val())
	assert.Equal(t, int64(0), common.RDB.ZCard(context.Background(), channelRateLimitQueueHeartbeatKey(channel.Id)).Val())
}

func TestConfiguredChannelRateLimitFailsClosedWhenRedisIsUnavailable(t *testing.T) {
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = nil
	t.Cleanup(func() {
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})
	channel := channelWithRequestRateLimit(t, 105, 30, 60)

	reservation, decision, err := ReserveChannelRequest(context.Background(), channel)

	assert.Nil(t, reservation)
	assert.False(t, decision.Allowed)
	assert.ErrorContains(t, err, "Redis client is not initialized")
}

func TestChannelWithoutRequestRateLimitRemainsUnlimited(t *testing.T) {
	originalRedisEnabled := common.RedisEnabled
	originalRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = nil
	t.Cleanup(func() {
		common.RedisEnabled = originalRedisEnabled
		common.RDB = originalRDB
	})

	reservation, decision, err := ReserveChannelRequest(context.Background(), &model.Channel{Id: 106})

	require.NoError(t, err)
	assert.Nil(t, reservation)
	assert.True(t, decision.Allowed)
}

func TestMalformedStoredChannelRateLimitFailsClosed(t *testing.T) {
	originalRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = originalRedisEnabled })
	channel := channelWithRequestRateLimit(t, 107, 0, 60)

	reservation, decision, err := ReserveChannelRequest(context.Background(), channel)

	assert.Nil(t, reservation)
	assert.False(t, decision.Allowed)
	assert.ErrorContains(t, err, "invalid request rate limit for channel 107")
}
