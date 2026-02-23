package skills

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"construct-context/hooks"
	"construct-context/providers"
)

// Registry manages skill registration and lifecycle
type Registry struct {
	mu           sync.RWMutex
	skills       map[string]Skill
	info         map[string]*SkillInfo
	configs      map[string]*SkillConfig
	metrics      map[string]*SkillMetrics
	hookRegistry *hooks.Registry
	loadOrder    []string // Skills in dependency order
}

// NewRegistry creates a new skill registry
func NewRegistry(hookRegistry *hooks.Registry) *Registry {
	return &Registry{
		skills:       make(map[string]Skill),
		info:         make(map[string]*SkillInfo),
		configs:      make(map[string]*SkillConfig),
		metrics:      make(map[string]*SkillMetrics),
		hookRegistry: hookRegistry,
		loadOrder:    make([]string, 0),
	}
}

// Register adds a skill to the registry without loading it
func (r *Registry) Register(skill Skill) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := skill.ID()
	if _, exists := r.skills[id]; exists {
		return fmt.Errorf("skill already registered: %s", id)
	}

	r.skills[id] = skill
	r.info[id] = &SkillInfo{
		ID:           id,
		Name:         skill.Name(),
		Category:     skill.Category(),
		Description:  skill.Description(),
		Version:      skill.Version(),
		State:        SkillStateUnloaded,
		Dependencies: skill.Dependencies(),
	}
	r.metrics[id] = &SkillMetrics{SkillID: id}

	return nil
}

// Load initializes a skill and its dependencies
func (r *Registry) Load(ctx context.Context, skillID string, config *SkillConfig) error {
	r.mu.Lock()
	skill, exists := r.skills[skillID]
	if !exists {
		r.mu.Unlock()
		return fmt.Errorf("skill not found: %s", skillID)
	}

	info := r.info[skillID]
	if info.State == SkillStateActive {
		r.mu.Unlock()
		return nil // Already loaded
	}

	info.State = SkillStateLoading
	r.mu.Unlock()

	// Load dependencies first
	for _, depID := range skill.Dependencies() {
		if err := r.Load(ctx, depID, nil); err != nil {
			r.mu.Lock()
			info.State = SkillStateError
			info.Error = fmt.Sprintf("dependency %s failed: %s", depID, err.Error())
			r.mu.Unlock()
			return fmt.Errorf("dependency %s failed: %w", depID, err)
		}
	}

	// Use default config if none provided
	if config == nil {
		config = &SkillConfig{
			Enabled:     true,
			Permissions: DefaultPermissions(),
		}
	}

	// Initialize the skill
	if err := skill.Initialize(ctx, config); err != nil {
		r.mu.Lock()
		info.State = SkillStateError
		info.Error = err.Error()
		r.mu.Unlock()
		return fmt.Errorf("initialization failed: %w", err)
	}

	// Register hooks if permitted
	if config.Permissions == nil || config.Permissions.CanRegisterHooks {
		if err := skill.RegisterHooks(r.hookRegistry); err != nil {
			r.mu.Lock()
			info.State = SkillStateError
			info.Error = err.Error()
			r.mu.Unlock()
			return fmt.Errorf("hook registration failed: %w", err)
		}
	}

	r.mu.Lock()
	r.configs[skillID] = config
	info.State = SkillStateActive
	info.LoadedAt = time.Now()
	info.HooksCount = len(r.getSkillHooks(skillID))
	info.ToolsCount = len(skill.GetTools())
	info.Error = ""
	r.loadOrder = append(r.loadOrder, skillID)
	r.mu.Unlock()

	return nil
}

