package compaction

import (
	"fmt"
	"strings"
	"testing"

	"construct-context/providers"
)

func TestCompactToolResults_PreservesLastN(t *testing.T) {
	// Build messages: system + assistant(with tool calls) + 5 tool results
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "You are a design assistant."},
	}

	// Create 5 tool call + tool result pairs
	for i := range 5 {
		toolCallID := fmt.Sprintf("tc_%d", i)
		messages = append(messages, providers.ChatMessageWithTools{
			Role: "assistant",
			ToolCalls: []providers.ToolCall{
				{
					ID:   toolCallID,
					Type: "function",
					Function: providers.FunctionCall{
						Name:      "get_lucide_icon",
						Arguments: fmt.Sprintf(`{"name":"icon_%d"}`, i),
					},
				},
			},
		})
		messages = append(messages, providers.ChatMessageWithTools{
			Role:       "tool",
			Content:    fmt.Sprintf(`{"name":"icon_%d","path_data":"M0 0 L10 10 Z ...long svg data repeating... %s"}`, i, strings.Repeat("x", 500)),
			ToolCallID: toolCallID,
		})
	}

	result := CompactToolResults(messages, 3)

	if len(result) != len(messages) {
		t.Fatalf("expected %d messages, got %d", len(messages), len(result))
	}

	// First 2 tool results (indices 2 and 4) should be compacted
	compactedCount := 0
	preservedCount := 0
	for _, msg := range result {
		if msg.Role != "tool" {
			continue
		}
		content, ok := msg.Content.(string)
		if !ok {
			t.Fatal("tool result content is not a string")
		}
		if strings.HasPrefix(content, "[Icon '") {
			compactedCount++
		} else {
			preservedCount++
		}
	}

	if compactedCount != 2 {
		t.Errorf("expected 2 compacted tool results, got %d", compactedCount)
	}
	if preservedCount != 3 {
		t.Errorf("expected 3 preserved tool results, got %d", preservedCount)
	}
}

func TestCompactToolResults_NoopWhenFewResults(t *testing.T) {
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "system"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_1", Type: "function", Function: providers.FunctionCall{Name: "get_lucide_icon", Arguments: `{"name":"x"}`}},
		}},
		{Role: "tool", Content: `{"name":"x","path_data":"M0 0"}`, ToolCallID: "tc_1"},
	}

	result := CompactToolResults(messages, 3)

	// Should be unchanged since only 1 tool result < keepLastN=3
	for i := range messages {
		if result[i].Role != messages[i].Role {
			t.Errorf("message %d role changed: %s -> %s", i, messages[i].Role, result[i].Role)
		}
	}
	// Content should be preserved
	toolContent, _ := result[2].Content.(string)
	if !strings.Contains(toolContent, "path_data") {
		t.Error("expected tool result content to be preserved unchanged")
	}
}

