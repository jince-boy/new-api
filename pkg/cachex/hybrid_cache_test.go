package cachex

import (
	"testing"
	"time"

	"github.com/samber/hot"
	"github.com/stretchr/testify/require"
)

func TestHybridCacheSetIfAbsentWithTTLIsFirstWriterWinsInMemory(t *testing.T) {
	cache := NewHybridCache[int](HybridCacheConfig[int]{
		Namespace: Namespace("cachex-test"),
		Memory: func() *hot.HotCache[string, int] {
			return hot.NewHotCache[string, int](hot.LRU, 16).Build()
		},
	})

	first, err := cache.SetIfAbsentWithTTL("session", 11, time.Minute)
	require.NoError(t, err)
	require.True(t, first)

	second, err := cache.SetIfAbsentWithTTL("session", 22, time.Minute)
	require.NoError(t, err)
	require.False(t, second)

	value, found, err := cache.Get("session")
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, 11, value)
}
