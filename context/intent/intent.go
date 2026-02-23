package intent

import (
	"strings"

	"construct-context/compaction"
	"construct-context/providers"
)

// LastUserMessageText returns the most recent user message content.
func LastUserMessageText(messages []providers.ChatMessageWithTools) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if strings.ToLower(strings.TrimSpace(msg.Role)) != "user" {
			continue
		}
		if text, ok := msg.Content.(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

// IsActionableDesignRequest checks whether text expresses an actionable UI/design intent.
func IsActionableDesignRequest(text string) bool {
	text = strings.ToLower(strings.TrimSpace(text))
	if text == "" {
		return false
	}

	// Explicitly actionable UI intents.
	keywords := []string{
		"make ", "create ", "build ", "design ", "convert ", "redesign ", "update ", "change ",
		"edit ", "add ", "resize ", "adapt ", "generate ", "draw ", "mobile", "desktop", "tablet",
		"responsive", "version", "screen", "layout", "ui",
	}
	for _, k := range keywords {
		if strings.Contains(text, k) {
			return true
		}
	}
	return false
}

// IsContinuationConfirmation checks if user message is a short affirmative/continuation
// rather than a new instruction. Short messages (< 12 words) that don't contain
// new actionable keywords are likely confirmations like "yes", "sounds good",
// "perfect go ahead", "yep do it", etc.
func IsContinuationConfirmation(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	// Count words — short messages are likely confirmations
	words := strings.Fields(text)
	if len(words) > 12 {
		return false // Too long to be a simple confirmation — likely a new instruction
	}
	// If it contains design-specific nouns, it's a new request, not a confirmation
	lower := strings.ToLower(text)
	newRequestKeywords := []string{
		"instead", "different", "change to", "switch to", "not that", "wrong",
		"stop", "cancel", "don't", "remove", "delete", "undo",
	}
	for _, kw := range newRequestKeywords {
		if strings.Contains(lower, kw) {
			return false
		}
	}
	return true
}

// LastAssistantMessageText returns the most recent assistant message content.
func LastAssistantMessageText(messages []providers.ChatMessageWithTools) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if strings.ToLower(strings.TrimSpace(msg.Role)) != "assistant" {
			continue
		}
		if text, ok := msg.Content.(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

// IsTrivialNoActionReply checks if text is a trivial "done"/"ok" reply with no real action.
func IsTrivialNoActionReply(text string) bool {
	cleaned := strings.ToLower(strings.TrimSpace(text))
	switch cleaned {
	case "done", "done.", "completed", "completed.", "ok", "ok.", "okay", "okay.":
		return true
	}
	return false
}

// ShouldForceDesignToolRetry returns true when the model produced a text-only reply
// (no tool calls) for a request that clearly needs design tool execution.
func ShouldForceDesignToolRetry(tools []providers.Tool, allMessages []providers.ChatMessageWithTools, modelReply string) bool {
	// Apply only when design tools are available.
	if !compaction.ToolEnabled(tools, "create_ui_screen") || !compaction.ToolEnabled(tools, "create_design_element") {
		return false
	}

	userText := LastUserMessageText(allMessages)
	hasDesignIntent := IsActionableDesignRequest(userText)
	// Also check if user confirmed a previous design-related assistant message
	if !hasDesignIntent && IsContinuationConfirmation(userText) {
		assistantText := LastAssistantMessageText(allMessages)
		hasDesignIntent = IsActionableDesignRequest(assistantText)
	}
	if !hasDesignIntent {
		return false
	}

	// Retry when the model exits with a trivial completion or a "let me do X" promise without action.
	reply := strings.ToLower(strings.TrimSpace(modelReply))
	if IsTrivialNoActionReply(modelReply) {
		return true
	}
	// Also catch "Let me create X" / "I'll now build Y" without any tool calls
	promiseKeywords := []string{"let me ", "i'll ", "i will ", "now i'll ", "let's ", "going to "}
	for _, kw := range promiseKeywords {
		if strings.Contains(reply, kw) {
			return true
		}
	}
	return false
}
