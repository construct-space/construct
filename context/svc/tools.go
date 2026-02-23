package svc

import (
	"bytes"
	"construct-context/mcp"
	"construct-context/providers"
	"construct-context/skills"
	"construct-context/tools"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ToolResult represents the result of a tool call
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Content    string `json:"content"`
	IsError    bool   `json:"is_error,omitempty"`
}

// sharedAPIClient is a package-level shared HTTP client for API requests.
var sharedAPIClient = providers.NewHTTPClient(30 * time.Second)

// APIClient handles communication with construct-api
type APIClient struct {
	baseURL string
	token   string
	apiKey  string
}

// NewAPIClient creates a new API client
func NewAPIClient(baseURL, token, apiKey string) *APIClient {
	return &APIClient{
		baseURL: baseURL,
		token:   token,
		apiKey:  apiKey,
	}
}

// SetToken updates the bearer token
func (c *APIClient) SetToken(token string) {
	c.token = token
}

// SetAPIKey updates the API key
func (c *APIClient) SetAPIKey(apiKey string) {
	c.apiKey = apiKey
}

// Request implements tools.APIClientInterface
func (c *APIClient) Request(method, endpoint string, body interface{}) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, _ := json.Marshal(body)
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, c.baseURL+endpoint, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
	}

	fmt.Fprintf(os.Stderr, "[APIClient] %s %s%s (token len: %d)\n", method, c.baseURL, endpoint, len(c.token))
	resp, err := sharedAPIClient.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[APIClient] Request failed: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		fmt.Fprintf(os.Stderr, "[APIClient] Error %d: %s\n", resp.StatusCode, string(respBody))
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result map[string]interface{}
	json.Unmarshal(respBody, &result)
	return result, nil
}

