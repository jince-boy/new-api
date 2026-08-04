package model

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/require"
)

func TestValidateOptionValueRejectsInvalidAsyncTaskPollInterval(t *testing.T) {
	require.NoError(t, validateOptionValue(operation_setting.AsyncTaskPollIntervalOptionKey, "5"))
	require.NoError(t, validateOptionValue(operation_setting.AsyncTaskPollIntervalOptionKey, "10"))
	require.Error(t, validateOptionValue(operation_setting.AsyncTaskPollIntervalOptionKey, "4"))
	require.Error(t, validateOptionValue(operation_setting.AsyncTaskPollIntervalOptionKey, "7"))
}
