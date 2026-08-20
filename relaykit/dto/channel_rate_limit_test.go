package dto

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestChannelRequestRateLimitValidation(t *testing.T) {
	tests := []struct {
		name    string
		limit   *ChannelRequestRateLimit
		wantErr bool
	}{
		{name: "optional", limit: nil},
		{name: "valid", limit: &ChannelRequestRateLimit{MaxRequests: 30, WindowSeconds: 60}},
		{name: "missing maximum", limit: &ChannelRequestRateLimit{WindowSeconds: 60}, wantErr: true},
		{name: "missing window", limit: &ChannelRequestRateLimit{MaxRequests: 30}, wantErr: true},
		{name: "maximum too large", limit: &ChannelRequestRateLimit{MaxRequests: MaxChannelRateLimitCount + 1, WindowSeconds: 60}, wantErr: true},
		{name: "window too large", limit: &ChannelRequestRateLimit{MaxRequests: 30, WindowSeconds: MaxChannelRateLimitWindowSeconds + 1}, wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.limit.Validate()
			if test.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
		})
	}
}
