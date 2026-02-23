package compaction

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"construct-context/providers"
)

// StripThinkTags removes <think>...</think> blocks from model output.
// Models are instructed to put reasoning inside these tags; we strip them before sending to the user.
func StripThinkTags(content string) string {
	re := regexp.MustCompile(`(?s)<think>.*?</think>`)
	return re.ReplaceAllString(content, "")
}

// TruncateString truncates a string to maxLen characters
func TruncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// EstimateTokens provides a rough token count for a message list.
// Uses chars/4 heuristic which is close enough for threshold checking.
// Counts message content, tool call arguments, and tool result content.
func EstimateTokens(messages []providers.ChatMessageWithTools) int {
	total := 0
	for _, msg := range messages {
		switch v := msg.Content.(type) {
		case string:
			total += len(v) / 4
		default:
			// For multimodal content, marshal and estimate
			if data, err := json.Marshal(v); err == nil {
				total += len(data) / 4
			}
		}
		// Count tool call arguments
		for _, tc := range msg.ToolCalls {
			total += len(tc.Function.Arguments) / 4
		}
		// Count tool call ID overhead (tool result messages reference these)
		if msg.ToolCallID != "" {
			total += 10 // small overhead per tool result message
		}
	}
	return total
}

// CompactToolResults walks allMessages and compacts old tool-result messages to reduce
// context bloat during multi-iteration agentic loops. The last keepLastN tool results
// are preserved verbatim; older ones get content-aware summaries based on tool name.
// Only modifies messages with Role=="tool". Returns a new slice (does not mutate input).
func CompactToolResults(messages []providers.ChatMessageWithTools, keepLastN int) []providers.ChatMessageWithTools {
	if keepLastN <= 0 {
		keepLastN = 3
	}

	// Build map from tool_call_id -> tool_name by scanning assistant messages
	toolCallNames := make(map[string]string)
	for _, msg := range messages {
		if msg.Role == "assistant" {
			for _, tc := range msg.ToolCalls {
				toolCallNames[tc.ID] = tc.Function.Name
			}
		}
	}

	// Collect indices of tool-result messages
	var toolResultIndices []int
	for i, msg := range messages {
		if msg.Role == "tool" {
			toolResultIndices = append(toolResultIndices, i)
		}
	}

	// Nothing to compact if we have fewer tool results than the keep threshold
	if len(toolResultIndices) <= keepLastN {
		return messages
	}

	// Copy the slice so we don't mutate the caller's data
	result := make([]providers.ChatMessageWithTools, len(messages))
	copy(result, messages)

	// Compact everything except the last keepLastN tool results
	compactBoundary := len(toolResultIndices) - keepLastN
	for _, idx := range toolResultIndices[:compactBoundary] {
		msg := result[idx]
		content, ok := msg.Content.(string)
		if !ok {
			continue
		}
		// Skip already-compacted results (starts with "[")
		if len(content) > 0 && content[0] == '[' {
			continue
		}
		toolName := toolCallNames[msg.ToolCallID]
		compacted := CompactToolContent(toolName, content)
		result[idx] = providers.ChatMessageWithTools{
			Role:       msg.Role,
			Content:    compacted,
			ToolCallID: msg.ToolCallID,
		}
	}

	return result
}

