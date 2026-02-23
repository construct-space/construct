package mcp

import (
	"encoding/json"
	"fmt"
	neturl "net/url"
	"os"
	"path/filepath"
	"sync"

	"construct-context/mcp/zai"
)

// ServerType represents the type of MCP server
type ServerType string

const (
	ServerTypeBuiltin ServerType = "builtin"
	ServerTypeNPM     ServerType = "npm"
	ServerTypeLocal   ServerType = "local"
	ServerTypeURL     ServerType = "url"
)

// ServerStatus represents the current status of an MCP server
type ServerStatus string

const (
	StatusRunning ServerStatus = "running"
	StatusStopped ServerStatus = "stopped"
	StatusError   ServerStatus = "error"
)

// Tool represents an MCP tool definition
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// ToolInfo is a simplified tool info for listing
type ToolInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Server interface that all MCP servers must implement
type Server interface {
	GetTools() []Tool
	CallTool(name string, args map[string]interface{}) (string, error)
}

// ZAIAdapter adapts the zai.Server to the Server interface
type ZAIAdapter struct {
	server *zai.Server
}

// GetTools returns tools from ZAI server converted to mcp.Tool
func (a *ZAIAdapter) GetTools() []Tool {
	zaiTools := a.server.GetTools()
	tools := make([]Tool, len(zaiTools))
	for i, t := range zaiTools {
		tools[i] = Tool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		}
	}
	return tools
}

// CallTool delegates to the ZAI server
func (a *ZAIAdapter) CallTool(name string, args map[string]interface{}) (string, error) {
	return a.server.CallTool(name, args)
}

// ServerConfig represents configuration for an MCP server
type ServerConfig struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Type      ServerType `json:"type"`
	Package   string     `json:"package,omitempty"`   // NPM package name
	Path      string     `json:"path,omitempty"`      // Local path
	URL       string     `json:"url,omitempty"`       // Remote URL
	Transport string     `json:"transport,omitempty"` // Transport: http, sse, stdio
	Enabled   bool       `json:"enabled"`
	APIKey    string     `json:"apiKey,omitempty"` // API key if needed
}

// ServerInfo represents detailed info about a server
type ServerInfo struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Type      ServerType   `json:"type"`
	Package   string       `json:"package,omitempty"`
	Path      string       `json:"path,omitempty"`
	URL       string       `json:"url,omitempty"`
	Transport string       `json:"transport,omitempty"`
	Enabled   bool         `json:"enabled"`
	Status    ServerStatus `json:"status"`
	Tools     []ToolInfo   `json:"tools"`
	Error     string       `json:"error,omitempty"`
}

// Manager manages MCP servers
type Manager struct {
	mu       sync.RWMutex
	servers  map[string]Server
	configs  map[string]*ServerConfig
	statuses map[string]ServerStatus
	errors   map[string]string
}

// Global manager instance
var DefaultManager = NewManager()

// newRemoteServer creates the appropriate Server based on transport type.
func newRemoteServer(url, transport string) (Server, error) {
	if transport == "sse" {
		s := NewSSEServer(url)
		if err := s.Initialize(); err != nil {
			return nil, err
		}
		return s, nil
	}
	// Default to HTTP streamable
	s := NewHTTPServer(url)
	if err := s.Initialize(); err != nil {
		return nil, err
	}
	return s, nil
}

// NewManager creates a new MCP manager
func NewManager() *Manager {
	return &Manager{
		servers:  make(map[string]Server),
		configs:  make(map[string]*ServerConfig),
		statuses: make(map[string]ServerStatus),
		errors:   make(map[string]string),
	}
}

// RegisterBuiltin registers a builtin MCP server
func (m *Manager) RegisterBuiltin(id, name string, server Server) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.configs[id] = &ServerConfig{
		ID:      id,
		Name:    name,
		Type:    ServerTypeBuiltin,
		Enabled: true,
	}
	m.servers[id] = server
	m.statuses[id] = StatusRunning
}

// RegisterZAI registers the Z.AI MCP server
func (m *Manager) RegisterZAI(apiKey string) {
	if apiKey == "" {
		return
	}
	server := zai.NewServer(apiKey)
	adapter := &ZAIAdapter{server: server}
	m.RegisterBuiltin("zai", "Z.AI MCP Server", adapter)
}

// List returns all registered servers
func (m *Manager) List() []ServerInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]ServerInfo, 0, len(m.configs))
	for id, config := range m.configs {
		info := ServerInfo{
			ID:        config.ID,
			Name:      config.Name,
			Type:      config.Type,
			Package:   config.Package,
			Path:      config.Path,
			URL:       config.URL,
			Transport: config.Transport,
			Enabled:   config.Enabled,
			Status:    m.statuses[id],
			Error:     m.errors[id],
			Tools:     []ToolInfo{},
		}

		// Get tools if server is running
		if server, ok := m.servers[id]; ok && info.Status == StatusRunning {
			tools := server.GetTools()
			for _, t := range tools {
				info.Tools = append(info.Tools, ToolInfo{
					Name:        t.Name,
					Description: t.Description,
				})
			}
		}

		result = append(result, info)
	}

	return result
}

