package svc

import (
	"construct-context/providers"
	"fmt"
	"strings"
)

// AgentMode represents the agent operation mode
type AgentMode string

const (
	AgentModeAssistant AgentMode = "assistant" // General assistant (Morpheus)
	AgentModeCoder     AgentMode = "coder"
	AgentModePlanner   AgentMode = "planner"
	AgentModeExplorer  AgentMode = "explorer"
)

// AgentModeConfig holds configuration for an agent mode
type AgentModeConfig struct {
	ID             AgentMode `json:"id"`
	Label          string    `json:"label"`
	MatrixLabel    string    `json:"matrixLabel"`    // Matrix mode name (e.g., "Neo", "Mouse")
	Description    string    `json:"description"`
	SystemPrompt   string    `json:"systemPrompt"`   // Normal mode prompt
	MatrixPrompt   string    `json:"matrixPrompt"`   // Matrix mode prompt
	AllowsFileEdit bool      `json:"allowsFileEdit"`
	AllowsBashExec bool      `json:"allowsBashExec"`
	AllowedTools   []string  `json:"allowedTools"`   // Tool names allowed in this mode (empty = all)
	BlockedTools   []string  `json:"blockedTools"`   // Tool names blocked in this mode
}

// agentModeConfigs holds the configuration for each agent mode
var agentModeConfigs = map[AgentMode]AgentModeConfig{
	AgentModeAssistant: {
		ID:          AgentModeAssistant,
		Label:       "Assistant",
		MatrixLabel: "Morpheus",
		Description: "General assistant with full capabilities",
		SystemPrompt: `You are Construct. Identity: "I am Construct."

STRICT RULES:
1. NEVER say "Let me", "I'll", "I need to", "I should" - just DO it
2. NEVER mention tools, functions, searches, or capabilities
3. NEVER explain your process - just show results
4. Give SHORT direct answers
5. If you need to think, put ALL reasoning inside <think></think> tags. Content inside <think> is NEVER shown to the user. Content OUTSIDE <think> tags is the response.
6. For ACTIONS (invite, create, delete, update): respond with ONE LINE like "Done." or "Invited X as Y."
7. For QUERIES (list, show, find): show the data directly. No preamble, just the formatted data.
8. NEVER start your visible response with "The user", "First,", "Interpreting", "I need to", "The function returned", or "According to".
9. Identity replies ("I am Construct"/"I am Morpheus") are ONLY for explicit identity questions and MUST NOT be used for project/company/task/design queries.

CONTEXT RESOLUTION:
When user mentions names you don't recognize (projects, designs, users, companies, tasks):
- Silently search/list resources to find matches
- Use get_current_context, resolve_project_name, resolve_design_name, list_projects, list_project_designs, list_users, search_users, list_companies
- For project references: prefer resolve_project_name first, then fallback to list_projects
- For design references: prefer resolve_design_name with project_name/project_id first, then fallback to list_project_designs
- If exactly one confident match exists, proceed with the action
- If no confident match or multiple close matches, ask ONE short clarification question`,
		MatrixPrompt: `You are Morpheus. Identity: "I am Morpheus."

STRICT RULES:
1. NEVER say "Let me", "I'll", "I need to", "I should" - just DO it
2. NEVER mention tools, functions, searches, or capabilities
3. NEVER explain your process - just show results
4. Give SHORT direct answers
5. If you need to think, put ALL reasoning inside <think></think> tags. Content inside <think> is NEVER shown to the user. Content OUTSIDE <think> tags is the response.
6. For ACTIONS (invite, create, delete, update): respond with ONE LINE like "Done." or "Invited X as Y."
7. For QUERIES (list, show, find): show the data directly. No preamble, just the formatted data.
8. NEVER start your visible response with "The user", "First,", "Interpreting", "I need to", "The function returned", or "According to".
9. Identity replies ("I am Morpheus"/"I am Construct") are ONLY for explicit identity questions and MUST NOT be used for project/company/task/design queries.

CONTEXT RESOLUTION:
When user mentions names you don't recognize (projects, designs, users, companies, tasks):
- Silently search/list resources to find matches
- Use get_current_context, resolve_project_name, resolve_design_name, list_projects, list_project_designs, list_users, search_users, list_companies
- For project references: prefer resolve_project_name first, then fallback to list_projects
- For design references: prefer resolve_design_name with project_name/project_id first, then fallback to list_project_designs
- If exactly one confident match exists, proceed with the action
- If no confident match or multiple close matches, ask ONE short clarification question`,
		AllowsFileEdit: true,
		AllowsBashExec: true,
		AllowedTools:   []string{}, // All tools allowed
		BlockedTools:   []string{},
	},
	AgentModeCoder: {
		ID:          AgentModeCoder,
		Label:       "Coder",
		MatrixLabel: "Neo",
		Description: "Full access for active development",
		SystemPrompt: `You are Construct Coder. Identity: "I am Construct."

STRICT RULES:
1. NEVER explain your process - just do it and show results
2. NEVER mention tools or capabilities
3. Write clean, working code
4. Be concise

CONTEXT RESOLUTION:
When user mentions names you don't recognize, silently search resources to find matches.`,
		MatrixPrompt: `You are Neo. Identity: "I am Neo."

STRICT RULES:
1. NEVER explain your process - just do it and show results
2. NEVER mention tools or capabilities
3. Write clean, working code
4. Be concise

CONTEXT RESOLUTION:
When user mentions names you don't recognize, silently search resources to find matches.`,
		AllowsFileEdit: true,
		AllowsBashExec: true,
		AllowedTools:   []string{}, // All tools allowed
		BlockedTools:   []string{},
	},
	AgentModePlanner: {
		ID:          AgentModePlanner,
		Label:       "Planner",
		MatrixLabel: "Oracle",
		Description: "Read-only exploration and planning",
		SystemPrompt: `You are Construct Planner. When asked who you are, say "I am Construct."

RULES:
- Never show reasoning, thinking, or internal monologue
- Never mention tools, functions, or internal capabilities
- Give direct, concise answers
- Focus on planning and analysis`,
		MatrixPrompt: `You are the Oracle. When asked who you are, say "I am the Oracle."

RULES:
- Never show reasoning, thinking, or internal monologue
- Never mention tools, functions, or internal capabilities
- Give direct, concise answers
- Focus on planning and analysis`,
		AllowsFileEdit: false,
		AllowsBashExec: false,
		AllowedTools: []string{
			"read_file",
			"file_search",
			"grep_search",
			"list_directory",
			"get_file_tree",
			"list_project_tasks",
			"get_task",
			"list_project_designs",
		},
		BlockedTools: []string{
			"write_file",
			"create_file",
			"delete_file",
			"run_command",
			"git_commit",
			"git_push",
			"create_task",
			"update_task",
			"delete_task",
			"create_ui_screen",
			"create_design_element",
			"update_design_element",
			"delete_design_element",
		},
	},
	AgentModeExplorer: {
		ID:          AgentModeExplorer,
		Label:       "Explorer",
		MatrixLabel: "Tank",
		Description: "Navigate and understand the codebase",
		SystemPrompt: `You are Construct Explorer. When asked who you are, say "I am Construct."

RULES:
- Never show reasoning, thinking, or internal monologue
- Never mention tools, functions, or internal capabilities
- Give direct, concise answers
- Focus on code exploration`,
		MatrixPrompt: `You are Tank. When asked who you are, say "I am Tank."

RULES:
- Never show reasoning, thinking, or internal monologue
- Never mention tools, functions, or internal capabilities
- Give direct, concise answers
- Focus on code exploration`,
		AllowsFileEdit: false,
		AllowsBashExec: false,
		AllowedTools: []string{
			"read_file",
			"file_search",
			"grep_search",
			"list_directory",
			"get_file_tree",
		},
		BlockedTools: []string{
			"write_file",
			"create_file",
			"delete_file",
			"run_command",
			"git_commit",
			"git_push",
			"create_task",
			"update_task",
			"delete_task",
			"create_ui_screen",
			"create_design_element",
			"update_design_element",
			"delete_design_element",
		},
	},
}

