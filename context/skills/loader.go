package skills

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"construct-context/hooks"
	"construct-context/providers"

	"gopkg.in/yaml.v3"
)

//go:embed builtin/*.md
var builtinSkillsFS embed.FS

// Loader handles loading and discovering skills
type Loader struct {
	mu           sync.RWMutex
	registry     *Registry
	factories    map[string]SkillFactory
	searchPaths  []string
	manifests    map[string]*SkillManifest
}

// SkillFactory is a function that creates a skill instance
type SkillFactory func() Skill

// NewLoader creates a new skill loader
func NewLoader(registry *Registry) *Loader {
	return &Loader{
		registry:    registry,
		factories:   make(map[string]SkillFactory),
		searchPaths: make([]string, 0),
		manifests:   make(map[string]*SkillManifest),
	}
}

// RegisterFactory registers a skill factory for creating skill instances
func (l *Loader) RegisterFactory(skillID string, factory SkillFactory) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.factories[skillID] = factory
}

// AddSearchPath adds a directory to search for skill manifests
func (l *Loader) AddSearchPath(path string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.searchPaths = append(l.searchPaths, path)
}

// DiscoverSkills searches for skill manifests in search paths
func (l *Loader) DiscoverSkills() ([]*SkillManifest, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	manifests := make([]*SkillManifest, 0)

	for _, searchPath := range l.searchPaths {
		// Look for skill.json files
		pattern := filepath.Join(searchPath, "*", "skill.json")
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}

		for _, match := range matches {
			manifest, err := l.loadManifest(match)
			if err != nil {
				continue
			}
			manifests = append(manifests, manifest)
			l.manifests[manifest.ID] = manifest
		}
	}

	return manifests, nil
}

// loadManifest loads a skill manifest from a file
func (l *Loader) loadManifest(path string) (*SkillManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest: %w", err)
	}

	var manifest SkillManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest: %w", err)
	}

	if manifest.ID == "" {
		return nil, fmt.Errorf("manifest missing ID")
	}

	return &manifest, nil
}

// CreateSkill creates a skill instance from a registered factory
func (l *Loader) CreateSkill(skillID string) (Skill, error) {
	l.mu.RLock()
	factory, ok := l.factories[skillID]
	l.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("no factory registered for skill: %s", skillID)
	}

	return factory(), nil
}

// LoadSkill creates and loads a skill
func (l *Loader) LoadSkill(ctx context.Context, skillID string, config *SkillConfig) error {
	// Check if already registered
	if _, exists := l.registry.Get(skillID); exists {
		// Already registered, just load it
		return l.registry.Load(ctx, skillID, config)
	}

	// Create the skill
	skill, err := l.CreateSkill(skillID)
	if err != nil {
		return err
	}

	// Register it
	if err := l.registry.Register(skill); err != nil {
		return err
	}

	// Load it
	return l.registry.Load(ctx, skillID, config)
}

// LoadAll loads all skills that have registered factories
func (l *Loader) LoadAll(ctx context.Context) []error {
	l.mu.RLock()
	ids := make([]string, 0, len(l.factories))
	for id := range l.factories {
		ids = append(ids, id)
	}
	l.mu.RUnlock()

	errors := make([]error, 0)
	for _, id := range ids {
		if err := l.LoadSkill(ctx, id, nil); err != nil {
			errors = append(errors, fmt.Errorf("failed to load %s: %w", id, err))
		}
	}
	return errors
}

// GetManifest returns a discovered manifest by ID
func (l *Loader) GetManifest(skillID string) (*SkillManifest, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	m, ok := l.manifests[skillID]
	return m, ok
}

// GetAllManifests returns all discovered manifests
func (l *Loader) GetAllManifests() []*SkillManifest {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]*SkillManifest, 0, len(l.manifests))
	for _, m := range l.manifests {
		result = append(result, m)
	}
	return result
}

// DefaultLoader is the global skill loader
var DefaultLoader *Loader

// InitDefaultLoader initializes the default loader with a registry
func InitDefaultLoader(registry *Registry) {
	DefaultLoader = NewLoader(registry)
}

func init() {
	InitDefaultLoader(DefaultRegistry)
}

// BuiltinSkills holds factories for built-in skills
var BuiltinSkills = make(map[string]SkillFactory)

