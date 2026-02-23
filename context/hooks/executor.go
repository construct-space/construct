package hooks

import (
	"context"
	"fmt"
	"time"
)

// Executor provides high-level methods for triggering hooks at specific lifecycle points
type Executor struct {
	registry *Registry
}

// NewExecutor creates a new hook executor
func NewExecutor(registry *Registry) *Executor {
	return &Executor{registry: registry}
}

// SessionCreateData contains data for session create hooks
type SessionCreateData struct {
	SessionID string
	AgentID   string
	ParentID  string
	Context   map[string]interface{}
}

// OnSessionCreate triggers session.create hooks
func (e *Executor) OnSessionCreate(ctx context.Context, data SessionCreateData) (*HookResult, error) {
	hookCtx := NewHookContext(HookSessionCreate).
		WithSession(data.SessionID).
		WithAgent(data.AgentID).
		WithData("parentId", data.ParentID).
		WithData("context", data.Context)

	result := e.registry.Execute(ctx, hookCtx)

	if hookCtx.Cancelled {
		return result, fmt.Errorf("session creation cancelled: %s", hookCtx.CancelReason)
	}

	return result, nil
}

// SessionStartData contains data for session start hooks
type SessionStartData struct {
	SessionID string
	AgentID   string
	Task      string
}

// OnSessionStart triggers session.start hooks
func (e *Executor) OnSessionStart(ctx context.Context, data SessionStartData) (*HookResult, error) {
	hookCtx := NewHookContext(HookSessionStart).
		WithSession(data.SessionID).
		WithAgent(data.AgentID).
		WithData("task", data.Task)

	result := e.registry.Execute(ctx, hookCtx)

	if hookCtx.Cancelled {
		return result, fmt.Errorf("session start cancelled: %s", hookCtx.CancelReason)
	}

	return result, nil
}

// SessionCompleteData contains data for session complete hooks
type SessionCompleteData struct {
	SessionID  string
	AgentID    string
	Result     interface{}
	Duration   time.Duration
	TokensUsed int
	Iterations int
}

// OnSessionComplete triggers session.complete hooks
func (e *Executor) OnSessionComplete(ctx context.Context, data SessionCompleteData) *HookResult {
	hookCtx := NewHookContext(HookSessionComplete).
		WithSession(data.SessionID).
		WithAgent(data.AgentID).
		WithData("result", data.Result).
		WithData("duration", data.Duration).
		WithData("tokensUsed", data.TokensUsed).
		WithData("iterations", data.Iterations)

	return e.registry.Execute(ctx, hookCtx)
}

// SessionErrorData contains data for session error hooks
type SessionErrorData struct {
	SessionID string
	AgentID   string
	Error     error
	Duration  time.Duration
}

// OnSessionError triggers session.error hooks
func (e *Executor) OnSessionError(ctx context.Context, data SessionErrorData) *HookResult {
	hookCtx := NewHookContext(HookSessionError).
		WithSession(data.SessionID).
		WithAgent(data.AgentID).
		WithError(data.Error).
		WithData("duration", data.Duration)

	return e.registry.Execute(ctx, hookCtx)
}

// SessionStopData contains data for session stop hooks
type SessionStopData struct {
	SessionID  string
	AgentID    string
	Success    bool
	Cancelled  bool
	Error      error
	Result     interface{}
	Duration   time.Duration
	TokensUsed int
	Iterations int
}

// OnSessionStop triggers session.stop hooks (runs regardless of success/error)
func (e *Executor) OnSessionStop(ctx context.Context, data SessionStopData) *HookResult {
	hookCtx := NewHookContext(HookSessionStop).
		WithSession(data.SessionID).
		WithAgent(data.AgentID).
		WithData("success", data.Success).
		WithData("cancelled", data.Cancelled).
		WithData("result", data.Result).
		WithData("duration", data.Duration).
		WithData("tokensUsed", data.TokensUsed).
		WithData("iterations", data.Iterations)

	if data.Error != nil {
		hookCtx.WithError(data.Error)
	}

	return e.registry.ExecuteStopHooks(ctx, hookCtx, data.Success, data.Cancelled)
}

