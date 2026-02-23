package handlers

import (
	"fmt"
	"os"
	"strings"
	"time"

	"construct-context/providers"
	"construct-context/svc"
)

// detectImagesInMessages checks if any message contains image content.
// Consolidates both HasImages() and manual image_url part scanning.
func detectImagesInMessages(messages []providers.ChatMessage) bool {
	for _, msg := range messages {
		if msg.HasImages() {
			return true
		}
		if msg.Role != "user" {
			continue
		}
		if arr, ok := msg.Content.([]any); ok {
			for _, item := range arr {
				if part, ok := item.(map[string]any); ok {
					if pt, _ := part["type"].(string); pt == "image_url" {
						return true
					}
				}
			}
		}
	}
	return false
}

// resolveAgentFromSpace maps a space name to a default agent ID.
func resolveAgentFromSpace(space string) string {
	switch space {
	case "design", "ui":
		return "design"
	case "code", "terminal":
		return "code-assistant"
	case "kanban":
		return "kanban"
	case "calendar":
		return "calendar"
	case "git":
		return "git"
	case "docs", "notes":
		return "docs"
	case "architect":
		return "planner"
	case "ai", "chat":
		return "conductor"
	default:
		return ""
	}
}

// resolveStreamProvider determines the correct provider for the given model.
// Handles Claude OAuth (with token refresh), OpenAI OAuth, and registry fallback.
// Returns the provider, adjusted model name (prefix stripped), and error.
func resolveStreamProvider(s *svc.Service, model, token string) (providers.Provider, string, error) {
	isClaudeModel := strings.HasPrefix(model, "claude-") || strings.HasPrefix(model, "anthropic-oauth:")
	if isClaudeModel {
		if after, ok := strings.CutPrefix(model, "anthropic-oauth:"); ok {
			model = after
		}
		if strings.HasPrefix(token, "sk-ant-oat") {
			provider := providers.NewAnthropicOAuthProvider(token, "", &providers.OAuthConfig{
				ClientID: providers.OpenCodeClientID,
			})
			fmt.Fprintf(os.Stderr, "[context] Using provided OAuth token for model %s\n", model)
			return provider, model, nil
		}
		if s.Storage != nil {
			accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
			if err == nil && accessToken != nil && accessToken.Token != "" {
				refreshToken, _ := s.Storage.GetAuthToken("anthropic_oauth_refresh")
				refreshStr := ""
				if refreshToken != nil {
					refreshStr = refreshToken.Token
				}

				if accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now()) {
					fmt.Fprintf(os.Stderr, "[context] Stored OAuth token expired, attempting refresh\n")
					if refreshStr != "" {
						newAccess, newRefresh, expiresIn, refreshErr := providers.RefreshOAuthToken(refreshStr, providers.OpenCodeClientID)
						if refreshErr == nil && newAccess != "" {
							fmt.Fprintf(os.Stderr, "[context] Token refreshed successfully, expires in %d seconds\n", expiresIn)
							expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
							s.Storage.SaveAuthToken("anthropic_oauth_access", newAccess, "", "", &expiresAt)
							if newRefresh != "" {
								s.Storage.SaveAuthToken("anthropic_oauth_refresh", newRefresh, "", "", nil)
								refreshStr = newRefresh
							}
							accessToken.Token = newAccess
							accessToken.ExpiresAt = &expiresAt
						} else {
							fmt.Fprintf(os.Stderr, "[context] Token refresh failed: %v\n", refreshErr)
							return nil, model, fmt.Errorf("Claude MAX session expired. Please reconnect Claude MAX in Settings > AI.")
						}
					} else {
						fmt.Fprintf(os.Stderr, "[context] No refresh token available, cannot refresh expired token\n")
						return nil, model, fmt.Errorf("Claude MAX session expired and no refresh token available. Please reconnect Claude MAX in Settings > AI.")
					}
				}

				oauthProv := providers.NewAnthropicOAuthProvider(accessToken.Token, refreshStr, &providers.OAuthConfig{
					ClientID: providers.OpenCodeClientID,
				})
				if accessToken.ExpiresAt != nil {
					oauthProv.SetTokenExpiry(*accessToken.ExpiresAt)
				}
				fmt.Fprintf(os.Stderr, "[context] Using stored OAuth token for model %s (expires: %v)\n", model, accessToken.ExpiresAt)
				return oauthProv, model, nil
			}
			fmt.Fprintf(os.Stderr, "[context] No stored OAuth token available: %v\n", err)
			return nil, model, fmt.Errorf("Claude MAX not connected. Please connect Claude MAX in Settings > AI to use Claude models.")
		}
	}

	isOpenAIModel := strings.HasPrefix(model, "openai-oauth:") || providers.ExtractModelName(model) == svc.OpenAIOAuthModelID
	if isOpenAIModel {
		if after, ok := strings.CutPrefix(model, "openai-oauth:"); ok {
			model = after
		}
		openAIProvider, openAIErr := s.GetOpenAIOAuthProvider()
		if openAIErr != nil {
			return nil, model, fmt.Errorf("OpenAI OAuth not connected. Please connect OpenAI in Settings > AI to use OpenAI OAuth models.")
		}
		return openAIProvider, model, nil
	}

	// Fallback to provider registry
	provider, _ := s.Providers.GetProviderForModel(model)
	if provider == nil {
		return nil, model, fmt.Errorf("no provider found for model: %s", model)
	}
	return provider, model, nil
}