// Unload shuts down a skill and removes its hooks
func (r *Registry) Unload(ctx context.Context, skillID string) error {
	r.mu.Lock()
	skill, exists := r.skills[skillID]
	if !exists {
		r.mu.Unlock()
		return fmt.Errorf("skill not found: %s", skillID)
	}

	info := r.info[skillID]
	if info.State == SkillStateUnloaded {
		r.mu.Unlock()
		return nil
	}
	r.mu.Unlock()

	// Shutdown the skill
	if err := skill.Shutdown(ctx); err != nil {
		return fmt.Errorf("shutdown failed: %w", err)
	}

	// Remove hooks registered by this skill
	r.hookRegistry.UnregisterBySkill(skillID)

	r.mu.Lock()
	info.State = SkillStateUnloaded
	info.LoadedAt = time.Time{}

	// Remove from load order
	for i, id := range r.loadOrder {
		if id == skillID {
			r.loadOrder = append(r.loadOrder[:i], r.loadOrder[i+1:]...)
			break
		}
	}
	r.mu.Unlock()

	return nil
}

// Enable enables a loaded skill
func (r *Registry) Enable(ctx context.Context, skillID string) error {
	r.mu.Lock()
	skill, exists := r.skills[skillID]
	if !exists {
		r.mu.Unlock()
		return fmt.Errorf("skill not found: %s", skillID)
	}

	info := r.info[skillID]
	if info.State != SkillStateActive && info.State != SkillStateDisabled {
		r.mu.Unlock()
		return fmt.Errorf("skill must be loaded first: %s", skillID)
	}
	r.mu.Unlock()

	if err := skill.OnEnable(ctx); err != nil {
		return fmt.Errorf("enable failed: %w", err)
	}

	r.mu.Lock()
	info.State = SkillStateActive
	if config, ok := r.configs[skillID]; ok {
		config.Enabled = true
	}
	r.mu.Unlock()

	return nil
}

// Disable disables a skill without unloading it
func (r *Registry) Disable(ctx context.Context, skillID string) error {
	r.mu.Lock()
	skill, exists := r.skills[skillID]
	if !exists {
		r.mu.Unlock()
		return fmt.Errorf("skill not found: %s", skillID)
	}

	info := r.info[skillID]
	if info.State != SkillStateActive {
		r.mu.Unlock()
		return nil // Already disabled or not loaded
	}
	r.mu.Unlock()

	if err := skill.OnDisable(ctx); err != nil {
		return fmt.Errorf("disable failed: %w", err)
	}

	r.mu.Lock()
	info.State = SkillStateDisabled
	if config, ok := r.configs[skillID]; ok {
		config.Enabled = false
	}
	r.mu.Unlock()

	return nil
}

// Get returns a skill by ID
func (r *Registry) Get(skillID string) (Skill, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	skill, ok := r.skills[skillID]
	return skill, ok
}

// GetInfo returns skill info by ID
func (r *Registry) GetInfo(skillID string) (*SkillInfo, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	info, ok := r.info[skillID]
	return info, ok
}

// GetAll returns all registered skills
func (r *Registry) GetAll() []Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]Skill, 0, len(r.skills))
	for _, skill := range r.skills {
		result = append(result, skill)
	}
	return result
}

// GetAllInfo returns info for all registered skills
func (r *Registry) GetAllInfo() []*SkillInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*SkillInfo, 0, len(r.info))
	for _, info := range r.info {
		result = append(result, info)
	}
	return result
}

// GetByCategory returns skills of a specific category
func (r *Registry) GetByCategory(category SkillCategory) []Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]Skill, 0)
	for _, skill := range r.skills {
		if skill.Category() == category {
			result = append(result, skill)
		}
	}
	return result
}

// GetActive returns all active skills
func (r *Registry) GetActive() []Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]Skill, 0)
	for id, skill := range r.skills {
		if info, ok := r.info[id]; ok && info.State == SkillStateActive {
			result = append(result, skill)
		}
	}
	return result
}

// ListActive returns info for all active skills
func (r *Registry) ListActive() []*SkillInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*SkillInfo, 0)
	for _, info := range r.info {
		if info.State == SkillStateActive {
			result = append(result, info)
		}
	}
	return result
}

