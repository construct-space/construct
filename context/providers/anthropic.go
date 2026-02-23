package providers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AnthropicProvider implements the Provider interface for Anthropic (Claude)
type AnthropicProvider struct {
	BaseProvider
	version string
}

// NewAnthropicProvider creates a new Anthropic provider
func NewAnthropicProvider(apiKey string) *AnthropicProvider {
	return &AnthropicProvider{
		BaseProvider: BaseProvider{
			name:    "Anthropic",
			key:     "anthropic",
			baseURL: "https://api.anthropic.com/v1",
			apiKey:  apiKey,
			models: []string{
				"claude-opus-4-6",   // Claude Opus 4.6 (latest)
				"claude-sonnet-4-6", // Claude Sonnet 4.6 (latest)
				"claude-sonnet-4-5", // Claude Sonnet 4.5
				"claude-haiku-4-5",  // Claude Haiku 4.5 (latest)
			},
			httpClient:   NewHTTPClient(120 * time.Second),
			streamClient: NewStreamHTTPClient(),
		},
		version: "2023-06-01",
	}
}

// AnthropicMessage represents a message in Anthropic format
type AnthropicMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"` // string or []AnthropicContentBlock
}

// AnthropicContentBlock represents a content block (text or image)
type AnthropicContentBlock struct {
	Type   string                `json:"type"` // "text" or "image"
	Text   string                `json:"text,omitempty"`
	Source *AnthropicImageSource `json:"source,omitempty"`
}

// AnthropicImageSource represents an image source for vision
type AnthropicImageSource struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // "image/png", "image/jpeg", etc.
	Data      string `json:"data"`       // base64 encoded image data
}

// convertToAnthropicContent converts generic content to Anthropic format
func convertToAnthropicContent(content any) any {
	// If string, return as-is
	if s, ok := content.(string); ok {
		return s
	}

	// If array, convert each item
	// Note: JSON unmarshal creates []interface{} which is the same as []any in Go 1.18+
	if arr, ok := content.([]any); ok {
		blocks := make([]AnthropicContentBlock, 0, len(arr))
		for _, item := range arr {
			if m, ok := item.(map[string]any); ok {
				blockType, _ := m["type"].(string)

				switch blockType {
				case "text":
					text, _ := m["text"].(string)
					blocks = append(blocks, AnthropicContentBlock{
						Type: "text",
						Text: text,
					})
				case "image_url":
					// Convert from OpenAI format to Anthropic format
					if imgURL, ok := m["image_url"].(map[string]any); ok {
						url, _ := imgURL["url"].(string)
						// Parse data URL: data:image/png;base64,xxxx
						if strings.HasPrefix(url, "data:") {
							parts := strings.SplitN(url, ",", 2)
							if len(parts) == 2 {
								// Extract media type from "data:image/png;base64"
								mediaInfo := strings.TrimPrefix(parts[0], "data:")
								mediaType := strings.Split(mediaInfo, ";")[0]
								blocks = append(blocks, AnthropicContentBlock{
									Type: "image",
									Source: &AnthropicImageSource{
										Type:      "base64",
										MediaType: mediaType,
										Data:      parts[1],
									},
								})
							}
						}
					}
				}
			}
		}
		if len(blocks) > 0 {
			return blocks
		}
	}

	// Also handle []interface{} explicitly (older Go or edge cases)
	if arr, ok := content.([]interface{}); ok {
		blocks := make([]AnthropicContentBlock, 0, len(arr))
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				blockType, _ := m["type"].(string)

				switch blockType {
				case "text":
					text, _ := m["text"].(string)
					blocks = append(blocks, AnthropicContentBlock{
						Type: "text",
						Text: text,
					})
				case "image_url":
					// Convert from OpenAI format to Anthropic format
					if imgURL, ok := m["image_url"].(map[string]interface{}); ok {
						url, _ := imgURL["url"].(string)
						// Parse data URL: data:image/png;base64,xxxx
						if strings.HasPrefix(url, "data:") {
							parts := strings.SplitN(url, ",", 2)
							if len(parts) == 2 {
								// Extract media type from "data:image/png;base64"
								mediaInfo := strings.TrimPrefix(parts[0], "data:")
								mediaType := strings.Split(mediaInfo, ";")[0]
								blocks = append(blocks, AnthropicContentBlock{
									Type: "image",
									Source: &AnthropicImageSource{
										Type:      "base64",
										MediaType: mediaType,
										Data:      parts[1],
									},
								})
							}
						}
					}
				}
			}
		}
		if len(blocks) > 0 {
			return blocks
		}
	}

	return content
}

