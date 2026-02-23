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

// OpenAICompatibleProvider implements the Provider interface for any OpenAI-compatible API
type OpenAICompatibleProvider struct {
	BaseProvider
	// Additional config for specific providers
	extraHeaders    map[string]string
	timeout         time.Duration
	disableThinking bool // For models like GLM that have thinking enabled by default
	ownHTTPClient   *http.Client // shared client for non-streaming (uses provider-specific timeout)
	ownStreamClient *http.Client // shared client for streaming (no timeout)
}

// OpenAIProviderConfig configures an OpenAI-compatible provider
type OpenAIProviderConfig struct {
	Name            string
	Key             string
	BaseURL         string
	APIKey          string
	Models          []string
	ExtraHeaders    map[string]string
	Timeout         time.Duration
	DisableThinking bool // Send thinking: {type: "disabled"} to suppress CoT output
}

// NewOpenAICompatibleProvider creates a new OpenAI-compatible provider
func NewOpenAICompatibleProvider(cfg OpenAIProviderConfig) *OpenAICompatibleProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 300 * time.Second
	}
	return &OpenAICompatibleProvider{
		BaseProvider: BaseProvider{
			name:    cfg.Name,
			key:     cfg.Key,
			baseURL: cfg.BaseURL,
			apiKey:  cfg.APIKey,
			models:  cfg.Models,
		},
		extraHeaders:    cfg.ExtraHeaders,
		timeout:         timeout,
		disableThinking: cfg.DisableThinking,
		ownHTTPClient:   NewHTTPClient(timeout),
		ownStreamClient: NewStreamHTTPClient(),
	}
}

// marshalWithThinking marshals a request body and optionally adds thinking:disabled
func (p *OpenAICompatibleProvider) marshalWithThinking(reqBody any) ([]byte, error) {
	if !p.disableThinking {
		return json.Marshal(reqBody)
	}
	// Marshal to map, add thinking parameter, re-marshal
	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	m["thinking"] = map[string]string{"type": "disabled"}
	return json.Marshal(m)
}

// Chat sends a chat completion request
func (p *OpenAICompatibleProvider) Chat(messages []ChatMessage, model string) (string, error) {
	if model == "" {
		model = p.models[0]
	}

	reqBody := ChatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      false,
	}

	body, err := p.marshalWithThinking(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	for k, v := range p.extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := p.ownHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("%s API error: %v", p.name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("%s API error: %d - %s", p.name, resp.StatusCode, string(respBody))
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from %s", p.name)
	}

	return result.Choices[0].Message.GetContentString(), nil
}

