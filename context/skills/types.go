// Package skills implements a modular capability system for Construct.
// Skills are self-contained units that can register hooks, provide tools,
// and extend the system's functionality in a pluggable way.
package skills

import (
	"context"
	"time"

	"construct-context/hooks"
	"construct-context/providers"
)

// SkillCategory represents the type of skill
type SkillCategory string

const (
	SkillCategoryCore       SkillCategory = "core"       // Core system skills
	SkillCategoryAgent      SkillCategory = "agent"      // Agent-related skills
	SkillCategoryTool       SkillCategory = "tool"       // Tool-providing skills
	SkillCategoryIntegration SkillCategory = "integration" // External integrations
	SkillCategoryUI         SkillCategory = "ui"         // UI-related skills
	SkillCategoryCustom     SkillCategory = "custom"     // User-defined skills
)

// SkillState represents the current state of a skill
type SkillState string

const (
	SkillStateUnloaded  SkillState = "unloaded"  // Not loaded
	SkillStateLoading   SkillState = "loading"   // Currently loading
	SkillStateActive    SkillState = "active"    // Loaded and active
	SkillStateDisabled  SkillState = "disabled"  // Loaded but disabled
	SkillStateError     SkillState = "error"     // Failed to load
)

// Skill defines the interface that all skills must implement
type Skill interface {
	// ID returns the unique identifier for this skill
	ID() string

	// Name returns the human-readable name
	Name() string

	// Category returns the skill category
	Category() SkillCategory

	// Description returns a description of what this skill does
	Description() string

	// Version returns the skill version
	Version() string

	// Dependencies returns IDs of skills this depends on
	Dependencies() []string

	// Initialize is called when the skill is loaded
	Initialize(ctx context.Context, config *SkillConfig) error

	// Shutdown is called when the skill is unloaded
	Shutdown(ctx context.Context) error

	// RegisterHooks registers any hooks this skill provides
	RegisterHooks(registry *hooks.Registry) error

	// GetTools returns any tools this skill provides
	GetTools() []providers.Tool

	// GetToolExecutors returns executors for the skill's tools
	GetToolExecutors() map[string]ToolExecutor

	// OnEnable is called when the skill is enabled
	OnEnable(ctx context.Context) error

	// OnDisable is called when the skill is disabled
	OnDisable(ctx context.Context) error
}

// ToolExecutor is a function that executes a skill-provided tool
type ToolExecutor func(args map[string]interface{}, ctx *ToolContext) ToolResult

// ToolContext provides context for tool execution
type ToolContext struct {
	SkillID    string
	ToolCallID string
	SessionID  string
	Context    context.Context
	Config     map[string]interface{}
}

// ToolResult represents the result of a tool execution
type ToolResult struct {
	Content string `json:"content"`
	IsError bool   `json:"isError,omitempty"`
}

// SkillConfig contains configuration for a skill
type SkillConfig struct {
	// Enabled determines if the skill is active
	Enabled bool `json:"enabled"`

	// Settings contains skill-specific settings
	Settings map[string]interface{} `json:"settings,omitempty"`

	// Permissions defines what the skill can access
	Permissions *SkillPermissions `json:"permissions,omitempty"`
}

// SkillPermissions defines what a skill can access
type SkillPermissions struct {
	// CanRegisterHooks allows the skill to register hooks
	CanRegisterHooks bool `json:"canRegisterHooks"`

	// CanProvideTools allows the skill to provide tools
	CanProvideTools bool `json:"canProvideTools"`

	// CanAccessNetwork allows network access
	CanAccessNetwork bool `json:"canAccessNetwork"`

	// CanAccessFilesystem allows filesystem access
	CanAccessFilesystem bool `json:"canAccessFilesystem"`

	// AllowedHookTypes limits which hooks can be registered
	AllowedHookTypes []hooks.HookType `json:"allowedHookTypes,omitempty"`

	// BlockedHookTypes prevents certain hooks from being registered
	BlockedHookTypes []hooks.HookType `json:"blockedHookTypes,omitempty"`
}

// DefaultPermissions returns default skill permissions
func DefaultPermissions() *SkillPermissions {
	return &SkillPermissions{
		CanRegisterHooks:    true,
		CanProvideTools:     true,
		CanAccessNetwork:    false,
		CanAccessFilesystem: false,
	}
}

// SkillInfo contains metadata about a registered skill
type SkillInfo struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Category     SkillCategory `json:"category"`
	Description  string        `json:"description"`
	Version      string        `json:"version"`
	State        SkillState    `json:"state"`
	Dependencies []string      `json:"dependencies,omitempty"`
	HooksCount   int           `json:"hooksCount"`
	ToolsCount   int           `json:"toolsCount"`
	LoadedAt     time.Time     `json:"loadedAt,omitempty"`
	Error        string        `json:"error,omitempty"`
}

// SkillMetrics tracks usage metrics for a skill
type SkillMetrics struct {
	SkillID        string        `json:"skillId"`
	HooksExecuted  int64         `json:"hooksExecuted"`
	ToolsExecuted  int64         `json:"toolsExecuted"`
	ErrorCount     int64         `json:"errorCount"`
	TotalDuration  time.Duration `json:"totalDuration"`
	LastUsed       time.Time     `json:"lastUsed"`
}

// SkillManifest describes a skill for discovery/loading
type SkillManifest struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Category     SkillCategory          `json:"category"`
	Description  string                 `json:"description"`
	Version      string                 `json:"version"`
	Author       string                 `json:"author,omitempty"`
	Homepage     string                 `json:"homepage,omitempty"`
	Dependencies []string               `json:"dependencies,omitempty"`
	Permissions  *SkillPermissions      `json:"permissions,omitempty"`
	Config       map[string]interface{} `json:"config,omitempty"`
}

