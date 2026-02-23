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

const (
	defaultCodexInstructions = "You are Construct, a helpful coding assistant."
)

// OpenAICodexOAuthProvider uses ChatGPT OAuth tokens against the Codex responses endpoint.
type OpenAICodexOAuthProvider struct {
	BaseProvider
	accountID      string
	timeout        time.Duration
	extraHeaders   map[string]string
	codexStreamClient *http.Client // shared client for streaming requests
}

// NewOpenAICodexOAuthProvider creates a provider that routes through chatgpt.com Codex.
func NewOpenAICodexOAuthProvider(accessToken, accountID string, models []string) *OpenAICodexOAuthProvider {
	if len(models) == 0 {
		models = []string{"gpt-5.3-codex"}
	}

	return &OpenAICodexOAuthProvider{
		BaseProvider: BaseProvider{
			name:    "OpenAI OAuth",
			key:     "openai-oauth",
			baseURL: "https://chatgpt.com/backend-api/codex",
			apiKey:  accessToken,
			models:  models,
		},
		accountID: strings.TrimSpace(accountID),
		timeout:   300 * time.Second,
		extraHeaders: map[string]string{
			"Accept-Language": "en-US,en",
			"originator":      "construct",
			"User-Agent":      "construct-context",
		},
		codexStreamClient: NewStreamHTTPClient(),
	}
}

func (p *OpenAICodexOAuthProvider) Chat(messages []ChatMessage, model string) (string, error) {
	var builder strings.Builder
	err := p.ChatStream(messages, model, func(chunk StreamChunk) {
		if chunk.Content != "" {
			builder.WriteString(chunk.Content)
		}
	})
	if err != nil {
		return "", err
	}
	return builder.String(), nil
}

func (p *OpenAICodexOAuthProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	instructions := buildCodexInstructions(messages, nil)
	input := buildCodexInput(messages, nil)
	payload := p.buildPayload(model, instructions, input, nil)

	return p.sendStreamRequest(payload, onChunk)
}

func (p *OpenAICodexOAuthProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	instructions := buildCodexInstructions(nil, messages)
	input := buildCodexInput(nil, messages)
	payload := p.buildPayload(model, instructions, input, tools)

	return p.sendStreamRequest(payload, onChunk)
}

func (p *OpenAICodexOAuthProvider) buildPayload(model, instructions string, input []map[string]any, tools []Tool) map[string]any {
	payload := map[string]any{
		"model":        model,
		"instructions": defaultIfBlank(instructions, defaultCodexInstructions),
		"input":        input,
		"store":        false,
		"stream":       true,
	}

	if len(tools) > 0 {
		payload["tools"] = toCodexTools(tools)
		payload["tool_choice"] = "auto"
		payload["parallel_tool_calls"] = true
	}

	return payload
}