// CompactToolContent produces a short summary of a tool result based on the tool name.
// Known design tools get structured summaries; unknown tools get truncated.
func CompactToolContent(toolName, content string) string {
	switch toolName {
	case "get_canvas_state":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			sc, _ := resp["screen_count"]
			te, _ := resp["total_elements"]
			sx, _ := resp["suggested_x"]
			sy, _ := resp["suggested_y"]
			return fmt.Sprintf("[Canvas state: %v screens, %v elements, suggested_x=%.0f, suggested_y=%.0f — call get_canvas_state again for current data]",
				sc, te, ToFloat(sx), ToFloat(sy))
		}
		return "[Canvas state retrieved — call get_canvas_state again for current data]"

	case "create_ui_screen":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if screen, ok := resp["screen"].(map[string]interface{}); ok {
				name, _ := screen["name"].(string)
				elemCount := 0
				if elems, ok := resp["elements"].([]interface{}); ok {
					elemCount = len(elems)
				}
				return fmt.Sprintf("[Created screen '%s' with %d elements]", name, elemCount)
			}
		}
		return "[Screen created]"

	case "create_design_element":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if elem, ok := resp["element"].(map[string]interface{}); ok {
				elemType, _ := elem["type"].(string)
				id, _ := elem["id"].(string)
				x := ToFloat(elem["x"])
				y := ToFloat(elem["y"])
				return fmt.Sprintf("[Created element '%s' id=%s at (%.0f,%.0f)]", elemType, id, x, y)
			}
		}
		return "[Element created]"

	case "update_design_element":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			id, _ := resp["element_id"].(string)
			if id == "" {
				if elem, ok := resp["element"].(map[string]interface{}); ok {
					id, _ = elem["id"].(string)
				}
			}
			return fmt.Sprintf("[Updated element id=%s]", id)
		}
		return "[Element updated]"

	case "search_images":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if results, ok := resp["results"].([]interface{}); ok {
				query, _ := resp["query"].(string)
				return fmt.Sprintf("[Found %d images for '%s']", len(results), query)
			}
		}
		return "[Image search completed]"

	case "get_lucide_icon":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			name, _ := resp["name"].(string)
			return fmt.Sprintf("[Icon '%s' SVG retrieved]", name)
		}
		return "[Icon SVG retrieved]"

	case "search_icons":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if results, ok := resp["icons"].([]interface{}); ok {
				query, _ := resp["query"].(string)
				return fmt.Sprintf("[Found %d icons for '%s']", len(results), query)
			}
		}
		return "[Icon search completed]"

	case "create_plan":
		// Plans are small and useful context — keep a truncated version
		if len(content) > 500 {
			return content[:500] + "... [plan truncated]"
		}
		return content

	// --- File & code tools ---
	case "read_file":
		lines := strings.Count(content, "\n")
		if lines > 5 {
			return fmt.Sprintf("[Read file: %d lines, %d chars — call read_file again if needed]", lines, len(content))
		}
		return content

	case "list_directory", "get_file_tree":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if entries, ok := resp["entries"].([]interface{}); ok {
				return fmt.Sprintf("[Directory listing: %d entries]", len(entries))
			}
			if tree, ok := resp["tree"].(string); ok {
				lines := strings.Count(tree, "\n")
				return fmt.Sprintf("[File tree: %d lines]", lines)
			}
		}
		lines := strings.Count(content, "\n")
		return fmt.Sprintf("[Directory: %d lines]", lines)

	case "file_search", "grep_search":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if results, ok := resp["results"].([]interface{}); ok {
				query, _ := resp["query"].(string)
				return fmt.Sprintf("[Search '%s': %d results found]", query, len(results))
			}
			if matches, ok := resp["matches"].([]interface{}); ok {
				return fmt.Sprintf("[Search: %d matches found]", len(matches))
			}
		}
		return fmt.Sprintf("[Search completed: %d chars]", len(content))

	case "run_command":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			exitCode, _ := resp["exit_code"]
			cmd, _ := resp["command"].(string)
			if cmd != "" {
				return fmt.Sprintf("[Ran '%s': exit=%v]", TruncateString(cmd, 60), exitCode)
			}
		}
		return fmt.Sprintf("[Command completed: %d chars output]", len(content))

	// --- Git tools ---
	case "git_status":
		return "[Git status retrieved — call git_status again for current state]"

	case "git_log":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if commits, ok := resp["commits"].([]interface{}); ok {
				return fmt.Sprintf("[Git log: %d commits]", len(commits))
			}
		}
		return "[Git log retrieved]"

	// --- Project/context tools ---
	case "get_current_context":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			project, _ := resp["project"].(map[string]interface{})
			if project != nil {
				name, _ := project["name"].(string)
				return fmt.Sprintf("[Context: project='%s']", name)
			}
		}
		return "[Context retrieved]"

	case "get_project":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			name, _ := resp["name"].(string)
			if name != "" {
				return fmt.Sprintf("[Project '%s' details retrieved]", name)
			}
		}
		return "[Project details retrieved]"

	case "list_projects":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if projects, ok := resp["projects"].([]interface{}); ok {
				return fmt.Sprintf("[Listed %d projects]", len(projects))
			}
		}
		// Try as array directly
		var arr []interface{}
		if err := json.Unmarshal([]byte(content), &arr); err == nil {
			return fmt.Sprintf("[Listed %d projects]", len(arr))
		}
		return "[Projects listed]"

	case "list_project_designs":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if designs, ok := resp["designs"].([]interface{}); ok {
				return fmt.Sprintf("[Listed %d designs]", len(designs))
			}
		}
		return "[Designs listed]"

	case "list_tasks", "list_my_tasks", "list_project_tasks":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if tasks, ok := resp["tasks"].([]interface{}); ok {
				return fmt.Sprintf("[Listed %d tasks]", len(tasks))
			}
		}
		var arr []interface{}
		if err := json.Unmarshal([]byte(content), &arr); err == nil {
			return fmt.Sprintf("[Listed %d tasks]", len(arr))
		}
		return "[Tasks listed]"

	// --- Media/web tools ---
	case "web_search":
		var resp map[string]interface{}
		if err := json.Unmarshal([]byte(content), &resp); err == nil {
			if results, ok := resp["results"].([]interface{}); ok {
				query, _ := resp["query"].(string)
				return fmt.Sprintf("[Web search '%s': %d results]", TruncateString(query, 40), len(results))
			}
		}
		return "[Web search completed]"

	case "read_url":
		if len(content) > 300 {
			return content[:300] + "... [URL content truncated, call read_url again if needed]"
		}
		return content

	case "delete_design_element":
		return "[Element deleted]"
	}

	// Smart generic fallback: try to extract structure from JSON before truncating
	if len(content) > 300 {
		return compactGenericJSON(toolName, content)
	}
	return content
}

