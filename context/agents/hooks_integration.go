package agents

import (
	"context"
	"errors"
	"fmt"
	"time"

	"construct-context/hooks"
)

// HooksRegistry is a reference to the hooks registry used by agents
var HooksRegistry *hooks.Registry

// HooksExecutor is a reference to the hooks executor used by agents
var HooksExecutor *hooks.Executor

// InitHooks initializes the hooks integration with the given registry
func InitHooks(registry *hooks.Registry) {
	HooksRegistry = registry
	HooksExecutor = hooks.NewExecutor(registry)
}

func init() {
	// Use default registry by default
	InitHooks(hooks.DefaultRegistry)
}

// CreateSessionWithHooks creates a session and fires hooks
func (r *Registry) CreateSessionWithHooks(ctx context.Context, agentID string, parentID string, sessionContext map[string]interface{}) (*AgentSession, error) {
	// Create the session first
	session, err := r.CreateSession(agentID, parentID)
	if err != nil {
		return nil, err
	}

	// Fire session.create hook
	if HooksExecutor != nil {
		result, hookErr := HooksExecutor.OnSessionCreate(ctx, hooks.SessionCreateData{
			SessionID: session.ID,
			AgentID:   agentID,
			ParentID:  parentID,
			Context:   sessionContext,
		})

		if hookErr != nil {
			// Hook cancelled the creation
			// Clean up the session
			r.mu.Lock()
			delete(r.sessions, session.ID)
			r.mu.Unlock()
			return nil, hookErr
		}

		if result.HasErrors() {
			// Log hook errors but don't fail session creation
			for _, e := range result.Errors {
				fmt.Printf("Hook error during session create: %s - %s\n", e.HookID, e.Message)
			}
		}
	}

	return session, nil
}

// StartSessionWithHooks marks a session as running and fires hooks
func (r *Registry) StartSessionWithHooks(ctx context.Context, sessionID string, task string) error {
	// Update session state
	err := r.UpdateSession(sessionID, func(s *AgentSession) {
		s.State = SessionRunning
	})
	if err != nil {
		return err
	}

	// Get session for hook data
	session, ok := r.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	// Fire session.start hook
	if HooksExecutor != nil {
		result, hookErr := HooksExecutor.OnSessionStart(ctx, hooks.SessionStartData{
			SessionID: sessionID,
			AgentID:   session.AgentID,
			Task:      task,
		})

		if hookErr != nil {
			// Hook cancelled the start - mark session as error
			r.FailSession(sessionID, hookErr)
			return hookErr
		}

		if result.HasErrors() {
			for _, e := range result.Errors {
				fmt.Printf("Hook error during session start: %s - %s\n", e.HookID, e.Message)
			}
		}
	}

	return nil
}

// CompleteSessionWithHooks marks a session as complete and fires hooks
func (r *Registry) CompleteSessionWithHooks(ctx context.Context, sessionID string, result *AgentResult) error {
	// Get session before completion for duration calculation
	session, ok := r.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	agentID := session.AgentID
	startTime := session.StartTime

	// Complete the session
	if err := r.CompleteSession(sessionID, result); err != nil {
		return err
	}

	duration := time.Since(startTime)

	// Fire session.complete hook
	if HooksExecutor != nil {
		hookResult := HooksExecutor.OnSessionComplete(ctx, hooks.SessionCompleteData{
			SessionID:  sessionID,
			AgentID:    agentID,
			Result:     result,
			Duration:   duration,
			TokensUsed: result.TokensUsed,
			Iterations: result.Iterations,
		})

		if hookResult.HasErrors() {
			for _, e := range hookResult.Errors {
				fmt.Printf("Hook error during session complete: %s - %s\n", e.HookID, e.Message)
			}
		}
	}

	// Fire session.stop hook
	if HooksExecutor != nil {
		HooksExecutor.OnSessionStop(ctx, hooks.SessionStopData{
			SessionID:  sessionID,
			AgentID:    agentID,
			Success:    true,
			Cancelled:  false,
			Result:     result,
			Duration:   duration,
			TokensUsed: result.TokensUsed,
			Iterations: result.Iterations,
		})
	}

	return nil
}

