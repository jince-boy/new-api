package routeexpr

import (
	"fmt"
	"strings"
	"sync"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/vm"
)

const (
	MaxSourceLength = 32 * 1024
	maxCacheEntries = 256
	maxNodes        = 512
)

var compileEnvironment = map[string]any{
	"body":              map[string]any{},
	"original_body":     map[string]any{},
	"raw_body":          "",
	"original_raw_body": "",
	"headers":           map[string]string{},
	"query":             map[string]string{},
	"http_status":       0,
	"method":            "",
	"path":              "",
	"model":             "",
	"task_id":           "",
	"public_task_id":    "",
	"json_path":         func(string) any { return nil },
	"has_json_path":     func(string) bool { return false },
	"header":            func(string) string { return "" },
	"query_value":       func(string) string { return "" },
}

var (
	cacheMu sync.RWMutex
	cache   = make(map[string]*vm.Program, 32)
)

// Validate checks whether a route expression is safe and can be compiled.
func Validate(source string) error {
	if strings.TrimSpace(source) == "" {
		return nil
	}
	_, err := compile(source)
	return err
}

// Run evaluates a bounded, side-effect-free route expression.
func Run(source string, environment map[string]any) (any, error) {
	program, err := compile(source)
	if err != nil {
		return nil, err
	}
	output, err := expr.Run(program, environment)
	if err != nil {
		return nil, fmt.Errorf("route expression execution failed: %w", err)
	}
	return output, nil
}

func compile(source string) (*vm.Program, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("route expression is empty")
	}
	if len(source) > MaxSourceLength {
		return nil, fmt.Errorf("route expression exceeds %d bytes", MaxSourceLength)
	}

	cacheMu.RLock()
	program := cache[source]
	cacheMu.RUnlock()
	if program != nil {
		return program, nil
	}

	program, err := expr.Compile(
		source,
		expr.Env(compileEnvironment),
		expr.AsAny(),
		expr.MaxNodes(maxNodes),
		expr.Optimize(false),
		expr.DisableBuiltin("repeat"),
		expr.DisableBuiltin("map"),
		expr.DisableBuiltin("filter"),
		expr.DisableBuiltin("groupBy"),
		expr.DisableBuiltin("concat"),
		expr.DisableBuiltin("flatten"),
		expr.DisableBuiltin("reverse"),
		expr.DisableBuiltin("sort"),
		expr.DisableBuiltin("sortBy"),
		expr.DisableBuiltin("reduce"),
		expr.DisableBuiltin("toBase64"),
		expr.DisableBuiltin("fromBase64"),
	)
	if err != nil {
		return nil, fmt.Errorf("route expression compile failed: %w", err)
	}
	if containsRange(program.Node()) {
		return nil, fmt.Errorf("route expression range operator is not allowed")
	}

	cacheMu.Lock()
	if len(cache) >= maxCacheEntries {
		cache = make(map[string]*vm.Program, 32)
	}
	cache[source] = program
	cacheMu.Unlock()
	return program, nil
}

func containsRange(node ast.Node) bool {
	found := false
	ast.Walk(&node, nodeVisitor(func(node *ast.Node) {
		if binary, ok := (*node).(*ast.BinaryNode); ok && binary.Operator == ".." {
			found = true
		}
	}))
	return found
}

type nodeVisitor func(node *ast.Node)

func (visit nodeVisitor) Visit(node *ast.Node) {
	visit(node)
}
