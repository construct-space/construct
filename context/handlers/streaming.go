package handlers

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"construct-context/agents"
	"construct-context/compaction"
	"construct-context/intent"
	"construct-context/providers"
	"construct-context/rag"
	"construct-context/skills"
	"construct-context/svc"
)

// HandleStreamingChat handles streaming AI chat responses with tool support
func HandleStreamingChat(s *svc.Service, conn net.Conn, req svc.Request) {
	var payload struct {
		Messages      []providers.ChatMessage `json:"messages"`
		Model         string                  `json:"model"`
		Token         string                  `json:"token"`
		Space         string                  `json:"space,omitempty"`
		AgentID       string                  `json:"agent_id,omitempty"`
		LocalData     map[string]any          `json:"local_data,omitempty"`
		MaxIterations int                     `json:"max_iterations,omitempty"`
	}
	if err := json.Unmarshal(req.Payload, &payload); err != nil {
		msg := svc.StreamMessage{ID: req.ID, Type: "stream", Error: err.Error(), Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}

	if payload.Space == "" && payload.LocalData != nil {
		if sc, ok := payload.LocalData["space_context"].(map[string]any); ok {
			if as, ok := sc["activeSpace"].(string); ok {
				payload.Space = as
			}
		}
	}

	// Handle special commands (matrix mode toggle)
	if len(payload.Messages) > 0 {
		lastMsg := payload.Messages[len(payload.Messages)-1]
		if lastMsg.Role == "user" {
			lowerMsg := strings.ToLower(lastMsg.GetContentString())
			if strings.Contains(lowerMsg, "switch matrix mode") || strings.Contains(lowerMsg, "toggle matrix mode") {
				s.Mu.Lock()
				s.MatrixMode = !s.MatrixMode
				if s.Storage != nil {
					s.Storage.SetSetting("matrix_mode", fmt.Sprintf("%t", s.MatrixMode))
				}
				identity := "Construct"
				if s.MatrixMode {
					identity = "Morpheus"
				}
				s.Mu.Unlock()

				response := fmt.Sprintf("Matrix mode %s. I am now %s.", map[bool]string{true: "enabled", false: "disabled"}[s.MatrixMode], identity)
				msg := svc.StreamMessage{ID: req.ID, Type: "stream", Content: response}
				data, _ := json.Marshal(msg)
				conn.Write(append(data, '\n'))
				doneMsg := svc.StreamMessage{ID: req.ID, Type: "stream", Done: true}
				data, _ = json.Marshal(doneMsg)
				conn.Write(append(data, '\n'))
				return
			}
		}
	}

	// --- Model routing ---
	var routeInfo *providers.ModelRoute
	if providers.IsAutoModel(payload.Model) {
		availableModels := s.Providers.AllModelIDs()

		if s.Storage != nil {
			accessToken, err := s.Storage.GetAuthToken("anthropic_oauth_access")
			if err == nil && accessToken != nil && accessToken.Token != "" {
				if accessToken.ExpiresAt == nil || accessToken.ExpiresAt.After(time.Now()) {
					availableModels = append(availableModels,
						"anthropic-oauth:claude-opus-4-6",
						"anthropic-oauth:claude-sonnet-4-6",
						"anthropic-oauth:claude-sonnet-4-5",
						"anthropic-oauth:claude-haiku-4-5",
					)
				}
			}
		}

		hasImages := detectImagesInMessages(payload.Messages)
		s.SendDebug(conn, req.ID, fmt.Sprintf("📸 hasImages=%v (%d messages)", hasImages, len(payload.Messages)))

		route := providers.SmartRouteWithContext(payload.Messages, hasImages, availableModels, payload.Space)
		fmt.Fprintf(os.Stderr, "[Conductor] Regex route: %s (tier: %s, confidence: %.2f, reason: %s)\n",
			route.Model, route.Tier, route.Confidence, route.Reason)

		if route.Confidence < 0.6 {
			conductorModelID := providers.PreferredConductorModel(availableModels)
			if conductorModelID != "" {
				var userMsg string
				for i := len(payload.Messages) - 1; i >= 0; i-- {
					if payload.Messages[i].Role == "user" {
						userMsg = payload.Messages[i].GetContentString()
						break
					}
				}

				if userMsg != "" {
					systemPrompt := providers.BuildConductorPrompt(availableModels)
					userPrompt := providers.BuildConductorUserMessage(userMsg, payload.Space, hasImages, len(payload.Messages))

					conductorProvider, _ := s.Providers.GetProviderForModel(conductorModelID)
					if conductorProvider != nil {
						conductorModel := providers.ExtractModelName(conductorModelID)
						s.SendDebug(conn, req.ID, fmt.Sprintf("🧠 Conductor analyzing with %s...", conductorModelID))

						response, err := conductorProvider.Chat([]providers.ChatMessage{
							{Role: "system", Content: systemPrompt},
							{Role: "user", Content: userPrompt},
						}, conductorModel)

						if err == nil {
							llmRoute, err := providers.ParseConductorResponse(response, availableModels)
							if err == nil {
								llmRoute.HasVision = hasImages
								route = llmRoute
								fmt.Fprintf(os.Stderr, "[Conductor] LLM route: %s (tier: %s, reason: %s)\n",
									route.Model, route.Tier, route.Reason)
							} else {
								fmt.Fprintf(os.Stderr, "[Conductor] LLM parse failed: %v, using regex fallback\n", err)
							}
						} else {
							fmt.Fprintf(os.Stderr, "[Conductor] LLM call failed: %v, using regex fallback\n", err)
						}
					}
				}
			}
		}

		if route.Model == "no_vision_model" {
			msg := svc.StreamMessage{ID: req.ID, Type: "stream", Error: "No vision-capable model available. Please connect Claude MAX or configure a model that supports images (Claude, Gemini, Grok) in Settings > AI.", Done: true}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
			return
		}

		payload.Model = route.Model
		routeInfo = &route
		fmt.Fprintf(os.Stderr, "[Conductor] Final: %s (tier: %s, reason: %s)\n", route.Model, route.Tier, route.Reason)

		s.SendDebug(conn, req.ID, fmt.Sprintf("🔀 Routed to %s (%s)\n   %s", route.Model, route.Tier, route.Reason))

		routeMsg := svc.StreamMessage{ID: req.ID, Type: "stream", Route: routeInfo}
		data, _ := json.Marshal(routeMsg)
		conn.Write(append(data, '\n'))
	} else if payload.Model == "" {
		defaultProvider := s.Providers.Default()
		if defaultProvider != nil && len(defaultProvider.Models()) > 0 {
			payload.Model = defaultProvider.Models()[0]
		}
	}

	if normalizedModel, changed := s.NormalizeModelSelection(payload.Model); changed {
		s.SendDebug(conn, req.ID, fmt.Sprintf("⚠️ Unknown model '%s' requested; using '%s' instead.", payload.Model, normalizedModel))
		fmt.Fprintf(os.Stderr, "[model] Unknown model '%s'; fallback to '%s'\n", payload.Model, normalizedModel)
		payload.Model = normalizedModel
	}

	// --- Provider resolution ---
	provider, adjustedModel, provErr := resolveStreamProvider(s, payload.Model, payload.Token)
	if provErr != nil {
		msg := svc.StreamMessage{ID: req.ID, Type: "stream", Error: provErr.Error(), Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}
	payload.Model = adjustedModel

	// --- API client setup ---
	s.Mu.RLock()
	agentMode := s.AgentMode
	appCtx := s.AppCtx
	token := payload.Token
	tokenSource := "payload"
	if token == "" && s.Storage != nil {
		if storedToken, err := s.Storage.GetAuthToken("construct_api"); err == nil && storedToken.Token != "" {
			token = storedToken.Token
			tokenSource = "storage"
		}
	}
	if token == "" {
		token = s.APIToken
		tokenSource = "service"
	}
	if token == "" {
		tokenSource = "NONE"
	}
	fmt.Fprintf(os.Stderr, "[auth] Token source: %s, len: %d, baseURL: %s\n", tokenSource, len(token), s.APIBaseURL)
	apiClient := svc.NewAPIClient(s.APIBaseURL, token, s.APIKey)
	s.Mu.RUnlock()

	maxIterations := 15
	if payload.MaxIterations > 0 && payload.MaxIterations <= 30 {
		maxIterations = payload.MaxIterations
	}

	// --- Agent resolution ---
	effectiveAgentID := payload.AgentID
	if effectiveAgentID == "" && payload.Space != "" {
		effectiveAgentID = resolveAgentFromSpace(payload.Space)
		if effectiveAgentID != "" {
			s.Logf("[chat] req=%s inferred agent=%s from space=%s", req.ID, effectiveAgentID, payload.Space)
		}
	}

	var systemPrompt string
	skillRuntimeEnabled := s.IsSkillRuntimeEnabled()
	allTools := svc.GetAvailableTools(skillRuntimeEnabled)
	var tools []providers.Tool
	var agentConfig *agents.AgentConfig

	if effectiveAgentID != "" {
		loadedConfig, ok := agents.DefaultRegistry.GetWithContext(effectiveAgentID, nil)
		if ok {
			agentConfig = loadedConfig
			systemPrompt = agentConfig.SystemPrompt
			tools = agentConfig.FilterTools(allTools)
			if agentConfig.MaxIterations > 0 {
				maxIterations = agentConfig.MaxIterations
			}
			s.SendDebug(conn, req.ID, fmt.Sprintf("🤖 Using agent: %s (%d tools, %d max iterations)", agentConfig.Name, len(tools), maxIterations))

			// Enrich system prompt with project context for code space
			if payload.Space == "code" && payload.LocalData != nil {
				enriched := enrichCodeSystemPrompt(systemPrompt, payload.LocalData, payload.Messages)
				if enriched != systemPrompt {
					systemPrompt = enriched
					s.SendDebug(conn, req.ID, "📂 Injected project context into system prompt")
				}
			}

			// Enrich with RAG context if available
			if s.RAG != nil && payload.LocalData != nil {
				userText := ""
				for i := len(payload.Messages) - 1; i >= 0; i-- {
					if payload.Messages[i].Role == "user" {
						userText = payload.Messages[i].GetContentString()
						break
					}
				}
				if userText != "" {
					enriched := s.RAG.EnrichSystemPrompt(systemPrompt, payload.LocalData, userText, payload.Space)
					if enriched != systemPrompt {
						systemPrompt = enriched
						s.SendDebug(conn, req.ID, fmt.Sprintf("🔍 RAG context enrichment (%s)", rag.FormatRAGStats(s.RAG.Store(), rag.ExtractProjectID(payload.LocalData))))
					}
				}

				// Trigger background indexing if project directory is available
				projectDir := rag.ExtractProjectDir(payload.LocalData)
				projectID := rag.ExtractProjectID(payload.LocalData)
				if projectDir != "" && projectID > 0 && !s.RAG.Indexer().IsRunning() {
					count, _ := s.RAG.Store().CountByProject(projectID)
					if count == 0 {
						s.RAG.IndexProjectAsync(projectID, projectDir)
						s.SendDebug(conn, req.ID, "📊 Started background RAG indexing")
					}
				}
			}
		} else {
			s.SendDebug(conn, req.ID, fmt.Sprintf("⚠️ Agent '%s' not found, using default", effectiveAgentID))
			s.Mu.RLock()
			matrixMode := s.MatrixMode
			s.Mu.RUnlock()
			systemPrompt = svc.BuildAgentSystemPrompt(agentMode, &appCtx, matrixMode)
			tools = svc.FilterToolsForAgentMode(allTools, agentMode)
		}
	} else {
		s.Mu.RLock()
		matrixMode := s.MatrixMode
		s.Mu.RUnlock()
		systemPrompt = svc.BuildAgentSystemPrompt(agentMode, &appCtx, matrixMode)
		tools = svc.FilterToolsForAgentMode(allTools, agentMode)
	}

	if skillRuntimeEnabled {
		if activeSkillInstructions := strings.TrimSpace(skills.DefaultLoader.GetActiveInstructions()); activeSkillInstructions != "" {
			systemPrompt += "\n\n## Active Skills\n" + activeSkillInstructions
		}
	}

	// --- Build messages ---
	allMessages := []providers.ChatMessageWithTools{{Role: "system", Content: systemPrompt}}
	for _, msg := range payload.Messages {
		if msg.HasImages() {
			allMessages = append(allMessages, providers.ChatMessageWithTools{
				Role:    msg.Role,
				Content: msg.Content,
			})
		} else {
			content := msg.GetContentString()
			if content == "" {
				continue
			}
			if effectiveAgentID != "" && msg.Role == "system" {
				continue
			}
			allMessages = append(allMessages, providers.ChatMessageWithTools{
				Role:    msg.Role,
				Content: content,
			})
		}
	}

	// --- Design intent detection ---
	userText := intent.LastUserMessageText(allMessages)
	designIntent := intent.IsActionableDesignRequest(userText)
	if !designIntent && intent.IsContinuationConfirmation(userText) {
		assistantText := intent.LastAssistantMessageText(allMessages)
		if intent.IsActionableDesignRequest(assistantText) {
			designIntent = true
		}
	}

	// Auto-select design agent when design intent is detected but no agent was specified.
	isCodeSpace := strings.EqualFold(payload.Space, "code")
	isDocsSpace := strings.EqualFold(payload.Space, "docs") || strings.EqualFold(payload.Space, "notes")
	isExplicitCodeAgent := strings.EqualFold(effectiveAgentID, "code") || strings.EqualFold(effectiveAgentID, "code-assistant")
	if designIntent && agentConfig == nil && !isCodeSpace && !isDocsSpace && !isExplicitCodeAgent {
		if designConfig, ok := agents.DefaultRegistry.GetWithContext("design", nil); ok {
			agentConfig = designConfig
			systemPrompt = agentConfig.SystemPrompt
			tools = agentConfig.FilterTools(allTools)
			if agentConfig.MaxIterations > 0 {
				maxIterations = agentConfig.MaxIterations
			}
			s.Logf("[chat] req=%s auto-selected design agent (designIntent=true, no agent specified)", req.ID)
		}
	}

	// --- Dispatch ---
	selectedAgentHasDesignTools := compaction.ToolEnabled(tools, "create_ui_screen") && compaction.ToolEnabled(tools, "create_design_element")
	anyAgentHasDesignTools := compaction.ToolEnabled(allTools, "create_ui_screen") && compaction.ToolEnabled(allTools, "create_design_element")
	useConductorForDesign := designIntent && !selectedAgentHasDesignTools && anyAgentHasDesignTools && !isCodeSpace && !isDocsSpace && !isExplicitCodeAgent

	chatStartTime := time.Now()
	agentLabel := effectiveAgentID
	if agentLabel == "" {
		agentLabel = "chat"
	}
	s.Logf("[chat] req=%s model=%s agent=%s space=%s tools=%d maxIter=%d messages=%d designIntent=%v useConductor=%v",
		req.ID, payload.Model, agentLabel, payload.Space, len(tools), maxIterations, len(allMessages), designIntent, useConductorForDesign)

	conductor := agents.NewConductor(agents.DefaultRegistry, agents.DefaultRouter, provider)
	conductor.SetExecutor(func(session *agents.AgentSession, config *agents.AgentConfig, dispReq *agents.DispatchRequest) (*agents.AgentResult, error) {
		return ExecuteAgentLoop(s, conductor, session, config, dispReq, provider, allTools, apiClient, payload.LocalData, conn, req.ID)
	})

	var effectiveConfig *agents.AgentConfig
	var dispatchReq *agents.DispatchRequest

	if useConductorForDesign {
		s.Logf("[conductor] req=%s agent=%s lacks design tools, routing to conductor for orchestration", req.ID, payload.AgentID)

		availableAgents := agents.DefaultRegistry.GetAll()
		var agentInfo []string
		for _, a := range availableAgents {
			if a.Category == agents.AgentCategorySpecialized {
				agentTools := strings.Join(a.AllowedTools, ", ")
				agentInfo = append(agentInfo, fmt.Sprintf("- %s: %s [tools: %s]", a.ID, a.Description, agentTools))
			}
		}
		dynamicContext := "Available agents:\n" + strings.Join(agentInfo, "\n")

		effectiveConfig = agents.ConductorConfig
		dispatchReq = &agents.DispatchRequest{
			AgentID:     "conductor",
			Task:        userText,
			ContextJSON: dynamicContext,
			Model:       payload.Model,
			Config:      effectiveConfig,
		}
	} else {
		effectiveConfig = agentConfig
		if effectiveConfig == nil {
			if chatConfig, ok := agents.DefaultRegistry.GetWithContext("chat", nil); ok {
				effectiveConfig = chatConfig
				effectiveConfig.SystemPrompt = systemPrompt
				if maxIterations > 0 {
					effectiveConfig.MaxIterations = maxIterations
				}
			} else {
				effectiveConfig = agents.ChatAgentConfig
				effectiveConfig.SystemPrompt = systemPrompt
			}
		}
		dispatchReq = &agents.DispatchRequest{
			AgentID:  effectiveConfig.ID,
			Task:     userText,
			Model:    payload.Model,
			Config:   effectiveConfig,
			Messages: allMessages,
		}
	}

	resp, err := conductor.Dispatch(dispatchReq)
	if err != nil {
		msg := svc.StreamMessage{ID: req.ID, Type: "stream", Error: err.Error(), Done: true}
		data, _ := json.Marshal(msg)
		conn.Write(append(data, '\n'))
		return
	}

	if resp.Result != nil && resp.Result.Content != "" {
		cleaned := compaction.StripThinkTags(resp.Result.Content)
		cleaned = strings.TrimSpace(cleaned)
		if cleaned != "" {
			msg := svc.StreamMessage{ID: req.ID, Type: "stream", Content: cleaned, Done: false}
			data, _ := json.Marshal(msg)
			conn.Write(append(data, '\n'))
		}
	}

	doneMsg := svc.StreamMessage{ID: req.ID, Type: "stream", Done: true}
	doneData, _ := json.Marshal(doneMsg)
	conn.Write(append(doneData, '\n'))

	s.Logf("[done] req=%s session=%s duration=%dms",
		req.ID, resp.SessionID, time.Since(chatStartTime).Milliseconds())
}
