package agents

import (
	"bytes"
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"text/template"

	"gopkg.in/yaml.v3"
)

//go:embed all:builtin
var builtinAgents embed.FS

// AgentMarkdown represents the parsed markdown agent file
type AgentMarkdown struct {
	// Frontmatter fields
	ID              string   `yaml:"id"`
	Name            string   `yaml:"name"`
	Category        string   `yaml:"category"`
	Description     string   `yaml:"description"`
	Icon            string   `yaml:"icon"`
	MaxIterations   int      `yaml:"maxIterations"`
	Model           string   `yaml:"model"`
	AllowedTools    []string `yaml:"allowedTools"`
	BlockedTools    []string `yaml:"blockedTools"`
	CanInvokeAgents []string `yaml:"canInvokeAgents"`

	// Parsed content
	SystemPrompt string `yaml:"-"`
	FilePath     string `yaml:"-"`
	IsBuiltin    bool   `yaml:"-"`
}

// AgentContext provides context variables for template rendering
type AgentContext struct {
	User    *UserContext    `json:"user,omitempty"`
	Company *CompanyContext `json:"company,omitempty"`
	Project *ProjectContext `json:"project,omitempty"`
}

// UserContext contains user-specific information
type UserContext struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Timezone     string `json:"timezone"`
	WorkingHours string `json:"workingHours"`
}

