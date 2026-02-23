package zai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Server is the Z.AI MCP server implementation
type Server struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

// NewServer creates a new Z.AI MCP server
func NewServer(apiKey string) *Server {
	return &Server{
		apiKey:  apiKey,
		baseURL: "https://api.z.ai/api/paas/v4",
		client:  &http.Client{Timeout: 300 * time.Second},
	}
}

// Tool represents an MCP tool definition
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// GetTools returns all available Z.AI tools
func (s *Server) GetTools() []Tool {
	return []Tool{
		{
			Name:        "zai_chat",
			Description: "Send a chat completion request to Z.AI",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"model": map[string]interface{}{
						"type":        "string",
						"description": "Model ID (glm-4.7, glm-4.6, glm-4.6v, glm-4.5, etc.)",
						"default":     "glm-4.7",
					},
					"prompt": map[string]interface{}{
						"type":        "string",
						"description": "The user prompt",
					},
					"system": map[string]interface{}{
						"type":        "string",
						"description": "System prompt (optional)",
					},
				},
				"required": []string{"prompt"},
			},
		},
		{
			Name:        "zai_vision",
			Description: "Analyze an image using Z.AI vision models",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"image_url": map[string]interface{}{
						"type":        "string",
						"description": "Image URL or base64 data URL",
					},
					"prompt": map[string]interface{}{
						"type":        "string",
						"description": "Question about the image",
					},
					"model": map[string]interface{}{
						"type":        "string",
						"description": "Vision model (glm-4.6v or glm-4.6v-flash)",
						"default":     "glm-4.6v-flash",
					},
				},
				"required": []string{"image_url", "prompt"},
			},
		},
		{
			Name:        "zai_web_search",
			Description: "Search the web using Z.AI search engine",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search query",
					},
					"count": map[string]interface{}{
						"type":        "integer",
						"description": "Number of results (1-50)",
						"default":     10,
					},
					"recency": map[string]interface{}{
						"type":        "string",
						"description": "Time filter: oneDay, oneWeek, oneMonth, oneYear, noLimit",
						"default":     "noLimit",
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "zai_image_generate",
			Description: "Generate an image from a text prompt",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"prompt": map[string]interface{}{
						"type":        "string",
						"description": "Image description",
					},
					"size": map[string]interface{}{
						"type":        "string",
						"description": "Image size (1024x1024, 1280x720, 720x1280)",
						"default":     "1024x1024",
					},
					"quality": map[string]interface{}{
						"type":        "string",
						"description": "Quality: standard or hd",
						"default":     "standard",
					},
				},
				"required": []string{"prompt"},
			},
		},
	}
}

// CallTool executes a tool and returns the result
func (s *Server) CallTool(name string, args map[string]interface{}) (string, error) {
	switch name {
	case "zai_chat":
		return s.chat(args)
	case "zai_vision":
		return s.vision(args)
	case "zai_web_search":
		return s.webSearch(args)
	case "zai_image_generate":
		return s.imageGenerate(args)
	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}

func (s *Server) chat(args map[string]interface{}) (string, error) {
	model, _ := args["model"].(string)
	if model == "" {
		model = "glm-4.7"
	}
	prompt, _ := args["prompt"].(string)
	system, _ := args["system"].(string)

	messages := []map[string]interface{}{}
	if system != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": system,
		})
	}
	messages = append(messages, map[string]interface{}{
		"role":    "user",
		"content": prompt,
	})

	reqBody := map[string]interface{}{
		"model":    model,
		"messages": messages,
	}

	return s.doRequest("/chat/completions", reqBody)
}

func (s *Server) vision(args map[string]interface{}) (string, error) {
	model, _ := args["model"].(string)
	if model == "" {
		model = "glm-4.6v-flash"
	}
	imageURL, _ := args["image_url"].(string)
	prompt, _ := args["prompt"].(string)

	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type": "image_url",
						"image_url": map[string]interface{}{
							"url": imageURL,
						},
					},
					{
						"type": "text",
						"text": prompt,
					},
				},
			},
		},
	}

	return s.doRequest("/chat/completions", reqBody)
}

func (s *Server) webSearch(args map[string]interface{}) (string, error) {
	query, _ := args["query"].(string)
	count := 10
	if c, ok := args["count"].(float64); ok {
		count = int(c)
	}
	recency, _ := args["recency"].(string)
	if recency == "" {
		recency = "noLimit"
	}

	reqBody := map[string]interface{}{
		"search_engine":         "search-prime",
		"search_query":          query,
		"count":                 count,
		"search_recency_filter": recency,
	}

	return s.doRequest("/web_search", reqBody)
}

func (s *Server) imageGenerate(args map[string]interface{}) (string, error) {
	prompt, _ := args["prompt"].(string)
	size, _ := args["size"].(string)
	if size == "" {
		size = "1024x1024"
	}
	quality, _ := args["quality"].(string)
	if quality == "" {
		quality = "standard"
	}

	reqBody := map[string]interface{}{
		"model":   "cogview-4-250304",
		"prompt":  prompt,
		"size":    size,
		"quality": quality,
	}

	return s.doRequest("/images/generations", reqBody)
}

func (s *Server) doRequest(endpoint string, body map[string]interface{}) (string, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", s.baseURL+endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Accept-Language", "en-US,en")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Z.AI API error %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse response to extract content
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return string(respBody), nil
	}

	// For chat completions, extract the message content
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := msg["content"].(string); ok {
					return content, nil
				}
			}
		}
	}

	// For search results
	if searchResults, ok := result["search_result"]; ok {
		formatted, _ := json.MarshalIndent(searchResults, "", "  ")
		return string(formatted), nil
	}

	// For image generation
	if data, ok := result["data"].([]interface{}); ok && len(data) > 0 {
		if item, ok := data[0].(map[string]interface{}); ok {
			if url, ok := item["url"].(string); ok {
				return url, nil
			}
		}
	}

	return string(respBody), nil
}