// RegisterBuiltin registers a built-in skill factory
func RegisterBuiltin(skillID string, factory SkillFactory) {
	BuiltinSkills[skillID] = factory
	if DefaultLoader != nil {
		DefaultLoader.RegisterFactory(skillID, factory)
	}
}

// LoadBuiltins loads all registered built-in skills including markdown-based ones
func LoadBuiltins(ctx context.Context) []error {
	if DefaultLoader == nil {
		return []error{fmt.Errorf("default loader not initialized")}
	}

	errors := make([]error, 0)

	// Load factory-based builtins
	for id, factory := range BuiltinSkills {
		DefaultLoader.RegisterFactory(id, factory)
		if err := DefaultLoader.LoadSkill(ctx, id, nil); err != nil {
			errors = append(errors, err)
		}
	}

	// Load markdown-based builtin skills
	mdErrors := DefaultLoader.LoadMarkdownSkills(ctx, "")
	errors = append(errors, mdErrors...)

	return errors
}

// ========== Markdown-based Skills ==========

// SkillMarkdown represents a parsed markdown skill file
type SkillMarkdown struct {
	// Frontmatter fields
	ID           string        `yaml:"id"`
	Name         string        `yaml:"name"`
	Category     SkillCategory `yaml:"category"`
	Description  string        `yaml:"description"`
	Version      string        `yaml:"version"`
	Author       string        `yaml:"author"`
	Icon         string        `yaml:"icon"`
	Enabled      bool          `yaml:"enabled"`
	Dependencies []string      `yaml:"dependencies"`

	// Progressive loading / relevance fields
	Keywords     []string       `yaml:"keywords"`     // For relevance matching
	Examples     []SkillExample `yaml:"examples"`     // Usage examples

	// Hook definitions
	Hooks []HookDefinition `yaml:"hooks"`

	// Tool definitions
	Tools []ToolDefinition `yaml:"tools"`

	// Settings schema
	Settings map[string]SettingDefinition `yaml:"settings"`

	// Parsed content
	Body      string `yaml:"-"`
	FilePath  string `yaml:"-"`
	IsBuiltin bool   `yaml:"-"`
}

// HookDefinition defines a hook in markdown format
type HookDefinition struct {
	ID          string             `yaml:"id"`
	Name        string             `yaml:"name"`
	Type        hooks.HookType     `yaml:"type"`
	Priority    hooks.HookPriority `yaml:"priority"`
	Description string             `yaml:"description"`
	Action      string             `yaml:"action"` // log, validate, cancel
	Condition   string             `yaml:"condition"`
	Config      map[string]interface{} `yaml:"config"`
}

// ToolDefinition defines a tool in markdown format
type ToolDefinition struct {
	Name        string                `yaml:"name"`
	Description string                `yaml:"description"`
	Parameters  []ParameterDefinition `yaml:"parameters"`
	Action      string                `yaml:"action"` // shell, http, script
	Config      map[string]interface{} `yaml:"config"`
}

// ParameterDefinition defines a tool parameter
type ParameterDefinition struct {
	Name        string      `yaml:"name"`
	Type        string      `yaml:"type"`
	Description string      `yaml:"description"`
	Required    bool        `yaml:"required"`
	Default     interface{} `yaml:"default"`
	Enum        []string    `yaml:"enum"`
}

// SettingDefinition defines a configurable setting
type SettingDefinition struct {
	Type        string      `yaml:"type"`
	Description string      `yaml:"description"`
	Default     interface{} `yaml:"default"`
	Required    bool        `yaml:"required"`
}

// LoadMarkdownSkills loads skills from markdown files
func (l *Loader) LoadMarkdownSkills(ctx context.Context, customDir string) []error {
	errors := make([]error, 0)

	// Load builtin markdown skills
	builtinSkills, err := loadBuiltinMarkdownSkills()
	if err != nil {
		errors = append(errors, fmt.Errorf("failed to load builtin markdown skills: %w", err))
	} else {
		for _, sm := range builtinSkills {
			skill := sm.ToSkill()
			if err := l.registry.Register(skill); err != nil {
				errors = append(errors, err)
				continue
			}
			if sm.Enabled {
				if err := l.registry.Load(ctx, sm.ID, nil); err != nil {
					errors = append(errors, err)
				}
			}
		}
	}

	// Load custom markdown skills
	if customDir != "" {
		if _, err := os.Stat(customDir); err == nil {
			customSkills, err := loadMarkdownFromDir(customDir, false)
			if err != nil {
				errors = append(errors, fmt.Errorf("failed to load custom skills: %w", err))
			} else {
				for _, sm := range customSkills {
					skill := sm.ToSkill()
					if err := l.registry.Register(skill); err != nil {
						errors = append(errors, err)
						continue
					}
					if sm.Enabled {
						if err := l.registry.Load(ctx, sm.ID, nil); err != nil {
							errors = append(errors, err)
						}
					}
				}
			}
		}
	}

	return errors
}

