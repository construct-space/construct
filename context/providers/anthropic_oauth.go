package providers

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// oauthTokenExchangeClient is a shared HTTP client for OAuth token exchange/refresh operations.
var oauthTokenExchangeClient = NewHTTPClient(30 * time.Second)

// OpenCodeClientID is the registered client ID used by OpenCode
const OpenCodeClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

// LoadOpenCodeTokens loads OAuth tokens from OpenCode's auth.json file
// Returns access token, refresh token, expiry timestamp, and error
func LoadOpenCodeTokens() (accessToken, refreshToken string, expiresAt int64, err error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", "", 0, fmt.Errorf("failed to get home directory: %w", err)
	}

	authPath := filepath.Join(homeDir, ".local", "share", "opencode", "auth.json")
	data, err := os.ReadFile(authPath)
	if err != nil {
		return "", "", 0, fmt.Errorf("failed to read auth file: %w", err)
	}

	var opencodeAuth struct {
		Anthropic struct {
			Type    string `json:"type"`
			Access  string `json:"access"`
			Refresh string `json:"refresh"`
			Expires int64  `json:"expires"`
		} `json:"anthropic"`
	}

	if err := json.Unmarshal(data, &opencodeAuth); err != nil {
		return "", "", 0, fmt.Errorf("failed to parse auth file: %w", err)
	}

	if opencodeAuth.Anthropic.Type != "oauth" || opencodeAuth.Anthropic.Access == "" {
		return "", "", 0, fmt.Errorf("no OAuth token found in auth file")
	}

	return opencodeAuth.Anthropic.Access, opencodeAuth.Anthropic.Refresh, opencodeAuth.Anthropic.Expires, nil
}

// NewAnthropicOAuthProviderFromOpenCode creates a provider using OpenCode's stored tokens
func NewAnthropicOAuthProviderFromOpenCode() (*AnthropicOAuthProvider, error) {
	access, refresh, expires, err := LoadOpenCodeTokens()
	if err != nil {
		return nil, err
	}

	p := NewAnthropicOAuthProvider(access, refresh, &OAuthConfig{
		ClientID: OpenCodeClientID,
	})

	// Set proper expiry
	p.tokenExpiry = time.UnixMilli(expires)

	return p, nil
}

// AnthropicOAuthProvider implements the Provider interface using OAuth tokens
// This is EXPERIMENTAL - for testing user:inference scope from Claude OAuth
type AnthropicOAuthProvider struct {
	BaseProvider
	version        string
	accessToken    string
	refreshToken   string
	tokenExpiry    time.Time
	clientID       string
	clientSecret   string
	mu             sync.RWMutex
	oauthHTTPClient   *http.Client // shared client for non-streaming OAuth requests
	oauthStreamClient *http.Client // shared client for streaming OAuth requests
	oauthTokenClient  *http.Client // shared client for token exchange/refresh (short timeout)
}

// OAuthConfig holds OAuth configuration
type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
}

// NewAnthropicOAuthProvider creates a new OAuth-based Anthropic provider
func NewAnthropicOAuthProvider(accessToken, refreshToken string, config *OAuthConfig) *AnthropicOAuthProvider {
	p := &AnthropicOAuthProvider{
		BaseProvider: BaseProvider{
			name:    "Anthropic (OAuth)",
			key:     "anthropic-oauth",
			baseURL: "https://api.anthropic.com/v1",
			apiKey:  "", // Not used for OAuth
			models:  []string{"claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"},
		},
		version:           "2023-06-01",
		accessToken:       accessToken,
		refreshToken:      refreshToken,
		tokenExpiry:       time.Now().Add(time.Hour), // Default 1 hour, should be set from token response
		oauthHTTPClient:   NewHTTPClient(120 * time.Second),
		oauthStreamClient: NewStreamHTTPClient(),
		oauthTokenClient:  NewHTTPClient(30 * time.Second),
	}

	if config != nil {
		p.clientID = config.ClientID
		p.clientSecret = config.ClientSecret
	}

	return p
}

// SetTokens updates the OAuth tokens
func (p *AnthropicOAuthProvider) SetTokens(accessToken, refreshToken string, expiresIn int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.accessToken = accessToken
	p.refreshToken = refreshToken
	if expiresIn > 0 {
		p.tokenExpiry = time.Now().Add(time.Duration(expiresIn) * time.Second)
	}
}

// SetTokenExpiry sets the token expiry time directly
func (p *AnthropicOAuthProvider) SetTokenExpiry(expiresAt time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.tokenExpiry = expiresAt
}

