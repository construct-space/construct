package svc

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	neturl "net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"construct-context/providers"
)

// OpenAIOAuthModelID is the model ID used for OpenAI OAuth connections.
const OpenAIOAuthModelID = "gpt-5.3-codex"

// BuildOpenAIAuthorizeURL constructs the OpenAI OAuth authorization URL.
func BuildOpenAIAuthorizeURL(cfg OpenAIOAuthConfig, state, challenge string) (string, error) {
	u, err := neturl.Parse(cfg.AuthorizeURL)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", cfg.ClientID)
	q.Set("redirect_uri", cfg.RedirectURI)
	q.Set("scope", cfg.Scope)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("state", state)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// CodexOpenAICredential holds OpenAI credentials loaded from Codex auth file.
type CodexOpenAICredential struct {
	AccessToken  string
	RefreshToken string
	AccountID    string
	Mode         string // "chatgpt" or "api"
}

// LoadCodexOpenAICredential loads OpenAI credentials from ~/.codex/auth.json.
func LoadCodexOpenAICredential() (*CodexOpenAICredential, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	authPath := filepath.Join(homeDir, ".codex", "auth.json")
	data, err := os.ReadFile(authPath)
	if err != nil {
		return nil, err
	}

	var payload struct {
		AuthMode     string `json:"auth_mode"`
		OpenAIAPIKey string `json:"OPENAI_API_KEY"`
		Tokens       struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			AccountID    string `json:"account_id"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}

	mode := strings.ToLower(strings.TrimSpace(payload.AuthMode))
	apiKey := strings.TrimSpace(payload.OpenAIAPIKey)
	accessToken := strings.TrimSpace(payload.Tokens.AccessToken)
	refreshToken := strings.TrimSpace(payload.Tokens.RefreshToken)
	accountID := strings.TrimSpace(payload.Tokens.AccountID)

	if mode == "api" && apiKey != "" {
		return &CodexOpenAICredential{
			AccessToken: apiKey,
			Mode:        "api",
		}, nil
	}

	if accessToken == "" && apiKey == "" {
		return nil, fmt.Errorf("codex auth file has no usable openai credential")
	}

	if accessToken != "" {
		if accountID == "" {
			accountID = ExtractChatGPTAccountIDFromJWT(accessToken)
		}
		return &CodexOpenAICredential{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			AccountID:    accountID,
			Mode:         "chatgpt",
		}, nil
	}

	return &CodexOpenAICredential{
		AccessToken: apiKey,
		Mode:        "api",
	}, nil
}

// ExtractChatGPTAccountIDFromJWT extracts the ChatGPT account ID from a JWT token.
func ExtractChatGPTAccountIDFromJWT(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}

	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}

	var claims struct {
		ChatGPTAccountID string `json:"chatgpt_account_id"`
		APIAuth          struct {
			ChatGPTAccountID string `json:"chatgpt_account_id"`
		} `json:"https://api.openai.com/auth"`
	}
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return ""
	}

	if strings.TrimSpace(claims.ChatGPTAccountID) != "" {
		return strings.TrimSpace(claims.ChatGPTAccountID)
	}
	return strings.TrimSpace(claims.APIAuth.ChatGPTAccountID)
}

// IsLikelyOpenAIAPIKey checks if the token looks like an OpenAI API key.
func IsLikelyOpenAIAPIKey(token string) bool {
	return strings.HasPrefix(strings.TrimSpace(token), "sk-")
}

// BootstrapOpenAIFromCodexAuth attempts to load OpenAI OAuth tokens from Codex.
func (s *Service) BootstrapOpenAIFromCodexAuth() bool {
	if s.Storage == nil {
		return false
	}
	credential, err := LoadCodexOpenAICredential()
	if err != nil || credential == nil || credential.AccessToken == "" {
		return false
	}
	if saveErr := s.Storage.SaveAuthToken("openai_oauth_access", credential.AccessToken, credential.AccountID, "", nil); saveErr != nil {
		return false
	}
	if credential.RefreshToken != "" {
		_ = s.Storage.SaveAuthToken("openai_oauth_refresh", credential.RefreshToken, "", "", nil)
	}
	if strings.TrimSpace(credential.Mode) != "" {
		_ = s.Storage.SetSetting("openai_oauth_mode", credential.Mode)
	}
	return true
}

// GetOpenAIOAuthProvider returns an OpenAI OAuth provider using stored tokens.
func (s *Service) GetOpenAIOAuthProvider() (providers.Provider, error) {
	if s.Storage == nil {
		return nil, fmt.Errorf("storage not available")
	}

	accessToken, err := s.Storage.GetAuthToken("openai_oauth_access")
	if err != nil || accessToken == nil || accessToken.Token == "" {
		if !s.BootstrapOpenAIFromCodexAuth() {
			return nil, fmt.Errorf("OpenAI OAuth not connected")
		}
		accessToken, err = s.Storage.GetAuthToken("openai_oauth_access")
		if err != nil || accessToken == nil || accessToken.Token == "" {
			return nil, fmt.Errorf("OpenAI OAuth not connected")
		}
	}

	cfg := GetOpenAIOAuthConfig()
	needsRefresh := accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now())
	if needsRefresh {
		refreshTokenEntry, _ := s.Storage.GetAuthToken("openai_oauth_refresh")
		if refreshTokenEntry == nil || refreshTokenEntry.Token == "" {
			s.Storage.DeleteAuthToken("openai_oauth_access")
			s.Storage.DeleteAuthToken("openai_oauth_refresh")
			return nil, fmt.Errorf("OpenAI OAuth token expired and no refresh token is available")
		}
		if cfg.ClientID == "" || cfg.TokenURL == "" {
			return nil, fmt.Errorf("OpenAI OAuth refresh is not configured (missing OPENAI_OAUTH_CLIENT_ID or OPENAI_OAUTH_TOKEN_URL)")
		}

		newAccess, newRefresh, expiresIn, refreshErr := providers.RefreshOAuthTokenGeneric(
			refreshTokenEntry.Token,
			cfg.ClientID,
			cfg.ClientSecret,
			cfg.TokenURL,
		)
		if refreshErr != nil {
			s.Storage.DeleteAuthToken("openai_oauth_access")
			s.Storage.DeleteAuthToken("openai_oauth_refresh")
			return nil, fmt.Errorf("OpenAI OAuth token refresh failed: %w", refreshErr)
		}

		expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
		accountID := strings.TrimSpace(accessToken.UserID)
		if accountID == "" {
			accountID = ExtractChatGPTAccountIDFromJWT(newAccess)
		}
		_ = s.Storage.SaveAuthToken("openai_oauth_access", newAccess, accountID, "", &expiresAt)
		if newRefresh != "" {
			_ = s.Storage.SaveAuthToken("openai_oauth_refresh", newRefresh, "", "", nil)
		}
		_ = s.Storage.SetSetting("openai_oauth_mode", "chatgpt")
		accessToken.Token = newAccess
		accessToken.UserID = accountID
	}

	authMode, _ := s.Storage.GetSetting("openai_oauth_mode")
	if strings.TrimSpace(authMode) == "" {
		if IsLikelyOpenAIAPIKey(accessToken.Token) {
			authMode = "api"
		} else {
			authMode = "chatgpt"
		}
	}

	accountID := strings.TrimSpace(accessToken.UserID)
	if accountID == "" {
		accountID = ExtractChatGPTAccountIDFromJWT(accessToken.Token)
	}

	// ChatGPT OAuth tokens must use the Codex backend endpoint (chatgpt.com),
	// while API-key mode continues to use the OpenAI API endpoint.
	if strings.EqualFold(authMode, "chatgpt") && !IsLikelyOpenAIAPIKey(accessToken.Token) {
		return providers.NewOpenAICodexOAuthProvider(accessToken.Token, accountID, []string{OpenAIOAuthModelID}), nil
	}
	return providers.NewOpenAIOAuthProvider(accessToken.Token, []string{OpenAIOAuthModelID}), nil
}

// GetAnthropicOAuthProvider returns a Claude MAX OAuth provider using stored tokens.
func (s *Service) GetAnthropicOAuthProvider() (providers.Provider, error) {
	if s.Storage == nil {
		return nil, fmt.Errorf("storage not available")
	}

	accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
	if err != nil || accessToken == nil || accessToken.Token == "" {
		return nil, fmt.Errorf("Claude MAX not connected. Please connect Claude MAX in Settings > AI")
	}

	refreshTokenEntry, _ := s.Storage.GetAuthToken("anthropic_oauth_refresh")
	refreshToken := ""
	if refreshTokenEntry != nil {
		refreshToken = refreshTokenEntry.Token
	}

	if accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now()) {
		if refreshToken == "" {
			s.Storage.DeleteAuthToken("anthropic_oauth_access")
			s.Storage.DeleteAuthToken("anthropic_oauth_refresh")
			return nil, fmt.Errorf("Claude MAX session expired and no refresh token available. Please reconnect Claude MAX in Settings > AI")
		}

		newAccess, newRefresh, expiresIn, refreshErr := providers.RefreshOAuthToken(refreshToken, providers.OpenCodeClientID)
		if refreshErr != nil || newAccess == "" {
			s.Storage.DeleteAuthToken("anthropic_oauth_access")
			s.Storage.DeleteAuthToken("anthropic_oauth_refresh")
			return nil, fmt.Errorf("Claude MAX session expired. Please reconnect Claude MAX in Settings > AI")
		}

		expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
		_ = s.Storage.SaveAuthToken("anthropic_oauth_access", newAccess, "", "", &expiresAt)
		if newRefresh != "" {
			_ = s.Storage.SaveAuthToken("anthropic_oauth_refresh", newRefresh, "", "", nil)
			refreshToken = newRefresh
		}
		accessToken.Token = newAccess
		accessToken.ExpiresAt = &expiresAt
	}

	oauthProv := providers.NewAnthropicOAuthProvider(accessToken.Token, refreshToken, &providers.OAuthConfig{
		ClientID: providers.OpenCodeClientID,
	})
	if accessToken.ExpiresAt != nil {
		oauthProv.SetTokenExpiry(*accessToken.ExpiresAt)
	}
	return oauthProv, nil
}