// RequestRaw implements tools.APIClientInterface
func (c *APIClient) RequestRaw(method, endpoint string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, _ := json.Marshal(body)
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, c.baseURL+endpoint, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if c.apiKey != "" {
		req.Header.Set("X-Api-Key", c.apiKey)
	}

	resp, err := sharedAPIClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

// GetAvailableTools returns all registered tools from the registry.
// It can include skill-provided tools and always includes enabled MCP tools.
func GetAvailableTools(includeSkillTools bool) []providers.Tool {
	allTools := tools.DefaultRegistry.GetAllTools()

	// Append tools from active skills when runtime skill integration is enabled.
	if includeSkillTools {
		allTools = AppendUniqueTools(allTools, skills.DefaultRegistry.GetTools())
	}

	// Append MCP tools from all enabled servers
	mcpTools := mcp.DefaultManager.GetAllTools()
	for _, mt := range mcpTools {
		allTools = AppendUniqueTools(allTools, []providers.Tool{McpToolToProvider(mt)})
	}

	return allTools
}

// AppendUniqueTools appends tools ensuring no duplicates by name.
func AppendUniqueTools(base []providers.Tool, extras []providers.Tool) []providers.Tool {
	if len(extras) == 0 {
		return base
	}
	seen := make(map[string]struct{}, len(base))
	for _, tool := range base {
		if name := strings.TrimSpace(tool.Function.Name); name != "" {
			seen[name] = struct{}{}
		}
	}
	for _, tool := range extras {
		name := strings.TrimSpace(tool.Function.Name)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		base = append(base, tool)
		seen[name] = struct{}{}
	}
	return base
}

// McpToolToProvider converts an MCP tool definition to a providers.Tool.
func McpToolToProvider(mt mcp.Tool) providers.Tool {
	params := providers.Parameters{
		Type:       "object",
		Properties: make(map[string]providers.Property),
	}

	// Extract properties from MCP inputSchema
	if mt.InputSchema != nil {
		if props, ok := mt.InputSchema["properties"].(map[string]interface{}); ok {
			for name, raw := range props {
				prop := providers.Property{}
				if pm, ok := raw.(map[string]interface{}); ok {
					if t, ok := pm["type"].(string); ok {
						prop.Type = t
					}
					if d, ok := pm["description"].(string); ok {
						prop.Description = d
					}
					if e, ok := pm["enum"].([]interface{}); ok {
						for _, v := range e {
							if s, ok := v.(string); ok {
								prop.Enum = append(prop.Enum, s)
							}
						}
					}
				}
				params.Properties[name] = prop
			}
		}
		if req, ok := mt.InputSchema["required"].([]interface{}); ok {
			for _, v := range req {
				if s, ok := v.(string); ok {
					params.Required = append(params.Required, s)
				}
			}
		}
	}

	return providers.Tool{
		Type: "function",
		Function: providers.Function{
			Name:        mt.Name,
			Description: mt.Description,
			Parameters:  params,
		},
	}
}

// StorageWrapper wraps Storage to implement tools.StorageInterface
type StorageWrapper struct {
	s *Storage
}

// NewStorageWrapper creates a new StorageWrapper.
func NewStorageWrapper(s *Storage) *StorageWrapper {
	return &StorageWrapper{s: s}
}

func (w *StorageWrapper) GetCurrentCompanyID() int {
	return w.s.GetCurrentCompanyID()
}

func (w *StorageWrapper) GetSetting(key string) (string, error) {
	return w.s.GetSetting(key)
}

func (w *StorageWrapper) SetSetting(key, value string) error {
	return w.s.SetSetting(key, value)
}

func (w *StorageWrapper) UIDesignList(projectID *int) ([]*tools.UIDesignInfo, error) {
	designs, err := w.s.UIDesignList(projectID)
	if err != nil {
		return nil, err
	}
	result := make([]*tools.UIDesignInfo, len(designs))
	for i, d := range designs {
		result[i] = &tools.UIDesignInfo{
			ID:        d.ID,
			LocalID:   d.LocalID,
			ProjectID: d.ProjectID,
			Name:      d.Name,
			NodesJSON: d.NodesJSON,
			PagesJSON: d.PagesJSON,
		}
	}
	return result, nil
}

func (w *StorageWrapper) UIDesignGet(localID string) (*tools.UIDesignInfo, error) {
	d, err := w.s.UIDesignGet(localID)
	if err != nil {
		return nil, err
	}
	return &tools.UIDesignInfo{
		ID:        d.ID,
		LocalID:   d.LocalID,
		ProjectID: d.ProjectID,
		Name:      d.Name,
		NodesJSON: d.NodesJSON,
		PagesJSON: d.PagesJSON,
	}, nil
}

func (w *StorageWrapper) UIDesignGetByName(name string, projectID *int) (*tools.UIDesignInfo, error) {
	d, err := w.s.UIDesignGetByName(name, projectID)
	if err != nil {
		return nil, err
	}
	return &tools.UIDesignInfo{
		ID:        d.ID,
		LocalID:   d.LocalID,
		ProjectID: d.ProjectID,
		Name:      d.Name,
		NodesJSON: d.NodesJSON,
		PagesJSON: d.PagesJSON,
	}, nil
}

func (w *StorageWrapper) GetProjectLocalPath(projectID int) string {
	settings, err := w.s.ProjectLocalSettingsGet(projectID)
	if err != nil || settings == nil {
		return ""
	}
	return settings.LocalPath
}

// ExecuteTool executes a tool call using the registry
func (s *Service) ExecuteTool(toolCall providers.ToolCall, apiClient *APIClient, localData map[string]interface{}) ToolResult {
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil || args == nil {
		args = map[string]interface{}{}
	}

	// Wrap storage to implement full StorageInterface (including design methods)
	var storageWrapper tools.StorageInterface
	if s.Storage != nil {
		storageWrapper = NewStorageWrapper(s.Storage)
	}

	// Get current project context
	s.Mu.RLock()
	serviceContext := s.AppCtx
	s.Mu.RUnlock()

	var projectInfo *tools.ProjectInfo
	// Start with service context if available
	if serviceContext.Project != nil {
		projectInfo = &tools.ProjectInfo{
			Name:     serviceContext.Project.Name,
			RootPath: serviceContext.Project.RootPath,
		}
	} else {
		projectInfo = &tools.ProjectInfo{}
	}

	// Enrich from local_data (frontend sends project context)
	if localData != nil {
		extractInt := func(v interface{}) int {
			switch n := v.(type) {
			case float64:
				return int(n)
			case float32:
				return int(n)
			case int:
				return n
			case int64:
				return int(n)
			case int32:
				return int(n)
			default:
				return 0
			}
		}
		setProjectID := func(id int) {
			if id <= 0 {
				return
			}
			projectInfo.ID = id
			// Get base local path from storage
			if storageWrapper != nil {
				projectInfo.LocalPath = storageWrapper.GetProjectLocalPath(projectInfo.ID)
			}
		}

		// Direct project_id from local_data (preferred explicit signal)
		setProjectID(extractInt(localData["project_id"]))

		// Fallback: derive project id/name from injected space_context
		if spaceCtx, ok := localData["space_context"].(map[string]interface{}); ok {
			if projectCtx, ok := spaceCtx["project"].(map[string]interface{}); ok {
				if projectInfo.ID == 0 {
					setProjectID(extractInt(projectCtx["id"]))
				}
				if projectInfo.Name == "" {
					if name, ok := projectCtx["name"].(string); ok && name != "" {
						projectInfo.Name = name
					}
				}
			}
		}

		if projectName, ok := localData["project_name"].(string); ok && projectName != "" {
			projectInfo.Name = projectName
		}
		// Current folder override (the actual folder user is viewing in code space)
		if currentFolder, ok := localData["current_folder"].(string); ok && currentFolder != "" {
			projectInfo.RootPath = currentFolder // The working directory for tools
		}
	}

	// Use LocalPath as fallback for RootPath if not set
	if projectInfo.RootPath == "" && projectInfo.LocalPath != "" {
		projectInfo.RootPath = projectInfo.LocalPath
	}

	// Inject RAG service into local_data for tool access
	if s.RAG != nil {
		if localData == nil {
			localData = make(map[string]interface{})
		}
		localData["_rag_service"] = s.RAG
	}

	// Create execution context with storage for cached context access
	ctx := &tools.ExecutionContext{
		APIClient:       apiClient,
		ProviderManager: s.Providers,
		Storage:         storageWrapper,
		ImageGenerator:  s.ImageGen,
		ToolCallID:      toolCall.ID,
		LocalData:       localData, // Frontend-provided data (designs, canvas state, etc.)
		Project:         projectInfo,
	}

	// Try internal registry first
	if _, hasExecutor := tools.DefaultRegistry.GetExecutor(toolCall.Function.Name); hasExecutor {
		result := tools.DefaultRegistry.Execute(toolCall.Function.Name, args, ctx)
		return ToolResult{
			ToolCallID: result.ToolCallID,
			Content:    result.Content,
			IsError:    result.IsError,
		}
	}

	// Then try active skill tool executors (feature-flagged).
	if s.IsSkillRuntimeEnabled() {
		if executor, skillID, ok := skills.DefaultRegistry.GetToolExecutor(toolCall.Function.Name); ok {
			startedAt := time.Now()
			skillResult := executor(args, &skills.ToolContext{
				SkillID:    skillID,
				ToolCallID: toolCall.ID,
				Context:    context.Background(),
			})
			skills.DefaultRegistry.UpdateMetrics(skillID, func(m *skills.SkillMetrics) {
				m.ToolsExecuted++
				if skillResult.IsError {
					m.ErrorCount++
				}
				m.TotalDuration += time.Since(startedAt)
				m.LastUsed = time.Now()
			})
			return ToolResult{
				ToolCallID: toolCall.ID,
				Content:    skillResult.Content,
				IsError:    skillResult.IsError,
			}
		}
	}

	// Fall through to MCP servers
	mcpResult, err := mcp.DefaultManager.CallTool(toolCall.Function.Name, args)
	if err != nil {
		return ToolResult{
			ToolCallID: toolCall.ID,
			Content:    fmt.Sprintf("MCP tool error: %s", err),
			IsError:    true,
		}
	}
	return ToolResult{
		ToolCallID: toolCall.ID,
		Content:    mcpResult,
		IsError:    false,
	}
}
