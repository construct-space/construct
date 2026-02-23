package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"construct-context/providers"
	"construct-context/svc"
)

// HandleAI handles ai.* and code.complete requests.
func HandleAI(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "ai.chat":
		var payload struct {
			ConversationID string `json:"conversationId"`
			Message        string `json:"message"`
			Model          string `json:"model"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		if payload.Model == "" {
			defaultProvider := s.Providers.Default()
			if defaultProvider != nil && len(defaultProvider.Models()) > 0 {
				payload.Model = defaultProvider.Models()[0]
			}
		}

		s.Mu.Lock()
		conv, ok := s.Conversations[payload.ConversationID]
		if !ok {
			conv = &svc.ConversationWindow{
				ID:        payload.ConversationID,
				Name:      "New Chat",
				Model:     payload.Model,
				Messages:  []providers.ChatMessage{},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			s.Conversations[payload.ConversationID] = conv
			if s.Storage != nil {
				storageConv := &svc.StorageConversationWindow{
					ID:        conv.ID,
					Name:      conv.Name,
					Model:     conv.Model,
					Messages:  []svc.ChatMessage{},
					CreatedAt: conv.CreatedAt,
					UpdatedAt: conv.UpdatedAt,
				}
				s.Storage.SaveConversation(storageConv)
			}
		}

		lowerMsg := strings.ToLower(payload.Message)
		if strings.Contains(lowerMsg, "switch matrix mode") || strings.Contains(lowerMsg, "toggle matrix mode") {
			s.MatrixMode = !s.MatrixMode
			if s.Storage != nil {
				s.Storage.SetSetting("matrix_mode", fmt.Sprintf("%t", s.MatrixMode))
			}
			identity := "Construct"
			if s.MatrixMode {
				identity = "Morpheus"
			}
			s.Mu.Unlock()
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"response":   fmt.Sprintf("Matrix mode %s. I am now %s.", map[bool]string{true: "enabled", false: "disabled"}[s.MatrixMode], identity),
				"matrixMode": s.MatrixMode,
				"identity":   identity,
			}}
		}

		userMsg := providers.ChatMessage{Role: "user", Content: payload.Message}
		conv.Messages = append(conv.Messages, userMsg)
		conv.UpdatedAt = time.Now()

		systemPrompt := s.BuildSystemPrompt()
		s.Mu.Unlock()

		if s.Storage != nil {
			s.Storage.SaveMessage(payload.ConversationID, svc.ChatMessage{Role: userMsg.Role, Content: userMsg.GetContentString()}, 0, 0)
		}

		response, err := s.CallAI(systemPrompt, conv.Messages, payload.Model)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		assistantMsg := providers.ChatMessage{Role: "assistant", Content: response}
		s.Mu.Lock()
		conv.Messages = append(conv.Messages, assistantMsg)
		conv.UpdatedAt = time.Now()
		s.Mu.Unlock()

		if s.Storage != nil {
			s.Storage.SaveMessage(payload.ConversationID, svc.ChatMessage{Role: assistantMsg.Role, Content: assistantMsg.GetContentString()}, 0, 0)
		}

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"message":      response,
			"conversation": conv,
		}}

	case "ai.chat_direct":
		var payload struct {
			Messages []providers.ChatMessage `json:"messages"`
			Model    string                  `json:"model"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		var routeInfo *providers.ModelRoute
		if providers.IsAutoModel(payload.Model) {
			availableModels := s.Providers.AllModelIDs()
			hasImages := false
			for _, msg := range payload.Messages {
				if msg.HasImages() {
					hasImages = true
					break
				}
			}
			route := providers.SmartRouteWithContext(payload.Messages, hasImages, availableModels, "")
			if route.Model == "no_vision_model" {
				return svc.Response{ID: req.ID, Success: false, Error: "No vision-capable model available. Connect Claude MAX or configure a vision model in Settings > AI."}
			}
			payload.Model = route.Model
			routeInfo = &route
			fmt.Fprintf(os.Stderr, "[Conductor] Direct chat routed to %s (tier: %s, reason: %s)\n", route.Model, route.Tier, route.Reason)
		} else if payload.Model == "" {
			defaultProvider := s.Providers.Default()
			if defaultProvider != nil && len(defaultProvider.Models()) > 0 {
				payload.Model = defaultProvider.Models()[0]
			}
		}

		s.Mu.RLock()
		systemPrompt := s.BuildSystemPrompt()
		s.Mu.RUnlock()

		response, err := s.CallAI(systemPrompt, payload.Messages, payload.Model)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		result := map[string]any{
			"message": providers.ChatMessage{Role: "assistant", Content: response},
			"done":    true,
		}
		if routeInfo != nil {
			result["route"] = routeInfo
		}

		return svc.Response{ID: req.ID, Success: true, Data: result}

	case "ai.models":
		models := s.Providers.AllModels()
		for i := range models {
			models[i]["modified_at"] = time.Now().Format(time.RFC3339)
			models[i]["size"] = 0
		}

		providerInfo := map[string]any{}
		for key, provider := range s.Providers.All() {
			providerInfo[key] = map[string]any{
				"name":   provider.Name(),
				"models": provider.Models(),
			}
		}

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"models":          models,
			"currentProvider": s.Providers.DefaultKey(),
			"providers":       providerInfo,
		}}

	case "ai.providers":
		type modelInfo struct {
			Label string
			Tags  []string
		}
		modelMeta := map[string]modelInfo{
			"deepseek-chat":               {Label: "DeepSeek V3", Tags: []string{"value", "tools"}},
			"deepseek-reasoner":           {Label: "DeepSeek R1", Tags: []string{"reasoning"}},
			"grok-4-1-fast-reasoning":     {Label: "Grok 4.1 Fast", Tags: []string{"vision", "reasoning", "value"}},
			"grok-code-fast-1":            {Label: "Grok Code", Tags: []string{"coding", "tools"}},
			"glm-5":                       {Label: "GLM-5", Tags: []string{"reasoning", "flagship"}},
			"glm-4.7-flash":              {Label: "GLM 4.7 Flash", Tags: []string{"free", "fast"}},
			"glm-4.6v":                   {Label: "GLM 4.6V", Tags: []string{"vision"}},
			"mimo-v2-flash":              {Label: "MiMo V2 Flash", Tags: []string{"fast", "value"}},
			"kimi-k2.5":                  {Label: "Kimi K2.5", Tags: []string{"vision", "reasoning"}},
			"moonshot-v1-128k":           {Label: "Moonshot V1 128K", Tags: []string{"value"}},
			"gemini-2.5-flash":           {Label: "Gemini 2.5 Flash", Tags: []string{"fast", "free"}},
			"gemini-2.5-pro":             {Label: "Gemini 2.5 Pro", Tags: []string{"reasoning", "vision"}},
			"gemini-2.0-flash":           {Label: "Gemini 2.0 Flash", Tags: []string{"fast"}},
			"gemini-2.0-flash-lite":      {Label: "Gemini 2.0 Flash Lite", Tags: []string{"fast", "free"}},
			"gpt-5.3-codex":              {Label: "GPT-5.3 Codex", Tags: []string{"coding", "reasoning", "flagship"}},
		}

		providersList := []map[string]any{}
		for key, provider := range s.Providers.All() {
			modelsList := []map[string]any{}
			for _, model := range provider.Models() {
				label := model
				var tags []string
				if info, ok := modelMeta[model]; ok {
					label = info.Label
					tags = info.Tags
				}
				entry := map[string]any{
					"id":    model,
					"label": label,
				}
				if len(tags) > 0 {
					entry["tags"] = tags
				}
				modelsList = append(modelsList, entry)
			}
			providersList = append(providersList, map[string]any{
				"id":       key,
				"label":    provider.Name(),
				"models":   modelsList,
				"authType": "api",
			})
		}

		if s.Storage != nil {
			accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
			if err == nil && accessToken != nil && accessToken.Token != "" {
				claudeModels := []map[string]any{
					{"id": "claude-opus-4-6", "label": "Claude Opus 4.6", "tags": []string{"flagship", "vision", "tools", "reasoning"}},
					{"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "tags": []string{"balanced", "vision", "tools", "coding"}},
					{"id": "claude-sonnet-4-5", "label": "Claude Sonnet 4.5", "tags": []string{"balanced", "vision", "tools"}},
					{"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5", "tags": []string{"fast", "value"}},
				}
				providersList = append(providersList, map[string]any{
					"id":        "anthropic-oauth",
					"label":     "Claude MAX",
					"models":    claudeModels,
					"authType":  "oauth",
					"connected": true,
					"icon":      "i-lucide-crown",
				})
			}

			openAIAccessToken, openAIErr := s.Storage.GetAuthToken("openai_oauth_access")
			if openAIErr != nil || openAIAccessToken == nil || openAIAccessToken.Token == "" {
				if s.BootstrapOpenAIFromCodexAuth() {
					openAIAccessToken, openAIErr = s.Storage.GetAuthToken("openai_oauth_access")
				}
			}
			if openAIErr == nil && openAIAccessToken != nil && openAIAccessToken.Token != "" {
				openAIModels := []map[string]any{
					{"id": svc.OpenAIOAuthModelID, "label": "GPT-5.3 Codex", "tags": []string{"coding", "reasoning", "flagship"}},
				}
				providersList = append(providersList, map[string]any{
					"id":        "openai-oauth",
					"label":     "OpenAI OAuth",
					"models":    openAIModels,
					"authType":  "oauth",
					"connected": true,
					"icon":      "i-lucide-sparkles",
				})
			}
		}

		defaultProviderID := s.Providers.DefaultKey()
		defaultModelID := s.DefaultCompositeModelID()

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"providers":       providersList,
			"default":         defaultProviderID,
			"defaultProvider": defaultProviderID,
			"defaultModel":    defaultModelID,
		}}

	case "ai.set_provider":
		var payload struct {
			Provider string `json:"provider"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if !s.Providers.SetDefault(payload.Provider) {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("unknown provider: %s", payload.Provider)}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"provider": payload.Provider,
		}}

	case "ai.get_provider":
		provider := s.Providers.Default()
		if provider == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "no provider configured"}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"provider": s.Providers.DefaultKey(),
			"name":     provider.Name(),
			"models":   provider.Models(),
		}}

	case "ai.set_matrix_mode":
		var payload struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.MatrixMode = payload.Enabled
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SetSetting("matrix_mode", fmt.Sprintf("%t", payload.Enabled))
		}
		identity := "Construct"
		if payload.Enabled {
			identity = "Morpheus"
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"matrixMode": payload.Enabled,
			"identity":   identity,
		}}

	case "ai.get_matrix_mode":
		s.Mu.RLock()
		enabled := s.MatrixMode
		s.Mu.RUnlock()
		identity := "Construct"
		if enabled {
			identity = "Morpheus"
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"matrixMode": enabled,
			"identity":   identity,
		}}

	case "ai.generate_image":
		var payload struct {
			Prompt   string `json:"prompt"`
			Size     string `json:"size"`
			Quality  string `json:"quality"`
			Provider string `json:"provider"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		if s.ImageGen == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "no image generation providers configured"}
		}

		result, err := s.ImageGen.Generate(payload.Prompt, payload.Size, payload.Quality, payload.Provider)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: result}

	case "ai.image_providers":
		if s.ImageGen == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"providers": []any{}}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"providers": s.ImageGen.ListProviders(),
		}}

	case "ai.web_search":
		var payload struct {
			Query   string `json:"query"`
			Count   int    `json:"count"`
			Recency string `json:"recency"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		var searchProvider providers.Provider
		for _, p := range s.Providers.All() {
			if p.SupportsWebSearch() {
				searchProvider = p
				break
			}
		}
		if searchProvider == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "no provider supports web search"}
		}

		result, err := searchProvider.WebSearch(payload.Query, payload.Count, payload.Recency)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: result}

	case "ai.read_url":
		var payload struct {
			URL    string `json:"url"`
			Format string `json:"format"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		var readerProvider providers.Provider
		for _, p := range s.Providers.All() {
			if p.SupportsURLReader() {
				readerProvider = p
				break
			}
		}
		if readerProvider == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "no provider supports URL reading"}
		}

		result, err := readerProvider.ReadURL(payload.URL, payload.Format)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: result}

	case "code.complete":
		var payload struct {
			CompletionMetadata struct {
				TextBeforeCursor string   `json:"textBeforeCursor"`
				TextAfterCursor  string   `json:"textAfterCursor"`
				Language         string   `json:"language"`
				Filename         string   `json:"filename,omitempty"`
				Technologies     []string `json:"technologies,omitempty"`
			} `json:"completionMetadata"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		meta := payload.CompletionMetadata

		completion, err := s.CallCodestral(
			meta.TextBeforeCursor,
			meta.TextAfterCursor,
			meta.Language,
			meta.Filename,
		)
		if err != nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"completion": nil,
			}}
		}

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"completion": completion,
		}}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown AI request type: " + req.Type}
	}
}

// HandleAIConversations handles ai.conversations.* requests.
func HandleAIConversations(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "ai.conversations.get":
		var payload struct {
			ContextKey string `json:"contextKey"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversation": nil}}
		}
		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: false, Error: "no user context - please login first"}
		}
		conv, err := s.Storage.GetAIConversation(payload.ContextKey, userCtx.UserID, userCtx.CompanyID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversation": nil}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversation": conv}}

	case "ai.conversations.save":
		var payload struct {
			ContextKey string `json:"contextKey"`
			Messages   string `json:"messages"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}

		payloadBytes := len(payload.Messages)
		const maxPayloadBytes = 2 * 1024 * 1024
		const warnPayloadBytes = 500 * 1024
		if payloadBytes > maxPayloadBytes {
			fmt.Printf("[save] REJECTED contextKey=%s payload=%dKB (exceeds %dMB limit)\n", payload.ContextKey, payloadBytes/1024, maxPayloadBytes/(1024*1024))
			return svc.Response{ID: req.ID, Success: false, Error: "payload_too_large"}
		}
		if payloadBytes > warnPayloadBytes {
			fmt.Printf("[save] WARNING contextKey=%s payload=%dKB\n", payload.ContextKey, payloadBytes/1024)
		} else if s.IsDevMode() {
			fmt.Printf("[save] contextKey=%s payload=%dKB\n", payload.ContextKey, payloadBytes/1024)
		}

		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: false, Error: "no user context - please login first"}
		}
		if err := s.Storage.SaveAIConversation(payload.ContextKey, userCtx.UserID, userCtx.CompanyID, payload.Messages); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "ai.conversations.upsert_message":
		var payload struct {
			ContextKey   string `json:"contextKey"`
			MessageIndex int    `json:"messageIndex"`
			Message      string `json:"message"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}

		if len(payload.Message) > 500*1024 {
			fmt.Printf("[upsert_message] WARNING contextKey=%s message=%dKB\n", payload.ContextKey, len(payload.Message)/1024)
		}

		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: false, Error: "no user context"}
		}
		if err := s.Storage.UpsertAIMessage(payload.ContextKey, userCtx.UserID, userCtx.CompanyID, payload.MessageIndex, payload.Message); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "ai.conversations.list":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": nil}}
		}
		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": nil}}
		}
		conversations, err := s.Storage.GetAllAIConversations(userCtx.UserID, userCtx.CompanyID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": nil}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": conversations}}

	case "ai.conversations.sync":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": nil}}
		}
		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": nil}}
		}
		toSync, err := s.Storage.GetAIConversationsForSync(userCtx.UserID, userCtx.CompanyID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": toSync}}

	case "ai.conversations.mark_synced":
		var payload struct {
			ID int `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.MarkAIConversationSynced(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "ai.conversations.delete":
		var payload struct {
			ContextKey string `json:"contextKey"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: false, Error: "no user context - please login first"}
		}
		if err := s.Storage.DeleteAIConversation(payload.ContextKey, userCtx.UserID, userCtx.CompanyID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "ai.conversations.clear":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		userCtx, _ := s.Storage.GetUserContext()
		if userCtx == nil || userCtx.UserID == 0 {
			return svc.Response{ID: req.ID, Success: false, Error: "no user context - please login first"}
		}
		if err := s.Storage.ClearAIConversations(userCtx.UserID, userCtx.CompanyID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown AI conversations request type: " + req.Type}
	}
}
