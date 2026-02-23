package svc

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"construct-context/prompts"
	"construct-context/providers"
)

// HandleVisionAnalyze handles screenshot-to-UI vision analysis.
// Uses ChatStream (no tools) with embedded vision prompts based on detail level.
func (s *Service) HandleVisionAnalyze(conn net.Conn, req Request) {
	var payload struct {
		Model         string                 `json:"model"`
		ImageURL      string                 `json:"image_url"`
		DetailLevel   string                 `json:"detail_level"`
		CanvasContext map[string]interface{} `json:"canvas_context,omitempty"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		msg := StreamMessage{ID: req.ID, Type: "stream", Error: err.Error(), Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}

	fmt.Fprintf(os.Stderr, "[VisionAnalyze] model=%s detail_level=%s image_size=%d\n",
		payload.Model, payload.DetailLevel, len(payload.ImageURL))

	// Load vision prompt from embedded .md based on detail level
	systemPrompt := prompts.GetVisionPrompt(payload.DetailLevel)
	userHint := prompts.GetVisionUserHint(payload.DetailLevel)

	// Append canvas context hint if there are existing designs
	if payload.CanvasContext != nil {
		if count, ok := payload.CanvasContext["element_count"]; ok {
			systemPrompt += fmt.Sprintf("\n\n## EXISTING CANVAS\nThere are already %v elements on the canvas. Position your new screen to the right of existing content to avoid overlap.", count)
		}
		if rightX, ok := payload.CanvasContext["rightmost_x"]; ok {
			systemPrompt += fmt.Sprintf("\nThe rightmost edge of existing content is at x=%v. Start your screen at x=%v or later.", rightX, rightX)
		}
	}

	// Build messages: system + user with text + image
	messages := []providers.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{
			Role: "user",
			Content: []interface{}{
				map[string]interface{}{"type": "text", "text": userHint},
				map[string]interface{}{
					"type":      "image_url",
					"image_url": map[string]interface{}{"url": payload.ImageURL},
				},
			},
		},
	}

	if normalizedModel, changed := s.NormalizeModelSelection(payload.Model); changed {
		fmt.Fprintf(os.Stderr, "[VisionAnalyze] Unknown model '%s'; fallback to '%s'\n", payload.Model, normalizedModel)
		payload.Model = normalizedModel
	}

	// Resolve provider (same logic as handleStreamingChat for OAuth models)
	var provider providers.Provider
	isClaudeModel := strings.HasPrefix(payload.Model, "claude-") || strings.HasPrefix(payload.Model, "anthropic-oauth:")
	if isClaudeModel {
		payload.Model = strings.TrimPrefix(payload.Model, "anthropic-oauth:")
		if s.Storage != nil {
			accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
			if err == nil && accessToken != nil && accessToken.Token != "" {
				if accessToken.ExpiresAt != nil && accessToken.ExpiresAt.Before(time.Now()) {
					fmt.Fprintf(os.Stderr, "[VisionAnalyze] Stored OAuth token expired\n")
				} else {
					refreshToken, _ := s.Storage.GetAuthToken("anthropic_oauth_refresh")
					refreshStr := ""
					if refreshToken != nil {
						refreshStr = refreshToken.Token
					}
					oauthProv := providers.NewAnthropicOAuthProvider(accessToken.Token, refreshStr, &providers.OAuthConfig{
						ClientID: providers.OpenCodeClientID,
					})
					if accessToken.ExpiresAt != nil {
						oauthProv.SetTokenExpiry(*accessToken.ExpiresAt)
					}
					provider = oauthProv
					fmt.Fprintf(os.Stderr, "[VisionAnalyze] Using stored OAuth token (expires: %v)\n", accessToken.ExpiresAt)
				}
			}
		}
		if provider == nil {
			msg := StreamMessage{ID: req.ID, Type: "stream", Error: "Claude MAX not connected. Please connect Claude MAX in Settings > AI to use vision.", Done: true}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
			return
		}
	}

	isOpenAIModel := strings.HasPrefix(payload.Model, "openai-oauth:") || providers.ExtractModelName(payload.Model) == OpenAIOAuthModelID
	if provider == nil && isOpenAIModel {
		payload.Model = strings.TrimPrefix(payload.Model, "openai-oauth:")
		openAIProvider, openAIErr := s.GetOpenAIOAuthProvider()
		if openAIErr != nil {
			msg := StreamMessage{ID: req.ID, Type: "stream", Error: "OpenAI OAuth not connected. Please connect OpenAI in Settings > AI to use this model.", Done: true}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
			return
		}
		provider = openAIProvider
	}

	if provider == nil {
		provider, _ = s.Providers.GetProviderForModel(payload.Model)
	}
	if provider == nil {
		msg := StreamMessage{ID: req.ID, Type: "stream", Error: "no provider found for model: " + payload.Model, Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}

	// Stream with ChatStream (NO tools) — clean vision-only path
	modelName := providers.ExtractModelName(payload.Model)
	err := provider.ChatStream(messages, modelName, func(chunk providers.StreamChunk) {
		if chunk.Content != "" {
			msg := StreamMessage{
				ID:      req.ID,
				Type:    "stream",
				Content: chunk.Content,
				Done:    false,
			}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
		}
		if chunk.Error != "" {
			msg := StreamMessage{ID: req.ID, Type: "stream", Error: chunk.Error, Done: true}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
		}
	})

	if err != nil {
		msg := StreamMessage{ID: req.ID, Type: "stream", Error: err.Error(), Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}

	// Send done
	done := StreamMessage{ID: req.ID, Type: "stream", Done: true}
	data, _ := json.Marshal(done)
	conn.Write(append(data, '\n'))
}