func TestCompactToolResults_CanvasStateCompaction(t *testing.T) {
	// Build valid JSON with large canvas state
	var screenEntries []string
	for i := range 5 {
		var elemEntries []string
		for j := range 50 {
			elemEntries = append(elemEntries, fmt.Sprintf(`{"id":"e%d_%d","type":"rectangle","x":0,"y":0}`, i, j))
		}
		screenEntries = append(screenEntries, fmt.Sprintf(
			`{"id":"s%d","name":"Screen_%d","x":%d,"y":0,"width":1200,"height":800,"elements":[%s]}`,
			i, i, i*1280, strings.Join(elemEntries, ",")))
	}
	largeCanvasState := fmt.Sprintf(
		`{"action":"canvas_state","screen_count":5,"total_elements":120,"suggested_x":1250,"suggested_y":100,"screens":[%s]}`,
		strings.Join(screenEntries, ","))

	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "system"},
		// Old canvas state (should be compacted)
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_canvas", Type: "function", Function: providers.FunctionCall{Name: "get_canvas_state", Arguments: `{}`}},
		}},
		{Role: "tool", Content: largeCanvasState, ToolCallID: "tc_canvas"},
		// 3 recent tool results (should be preserved)
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_r1", Type: "function", Function: providers.FunctionCall{Name: "create_design_element", Arguments: `{}`}},
		}},
		{Role: "tool", Content: `{"element":{"type":"rect","id":"e1","x":10,"y":20}}`, ToolCallID: "tc_r1"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_r2", Type: "function", Function: providers.FunctionCall{Name: "create_design_element", Arguments: `{}`}},
		}},
		{Role: "tool", Content: `{"element":{"type":"text","id":"e2","x":30,"y":40}}`, ToolCallID: "tc_r2"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_r3", Type: "function", Function: providers.FunctionCall{Name: "get_lucide_icon", Arguments: `{"name":"check"}`}},
		}},
		{Role: "tool", Content: `{"name":"check","path_data":"M5 12l5 5L20 7"}`, ToolCallID: "tc_r3"},
	}

	result := CompactToolResults(messages, 3)

	// Canvas state (index 2) should be compacted
	canvasContent, _ := result[2].Content.(string)
	if !strings.HasPrefix(canvasContent, "[Canvas state:") {
		t.Errorf("expected canvas state to be compacted, got: %s", canvasContent[:min(len(canvasContent), 100)])
	}
	if !strings.Contains(canvasContent, "5 screens") {
		t.Errorf("expected compacted canvas to mention screen count, got: %s", canvasContent)
	}
	if !strings.Contains(canvasContent, "1250") {
		t.Errorf("expected compacted canvas to preserve suggested_x, got: %s", canvasContent)
	}

	// Last 3 tool results should be preserved verbatim
	r1Content, _ := result[4].Content.(string)
	if !strings.Contains(r1Content, `"type":"rect"`) {
		t.Error("expected recent tool result 1 to be preserved")
	}
	r2Content, _ := result[6].Content.(string)
	if !strings.Contains(r2Content, `"type":"text"`) {
		t.Error("expected recent tool result 2 to be preserved")
	}
	r3Content, _ := result[8].Content.(string)
	if !strings.Contains(r3Content, "path_data") {
		t.Error("expected recent tool result 3 to be preserved")
	}

	// Verify significant size reduction
	originalSize := 0
	compactedSize := 0
	for i, msg := range messages {
		if s, ok := msg.Content.(string); ok {
			originalSize += len(s)
		}
		if s, ok := result[i].Content.(string); ok {
			compactedSize += len(s)
		}
	}
	reduction := float64(originalSize-compactedSize) / float64(originalSize) * 100
	if reduction < 50 {
		t.Errorf("expected >50%% size reduction, got %.0f%% (original=%d, compacted=%d)", reduction, originalSize, compactedSize)
	}
}

func TestCompactToolResults_SkipsAlreadyCompacted(t *testing.T) {
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "system"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_1", Type: "function", Function: providers.FunctionCall{Name: "get_canvas_state", Arguments: `{}`}},
		}},
		// Already compacted (starts with "[")
		{Role: "tool", Content: "[Canvas state: 3 screens, 50 elements — call get_canvas_state again for current data]", ToolCallID: "tc_1"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_2", Type: "function", Function: providers.FunctionCall{Name: "get_lucide_icon", Arguments: `{"name":"x"}`}},
		}},
		{Role: "tool", Content: `{"name":"x","path_data":"M0 0 L10 10"}`, ToolCallID: "tc_2"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_3", Type: "function", Function: providers.FunctionCall{Name: "get_lucide_icon", Arguments: `{"name":"y"}`}},
		}},
		{Role: "tool", Content: `{"name":"y","path_data":"M0 0 L20 20"}`, ToolCallID: "tc_3"},
		{Role: "assistant", ToolCalls: []providers.ToolCall{
			{ID: "tc_4", Type: "function", Function: providers.FunctionCall{Name: "get_lucide_icon", Arguments: `{"name":"z"}`}},
		}},
		{Role: "tool", Content: `{"name":"z","path_data":"M0 0 L30 30"}`, ToolCallID: "tc_4"},
	}

	result := CompactToolResults(messages, 3)

	// The already-compacted message should NOT be double-compacted
	content, _ := result[2].Content.(string)
	if content != "[Canvas state: 3 screens, 50 elements — call get_canvas_state again for current data]" {
		t.Errorf("already-compacted message was modified: %s", content)
	}
}

func TestCompactToolContent_GenericFallback(t *testing.T) {
	longContent := strings.Repeat("a", 400)
	result := CompactToolContent("unknown_tool", longContent)
	if len(result) > 250 {
		t.Errorf("expected truncation, got length %d", len(result))
	}
	if !strings.HasSuffix(result, "... [truncated]") {
		t.Errorf("expected truncation suffix, got: %s", result)
	}
}

func TestCompactToolContent_ShortContentUnchanged(t *testing.T) {
	short := `{"status":"ok"}`
	result := CompactToolContent("unknown_tool", short)
	if result != short {
		t.Errorf("expected short content unchanged, got: %s", result)
	}
}

func TestCompactToolContent_CreateUiScreen(t *testing.T) {
	content := `{"action":"create_screen","screen":{"name":"Dashboard","id":"s1"},"elements":[{"id":"e1"},{"id":"e2"},{"id":"e3"}]}`
	result := CompactToolContent("create_ui_screen", content)
	if !strings.Contains(result, "Dashboard") {
		t.Error("expected screen name in compacted result")
	}
	if !strings.Contains(result, "3 elements") {
		t.Error("expected element count in compacted result")
	}
}

