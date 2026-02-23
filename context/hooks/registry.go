package hooks

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Registry manages hook registration and execution
type Registry struct {
	mu    sync.RWMutex
	hooks map[HookType][]*Hook
	byID  map[string]*Hook

	// stopConfig configures stop hook behavior
	stopConfig StopHookConfig

	// metrics tracks hook execution stats
	metrics map[string]*HookMetrics
}

// HookMetrics tracks execution metrics for a hook
type HookMetrics struct {
	HookID        string        `json:"hookId"`
	ExecutionCount int64        `json:"executionCount"`
	ErrorCount    int64         `json:"errorCount"`
	TotalDuration time.Duration `json:"totalDuration"`
	AvgDuration   time.Duration `json:"avgDuration"`
	LastExecuted  time.Time     `json:"lastExecuted"`
}

// NewRegistry creates a new hook registry
func NewRegistry() *Registry {
	return &Registry{
		hooks:      make(map[HookType][]*Hook),
		byID:       make(map[string]*Hook),
		stopConfig: DefaultStopHookConfig(),
		metrics:    make(map[string]*HookMetrics),
	}
}

// Register adds a hook to the registry
func (r *Registry) Register(hook *Hook) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if hook.ID == "" {
		return fmt.Errorf("hook ID is required")
	}

	if _, exists := r.byID[hook.ID]; exists {
		return fmt.Errorf("hook with ID %s already exists", hook.ID)
	}

	if hook.Handler == nil {
		return fmt.Errorf("hook handler is required")
	}

	hook.CreatedAt = time.Now()
	if hook.Priority == 0 {
		hook.Priority = PriorityNormal
	}
	hook.Enabled = true

	r.hooks[hook.Type] = append(r.hooks[hook.Type], hook)
	r.byID[hook.ID] = hook

	// Sort hooks by priority
	r.sortHooks(hook.Type)

	// Initialize metrics
	r.metrics[hook.ID] = &HookMetrics{HookID: hook.ID}

	return nil
}

// RegisterFunc is a convenience method to register a hook function
func (r *Registry) RegisterFunc(id, name string, hookType HookType, priority HookPriority, handler HookFunc) error {
	return r.Register(&Hook{
		ID:       id,
		Name:     name,
		Type:     hookType,
		Priority: priority,
		Handler:  handler,
	})
}

// Unregister removes a hook from the registry
func (r *Registry) Unregister(hookID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	hook, exists := r.byID[hookID]
	if !exists {
		return fmt.Errorf("hook not found: %s", hookID)
	}

	// Remove from type slice
	hooks := r.hooks[hook.Type]
	for i, h := range hooks {
		if h.ID == hookID {
			r.hooks[hook.Type] = append(hooks[:i], hooks[i+1:]...)
			break
		}
	}

	delete(r.byID, hookID)
	delete(r.metrics, hookID)

	return nil
}

// UnregisterBySkill removes all hooks registered by a skill
func (r *Registry) UnregisterBySkill(skillID string) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	removed := 0
	toRemove := make([]string, 0)

	// Find all hooks from this skill
	for id, hook := range r.byID {
		if hook.SkillID == skillID {
			toRemove = append(toRemove, id)
		}
	}

	// Remove them
	for _, id := range toRemove {
		hook := r.byID[id]
		hooks := r.hooks[hook.Type]
		for i, h := range hooks {
			if h.ID == id {
				r.hooks[hook.Type] = append(hooks[:i], hooks[i+1:]...)
				break
			}
		}
		delete(r.byID, id)
		delete(r.metrics, id)
		removed++
	}

	return removed
}

// Get returns a hook by ID
func (r *Registry) Get(hookID string) (*Hook, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	hook, ok := r.byID[hookID]
	return hook, ok
}

// GetByType returns all hooks for a specific type
func (r *Registry) GetByType(hookType HookType) []*Hook {
	r.mu.RLock()
	defer r.mu.RUnlock()

	hooks := r.hooks[hookType]
	result := make([]*Hook, len(hooks))
	copy(result, hooks)
	return result
}

// GetAll returns all registered hooks
func (r *Registry) GetAll() []*Hook {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*Hook, 0, len(r.byID))
	for _, hook := range r.byID {
		result = append(result, hook)
	}
	return result
}

// Enable enables a hook
func (r *Registry) Enable(hookID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	hook, exists := r.byID[hookID]
	if !exists {
		return fmt.Errorf("hook not found: %s", hookID)
	}

	hook.Enabled = true
	return nil
}