// ChatStream sends a streaming chat completion request
func (p *OpenAICompatibleProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	reqBody := ChatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      true,
	}

	body, err := p.marshalWithThinking(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")
	for k, v := range p.extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := p.ownStreamClient.Do(req)
	if err != nil {
		return fmt.Errorf("%s API error: %v", p.name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s API error: %d - %s", p.name, resp.StatusCode, string(respBody))
	}

	return p.parseSSEStream(resp.Body, onChunk)
}

// parseSSEStream parses Server-Sent Events stream
func (p *OpenAICompatibleProvider) parseSSEStream(reader io.Reader, onChunk func(StreamChunk)) error {
	scanner := bufio.NewScanner(reader)
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

		var streamResp struct {
			Choices []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			// Try content first, then reasoning_content (for reasoning models)
			content := streamResp.Choices[0].Delta.Content
			if content == "" {
				content = streamResp.Choices[0].Delta.ReasoningContent
			}
			if content != "" {
				onChunk(StreamChunk{Content: content})
			}
			if streamResp.Choices[0].FinishReason == "stop" {
				onChunk(StreamChunk{Done: true})
				break
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	return nil
}

// ChatStreamWithTools sends a streaming chat with tools support
func (p *OpenAICompatibleProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	reqBody := ChatRequestWithTools{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      true,
		Tools:       tools,
	}

	body, err := p.marshalWithThinking(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")
	for k, v := range p.extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := p.ownStreamClient.Do(req)
	if err != nil {
		return fmt.Errorf("%s API error: %v", p.name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s API error: %d - %s", p.name, resp.StatusCode, string(respBody))
	}

	return p.parseSSEStreamWithTools(resp.Body, onChunk)
}

// parseSSEStreamWithTools parses SSE stream with tool call support
func (p *OpenAICompatibleProvider) parseSSEStreamWithTools(reader io.Reader, onChunk func(StreamChunk)) error {
	scanner := bufio.NewScanner(reader)
	toolCallsAccum := make(map[int]*ToolCall)

	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		if data == "[DONE]" {
			if len(toolCallsAccum) > 0 {
				toolCalls := make([]ToolCall, 0, len(toolCallsAccum))
				for _, tc := range toolCallsAccum {
					toolCalls = append(toolCalls, *tc)
				}
				onChunk(StreamChunk{ToolCalls: toolCalls, Done: true})
			} else {
				onChunk(StreamChunk{Done: true})
			}
			break
		}

		var streamResp struct {
			Choices []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content"`
					ToolCalls        []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			delta := streamResp.Choices[0].Delta

			// Handle content
			content := delta.Content
			if content == "" {
				content = delta.ReasoningContent
			}
			if content != "" {
				onChunk(StreamChunk{Content: content})
			}

			// Handle tool calls - accumulate across chunks
			for _, tc := range delta.ToolCalls {
				if _, ok := toolCallsAccum[tc.Index]; !ok {
					toolCallsAccum[tc.Index] = &ToolCall{
						ID:   tc.ID,
						Type: tc.Type,
						Function: FunctionCall{
							Name:      tc.Function.Name,
							Arguments: "",
						},
					}
				}
				if tc.Function.Arguments != "" {
					toolCallsAccum[tc.Index].Function.Arguments += tc.Function.Arguments
				}
				if tc.ID != "" {
					toolCallsAccum[tc.Index].ID = tc.ID
				}
				if tc.Type != "" {
					toolCallsAccum[tc.Index].Type = tc.Type
				}
				if tc.Function.Name != "" {
					toolCallsAccum[tc.Index].Function.Name = tc.Function.Name
				}
			}

			// Check finish reason
			if streamResp.Choices[0].FinishReason == "tool_calls" {
				toolCalls := make([]ToolCall, 0, len(toolCallsAccum))
				for _, tc := range toolCallsAccum {
					toolCalls = append(toolCalls, *tc)
				}
				onChunk(StreamChunk{ToolCalls: toolCalls, Done: true})
				break
			}
			if streamResp.Choices[0].FinishReason == "stop" {
				onChunk(StreamChunk{Done: true})
				break
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	return nil
}

// === Pre-configured providers ===

// NewDeepSeekProviderV2 creates a DeepSeek provider using the unified implementation
func NewDeepSeekProviderV2(apiKey string) *OpenAICompatibleProvider {
	return NewOpenAICompatibleProvider(OpenAIProviderConfig{
		Name:    "DeepSeek",
		Key:     "deepseek",
		BaseURL: "https://api.deepseek.com",
		APIKey:  apiKey,
		Models:  []string{"deepseek-chat", "deepseek-reasoner"},
		ExtraHeaders: map[string]string{
			"Accept-Language": "en-US,en",
		},
	})
}

// NewXAIProviderV2 creates an xAI (Grok) provider using the unified implementation
func NewXAIProviderV2(apiKey string) *OpenAICompatibleProvider {
	return NewOpenAICompatibleProvider(OpenAIProviderConfig{
		Name:    "xAI",
		Key:     "xai",
		BaseURL: "https://api.x.ai/v1",
		APIKey:  apiKey,
		Models: []string{
			"grok-4-1-fast-reasoning", // Grok 4.1 Fast (reasoning + vision)
			"grok-code-fast-1",        // Grok Code (coding + tool calling)
		},
		ExtraHeaders: map[string]string{
			"Accept-Language": "en-US,en",
		},
	})
}

// NewMoonshotProvider creates a Moonshot AI (Kimi) provider using the unified implementation
func NewMoonshotProvider(apiKey string) *OpenAICompatibleProvider {
	return NewOpenAICompatibleProvider(OpenAIProviderConfig{
		Name:    "Kimi",
		Key:     "kimi",
		BaseURL: "https://api.moonshot.cn/v1",
		APIKey:  apiKey,
		Models: []string{
			"kimi-k2.5",            // Kimi K2.5 (multimodal, 262K context)
			"moonshot-v1-128k",     // Moonshot V1 128K context
		},
	})
}

// NewZAIProviderV2 creates a Z.ai provider using the unified implementation
func NewZAIProviderV2(apiKey string) *OpenAICompatibleProvider {
	return NewOpenAICompatibleProvider(OpenAIProviderConfig{
		Name:    "Z.ai",
		Key:     "zai",
		BaseURL: "https://api.z.ai/api/paas/v4",
		APIKey:  apiKey,
		Models: []string{
			"glm-5",         // GLM-5 flagship (745B MoE, 200K context)
			"glm-4.7-flash", // GLM 4.7 Flash (free tier, fast)
			"glm-4.6v",      // GLM 4.6V (vision + 128K context)
		},
		ExtraHeaders: map[string]string{
			"Accept-Language": "en-US,en",
		},
		DisableThinking: true, // GLM has thinking enabled by default — disable to get clean output
	})
}

// NewOpenAIOAuthProvider creates an OpenAI provider backed by OAuth bearer tokens.
func NewOpenAIOAuthProvider(accessToken string, models []string) *OpenAICompatibleProvider {
	if len(models) == 0 {
		models = []string{
			"gpt-5.3-codex",
		}
	}

	return NewOpenAICompatibleProvider(OpenAIProviderConfig{
		Name:    "OpenAI",
		Key:     "openai-oauth",
		BaseURL: "https://api.openai.com/v1",
		APIKey:  accessToken,
		Models:  models,
		ExtraHeaders: map[string]string{
			"Accept-Language": "en-US,en",
		},
	})
}
