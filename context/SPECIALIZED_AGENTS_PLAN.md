# Specialized Agents Architecture Plan for Construct

## Overview

This document outlines the architecture for a specialized agent system in Construct, inspired by OpenCode's agent architecture. The system features a **Conductor** agent that analyzes incoming prompts and routes them to **Space-Specific** agents, each with their own tool permissions and system prompts.

## Architecture Goals

1. **Prompt Routing**: Conductor analyzes user intent and dispatches to the appropriate specialized agent
2. **Tool Isolation**: Each agent only has access to tools relevant to its domain
3. **Context Preservation**: Agents maintain context within their execution session
4. **Composability**: Agents can invoke other agents for complex multi-step tasks
5. **Predictability**: Clear boundaries on what each agent can do

## Agent Hierarchy

```
                    ┌─────────────────┐
                    │    Conductor    │
                    │  (Main Entry)   │
                    └────────┬────────┘
                             │ analyzes & routes
        ┌────────────────────┼────────────────────┐
        │           │        │        │           │
        ▼           ▼        ▼        ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌────┐ ┌───────┐ ┌─────────┐
   │  Code   │ │ Design  │ │Chat│ │Kanban │ │Calendar │
   │  Agent  │ │  Agent  │ │Agent│ │ Agent │ │  Agent  │
   └─────────┘ └─────────┘ └────┘ └───────┘ └─────────┘
        │           │        │        │           │
        ▼           ▼        ▼        ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌────┐ ┌───────┐ ┌─────────┐
   │Code     │ │UI/Design│ │Conv│ │Task   │ │Calendar │
   │Tools    │ │Tools    │ │Tools│ │Tools │ │Tools    │
   └─────────┘ └─────────┘ └────┘ └───────┘ └─────────┘
```

## Conductor Agent

### Role
The Conductor is the main entry point that:
1. Receives user prompts
2. Analyzes intent using lightweight LLM call
3. Routes to the appropriate specialized agent
4. Handles multi-agent orchestration for complex tasks

### Implementation

```go
// agents/conductor.go

type ConductorAgent struct {
    ID            string
    Name          string
    SystemPrompt  string
    AvailableAgents map[string]*AgentConfig
    Provider      providers.Provider
}

type IntentAnalysis struct {
    PrimaryAgent   string   `json:"primary_agent"`
    SecondaryAgents []string `json:"secondary_agents,omitempty"`
    Reasoning      string   `json:"reasoning"`
    Confidence     float64  `json:"confidence"`
}

func (c *ConductorAgent) Analyze(prompt string) (*IntentAnalysis, error) {
    // Use fast model (haiku/flash) to analyze intent
    // Return which agent(s) should handle the request
}

func (c *ConductorAgent) Dispatch(analysis *IntentAnalysis, prompt string, context *Context) (*AgentResult, error) {
    // Route to the appropriate agent
    // Handle multi-agent scenarios
}
```

### Routing Logic

| Intent Pattern | Primary Agent | Secondary |
|----------------|---------------|-----------|
| "create a component", "write code", "fix bug" | Code Agent | Git Agent |
| "design a screen", "add button", "create UI" | Design Agent | - |
| "create task", "add to backlog", "move card" | Kanban Agent | - |
| "schedule meeting", "add event", "what's today" | Calendar Agent | - |
| "explain this", "how does X work" | Explorer Agent | - |
| "commit changes", "create PR", "git status" | Git Agent | - |
| "generate image", "resize photo" | Media Agent | - |
| "general question", "help me with" | Chat Agent | varies |

## Specialized Agents

### 1. Code Agent

**Purpose**: Full codebase access for development tasks

**System Prompt**:
```
You are an expert coding assistant with full access to the codebase.
You can read, write, and modify files. You can execute shell commands.
Focus on implementing features, fixing bugs, and writing clean code.
```

**Allowed Tools**:
- `read_file`, `write_file`, `create_file`, `delete_file`
- `file_search`, `grep_search`, `list_directory`, `get_file_tree`
- `run_command` (with safety restrictions)

**Blocked Tools**:
- Calendar tools
- Kanban tools
- Media generation tools

### 2. Design Agent

**Purpose**: UI/UX design and visual component creation

