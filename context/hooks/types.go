// Package hooks implements a lifecycle hook system for the Construct context service.
// Hooks allow registering callbacks that execute at specific lifecycle events,
// enabling extensible behavior without modifying core logic.
package hooks

import (
	"context"
	"time"
)

// HookType represents the type of lifecycle event
type HookType string

const (
	// Session lifecycle hooks
	HookSessionCreate   HookType = "session.create"   // Before session is created
	HookSessionStart    HookType = "session.start"    // When session starts running
	HookSessionComplete HookType = "session.complete" // When session completes successfully
	HookSessionError    HookType = "session.error"    // When session fails
	HookSessionStop     HookType = "session.stop"     // When session is stopped (success or error)

	// Tool lifecycle hooks
	HookToolCallStart HookType = "tool.call.start" // Before tool execution
	HookToolCallEnd   HookType = "tool.call.end"   // After tool execution (success)
	HookToolCallError HookType = "tool.call.error" // After tool execution (error)

	// Context lifecycle hooks
	HookContextChange  HookType = "context.change"  // When context state changes
	HookModeChange     HookType = "mode.change"     // When mode changes
	HookProjectChange  HookType = "project.change"  // When project changes
	HookSelectionChange HookType = "selection.change" // When selection changes

	// Agent lifecycle hooks
	HookAgentDispatch HookType = "agent.dispatch" // When agent is dispatched
	HookAgentSwitch   HookType = "agent.switch"   // When switching between agents

	// Storage hooks
	HookStorageSave HookType = "storage.save" // Before saving to storage
	HookStorageLoad HookType = "storage.load" // After loading from storage
)

// HookPriority determines the order in which hooks are executed
type HookPriority int

const (
	PriorityFirst   HookPriority = 0   // Execute first
	PriorityHigh    HookPriority = 25
	PriorityNormal  HookPriority = 50
	PriorityLow     HookPriority = 75
	PriorityLast    HookPriority = 100 // Execute last
)

// HookContext provides context for hook execution
type HookContext struct {
	// Type is the hook type being executed
	Type HookType `json:"type"`

	// Timestamp when the hook was triggered
	Timestamp time.Time `json:"timestamp"`

	// Data contains hook-specific data
	Data map[string]interface{} `json:"data,omitempty"`

	// SessionID is the related session ID (if applicable)
	SessionID string `json:"sessionId,omitempty"`

	// AgentID is the related agent ID (if applicable)
	AgentID string `json:"agentId,omitempty"`

	// ToolName is the related tool name (if applicable)
	ToolName string `json:"toolName,omitempty"`

	// Error contains error information (for error hooks)
	Error error `json:"-"`
	ErrorMessage string `json:"error,omitempty"`

	// Result allows hooks to pass data to subsequent hooks
	Result map[string]interface{} `json:"result,omitempty"`

	// Cancelled indicates if the operation should be cancelled
	Cancelled bool `json:"cancelled"`

	// CancelReason explains why the operation was cancelled
	CancelReason string `json:"cancelReason,omitempty"`
}

// NewHookContext creates a new hook context
func NewHookContext(hookType HookType) *HookContext {
	return &HookContext{
		Type:      hookType,
		Timestamp: time.Now(),
		Data:      make(map[string]interface{}),
		Result:    make(map[string]interface{}),
	}
}

// WithData adds data to the hook context
func (hc *HookContext) WithData(key string, value interface{}) *HookContext {
	hc.Data[key] = value
	return hc
}

// WithSession sets the session ID
func (hc *HookContext) WithSession(sessionID string) *HookContext {
	hc.SessionID = sessionID
	return hc
}

// WithAgent sets the agent ID
func (hc *HookContext) WithAgent(agentID string) *HookContext {
	hc.AgentID = agentID
	return hc
}

// WithTool sets the tool name
func (hc *HookContext) WithTool(toolName string) *HookContext {
	hc.ToolName = toolName
	return hc
}

// WithError sets the error
func (hc *HookContext) WithError(err error) *HookContext {
	hc.Error = err
	if err != nil {
		hc.ErrorMessage = err.Error()
	}
	return hc
}

// Cancel marks the operation as cancelled
func (hc *HookContext) Cancel(reason string) {
	hc.Cancelled = true
	hc.CancelReason = reason
}

// SetResult sets a result value for subsequent hooks
func (hc *HookContext) SetResult(key string, value interface{}) {
	hc.Result[key] = value
}

// GetResult gets a result value from previous hooks
func (hc *HookContext) GetResult(key string) (interface{}, bool) {
	val, ok := hc.Result[key]
	return val, ok
}

// HookFunc is the function signature for hook handlers
type HookFunc func(ctx context.Context, hc *HookContext) error

// Hook represents a registered hook
type Hook struct {
	// ID is a unique identifier for this hook
	ID string `json:"id"`

	// Name is a human-readable name
	Name string `json:"name"`

	// Type is the hook type this handles
	Type HookType `json:"type"`

	// Priority determines execution order (lower = earlier)
	Priority HookPriority `json:"priority"`

	// SkillID is the skill that registered this hook (if any)
	SkillID string `json:"skillId,omitempty"`

	// Enabled indicates if the hook is active
	Enabled bool `json:"enabled"`

	// Handler is the actual hook function
	Handler HookFunc `json:"-"`

	// Description describes what this hook does
	Description string `json:"description,omitempty"`

	// CreatedAt is when the hook was registered
	CreatedAt time.Time `json:"createdAt"`
}

// HookResult represents the result of executing hooks
type HookResult struct {
	// HooksExecuted is the number of hooks that ran
	HooksExecuted int `json:"hooksExecuted"`

	// Errors contains any errors from hook execution
	Errors []HookError `json:"errors,omitempty"`

	// Cancelled indicates if the operation was cancelled
	Cancelled bool `json:"cancelled"`

	// CancelReason explains why the operation was cancelled
	CancelReason string `json:"cancelReason,omitempty"`

	// Duration is how long all hooks took to execute
	Duration time.Duration `json:"duration"`
}

// HookError represents an error from a specific hook
type HookError struct {
	HookID  string `json:"hookId"`
	Message string `json:"message"`
}

// HasErrors returns true if any hooks failed
func (hr *HookResult) HasErrors() bool {
	return len(hr.Errors) > 0
}

// StopHookConfig configures behavior for stop hooks
type StopHookConfig struct {
	// RunOnSuccess determines if hooks run on successful completion
	RunOnSuccess bool `json:"runOnSuccess"`

	// RunOnError determines if hooks run on error
	RunOnError bool `json:"runOnError"`

	// RunOnCancel determines if hooks run on cancellation
	RunOnCancel bool `json:"runOnCancel"`

	// Timeout is the maximum time for stop hooks to execute
	Timeout time.Duration `json:"timeout"`

	// ContinueOnError determines if execution continues after hook errors
	ContinueOnError bool `json:"continueOnError"`
}

// DefaultStopHookConfig returns the default stop hook configuration
func DefaultStopHookConfig() StopHookConfig {
	return StopHookConfig{
		RunOnSuccess:    true,
		RunOnError:      true,
		RunOnCancel:     true,
		Timeout:         30 * time.Second,
		ContinueOnError: true,
	}
}
