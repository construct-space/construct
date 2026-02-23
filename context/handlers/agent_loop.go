package handlers

import (
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"construct-context/agents"
	"construct-context/compaction"
	"construct-context/providers"
	"construct-context/svc"
)

// ExecuteAgentLoop is the universal tool loop used by all agent executions.
func ExecuteAgentLoop(
	s *svc.Service,
	conductor *agents.Conductor,
	session *agents.AgentSession,
	config *agents.AgentConfig,
	dispReq *agents.DispatchRequest,
	provider providers.Provider,
	allTools []providers.Tool,
	apiClient *svc.APIClient,
	localData map[string]interface{},
	conn net.Conn,
	reqID string,
) (*agents.AgentResult, error) {
	start := time.Now()

	var messages []providers.ChatMessageWithTools
	if len(dispReq.Messages) > 0 {
		messages = make([]providers.ChatMessageWithTools, len(dispReq.Messages))
		copy(messages, dispReq.Messages)
	} else {
		messages = []providers.ChatMessageWithTools{
			{Role: "system", Content: config.SystemPrompt},
			{Role: "user", Content: dispReq.Task},
		}
		if dispReq.ContextJSON != "" {
			messages = append(messages, providers.ChatMessageWithTools{
				Role:    "user",
				Content: "Context from previous phase:\n" + dispReq.ContextJSON,
			})
		}
	}

	agentTools := config.FilterTools(allTools)
	maxIter := config.GetMaxIterations()
	modelName := providers.ExtractModelName(dispReq.Model)

	// Build allowlist set for runtime enforcement (prevents hallucinated tool calls)
	allowedToolSet := make(map[string]bool, len(agentTools))
	for _, t := range agentTools {
		allowedToolSet[t.Function.Name] = true
	}

	s.Logf("[agent-loop] req=%s agent=%s session=%s tools=%d maxIter=%d starting",
		reqID, config.ID, session.ID, len(agentTools), maxIter)

	result := &agents.AgentResult{}

	toolCallCounts := make(map[string]int)
	sameArgsCalls := make(map[string]int)
	maxCallsPerTool := 40
	totalToolCalls := 0
	maxTotalToolCalls := 60

	for iteration := 0; iteration < maxIter; iteration++ {
		s.Logf("[agent-loop] req=%s agent=%s iteration=%d/%d tokens=~%dk",
			reqID, config.ID, iteration+1, maxIter, compaction.EstimateTokens(messages)/1000)

		if iteration > 0 {
			progressMsg := svc.StreamMessage{
				ID:   reqID,
				Type: "progress",
				Content: fmt.Sprintf("[%s] Working... (step %d)", config.Name, iteration+1),
			}
			progressData, _ := json.Marshal(progressMsg)
			conn.Write(append(progressData, '\n'))
		}

		if compacted, summarized := s.MaybeSummarize(messages, dispReq.Model, conn, reqID); summarized {
			messages = compacted
		}

		var accumulatedContent string
		var toolCalls []providers.ToolCall
		var stopReason string
		seenToolCalls := make(map[string]bool)
		lastHeartbeat := time.Now()

		err := provider.ChatStreamWithTools(messages, modelName, agentTools, func(chunk providers.StreamChunk) {
			if chunk.Content != "" {
				accumulatedContent += chunk.Content
				if time.Since(lastHeartbeat) > 3*time.Second {
					hb := svc.StreamMessage{
						ID:      reqID,
						Type:    "progress",
						Content: fmt.Sprintf("[%s] Thinking...", config.Name),
					}
					data, _ := json.Marshal(hb)
					conn.Write(append(data, '\n'))
					lastHeartbeat = time.Now()
				}
			}
			if len(chunk.ToolCalls) > 0 {
				for _, tc := range chunk.ToolCalls {
					callID := strings.TrimSpace(tc.ID)
					dedupeKey := callID
					if dedupeKey == "" {
						dedupeKey = tc.Function.Name + "|" + tc.Function.Arguments
					}
					if seenToolCalls[dedupeKey] {
						continue
					}
					seenToolCalls[dedupeKey] = true
					toolCalls = append(toolCalls, tc)
				}
			}
			if chunk.StopReason != "" {
				stopReason = chunk.StopReason
			}
			if chunk.Error != "" {
				msg := svc.StreamMessage{ID: reqID, Type: "stream", Error: chunk.Error, Done: true}
				data, _ := json.Marshal(msg)
				conn.Write(append(data, '\n'))
			}
		})

		if err != nil {
			s.Logf("[agent-loop] req=%s agent=%s error: %s", reqID, config.ID, err.Error())
			return result, fmt.Errorf("agent %s stream error: %w", config.ID, err)
		}

		// Handle pause_turn: model hit server-side iteration limit, continue the conversation
		if stopReason == "pause_turn" && len(toolCalls) == 0 && iteration < maxIter-1 {
			s.Logf("[agent-loop] req=%s agent=%s pause_turn at iteration %d, continuing",
				reqID, config.ID, iteration+1)
			pauseMsg := svc.StreamMessage{
				ID:      reqID,
				Type:    "progress",
				Content: fmt.Sprintf("[%s] Continuing... (paused by server)", config.Name),
			}
			pauseData, _ := json.Marshal(pauseMsg)
			conn.Write(append(pauseData, '\n'))
			messages = append(messages, providers.ChatMessageWithTools{
				Role:    "assistant",
				Content: accumulatedContent,
			})
			continue
		}

		if len(toolCalls) == 0 {
			if len(agentTools) > 0 && len(result.ToolsUsed) == 0 && iteration < maxIter-1 {
				s.Logf("[agent-loop] req=%s agent=%s nudging — has %d tools but used 0",
					reqID, config.ID, len(agentTools))
				nudgeMsg := svc.StreamMessage{
					ID:      reqID,
					Type:    "progress",
					Content: fmt.Sprintf("[%s] Preparing...", config.Name),
				}
				nudgeData, _ := json.Marshal(nudgeMsg)
				conn.Write(append(nudgeData, '\n'))
				messages = append(messages, providers.ChatMessageWithTools{
					Role:    "assistant",
					Content: accumulatedContent,
				})
				messages = append(messages, providers.ChatMessageWithTools{
					Role:    "user",
					Content: "You must call your tools now. Do NOT describe what you will do — execute the tool calls immediately. Start with your first tool call.",
				})
				continue
			}

			result.Content = accumulatedContent
			result.Iterations = iteration + 1
			result.Duration = time.Since(start)
			result.FinalMessage = accumulatedContent
			s.Logf("[agent-loop] req=%s agent=%s completed iterations=%d tools=%d duration=%dms",
				reqID, config.ID, result.Iterations, len(result.ToolsUsed), result.Duration.Milliseconds())
			return result, nil
		}

		if accumulatedContent != "" {
			thinkingMsg := svc.StreamMessage{
				ID:      reqID,
				Type:    "thinking",
				Content: fmt.Sprintf("[%s] %s", config.Name, strings.TrimSpace(accumulatedContent)),
			}
			thinkingData, _ := json.Marshal(thinkingMsg)
			conn.Write(append(thinkingData, '\n'))
		}

		messages = append(messages, providers.ChatMessageWithTools{
			Role:      "assistant",
			Content:   accumulatedContent,
			ToolCalls: toolCalls,
		})

		var toolNames []string
		for _, tc := range toolCalls {
			toolNames = append(toolNames, compaction.FormatToolNameHuman(tc.Function.Name))
		}
		statusMsg := svc.StreamMessage{
			ID:      reqID,
			Type:    "tool_status",
			Content: fmt.Sprintf("Running: %s", strings.Join(toolNames, ", ")),
		}
		statusData, _ := json.Marshal(statusMsg)
		conn.Write(append(statusData, '\n'))

		for _, tc := range toolCalls {
			toolCallMsg := svc.StreamMessage{
				ID:      reqID,
				Type:    "tool_call",
				Content: fmt.Sprintf(`{"name":"%s","arguments":%s,"id":"%s"}`, tc.Function.Name, tc.Function.Arguments, tc.ID),
			}
			toolCallData, _ := json.Marshal(toolCallMsg)
			conn.Write(append(toolCallData, '\n'))

			if tc.Function.Name == "dispatch_to_agent" && conductor != nil {
				var dArgs struct {
					AgentID string `json:"agent_id"`
					Task    string `json:"task"`
					Context string `json:"context"`
				}
				if jsonErr := json.Unmarshal([]byte(tc.Function.Arguments), &dArgs); jsonErr != nil {
					messages = append(messages, providers.ChatMessageWithTools{
						Role: "tool", Content: fmt.Sprintf(`{"error":"invalid dispatch arguments: %s"}`, jsonErr.Error()), ToolCallID: tc.ID,
					})
					totalToolCalls++
					toolCallCounts[tc.Function.Name]++
					continue
				}
				if !config.CanInvoke(dArgs.AgentID) {
					messages = append(messages, providers.ChatMessageWithTools{
						Role: "tool", Content: fmt.Sprintf(`{"error":"agent %q is not allowed to invoke %q"}`, config.ID, dArgs.AgentID), ToolCallID: tc.ID,
					})
					totalToolCalls++
					toolCallCounts[tc.Function.Name]++
					continue
				}
				s.Logf("[dispatch] req=%s dispatching to sub-agent %s via conductor", reqID, dArgs.AgentID)
				subResp, subErr := conductor.Dispatch(&agents.DispatchRequest{
					AgentID:     dArgs.AgentID,
					Task:        dArgs.Task,
					ContextJSON: dArgs.Context,
					SessionID:   session.ID,
					Model:       dispReq.Model,
				})
				resultContent := ""
				if subErr != nil {
					resultContent = fmt.Sprintf(`{"error":%s}`, strconv.Quote(subErr.Error()))
				} else if subResp.Result != nil {
					resultContent = subResp.Result.Content
				}
				messages = append(messages, providers.ChatMessageWithTools{
					Role: "tool", Content: resultContent, ToolCallID: tc.ID,
				})
				totalToolCalls++
				toolCallCounts[tc.Function.Name]++
				continue
			}

			s.SendDebug(conn, reqID, fmt.Sprintf("🔧 Calling tool: %s", tc.Function.Name))

			callKey := tc.Function.Name + ":" + tc.Function.Arguments
			sameArgsCalls[callKey]++

			if tc.Function.Name == "search_images" && sameArgsCalls[callKey] > 1 {
				messages = append(messages, providers.ChatMessageWithTools{
					Role: "tool", Content: `{"error": "Already searched for this. Use the URL from the previous result."}`, ToolCallID: tc.ID,
				})
				totalToolCalls++
				toolCallCounts[tc.Function.Name]++
				continue
			}
			if tc.Function.Name != "search_images" && sameArgsCalls[callKey] > 1 {
				s.SendDebug(conn, reqID, fmt.Sprintf("⚠️ Skipping duplicate: %s", tc.Function.Name))
				messages = append(messages, providers.ChatMessageWithTools{
					Role: "tool", Content: fmt.Sprintf(`{"error": "Duplicate call — %s was already called with these exact arguments."}`, tc.Function.Name), ToolCallID: tc.ID,
				})
				totalToolCalls++
				toolCallCounts[tc.Function.Name]++
				continue
			}

			toolCallCounts[tc.Function.Name]++
			totalToolCalls++
			if toolCallCounts[tc.Function.Name] > maxCallsPerTool {
				s.Logf("[agent-loop] req=%s tool %s hit per-tool limit %d", reqID, tc.Function.Name, maxCallsPerTool)
				result.Content = fmt.Sprintf("Tool '%s' called %d times, stopping to prevent loop.", tc.Function.Name, toolCallCounts[tc.Function.Name])
				result.Iterations = iteration + 1
				result.Duration = time.Since(start)
				return result, nil
			}
			if totalToolCalls > maxTotalToolCalls {
				s.Logf("[agent-loop] req=%s hit total tool limit %d", reqID, maxTotalToolCalls)
				result.Content = fmt.Sprintf("Total %d tool calls reached, stopping.", totalToolCalls)
				result.Iterations = iteration + 1
				result.Duration = time.Since(start)
				return result, nil
			}

			// Enforce tool allowlist at execution time — block hallucinated tool calls
			if len(allowedToolSet) > 0 && !allowedToolSet[tc.Function.Name] {
				s.Logf("[agent-loop] req=%s agent=%s BLOCKED tool %s (not in allowlist)", reqID, config.ID, tc.Function.Name)
				s.SendDebug(conn, reqID, fmt.Sprintf("🚫 Blocked tool: %s (not allowed for agent %s)", tc.Function.Name, config.ID))
				messages = append(messages, providers.ChatMessageWithTools{
					Role: "tool", Content: fmt.Sprintf(`{"error":"Tool '%s' is not available for this agent. Use only your assigned tools."}`, tc.Function.Name), ToolCallID: tc.ID,
				})
				continue
			}

			toolStart := time.Now()
			toolResult := s.ExecuteTool(tc, apiClient, localData)
			toolDurationMs := time.Since(toolStart).Milliseconds()

			s.Logf("[agent-loop] req=%s agent=%s tool=%s duration=%dms error=%v",
				reqID, config.ID, tc.Function.Name, toolDurationMs, toolResult.IsError)

			toolStatusMsg := svc.StreamMessage{
				ID:      reqID,
				Type:    "tool_status",
				Content: fmt.Sprintf("[%s] %s completed (%dms)", config.Name, tc.Function.Name, toolDurationMs),
			}
			toolStatusData, _ := json.Marshal(toolStatusMsg)
			conn.Write(append(toolStatusData, '\n'))

			toolResultStreamMsg := svc.StreamMessage{
				ID:      reqID,
				Type:    "tool_result",
				Content: toolResult.Content,
			}
			toolResultData, _ := json.Marshal(toolResultStreamMsg)
			conn.Write(append(toolResultData, '\n'))

			if toolResult.IsError {
				toolErrorContent := fmt.Sprintf(`{"tool":%s,"error":%s,"iteration":%d,"duration_ms":%d}`,
					strconv.Quote(tc.Function.Name), strconv.Quote(toolResult.Content), iteration, toolDurationMs)
				toolErrorMsg := svc.StreamMessage{
					ID:      reqID,
					Type:    "tool_error",
					Content: toolErrorContent,
				}
				toolErrorData, _ := json.Marshal(toolErrorMsg)
				conn.Write(append(toolErrorData, '\n'))
			}

			messages = append(messages, providers.ChatMessageWithTools{
				Role:       "tool",
				Content:    toolResult.Content,
				ToolCallID: tc.ID,
			})

			if tc.Function.Name == "create_ui_screen" || tc.Function.Name == "create_design_element" {
				var toolResp map[string]interface{}
				if err := json.Unmarshal([]byte(toolResult.Content), &toolResp); err == nil {
					var screenNode map[string]interface{}
					if action, _ := toolResp["action"].(string); action == "create_screen" {
						screenNode, _ = toolResp["screen"].(map[string]interface{})
					} else if action == "create_element" {
						if elem, ok := toolResp["element"].(map[string]interface{}); ok {
							if elemType, _ := elem["type"].(string); elemType == "screen" {
								screenNode = elem
							}
						}
					}
					if screenNode != nil {
						if localData == nil {
							localData = make(map[string]interface{})
						}
						canvasData, _ := localData["canvas_data"].([]interface{})
						localData["canvas_data"] = append(canvasData, screenNode)
					}
				}
			}

			result.ToolsUsed = append(result.ToolsUsed, tc.Function.Name)
		}

		if totalToolCalls > 2 {
			beforeTokens := compaction.EstimateTokens(messages)
			messages = compaction.CompactToolResults(messages, 2)
			messages = compaction.CompactAssistantThinking(messages, 2)
			afterTokens := compaction.EstimateTokens(messages)
			if beforeTokens != afterTokens {
				s.Logf("[compact] req=%s %dk → %dk tokens (%.0f%% reduction)",
					reqID, beforeTokens/1000, afterTokens/1000,
					float64(beforeTokens-afterTokens)/float64(beforeTokens)*100)
			}
		}
	}

	result.Content = fmt.Sprintf("Agent %s reached maximum iterations (%d)", config.ID, maxIter)
	result.Iterations = maxIter
	result.Duration = time.Since(start)
	s.Logf("[agent-loop] req=%s agent=%s hit max iterations=%d tools=%d duration=%dms",
		reqID, config.ID, maxIter, len(result.ToolsUsed), result.Duration.Milliseconds())
	return result, nil
}