// FailSessionWithHooks marks a session as failed and fires hooks
func (r *Registry) FailSessionWithHooks(ctx context.Context, sessionID string, err error) error {
	// Get session before failure for data
	session, ok := r.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	agentID := session.AgentID
	startTime := session.StartTime

	// Fail the session
	if failErr := r.FailSession(sessionID, err); failErr != nil {
		return failErr
	}

	duration := time.Since(startTime)

	// Fire session.error hook
	if HooksExecutor != nil {
		hookResult := HooksExecutor.OnSessionError(ctx, hooks.SessionErrorData{
			SessionID: sessionID,
			AgentID:   agentID,
			Error:     err,
			Duration:  duration,
		})

		if hookResult.HasErrors() {
			for _, e := range hookResult.Errors {
				fmt.Printf("Hook error during session error: %s - %s\n", e.HookID, e.Message)
			}
		}
	}

	// Fire session.stop hook
	if HooksExecutor != nil {
		HooksExecutor.OnSessionStop(ctx, hooks.SessionStopData{
			SessionID:  sessionID,
			AgentID:    agentID,
			Success:    false,
			Cancelled:  false,
			Error:      err,
			Duration:   duration,
			TokensUsed: session.TokensUsed,
			Iterations: session.Iterations,
		})
	}

	return nil
}

// CancelSessionWithHooks marks a session as cancelled and fires hooks
func (r *Registry) CancelSessionWithHooks(ctx context.Context, sessionID string, reason string) error {
	// Get session before cancellation
	session, ok := r.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	agentID := session.AgentID
	startTime := session.StartTime

	// Mark as error with cancel reason
	cancelErr := errors.New("cancelled: " + reason)
	if err := r.FailSession(sessionID, cancelErr); err != nil {
		return err
	}

	duration := time.Since(startTime)

	// Fire session.stop hook with cancelled=true
	if HooksExecutor != nil {
		HooksExecutor.OnSessionStop(ctx, hooks.SessionStopData{
			SessionID:  sessionID,
			AgentID:    agentID,
			Success:    false,
			Cancelled:  true,
			Error:      cancelErr,
			Duration:   duration,
			TokensUsed: session.TokensUsed,
			Iterations: session.Iterations,
		})
	}

	return nil
}

// ToolCallWithHooks executes tool call hooks before and after tool execution
func ToolCallWithHooks(ctx context.Context, sessionID, toolName, toolCallID string, args map[string]interface{}, execute func() (interface{}, error)) (interface{}, error) {
	start := time.Now()

	// Fire tool.call.start hook
	if HooksExecutor != nil {
		result, hookErr := HooksExecutor.OnToolCallStart(ctx, hooks.ToolCallStartData{
			SessionID:  sessionID,
			ToolName:   toolName,
			ToolCallID: toolCallID,
			Arguments:  args,
		})

		if hookErr != nil {
			// Hook cancelled the tool call
			return nil, hookErr
		}

		if result.Cancelled {
			return nil, fmt.Errorf("tool call cancelled: %s", result.CancelReason)
		}
	}

	// Execute the tool
	toolResult, toolErr := execute()
	duration := time.Since(start)

	// Fire appropriate hook based on result
	if HooksExecutor != nil {
		if toolErr != nil {
			HooksExecutor.OnToolCallError(ctx, hooks.ToolCallErrorData{
				SessionID:  sessionID,
				ToolName:   toolName,
				ToolCallID: toolCallID,
				Error:      toolErr,
				Duration:   duration,
			})
		} else {
			HooksExecutor.OnToolCallEnd(ctx, hooks.ToolCallEndData{
				SessionID:  sessionID,
				ToolName:   toolName,
				ToolCallID: toolCallID,
				Result:     toolResult,
				Duration:   duration,
			})
		}
	}

	return toolResult, toolErr
}

// DispatchWithHooks fires hooks when dispatching to another agent
func DispatchWithHooks(ctx context.Context, sessionID, fromAgentID, toAgentID, task string, dispatchContext map[string]interface{}) error {
	if HooksExecutor != nil {
		_, err := HooksExecutor.OnAgentDispatch(ctx, hooks.AgentDispatchData{
			SessionID:   sessionID,
			FromAgentID: fromAgentID,
			ToAgentID:   toAgentID,
			Task:        task,
			Context:     dispatchContext,
		})
		return err
	}
	return nil
}

// SwitchAgentWithHooks fires hooks when switching between agents
func SwitchAgentWithHooks(ctx context.Context, sessionID, fromAgentID, toAgentID, reason string) {
	if HooksExecutor != nil {
		HooksExecutor.OnAgentSwitch(ctx, hooks.AgentSwitchData{
			SessionID:   sessionID,
			FromAgentID: fromAgentID,
			ToAgentID:   toAgentID,
			Reason:      reason,
		})
	}
}
