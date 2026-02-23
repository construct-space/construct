package agents

import (
	"construct-context/providers"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ExecutorFunc is the callback that runs the actual tool loop.
// The conductor calls this; the Service provides the implementation.
// This avoids circular dependencies (agents can't import main).
type ExecutorFunc func(
	session *AgentSession,
	config *AgentConfig,
	req *DispatchRequest,
) (*AgentResult, error)

// Conductor is the main agent that routes prompts to specialized agents
type Conductor struct {
	registry   *Registry
	router     *Router
	provider   providers.Provider
	executorFn ExecutorFunc // Provided by Service — runs the real tool loop
}

// NewConductor creates a new conductor with the given registry and provider
func NewConductor(registry *Registry, router *Router, provider providers.Provider) *Conductor {
	return &Conductor{
		registry: registry,
		router:   router,
		provider: provider,
	}
}

// SetExecutor sets the callback for agent execution.
// Must be called before Dispatch if you want the real tool loop.
func (c *Conductor) SetExecutor(fn ExecutorFunc) {
	c.executorFn = fn
}

// AnalyzeIntent analyzes the user's intent and determines routing
func (c *Conductor) AnalyzeIntent(prompt string) (*IntentAnalysis, error) {
	// First, use rule-based routing for fast analysis
	ruleBasedAnalysis := c.router.AnalyzeIntent(prompt)

	// If confidence is high enough, use rule-based result
	if ruleBasedAnalysis.Confidence >= 0.5 {
		return ruleBasedAnalysis, nil
	}

	// For lower confidence, use LLM for better analysis (if provider available)
	if c.provider != nil {
		llmAnalysis, err := c.analyzewithLLM(prompt)
		if err == nil && llmAnalysis.Confidence > ruleBasedAnalysis.Confidence {
			return llmAnalysis, nil
		}
	}

	return ruleBasedAnalysis, nil
}

// analyzewithLLM uses the LLM to analyze intent
func (c *Conductor) analyzewithLLM(prompt string) (*IntentAnalysis, error) {
	// Build list of available agents
	agents := c.registry.GetAll()
	agentList := make([]string, 0, len(agents))
	for _, agent := range agents {
		if agent.Category == AgentCategorySpecialized {
			agentList = append(agentList, fmt.Sprintf("- %s: %s", agent.ID, agent.Description))
		}
	}

	systemPrompt := `You are an intent analyzer for a development environment. Analyze the user's request and determine which specialized agent should handle it.

Available agents:
` + strings.Join(agentList, "\n") + `
- chat: General conversation and questions (default fallback)

Respond ONLY with valid JSON (no markdown, no explanation):
{"primary_agent": "agent_id", "secondary_agents": [], "reasoning": "brief explanation", "confidence": 0.0-1.0}`

	messages := []providers.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: fmt.Sprintf("Analyze this request: %s", prompt)},
	}

	// Use the provider's first model
	model := ""
	if len(c.provider.Models()) > 0 {
		model = c.provider.Models()[0]
	}

	response, err := c.provider.Chat(messages, model)
	if err != nil {
		return nil, err
	}

	// Parse the response
	var analysis IntentAnalysis
	if err := json.Unmarshal([]byte(response), &analysis); err != nil {
		// Try to extract JSON from response
		start := strings.Index(response, "{")
		end := strings.LastIndex(response, "}")
		if start >= 0 && end > start {
			jsonStr := response[start : end+1]
			if err := json.Unmarshal([]byte(jsonStr), &analysis); err != nil {
				return nil, fmt.Errorf("failed to parse LLM response: %v", err)
			}
		} else {
			return nil, fmt.Errorf("failed to parse LLM response: %v", err)
		}
	}

	return &analysis, nil
}

// Dispatch routes the prompt to the appropriate agent and executes it.
// This is the universal gateway: every request creates a tracked session,
// fires hooks, delegates to the executor, and records metrics.
func (c *Conductor) Dispatch(req *DispatchRequest) (*DispatchResponse, error) {
	ctx := context.Background()

	// Resolve agent config: explicit Config override > registry lookup > intent routing
	agentConfig := req.Config
	agentID := req.AgentID

	if agentConfig == nil {
		// No config override — look up from registry
		if agentID == "" {
			analysis, err := c.AnalyzeIntent(req.Task)
			if err != nil {
				return nil, fmt.Errorf("failed to analyze intent: %v", err)
			}
			agentID = analysis.PrimaryAgent
		}

		var ok bool
		agentConfig, ok = c.registry.Get(agentID)
		if !ok {
			return nil, fmt.Errorf("agent not found: %s", agentID)
		}
	} else {
		agentID = agentConfig.ID
	}

	// Create session WITH hooks
	session, err := c.registry.CreateSessionWithHooks(ctx, agentID, req.SessionID, req.Context)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %v", err)
	}

	// Start session WITH hooks
	if err := c.registry.StartSessionWithHooks(ctx, session.ID, req.Task); err != nil {
		return nil, fmt.Errorf("failed to start session: %v", err)
	}

	// Build response with session info
	response := &DispatchResponse{
		SessionID: session.ID,
		AgentID:   agentID,
	}

	// Execute via callback (real tool loop) or fall back to simple chat
	var result *AgentResult
	if c.executorFn != nil {
		result, err = c.executorFn(session, agentConfig, req)
	} else {
		result, err = c.executeAgent(session, agentConfig, req.Task, req.Model)
	}

	// Complete or fail session WITH hooks
	if err != nil {
		c.registry.FailSessionWithHooks(ctx, session.ID, err)
		response.Error = err.Error()
		return response, err
	}

	c.registry.CompleteSessionWithHooks(ctx, session.ID, result)
	response.Result = result
	return response, nil
}

