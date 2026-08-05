package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGroupRoutesKeepUserAndServiceGroupsSeparate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	require.NotPanics(t, func() {
		SetApiRouter(engine)
	})

	routes := make(map[string]string, len(engine.Routes()))
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = route.Handler
	}

	assert.Equal(
		t,
		"github.com/QuantumNous/new-api/controller.GetGroups",
		routes[http.MethodGet+" /api/group/"],
	)
	assert.Equal(
		t,
		"github.com/QuantumNous/new-api/controller.GetUserGroupNames",
		routes[http.MethodGet+" /api/user_group/"],
	)
	assert.Equal(
		t,
		"github.com/QuantumNous/new-api/controller.UpdateGroupOptions",
		routes[http.MethodPut+" /api/option/group"],
	)
}
