package svc

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"

	"construct-context/compaction"
	"construct-context/providers"
)

// MaybeSummarize checks if the conversation exceeds 75% of the model's context
// window and triggers a cheap-LLM summarization if so. Returns the (possibly
// compacted) message list and whether summarization occurred.
// Fail-open: returns original messages on any error.
// Only summarizes once per request — checks for existing [Context Summary] marker.
func (s *Service) MaybeSummarize(
	allMessages []providers.ChatMessageWithTools,
	model string,
	conn net.Conn,
	reqID string,
) ([]providers.ChatMessageWithTools, bool) {
	// Guard: skip if already summarized in this request (check for existing summary marker)
	for _, msg := range allMessages {
		if content, ok := msg.Content.(string); ok {
			if strings.HasPrefix(content, "[Context Summary") {
				return allMessages, false
			}
		}
	}

	tokenEst := compaction.EstimateTokens(allMessages)
	contextLimit := compaction.GetModelContextLimit(model)
	threshold := int(float64(contextLimit) * 0.75)

	if tokenEst < threshold {
		return allMessages, false
	}

	fmt.Fprintf(os.Stderr, "[summarize] Triggered: ~%dk tokens, limit %dk (%.0f%%)\n",
		tokenEst/1000, contextLimit/1000, float64(tokenEst)/float64(contextLimit)*100)

	// Find cheapest available model for summarization
	availableModels := s.Providers.AllModelIDs()
	summarizerModelID := providers.PreferredConductorModel(availableModels)
	if summarizerModelID == "" {
		fmt.Fprintf(os.Stderr, "[summarize] No summarizer model available, skipping\n")
		return allMessages, false
	}

	summarizerProvider, _ := s.Providers.GetProviderForModel(summarizerModelID)
	if summarizerProvider == nil {
		fmt.Fprintf(os.Stderr, "[summarize] Provider not found for %s, skipping\n", summarizerModelID)
		return allMessages, false
	}

	// Send progress to frontend
	progressMsg := StreamMessage{ID: reqID, Type: "progress", Content: "Compacting conversation context..."}
	if progressData, err := json.Marshal(progressMsg); err == nil {
		conn.Write(append(progressData, '\n'))
	}

	// Find the boundary: protect last 3 user turns, but always keep at least last 2 messages
	protectFromIndex := len(allMessages)
	turnCount := 0
	for i := len(allMessages) - 1; i >= 0; i-- {
		if allMessages[i].Role == "user" {
			turnCount++
			if turnCount >= 3 {
				protectFromIndex = i
				break
			}
		}
	}
	// Ensure minimum tail: always protect at least the last 2 messages (handles <3 turns)
	minProtect := len(allMessages) - 2
	if minProtect < 1 {
		minProtect = 1
	}
	if protectFromIndex > minProtect {
		protectFromIndex = minProtect
	}

	// Build text of messages to summarize (skip system prompt at index 0, up to protect boundary)
	// Include tool call info for tool-heavy sessions
	var historyText strings.Builder
	for i := 1; i < protectFromIndex; i++ {
		msg := allMessages[i]
		role := msg.Role
		content := ""
		if str, ok := msg.Content.(string); ok {
			content = str
		}

		// Include tool call summaries for assistant messages
		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			var toolInfo strings.Builder
			for _, tc := range msg.ToolCalls {
				args := tc.Function.Arguments
				if len(args) > 200 {
					args = args[:200] + "..."
				}
				fmt.Fprintf(&toolInfo, "\n  [tool: %s(%s)]", tc.Function.Name, args)
			}
			if content != "" {
				content += toolInfo.String()
			} else {
				content = toolInfo.String()
			}
		}

		// Include tool result content for tool-result messages
		if msg.Role == "tool" && content != "" {
			if len(content) > 500 {
				content = content[:500] + "...[truncated tool result]"
			}
		} else if content == "" {
			continue
		}

		// Truncate very long content to prevent blowing up summarizer
		if len(content) > 2000 {
			content = content[:2000] + "...[truncated]"
		}
		fmt.Fprintf(&historyText, "[%s]: %s\n\n", role, content)
	}

	if historyText.Len() == 0 {
		return allMessages, false
	}

	// Call the summarizer
	summarizerModel := providers.ExtractModelName(summarizerModelID)
	summary, err := summarizerProvider.Chat([]providers.ChatMessage{
		{Role: "system", Content: compaction.SummaryPrompt},
		{Role: "user", Content: "Here is the conversation to summarize:\n\n" + historyText.String()},
	}, summarizerModel)

	if err != nil {
		fmt.Fprintf(os.Stderr, "[summarize] Summarizer call failed: %v, continuing without compaction\n", err)
		return allMessages, false
	}

	fmt.Fprintf(os.Stderr, "[summarize] Summary generated (%d chars) using %s\n", len(summary), summarizerModelID)

	// Build compacted message list: system prompt + summary + protected turns
	compacted := make([]providers.ChatMessageWithTools, 0, 2+len(allMessages)-protectFromIndex)
	// Keep original system prompt
	compacted = append(compacted, allMessages[0])
	// Insert summary as system message
	compacted = append(compacted, providers.ChatMessageWithTools{
		Role:    "system",
		Content: "[Context Summary — earlier conversation was compacted]\n\n" + summary,
	})
	// Keep protected recent turns
	compacted = append(compacted, allMessages[protectFromIndex:]...)

	newTokenEst := compaction.EstimateTokens(compacted)
	fmt.Fprintf(os.Stderr, "[summarize] Compacted: %dk → %dk tokens (%d messages → %d)\n",
		tokenEst/1000, newTokenEst/1000, len(allMessages), len(compacted))

	return compacted, true
}
