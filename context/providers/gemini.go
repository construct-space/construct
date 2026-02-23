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

// GeminiProvider implements the Provider interface for Google Gemini
type GeminiProvider struct {
	BaseProvider
}

// NewGeminiProvider creates a new Gemini provider
func NewGeminiProvider(apiKey string) *GeminiProvider {
	return &GeminiProvider{
		BaseProvider: BaseProvider{
			name:         "Gemini",
			key:          "gemini",
			baseURL:      "https://generativelanguage.googleapis.com/v1beta",
			apiKey:       apiKey,
			models:       []string{"gemini-2.5-flash", "gemini-2.5-pro"},
			httpClient:   NewHTTPClient(120 * time.Second),
			streamClient: NewStreamHTTPClient(),
		},
	}
}

// GeminiContent represents content in Gemini format
type GeminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []GeminiPart `json:"parts"`
}

// GeminiPart represents a part of content
type GeminiPart struct {
	Text       string           `json:"text,omitempty"`
	InlineData *GeminiInlineData `json:"inlineData,omitempty"`
}

// GeminiInlineData represents inline image data for vision
type GeminiInlineData struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"` // base64 encoded
}

// GeminiRequest represents a request to Gemini API
type GeminiRequest struct {
	Contents         []GeminiContent   `json:"contents"`
	SystemInstruction *GeminiContent   `json:"systemInstruction,omitempty"`
	GenerationConfig *GeminiGenConfig  `json:"generationConfig,omitempty"`
}

// GeminiGenConfig represents generation config
type GeminiGenConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

// GeminiResponse represents a response from Gemini
type GeminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
}

// GeminiStreamResponse represents a streaming response chunk
type GeminiStreamResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
}

// convertToGeminiParts converts a ChatMessage's content to Gemini parts, handling multimodal
func convertToGeminiParts(msg ChatMessage) []GeminiPart {
	// Check for multimodal content (array of parts)
	if arr, ok := msg.Content.([]interface{}); ok {
		parts := make([]GeminiPart, 0, len(arr))
		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				partType, _ := m["type"].(string)
				switch partType {
				case "text":
					text, _ := m["text"].(string)
					if text != "" {
						parts = append(parts, GeminiPart{Text: text})
					}
				case "image_url":
					if imgURL, ok := m["image_url"].(map[string]interface{}); ok {
						url, _ := imgURL["url"].(string)
						if strings.HasPrefix(url, "data:") {
							dataParts := strings.SplitN(url, ",", 2)
							if len(dataParts) == 2 {
								mediaInfo := strings.TrimPrefix(dataParts[0], "data:")
								mimeType := strings.Split(mediaInfo, ";")[0]
								parts = append(parts, GeminiPart{
									InlineData: &GeminiInlineData{
										MimeType: mimeType,
										Data:     dataParts[1],
									},
								})
							}
						}
					}
				}
			}
		}
		if len(parts) > 0 {
			return parts
		}
	}
	// Also check []any variant
	if arr, ok := msg.Content.([]any); ok {
		parts := make([]GeminiPart, 0, len(arr))
		for _, item := range arr {
			if m, ok := item.(map[string]any); ok {
				partType, _ := m["type"].(string)
				switch partType {
				case "text":
					text, _ := m["text"].(string)
					if text != "" {
						parts = append(parts, GeminiPart{Text: text})
					}
				case "image_url":
					if imgURL, ok := m["image_url"].(map[string]any); ok {
						url, _ := imgURL["url"].(string)
						if strings.HasPrefix(url, "data:") {
							dataParts := strings.SplitN(url, ",", 2)
							if len(dataParts) == 2 {
								mediaInfo := strings.TrimPrefix(dataParts[0], "data:")
								mimeType := strings.Split(mediaInfo, ";")[0]
								parts = append(parts, GeminiPart{
									InlineData: &GeminiInlineData{
										MimeType: mimeType,
										Data:     dataParts[1],
									},
								})
							}
						}
					}
				}
			}
		}
		if len(parts) > 0 {
			return parts
		}
	}
	// Simple text content
	text := msg.GetContentString()
	if text != "" {
		return []GeminiPart{{Text: text}}
	}
	return nil
}