func TestCompactToolContent_SearchImages(t *testing.T) {
	content := `{"query":"sunset beach","results":[{"url":"http://a.com/1.jpg"},{"url":"http://a.com/2.jpg"}]}`
	result := CompactToolContent("search_images", content)
	if !strings.Contains(result, "2 images") {
		t.Error("expected image count")
	}
	if !strings.Contains(result, "sunset beach") {
		t.Error("expected query in compacted result")
	}
}

func TestCompactAssistantThinking(t *testing.T) {
	// Build messages with assistant thinking + tool calls
	longThinking := strings.Repeat("This is reasoning text. ", 50) // ~1200 chars
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "system"},
	}

	// 4 iterations of thinking + tool calls
	for i := range 4 {
		messages = append(messages, providers.ChatMessageWithTools{
			Role:    "assistant",
			Content: fmt.Sprintf("Iteration %d: %s", i, longThinking),
			ToolCalls: []providers.ToolCall{
				{ID: fmt.Sprintf("tc_%d", i), Type: "function", Function: providers.FunctionCall{Name: "create_design_element", Arguments: `{}`}},
			},
		})
		messages = append(messages, providers.ChatMessageWithTools{
			Role:       "tool",
			Content:    `{"element":{"type":"rect","id":"e1"}}`,
			ToolCallID: fmt.Sprintf("tc_%d", i),
		})
	}

	result := CompactAssistantThinking(messages, 2)

	if len(result) != len(messages) {
		t.Fatalf("expected %d messages, got %d", len(messages), len(result))
	}

	// First 2 assistant messages (indices 1, 3) should be truncated
	truncatedCount := 0
	preservedCount := 0
	for _, msg := range result {
		if msg.Role != "assistant" || len(msg.ToolCalls) == 0 {
			continue
		}
		content, _ := msg.Content.(string)
		if strings.Contains(content, "[reasoning truncated]") {
			truncatedCount++
			if len(content) > 250 {
				t.Errorf("truncated content too long: %d chars", len(content))
			}
		} else {
			preservedCount++
		}
	}

	if truncatedCount != 2 {
		t.Errorf("expected 2 truncated thinking messages, got %d", truncatedCount)
	}
	if preservedCount != 2 {
		t.Errorf("expected 2 preserved thinking messages, got %d", preservedCount)
	}
}

func TestFormatToolNameHuman(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"get_canvas_state", "Get Canvas State"},
		{"create_ui_screen", "Create Screen"},
		{"create_design_element", "Create Element"},
		{"update_design_element", "Update Element"},
		{"get_lucide_icon", "Get Icon"},
		{"search_images", "Search Images"},
		{"create_plan", "Create Plan"},
		{"some_unknown_tool", "Some Unknown Tool"},
	}

	for _, tt := range tests {
		result := FormatToolNameHuman(tt.input)
		if result != tt.expected {
			t.Errorf("FormatToolNameHuman(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestCompactToolResults_KeepLastN2(t *testing.T) {
	// Test with keepLastN=2 (the new default at the call site)
	messages := []providers.ChatMessageWithTools{
		{Role: "system", Content: "system"},
	}

	for i := range 5 {
		toolCallID := fmt.Sprintf("tc_%d", i)
		messages = append(messages, providers.ChatMessageWithTools{
			Role: "assistant",
			ToolCalls: []providers.ToolCall{
				{ID: toolCallID, Type: "function", Function: providers.FunctionCall{
					Name: "get_lucide_icon", Arguments: fmt.Sprintf(`{"name":"icon_%d"}`, i),
				}},
			},
		})
		messages = append(messages, providers.ChatMessageWithTools{
			Role:       "tool",
			Content:    fmt.Sprintf(`{"name":"icon_%d","path_data":"M0 0 L10 10 Z %s"}`, i, strings.Repeat("x", 500)),
			ToolCallID: toolCallID,
		})
	}

	result := CompactToolResults(messages, 2)

	compactedCount := 0
	preservedCount := 0
	for _, msg := range result {
		if msg.Role != "tool" {
			continue
		}
		content, _ := msg.Content.(string)
		if strings.HasPrefix(content, "[Icon '") {
			compactedCount++
		} else {
			preservedCount++
		}
	}

	if compactedCount != 3 {
		t.Errorf("expected 3 compacted (5-2=3), got %d", compactedCount)
	}
	if preservedCount != 2 {
		t.Errorf("expected 2 preserved, got %d", preservedCount)
	}
}