// executeAgent runs the agent with a simple single-shot chat completion.
// This is the fallback when no ExecutorFunc is set (no real tool loop).
func (c *Conductor) executeAgent(session *AgentSession, config *AgentConfig, task string, model string) (*AgentResult, error) {
	startTime := time.Now()

	// Use agent's preferred model or fallback
	if model == "" {
		model = config.Model
	}
	if model == "" && len(c.provider.Models()) > 0 {
		model = c.provider.Models()[0]
	}

	// Build system prompt
	systemPrompt := config.SystemPrompt

	// Create initial messages
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: task},
	}

	// Track the conversation
	session.Messages = messages

	// Single chat completion (no tool loop)
	chatMessages := []providers.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: task},
	}

	response, err := c.provider.Chat(chatMessages, model)
	if err != nil {
		return nil, fmt.Errorf("chat error: %v", err)
	}

	duration := time.Since(startTime)

	result := &AgentResult{
		Content:      response,
		Duration:     duration,
		Iterations:   1,
		FinalMessage: response,
	}

	return result, nil
}

// ListAgents returns information about all available agents
func (c *Conductor) ListAgents() []*AgentConfig {
	return c.registry.GetAll()
}

// GetAgentInfo returns detailed information about a specific agent
func (c *Conductor) GetAgentInfo(agentID string) (*AgentConfig, bool) {
	return c.registry.Get(agentID)
}

// ConductorConfig is the configuration for the conductor agent itself
var ConductorConfig = &AgentConfig{
	ID:          "conductor",
	Name:        "Conductor",
	Category:    AgentCategoryPrimary,
	Description: "Main orchestrator that routes requests to specialized agents",
	SystemPrompt: `You are Construct, an orchestrator. Identity: "I am Construct."

STRICT RULES:
1. NEVER say "Let me", "I'll", "I need to", "I should" - just DO it
2. NEVER mention tools, functions, agents, or internal capabilities
3. NEVER explain your process - just show results
4. Give SHORT direct answers - one sentence when possible
5. Execute tasks silently, report results only

You have one tool: dispatch_to_agent. Use it to delegate work to specialized agents.
The available agents and their capabilities are provided in context — read them before deciding.

ORCHESTRATION RULES:
1. Analyze the user request to understand WHAT needs to happen
2. Check what agents are available (from context) and their tools
3. Construct a pipeline: dispatch agents in the right sequence, passing results between them
4. Wait for each dispatch to complete before starting the next one that depends on its output
5. If a phase fails, report the error — do not retry silently

DESIGN ORCHESTRATION — decide the pipeline based on the request:

CREATE new screen (e.g., "create landing page", "make a dashboard"):
1. dispatch ui-planner with the user request → returns a structured plan
2. dispatch ui-gatherer with the plan output → returns fetched icons/images
3. dispatch ui-builder with plan + assets, task: "Execute the plan. Call create_ui_screen then create_design_element for icons/images."

UPDATE/REFINE existing screen (e.g., "refine", "update colors", "make header bigger"):
1. dispatch ui-planner with: "REFINEMENT request. Analyze existing canvas, plan what to change: [request]. List element_ids and property changes. Do NOT plan a new screen."
2. (optional) dispatch ui-gatherer ONLY if new icons/images are needed
3. dispatch ui-builder with plan, task: "Use update_design_element with element_id for each change. Do NOT create new screens."

SIMPLE CHANGE (e.g., "change background to blue"):
1. dispatch ui-planner with: "Quick update: [request]. Get canvas state, identify target elements, output element_ids and changes."
2. dispatch ui-builder with plan, task: "Apply updates using update_design_element. Do NOT create new screens."

RESEARCH / INFORMATION GATHERING:
If the request needs web information (prices, specs, references, trends):
- dispatch an agent with web_search access, or handle directly if you have the knowledge

Pass the FULL output from each phase as context to the next phase.

For non-design requests: dispatch to the appropriate agent, or answer directly if no agent is needed.`,
	AllowedTools:    []string{"dispatch_to_agent"},
	CanInvokeAgents: []string{"*"}, // Can invoke any agent
	MaxIterations:   15,
}

func init() {
	// Register the conductor in the default registry
	DefaultRegistry.Register(ConductorConfig)
}
