package tools

import (
	"construct-context/providers"
	"encoding/json"
)

// Dispatch tool definitions for cross-agent invocation
var dispatchTools = []providers.Tool{
	{
		Type: "function",
		Function: providers.Function{
			Name:        "dispatch_to_agent",
			Description: "Dispatch a subtask to a specialized agent. Use this to delegate specific tasks to agents with the right expertise.",
			Parameters: providers.Parameters{
				Type: "object",
				Properties: map[string]providers.Property{
					"agent_id": {
						Type:        "string",
						Description: "The ID of the agent to dispatch to. Available: code, design, kanban, calendar, git, media, explorer, planner",
						Enum:        []string{"code", "design", "kanban", "calendar", "git", "media", "explorer", "planner"},
					},
					"task": {
						Type:        "string",
						Description: "The task description for the agent to execute",
					},
					"context": {
						Type:        "string",
						Description: "Optional JSON string with additional context to pass to the agent",
					},
				},
				Required: []string{"agent_id", "task"},
			},
		},
	},
}

// DispatchCategory contains dispatch-related tools
var DispatchCategory = &ToolCategory{
	Name:        "dispatch",
	Description: "Tools for cross-agent communication and delegation",
	Tools:       dispatchTools,
}

// executeDispatchToAgent handles the dispatch_to_agent tool
func executeDispatchToAgent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	agentID, ok := args["agent_id"].(string)
	if !ok || agentID == "" {
		return ToolResult{
			Content: "Error: agent_id is required",
			IsError: true,
		}
	}

	task, ok := args["task"].(string)
	if !ok || task == "" {
		return ToolResult{
			Content: "Error: task is required",
			IsError: true,
		}
	}

	// Parse optional context
	var context map[string]interface{}
	if contextStr, ok := args["context"].(string); ok && contextStr != "" {
		if err := json.Unmarshal([]byte(contextStr), &context); err != nil {
			// Ignore parse error, just use nil context
		}
	}

	// This tool needs to be handled specially by the conductor
	// Return a structured result that the conductor can interpret
	result := map[string]interface{}{
		"action":   "dispatch",
		"agent_id": agentID,
		"task":     task,
		"context":  context,
	}

	resultJSON, _ := json.Marshal(result)
	return ToolResult{
		Content: string(resultJSON),
		IsError: false,
	}
}

func init() {
	// Register dispatch tools
	DefaultRegistry.RegisterCategory(DispatchCategory)
	DefaultRegistry.RegisterExecutor("dispatch_to_agent", executeDispatchToAgent)
}
