package routejs

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/evanw/esbuild/pkg/api"
)

const (
	MaxSourceLength    = 32 * 1024
	maxCacheEntries    = 256
	maxCallStackSize   = 256
	maxExecutionTime   = 100 * time.Millisecond
	compiledResultName = "__advanced_custom_route_result__"
)

var (
	cacheMu sync.RWMutex
	cache   = make(map[string]*goja.Program, 32)
)

// ValidateFunction checks whether source is a valid JavaScript or TypeScript
// function body for the supplied parameter names.
func ValidateFunction(source string, parameterNames ...string) error {
	if strings.TrimSpace(source) == "" {
		return nil
	}
	_, err := compileFunction(source, parameterNames)
	return err
}

// RunFunction executes a bounded JavaScript or TypeScript function body.
// The function receives only the named values supplied in environment.
func RunFunction(source string, environment map[string]any, parameterNames ...string) (any, error) {
	program, err := compileFunction(source, parameterNames)
	if err != nil {
		return nil, err
	}

	runtime := goja.New()
	runtime.SetMaxCallStackSize(maxCallStackSize)
	for _, name := range parameterNames {
		if err := runtime.Set(name, environment[name]); err != nil {
			return nil, fmt.Errorf("set route script variable %s: %w", name, err)
		}
	}

	var timedOut atomic.Bool
	timer := time.AfterFunc(maxExecutionTime, func() {
		timedOut.Store(true)
		runtime.Interrupt("execution timed out")
	})
	value, err := runtime.RunProgram(program)
	if !timer.Stop() {
		runtime.ClearInterrupt()
	}
	if err != nil {
		var interrupted *goja.InterruptedError
		if timedOut.Load() || errors.As(err, &interrupted) {
			return nil, fmt.Errorf("route script execution exceeded %s", maxExecutionTime)
		}
		return nil, fmt.Errorf("route script execution failed: %w", err)
	}
	return value.Export(), nil
}

func compileFunction(source string, parameterNames []string) (*goja.Program, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("route script is empty")
	}
	if len(source) > MaxSourceLength {
		return nil, fmt.Errorf("route script exceeds %d bytes", MaxSourceLength)
	}
	for _, name := range parameterNames {
		if !isAllowedParameterName(name) {
			return nil, fmt.Errorf("invalid route script parameter %q", name)
		}
	}

	cacheKey := strings.Join(parameterNames, "\x00") + "\x00" + source
	cacheMu.RLock()
	program := cache[cacheKey]
	cacheMu.RUnlock()
	if program != nil {
		return program, nil
	}

	typedParameters := make([]string, len(parameterNames))
	for index, name := range parameterNames {
		typedParameters[index] = name + ": unknown"
	}
	wrapper := fmt.Sprintf(
		"const %s = (function(%s): unknown {\n\"use strict\";\n%s\n})(%s);\n%s;",
		compiledResultName,
		strings.Join(typedParameters, ", "),
		source,
		strings.Join(parameterNames, ", "),
		compiledResultName,
	)
	transformed := api.Transform(wrapper, api.TransformOptions{
		Loader:            api.LoaderTS,
		Target:            api.ES2019,
		Charset:           api.CharsetUTF8,
		LegalComments:     api.LegalCommentsNone,
		Sourcefile:        "advanced-custom-route.ts",
		TreeShaking:       api.TreeShakingFalse,
		MinifyIdentifiers: false,
		MinifySyntax:      false,
		MinifyWhitespace:  false,
	})
	if len(transformed.Errors) > 0 {
		return nil, fmt.Errorf("route script compile failed: %s", transformed.Errors[0].Text)
	}
	program, err := goja.Compile("advanced-custom-route.js", string(transformed.Code), true)
	if err != nil {
		return nil, fmt.Errorf("route script compile failed: %w", err)
	}

	cacheMu.Lock()
	if len(cache) >= maxCacheEntries {
		cache = make(map[string]*goja.Program, 32)
	}
	cache[cacheKey] = program
	cacheMu.Unlock()
	return program, nil
}

func isAllowedParameterName(name string) bool {
	switch name {
	case "header", "body", "row_response":
		return true
	default:
		return false
	}
}