// Get returns a specific server info
func (m *Manager) Get(id string) (*ServerInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	config, ok := m.configs[id]
	if !ok {
		return nil, fmt.Errorf("server not found: %s", id)
	}

	info := &ServerInfo{
		ID:        config.ID,
		Name:      config.Name,
		Type:      config.Type,
		Package:   config.Package,
		Path:      config.Path,
		URL:       config.URL,
		Transport: config.Transport,
		Enabled:   config.Enabled,
		Status:    m.statuses[id],
		Error:     m.errors[id],
		Tools:     []ToolInfo{},
	}

	if server, ok := m.servers[id]; ok && info.Status == StatusRunning {
		tools := server.GetTools()
		for _, t := range tools {
			info.Tools = append(info.Tools, ToolInfo{
				Name:        t.Name,
				Description: t.Description,
			})
		}
	}

	return info, nil
}

// Enable enables a server
func (m *Manager) Enable(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	config, ok := m.configs[id]
	if !ok {
		return fmt.Errorf("server not found: %s", id)
	}

	config.Enabled = true

	// If server is already loaded, update status
	if _, ok := m.servers[id]; ok {
		m.statuses[id] = StatusRunning
		delete(m.errors, id)
		return nil
	}

	// Connect URL servers on enable
	if config.Type == ServerTypeURL && config.URL != "" {
		server, err := newRemoteServer(config.URL, config.Transport)
		if err != nil {
			m.statuses[id] = StatusError
			m.errors[id] = err.Error()
			return fmt.Errorf("failed to connect: %w", err)
		}
		m.servers[id] = server
		m.statuses[id] = StatusRunning
		delete(m.errors, id)
	}

	return nil
}

// Disable disables a server
func (m *Manager) Disable(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	config, ok := m.configs[id]
	if !ok {
		return fmt.Errorf("server not found: %s", id)
	}

	config.Enabled = false
	m.statuses[id] = StatusStopped

	return nil
}

// Add adds a new MCP server configuration
func (m *Manager) Add(serverType ServerType, pkg, path, url, transport, name string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Generate ID
	var id string
	if url != "" {
		// Derive ID from URL hostname
		id = url
		if parsed, err := neturl.Parse(url); err == nil && parsed.Host != "" {
			id = parsed.Host
		}
	} else if pkg != "" {
		id = pkg
	} else if path != "" {
		id = filepath.Base(path)
	} else {
		return "", fmt.Errorf("url, package, or path required")
	}

	// Check for duplicates
	if _, exists := m.configs[id]; exists {
		return "", fmt.Errorf("server already exists: %s", id)
	}

	// Determine name
	if name == "" {
		name = id
	}

	// Create config
	config := &ServerConfig{
		ID:        id,
		Name:      name,
		Type:      serverType,
		Package:   pkg,
		Path:      path,
		URL:       url,
		Transport: transport,
		Enabled:   true,
	}

	m.configs[id] = config
	m.statuses[id] = StatusStopped

	// Auto-connect URL servers
	if serverType == ServerTypeURL && url != "" {
		server, err := newRemoteServer(url, transport)
		if err != nil {
			m.statuses[id] = StatusError
			m.errors[id] = err.Error()
		} else {
			m.servers[id] = server
			m.statuses[id] = StatusRunning
		}
	}

	return id, nil
}

// Remove removes an MCP server
func (m *Manager) Remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	config, ok := m.configs[id]
	if !ok {
		return fmt.Errorf("server not found: %s", id)
	}

	if config.Type == ServerTypeBuiltin {
		return fmt.Errorf("cannot remove builtin server: %s", id)
	}

	delete(m.configs, id)
	delete(m.servers, id)
	delete(m.statuses, id)
	delete(m.errors, id)

	return nil
}

// Test tests connection to an MCP server
func (m *Manager) Test(id string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	server, ok := m.servers[id]
	if !ok {
		return fmt.Errorf("server not running: %s", id)
	}

	// Just get tools to verify connection
	tools := server.GetTools()
	if len(tools) == 0 {
		return fmt.Errorf("server returned no tools")
	}

	return nil
}

// GetAllTools returns all tools from all enabled servers
func (m *Manager) GetAllTools() []Tool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var allTools []Tool
	for id, server := range m.servers {
		if config, ok := m.configs[id]; ok && config.Enabled {
			if m.statuses[id] == StatusRunning {
				allTools = append(allTools, server.GetTools()...)
			}
		}
	}

	return allTools
}

// CallTool calls a tool on the appropriate server
func (m *Manager) CallTool(toolName string, args map[string]interface{}) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Find which server has this tool
	for id, server := range m.servers {
		if config, ok := m.configs[id]; ok && config.Enabled {
			if m.statuses[id] != StatusRunning {
				continue
			}
			tools := server.GetTools()
			for _, t := range tools {
				if t.Name == toolName {
					return server.CallTool(toolName, args)
				}
			}
		}
	}

	return "", fmt.Errorf("tool not found: %s", toolName)
}

// SaveConfig saves the MCP configuration to a file
func (m *Manager) SaveConfig(path string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Only save non-builtin configs
	configs := make([]*ServerConfig, 0)
	for _, config := range m.configs {
		if config.Type != ServerTypeBuiltin {
			configs = append(configs, config)
		}
	}

	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// LoadConfig loads the MCP configuration from a file
func (m *Manager) LoadConfig(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No config file is fine
		}
		return err
	}

	var configs []*ServerConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, config := range configs {
		m.configs[config.ID] = config
		m.statuses[config.ID] = StatusStopped
	}

	return nil
}