// ToolCallStartData contains data for tool call start hooks
type ToolCallStartData struct {
	SessionID  string
	ToolName   string
	ToolCallID string
	Arguments  map[string]interface{}
}

// OnToolCallStart triggers tool.call.start hooks
func (e *Executor) OnToolCallStart(ctx context.Context, data ToolCallStartData) (*HookResult, error) {
	hookCtx := NewHookContext(HookToolCallStart).
		WithSession(data.SessionID).
		WithTool(data.ToolName).
		WithData("toolCallId", data.ToolCallID).
		WithData("arguments", data.Arguments)

	result := e.registry.Execute(ctx, hookCtx)

	if hookCtx.Cancelled {
		return result, fmt.Errorf("tool call cancelled: %s", hookCtx.CancelReason)
	}

	return result, nil
}

// ToolCallEndData contains data for tool call end hooks
type ToolCallEndData struct {
	SessionID  string
	ToolName   string
	ToolCallID string
	Result     interface{}
	Duration   time.Duration
}

// OnToolCallEnd triggers tool.call.end hooks
func (e *Executor) OnToolCallEnd(ctx context.Context, data ToolCallEndData) *HookResult {
	hookCtx := NewHookContext(HookToolCallEnd).
		WithSession(data.SessionID).
		WithTool(data.ToolName).
		WithData("toolCallId", data.ToolCallID).
		WithData("result", data.Result).
		WithData("duration", data.Duration)

	return e.registry.Execute(ctx, hookCtx)
}

// ToolCallErrorData contains data for tool call error hooks
type ToolCallErrorData struct {
	SessionID  string
	ToolName   string
	ToolCallID string
	Error      error
	Duration   time.Duration
}

// OnToolCallError triggers tool.call.error hooks
func (e *Executor) OnToolCallError(ctx context.Context, data ToolCallErrorData) *HookResult {
	hookCtx := NewHookContext(HookToolCallError).
		WithSession(data.SessionID).
		WithTool(data.ToolName).
		WithData("toolCallId", data.ToolCallID).
		WithError(data.Error).
		WithData("duration", data.Duration)

	return e.registry.Execute(ctx, hookCtx)
}

// ContextChangeData contains data for context change hooks
type ContextChangeData struct {
	ChangeType string
	OldValue   interface{}
	NewValue   interface{}
}

// OnContextChange triggers context.change hooks
func (e *Executor) OnContextChange(ctx context.Context, data ContextChangeData) *HookResult {
	hookCtx := NewHookContext(HookContextChange).
		WithData("changeType", data.ChangeType).
		WithData("oldValue", data.OldValue).
		WithData("newValue", data.NewValue)

	return e.registry.Execute(ctx, hookCtx)
}

// ModeChangeData contains data for mode change hooks
type ModeChangeData struct {
	OldMode string
	NewMode string
}

// OnModeChange triggers mode.change hooks
func (e *Executor) OnModeChange(ctx context.Context, data ModeChangeData) *HookResult {
	hookCtx := NewHookContext(HookModeChange).
		WithData("oldMode", data.OldMode).
		WithData("newMode", data.NewMode)

	return e.registry.Execute(ctx, hookCtx)
}

// AgentDispatchData contains data for agent dispatch hooks
type AgentDispatchData struct {
	SessionID   string
	FromAgentID string
	ToAgentID   string
	Task        string
	Context     map[string]interface{}
}

