package providers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// thinkingPatterns detects chain-of-thought output to filter
var thinkingPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^the user (is|just|has|wants?|asks?|said)`),
	regexp.MustCompile(`(?i)^looking at (my|the|this)`),
	regexp.MustCompile(`(?i)^(i need to|i should|let me|i'll)`),
	regexp.MustCompile(`(?i)^(this is a|according to|based on)`),
	regexp.MustCompile(`(?i)^(since|because|given that)`),
	regexp.MustCompile(`(?i)system prompt`),
}

// DeepSeekProvider implements the Provider interface for DeepSeek AI
type DeepSeekProvider struct {
	BaseProvider
}

// NewDeepSeekProvider creates a new DeepSeek provider
func NewDeepSeekProvider(apiKey string) *DeepSeekProvider {
	return &DeepSeekProvider{
		BaseProvider: BaseProvider{
			name:         "DeepSeek",
			key:          "deepseek",
			baseURL:      "https://api.deepseek.com",
			apiKey:       apiKey,
			models:       []string{"deepseek-chat", "deepseek-reasoner"},
			httpClient:   NewHTTPClient(120 * time.Second),
			streamClient: NewStreamHTTPClient(),
		},
	}
}

// Chat sends a chat completion request to DeepSeek
func (p *DeepSeekProvider) Chat(messages []ChatMessage, model string) (string, error) {
	// Use default model if not specified
	if model == "" {
		model = p.models[0]
	}

	reqBody := ChatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      false,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("DeepSeek API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("DeepSeek API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from DeepSeek")
	}

	return result.Choices[0].Message.GetContentString(), nil
}

// StreamResponse represents a streaming SSE response chunk from DeepSeek
type StreamResponse struct {
	Choices []struct {
		Delta struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"` // Chain-of-thought (filtered out)
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

// ChatRequestWithTools is the request structure with tools support
type ChatRequestWithTools struct {
	Model       string                 `json:"model"`
	Messages    []ChatMessageWithTools `json:"messages"`
	Temperature float64                `json:"temperature"`
	Stream      bool                   `json:"stream"`
	Tools       []Tool                 `json:"tools,omitempty"`
}

// ChatStream sends a streaming chat completion request to DeepSeek
func (p *DeepSeekProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	reqBody := ChatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      true,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("DeepSeek API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DeepSeek API error: %d - %s", resp.StatusCode, string(respBody))
	}

	// Read SSE stream
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// SSE format: "data: {...}"
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		// Check for stream end
		if data == "[DONE]" {
			onChunk(StreamChunk{Done: true})
			break
		}

		var streamResp StreamResponse
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			content := streamResp.Choices[0].Delta.Content
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

// ChatStreamWithTools sends a streaming chat with tools support to DeepSeek
func (p *DeepSeekProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	// DeepSeek reasoner model requires reasoning_content field for tool calls
	// which we don't track. Fall back to deepseek-chat for tool interactions.
	if model == "deepseek-reasoner" && len(tools) > 0 {
		model = "deepseek-chat"
	}

	reqBody := ChatRequestWithTools{
		Model:       model,
		Messages:    messages,
		Temperature: 1.0,
		Stream:      true,
		Tools:       tools,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("DeepSeek API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("DeepSeek API error: %d - %s", resp.StatusCode, string(respBody))
	}

	// Track accumulated tool calls across stream chunks
	toolCallsAccum := make(map[int]*ToolCall)

	// Read SSE stream
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// SSE format: "data: {...}"
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		// Check for stream end
		if data == "[DONE]" {
			// If we accumulated tool calls, send them
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

		var streamResp StreamResponse
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			delta := streamResp.Choices[0].Delta

			// Handle content
			if delta.Content != "" {
				onChunk(StreamChunk{Content: delta.Content})
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
				// Accumulate arguments (streamed in chunks)
				if tc.Function.Arguments != "" {
					toolCallsAccum[tc.Index].Function.Arguments += tc.Function.Arguments
				}
				// Update ID if provided (comes in first chunk)
				if tc.ID != "" {
					toolCallsAccum[tc.Index].ID = tc.ID
				}
				// Update type if provided
				if tc.Type != "" {
					toolCallsAccum[tc.Index].Type = tc.Type
				}
				// Update name if provided (comes in first chunk)
				if tc.Function.Name != "" {
					toolCallsAccum[tc.Index].Function.Name = tc.Function.Name
				}
			}

			// Check finish reason
			if streamResp.Choices[0].FinishReason == "tool_calls" {
				// Send accumulated tool calls
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