**System Prompt**:
```
You are a UI/UX design assistant specializing in visual design and component creation.
Focus on creating beautiful, accessible, and functional interfaces.
You work with the design canvas and can create, modify, and arrange UI elements.
```

**Allowed Tools**:
- `create_ui_screen`, `create_design_element`, `update_design_element`, `delete_design_element`
- `list_project_designs`, `get_design`
- `read_file` (for component reference)

**Blocked Tools**:
- Code execution tools
- Git tools
- System tools

### 3. Kanban Agent

**Purpose**: Task and project management

**System Prompt**:
```
You are a project management assistant specializing in task organization.
Help users manage their backlog, track progress, and organize work.
You can create, update, and organize tasks across different states.
```

**Allowed Tools**:
- `list_project_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`
- `move_task`, `assign_task`

**Blocked Tools**:
- Code modification tools
- Design tools
- System commands

### 4. Calendar Agent

**Purpose**: Schedule and event management

**System Prompt**:
```
You are a calendar assistant helping with scheduling and time management.
You can create events, check availability, and manage the user's schedule.
```

**Allowed Tools**:
- `list_events`, `create_event`, `update_event`, `delete_event`
- `check_availability`, `get_today_schedule`

**Blocked Tools**:
- All non-calendar tools

### 5. Git Agent

**Purpose**: Version control operations

**System Prompt**:
```
You are a Git assistant helping with version control operations.
You can commit changes, create branches, manage PRs, and view history.
Always explain what commands will do before executing them.
```

**Allowed Tools**:
- `git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`
- `git_branch`, `git_checkout`, `git_merge`
- `create_pr`, `list_prs`
- `read_file` (for reviewing changes)

**Blocked Tools**:
- Direct file modification (use git operations instead)
- Design tools
- Calendar tools

### 6. Media Agent

**Purpose**: Image and media operations

**System Prompt**:
```
You are a media assistant specializing in image generation and manipulation.
You can create images from descriptions, resize, convert, and optimize media files.
```

**Allowed Tools**:
- `generate_image`, `resize_image`, `convert_image`
- `list_media_files`, `get_media_info`

**Blocked Tools**:
- Code tools
- System tools
- Git tools

### 7. Explorer Agent

**Purpose**: Read-only codebase exploration (existing)

**System Prompt**: (Already defined in agent.go)

**Allowed Tools**:
- `read_file`, `file_search`, `grep_search`
- `list_directory`, `get_file_tree`

### 8. Chat Agent (Default)

**Purpose**: General conversation and help

**System Prompt**:
```
You are a helpful assistant for the Construct development environment.
For specific tasks like coding, design, or project management,
you can delegate to specialized agents.
```

**Allowed Tools**:
- `web_search`, `read_url`
- Basic information tools

**Special Behavior**: Can invoke other agents via `dispatch_to_agent` tool

## Implementation Plan

### Phase 1: Core Infrastructure (2 files)

1. **`agents/types.go`** - Agent type definitions
   ```go
   type AgentConfig struct {
       ID             string
       Name           string
       Category       string // "primary", "specialized", "utility"
       Description    string
       SystemPrompt   string
       AllowedTools   []string
       BlockedTools   []string
       CanInvokeAgents []string // Which other agents this can call
       MaxIterations  int
   }

   type AgentSession struct {
       ID          string
       AgentID     string
       ParentID    string // For nested agent calls
       Messages    []Message
       Context     *Context
       StartTime   time.Time
       Status      string
   }

   type AgentResult struct {
       Content     string
       ToolsUsed   []string
       TokensUsed  int
       Duration    time.Duration
       SubAgents   []string // Agents that were invoked
   }
   ```

2. **`agents/registry.go`** - Agent registry
   ```go
   type AgentRegistry struct {
       agents   map[string]*AgentConfig
       sessions map[string]*AgentSession
   }

   func (r *AgentRegistry) Register(config *AgentConfig)
   func (r *AgentRegistry) Get(id string) (*AgentConfig, bool)
   func (r *AgentRegistry) CreateSession(agentID string, parent string) *AgentSession
   func (r *AgentRegistry) GetSession(sessionID string) (*AgentSession, bool)
   ```

### Phase 2: Conductor Implementation (2 files)