func (p *OpenAICodexOAuthProvider) sendStreamRequest(payload map[string]any, onChunk func(StreamChunk)) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.baseURL+"/responses", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	if p.accountID != "" {
		req.Header.Set("ChatGPT-Account-Id", p.accountID)
	}
	for k, v := range p.extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := p.codexStreamClient.Do(req)
	if err != nil {
		return fmt.Errorf("OpenAI OAuth Codex API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("OpenAI OAuth Codex API error: %d - %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	return parseCodexSSEStream(resp.Body, onChunk)
}

func parseCodexSSEStream(reader io.Reader, onChunk func(StreamChunk)) error {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	currentEvent := ""
	for scanner.Scan() {
		line := scanner.Text()

		if after, found := strings.CutPrefix(line, "event: "); found {
			currentEvent = strings.TrimSpace(after)
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			onChunk(StreamChunk{Done: true})
			return nil
		}

		switch currentEvent {
		case "response.output_text.delta":
			var payload struct {
				Delta string `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &payload); err == nil && payload.Delta != "" {
				onChunk(StreamChunk{Content: payload.Delta})
			}

		case "response.output_item.done":
			var payload struct {
				Item struct {
					ID        string `json:"id"`
					Type      string `json:"type"`
					CallID    string `json:"call_id"`
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"item"`
			}
			if err := json.Unmarshal([]byte(data), &payload); err == nil && payload.Item.Type == "function_call" {
				callID := payload.Item.CallID
				if callID == "" {
					callID = payload.Item.ID
				}
				onChunk(StreamChunk{
					ToolCalls: []ToolCall{
						{
							ID:   callID,
							Type: "function",
							Function: FunctionCall{
								Name:      payload.Item.Name,
								Arguments: payload.Item.Arguments,
							},
						},
					},
				})
			}

		case "response.failed", "error":
			var payload struct {
				Error struct {
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal([]byte(data), &payload); err == nil && strings.TrimSpace(payload.Error.Message) != "" {
				return fmt.Errorf("OpenAI OAuth Codex stream error: %s", payload.Error.Message)
			}
			return fmt.Errorf("OpenAI OAuth Codex stream error: %s", data)

		case "response.completed":
			onChunk(StreamChunk{Done: true})
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("OpenAI OAuth Codex stream read error: %v", err)
	}

	onChunk(StreamChunk{Done: true})
	return nil
}

func buildCodexInstructions(messages []ChatMessage, toolMessages []ChatMessageWithTools) string {
	var lines []string

	for _, msg := range messages {
		if strings.EqualFold(strings.TrimSpace(msg.Role), "system") {
			if content := contentAsString(msg.Content); content != "" {
				lines = append(lines, content)
			}
		}
	}

	for _, msg := range toolMessages {
		if strings.EqualFold(strings.TrimSpace(msg.Role), "system") {
			if content := contentAsString(msg.Content); content != "" {
				lines = append(lines, content)
			}
		}
	}

	return strings.TrimSpace(strings.Join(lines, "\n\n"))
}

func buildCodexInput(messages []ChatMessage, toolMessages []ChatMessageWithTools) []map[string]any {
	input := []map[string]any{}

	for _, msg := range messages {
		role := strings.ToLower(strings.TrimSpace(msg.Role))
		if role == "" || role == "system" {
			continue
		}
		input = append(input, map[string]any{
			"role":    role,
			"content": toCodexContent(msg.Content),
		})
	}

	for _, msg := range toolMessages {
		role := strings.ToLower(strings.TrimSpace(msg.Role))
		if role == "" || role == "system" {
			continue
		}

		if role == "tool" {
			callID := strings.TrimSpace(msg.ToolCallID)
			if callID == "" {
				continue
			}
			input = append(input, map[string]any{
				"type":    "function_call_output",
				"call_id": callID,
				"output":  contentAsString(msg.Content),
			})
			continue
		}

		if role == "assistant" && len(msg.ToolCalls) > 0 {
			if content := contentAsString(msg.Content); strings.TrimSpace(content) != "" {
				input = append(input, map[string]any{
					"role":    role,
					"content": content,
				})
			}
			for _, toolCall := range msg.ToolCalls {
				name := strings.TrimSpace(toolCall.Function.Name)
				if name == "" {
					continue
				}
				args := strings.TrimSpace(toolCall.Function.Arguments)
				if args == "" {
					args = "{}"
				}
				callID := strings.TrimSpace(toolCall.ID)
				if callID == "" {
					callID = name
				}
				input = append(input, map[string]any{
					"type":      "function_call",
					"name":      name,
					"arguments": args,
					"call_id":   callID,
				})
			}
			continue
		}

		input = append(input, map[string]any{
			"role":    role,
			"content": contentAsString(msg.Content),
		})
	}

	if len(input) == 0 {
		return []map[string]any{
			{
				"role":    "user",
				"content": "",
			},
		}
	}

	return input
}

func toCodexContent(content any) any {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		parts := make([]map[string]any, 0, len(v))
		for _, part := range v {
			partMap, ok := part.(map[string]any)
			if !ok {
				continue
			}
			partType := strings.TrimSpace(fmt.Sprintf("%v", partMap["type"]))
			switch partType {
			case "text":
				text := strings.TrimSpace(fmt.Sprintf("%v", partMap["text"]))
				if text != "" {
					parts = append(parts, map[string]any{
						"type": "input_text",
						"text": text,
					})
				}
			case "image_url", "image":
				imageURL := extractImageURL(partMap["image_url"])
				if imageURL != "" {
					parts = append(parts, map[string]any{
						"type":      "input_image",
						"image_url": imageURL,
					})
				}
			}
		}
		if len(parts) > 0 {
			return parts
		}
	}

	return contentAsString(content)
}

func extractImageURL(imageURL any) string {
	switch v := imageURL.(type) {
	case string:
		return strings.TrimSpace(v)
	case map[string]any:
		if raw, ok := v["url"]; ok {
			return strings.TrimSpace(fmt.Sprintf("%v", raw))
		}
	}
	return ""
}

func contentAsString(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case nil:
		return ""
	default:
		data, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(data)
	}
}

func toCodexTools(tools []Tool) []map[string]any {
	converted := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		name := strings.TrimSpace(tool.Function.Name)
		if name == "" {
			continue
		}

		parameters := map[string]any{
			"type":       defaultIfBlank(tool.Function.Parameters.Type, "object"),
			"properties": toCodexProperties(tool.Function.Parameters.Properties),
		}
		if len(tool.Function.Parameters.Required) > 0 {
			parameters["required"] = tool.Function.Parameters.Required
		}

		converted = append(converted, map[string]any{
			"type":        "function",
			"name":        name,
			"description": tool.Function.Description,
			"parameters":  parameters,
		})
	}
	return converted
}

func toCodexProperties(properties map[string]Property) map[string]any {
	result := make(map[string]any, len(properties))
	for key, prop := range properties {
		entry := map[string]any{
			"type": defaultIfBlank(prop.Type, "string"),
		}
		// Codex/OpenAI function schema requires array params to include `items`.
		// Our generic tool metadata doesn't model item schemas, so default to string items.
		if strings.EqualFold(strings.TrimSpace(prop.Type), "array") {
			entry["items"] = map[string]any{
				"type": "string",
			}
		}
		if prop.Description != "" {
			entry["description"] = prop.Description
		}
		if len(prop.Enum) > 0 {
			entry["enum"] = prop.Enum
		}
		result[key] = entry
	}
	return result
}

func defaultIfBlank(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