// compactGenericJSON attempts to extract meaningful info from a JSON tool result.
// Falls back to truncation if parsing fails.
func compactGenericJSON(toolName string, content string) string {
	// Try as JSON object
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(content), &obj); err == nil {
		// Check for common patterns
		if errMsg, ok := obj["error"].(string); ok {
			return fmt.Sprintf("[%s error: %s]", toolName, TruncateString(errMsg, 100))
		}
		if success, ok := obj["success"].(bool); ok {
			status := "succeeded"
			if !success {
				status = "failed"
			}
			// Count array fields to report record counts
			for key, val := range obj {
				if arr, ok := val.([]interface{}); ok {
					return fmt.Sprintf("[%s %s: %d %s]", toolName, status, len(arr), key)
				}
			}
			return fmt.Sprintf("[%s %s]", toolName, status)
		}
		// Report key count
		return fmt.Sprintf("[%s: object with %d fields (%d chars) — call again if needed]", toolName, len(obj), len(content))
	}

	// Try as JSON array
	var arr []interface{}
	if err := json.Unmarshal([]byte(content), &arr); err == nil {
		return fmt.Sprintf("[%s: %d items]", toolName, len(arr))
	}

	// Not JSON — truncate with line count for readability
	lines := strings.Count(content, "\n")
	if lines > 3 {
		return fmt.Sprintf("[%s: %d lines, %d chars — call again if needed]", toolName, lines, len(content))
	}
	return content[:200] + "... [truncated]"
}

// CompactAssistantThinking truncates old assistant "thinking" messages that precede tool calls.
// These accumulate across iterations (2-10KB each). After 15 iterations that's 75KB+ of stale reasoning.
// Keeps the last keepLastN assistant messages with tool calls verbatim; older ones get truncated to 200 chars.
func CompactAssistantThinking(messages []providers.ChatMessageWithTools, keepLastN int) []providers.ChatMessageWithTools {
	if keepLastN <= 0 {
		keepLastN = 2
	}

	// Find indices of assistant messages that have tool calls (these are "thinking" messages)
	var thinkingIndices []int
	for i, msg := range messages {
		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			content, ok := msg.Content.(string)
			if ok && len(content) > 200 {
				thinkingIndices = append(thinkingIndices, i)
			}
		}
	}

	if len(thinkingIndices) <= keepLastN {
		return messages
	}

	result := make([]providers.ChatMessageWithTools, len(messages))
	copy(result, messages)

	compactBoundary := len(thinkingIndices) - keepLastN
	for _, idx := range thinkingIndices[:compactBoundary] {
		msg := result[idx]
		content, _ := msg.Content.(string)
		truncated := content[:200] + " [reasoning truncated]"
		result[idx] = providers.ChatMessageWithTools{
			Role:      msg.Role,
			Content:   truncated,
			ToolCalls: msg.ToolCalls,
		}
	}

	return result
}

// FormatToolNameHuman converts snake_case tool names to human-readable Title Case.
// e.g. "get_canvas_state" → "Get Canvas State", "create_ui_screen" → "Create Screen"
func FormatToolNameHuman(name string) string {
	// Special short names for common tools
	switch name {
	case "create_ui_screen":
		return "Create Screen"
	case "create_design_element":
		return "Create Element"
	case "update_design_element":
		return "Update Element"
	case "get_canvas_state":
		return "Get Canvas State"
	case "get_lucide_icon":
		return "Get Icon"
	case "search_images":
		return "Search Images"
	case "search_icons":
		return "Search Icons"
	case "create_plan":
		return "Create Plan"
	}

	// Generic: split on underscores, title-case each word
	parts := strings.Split(name, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

// ToFloat converts an interface{} to float64 (handles float64 and json.Number).
func ToFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}

// GetModelContextLimit returns the context window size in tokens for known models.
func GetModelContextLimit(model string) int {
	name := providers.ExtractModelName(model)
	limits := map[string]int{
		// Anthropic
		"claude-opus-4-6":   200000,
		"claude-sonnet-4-6": 200000,
		"claude-sonnet-4-5": 200000,
		"claude-haiku-4-5":  200000,
		// Gemini
		"gemini-2.5-flash": 1000000,
		"gemini-2.5-pro":   1000000,
		// DeepSeek
		"deepseek-chat":     64000,
		"deepseek-reasoner": 64000,
		// ZAI / GLM
		"glm-4.7-flash": 128000,
		"glm-4-plus":    128000,
		// xAI
		"grok-3":      131072,
		"grok-3-mini": 131072,
		// MiMo
		"mimo-vl-7b-chat": 32000,
	}
	if limit, ok := limits[name]; ok {
		return limit
	}
	return 128000 // conservative default
}

// ToolEnabled checks whether a tool with the given name exists in the tools list.
func ToolEnabled(tools []providers.Tool, name string) bool {
	for _, t := range tools {
		if t.Function.Name == name {
			return true
		}
	}
	return false
}