// AnthropicRequest represents a chat request to Anthropic
type AnthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	Messages  []AnthropicMessage `json:"messages"`
	System    string             `json:"system,omitempty"`
	Stream    bool               `json:"stream,omitempty"`
	Metadata  map[string]any     `json:"metadata,omitempty"`
}

// AnthropicSystemBlock represents a text block in the system prompt array format
type AnthropicSystemBlock struct {
	Type         string                 `json:"type"`
	Text         string                 `json:"text"`
	CacheControl *AnthropicCacheControl `json:"cache_control,omitempty"`
}

// AnthropicCacheControl for prompt caching
type AnthropicCacheControl struct {
	Type string `json:"type"` // "ephemeral"
}

// AnthropicOAuthRequest represents a chat request using OAuth (supports array system prompt)
type AnthropicOAuthRequest struct {
	Model     string                 `json:"model"`
	MaxTokens int                    `json:"max_tokens"`
	Messages  []AnthropicMessage     `json:"messages"`
	System    []AnthropicSystemBlock `json:"system,omitempty"` // Array format for OAuth
	Stream    bool                   `json:"stream,omitempty"`
	Metadata  map[string]any         `json:"metadata,omitempty"`
}

// AnthropicOAuthToolsRequest represents a tools request using OAuth (supports array system prompt)
type AnthropicOAuthToolsRequest struct {
	Model     string                 `json:"model"`
	MaxTokens int                    `json:"max_tokens"`
	Messages  []AnthropicMessage     `json:"messages"`
	System    []AnthropicSystemBlock `json:"system,omitempty"` // Array format for OAuth
	Stream    bool                   `json:"stream,omitempty"`
	Tools     []AnthropicTool        `json:"tools,omitempty"`
}

// ClaudeCodeSystemPrompt is the required system prompt header for OAuth tokens
const ClaudeCodeSystemPrompt = "You are Claude Code, Anthropic's official CLI for Claude."

// BuildOAuthSystemPrompt creates the array-format system prompt for OAuth
// The first block MUST be exactly ClaudeCodeSystemPrompt, additional content goes in second block.
// The last block gets cache_control: ephemeral for prompt caching.
func BuildOAuthSystemPrompt(additionalSystem string) []AnthropicSystemBlock {
	blocks := []AnthropicSystemBlock{
		{Type: "text", Text: ClaudeCodeSystemPrompt},
	}
	if additionalSystem != "" {
		blocks = append(blocks, AnthropicSystemBlock{
			Type:         "text",
			Text:         additionalSystem,
			CacheControl: &AnthropicCacheControl{Type: "ephemeral"},
		})
	} else {
		// Cache the single block
		blocks[0].CacheControl = &AnthropicCacheControl{Type: "ephemeral"}
	}
	return blocks
}

// AnthropicResponse represents a response from Anthropic
type AnthropicResponse struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Role    string `json:"role"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// AnthropicStreamEvent represents a streaming event from Anthropic
type AnthropicStreamEvent struct {
	Type  string `json:"type"`
	Index int    `json:"index,omitempty"`
	Delta struct {
		Type string `json:"type,omitempty"`
		Text string `json:"text,omitempty"`
	} `json:"delta,omitempty"`
	ContentBlock struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content_block,omitempty"`
}