// loadBuiltinMarkdownSkills loads from embedded filesystem
func loadBuiltinMarkdownSkills() ([]*SkillMarkdown, error) {
	skills := make([]*SkillMarkdown, 0)

	entries, err := builtinSkillsFS.ReadDir("builtin")
	if err != nil {
		return skills, nil // No builtin directory, that's ok
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		// Skip templates
		if strings.HasPrefix(entry.Name(), "_") {
			continue
		}

		content, err := builtinSkillsFS.ReadFile("builtin/" + entry.Name())
		if err != nil {
			continue
		}

		skill, err := parseSkillMarkdown(string(content), "builtin/"+entry.Name(), true)
		if err != nil {
			fmt.Printf("Warning: failed to parse builtin skill %s: %v\n", entry.Name(), err)
			continue
		}

		skills = append(skills, skill)
	}

	return skills, nil
}

// loadMarkdownFromDir loads skills from a filesystem directory
func loadMarkdownFromDir(dir string, isBuiltin bool) ([]*SkillMarkdown, error) {
	skills := make([]*SkillMarkdown, 0)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if strings.HasPrefix(entry.Name(), "_") {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		skill, err := parseSkillMarkdown(string(content), filePath, isBuiltin)
		if err != nil {
			fmt.Printf("Warning: failed to parse skill %s: %v\n", entry.Name(), err)
			continue
		}

		skills = append(skills, skill)
	}

	return skills, nil
}

// parseSkillMarkdown parses a markdown file with YAML frontmatter
func parseSkillMarkdown(content, filePath string, isBuiltin bool) (*SkillMarkdown, error) {
	frontmatter, body, err := splitSkillFrontmatter(content)
	if err != nil {
		return nil, err
	}

	var skill SkillMarkdown
	if err := yaml.Unmarshal([]byte(frontmatter), &skill); err != nil {
		return nil, fmt.Errorf("invalid YAML frontmatter: %w", err)
	}

	if skill.ID == "" {
		return nil, fmt.Errorf("skill ID is required")
	}
	if skill.Name == "" {
		return nil, fmt.Errorf("skill name is required")
	}

	// Set defaults
	if skill.Category == "" {
		skill.Category = SkillCategoryCustom
	}
	if skill.Version == "" {
		skill.Version = "1.0.0"
	}

	skill.Body = strings.TrimSpace(body)
	skill.FilePath = filePath
	skill.IsBuiltin = isBuiltin

	return &skill, nil
}

func splitSkillFrontmatter(content string) (string, string, error) {
	if !strings.HasPrefix(strings.TrimSpace(content), "---") {
		return "", content, nil
	}

	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "---")

	idx := strings.Index(content, "\n---")
	if idx == -1 {
		return "", "", fmt.Errorf("unclosed frontmatter delimiter")
	}

	frontmatter := strings.TrimSpace(content[:idx])
	body := strings.TrimSpace(content[idx+4:])

	return frontmatter, body, nil
}

// ToSkill converts SkillMarkdown to a functional Skill
func (sm *SkillMarkdown) ToSkill() Skill {
	return &MarkdownSkill{
		BaseSkill: NewBaseSkill(sm.ID, sm.Name, sm.Category, sm.Description, sm.Version),
		markdown:  sm,
	}
}

// MarkdownSkill is a skill loaded from markdown
type MarkdownSkill struct {
	*BaseSkill
	markdown *SkillMarkdown
}

func (s *MarkdownSkill) RegisterHooks(registry *hooks.Registry) error {
	for _, hookDef := range s.markdown.Hooks {
		handler := s.createHookHandler(hookDef)
		if handler == nil {
			continue
		}

		priority := hookDef.Priority
		if priority == 0 {
			priority = hooks.PriorityNormal
		}

		hook := &hooks.Hook{
			ID:          fmt.Sprintf("%s.%s", s.ID(), hookDef.ID),
			Name:        hookDef.Name,
			Type:        hookDef.Type,
			Priority:    priority,
			SkillID:     s.ID(),
			Description: hookDef.Description,
			Enabled:     true,
			Handler:     handler,
		}

		if err := registry.Register(hook); err != nil {
			return err
		}
	}
	return nil
}