// Chat sends a chat completion request to Gemini
func (p *GeminiProvider) Chat(messages []ChatMessage, model string) (string, error) {
	if model == "" {
		model = p.models[0]
	}

	// Convert messages to Gemini format
	var systemInstruction *GeminiContent
	contents := make([]GeminiContent, 0, len(messages))

	for _, msg := range messages {
		if msg.Role == "system" {
			systemInstruction = &GeminiContent{
				Parts: []GeminiPart{{Text: msg.GetContentString()}},
			}
			continue
		}

		role := msg.Role
		if role == "assistant" {
			role = "model"
		}

		parts := convertToGeminiParts(msg)
		if parts == nil {
			continue
		}
		contents = append(contents, GeminiContent{
			Role:  role,
			Parts: parts,
		})
	}

	reqBody := GeminiRequest{
		Contents:         contents,
		SystemInstruction: systemInstruction,
		GenerationConfig: &GeminiGenConfig{
			Temperature:     1.0,
			MaxOutputTokens: 8192,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", p.baseURL, model)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-goog-api-key", p.apiKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Gemini API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Gemini API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result GeminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("no response from Gemini")
	}

	// Concatenate all text parts
	var content strings.Builder
	for _, part := range result.Candidates[0].Content.Parts {
		content.WriteString(part.Text)
	}

	return content.String(), nil
}

// ChatStream sends a streaming chat completion request to Gemini
func (p *GeminiProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	// Convert messages to Gemini format
	var systemInstruction *GeminiContent
	contents := make([]GeminiContent, 0, len(messages))

	for _, msg := range messages {
		if msg.Role == "system" {
			systemInstruction = &GeminiContent{
				Parts: []GeminiPart{{Text: msg.GetContentString()}},
			}
			continue
		}

		role := msg.Role
		if role == "assistant" {
			role = "model"
		}

		parts := convertToGeminiParts(msg)
		if parts == nil {
			continue
		}
		contents = append(contents, GeminiContent{
			Role:  role,
			Parts: parts,
		})
	}

	reqBody := GeminiRequest{
		Contents:         contents,
		SystemInstruction: systemInstruction,
		GenerationConfig: &GeminiGenConfig{
			Temperature:     1.0,
			MaxOutputTokens: 8192,
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	// Use streamGenerateContent endpoint
	url := fmt.Sprintf("%s/models/%s:streamGenerateContent?alt=sse", p.baseURL, model)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-goog-api-key", p.apiKey)

	resp, err := p.streamClient.Do(req)
	if err != nil {
		return fmt.Errorf("Gemini API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Gemini API error: %d - %s", resp.StatusCode, string(respBody))
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

		var streamResp GeminiStreamResponse
		if err := json.Unmarshal([]byte(data), &streamResp); err != nil {
			continue
		}

		if len(streamResp.Candidates) > 0 && len(streamResp.Candidates[0].Content.Parts) > 0 {
			for _, part := range streamResp.Candidates[0].Content.Parts {
				if part.Text != "" {
					onChunk(StreamChunk{Content: part.Text})
				}
			}
			if streamResp.Candidates[0].FinishReason == "STOP" {
				onChunk(StreamChunk{Done: true})
				return nil
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("stream read error: %v", err)
	}

	onChunk(StreamChunk{Done: true})
	return nil
}

// ChatStreamWithTools sends a streaming chat with tools support to Gemini
func (p *GeminiProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	// Convert to simple messages and use ChatStream (basic tool support TBD)
	simpleMessages := make([]ChatMessage, len(messages))
	for i, msg := range messages {
		simpleMessages[i] = ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}
	return p.ChatStream(simpleMessages, model, onChunk)
}