// OnAgentDispatch triggers agent.dispatch hooks
func (e *Executor) OnAgentDispatch(ctx context.Context, data AgentDispatchData) (*HookResult, error) {
	hookCtx := NewHookContext(HookAgentDispatch).
		WithSession(data.SessionID).
		WithAgent(data.ToAgentID).
		WithData("fromAgentId", data.FromAgentID).
		WithData("task", data.Task).
		WithData("context", data.Context)

	result := e.registry.Execute(ctx, hookCtx)

	if hookCtx.Cancelled {
		return result, fmt.Errorf("agent dispatch cancelled: %s", hookCtx.CancelReason)
	}

	return result, nil
}

// AgentSwitchData contains data for agent switch hooks
type AgentSwitchData struct {
	SessionID   string
	FromAgentID string
	ToAgentID   string
	Reason      string
}

// OnAgentSwitch triggers agent.switch hooks
func (e *Executor) OnAgentSwitch(ctx context.Context, data AgentSwitchData) *HookResult {
	hookCtx := NewHookContext(HookAgentSwitch).
		WithSession(data.SessionID).
		WithAgent(data.ToAgentID).
		WithData("fromAgentId", data.FromAgentID).
		WithData("reason", data.Reason)

	return e.registry.Execute(ctx, hookCtx)
}

// DefaultExecutor uses the default registry
var DefaultExecutor = NewExecutor(DefaultRegistry)

// Convenience functions that use DefaultExecutor

// OnSessionCreate triggers session.create hooks using default executor
func OnSessionCreate(ctx context.Context, data SessionCreateData) (*HookResult, error) {
	return DefaultExecutor.OnSessionCreate(ctx, data)
}

// OnSessionStart triggers session.start hooks using default executor
func OnSessionStart(ctx context.Context, data SessionStartData) (*HookResult, error) {
	return DefaultExecutor.OnSessionStart(ctx, data)
}

// OnSessionComplete triggers session.complete hooks using default executor
func OnSessionComplete(ctx context.Context, data SessionCompleteData) *HookResult {
	return DefaultExecutor.OnSessionComplete(ctx, data)
}

// OnSessionError triggers session.error hooks using default executor
func OnSessionError(ctx context.Context, data SessionErrorData) *HookResult {
	return DefaultExecutor.OnSessionError(ctx, data)
}

// OnSessionStop triggers session.stop hooks using default executor
func OnSessionStop(ctx context.Context, data SessionStopData) *HookResult {
	return DefaultExecutor.OnSessionStop(ctx, data)
}

// OnToolCallStart triggers tool.call.start hooks using default executor
func OnToolCallStart(ctx context.Context, data ToolCallStartData) (*HookResult, error) {
	return DefaultExecutor.OnToolCallStart(ctx, data)
}

// OnToolCallEnd triggers tool.call.end hooks using default executor
func OnToolCallEnd(ctx context.Context, data ToolCallEndData) *HookResult {
	return DefaultExecutor.OnToolCallEnd(ctx, data)
}

// OnToolCallError triggers tool.call.error hooks using default executor
func OnToolCallError(ctx context.Context, data ToolCallErrorData) *HookResult {
	return DefaultExecutor.OnToolCallError(ctx, data)
}

// OnContextChange triggers context.change hooks using default executor
func OnContextChange(ctx context.Context, data ContextChangeData) *HookResult {
	return DefaultExecutor.OnContextChange(ctx, data)
}

// OnModeChange triggers mode.change hooks using default executor
func OnModeChange(ctx context.Context, data ModeChangeData) *HookResult {
	return DefaultExecutor.OnModeChange(ctx, data)
}

// OnAgentDispatch triggers agent.dispatch hooks using default executor
func OnAgentDispatch(ctx context.Context, data AgentDispatchData) (*HookResult, error) {
	return DefaultExecutor.OnAgentDispatch(ctx, data)
}

// OnAgentSwitch triggers agent.switch hooks using default executor
func OnAgentSwitch(ctx context.Context, data AgentSwitchData) *HookResult {
	return DefaultExecutor.OnAgentSwitch(ctx, data)
}