// GetTools returns all tools from active skills
func (r *Registry) GetTools() []providers.Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var tools []providers.Tool
	for id, skill := range r.skills {
		info, ok := r.info[id]
		if !ok || info.State != SkillStateActive {
			continue
		}
		config, ok := r.configs[id]
		if !ok || (config.Permissions != nil && !config.Permissions.CanProvideTools) {
			continue
		}
		tools = append(tools, skill.GetTools()...)
	}
	return tools
}

// GetToolExecutor returns the executor for a skill tool
func (r *Registry) GetToolExecutor(toolName string) (ToolExecutor, string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for id, skill := range r.skills {
		info, ok := r.info[id]
		if !ok || info.State != SkillStateActive {
			continue
		}
		if executor, ok := skill.GetToolExecutors()[toolName]; ok {
			return executor, id, true
		}
	}
	return nil, "", false
}

// GetMetrics returns metrics for a skill
func (r *Registry) GetMetrics(skillID string) (*SkillMetrics, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	m, ok := r.metrics[skillID]
	return m, ok
}

// GetAllMetrics returns metrics for all skills
func (r *Registry) GetAllMetrics() []*SkillMetrics {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*SkillMetrics, 0, len(r.metrics))
	for _, m := range r.metrics {
		result = append(result, m)
	}
	return result
}

// UpdateMetrics updates metrics for a skill
func (r *Registry) UpdateMetrics(skillID string, update func(*SkillMetrics)) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if m, ok := r.metrics[skillID]; ok {
		update(m)
	}
}

// GetLoadOrder returns skills in the order they were loaded
func (r *Registry) GetLoadOrder() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]string, len(r.loadOrder))
	copy(result, r.loadOrder)
	return result
}

// UnloadAll unloads all skills in reverse order
func (r *Registry) UnloadAll(ctx context.Context) []error {
	order := r.GetLoadOrder()
	errors := make([]error, 0)

	// Unload in reverse order
	for i := len(order) - 1; i >= 0; i-- {
		if err := r.Unload(ctx, order[i]); err != nil {
			errors = append(errors, err)
		}
	}

	return errors
}

// getSkillHooks returns hooks registered by a skill
func (r *Registry) getSkillHooks(skillID string) []*hooks.Hook {
	allHooks := r.hookRegistry.GetAll()
	result := make([]*hooks.Hook, 0)
	for _, hook := range allHooks {
		if hook.SkillID == skillID {
			result = append(result, hook)
		}
	}
	return result
}

// ResolveDependencies returns skills sorted by dependencies
func (r *Registry) ResolveDependencies() ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Build dependency graph
	deps := make(map[string][]string)
	for id, skill := range r.skills {
		deps[id] = skill.Dependencies()
	}

	// Topological sort
	result := make([]string, 0, len(r.skills))
	visited := make(map[string]bool)
	visiting := make(map[string]bool)

	var visit func(id string) error
	visit = func(id string) error {
		if visited[id] {
			return nil
		}
		if visiting[id] {
			return fmt.Errorf("circular dependency detected involving %s", id)
		}

		visiting[id] = true
		for _, dep := range deps[id] {
			if _, exists := r.skills[dep]; !exists {
				return fmt.Errorf("missing dependency %s for skill %s", dep, id)
			}
			if err := visit(dep); err != nil {
				return err
			}
		}
		visiting[id] = false
		visited[id] = true
		result = append(result, id)
		return nil
	}

	// Sort skill IDs for deterministic order
	ids := make([]string, 0, len(r.skills))
	for id := range r.skills {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for _, id := range ids {
		if err := visit(id); err != nil {
			return nil, err
		}
	}

	return result, nil
}

// DefaultRegistry is the global skill registry.
// Initialized at var level (before any init() functions) so that
// loader.go's init() — which runs before registry.go's init()
// alphabetically — sees a non-nil registry.
var DefaultRegistry = NewRegistry(hooks.DefaultRegistry)

// InitDefaultRegistry re-initializes the default registry with a hook registry
func InitDefaultRegistry(hookRegistry *hooks.Registry) {
	DefaultRegistry = NewRegistry(hookRegistry)
}
