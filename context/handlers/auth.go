package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"construct-context/providers"
	"construct-context/svc"
)

// HandleAuth handles auth.*, user.*, and settings.* requests.
func HandleAuth(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "auth.set_token":
		var payload struct {
			Token string `json:"token"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.APIToken = payload.Token
		s.Mu.Unlock()
		return svc.Response{ID: req.ID, Success: true}

	case "auth.sync_token":
		var payload struct {
			Token    string `json:"token"`
			UserID   string `json:"userId"`
			UserJSON string `json:"userJson"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage != nil {
			if err := s.Storage.SaveAuthToken("construct_api", payload.Token, payload.UserID, payload.UserJSON, nil); err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("failed to save token: %v", err)}
			}

			if payload.UserJSON != "" {
				var userData map[string]interface{}
				if err := json.Unmarshal([]byte(payload.UserJSON), &userData); err == nil {
					userID := 0
					companyID := 0
					if uid, ok := userData["id"].(float64); ok {
						userID = int(uid)
					}
					if cid, ok := userData["company_id"].(float64); ok {
						companyID = int(cid)
					}
					s.Storage.SetUserContext(userID, companyID, payload.UserJSON, "")
				}
			}

			if err := s.RestorePersistedSkillState(context.Background()); err != nil {
				fmt.Fprintf(os.Stderr, "[skills] restore after auth sync warning: %v\n", err)
			}
		}
		s.Mu.Lock()
		s.APIToken = payload.Token
		s.Mu.Unlock()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"synced": true,
		}}

	case "auth.get_stored_token":
		var payload struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			payload.Key = "construct_api"
		}
		if payload.Key == "" {
			payload.Key = "construct_api"
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		token, err := s.Storage.GetAuthToken(payload.Key)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("token not found: %v", err)}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"token":    token.Token,
			"userId":   token.UserID,
			"userJson": token.UserJSON,
		}}

	case "auth.clear_tokens":
		if s.Storage != nil {
			s.Storage.ClearAllAuthTokens()
			s.Storage.ClearUserContext()
		}
		s.Mu.Lock()
		s.APIToken = ""
		s.Mu.Unlock()
		return svc.Response{ID: req.ID, Success: true}

	case "auth.save_state":
		var payload struct {
			State string `json:"state"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage != nil {
			if err := s.Storage.KVSet("auth_state", payload.State, "auth", nil, nil); err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
			}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "auth.get_state":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"state": nil}}
		}
		entry, err := s.Storage.KVGet("auth_state")
		if err != nil || entry == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"state": nil}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"state": entry.Value}}

	case "auth.clear_state":
		if s.Storage != nil {
			s.Storage.KVDelete("auth_state")
			s.Storage.ClearUserContext()
		}
		return svc.Response{ID: req.ID, Success: true}

	case "user.set_current":
		var payload struct {
			UserID   uint   `json:"userId"`
			UserJSON string `json:"userJson"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage != nil {
			if err := s.Storage.SetCurrentUser(payload.UserID, payload.UserJSON); err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
			}
			if err := s.RestorePersistedSkillState(context.Background()); err != nil {
				fmt.Fprintf(os.Stderr, "[skills] restore after user switch warning: %v\n", err)
			}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"userId": payload.UserID,
		}}

	case "user.get_current":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		userID, userJSON, err := s.Storage.GetCurrentUser()
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"userId":   userID,
			"userJson": userJSON,
		}}

	case "settings.get":
		var payload struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		value, err := s.Storage.GetSetting(payload.Key)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"key":   payload.Key,
			"value": value,
		}}

	case "settings.set":
		var payload struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.SetSetting(payload.Key, payload.Value); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if payload.Key == "matrix_mode" {
			s.Mu.Lock()
			s.MatrixMode = payload.Value == "true"
			s.Mu.Unlock()
		}
		if payload.Key == "dev_mode" {
			s.Mu.Lock()
			s.DevMode = payload.Value == "true"
			s.Mu.Unlock()
			fmt.Fprintf(os.Stderr, "[context] Dev mode: %s\n", payload.Value)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"key":   payload.Key,
			"value": payload.Value,
		}}

	case "auth.set_api_base":
		var payload struct {
			BaseURL string `json:"baseUrl"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.APIBaseURL = payload.BaseURL
		s.Mu.Unlock()
		return svc.Response{ID: req.ID, Success: true}

	case "auth.anthropic.status":
		fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Request received\n")
		if s.Storage == nil {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.status] ERROR: storage not available\n")
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": false,
				"error":         "storage not available",
			}}
		}
		accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
		if err != nil || accessToken == nil || accessToken.Token == "" {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.status] No access token found: %v\n", err)
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": false,
			}}
		}
		fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Found access token, expires_at: %v, now: %v\n", accessToken.ExpiresAt, time.Now())
		if accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now()) {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Token expired, attempting refresh\n")
			refreshTokenEntry, _ := s.Storage.GetAuthToken("anthropic_oauth_refresh")
			if refreshTokenEntry == nil || refreshTokenEntry.Token == "" {
				fmt.Fprintf(os.Stderr, "[auth.anthropic.status] No refresh token available\n")
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": false,
					"error":         "Token expired and no refresh token available",
				}}
			}
			fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Calling RefreshOAuthToken...\n")
			newAccess, newRefresh, expiresIn, err := providers.RefreshOAuthToken(refreshTokenEntry.Token, providers.OpenCodeClientID)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Refresh FAILED: %v\n", err)
				s.Storage.DeleteAuthToken("anthropic_oauth_access")
				s.Storage.DeleteAuthToken("anthropic_oauth_refresh")
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": false,
					"error":         "Token refresh failed: " + err.Error(),
				}}
			}
			fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Refresh SUCCESS, expiresIn: %d\n", expiresIn)
			expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
			s.Storage.SaveAuthToken("anthropic_oauth_access", newAccess, "", "", &expiresAt)
			if newRefresh != "" {
				s.Storage.SaveAuthToken("anthropic_oauth_refresh", newRefresh, "", "", nil)
			}
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": true,
				"expires_at":    expiresAt.UnixMilli(),
				"source":        "context.db",
			}}
		}
		var expiresAtMs int64
		if accessToken.ExpiresAt != nil {
			expiresAtMs = accessToken.ExpiresAt.UnixMilli()
		}
		fmt.Fprintf(os.Stderr, "[auth.anthropic.status] Token valid, authenticated: true\n")
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": true,
			"expires_at":    expiresAtMs,
			"source":        "context.db",
		}}

	case "auth.anthropic.exchange":
		fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] Request received\n")
		if s.Storage == nil {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] ERROR: storage not available\n")
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		var payload struct {
			Code     string `json:"code"`
			State    string `json:"state"`
			Verifier string `json:"verifier"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] ERROR: invalid payload: %v\n", err)
			return svc.Response{ID: req.ID, Success: false, Error: "invalid payload: " + err.Error()}
		}
		fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] Code length: %d, State length: %d, Verifier length: %d\n", len(payload.Code), len(payload.State), len(payload.Verifier))
		if payload.Code == "" || payload.Verifier == "" {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] ERROR: code or verifier empty\n")
			return svc.Response{ID: req.ID, Success: false, Error: "code and verifier are required"}
		}
		state := payload.State
		if state == "" {
			state = payload.Verifier
		}
		redirectURI := "https://console.anthropic.com/oauth/code/callback"
		fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] Calling ExchangeCodeForTokens...\n")
		accessTokenStr, refreshToken, expiresIn, err := providers.ExchangeCodeForTokens(
			payload.Code,
			state,
			providers.OpenCodeClientID,
			redirectURI,
			payload.Verifier,
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] ERROR: token exchange failed: %v\n", err)
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		fmt.Fprintf(os.Stderr, "[auth.anthropic.exchange] Token exchange successful, expiresIn: %d\n", expiresIn)
		expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
		if err := s.Storage.SaveAuthToken("anthropic_oauth_access", accessTokenStr, "", "", &expiresAt); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "failed to save access token: " + err.Error()}
		}
		if refreshToken != "" {
			if err := s.Storage.SaveAuthToken("anthropic_oauth_refresh", refreshToken, "", "", nil); err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: "failed to save refresh token: " + err.Error()}
			}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": true,
			"expires_at":    expiresAt.UnixMilli(),
		}}

	case "auth.anthropic.clear":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		s.Storage.DeleteAuthToken("anthropic_oauth_access")
		s.Storage.DeleteAuthToken("anthropic_oauth_refresh")
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": false,
		}}

	case "auth.openai.status":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": false,
				"error":         "storage not available",
			}}
		}

		accessToken, err := s.Storage.GetAuthToken("openai_oauth_access")
		if err != nil || accessToken == nil || accessToken.Token == "" {
			if s.BootstrapOpenAIFromCodexAuth() {
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": true,
					"source":        "codex-auth",
				}}
			}
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": false,
			}}
		}

		if accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now()) {
			cfg := svc.GetOpenAIOAuthConfig()
			refreshTokenEntry, _ := s.Storage.GetAuthToken("openai_oauth_refresh")
			if refreshTokenEntry == nil || refreshTokenEntry.Token == "" {
				s.Storage.DeleteAuthToken("openai_oauth_access")
				s.Storage.DeleteAuthToken("openai_oauth_refresh")
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": false,
					"error":         "OpenAI token expired and no refresh token is available",
				}}
			}
			if cfg.ClientID == "" || cfg.TokenURL == "" {
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": false,
					"error":         "OpenAI OAuth refresh is not configured",
				}}
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
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"authenticated": false,
					"error":         "OpenAI token refresh failed: " + refreshErr.Error(),
				}}
			}

			expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
			accountID := strings.TrimSpace(accessToken.UserID)
			if accountID == "" {
				accountID = svc.ExtractChatGPTAccountIDFromJWT(newAccess)
			}
			_ = s.Storage.SaveAuthToken("openai_oauth_access", newAccess, accountID, "", &expiresAt)
			if newRefresh != "" {
				_ = s.Storage.SaveAuthToken("openai_oauth_refresh", newRefresh, "", "", nil)
			}
			_ = s.Storage.SetSetting("openai_oauth_mode", "chatgpt")
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": true,
				"expires_at":    expiresAt.UnixMilli(),
				"source":        "context.db",
			}}
		}

		var expiresAtMs int64
		if accessToken.ExpiresAt != nil {
			expiresAtMs = accessToken.ExpiresAt.UnixMilli()
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": true,
			"expires_at":    expiresAtMs,
			"source":        "context.db",
		}}

	case "auth.openai.start":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}

		if s.BootstrapOpenAIFromCodexAuth() {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"authenticated": true,
				"source":        "codex-auth",
			}}
		}

		cfg := svc.GetOpenAIOAuthConfig()
		if cfg.ClientID == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "OPENAI_OAUTH_CLIENT_ID is not configured and Codex auth token was not found"}
		}

		pkce, pkceErr := providers.GeneratePKCE()
		if pkceErr != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "failed to generate PKCE: " + pkceErr.Error()}
		}
		state := pkce.Verifier

		authURL, urlErr := svc.BuildOpenAIAuthorizeURL(cfg, state, pkce.Challenge)
		if urlErr != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "failed to build OpenAI authorization URL: " + urlErr.Error()}
		}

		_ = s.Storage.SetSetting("openai_oauth_verifier", pkce.Verifier)
		_ = s.Storage.SetSetting("openai_oauth_state", state)

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"auth_url": authURL,
			"state":    state,
		}}

	case "auth.openai.exchange":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		cfg := svc.GetOpenAIOAuthConfig()
		if cfg.ClientID == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "OPENAI_OAUTH_CLIENT_ID is not configured"}
		}

		var payload struct {
			Code     string `json:"code"`
			State    string `json:"state"`
			Verifier string `json:"verifier"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "invalid payload: " + err.Error()}
		}
		if payload.Code == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "code is required"}
		}

		verifier := strings.TrimSpace(payload.Verifier)
		if verifier == "" {
			verifier, _ = s.Storage.GetSetting("openai_oauth_verifier")
		}
		if verifier == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "missing PKCE verifier; run auth.openai.start first"}
		}

		state := strings.TrimSpace(payload.State)
		if state == "" {
			state, _ = s.Storage.GetSetting("openai_oauth_state")
		}

		accessTokenStr, refreshToken, expiresIn, exchangeErr := providers.ExchangeOAuthCodeForTokensGeneric(
			payload.Code,
			state,
			cfg.ClientID,
			cfg.ClientSecret,
			cfg.RedirectURI,
			verifier,
			cfg.TokenURL,
		)
		if exchangeErr != nil {
			return svc.Response{ID: req.ID, Success: false, Error: exchangeErr.Error()}
		}

		expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
		accountID := svc.ExtractChatGPTAccountIDFromJWT(accessTokenStr)
		if err := s.Storage.SaveAuthToken("openai_oauth_access", accessTokenStr, accountID, "", &expiresAt); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "failed to save access token: " + err.Error()}
		}
		if refreshToken != "" {
			if err := s.Storage.SaveAuthToken("openai_oauth_refresh", refreshToken, "", "", nil); err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: "failed to save refresh token: " + err.Error()}
			}
		}
		_ = s.Storage.SetSetting("openai_oauth_mode", "chatgpt")
		_ = s.Storage.SetSetting("openai_oauth_verifier", "")
		_ = s.Storage.SetSetting("openai_oauth_state", "")

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": true,
			"expires_at":    expiresAt.UnixMilli(),
		}}

	case "auth.openai.clear":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		s.Storage.DeleteAuthToken("openai_oauth_access")
		s.Storage.DeleteAuthToken("openai_oauth_refresh")
		_ = s.Storage.SetSetting("openai_oauth_verifier", "")
		_ = s.Storage.SetSetting("openai_oauth_state", "")
		_ = s.Storage.SetSetting("openai_oauth_mode", "")
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"authenticated": false,
		}}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
