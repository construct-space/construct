package skills

import (
	"context"
	"fmt"
	"log"
	"time"

	"construct-context/hooks"
	"construct-context/providers"
)

// LoggingSkill logs lifecycle events
type LoggingSkill struct {
	*BaseSkill
	logLevel string
}

// NewLoggingSkill creates a new logging skill
func NewLoggingSkill() Skill {
	skill := &LoggingSkill{
		BaseSkill: NewBaseSkill(
			"builtin.logging",
			"Logging",
			SkillCategoryCore,
			"Logs lifecycle events for debugging and monitoring",
			"1.0.0",
		),
		logLevel: "info",
	}
	return skill
}

func (s *LoggingSkill) Initialize(ctx context.Context, config *SkillConfig) error {
	if err := s.BaseSkill.Initialize(ctx, config); err != nil {
		return err
	}

	// Get log level from config
	if level, ok := s.GetSetting("logLevel"); ok {
		if str, ok := level.(string); ok {
			s.logLevel = str
		}
	}

	return nil
}

func (s *LoggingSkill) RegisterHooks(registry *hooks.Registry) error {
	// Log session lifecycle
	if err := registry.Register(&hooks.Hook{
		ID:       "logging.session.start",
		Name:     "Log Session Start",
		Type:     hooks.HookSessionStart,
		Priority: hooks.PriorityFirst,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			log.Printf("[SESSION] Started: session=%s agent=%s", hc.SessionID, hc.AgentID)
			return nil
		},
	}); err != nil {
		return err
	}

	if err := registry.Register(&hooks.Hook{
		ID:       "logging.session.stop",
		Name:     "Log Session Stop",
		Type:     hooks.HookSessionStop,
		Priority: hooks.PriorityLast,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			success, _ := hc.Data["success"].(bool)
			duration, _ := hc.Data["duration"].(time.Duration)
			status := "completed"
			if !success {
				status = "failed"
			}
			log.Printf("[SESSION] Stopped: session=%s agent=%s status=%s duration=%v",
				hc.SessionID, hc.AgentID, status, duration)
			return nil
		},
	}); err != nil {
		return err
	}

	// Log tool calls
	if err := registry.Register(&hooks.Hook{
		ID:       "logging.tool.start",
		Name:     "Log Tool Call Start",
		Type:     hooks.HookToolCallStart,
		Priority: hooks.PriorityFirst,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			log.Printf("[TOOL] Starting: tool=%s session=%s", hc.ToolName, hc.SessionID)
			return nil
		},
	}); err != nil {
		return err
	}

	if err := registry.Register(&hooks.Hook{
		ID:       "logging.tool.end",
		Name:     "Log Tool Call End",
		Type:     hooks.HookToolCallEnd,
		Priority: hooks.PriorityLast,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			duration, _ := hc.Data["duration"].(time.Duration)
			log.Printf("[TOOL] Completed: tool=%s duration=%v", hc.ToolName, duration)
			return nil
		},
	}); err != nil {
		return err
	}

	return nil
}

// MetricsSkill tracks execution metrics
type MetricsSkill struct {
	*BaseSkill
	sessionCount   int64
	toolCallCount  int64
	errorCount     int64
}

// NewMetricsSkill creates a new metrics skill
func NewMetricsSkill() Skill {
	return &MetricsSkill{
		BaseSkill: NewBaseSkill(
			"builtin.metrics",
			"Metrics",
			SkillCategoryCore,
			"Tracks execution metrics and statistics",
			"1.0.0",
		),
	}
}

func (s *MetricsSkill) RegisterHooks(registry *hooks.Registry) error {
	// Count sessions
	if err := registry.Register(&hooks.Hook{
		ID:       "metrics.session.count",
		Name:     "Count Sessions",
		Type:     hooks.HookSessionStart,
		Priority: hooks.PriorityNormal,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			s.sessionCount++
			return nil
		},
	}); err != nil {
		return err
	}

	// Count tool calls
	if err := registry.Register(&hooks.Hook{
		ID:       "metrics.tool.count",
		Name:     "Count Tool Calls",
		Type:     hooks.HookToolCallStart,
		Priority: hooks.PriorityNormal,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			s.toolCallCount++
			return nil
		},
	}); err != nil {
		return err
	}

	// Count errors
	if err := registry.Register(&hooks.Hook{
		ID:       "metrics.error.count",
		Name:     "Count Errors",
		Type:     hooks.HookSessionError,
		Priority: hooks.PriorityNormal,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			s.errorCount++
			return nil
		},
	}); err != nil {
		return err
	}

	return nil
}