// ============================================================================
// Progressive Loading Types
// ============================================================================

// SkillSummary is a lightweight representation (~100 tokens) for discovery
// This is what gets loaded first and used for relevance matching
type SkillSummary struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Category    SkillCategory `json:"category"`
	Description string        `json:"description"`
	Keywords    []string      `json:"keywords,omitempty"`
	ToolNames   []string      `json:"toolNames,omitempty"`
	HookTypes   []string      `json:"hookTypes,omitempty"`
	IsLoaded    bool          `json:"isLoaded"`
}

// SkillContent contains the full content loaded on-demand
type SkillContent struct {
	ID           string                 `json:"id"`
	Instructions string                 `json:"instructions,omitempty"` // Markdown body as AI instructions
	Tools        []ToolDefinition       `json:"tools,omitempty"`
	Hooks        []HookDefinition       `json:"hooks,omitempty"`
	Settings     map[string]interface{} `json:"settings,omitempty"`
	Examples     []SkillExample         `json:"examples,omitempty"`
}

// SkillExample provides usage examples for the AI
type SkillExample struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Input       string `json:"input,omitempty"`
	Output      string `json:"output,omitempty"`
}

// ============================================================================
// Relevance Scoring Types
// ============================================================================

// SkillMatch represents a skill matched by relevance search
type SkillMatch struct {
	Skill      *SkillSummary `json:"skill"`
	Score      float64       `json:"score"`       // 0.0 to 1.0
	MatchedOn  []string      `json:"matchedOn"`   // What matched: "name", "description", "keyword", "tool"
	Reason     string        `json:"reason"`      // Human-readable match explanation
}

// SkillSearchQuery represents a search request
type SkillSearchQuery struct {
	Query      string          `json:"query"`               // Free-text search
	Categories []SkillCategory `json:"categories,omitempty"` // Filter by category
	Keywords   []string        `json:"keywords,omitempty"`   // Must have these keywords
	HasTools   bool            `json:"hasTools,omitempty"`   // Must provide tools
	HasHooks   bool            `json:"hasHooks,omitempty"`   // Must provide hooks
	Limit      int             `json:"limit,omitempty"`      // Max results (default 5)
}

// SkillSearchResult contains search results
type SkillSearchResult struct {
	Matches    []SkillMatch `json:"matches"`
	TotalCount int          `json:"totalCount"`
	Query      string       `json:"query"`
}

// BaseSkill provides a default implementation of the Skill interface
// that can be embedded in custom skills
type BaseSkill struct {
	id          string
	name        string
	category    SkillCategory
	description string
	version     string
	deps        []string
	config      *SkillConfig
	hooks       []*hooks.Hook
	tools       []providers.Tool
	executors   map[string]ToolExecutor
}

// NewBaseSkill creates a new base skill
func NewBaseSkill(id, name string, category SkillCategory, description, version string) *BaseSkill {
	return &BaseSkill{
		id:          id,
		name:        name,
		category:    category,
		description: description,
		version:     version,
		deps:        make([]string, 0),
		hooks:       make([]*hooks.Hook, 0),
		tools:       make([]providers.Tool, 0),
		executors:   make(map[string]ToolExecutor),
	}
}

func (s *BaseSkill) ID() string           { return s.id }
func (s *BaseSkill) Name() string         { return s.name }
func (s *BaseSkill) Category() SkillCategory { return s.category }
func (s *BaseSkill) Description() string  { return s.description }
func (s *BaseSkill) Version() string      { return s.version }
func (s *BaseSkill) Dependencies() []string { return s.deps }

func (s *BaseSkill) Initialize(ctx context.Context, config *SkillConfig) error {
	s.config = config
	return nil
}

func (s *BaseSkill) Shutdown(ctx context.Context) error {
	return nil
}

func (s *BaseSkill) RegisterHooks(registry *hooks.Registry) error {
	for _, hook := range s.hooks {
		hook.SkillID = s.id
		if err := registry.Register(hook); err != nil {
			return err
		}
	}
	return nil
}

func (s *BaseSkill) GetTools() []providers.Tool {
	return s.tools
}

func (s *BaseSkill) GetToolExecutors() map[string]ToolExecutor {
	return s.executors
}

func (s *BaseSkill) OnEnable(ctx context.Context) error {
	return nil
}

func (s *BaseSkill) OnDisable(ctx context.Context) error {
	return nil
}

// AddDependency adds a dependency
func (s *BaseSkill) AddDependency(skillID string) {
	s.deps = append(s.deps, skillID)
}

// AddHook adds a hook to the skill
func (s *BaseSkill) AddHook(hook *hooks.Hook) {
	s.hooks = append(s.hooks, hook)
}

// AddTool adds a tool and its executor
func (s *BaseSkill) AddTool(tool providers.Tool, executor ToolExecutor) {
	s.tools = append(s.tools, tool)
	s.executors[tool.Function.Name] = executor
}

// GetConfig returns the skill config
func (s *BaseSkill) GetConfig() *SkillConfig {
	return s.config
}

// GetSetting returns a config setting
func (s *BaseSkill) GetSetting(key string) (interface{}, bool) {
	if s.config == nil || s.config.Settings == nil {
		return nil, false
	}
	val, ok := s.config.Settings[key]
	return val, ok
}