// Disable disables a hook
func (r *Registry) Disable(hookID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	hook, exists := r.byID[hookID]
	if !exists {
		return fmt.Errorf("hook not found: %s", hookID)
	}

	hook.Enabled = false
	return nil
}

// SetStopConfig sets the stop hook configuration
func (r *Registry) SetStopConfig(config StopHookConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopConfig = config
}

// GetStopConfig returns the stop hook configuration
func (r *Registry) GetStopConfig() StopHookConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.stopConfig
}

// GetMetrics returns metrics for a hook
func (r *Registry) GetMetrics(hookID string) (*HookMetrics, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	m, ok := r.metrics[hookID]
	return m, ok
}

// GetAllMetrics returns all hook metrics
func (r *Registry) GetAllMetrics() []*HookMetrics {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*HookMetrics, 0, len(r.metrics))
	for _, m := range r.metrics {
		result = append(result, m)
	}
	return result
}

// Execute runs all hooks for a given type
func (r *Registry) Execute(ctx context.Context, hookCtx *HookContext) *HookResult {
	start := time.Now()
	result := &HookResult{}

	r.mu.RLock()
	hooks := r.hooks[hookCtx.Type]
	r.mu.RUnlock()

	for _, hook := range hooks {
		if !hook.Enabled {
			continue
		}

		hookStart := time.Now()
		err := hook.Handler(ctx, hookCtx)
		hookDuration := time.Since(hookStart)

		// Update metrics
		r.mu.Lock()
		if m, ok := r.metrics[hook.ID]; ok {
			m.ExecutionCount++
			m.TotalDuration += hookDuration
			m.AvgDuration = m.TotalDuration / time.Duration(m.ExecutionCount)
			m.LastExecuted = time.Now()
			if err != nil {
				m.ErrorCount++
			}
		}
		r.mu.Unlock()

		result.HooksExecuted++

		if err != nil {
			result.Errors = append(result.Errors, HookError{
				HookID:  hook.ID,
				Message: err.Error(),
			})
		}

		// Check if operation was cancelled
		if hookCtx.Cancelled {
			result.Cancelled = true
			result.CancelReason = hookCtx.CancelReason
			break
		}
	}

	result.Duration = time.Since(start)
	return result
}

// ExecuteStopHooks runs stop hooks based on configuration
func (r *Registry) ExecuteStopHooks(ctx context.Context, hookCtx *HookContext, isSuccess bool, isCancel bool) *HookResult {
	config := r.GetStopConfig()

	// Check if we should run based on condition
	if isSuccess && !config.RunOnSuccess {
		return &HookResult{}
	}
	if !isSuccess && !isCancel && !config.RunOnError {
		return &HookResult{}
	}
	if isCancel && !config.RunOnCancel {
		return &HookResult{}
	}

	// Apply timeout
	if config.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, config.Timeout)
		defer cancel()
	}

	return r.Execute(ctx, hookCtx)
}

// sortHooks sorts hooks by priority for a given type
func (r *Registry) sortHooks(hookType HookType) {
	hooks := r.hooks[hookType]
	sort.Slice(hooks, func(i, j int) bool {
		return hooks[i].Priority < hooks[j].Priority
	})
}

// Clear removes all hooks (useful for testing)
func (r *Registry) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.hooks = make(map[HookType][]*Hook)
	r.byID = make(map[string]*Hook)
	r.metrics = make(map[string]*HookMetrics)
}

// DefaultRegistry is the global hook registry
var DefaultRegistry = NewRegistry()

// Convenience functions that use DefaultRegistry

// Register adds a hook to the default registry
func Register(hook *Hook) error {
	return DefaultRegistry.Register(hook)
}

// RegisterFunc registers a hook function to the default registry
func RegisterFunc(id, name string, hookType HookType, priority HookPriority, handler HookFunc) error {
	return DefaultRegistry.RegisterFunc(id, name, hookType, priority, handler)
}

// Unregister removes a hook from the default registry
func Unregister(hookID string) error {
	return DefaultRegistry.Unregister(hookID)
}

// Execute runs hooks using the default registry
func Execute(ctx context.Context, hookCtx *HookContext) *HookResult {
	return DefaultRegistry.Execute(ctx, hookCtx)
}

// ExecuteStopHooks runs stop hooks using the default registry
func ExecuteStopHooks(ctx context.Context, hookCtx *HookContext, isSuccess bool, isCancel bool) *HookResult {
	return DefaultRegistry.ExecuteStopHooks(ctx, hookCtx, isSuccess, isCancel)
}
