package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApiLogRouteSupportsPathWithoutTrailingSlash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()

	require.NotPanics(t, func() {
		SetApiRouter(engine)
	})

	routes := engine.Routes()
	found := false
	for _, route := range routes {
		if route.Method == http.MethodGet && route.Path == "/api/log" {
			found = true
			assert.Equal(t, "github.com/QuantumNous/new-api/controller.GetAllLogs", route.Handler)
			break
		}
	}
	assert.True(t, found, "GET /api/log route must be registered")
}