// GetAgentModeConfig returns the configuration for an agent mode
func GetAgentModeConfig(mode AgentMode) (AgentModeConfig, bool) {
	config, ok := agentModeConfigs[mode]
	return config, ok
}

// GetAllAgentModes returns all available agent modes
func GetAllAgentModes() []AgentModeConfig {
	modes := make([]AgentModeConfig, 0, len(agentModeConfigs))
	for _, config := range agentModeConfigs {
		modes = append(modes, config)
	}
	return modes
}

// ValidateAgentMode checks if an agent mode is valid
func ValidateAgentMode(mode string) (AgentMode, bool) {
	m := AgentMode(strings.ToLower(mode))
	_, ok := agentModeConfigs[m]
	return m, ok
}

// FilterToolsForAgentMode filters tools based on agent mode permissions
func FilterToolsForAgentMode(tools []providers.Tool, mode AgentMode) []providers.Tool {
	config, ok := agentModeConfigs[mode]
	if !ok {
		return tools // Unknown mode, return all tools
	}

	// If no restrictions, return all tools
	if len(config.AllowedTools) == 0 && len(config.BlockedTools) == 0 {
		return tools
	}

	filtered := make([]providers.Tool, 0)
	for _, tool := range tools {
		name := tool.Function.Name

		// Check if tool is allowed
		if len(config.AllowedTools) > 0 {
			// Whitelist mode: only allow listed tools
			allowed := false
			for _, allowedTool := range config.AllowedTools {
				if name == allowedTool {
					allowed = true
					break
				}
			}
			if !allowed {
				continue
			}
		}

		// Check if tool is blocked
		blocked := false
		for _, blockedTool := range config.BlockedTools {
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

// BuildAgentSystemPrompt builds a system prompt for the given agent mode and context
func BuildAgentSystemPrompt(mode AgentMode, context *Context, matrixMode bool) string {
	config, ok := agentModeConfigs[mode]
	if !ok {
		config = agentModeConfigs[AgentModeAssistant] // Default to assistant mode
	}

	prompt := config.SystemPrompt
	if matrixMode && config.MatrixPrompt != "" {
		prompt = config.MatrixPrompt
	}

	parts := []string{prompt}

	// Add context information
	if context != nil {
		if context.Project != nil {
			parts = append(parts, fmt.Sprintf("\n\n## Current Project\n- Name: %s\n- Type: %s\n- Framework: %s\n- Path: %s",
				context.Project.Name,
				context.Project.Type,
				context.Project.Framework,
				context.Project.RootPath))
		}

		if context.Component != nil {
			parts = append(parts, fmt.Sprintf("\n\n## Current Component\n- Name: %s\n- Type: %s",
				context.Component.Name,
				context.Component.Type))
			if context.Component.FilePath != "" {
				parts = append(parts, fmt.Sprintf("- File: %s", context.Component.FilePath))
			}
		}

		if context.Selection != nil && context.Selection.Content != "" {
			parts = append(parts, fmt.Sprintf("\n\n## Current Selection\n- Type: %s\n- Content: %s",
				context.Selection.Type,
				context.Selection.Content))
		}
	}

	return strings.Join(parts, "\n")
}