// GetAccessToken returns the current access token, refreshing if needed
func (p *AnthropicOAuthProvider) GetAccessToken() (string, error) {
	p.mu.RLock()
	token := p.accessToken
	expiry := p.tokenExpiry
	p.mu.RUnlock()

	// If token is still valid, return it
	if time.Now().Before(expiry.Add(-5 * time.Minute)) {
		return token, nil
	}

	// Try to refresh
	if err := p.refreshAccessToken(); err != nil {
		return token, err // Return old token, might still work
	}

	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.accessToken, nil
}

// refreshAccessToken refreshes the OAuth access token
func (p *AnthropicOAuthProvider) refreshAccessToken() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.refreshToken == "" || p.clientID == "" {
		return fmt.Errorf("cannot refresh: missing refresh token or client credentials")
	}

	// Anthropic uses JSON format - matching OpenCode implementation
	reqBody := map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": p.refreshToken,
		"client_id":     p.clientID,
	}
	if p.clientSecret != "" {
		reqBody["client_secret"] = p.clientSecret
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "https://console.anthropic.com/v1/oauth/token", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.oauthTokenClient.Do(req)
	if err != nil {
		return fmt.Errorf("token refresh failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("token refresh failed: %d - %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return err
	}

	p.accessToken = tokenResp.AccessToken
	if tokenResp.RefreshToken != "" {
		p.refreshToken = tokenResp.RefreshToken
	}
	p.tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	return nil
}

// Chat sends a chat completion request using OAuth
func (p *AnthropicOAuthProvider) Chat(messages []ChatMessage, model string) (string, error) {
	if model == "" {
		model = p.models[0]
	}

	token, err := p.GetAccessToken()
	if err != nil {
		return "", fmt.Errorf("failed to get access token: %v", err)
	}

	// Convert messages to Anthropic format
	var systemPrompt string
	anthropicMessages := make([]AnthropicMessage, 0, len(messages))

	for _, msg := range messages {
		if msg.Role == "system" {
			systemPrompt = msg.GetContentString()
			continue
		}
		// Use convertToAnthropicContent to handle multimodal (image) messages properly
		anthropicMessages = append(anthropicMessages, AnthropicMessage{
			Role:    msg.Role,
			Content: convertToAnthropicContent(msg.Content),
		})
	}

	// Use OAuth-specific request with array system prompt format
	reqBody := AnthropicOAuthRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    BuildOAuthSystemPrompt(systemPrompt), // Array format: Claude Code header + user's system prompt
		Stream:    false,
		Metadata: map[string]any{
			"user_id": "claude-code",
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	// Add ?beta=true for OAuth endpoint
	req, err := http.NewRequest("POST", p.baseURL+"/messages?beta=true", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	// Headers matching OpenCode exactly (lowercase to match fetch behavior)
	req.Header = make(http.Header)
	req.Header["content-type"] = []string{"application/json"}
	req.Header["authorization"] = []string{"Bearer " + token}
	req.Header["anthropic-version"] = []string{"2023-06-01"}
	req.Header["anthropic-beta"] = []string{"oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219"}
	req.Header["user-agent"] = []string{"claude-cli/2.1.2 (external, cli)"}
	// Note: Do NOT set x-api-key or anthropic-dangerous-direct-browser-access for OAuth

	resp, err := p.oauthHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Anthropic OAuth API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Anthropic OAuth API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result AnthropicResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Content) == 0 {
		return "", fmt.Errorf("no response from Anthropic")
	}

	var content strings.Builder
	for _, block := range result.Content {
		if block.Type == "text" {
			content.WriteString(block.Text)
		}
	}

	return content.String(), nil
}

// ChatStream sends a streaming chat request using OAuth
func (p *AnthropicOAuthProvider) ChatStream(messages []ChatMessage, model string, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	token, err := p.GetAccessToken()
	if err != nil {
		return fmt.Errorf("failed to get access token: %v", err)
	}

	var systemPrompt string
	anthropicMessages := make([]AnthropicMessage, 0, len(messages))

	fmt.Fprintf(os.Stderr, "[OAuth DEBUG] Processing %d messages\n", len(messages))

	for i, msg := range messages {
		if msg.Role == "system" {
			systemPrompt = msg.GetContentString()
			fmt.Fprintf(os.Stderr, "[OAuth DEBUG] Message %d: system prompt (len=%d)\n", i, len(systemPrompt))
			continue
		}
		// Use convertToAnthropicContent to handle multimodal (image) messages properly
		content := convertToAnthropicContent(msg.Content)
		fmt.Fprintf(os.Stderr, "[OAuth DEBUG] Message %d: role=%s, content type=%T\n", i, msg.Role, content)

		// Skip empty string content (but allow empty assistant for prefilling)
		if strContent, ok := content.(string); ok && strContent == "" && msg.Role != "assistant" {
			fmt.Fprintf(os.Stderr, "[OAuth DEBUG] Message %d: skipping empty string content\n", i)
			continue
		}
		anthropicMessages = append(anthropicMessages, AnthropicMessage{
			Role:    msg.Role,
			Content: content,
		})
	}

	fmt.Fprintf(os.Stderr, "[OAuth DEBUG] Final anthropicMessages count: %d\n", len(anthropicMessages))

	// Use OAuth-specific request with array system prompt format
	reqBody := AnthropicOAuthRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    BuildOAuthSystemPrompt(systemPrompt), // Array format: Claude Code header + user's system prompt
		Stream:    true,
		Metadata: map[string]any{
			"user_id": "claude-code", // Identify as Claude Code client
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	// Add ?beta=true for OAuth endpoint
	url := p.baseURL + "/messages?beta=true"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	// Headers matching OpenCode exactly (lowercase to match fetch behavior)
	req.Header = make(http.Header)
	req.Header["content-type"] = []string{"application/json"}
	req.Header["authorization"] = []string{"Bearer " + token}
	req.Header["anthropic-version"] = []string{"2023-06-01"}
	req.Header["anthropic-beta"] = []string{"oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219"}
	req.Header["user-agent"] = []string{"claude-cli/2.1.2 (external, cli)"}
	// Note: Do NOT set x-api-key or anthropic-dangerous-direct-browser-access for OAuth

	resp, err := p.oauthStreamClient.Do(req)
	if err != nil {
		return fmt.Errorf("Anthropic OAuth API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		fmt.Printf("[OAuth DEBUG] Response Body: %s\n", string(respBody))
		return fmt.Errorf("Anthropic OAuth API error: %d - %s", resp.StatusCode, string(respBody))
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

// mcpToolPrefix is required for OAuth tokens - Anthropic requires this prefix
const mcpToolPrefix = "mcp_"

// ChatStreamWithTools sends a streaming chat with tools support using OAuth
// Note: OAuth tokens require tool names to be prefixed with "mcp_"
func (p *AnthropicOAuthProvider) ChatStreamWithTools(messages []ChatMessageWithTools, model string, tools []Tool, onChunk func(StreamChunk)) error {
	if model == "" {
		model = p.models[0]
	}

	token, err := p.GetAccessToken()
	if err != nil {
		return fmt.Errorf("failed to get access token: %v", err)
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
			// Add text content if present
			if text := msg.GetContentString(); text != "" {
				content = append(content, map[string]any{
					"type": "text",
					"text": text,
				})
			}
			// Add tool_use blocks
			for _, tc := range msg.ToolCalls {
				var input any
				if err := json.Unmarshal([]byte(tc.Function.Arguments), &input); err != nil {
					input = map[string]any{}
				}
				content = append(content, map[string]any{
					"type":  "tool_use",
					"id":    tc.ID,
					"name":  mcpToolPrefix + tc.Function.Name,
					"input": input,
				})
			}
			anthropicMessages = append(anthropicMessages, AnthropicMessage{
				Role:    "assistant",
				Content: content,
			})
			continue
		}

		// Tool result messages → group consecutive into a single user message with tool_result blocks
		if msg.Role == "tool" {
			toolResultBlocks := make([]map[string]any, 0)
			toolResultBlocks = append(toolResultBlocks, map[string]any{
				"type":        "tool_result",
				"tool_use_id": msg.ToolCallID,
				"content":     msg.GetContentString(),
			})
			// Collect any following consecutive tool messages
			for j := i + 1; j < len(messages) && messages[j].Role == "tool"; j++ {
				// These will be skipped in the outer loop via the peek-ahead
				toolResultBlocks = append(toolResultBlocks, map[string]any{
					"type":        "tool_result",
					"tool_use_id": messages[j].ToolCallID,
					"content":     messages[j].GetContentString(),
				})
			}
			// Only add if this is the first tool message in a consecutive group
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

	// Convert tools to Anthropic format with mcp_ prefix (required for OAuth)
	anthropicTools := make([]AnthropicTool, 0, len(tools))
	for _, tool := range tools {
		at := AnthropicTool{
			Name:        mcpToolPrefix + tool.Function.Name, // Add mcp_ prefix for OAuth
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

	// Use OAuth-specific request with array system prompt format
	reqBody := AnthropicOAuthToolsRequest{
		Model:     model,
		MaxTokens: 8192,
		Messages:  anthropicMessages,
		System:    BuildOAuthSystemPrompt(systemPrompt), // Array format: Claude Code header + user's system prompt
		Stream:    true,
		Tools:     anthropicTools,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	// Add ?beta=true for OAuth endpoint
	url := p.baseURL + "/messages?beta=true"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	// Headers matching OpenCode exactly (lowercase to match fetch behavior)
	req.Header = make(http.Header)
	req.Header["content-type"] = []string{"application/json"}
	req.Header["authorization"] = []string{"Bearer " + token}
	req.Header["anthropic-version"] = []string{"2023-06-01"}

	// Build beta features list — always include OAuth/thinking, conditionally add advanced tool use
	betaList := "oauth-2025-04-20,interleaved-thinking-2025-05-14,claude-code-20250219"
	for _, t := range tools {
		if len(t.Function.InputExamples) > 0 || t.DeferLoading || t.Strict {
			betaList += ",advanced-tool-use-2025-11-20"
			break
		}
	}
	req.Header["anthropic-beta"] = []string{betaList}
	req.Header["user-agent"] = []string{"claude-cli/2.1.2 (external, cli)"}

	resp, err := p.oauthStreamClient.Do(req)
	if err != nil {
		return fmt.Errorf("Anthropic OAuth API error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Anthropic OAuth API error: %d - %s", resp.StatusCode, string(respBody))
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
		if data == "[DONE]" {
			if len(toolCalls) > 0 {
				onChunk(StreamChunk{ToolCalls: toolCalls, Done: true, StopReason: stopReason})
			} else {
				onChunk(StreamChunk{Done: true, StopReason: stopReason})
			}
			return nil
		}

		var event map[string]any
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		eventType, _ := event["type"].(string)

		switch eventType {
		case "content_block_start":
			if contentBlock, ok := event["content_block"].(map[string]any); ok {
				if blockType, _ := contentBlock["type"].(string); blockType == "tool_use" {
					toolName := contentBlock["name"].(string)
					// Strip mcp_ prefix from response
					if after, ok0 := strings.CutPrefix(toolName, mcpToolPrefix); ok0 {
						toolName = after
					}
					currentToolCall = &ToolCall{
						ID:   contentBlock["id"].(string),
						Type: "function",
						Function: FunctionCall{
							Name:      toolName,
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

// ExchangeCodeForTokens exchanges an authorization code for tokens (with PKCE)
// Call this after user completes OAuth flow
// state is the state value from the callback URL (typically matches verifier)
// codeVerifier is the PKCE code_verifier used when generating the code_challenge
func ExchangeCodeForTokens(code, state, clientID, redirectURI, codeVerifier string) (accessToken, refreshToken string, expiresIn int, err error) {
	// Anthropic uses JSON format - matching OpenCode implementation exactly
	reqBody := map[string]string{
		"code":          code,
		"state":         state,
		"grant_type":    "authorization_code",
		"client_id":     clientID,
		"redirect_uri":  redirectURI,
		"code_verifier": codeVerifier,
	}

	body, _ := json.Marshal(reqBody)
	codePreview := code
	if len(codePreview) > 10 {
		codePreview = codePreview[:10]
	}
	statePreview := state
	if len(statePreview) > 10 {
		statePreview = statePreview[:10]
	}
	verifierPreview := codeVerifier
	if len(verifierPreview) > 10 {
		verifierPreview = verifierPreview[:10]
	}
	fmt.Fprintf(os.Stderr, "[ExchangeCodeForTokens] Sending request: code=%s..., state=%s..., verifier=%s...\n",
		codePreview, statePreview, verifierPreview)

	req, _ := http.NewRequest("POST", "https://console.anthropic.com/v1/oauth/token", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := oauthTokenExchangeClient.Do(req)
	if err != nil {
		return "", "", 0, fmt.Errorf("token exchange failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		fmt.Fprintf(os.Stderr, "[ExchangeCodeForTokens] Failed: %d - %s\n", resp.StatusCode, string(respBody))
		return "", "", 0, fmt.Errorf("token exchange failed: %d - %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		TokenType    string `json:"token_type"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", 0, err
	}

	fmt.Fprintf(os.Stderr, "[ExchangeCodeForTokens] Success, expiresIn: %d\n", tokenResp.ExpiresIn)
	return tokenResp.AccessToken, tokenResp.RefreshToken, tokenResp.ExpiresIn, nil
}

// RefreshOAuthToken refreshes an OAuth access token using a refresh token
func RefreshOAuthToken(refreshToken, clientID string) (accessToken, newRefreshToken string, expiresIn int, err error) {
	// Anthropic uses JSON format - matching OpenCode implementation
	reqBody := map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
		"client_id":     clientID,
	}

	body, _ := json.Marshal(reqBody)
	fmt.Fprintf(os.Stderr, "[RefreshOAuthToken] Sending refresh request for client_id: %s\n", clientID)

	req, _ := http.NewRequest("POST", "https://console.anthropic.com/v1/oauth/token", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := oauthTokenExchangeClient.Do(req)
	if err != nil {
		return "", "", 0, fmt.Errorf("token refresh failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		fmt.Fprintf(os.Stderr, "[RefreshOAuthToken] Failed: %d - %s\n", resp.StatusCode, string(respBody))
		return "", "", 0, fmt.Errorf("token refresh failed: %d - %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", 0, err
	}

	fmt.Fprintf(os.Stderr, "[RefreshOAuthToken] Success, new token expires in %d seconds\n", tokenResp.ExpiresIn)
	return tokenResp.AccessToken, tokenResp.RefreshToken, tokenResp.ExpiresIn, nil
}

// ExchangeOAuthCodeForTokensGeneric exchanges OAuth authorization code for tokens using form-encoded payload.
func ExchangeOAuthCodeForTokensGeneric(code, state, clientID, clientSecret, redirectURI, codeVerifier, tokenURL string) (accessToken, refreshToken string, expiresIn int, err error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("client_id", clientID)
	form.Set("redirect_uri", redirectURI)
	form.Set("code_verifier", codeVerifier)
	if state != "" {
		form.Set("state", state)
	}
	if clientSecret != "" {
		form.Set("client_secret", clientSecret)
	}

	req, _ := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := oauthTokenExchangeClient.Do(req)
	if err != nil {
		return "", "", 0, fmt.Errorf("token exchange failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", "", 0, fmt.Errorf("token exchange failed: %d - %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", 0, err
	}

	return tokenResp.AccessToken, tokenResp.RefreshToken, tokenResp.ExpiresIn, nil
}

// RefreshOAuthTokenGeneric refreshes OAuth tokens using form-encoded payload.
func RefreshOAuthTokenGeneric(refreshToken, clientID, clientSecret, tokenURL string) (accessToken, newRefreshToken string, expiresIn int, err error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", clientID)
	if clientSecret != "" {
		form.Set("client_secret", clientSecret)
	}

	req, _ := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := oauthTokenExchangeClient.Do(req)
	if err != nil {
		return "", "", 0, fmt.Errorf("token refresh failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", "", 0, fmt.Errorf("token refresh failed: %d - %s", resp.StatusCode, string(respBody))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", "", 0, err
	}

	return tokenResp.AccessToken, tokenResp.RefreshToken, tokenResp.ExpiresIn, nil
}

// PKCE holds the code verifier and challenge for OAuth PKCE flow
type PKCE struct {
	Verifier  string
	Challenge string
}

// GeneratePKCE generates a PKCE code verifier and challenge
func GeneratePKCE() (*PKCE, error) {
	// Generate 32 random bytes for verifier
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %v", err)
	}

	// Base64url encode (no padding)
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	// Create challenge: SHA256 hash, then base64url encode
	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])

	return &PKCE{
		Verifier:  verifier,
		Challenge: challenge,
	}, nil
}

// GetAuthorizationURL returns the OAuth authorization URL with PKCE
// Note: OpenCode uses the verifier as the state parameter
func GetAuthorizationURL(clientID, redirectURI string, pkce *PKCE) string {
	return fmt.Sprintf(
		"https://claude.ai/oauth/authorize?code=true&client_id=%s&response_type=code&redirect_uri=%s&scope=%s&code_challenge=%s&code_challenge_method=S256&state=%s",
		clientID,
		redirectURI,
		"org:create_api_key+user:profile+user:inference",
		pkce.Challenge,
		pkce.Verifier, // OpenCode uses verifier as state
	)
}
