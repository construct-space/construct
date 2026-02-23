// Package agents implements the specialized agent system for Construct
package agents

import (
	"construct-context/providers"
	"time"
)

// AgentCategory represents the type of agent
type AgentCategory string

const (
	AgentCategoryPrimary     AgentCategory = "primary"     // Main conductor
	AgentCategorySpecialized AgentCategory = "specialized" // Domain-specific agents
	AgentCategoryUtility     AgentCategory = "utility"     // Helper agents
)

// AgentConfig defines the configuration for an agent
type AgentConfig struct {
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	Category        AgentCategory `json:"category"`
	Description     string        `json:"description"`
	Icon            string        `json:"icon,omitempty"`            // Icon identifier (e.g., "lucide:code")
	SystemPrompt    string        `json:"systemPrompt"`
	AllowedTools    []string      `json:"allowedTools,omitempty"`    // If set, only these tools are available
	BlockedTools    []string      `json:"blockedTools,omitempty"`    // These tools are blocked
	CanInvokeAgents []string      `json:"canInvokeAgents,omitempty"` // Which agents this can dispatch to
	MaxIterations   int           `json:"maxIterations"`             // Max tool call iterations (default 30)
	Model           string        `json:"model,omitempty"`           // Preferred model (optional)
	IsBuiltin       bool          `json:"isBuiltin"`                 // Whether this is a builtin agent
	RequiresVision  bool          `json:"requiresVision,omitempty"`  // Whether this agent needs vision capabilities
}

// SessionState represents the current state of an agent session
type SessionState string

const (
	SessionPending  SessionState = "pending"
	SessionRunning  SessionState = "running"
	SessionWaiting  SessionState = "waiting"  // Waiting for sub-agent
	SessionComplete SessionState = "complete"
	SessionError    SessionState = "error"
)

// AgentSession tracks the execution state of an agent
type AgentSession struct {
	ID          string                           `json:"id"`
	AgentID     string                           `json:"agentId"`
	ParentID    string                           `json:"parentId,omitempty"` // For nested agent calls
	ChildIDs    []string                         `json:"childIds,omitempty"` // Sub-agent sessions
	Messages    []providers.ChatMessageWithTools `json:"messages"`
	Context     map[string]interface{}           `json:"context,omitempty"`
	State       SessionState                     `json:"state"`
	Result      *AgentResult                     `json:"result,omitempty"`
	Error       string                           `json:"error,omitempty"`
	StartTime   time.Time                        `json:"startTime"`
	EndTime     time.Time                        `json:"endTime,omitempty"`
	TokensUsed  int                              `json:"tokensUsed"`
	Iterations  int                              `json:"iterations"`
}

// AgentResult represents the result of an agent execution
type AgentResult struct {
	Content      string        `json:"content"`
	ToolsUsed    []string      `json:"toolsUsed,omitempty"`
	TokensUsed   int           `json:"tokensUsed"`
	Duration     time.Duration `json:"duration"`
	SubAgents    []string      `json:"subAgents,omitempty"` // Agents that were invoked
	Iterations   int           `json:"iterations"`
	FinalMessage string        `json:"finalMessage,omitempty"`
}

// IntentAnalysis represents the conductor's analysis of user intent
type IntentAnalysis struct {
	PrimaryAgent    string   `json:"primary_agent"`
	SecondaryAgents []string `json:"secondary_agents,omitempty"`
	Reasoning       string   `json:"reasoning"`
	Confidence      float64  `json:"confidence"`
	Keywords        []string `json:"keywords,omitempty"`
}

// AgentMetrics tracks performance metrics for an agent
type AgentMetrics struct {
	AgentID      string        `json:"agentId"`
	TotalCalls   int64         `json:"totalCalls"`
	SuccessCalls int64         `json:"successCalls"`
	FailedCalls  int64         `json:"failedCalls"`
	AvgDuration  time.Duration `json:"avgDuration"`
	AvgTokens    int           `json:"avgTokens"`
	LastUsed     time.Time     `json:"lastUsed"`
}

// DispatchRequest represents a request to dispatch to an agent
type DispatchRequest struct {
	AgentID     string                 `json:"agent_id"`
	Task        string                 `json:"task"`
	Context     map[string]interface{} `json:"context,omitempty"`
	ContextJSON string                 `json:"context_json,omitempty"` // Serialized context from previous phase
	SessionID   string                 `json:"session_id,omitempty"`   // Parent session for nested calls
	Model       string                 `json:"model,omitempty"`
	Config      *AgentConfig                    `json:"-"` // Override config (bypasses registry lookup)
	Messages    []providers.ChatMessageWithTools `json:"-"` // Pre-built conversation messages (bypasses message construction)
}

// DispatchResponse represents the response from a dispatch
type DispatchResponse struct {
	SessionID string       `json:"session_id"`
	AgentID   string       `json:"agent_id"`
	Result    *AgentResult `json:"result,omitempty"`
	Error     string       `json:"error,omitempty"`
}

// FilterTools filters the available tools based on agent configuration
func (c *AgentConfig) FilterTools(allTools []providers.Tool) []providers.Tool {
	// If no restrictions, return all tools
	if len(c.AllowedTools) == 0 && len(c.BlockedTools) == 0 {
		return allTools
	}

	filtered := make([]providers.Tool, 0)
	for _, tool := range allTools {
		name := tool.Function.Name

		// Check if tool is allowed (whitelist mode)
		if len(c.AllowedTools) > 0 {
			allowed := false
			for _, allowedTool := range c.AllowedTools {
				if name == allowedTool {
					allowed = true
					break
				}
			}
			if !allowed {
				continue
			}
		}

		// Check if tool is blocked (blacklist mode)
		blocked := false
		for _, blockedTool := range c.BlockedTools {
			if name == blockedTool {
				blocked = true
				break
			}
		}
		if blocked {
			continue
		}

		filtered = append(filtered, tool)
	}

	return filtered
}

// CanInvoke checks if this agent can invoke another agent
func (c *AgentConfig) CanInvoke(targetAgentID string) bool {
	if len(c.CanInvokeAgents) == 0 {
		return false
	}
	for _, id := range c.CanInvokeAgents {
		if id == targetAgentID || id == "*" {
			return true
		}
	}
	return false
}

// GetMaxIterations returns the max iterations, with a default of 30
func (c *AgentConfig) GetMaxIterations() int {
	if c.MaxIterations <= 0 {
		return 30
	}
	return c.MaxIterations
}