func (s *MarkdownSkill) createHookHandler(def HookDefinition) hooks.HookFunc {
	switch def.Action {
	case "log":
		return func(ctx context.Context, hc *hooks.HookContext) error {
			msg := fmt.Sprintf("[%s] %s", s.Name(), def.Description)
			if hc.SessionID != "" {
				msg += fmt.Sprintf(" session=%s", hc.SessionID)
			}
			if hc.ToolName != "" {
				msg += fmt.Sprintf(" tool=%s", hc.ToolName)
			}
			fmt.Println(msg)
			return nil
		}

	case "validate":
		return func(ctx context.Context, hc *hooks.HookContext) error {
			if blocked, ok := def.Config["blockedTools"].([]interface{}); ok {
				for _, tool := range blocked {
					if toolStr, ok := tool.(string); ok && hc.ToolName == toolStr {
						hc.Cancel(fmt.Sprintf("tool %s is blocked by %s", hc.ToolName, s.Name()))
						return nil
					}
				}
			}
			return nil
		}

	case "cancel":
		return func(ctx context.Context, hc *hooks.HookContext) error {
			reason := "cancelled by skill"
			if r, ok := def.Config["reason"].(string); ok {
				reason = r
			}
			hc.Cancel(reason)
			return nil
		}

	default:
		return nil
	}
}

func (s *MarkdownSkill) GetTools() []providers.Tool {
	tools := make([]providers.Tool, 0, len(s.markdown.Tools))

	for _, toolDef := range s.markdown.Tools {
		props := make(map[string]providers.Property)
		required := make([]string, 0)

		for _, param := range toolDef.Parameters {
			props[param.Name] = providers.Property{
				Type:        param.Type,
				Description: param.Description,
				Enum:        param.Enum,
			}
			if param.Required {
				required = append(required, param.Name)
			}
		}

		tools = append(tools, providers.Tool{
			Type: "function",
			Function: providers.Function{
				Name:        toolDef.Name,
				Description: toolDef.Description,
				Parameters: providers.Parameters{
					Type:       "object",
					Properties: props,
					Required:   required,
				},
			},
		})
	}

	return tools
}

func (s *MarkdownSkill) GetToolExecutors() map[string]ToolExecutor {
	executors := make(map[string]ToolExecutor)

	for _, toolDef := range s.markdown.Tools {
		def := toolDef // capture
		executors[toolDef.Name] = func(args map[string]interface{}, ctx *ToolContext) ToolResult {
			switch def.Action {
			case "shell":
				return ToolResult{Content: "Shell execution not implemented"}
			case "http":
				return ToolResult{Content: "HTTP execution not implemented"}
			default:
				return ToolResult{Content: fmt.Sprintf("Tool %s executed", def.Name)}
			}
		}
	}

	return executors
}

// GetMarkdownSkills returns all loaded markdown skill definitions
func GetMarkdownSkills(customDir string) ([]*SkillMarkdown, error) {
	skills := make([]*SkillMarkdown, 0)

	builtin, _ := loadBuiltinMarkdownSkills()
	skills = append(skills, builtin...)

	if customDir != "" {
		custom, _ := loadMarkdownFromDir(customDir, false)
		skills = append(skills, custom...)
	}

	return skills, nil
}

// ============================================================================
// Progressive Loading API
// ============================================================================

// ToSummary converts a SkillMarkdown to a lightweight SkillSummary
func (sm *SkillMarkdown) ToSummary(isLoaded bool) *SkillSummary {
	toolNames := make([]string, len(sm.Tools))
	for i, t := range sm.Tools {
		toolNames[i] = t.Name
	}

	hookTypes := make([]string, len(sm.Hooks))
	for i, h := range sm.Hooks {
		hookTypes[i] = string(h.Type)
	}

	return &SkillSummary{
		ID:          sm.ID,
		Name:        sm.Name,
		Category:    sm.Category,
		Description: sm.Description,
		Keywords:    sm.Keywords,
		ToolNames:   toolNames,
		HookTypes:   hookTypes,
		IsLoaded:    isLoaded,
	}
}