3. **`agents/conductor.go`** - Main conductor agent
   ```go
   func NewConductor(registry *AgentRegistry, provider providers.Provider) *ConductorAgent
   func (c *ConductorAgent) AnalyzeIntent(prompt string) (*IntentAnalysis, error)
   func (c *ConductorAgent) Execute(prompt string, ctx *Context) (*AgentResult, error)
   ```

4. **`agents/router.go`** - Intent routing logic
   ```go
   // Keyword-based and semantic routing
   type Router struct {
       patterns map[string][]string // agent -> keyword patterns
       embeddings map[string][]float32 // For semantic routing (future)
   }

   func (r *Router) Route(prompt string) string
   func (r *Router) GetConfidence(prompt string, agentID string) float64
   ```

### Phase 3: Specialized Agents (1 file per agent)

5. **`agents/code_agent.go`**
6. **`agents/design_agent.go`**
7. **`agents/kanban_agent.go`**
8. **`agents/calendar_agent.go`**
9. **`agents/git_agent.go`**
10. **`agents/media_agent.go`**
11. **`agents/chat_agent.go`**

Each file follows the pattern:
```go
var CodeAgentConfig = &AgentConfig{
    ID:           "code",
    Name:         "Code Agent",
    Category:     "specialized",
    Description:  "Full codebase access for development",
    SystemPrompt: `...`,
    AllowedTools: []string{...},
    BlockedTools: []string{...},
}

func init() {
    DefaultAgentRegistry.Register(CodeAgentConfig)
}
```

### Phase 4: Integration (2 files)

12. **Update `main.go`** - Add agent endpoints
    ```go
    case "agent.analyze":  // Analyze intent without executing
    case "agent.dispatch": // Execute via conductor
    case "agent.direct":   // Execute specific agent directly
    case "agent.list":     // List available agents
    case "agent.session":  // Get session info
    ```

13. **Update `tools.go`** - Add agent dispatch tool
    ```go
    // Add tool for cross-agent invocation
    {
        Name: "dispatch_to_agent",
        Description: "Dispatch a subtask to a specialized agent",
        Parameters: {
            "agent": "Target agent ID",
            "prompt": "Task to execute",
            "wait": "Whether to wait for result"
        }
    }
    ```

### Phase 5: Frontend Integration

14. **`useAgent.ts`** composable for frontend
    ```typescript
    export function useAgent() {
        const analyzeIntent = async (prompt: string) => { ... }
        const dispatch = async (prompt: string) => { ... }
        const invokeAgent = async (agentId: string, prompt: string) => { ... }
        const listAgents = async () => { ... }
    }
    ```

## New Tool: `dispatch_to_agent`

This tool allows agents to invoke other specialized agents:

```go
var DispatchToAgentTool = providers.Tool{
    Type: "function",
    Function: providers.Function{
        Name:        "dispatch_to_agent",
        Description: "Dispatch a subtask to a specialized agent",
        Parameters: providers.Parameters{
            Type: "object",
            Properties: map[string]providers.Property{
                "agent_id": {
                    Type:        "string",
                    Description: "The ID of the agent to dispatch to (code, design, kanban, calendar, git, media)",
                },
                "task": {
                    Type:        "string",
                    Description: "The task description for the agent",
                },
                "context": {
                    Type:        "object",
                    Description: "Additional context to pass to the agent",
                },
            },
            Required: []string{"agent_id", "task"},
        },
    },
}
```

## Intent Analysis Prompt

The conductor uses this prompt to analyze user intent:

```
You are an intent analyzer for a development environment. Analyze the user's request and determine which specialized agent should handle it.

Available agents:
- code: Full codebase access, file editing, code execution
- design: UI/UX design, visual components, design canvas
- kanban: Task management, project boards, work organization
- calendar: Schedule management, events, availability
- git: Version control, commits, branches, PRs
- media: Image generation, media processing
- explorer: Read-only codebase exploration
- chat: General conversation (default)

User request: "{prompt}"

Respond with JSON:
{
  "primary_agent": "agent_id",
  "secondary_agents": ["agent_id", ...],
  "reasoning": "Brief explanation",
  "confidence": 0.0-1.0
}
```

## Session Management

Sessions track agent execution state:

```go
type SessionState string

const (
    SessionPending  SessionState = "pending"
    SessionRunning  SessionState = "running"
    SessionWaiting  SessionState = "waiting"  // Waiting for sub-agent
    SessionComplete SessionState = "complete"
    SessionError    SessionState = "error"
)

type AgentSession struct {
    ID           string
    AgentID      string
    ParentID     string          // For nested calls
    ChildIDs     []string        // Sub-agent sessions
    Messages     []ChatMessage
    Context      *Context
    State        SessionState
    Result       *AgentResult
    StartTime    time.Time
    EndTime      time.Time
    TokensUsed   int
}
```

## Permission Matrix

| Agent | read_file | write_file | run_cmd | git_* | design_* | task_* | calendar_* | dispatch |
|-------|-----------|------------|---------|-------|----------|--------|------------|----------|
| Conductor | - | - | - | - | - | - | - | Yes |
| Code | Yes | Yes | Yes | Yes | No | No | No | No |
| Design | Yes | No | No | No | Yes | No | No | No |
| Kanban | No | No | No | No | No | Yes | No | No |
| Calendar | No | No | No | No | No | No | Yes | No |
| Git | Yes | No | No | Yes | No | No | No | No |
| Media | Yes | No | No | No | No | No | No | No |
| Explorer | Yes | No | No | No | No | No | No | No |
| Chat | No | No | No | No | No | No | No | Yes |

## Error Handling

### Agent Not Found
```json
{
  "error": "agent_not_found",
  "message": "No agent with ID 'xyz' found",
  "available_agents": ["code", "design", "kanban", ...]
}
```

### Permission Denied
```json
{
  "error": "permission_denied",
  "message": "Agent 'design' cannot use tool 'run_command'",
  "agent": "design",
  "tool": "run_command"
}
```

### Session Timeout
```json
{
  "error": "session_timeout",
  "message": "Session exceeded maximum duration",
  "session_id": "...",
  "duration_ms": 30000
}
```

## Metrics & Logging

Track agent performance:

```go
type AgentMetrics struct {
    AgentID      string
    TotalCalls   int64
    SuccessCalls int64
    FailedCalls  int64
    AvgDuration  time.Duration
    AvgTokens    int
    LastUsed     time.Time
}
```

## Future Enhancements

1. **Semantic Routing**: Use embeddings for better intent matching
2. **Agent Memory**: Persistent memory per agent for learning user preferences
3. **Custom Agents**: Allow users to define custom agents with specific tool sets
4. **Agent Chaining**: Define workflows that automatically chain multiple agents
5. **A/B Testing**: Test different agent configurations for optimal performance

## File Structure After Implementation

```
context/
├── agents/
│   ├── types.go          # Agent types and interfaces
│   ├── registry.go       # Agent registry
│   ├── conductor.go      # Main conductor agent
│   ├── router.go         # Intent routing
│   ├── session.go        # Session management
│   ├── code_agent.go     # Code agent config
│   ├── design_agent.go   # Design agent config
│   ├── kanban_agent.go   # Kanban agent config
│   ├── calendar_agent.go # Calendar agent config
│   ├── git_agent.go      # Git agent config
│   ├── media_agent.go    # Media agent config
│   └── chat_agent.go     # Chat agent config
├── tools/
│   ├── dispatch.go       # dispatch_to_agent tool
│   └── ... (existing)
├── agent.go              # (Refactor to use new system)
├── main.go               # Add agent endpoints
└── ...
```

## Migration Path

1. Keep existing `AgentMode` system working during migration
2. Implement new agents alongside
3. Add feature flag to switch between systems
4. Gradually migrate frontend to use new agent endpoints
5. Deprecate old `AgentMode` after full migration

## Testing Strategy

1. **Unit Tests**: Each agent's tool filtering
2. **Integration Tests**: Conductor routing accuracy
3. **E2E Tests**: Full workflow execution
4. **Performance Tests**: Latency of routing decisions

---

## Summary

This architecture provides:
- **Clear separation of concerns**: Each agent has specific responsibilities
- **Tool isolation**: Agents can only use tools relevant to their domain
- **Composability**: Agents can work together on complex tasks
- **Extensibility**: Easy to add new specialized agents
- **Backward compatibility**: Existing modes continue to work during migration