// CompanyContext contains company-specific information
type CompanyContext struct {
	ID                int    `json:"id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Guidelines        string `json:"guidelines"`
	BrandGuidelines   string `json:"brandGuidelines"`
	DesignSystem      string `json:"designSystem"`
	TechStack         string `json:"techStack"`
	GitWorkflow       string `json:"gitWorkflow"`
	BranchNaming      string `json:"branchNaming"`
	Architecture      string `json:"architecture"`
	Workflow          string `json:"workflow"`
	MeetingGuidelines string `json:"meetingGuidelines"`
	BrandColors       string `json:"brandColors"`
	ImageStyle        string `json:"imageStyle"`
}

// ProjectContext contains project-specific information
type ProjectContext struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	TechStack   string `json:"techStack"`
}

// Loader handles loading agents from markdown files
type Loader struct {
	builtinDir string
	customDir  string
}

// NewLoader creates a new agent loader
func NewLoader(builtinDir, customDir string) *Loader {
	return &Loader{
		builtinDir: builtinDir,
		customDir:  customDir,
	}
}

// LoadAll loads all agents from builtin (embedded) and custom directories
func (l *Loader) LoadAll() ([]*AgentMarkdown, error) {
	agents := make([]*AgentMarkdown, 0)

	// Load builtin agents from embedded filesystem
	builtinAgentsList, err := l.loadBuiltinAgents()
	if err != nil {
		return nil, fmt.Errorf("failed to load builtin agents: %w", err)
	}
	agents = append(agents, builtinAgentsList...)

	// Load custom agents from filesystem (if directory exists)
	if l.customDir != "" {
		if _, err := os.Stat(l.customDir); err == nil {
			customAgentsList, err := l.loadFromDirectory(l.customDir, false)
			if err != nil {
				// Log but don't fail - custom agents are optional
				fmt.Printf("Warning: failed to load custom agents: %v\n", err)
			} else {
				agents = append(agents, customAgentsList...)
			}
		}
	}

	return agents, nil
}

// loadBuiltinAgents loads agents from the embedded filesystem (including subdirectories)
func (l *Loader) loadBuiltinAgents() ([]*AgentMarkdown, error) {
	agents := make([]*AgentMarkdown, 0)
	l.loadBuiltinDir("builtin", &agents)
	return agents, nil
}

// loadBuiltinDir recursively loads .md agent files from an embedded directory
func (l *Loader) loadBuiltinDir(dir string, agents *[]*AgentMarkdown) {
	entries, err := builtinAgents.ReadDir(dir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		path := dir + "/" + entry.Name()

		if entry.IsDir() {
			// Recurse into subdirectory
			l.loadBuiltinDir(path, agents)
			continue
		}

		if !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		content, err := builtinAgents.ReadFile(path)
		if err != nil {
			continue
		}

		agent, err := l.parseMarkdown(string(content), path, true)
		if err != nil {
			fmt.Printf("Warning: failed to parse builtin agent %s: %v\n", path, err)
			continue
		}

		*agents = append(*agents, agent)
	}
}

// loadFromDirectory loads agents from a filesystem directory
func (l *Loader) loadFromDirectory(dir string, isBuiltin bool) ([]*AgentMarkdown, error) {
	agents := make([]*AgentMarkdown, 0)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		// Skip directories and non-markdown files
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		// Skip template files
		if strings.HasPrefix(entry.Name(), "_") {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		agent, err := l.parseMarkdown(string(content), filePath, isBuiltin)
		if err != nil {
			fmt.Printf("Warning: failed to parse agent %s: %v\n", entry.Name(), err)
			continue
		}

		agents = append(agents, agent)
	}

	return agents, nil
}

// parseMarkdown parses a markdown file with YAML frontmatter
func (l *Loader) parseMarkdown(content, filePath string, isBuiltin bool) (*AgentMarkdown, error) {
	// Split frontmatter from content
	frontmatter, body, err := splitFrontmatter(content)
	if err != nil {
		return nil, err
	}

	// Parse YAML frontmatter
	var agent AgentMarkdown
	if err := yaml.Unmarshal([]byte(frontmatter), &agent); err != nil {
		return nil, fmt.Errorf("invalid YAML frontmatter: %w", err)
	}

	// Validate required fields
	if agent.ID == "" {
		return nil, fmt.Errorf("agent ID is required")
	}
	if agent.Name == "" {
		return nil, fmt.Errorf("agent name is required")
	}
	if agent.Description == "" {
		return nil, fmt.Errorf("agent description is required")
	}

	// Set defaults
	if agent.Category == "" {
		agent.Category = "specialized"
	}
	if agent.MaxIterations <= 0 {
		agent.MaxIterations = 30
	}

	// Store the system prompt and metadata
	agent.SystemPrompt = strings.TrimSpace(body)
	agent.FilePath = filePath
	agent.IsBuiltin = isBuiltin

	return &agent, nil
}

// splitFrontmatter splits YAML frontmatter from markdown content
func splitFrontmatter(content string) (string, string, error) {
	// Check for frontmatter delimiter
	if !strings.HasPrefix(strings.TrimSpace(content), "---") {
		return "", content, nil // No frontmatter
	}

	// Find the closing delimiter
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

// ToAgentConfig converts AgentMarkdown to AgentConfig
func (a *AgentMarkdown) ToAgentConfig() *AgentConfig {
	category := AgentCategorySpecialized
	if a.Category == "utility" {
		category = AgentCategoryUtility
	} else if a.Category == "primary" {
		category = AgentCategoryPrimary
	}

	return &AgentConfig{
		ID:              a.ID,
		Name:            a.Name,
		Category:        category,
		Description:     a.Description,
		Icon:            a.Icon,
		SystemPrompt:    a.SystemPrompt,
		AllowedTools:    a.AllowedTools,
		BlockedTools:    a.BlockedTools,
		CanInvokeAgents: a.CanInvokeAgents,
		MaxIterations:   a.MaxIterations,
		Model:           a.Model,
		IsBuiltin:       a.IsBuiltin,
	}
}

// RenderSystemPrompt renders the system prompt with context variables
func (a *AgentMarkdown) RenderSystemPrompt(ctx *AgentContext) (string, error) {
	if ctx == nil {
		// Remove template directives if no context
		return cleanTemplateDirectives(a.SystemPrompt), nil
	}

	// Create template with custom functions
	funcMap := template.FuncMap{
		"if": func() string { return "" }, // Handled by text/template
	}

	// Pre-process the template to handle {{#if}} syntax
	processed := convertMustacheToGo(a.SystemPrompt)

	tmpl, err := template.New("prompt").Funcs(funcMap).Parse(processed)
	if err != nil {
		// If template parsing fails, return cleaned prompt
		return cleanTemplateDirectives(a.SystemPrompt), nil
	}

	var buf bytes.Buffer
	data := map[string]interface{}{
		"context": map[string]interface{}{
			"user":    ctx.User,
			"company": ctx.Company,
			"project": ctx.Project,
		},
	}

	if err := tmpl.Execute(&buf, data); err != nil {
		return cleanTemplateDirectives(a.SystemPrompt), nil
	}

	return strings.TrimSpace(buf.String()), nil
}

// convertMustacheToGo converts {{#if}} mustache-like syntax to Go template syntax
func convertMustacheToGo(input string) string {
	// Convert {{#if context.X}} to {{if .context.X}}
	re := regexp.MustCompile(`\{\{#if\s+([^}]+)\}\}`)
	result := re.ReplaceAllString(input, "{{if .$1}}")

	// Convert {{/if}} to {{end}}
	result = strings.ReplaceAll(result, "{{/if}}", "{{end}}")

	// Convert {{variable}} to {{.variable}}
	re2 := regexp.MustCompile(`\{\{([^#/][^}]*)\}\}`)
	result = re2.ReplaceAllStringFunc(result, func(match string) string {
		// Don't modify if already has a dot or is a control statement
		inner := strings.TrimPrefix(strings.TrimSuffix(match, "}}"), "{{")
		inner = strings.TrimSpace(inner)
		if strings.HasPrefix(inner, ".") || strings.HasPrefix(inner, "if") ||
			strings.HasPrefix(inner, "end") || strings.HasPrefix(inner, "else") ||
			strings.HasPrefix(inner, "range") {
			return match
		}
		return "{{." + inner + "}}"
	})

	return result
}

// cleanTemplateDirectives removes template directives from text
func cleanTemplateDirectives(input string) string {
	// Remove {{#if ...}} and {{/if}} blocks entirely if we can't process them
	re := regexp.MustCompile(`\{\{#if[^}]*\}\}[\s\S]*?\{\{/if\}\}`)
	result := re.ReplaceAllString(input, "")

	// Remove any remaining template variables
	re2 := regexp.MustCompile(`\{\{[^}]+\}\}`)
	result = re2.ReplaceAllString(result, "")

	// Clean up extra whitespace
	result = regexp.MustCompile(`\n{3,}`).ReplaceAllString(result, "\n\n")

	return strings.TrimSpace(result)
}

// LoadAgentsToRegistry loads all agents and registers them
func LoadAgentsToRegistry(registry *Registry, customDir string) error {
	loader := NewLoader("", customDir)

	agents, err := loader.LoadAll()
	if err != nil {
		return err
	}

	for _, agent := range agents {
		config := agent.ToAgentConfig()
		registry.Register(config)
	}

	return nil
}

// GetAgentMarkdowns returns the raw markdown agent definitions
func GetAgentMarkdowns(customDir string) ([]*AgentMarkdown, error) {
	loader := NewLoader("", customDir)
	return loader.LoadAll()
}
