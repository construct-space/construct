package svc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// codestralAPIKey is the Codestral API key for fast code completions
const codestralAPIKey = "ykbBi3PVBmBEtWrIeYnf7wSQDp8XJrVi"

// CodestralFIMRequest represents a Fill-in-Middle completion request
type CodestralFIMRequest struct {
	Model       string   `json:"model"`
	Prompt      string   `json:"prompt"`
	Suffix      string   `json:"suffix"`
	MaxTokens   int      `json:"max_tokens"`
	Temperature float64  `json:"temperature"`
	TopP        float64  `json:"top_p"`
	Stop        []string `json:"stop"`
}

// CodestralFIMResponse represents the API response
type CodestralFIMResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// CallCodestral calls Mistral's Codestral FIM API for fast code completions
func (s *Service) CallCodestral(textBefore, textAfter, language, filename string) (string, error) {
	// Build a language context prefix to help Codestral understand the file type
	// Use language-appropriate comment syntax
	prompt := textBefore

	if filename != "" || language != "" {
		// Determine comment style based on language
		var commentStart, commentEnd string
		switch language {
		case "css", "scss", "less":
			commentStart, commentEnd = "/* ", " */"
		case "html", "xml", "vue", "svelte":
			commentStart, commentEnd = "<!-- ", " -->"
		case "python", "ruby", "shell", "bash", "yaml", "toml":
			commentStart, commentEnd = "# ", ""
		case "sql":
			commentStart, commentEnd = "-- ", ""
		default:
			// JavaScript, TypeScript, Go, Rust, C, C++, Java, etc.
			commentStart, commentEnd = "// ", ""
		}

		// Build the hint
		hint := ""
		if filename != "" {
			hint = fmt.Sprintf("%sFile: %s%s\n", commentStart, filename, commentEnd)
		} else if language != "" {
			hint = fmt.Sprintf("%sLanguage: %s%s\n", commentStart, language, commentEnd)
		}

		// Only prepend if not already present
		if hint != "" && !strings.Contains(textBefore[:min(len(textBefore), 100)], "File:") {
			prompt = hint + textBefore
		}
	}

	reqBody := CodestralFIMRequest{
		Model:       "codestral-latest",
		Prompt:      prompt,
		Suffix:      textAfter,
		MaxTokens:   128,
		Temperature: 0.2,
		TopP:        1.0,
		Stop:        []string{"\n\n"},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.mistral.ai/v1/fim/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+codestralAPIKey)

	resp, err := SharedShortHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("codestral API error: %s - %s", resp.Status, string(body))
	}

	var result CodestralFIMResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", nil
	}

	completion := result.Choices[0].Message.Content
	return strings.TrimSpace(completion), nil
}
