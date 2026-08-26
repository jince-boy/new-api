package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateOptionValueConsoleHomePage(t *testing.T) {
	assert.NoError(t, validateOptionValue("ConsoleHomePage", "/keys"))
	assert.Error(t, validateOptionValue("ConsoleHomePage", "https://example.com"))
}