func (s *MetricsSkill) GetTools() []providers.Tool {
	return []providers.Tool{
		{
			Type: "function",
			Function: providers.Function{
				Name:        "get_skill_metrics",
				Description: "Get current execution metrics from the metrics skill",
				Parameters: providers.Parameters{
					Type:       "object",
					Properties: map[string]providers.Property{},
					Required:   []string{},
				},
			},
		},
	}
}

func (s *MetricsSkill) GetToolExecutors() map[string]ToolExecutor {
	return map[string]ToolExecutor{
		"get_skill_metrics": func(args map[string]interface{}, ctx *ToolContext) ToolResult {
			return ToolResult{
				Content: fmt.Sprintf(`{"sessions": %d, "toolCalls": %d, "errors": %d}`,
					s.sessionCount, s.toolCallCount, s.errorCount),
			}
		},
	}
}

// ValidationSkill validates operations before they execute
type ValidationSkill struct {
	*BaseSkill
	blockedTools []string
}

// NewValidationSkill creates a new validation skill
func NewValidationSkill() Skill {
	return &ValidationSkill{
		BaseSkill: NewBaseSkill(
			"builtin.validation",
			"Validation",
			SkillCategoryCore,
			"Validates operations before execution",
			"1.0.0",
		),
		blockedTools: make([]string, 0),
	}
}

func (s *ValidationSkill) Initialize(ctx context.Context, config *SkillConfig) error {
	if err := s.BaseSkill.Initialize(ctx, config); err != nil {
		return err
	}

	// Get blocked tools from config
	if blocked, ok := s.GetSetting("blockedTools"); ok {
		if arr, ok := blocked.([]interface{}); ok {
			for _, item := range arr {
				if str, ok := item.(string); ok {
					s.blockedTools = append(s.blockedTools, str)
				}
			}
		}
	}

	return nil
}

func (s *ValidationSkill) RegisterHooks(registry *hooks.Registry) error {
	// Validate tool calls
	return registry.Register(&hooks.Hook{
		ID:       "validation.tool.check",
		Name:     "Validate Tool Call",
		Type:     hooks.HookToolCallStart,
		Priority: hooks.PriorityFirst,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			for _, blocked := range s.blockedTools {
				if hc.ToolName == blocked {
					hc.Cancel(fmt.Sprintf("tool %s is blocked by validation skill", hc.ToolName))
					return nil
				}
			}
			return nil
		},
	})
}

// CleanupSkill handles cleanup on session stop
type CleanupSkill struct {
	*BaseSkill
	cleanupHandlers []func(sessionID string)
}

// NewCleanupSkill creates a new cleanup skill
func NewCleanupSkill() Skill {
	return &CleanupSkill{
		BaseSkill: NewBaseSkill(
			"builtin.cleanup",
			"Cleanup",
			SkillCategoryCore,
			"Handles cleanup operations when sessions stop",
			"1.0.0",
		),
		cleanupHandlers: make([]func(sessionID string), 0),
	}
}

func (s *CleanupSkill) RegisterHooks(registry *hooks.Registry) error {
	return registry.Register(&hooks.Hook{
		ID:       "cleanup.session.stop",
		Name:     "Session Cleanup",
		Type:     hooks.HookSessionStop,
		Priority: hooks.PriorityLast,
		SkillID:  s.ID(),
		Handler: func(ctx context.Context, hc *hooks.HookContext) error {
			for _, handler := range s.cleanupHandlers {
				handler(hc.SessionID)
			}
			return nil
		},
	})
}

// AddCleanupHandler adds a cleanup handler
func (s *CleanupSkill) AddCleanupHandler(handler func(sessionID string)) {
	s.cleanupHandlers = append(s.cleanupHandlers, handler)
}

// Register built-in skills
func init() {
	RegisterBuiltin("builtin.logging", NewLoggingSkill)
	RegisterBuiltin("builtin.metrics", NewMetricsSkill)
	RegisterBuiltin("builtin.validation", NewValidationSkill)
	RegisterBuiltin("builtin.cleanup", NewCleanupSkill)
}
