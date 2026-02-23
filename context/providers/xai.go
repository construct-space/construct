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

// XAIProvider implements the Provider interface for xAI (Grok)
type XAIProvider struct {
	BaseProvider
}

// NewXAIProvider creates a new xAI provider
func NewXAIProvider(apiKey string) *XAIProvider {
	return &XAIProvider{
		BaseProvider: BaseProvider{
			name:         "xAI",
			key:          "xai",
			baseURL:      "https://api.x.ai/v1",
			apiKey:       apiKey,
			models:       []string{"grok-4-1-fast-reasoning", "grok-code-fast-1"},
			httpClient:   NewHTTPClient(120 * time.Second),
			streamClient: NewStreamHTTPClient(),
		},
	}
}

// Chat sends a chat completion request to xAI
func (p *XAIProvider) Chat(messages []ChatMessage, model string) (string, error) {
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
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("xAI API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("xAI API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from xAI")
	}

	return result.Choices[0].Message.GetContentString(), nil
}

// ChatStream sends a streaming chat completion request to xAI
func (p *XAIProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
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
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("xAI API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("xAI API error: %d - %s", resp.StatusCode, string(respBody))
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

// ChatStreamWithTools sends a streaming chat with tools support to xAI
func (p *XAIProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
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

	body, err := json.Marshal(reqBody)
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

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("xAI API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("xAI API error: %d - %s", resp.StatusCode, string(respBody))
	}

	toolCallsAccum := make(map[int]*ToolCall)

	scanner := bufio.NewScanner(resp.Body)
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

		var streamResp StreamResponse
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			delta := streamResp.Choices[0].Delta

			if delta.Content != "" {
				onChunk(StreamChunk{Content: delta.Content})
			}

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
