package tools

import (
	"construct-context/providers"
)

// ToolResult represents the result of a tool call
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Content    string `json:"content"`
	IsError    bool   `json:"is_error,omitempty"`
}

// ToolCategory groups related tools together
type ToolCategory struct {
	Name        string
	Description string
	Tools       []providers.Tool
}

// ToolExecutor is a function that executes a tool and returns the result
type ToolExecutor func(args map[string]interface{}, ctx *ExecutionContext) ToolResult

// ProjectInfo represents the current project context for tools
type ProjectInfo struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	LocalPath string `json:"local_path"` // Local filesystem path (e.g., /Users/.../Landing)
	RootPath  string `json:"root_path"`  // Same as LocalPath for compatibility
}

// ImageGenResult represents the result of image generation
type ImageGenResult struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	URL      string `json:"url,omitempty"`
	B64JSON  string `json:"b64_json,omitempty"`
}

// ImageGeneratorInterface defines the interface for image generation routing
type ImageGeneratorInterface interface {
	Generate(prompt, size, quality, preferredProvider string) (*ImageGenResult, error)
}

// ExecutionContext provides context for tool execution
type ExecutionContext struct {
	APIClient       APIClientInterface
	ProviderManager ProviderManagerInterface
	Storage         StorageInterface
	ImageGenerator  ImageGeneratorInterface
	ToolCallID      string
	LocalData       map[string]interface{} // Frontend-provided local data (designs, canvas state, etc.)
	Project         *ProjectInfo           // Current project context
}

// UIDesignInfo represents design info for tools
type UIDesignInfo struct {
	ID        int    `json:"id"`
	LocalID   string `json:"local_id"`
	ProjectID *int   `json:"project_id,omitempty"`
	Name      string `json:"name"`
	NodesJSON string `json:"nodes_json,omitempty"`
	PagesJSON string `json:"pages_json,omitempty"`
}

// StorageInterface defines the interface for storage access (cached context)
type StorageInterface interface {
	GetCurrentCompanyID() int
	GetSetting(key string) (string, error)
	SetSetting(key, value string) error
	// Design access methods
	UIDesignList(projectID *int) ([]*UIDesignInfo, error)
	UIDesignGet(localID string) (*UIDesignInfo, error)
	UIDesignGetByName(name string, projectID *int) (*UIDesignInfo, error)
	// Project settings
	GetProjectLocalPath(projectID int) string
}

// APIClientInterface defines the interface for API client
type APIClientInterface interface {
	Request(method, endpoint string, body interface{}) (map[string]interface{}, error)
	RequestRaw(method, endpoint string, body interface{}) ([]byte, error)
}

// ProviderManagerInterface defines the interface for provider management
type ProviderManagerInterface interface {
	All() map[string]providers.Provider
}

// Registry holds all registered tools
type Registry struct {
	categories map[string]*ToolCategory
	executors  map[string]ToolExecutor
}

// NewRegistry creates a new tool registry
func NewRegistry() *Registry {
	return &Registry{
		categories: make(map[string]*ToolCategory),
		executors:  make(map[string]ToolExecutor),
	}
}

// RegisterCategory registers a tool category
func (r *Registry) RegisterCategory(category *ToolCategory) {
	r.categories[category.Name] = category
}

// RegisterExecutor registers a tool executor
func (r *Registry) RegisterExecutor(name string, executor ToolExecutor) {
	r.executors[name] = executor
}

// GetAllTools returns all registered tools
func (r *Registry) GetAllTools() []providers.Tool {
	var tools []providers.Tool
	for _, cat := range r.categories {
		tools = append(tools, cat.Tools...)
	}
	return tools
}

// GetCategories returns all categories
func (r *Registry) GetCategories() map[string]*ToolCategory {
	return r.categories
}

// GetExecutor returns the executor for a tool
func (r *Registry) GetExecutor(name string) (ToolExecutor, bool) {
	exec, ok := r.executors[name]
	return exec, ok
}

// Execute runs a tool by name with the given arguments
func (r *Registry) Execute(name string, args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	executor, ok := r.executors[name]
	if !ok {
		return ToolResult{
			ToolCallID: ctx.ToolCallID,
			Content:    "Unknown tool: " + name,
			IsError:    true,
		}
	}
	result := executor(args, ctx)
	result.ToolCallID = ctx.ToolCallID
	return result
}

// DefaultRegistry is the global tool registry
var DefaultRegistry = NewRegistry()

// Helper to create a tool definition
func MakeTool(name, description string, properties map[string]providers.Property, required []string) providers.Tool {
	return providers.Tool{
		Type: "function",
		Function: providers.Function{
			Name:        name,
			Description: description,
			Parameters: providers.Parameters{
				Type:       "object",
				Properties: properties,
				Required:   required,
			},
		},
	}
}

// MakeToolWithExamples creates a tool definition with input_examples for better accuracy.
// Examples show Claude how to use the tool correctly (Anthropic advanced-tool-use-2025-11-20).
func MakeToolWithExamples(name, description string, properties map[string]providers.Property, required []string, examples []map[string]interface{}) providers.Tool {
	return providers.Tool{
		Type: "function",
		Function: providers.Function{
			Name:        name,
			Description: description,
			Parameters: providers.Parameters{
				Type:       "object",
				Properties: properties,
				Required:   required,
			},
			InputExamples: examples,
		},
	}
}

// MakeToolDeferred creates a tool that is hidden from initial context and only
// discovered via tool_search. Reduces token usage when many tools are available.
// Requires the advanced-tool-use-2025-11-20 beta header.
func MakeToolDeferred(name, description string, properties map[string]providers.Property, required []string) providers.Tool {
	t := MakeTool(name, description, properties, required)
	t.DeferLoading = true
	return t
}

// MakeToolStrict creates a tool with strict schema conformance.
// Guarantees Claude's tool call inputs always match the schema exactly.
func MakeToolStrict(name, description string, properties map[string]providers.Property, required []string) providers.Tool {
	t := MakeTool(name, description, properties, required)
	t.Strict = true
	return t
}
