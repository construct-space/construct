package agents

import (
	"fmt"
	"sync"
	"time"
)

// Registry manages agent configurations and sessions
type Registry struct {
	mu          sync.RWMutex
	agents      map[string]*AgentConfig
	agentsMD    map[string]*AgentMarkdown // Store original markdown for context rendering
	sessions    map[string]*AgentSession
	metrics     map[string]*AgentMetrics
	customDir   string
	initialized bool
}

// NewRegistry creates a new agent registry
func NewRegistry() *Registry {
	return &Registry{
		agents:   make(map[string]*AgentConfig),
		agentsMD: make(map[string]*AgentMarkdown),
		sessions: make(map[string]*AgentSession),
		metrics:  make(map[string]*AgentMetrics),
	}
}

// Register adds an agent configuration to the registry
func (r *Registry) Register(config *AgentConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.agents[config.ID] = config
	// Initialize metrics if not exists
	if _, ok := r.metrics[config.ID]; !ok {
		r.metrics[config.ID] = &AgentMetrics{AgentID: config.ID}
	}
}

// RegisterMarkdown adds an agent from markdown definition
func (r *Registry) RegisterMarkdown(md *AgentMarkdown) {
	r.mu.Lock()
	defer r.mu.Unlock()

	config := md.ToAgentConfig()
	r.agents[config.ID] = config
	r.agentsMD[config.ID] = md

	// Initialize metrics if not exists
	if _, ok := r.metrics[config.ID]; !ok {
		r.metrics[config.ID] = &AgentMetrics{AgentID: config.ID}
	}
}

// LoadFromMarkdown loads all agents from markdown files
func (r *Registry) LoadFromMarkdown(customDir string) error {
	r.mu.Lock()
	r.customDir = customDir
	r.mu.Unlock()

	loader := NewLoader("", customDir)
	agents, err := loader.LoadAll()
	if err != nil {
		return err
	}

	for _, agent := range agents {
		r.RegisterMarkdown(agent)
	}

	r.mu.Lock()
	r.initialized = true
	r.mu.Unlock()

	return nil
}

// GetMarkdown returns the markdown definition for an agent
func (r *Registry) GetMarkdown(id string) (*AgentMarkdown, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	md, ok := r.agentsMD[id]
	return md, ok
}

// GetWithContext returns an agent config with rendered system prompt
func (r *Registry) GetWithContext(id string, ctx *AgentContext) (*AgentConfig, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	config, ok := r.agents[id]
	if !ok {
		return nil, false
	}

	// If we have the markdown definition, render with context
	if md, hasMD := r.agentsMD[id]; hasMD && ctx != nil {
		rendered, err := md.RenderSystemPrompt(ctx)
		if err == nil {
			// Create a copy with rendered prompt
			configCopy := *config
			configCopy.SystemPrompt = rendered
			return &configCopy, true
		}
	}

	return config, true
}

// Reload reloads agents from markdown files
func (r *Registry) Reload() error {
	r.mu.Lock()
	customDir := r.customDir
	r.mu.Unlock()

	if customDir == "" {
		return nil
	}

	return r.LoadFromMarkdown(customDir)
}

// IsInitialized returns whether the registry has been initialized
func (r *Registry) IsInitialized() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.initialized
}

// Get returns an agent configuration by ID
func (r *Registry) Get(id string) (*AgentConfig, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	config, ok := r.agents[id]
	return config, ok
}

// GetAll returns all registered agents
func (r *Registry) GetAll() []*AgentConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()

	configs := make([]*AgentConfig, 0, len(r.agents))
	for _, config := range r.agents {
		configs = append(configs, config)
	}
	return configs
}

// GetByCategory returns agents of a specific category
func (r *Registry) GetByCategory(category AgentCategory) []*AgentConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()

	configs := make([]*AgentConfig, 0)
	for _, config := range r.agents {
		if config.Category == category {
			configs = append(configs, config)
		}
	}
	return configs
}

// CreateSession creates a new agent session
func (r *Registry) CreateSession(agentID string, parentID string) (*AgentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Verify agent exists
	if _, ok := r.agents[agentID]; !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	sessionID := fmt.Sprintf("session_%s_%d", agentID, time.Now().UnixNano())
	session := &AgentSession{
		ID:        sessionID,
		AgentID:   agentID,
		ParentID:  parentID,
		Messages:  nil,
		State:     SessionPending,
		StartTime: time.Now(),
	}

	r.sessions[sessionID] = session

	// If this is a child session, update parent
	if parentID != "" {
		if parent, ok := r.sessions[parentID]; ok {
			parent.ChildIDs = append(parent.ChildIDs, sessionID)
		}
	}

	return session, nil
}

// GetSession returns a session by ID
func (r *Registry) GetSession(sessionID string) (*AgentSession, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	session, ok := r.sessions[sessionID]
	return session, ok
}

// UpdateSession updates a session's state
func (r *Registry) UpdateSession(sessionID string, update func(*AgentSession)) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	update(session)
	return nil
}

// CompleteSession marks a session as complete
func (r *Registry) CompleteSession(sessionID string, result *AgentResult) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.State = SessionComplete
	session.Result = result
	session.EndTime = time.Now()
	session.TokensUsed = result.TokensUsed

	// Update metrics
	if metrics, ok := r.metrics[session.AgentID]; ok {
		metrics.TotalCalls++
		metrics.SuccessCalls++
		metrics.LastUsed = time.Now()
		// Update average duration
		duration := session.EndTime.Sub(session.StartTime)
		if metrics.AvgDuration == 0 {
			metrics.AvgDuration = duration
		} else {
			metrics.AvgDuration = (metrics.AvgDuration + duration) / 2
		}
		// Update average tokens
		if metrics.AvgTokens == 0 {
			metrics.AvgTokens = result.TokensUsed
		} else {
			metrics.AvgTokens = (metrics.AvgTokens + result.TokensUsed) / 2
		}
	}

	return nil
}

// FailSession marks a session as failed
func (r *Registry) FailSession(sessionID string, err error) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, ok := r.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.State = SessionError
	session.Error = err.Error()
	session.EndTime = time.Now()

	// Update metrics
	if metrics, ok := r.metrics[session.AgentID]; ok {
		metrics.TotalCalls++
		metrics.FailedCalls++
		metrics.LastUsed = time.Now()
	}

	return nil
}

// GetMetrics returns metrics for an agent
func (r *Registry) GetMetrics(agentID string) (*AgentMetrics, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	metrics, ok := r.metrics[agentID]
	return metrics, ok
}

// GetAllMetrics returns metrics for all agents
func (r *Registry) GetAllMetrics() []*AgentMetrics {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*AgentMetrics, 0, len(r.metrics))
	for _, m := range r.metrics {
		result = append(result, m)
	}
	return result
}

// CleanupSessions removes completed sessions older than the specified duration
func (r *Registry) CleanupSessions(maxAge time.Duration) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	removed := 0

	for id, session := range r.sessions {
		if session.State == SessionComplete || session.State == SessionError {
			if session.EndTime.Before(cutoff) {
				delete(r.sessions, id)
				removed++
			}
		}
	}

	return removed
}

// DefaultRegistry is the global agent registry
var DefaultRegistry = NewRegistry()
