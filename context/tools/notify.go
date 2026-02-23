package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
)

// NotifyTools - Tools for creating and managing notifications via sync-api
// Allows AI to notify users about important events, task assignments, mentions, etc.
func init() {
	category := &ToolCategory{
		Name:        "notify",
		Description: "Notification tools for alerting users about events, task assignments, mentions, and other important updates",
		Tools: []providers.Tool{
			MakeTool("send_notification",
				`Send a notification to a user.
Use this to alert users about task assignments, mentions, important events, or system messages.
The notification will appear in the user's notification panel and can trigger real-time alerts.`,
				map[string]providers.Property{
					"user_id": {Type: "number", Description: "User ID to notify"},
					"title":   {Type: "string", Description: "Notification title (short, descriptive)"},
					"body":    {Type: "string", Description: "Notification body (detailed message)"},
					"type": {Type: "string", Description: `Notification type:
- info: general information
- success: completed actions
- warning: warnings
- error: errors
- mention: user mentions (@user)
- activity: activity updates
- task: task-related notifications`},
					"action_url": {Type: "string", Description: "URL to navigate when notification is clicked (e.g., /app/projects/123/kanban)"},
				}, []string{"user_id", "title", "body", "type"}),

			MakeTool("notify_task_assigned",
				`Send a notification when a task is assigned to a user.
Automatically creates a task notification with appropriate formatting.`,
				map[string]providers.Property{
					"user_id":      {Type: "number", Description: "User ID to notify (assignee)"},
					"task_id":      {Type: "number", Description: "Task ID"},
					"task_title":   {Type: "string", Description: "Task title"},
					"assigner_name": {Type: "string", Description: "Name of person who assigned the task"},
					"project_id":   {Type: "number", Description: "Project ID (for action URL)"},
				}, []string{"user_id", "task_id", "task_title", "assigner_name", "project_id"}),

			MakeTool("notify_mention",
				`Send a notification when a user is mentioned in a chat or comment.
Automatically creates a mention notification with appropriate formatting.`,
				map[string]providers.Property{
					"user_id":       {Type: "number", Description: "User ID to notify (mentioned user)"},
					"mentioner_name": {Type: "string", Description: "Name of person who mentioned the user"},
					"context":       {Type: "string", Description: "Context of the mention (e.g., 'in Chat Room #general', 'in Task #123')"},
					"message":       {Type: "string", Description: "The message containing the mention (snippet)"},
					"action_url":    {Type: "string", Description: "URL to navigate to the mention location"},
				}, []string{"user_id", "mentioner_name", "context", "message"}),

			MakeTool("notify_team",
				`Send a notification to all members of a project team.
Useful for announcements, status updates, or team-wide alerts.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID to get team members from"},
					"title":      {Type: "string", Description: "Notification title"},
					"body":       {Type: "string", Description: "Notification body"},
					"type":       {Type: "string", Description: "Notification type (info, success, warning, error)"},
					"action_url": {Type: "string", Description: "URL to navigate when clicked (optional)"},
				}, []string{"project_id", "title", "body", "type"}),

			MakeTool("get_user_notifications",
				`Get notifications for a user.
Useful for checking notification status or debugging.`,
				map[string]providers.Property{
					"user_id": {Type: "number", Description: "User ID"},
					"limit":   {Type: "number", Description: "Max notifications to return (default: 20)"},
					"unread_only": {Type: "boolean", Description: "Only return unread notifications"},
				}, []string{"user_id"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("send_notification", executeSendNotification)
	DefaultRegistry.RegisterExecutor("notify_task_assigned", executeNotifyTaskAssigned)
	DefaultRegistry.RegisterExecutor("notify_mention", executeNotifyMention)
	DefaultRegistry.RegisterExecutor("notify_team", executeNotifyTeam)
	DefaultRegistry.RegisterExecutor("get_user_notifications", executeGetUserNotifications)
}

// executeSendNotification sends a notification to a user
func executeSendNotification(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	userID := int(args["user_id"].(float64))
	title := args["title"].(string)
	body := args["body"].(string)
	notifType := args["type"].(string)
	actionURL, _ := args["action_url"].(string)

	payload := map[string]interface{}{
		"user_id": userID,
		"title":   title,
		"body":    body,
		"type":    notifType,
		"read":    false,
	}

	if actionURL != "" {
		payload["action_url"] = actionURL
	}

	resp, err := ctx.APIClient.Request("POST", "/notifications", payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error sending notification: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":      true,
		"notification": resp,
		"message":      fmt.Sprintf("Notification sent to user %d", userID),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// executeNotifyTaskAssigned sends a task assignment notification
func executeNotifyTaskAssigned(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	userID := int(args["user_id"].(float64))
	taskID := int(args["task_id"].(float64))
	taskTitle := args["task_title"].(string)
	assignerName := args["assigner_name"].(string)
	projectID := int(args["project_id"].(float64))

	title := fmt.Sprintf("Task Assigned: %s", taskTitle)
	body := fmt.Sprintf("%s assigned you to this task", assignerName)
	actionURL := fmt.Sprintf("/app/projects/%d/kanban?task=%d", projectID, taskID)

	payload := map[string]interface{}{
		"user_id":    userID,
		"title":      title,
		"body":       body,
		"type":       "task",
		"action_url": actionURL,
		"read":       false,
	}

	resp, err := ctx.APIClient.Request("POST", "/notifications", payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error sending task notification: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":      true,
		"notification": resp,
		"message":      fmt.Sprintf("Task assignment notification sent to user %d", userID),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// executeNotifyMention sends a mention notification
func executeNotifyMention(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	userID := int(args["user_id"].(float64))
	mentionerName := args["mentioner_name"].(string)
	context := args["context"].(string)
	message := args["message"].(string)
	actionURL, _ := args["action_url"].(string)

	title := fmt.Sprintf("%s mentioned you", mentionerName)
	body := fmt.Sprintf("%s: \"%s\"", context, truncateString(message, 100))

	payload := map[string]interface{}{
		"user_id": userID,
		"title":   title,
		"body":    body,
		"type":    "mention",
		"read":    false,
	}

	if actionURL != "" {
		payload["action_url"] = actionURL
	}

	resp, err := ctx.APIClient.Request("POST", "/notifications", payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error sending mention notification: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":      true,
		"notification": resp,
		"message":      fmt.Sprintf("Mention notification sent to user %d", userID),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// executeNotifyTeam sends a notification to all team members
func executeNotifyTeam(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	title := args["title"].(string)
	body := args["body"].(string)
	notifType := args["type"].(string)
	actionURL, _ := args["action_url"].(string)

	// First, get project members
	endpoint := fmt.Sprintf("/projects/%d/members", projectID)
	membersResp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching project members: %v", err), IsError: true}
	}

	// Extract member user IDs
	var userIDs []int
	if data, ok := membersResp["data"].([]interface{}); ok {
		for _, m := range data {
			if member, ok := m.(map[string]interface{}); ok {
				if userID, ok := member["user_id"].(float64); ok {
					userIDs = append(userIDs, int(userID))
				}
			}
		}
	}

	if len(userIDs) == 0 {
		return ToolResult{Content: "No team members found for this project", IsError: true}
	}

	// Send notification to each member
	sent := 0
	errors := []string{}

	for _, userID := range userIDs {
		payload := map[string]interface{}{
			"user_id": userID,
			"title":   title,
			"body":    body,
			"type":    notifType,
			"read":    false,
		}

		if actionURL != "" {
			payload["action_url"] = actionURL
		}

		_, err := ctx.APIClient.Request("POST", "/notifications", payload)
		if err != nil {
			errors = append(errors, fmt.Sprintf("user %d: %v", userID, err))
		} else {
			sent++
		}
	}

	result := map[string]interface{}{
		"success":     len(errors) == 0,
		"sent_count":  sent,
		"total_users": len(userIDs),
		"message":     fmt.Sprintf("Notification sent to %d/%d team members", sent, len(userIDs)),
	}

	if len(errors) > 0 {
		result["errors"] = errors
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// executeGetUserNotifications gets notifications for a user
func executeGetUserNotifications(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	userID := int(args["user_id"].(float64))
	limit := 20
	if l, ok := args["limit"].(float64); ok {
		limit = int(l)
	}
	unreadOnly := false
	if u, ok := args["unread_only"].(bool); ok {
		unreadOnly = u
	}

	endpoint := fmt.Sprintf("/notifications?user_id=%d&limit=%d", userID, limit)
	if unreadOnly {
		endpoint += "&read=false"
	}

	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching notifications: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// Note: truncateString helper is already defined in code.go
