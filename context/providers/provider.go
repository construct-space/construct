package providers

import (
	"net/http"
	"strings"
	"time"
)

// ChatMessage represents a message in a conversation
// Content can be a string or an array of content parts for multimodal (vision) messages
type ChatMessage struct {
	Role    string      `json:"role"` // system, user, assistant
	Content interface{} `json:"content"`
}

// GetContentString returns the content as a string (for non-multimodal messages)
func (m ChatMessage) GetContentString() string {
	if s, ok := m.Content.(string); ok {
		return s
	}
	return ""
}

// HasImages checks if the message contains image content
func (m ChatMessage) HasImages() bool {
	// Check if content is an array (multimodal format)
	if arr, ok := m.Content.([]interface{}); ok {
		for _, item := range arr {
			if part, ok := item.(map[string]interface{}); ok {
				if partType, ok := part["type"].(string); ok {
					if partType == "image" || partType == "image_url" {
						return true
					}
				}
			}
		}
	}
	return false
}

// ChatRequest represents a chat completion request
type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

// ChatResponse represents a chat completion response
type ChatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
}

// StreamChunk represents a chunk of streaming response
type StreamChunk struct {
	Content    string     `json:"content"`
	Done       bool       `json:"done"`
	Error      string     `json:"error,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	StopReason string     `json:"stop_reason,omitempty"` // "end_turn", "tool_use", "pause_turn", "max_tokens"
}

// Tool represents an available tool for the AI
type Tool struct {
	Type     string   `json:"type"`
	Function Function `json:"function"`

	// Anthropic advanced tool use features (2025-11+)
	DeferLoading bool `json:"defer_loading,omitempty"` // Hide from initial context; discovered via tool_search
	Strict       bool `json:"strict,omitempty"`        // Guarantee schema conformance in outputs
}

// Function describes the tool function
type Function struct {
	Name          string                   `json:"name"`
	Description   string                   `json:"description"`
	Parameters    Parameters               `json:"parameters"`
	InputExamples []map[string]interface{} `json:"input_examples,omitempty"` // Concrete usage examples for better accuracy
}

// Parameters describes function parameters
type Parameters struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties"`
	Required   []string            `json:"required,omitempty"`
}

// Property describes a single parameter
type Property struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
}