// ToContent extracts the full content for on-demand loading
func (sm *SkillMarkdown) ToContent() *SkillContent {
	settings := make(map[string]interface{})
	for k, v := range sm.Settings {
		settings[k] = map[string]interface{}{
			"type":        v.Type,
			"description": v.Description,
			"default":     v.Default,
			"required":    v.Required,
		}
	}

	return &SkillContent{
		ID:           sm.ID,
		Instructions: sm.Body,
		Tools:        sm.Tools,
		Hooks:        sm.Hooks,
		Settings:     settings,
		Examples:     sm.Examples,
	}
}

// GetAllSummaries returns lightweight summaries of all available skills
func (l *Loader) GetAllSummaries() []*SkillSummary {
	l.mu.RLock()
	defer l.mu.RUnlock()

	summaries := make([]*SkillSummary, 0)

	// Get summaries from markdown skills
	builtinSkills, _ := loadBuiltinMarkdownSkills()
	for _, sm := range builtinSkills {
		_, isLoaded := l.registry.Get(sm.ID)
		summaries = append(summaries, sm.ToSummary(isLoaded))
	}

	return summaries
}

// GetContent returns full content for a specific skill (on-demand loading)
func (l *Loader) GetContent(skillID string) (*SkillContent, error) {
	// Try to find in markdown skills
	builtinSkills, _ := loadBuiltinMarkdownSkills()
	for _, sm := range builtinSkills {
		if sm.ID == skillID {
			return sm.ToContent(), nil
		}
	}

	return nil, fmt.Errorf("skill not found: %s", skillID)
}

// ============================================================================
// Relevance Scoring / Search API
// ============================================================================

