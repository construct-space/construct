package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"strings"
)

// KanbanTools - Tools for Kanban space (design-to-task generation)
// Note: Task sync tools (list_project_tasks, get_task, sync_task) are in sync.go
// This file adds design-to-tasks generation and batch creation
func init() {
	category := &ToolCategory{
		Name:        "kanban",
		Description: "Kanban board tools for task generation from designs",
		Tools: []providers.Tool{
			MakeTool("generate_tasks_from_design",
				`Generate implementation tasks from a UI design. Analyzes design elements and creates development tasks.
Returns a list of suggested tasks with titles, descriptions, and priorities.

Example output:
{
  "design_name": "Landing Page",
  "tasks": [
    {"title": "Create landing page layout", "description": "Set up base component with 1440x1024 container", "priority": "high", "category": "setup"},
    {"title": "Implement navigation bar", "description": "Gray header bar, 52px height, full width", "priority": "high", "category": "component"},
    {"title": "Add hero heading", "description": "Main heading 'Make it satisfying', 107px font", "priority": "medium", "category": "content"}
  ]
}`,
				map[string]providers.Property{
					"design_name":   {Type: "string", Description: "Name of the design to analyze"},
					"design_json":   {Type: "string", Description: "JSON string of design nodes/elements"},
					"detail_level":  {Type: "string", Description: "Level of task detail: 'basic', 'detailed', 'comprehensive'"},
					"assignee_role": {Type: "string", Description: "Role to assign tasks to: 'frontend', 'backend', 'fullstack', 'designer'"},
				}, []string{"design_name", "design_json"}),

			MakeTool("create_tasks_batch",
				`Create multiple tasks at once for a project. Useful for bulk task creation from design analysis.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID to create tasks in"},
					"tasks":      {Type: "array", Description: "Array of task objects with title, description, priority, status"},
				}, []string{"project_id", "tasks"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("generate_tasks_from_design", executeGenerateTasksFromDesign)
	DefaultRegistry.RegisterExecutor("create_tasks_batch", executeCreateTasksBatch)
}

// DesignNode represents a UI element from a design
type DesignNode struct {
	ID           string      `json:"id"`
	Type         string      `json:"type"`
	Name         string      `json:"name"`
	X            float64     `json:"x"`
	Y            float64     `json:"y"`
	Width        float64     `json:"width"`
	Height       float64     `json:"height"`
	Fill         interface{} `json:"fill"`
	Text         string      `json:"text,omitempty"`
	FontSize     float64     `json:"fontSize,omitempty"`
	FontWeight   string      `json:"fontWeight,omitempty"`
	CornerRadius float64     `json:"cornerRadius,omitempty"`
	ParentID     string      `json:"parentId,omitempty"`
}

// GeneratedTask represents a task generated from design analysis
type GeneratedTask struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
	Category    string `json:"category"`
	Status      string `json:"status"`
}

func executeGenerateTasksFromDesign(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	designName := args["design_name"].(string)
	designJSON := args["design_json"].(string)
	detailLevel, _ := args["detail_level"].(string)
	assigneeRole, _ := args["assignee_role"].(string)

	if detailLevel == "" {
		detailLevel = "detailed"
	}
	if assigneeRole == "" {
		assigneeRole = "frontend"
	}

	// Parse design nodes
	var nodes []DesignNode
	if err := json.Unmarshal([]byte(designJSON), &nodes); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error parsing design JSON: %v", err), IsError: true}
	}

	tasks := generateTasksFromNodes(designName, nodes, detailLevel, assigneeRole)

	result := map[string]interface{}{
		"success":      true,
		"design_name":  designName,
		"detail_level": detailLevel,
		"task_count":   len(tasks),
		"tasks":        tasks,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func generateTasksFromNodes(designName string, nodes []DesignNode, detailLevel, _ string) []GeneratedTask {
	var tasks []GeneratedTask

	// Find screen/container nodes
	var screens []DesignNode
	var elements []DesignNode

	for _, node := range nodes {
		if node.Type == "screen" || (node.Type == "rectangle" && node.Width > 500 && node.Height > 500) {
			screens = append(screens, node)
		} else {
			elements = append(elements, node)
		}
	}

	// Task 1: Setup task
	if len(screens) > 0 {
		screen := screens[0]
		tasks = append(tasks, GeneratedTask{
			Title:       fmt.Sprintf("Create %s page component", designName),
			Description: fmt.Sprintf("Set up base Vue/React component with container layout (%dx%d)", int(screen.Width), int(screen.Height)),
			Priority:    "high",
			Category:    "setup",
			Status:      "todo",
		})
	}

	// Group elements by type
	var textElements, rectangles, buttons, inputs, images []DesignNode

	for _, elem := range elements {
		switch elem.Type {
		case "text":
			textElements = append(textElements, elem)
		case "rectangle":
			// Check if it looks like a button (small, has text nearby, has fill)
			if elem.Width < 400 && elem.Height < 100 && elem.CornerRadius > 0 {
				buttons = append(buttons, elem)
			} else if elem.Width > 200 && elem.Height < 60 {
				inputs = append(inputs, elem)
			} else {
				rectangles = append(rectangles, elem)
			}
		case "ellipse", "image":
			images = append(images, elem)
		}
	}

	// Generate tasks based on element types
	if len(rectangles) > 0 {
		// Find header/nav (usually at top, full width)
		for _, rect := range rectangles {
			if rect.Y < 100 && rect.Width > 500 {
				tasks = append(tasks, GeneratedTask{
					Title:       "Implement navigation/header bar",
					Description: fmt.Sprintf("Create header component: %s, %dx%d, background: %v", rect.Name, int(rect.Width), int(rect.Height), rect.Fill),
					Priority:    "high",
					Category:    "component",
					Status:      "todo",
				})
				break
			}
		}
	}

	// Text elements
	for _, text := range textElements {
		priority := "medium"
		category := "content"

		// Large text = heading
		if text.FontSize > 40 {
			tasks = append(tasks, GeneratedTask{
				Title:       fmt.Sprintf("Add heading: '%s'", truncateText(text.Text, 30)),
				Description: fmt.Sprintf("Hero heading text, %dpx font, %s weight, position (%d, %d)", int(text.FontSize), text.FontWeight, int(text.X), int(text.Y)),
				Priority:    "high",
				Category:    "content",
				Status:      "todo",
			})
		} else if text.FontSize > 20 {
			tasks = append(tasks, GeneratedTask{
				Title:       fmt.Sprintf("Add subheading: '%s'", truncateText(text.Text, 30)),
				Description: fmt.Sprintf("Subheading text, %dpx font", int(text.FontSize)),
				Priority:    priority,
				Category:    category,
				Status:      "todo",
			})
		}
	}

	// Buttons
	for _, btn := range buttons {
		// Find associated text
		btnText := "Button"
		for _, text := range textElements {
			if isInside(text, btn) {
				btnText = text.Text
				break
			}
		}
		tasks = append(tasks, GeneratedTask{
			Title:       fmt.Sprintf("Create '%s' button", truncateText(btnText, 20)),
			Description: fmt.Sprintf("Button component: %dx%d, border-radius: %dpx, fill: %v", int(btn.Width), int(btn.Height), int(btn.CornerRadius), btn.Fill),
			Priority:    "high",
			Category:    "component",
			Status:      "todo",
		})
	}

	// Add styling task if detailed
	if detailLevel == "detailed" || detailLevel == "comprehensive" {
		tasks = append(tasks, GeneratedTask{
			Title:       "Apply styling and theming",
			Description: "Add CSS/Tailwind classes for colors, spacing, and responsive layout",
			Priority:    "medium",
			Category:    "styling",
			Status:      "todo",
		})
	}

	// Add comprehensive tasks
	if detailLevel == "comprehensive" {
		tasks = append(tasks, GeneratedTask{
			Title:       "Add responsive breakpoints",
			Description: "Implement mobile/tablet responsive layouts",
			Priority:    "medium",
			Category:    "responsive",
			Status:      "todo",
		})
		tasks = append(tasks, GeneratedTask{
			Title:       "Add accessibility attributes",
			Description: "Add ARIA labels, alt text, keyboard navigation",
			Priority:    "low",
			Category:    "a11y",
			Status:      "backlog",
		})
	}

	return tasks
}

func truncateText(text string, maxLen int) string {
	text = strings.TrimSpace(text)
	if len(text) > maxLen {
		return text[:maxLen] + "..."
	}
	return text
}

func isInside(inner, outer DesignNode) bool {
	return inner.X >= outer.X &&
		inner.Y >= outer.Y &&
		inner.X+inner.Width <= outer.X+outer.Width &&
		inner.Y+inner.Height <= outer.Y+outer.Height
}

func executeCreateTasksBatch(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	tasksArg := args["tasks"].([]interface{})

	created := []interface{}{}
	errors := []string{}

	for i, taskArg := range tasksArg {
		task := taskArg.(map[string]interface{})

		// Build task payload
		payload := map[string]interface{}{
			"project_id": projectID,
			"title":      task["title"],
			"status":     "backlog",
			"priority":   "medium",
		}

		if desc, ok := task["description"].(string); ok {
			payload["description"] = desc
		}
		if status, ok := task["status"].(string); ok {
			payload["status"] = status
		}
		if priority, ok := task["priority"].(string); ok {
			payload["priority"] = priority
		}

		// Create task via API
		resp, err := ctx.APIClient.Request("POST", "/api/tasks", payload)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Task %d failed: %v", i+1, err))
			continue
		}

		created = append(created, resp)
	}

	result := map[string]interface{}{
		"success":       len(errors) == 0,
		"created_count": len(created),
		"error_count":   len(errors),
		"created":       created,
	}

	if len(errors) > 0 {
		result["errors"] = errors
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}