// ToolCall represents a tool invocation from the model
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall represents the function being called
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ChatMessageWithTools extends ChatMessage for tool interactions
type ChatMessageWithTools struct {
	Role       string      `json:"role"`
	Content    interface{} `json:"content,omitempty"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

// GetContentString returns the content as a string (for non-multimodal messages)
func (m ChatMessageWithTools) GetContentString() string {
	if s, ok := m.Content.(string); ok {
		return s
	}
	return ""
}

// Provider defines the interface for AI providers
type Provider interface {
	// Name returns the display name of the provider
	Name() string

	// Key returns the unique key for this provider
	Key() string

	// Models returns the list of available models
	Models() []string

	// Chat sends a chat completion request
	Chat(messages []ChatMessage, model string) (string, error)

	// ChatStream sends a streaming chat completion request
	ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error

	// ChatStreamWithTools sends a streaming chat with tool support
	ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error

	// SupportsImageGeneration returns true if provider supports image generation
	SupportsImageGeneration() bool

	// GenerateImage generates an image from a prompt (optional)
	GenerateImage(prompt, size, quality string) (interface{}, error)

	// SupportsWebSearch returns true if provider supports web search
	SupportsWebSearch() bool

	// WebSearch performs a web search (optional)
	WebSearch(query string, count int, recency string) (interface{}, error)

	// SupportsURLReader returns true if provider supports URL reading
	SupportsURLReader() bool

	// ReadURL reads content from a URL (optional)
	ReadURL(url, format string) (interface{}, error)
}

// sharedTransport is the default HTTP transport with connection pooling for all providers.
var sharedTransport = &http.Transport{
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 10,
	IdleConnTimeout:     90 * time.Second,
}

// NewHTTPClient creates a shared HTTP client with the given timeout and shared transport.
// Use for non-streaming requests.
func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: sharedTransport,
	}
}

// NewStreamHTTPClient creates a shared HTTP client for streaming requests (no timeout).
// Streaming connections stay open indefinitely; use per-request context for cancellation.
func NewStreamHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   0, // no timeout for streaming
		Transport: sharedTransport,
	}
}

// BaseProvider provides common functionality for providers
type BaseProvider struct {
	name         string
	key          string
	baseURL      string
	apiKey       string
	models       []string
	httpClient   *http.Client // shared client for non-streaming requests
	streamClient *http.Client // shared client for streaming requests (no timeout)
}

// Name returns the display name
func (p *BaseProvider) Name() string {
	return p.name
}

// Key returns the unique key
func (p *BaseProvider) Key() string {
	return p.key
}

// Models returns available models
func (p *BaseProvider) Models() []string {
	return p.models
}

// SupportsImageGeneration returns false by default
func (p *BaseProvider) SupportsImageGeneration() bool {
	return false
}

// GenerateImage returns error by default
func (p *BaseProvider) GenerateImage(prompt, size, quality string) (interface{}, error) {
	return nil, nil
}

// SupportsWebSearch returns false by default
func (p *BaseProvider) SupportsWebSearch() bool {
	return false
}

// WebSearch returns error by default
func (p *BaseProvider) WebSearch(query string, count int, recency string) (interface{}, error) {
	return nil, nil
}

// SupportsURLReader returns false by default
func (p *BaseProvider) SupportsURLReader() bool {
	return false
}

// ReadURL returns error by default
func (p *BaseProvider) ReadURL(url, format string) (interface{}, error) {
	return nil, nil
}

// ChatStream provides a default streaming implementation using Chat
func (p *BaseProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	// Default: fall back to non-streaming and send as single chunk
	return nil
}

// ChatStreamWithTools provides a default implementation that falls back to ChatStream
func (p *BaseProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	// Default: convert to simple messages and use ChatStream (no tool support)
	simpleMessages := make([]ChatMessage, len(messages))
	for i, msg := range messages {
		simpleMessages[i] = ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}
	return nil
}

// Registry holds all registered providers
type Registry struct {
	providers       map[string]Provider
	defaultProvider string
}

// NewRegistry creates a new provider registry
func NewRegistry() *Registry {
	return &Registry{
		providers:       make(map[string]Provider),
		defaultProvider: "",
	}
}

// Register adds a provider to the registry
func (r *Registry) Register(provider Provider) {
	r.providers[provider.Key()] = provider
	if r.defaultProvider == "" {
		r.defaultProvider = provider.Key()
	}
}

// SetDefault sets the default provider
func (r *Registry) SetDefault(key string) bool {
	if _, ok := r.providers[key]; ok {
		r.defaultProvider = key
		return true
	}
	return false
}

// Get returns a provider by key
func (r *Registry) Get(key string) (Provider, bool) {
	p, ok := r.providers[key]
	return p, ok
}

// Default returns the default provider
func (r *Registry) Default() Provider {
	if p, ok := r.providers[r.defaultProvider]; ok {
		return p
	}
	return nil
}

// DefaultKey returns the default provider key
func (r *Registry) DefaultKey() string {
	return r.defaultProvider
}

// All returns all registered providers
func (r *Registry) All() map[string]Provider {
	return r.providers
}

// GetProviderForModel finds which provider owns a model
// Supports both simple model names ("deepseek-chat") and composite IDs ("deepseek:deepseek-chat")
func (r *Registry) GetProviderForModel(model string) (Provider, string) {
	// Check if model is a composite ID (provider:model format)
	if parts := strings.SplitN(model, ":", 2); len(parts) == 2 {
		providerKey := parts[0]
		modelName := parts[1]
		if provider, ok := r.providers[providerKey]; ok {
			// Verify the model exists in this provider
			for _, m := range provider.Models() {
				if m == modelName {
					return provider, providerKey
				}
			}
		}
	}

	// Try exact match across all providers
	for key, provider := range r.providers {
		for _, m := range provider.Models() {
			if m == model {
				return provider, key
			}
		}
	}
	// Fall back to default
	return r.Default(), r.defaultProvider
}

// ExtractModelName extracts just the model name from a composite ID
// "deepseek:deepseek-chat" -> "deepseek-chat"
// "deepseek-chat" -> "deepseek-chat"
func ExtractModelName(model string) string {
	if parts := strings.SplitN(model, ":", 2); len(parts) == 2 {
		return parts[1]
	}
	return model
}

// AllModels returns all models from all providers
func (r *Registry) AllModels() []map[string]interface{} {
	models := []map[string]interface{}{}
	for key, provider := range r.providers {
		for _, model := range provider.Models() {
			models = append(models, map[string]interface{}{
				"name":     model,
				"provider": key,
			})
		}
	}
	return models
}

// AllModelIDs returns all model IDs as "provider:model" strings
func (r *Registry) AllModelIDs() []string {
	var ids []string
	for key, provider := range r.providers {
		for _, model := range provider.Models() {
			ids = append(ids, key+":"+model)
		}
	}
	return ids
}