// Chat sends a chat completion request to Anthropic
func (p *AnthropicProvider) Chat(messages []ChatMessage, model string) (string, error) {
	if model == "" {
		model = p.models[0]
	}

	// Convert messages to Anthropic format, extracting system message
	var systemPrompt string
	anthropicMessages := make([]AnthropicMessage, 0, len(messages))

	for _, msg := range messages {
		if msg.Role == "system" {
			systemPrompt = msg.GetContentString()
			continue
		}
		anthropicMessages = append(anthropicMessages, AnthropicMessage{
			Role:    msg.Role,
			Content: convertToAnthropicContent(msg.Content),
		})
	}

	reqBody := AnthropicRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    systemPrompt,
		Stream:    false,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", p.version)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Anthropic API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Anthropic API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result AnthropicResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Content) == 0 {
		return "", fmt.Errorf("no response from Anthropic")
	}

	// Concatenate all text content blocks
	var content strings.Builder
	for _, block := range result.Content {
		if block.Type == "text" {
			content.WriteString(block.Text)
		}
	}

	return content.String(), nil
}

// ChatStream sends a streaming chat completion request to Anthropic
func (p *AnthropicProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	// Convert messages to Anthropic format, extracting system message
	var systemPrompt string
	anthropicMessages := make([]AnthropicMessage, 0, len(messages))

	for _, msg := range messages {
		if msg.Role == "system" {
			systemPrompt = msg.GetContentString()
			continue
		}
		anthropicMessages = append(anthropicMessages, AnthropicMessage{
			Role:    msg.Role,
			Content: convertToAnthropicContent(msg.Content),
		})
	}

	reqBody := AnthropicRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    systemPrompt,
		Stream:    true,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/messages", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", p.version)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("Anthropic API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Anthropic API error: %d - %s", resp.StatusCode, string(respBody))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		if data == "[DONE]" {
			onChunk(StreamChunk{Done: true})
			break
		}

		var event AnthropicStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta.Text != "" {
				onChunk(StreamChunk{Content: event.Delta.Text})
			}
		case "message_stop":
			onChunk(StreamChunk{Done: true})
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	return nil
}

// AnthropicToolsRequest represents a chat request with tools to Anthropic
type AnthropicToolsRequest struct {
	Model     string                 `json:"model"`
	MaxTokens int                    `json:"max_tokens"`
	Messages  []AnthropicMessage     `json:"messages"`
	System    []AnthropicSystemBlock `json:"system,omitempty"` // Array format for prompt caching
	Stream    bool                   `json:"stream,omitempty"`
	Tools     []AnthropicTool        `json:"tools,omitempty"`
}

// AnthropicTool represents a tool in Anthropic format
type AnthropicTool struct {
	Name          string                   `json:"name"`
	Description   string                   `json:"description"`
	InputSchema   map[string]any           `json:"input_schema"`
	InputExamples []map[string]interface{} `json:"input_examples,omitempty"` // Concrete examples for better accuracy
	DeferLoading  bool                     `json:"defer_loading,omitempty"`  // Hide until discovered via tool_search
	Strict        bool                     `json:"strict,omitempty"`        // Guarantee schema conformance
}

