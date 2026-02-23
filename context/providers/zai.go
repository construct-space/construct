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

// ZAIProvider implements the Provider interface for Z.ai
type ZAIProvider struct {
	BaseProvider
}

// NewZAIProvider creates a new Z.ai provider
func NewZAIProvider(apiKey string) *ZAIProvider {
	return &ZAIProvider{
		BaseProvider: BaseProvider{
			name:         "Z.ai",
			key:          "zai",
			baseURL:      "https://api.z.ai/api/paas/v4",
			apiKey:       apiKey,
			models:       []string{"glm-5", "glm-4.7-flash", "glm-4.6v"},
			httpClient:   NewHTTPClient(90 * time.Second),
			streamClient: NewStreamHTTPClient(),
		},
	}
}

// Chat sends a chat completion request to Z.ai
func (p *ZAIProvider) Chat(messages []ChatMessage, model string) (string, error) {
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
		return "", fmt.Errorf("Z.ai API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Z.ai API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from Z.ai")
	}

	return result.Choices[0].Message.GetContentString(), nil
}

// ChatStream sends a streaming chat completion request to Z.ai
func (p *ZAIProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
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
		return fmt.Errorf("Z.ai API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Z.ai API error: %d - %s", resp.StatusCode, string(respBody))
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
			// Only output content, never reasoning_content (chain-of-thought should be hidden)
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

// ChatStreamWithTools sends a streaming chat with tools support to Z.ai
func (p *ZAIProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	// Build request body with tools
	reqBody := map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"temperature": 1.0,
		"stream":      true,
	}

	// Add tools if provided
	if len(tools) > 0 {
		reqBody["tools"] = tools
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
		return fmt.Errorf("Z.ai API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Z.ai API error: %d - %s", resp.StatusCode, string(respBody))
	}

	// Track tool calls being assembled
	var currentToolCalls []ToolCall

	// Read SSE stream
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		if data == "[DONE]" {
			// Send any accumulated tool calls
			if len(currentToolCalls) > 0 {
				onChunk(StreamChunk{ToolCalls: currentToolCalls, Done: true})
			} else {
				onChunk(StreamChunk{Done: true})
			}
			break
		}

		var streamResp struct {
			Choices []struct {
				Delta struct {
					Content          string     `json:"content"`
					ReasoningContent string     `json:"reasoning_content"`
					ToolCalls        []ToolCall `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Choices) > 0 {
			delta := streamResp.Choices[0].Delta

			// Handle content only, never reasoning_content (chain-of-thought should be hidden)
			if delta.Content != "" {
				onChunk(StreamChunk{Content: delta.Content})
			}

			// Handle tool calls (they come in chunks, need to accumulate)
			if len(delta.ToolCalls) > 0 {
				for _, tc := range delta.ToolCalls {
					// Append or update tool call
					if tc.ID != "" {
						currentToolCalls = append(currentToolCalls, tc)
					} else if len(currentToolCalls) > 0 {
						// Update last tool call with additional arguments
						last := &currentToolCalls[len(currentToolCalls)-1]
						last.Function.Arguments += tc.Function.Arguments
					}
				}
			}

			if streamResp.Choices[0].FinishReason == "tool_calls" || streamResp.Choices[0].FinishReason == "stop" {
				if len(currentToolCalls) > 0 {
					onChunk(StreamChunk{ToolCalls: currentToolCalls, Done: true})
				} else {
					onChunk(StreamChunk{Done: true})
				}
				break
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	return nil
}

// SupportsImageGeneration returns true - Z.ai supports image generation
func (p *ZAIProvider) SupportsImageGeneration() bool {
	return true
}

// GenerateImage generates an image using Z.ai's cogview model
func (p *ZAIProvider) GenerateImage(prompt, size, quality string) (interface{}, error) {
	if size == "" {
		size = "1024x1024"
	}
	if quality == "" {
		quality = "standard"
	}

	reqBody := map[string]interface{}{
		"model":   "cogview-4-250304",
		"prompt":  prompt,
		"size":    size,
		"quality": quality,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", p.baseURL+"/images/generations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// SupportsWebSearch returns true - Z.ai supports web search
func (p *ZAIProvider) SupportsWebSearch() bool {
	return true
}

// WebSearch performs a web search using Z.ai
func (p *ZAIProvider) WebSearch(query string, count int, recency string) (interface{}, error) {
	if count == 0 {
		count = 10
	}
	if recency == "" {
		recency = "noLimit"
	}

	reqBody := map[string]interface{}{
		"search_engine":         "search-prime",
		"search_query":          query,
		"count":                 count,
		"search_recency_filter": recency,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", p.baseURL+"/web_search", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "en-US,en")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// SupportsURLReader returns true - Z.ai supports URL reading
func (p *ZAIProvider) SupportsURLReader() bool {
	return true
}

// ReadURL reads content from a URL using Z.ai
func (p *ZAIProvider) ReadURL(url, format string) (interface{}, error) {
	if format == "" {
		format = "markdown"
	}

	reqBody := map[string]interface{}{
		"url":           url,
		"return_format": format,
		"retain_images": true,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", p.baseURL+"/reader", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}