// Search finds skills matching the query with relevance scoring
func (l *Loader) Search(query *SkillSearchQuery) *SkillSearchResult {
	summaries := l.GetAllSummaries()
	matches := make([]SkillMatch, 0)

	queryLower := strings.ToLower(query.Query)
	queryWords := strings.Fields(queryLower)

	for _, summary := range summaries {
		// Apply category filter
		if len(query.Categories) > 0 {
			found := false
			for _, cat := range query.Categories {
				if summary.Category == cat {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		// Apply hasTools filter
		if query.HasTools && len(summary.ToolNames) == 0 {
			continue
		}

		// Apply hasHooks filter
		if query.HasHooks && len(summary.HookTypes) == 0 {
			continue
		}

		// Calculate relevance score
		match := calculateRelevance(summary, queryLower, queryWords, query.Keywords)
		if match.Score > 0 {
			matches = append(matches, match)
		}
	}

	// Sort by score descending
	for i := 0; i < len(matches)-1; i++ {
		for j := i + 1; j < len(matches); j++ {
			if matches[j].Score > matches[i].Score {
				matches[i], matches[j] = matches[j], matches[i]
			}
		}
	}

	// Apply limit
	limit := query.Limit
	if limit <= 0 {
		limit = 5
	}
	if len(matches) > limit {
		matches = matches[:limit]
	}

	return &SkillSearchResult{
		Matches:    matches,
		TotalCount: len(matches),
		Query:      query.Query,
	}
}

// calculateRelevance scores how well a skill matches the search
func calculateRelevance(summary *SkillSummary, queryLower string, queryWords, keywords []string) SkillMatch {
	score := 0.0
	matchedOn := make([]string, 0)
	reasons := make([]string, 0)

	nameLower := strings.ToLower(summary.Name)
	descLower := strings.ToLower(summary.Description)
	idLower := strings.ToLower(summary.ID)

	// Exact ID match (highest score)
	if idLower == queryLower {
		score += 1.0
		matchedOn = append(matchedOn, "id")
		reasons = append(reasons, "exact ID match")
	}

	// Name contains query
	if strings.Contains(nameLower, queryLower) {
		score += 0.8
		matchedOn = append(matchedOn, "name")
		reasons = append(reasons, fmt.Sprintf("name contains '%s'", queryLower))
	}

	// Description contains query
	if strings.Contains(descLower, queryLower) {
		score += 0.5
		matchedOn = append(matchedOn, "description")
		reasons = append(reasons, fmt.Sprintf("description contains '%s'", queryLower))
	}

	// Query words match keywords
	for _, word := range queryWords {
		for _, kw := range summary.Keywords {
			kwLower := strings.ToLower(kw)
			if strings.Contains(kwLower, word) || strings.Contains(word, kwLower) {
				score += 0.6
				if !contains(matchedOn, "keyword") {
					matchedOn = append(matchedOn, "keyword")
					reasons = append(reasons, fmt.Sprintf("keyword '%s' matches", kw))
				}
				break
			}
		}
	}

	// Tool names match
	for _, word := range queryWords {
		for _, tool := range summary.ToolNames {
			toolLower := strings.ToLower(tool)
			if strings.Contains(toolLower, word) {
				score += 0.4
				if !contains(matchedOn, "tool") {
					matchedOn = append(matchedOn, "tool")
					reasons = append(reasons, fmt.Sprintf("has tool '%s'", tool))
				}
				break
			}
		}
	}

	// Required keywords filter
	for _, reqKw := range keywords {
		reqLower := strings.ToLower(reqKw)
		found := false
		for _, kw := range summary.Keywords {
			if strings.ToLower(kw) == reqLower {
				found = true
				break
			}
		}
		if !found {
			// Required keyword not found, zero out score
			return SkillMatch{Skill: summary, Score: 0}
		}
	}

	// Normalize score to 0-1
	if score > 1.0 {
		score = 1.0
	}

	reason := ""
	if len(reasons) > 0 {
		reason = strings.Join(reasons, "; ")
	}

	return SkillMatch{
		Skill:     summary,
		Score:     score,
		MatchedOn: matchedOn,
		Reason:    reason,
	}
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// ============================================================================
// Instruction-Style Skills API
// ============================================================================

// GetInstructions returns the markdown body as AI instructions
// This is the "knowledge" that gets passed to the AI context
func (l *Loader) GetInstructions(skillID string) (string, error) {
	content, err := l.GetContent(skillID)
	if err != nil {
		return "", err
	}
	return content.Instructions, nil
}

// GetActiveInstructions returns instructions from all active skills
// formatted for inclusion in AI context
func (l *Loader) GetActiveInstructions() string {
	l.mu.RLock()
	defer l.mu.RUnlock()

	var builder strings.Builder
	activeSkills := l.registry.ListActive()

	for _, info := range activeSkills {
		content, err := l.GetContent(info.ID)
		if err != nil || content.Instructions == "" {
			continue
		}

		builder.WriteString(fmt.Sprintf("## Skill: %s\n\n", info.Name))
		builder.WriteString(content.Instructions)
		builder.WriteString("\n\n---\n\n")
	}

	return builder.String()
}

// FormatForAI formats a skill's full context for AI consumption
func (l *Loader) FormatForAI(skillID string) (string, error) {
	builtinSkills, _ := loadBuiltinMarkdownSkills()
	for _, sm := range builtinSkills {
		if sm.ID == skillID {
			return formatSkillForAI(sm), nil
		}
	}
	return "", fmt.Errorf("skill not found: %s", skillID)
}

func formatSkillForAI(sm *SkillMarkdown) string {
	var builder strings.Builder

	builder.WriteString(fmt.Sprintf("# %s\n\n", sm.Name))
	builder.WriteString(fmt.Sprintf("**Category:** %s\n", sm.Category))
	builder.WriteString(fmt.Sprintf("**Description:** %s\n\n", sm.Description))

	// Tools available
	if len(sm.Tools) > 0 {
		builder.WriteString("## Available Tools\n\n")
		for _, tool := range sm.Tools {
			builder.WriteString(fmt.Sprintf("- **%s**: %s\n", tool.Name, tool.Description))
		}
		builder.WriteString("\n")
	}

	// Examples
	if len(sm.Examples) > 0 {
		builder.WriteString("## Examples\n\n")
		for _, ex := range sm.Examples {
			builder.WriteString(fmt.Sprintf("### %s\n", ex.Title))
			builder.WriteString(fmt.Sprintf("%s\n", ex.Description))
			if ex.Input != "" {
				builder.WriteString(fmt.Sprintf("**Input:** `%s`\n", ex.Input))
			}
			if ex.Output != "" {
				builder.WriteString(fmt.Sprintf("**Output:** `%s`\n", ex.Output))
			}
			builder.WriteString("\n")
		}
	}

	// Instructions (markdown body)
	if sm.Body != "" {
		builder.WriteString("## Instructions\n\n")
		builder.WriteString(sm.Body)
		builder.WriteString("\n")
	}

	return builder.String()
}