// ChatStreamWithTools sends a streaming chat with tools support to Anthropic
func (p *AnthropicProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	// Convert messages to Anthropic format, extracting system message
	var systemPrompt string
	anthropicMessages := make([]AnthropicMessage, 0, len(messages))

	for i, msg := range messages {
		if msg.Role == "system" {
			systemPrompt = msg.GetContentString()
			continue
		}

		// Assistant messages with tool calls → include tool_use content blocks
		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			content := make([]map[string]any, 0)
			if text := msg.GetContentString(); text != "" {
				content = append(content, map[string]any{
					"type": "text",
					"text": text,
				})
			}
			for _, tc := range msg.ToolCalls {
				var input any
				if err := json.Unmarshal([]byte(tc.Function.Arguments), &input); err != nil {
					input = map[string]any{}
				}
				content = append(content, map[string]any{
					"type":  "tool_use",
					"id":    tc.ID,
					"name":  tc.Function.Name,
					"input": input,
				})
			}
			anthropicMessages = append(anthropicMessages, AnthropicMessage{
				Role:    "assistant",
				Content: content,
			})
			continue
		}

		// Tool result messages → group consecutive into a single user message
		if msg.Role == "tool" {
			toolResultBlocks := make([]map[string]any, 0)
			toolResultBlocks = append(toolResultBlocks, map[string]any{
				"type":        "tool_result",
				"tool_use_id": msg.ToolCallID,
				"content":     msg.GetContentString(),
			})
			for j := i + 1; j < len(messages) && messages[j].Role == "tool"; j++ {
				toolResultBlocks = append(toolResultBlocks, map[string]any{
					"type":        "tool_result",
					"tool_use_id": messages[j].ToolCallID,
					"content":     messages[j].GetContentString(),
				})
			}
			if i == 0 || messages[i-1].Role != "tool" {
				anthropicMessages = append(anthropicMessages, AnthropicMessage{
					Role:    "user",
					Content: toolResultBlocks,
				})
			}
			continue
		}

		anthropicMessages = append(anthropicMessages, AnthropicMessage{
			Role:    msg.Role,
			Content: convertToAnthropicContent(msg.Content),
		})
	}

	// Convert tools to Anthropic format
	anthropicTools := make([]AnthropicTool, 0, len(tools))
	for _, tool := range tools {
		at := AnthropicTool{
			Name:        tool.Function.Name,
			Description: tool.Function.Description,
			InputSchema: map[string]any{
				"type":       tool.Function.Parameters.Type,
				"properties": tool.Function.Parameters.Properties,
				"required":   tool.Function.Parameters.Required,
			},
		}
		// Pass through advanced tool features
		if len(tool.Function.InputExamples) > 0 {
			at.InputExamples = tool.Function.InputExamples
		}
		if tool.DeferLoading {
			at.DeferLoading = true
		}
		if tool.Strict {
			at.Strict = true
		}
		anthropicTools = append(anthropicTools, at)
	}

	// Build system prompt as array with prompt caching
	var systemBlocks []AnthropicSystemBlock
	if systemPrompt != "" {
		systemBlocks = []AnthropicSystemBlock{
			{
				Type:         "text",
				Text:         systemPrompt,
				CacheControl: &AnthropicCacheControl{Type: "ephemeral"},
			},
		}
	}

	reqBody := AnthropicToolsRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    systemBlocks,
		Stream:    true,
		Tools:     anthropicTools,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/messages", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", p.version)
	req.Header.Set("Accept", "text/event-stream")

	// Enable beta features: prompt caching + advanced tool use
	betaFeatures := []string{"prompt-caching-2024-07-31"}
	for _, t := range tools {
		if len(t.Function.InputExamples) > 0 || t.DeferLoading || t.Strict {
			betaFeatures = append(betaFeatures, "advanced-tool-use-2025-11-20")
			break
		}
	}
	req.Header.Set("anthropic-beta", strings.Join(betaFeatures, ","))

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("Anthropic API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Anthropic API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var currentToolCall *ToolCall
	var toolCalls []ToolCall
	var stopReason string

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		var event map[string]any
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		eventType, _ := event["type"].(string)

		switch eventType {
		case "content_block_start":
			if contentBlock, ok := event["content_block"].(map[string]any); ok {
				if blockType, _ := contentBlock["type"].(string); blockType == "tool_use" {
					currentToolCall = &ToolCall{
						ID:   contentBlock["id"].(string),
						Type: "function",
						Function: FunctionCall{
							Name:      contentBlock["name"].(string),
							Arguments: "",
						},
					}
				}
			}
		case "content_block_delta":
			if delta, ok := event["delta"].(map[string]any); ok {
				if deltaType, _ := delta["type"].(string); deltaType == "text_delta" {
					if text, ok := delta["text"].(string); ok {
						onChunk(StreamChunk{Content: text})
					}
				} else if deltaType == "input_json_delta" {
					if currentToolCall != nil {
						if partialJSON, ok := delta["partial_json"].(string); ok {
							currentToolCall.Function.Arguments += partialJSON
						}
					}
				}
			}
		case "content_block_stop":
			if currentToolCall != nil {
				toolCalls = append(toolCalls, *currentToolCall)
				currentToolCall = nil
			}
		case "message_delta":
			// Extract stop_reason from message_delta event
			if delta, ok := event["delta"].(map[string]any); ok {
				if sr, ok := delta["stop_reason"].(string); ok {
					stopReason = sr
				}
			}
		case "message_stop":
			if len(toolCalls) > 0 {
				onChunk(StreamChunk{ToolCalls: toolCalls, Done: true, StopReason: stopReason})
			} else {
				onChunk(StreamChunk{Done: true, StopReason: stopReason})
			}
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	return nil
}
