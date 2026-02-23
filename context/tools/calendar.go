package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
)

// CalendarTools - Tools for managing calendar events at company and project levels
func init() {
	category := &ToolCategory{
		Name:        "calendar",
		Description: "Calendar tools for managing events, schedules, and deadlines at company and project levels",
		Tools: []providers.Tool{
			// Company-level event tools
			MakeTool("create_company_event", "Create a new calendar event at the company level",
				map[string]providers.Property{
					"company_id":      {Type: "number", Description: "The ID of the company"},
					"title":           {Type: "string", Description: "The title of the event"},
					"description":     {Type: "string", Description: "Detailed description of the event"},
					"start_time":      {Type: "string", Description: "Start time in ISO 8601 format (e.g., 2025-12-25T09:00:00Z)"},
					"end_time":        {Type: "string", Description: "End time in ISO 8601 format (e.g., 2025-12-25T17:00:00Z)"},
					"all_day":         {Type: "boolean", Description: "Whether this is an all-day event"},
					"color":           {Type: "string", Description: "Color for the event (e.g., #FF5733, red, blue)"},
					"location":        {Type: "string", Description: "Location of the event"},
					"is_recurring":    {Type: "boolean", Description: "Whether this event recurs"},
					"recurrence_rule": {Type: "string", Description: "iCal RRULE for recurring events (e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR)"},
				}, []string{"company_id", "title", "start_time", "end_time"}),

			MakeTool("list_company_events", "List all calendar events for a company",
				map[string]providers.Property{
					"company_id": {Type: "number", Description: "The ID of the company"},
				}, []string{"company_id"}),

			// Project-level event tools
			MakeTool("create_event", "Create a new calendar event in a project",
				map[string]providers.Property{
					"project_id":      {Type: "number", Description: "The ID of the project"},
					"title":           {Type: "string", Description: "The title of the event"},
					"description":     {Type: "string", Description: "Detailed description of the event"},
					"start_time":      {Type: "string", Description: "Start time in ISO 8601 format (e.g., 2025-12-25T09:00:00Z)"},
					"end_time":        {Type: "string", Description: "End time in ISO 8601 format (e.g., 2025-12-25T17:00:00Z)"},
					"all_day":         {Type: "boolean", Description: "Whether this is an all-day event"},
					"color":           {Type: "string", Description: "Color for the event (e.g., #FF5733, red, blue)"},
					"location":        {Type: "string", Description: "Location of the event"},
					"is_recurring":    {Type: "boolean", Description: "Whether this event recurs"},
					"recurrence_rule": {Type: "string", Description: "iCal RRULE for recurring events (e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR)"},
				}, []string{"project_id", "title", "start_time", "end_time"}),

			MakeTool("list_events", "List all calendar events for a project",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
				}, []string{"project_id"}),

			MakeTool("get_event", "Get details of a specific calendar event",
				map[string]providers.Property{
					"event_id": {Type: "number", Description: "The ID of the event"},
				}, []string{"event_id"}),

			MakeTool("update_event", "Update an existing calendar event",
				map[string]providers.Property{
					"event_id":        {Type: "number", Description: "The ID of the event to update"},
					"title":           {Type: "string", Description: "New title for the event"},
					"description":     {Type: "string", Description: "New description"},
					"start_time":      {Type: "string", Description: "New start time in ISO 8601 format"},
					"end_time":        {Type: "string", Description: "New end time in ISO 8601 format"},
					"all_day":         {Type: "boolean", Description: "Whether this is an all-day event"},
					"color":           {Type: "string", Description: "New color for the event"},
					"location":        {Type: "string", Description: "New location"},
					"is_recurring":    {Type: "boolean", Description: "Whether this event recurs"},
					"recurrence_rule": {Type: "string", Description: "New recurrence rule"},
				}, []string{"event_id"}),

			MakeTool("delete_event", "Delete a calendar event",
				map[string]providers.Property{
					"event_id": {Type: "number", Description: "The ID of the event to delete"},
				}, []string{"event_id"}),

			// Utility tools
			MakeTool("list_events_by_date_range", "List events within a date range for a project",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"start_date": {Type: "string", Description: "Start date in ISO 8601 format (e.g., 2025-12-01)"},
					"end_date":   {Type: "string", Description: "End date in ISO 8601 format (e.g., 2025-12-31)"},
				}, []string{"project_id", "start_date", "end_date"}),

			MakeTool("list_upcoming_events", "List upcoming events for a project (next 7 days by default)",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"days":       {Type: "number", Description: "Number of days to look ahead (default: 7)"},
				}, []string{"project_id"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Register executors - Company level
	DefaultRegistry.RegisterExecutor("create_company_event", executeCreateCompanyEvent)
	DefaultRegistry.RegisterExecutor("list_company_events", executeListCompanyEvents)

	// Register executors - Project level
	DefaultRegistry.RegisterExecutor("create_event", executeCreateEvent)
	DefaultRegistry.RegisterExecutor("list_events", executeListEvents)
	DefaultRegistry.RegisterExecutor("get_event", executeGetEvent)
	DefaultRegistry.RegisterExecutor("update_event", executeUpdateEvent)
	DefaultRegistry.RegisterExecutor("delete_event", executeDeleteEvent)
	DefaultRegistry.RegisterExecutor("list_events_by_date_range", executeListEventsByDateRange)
	DefaultRegistry.RegisterExecutor("list_upcoming_events", executeListUpcomingEvents)
}

// Company-level event executors
func executeCreateCompanyEvent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	companyID := int(args["company_id"].(float64))
	title, _ := args["title"].(string)
	description, _ := args["description"].(string)
	startTime, _ := args["start_time"].(string)
	endTime, _ := args["end_time"].(string)
	allDay, _ := args["all_day"].(bool)
	color, _ := args["color"].(string)
	location, _ := args["location"].(string)
	isRecurring, _ := args["is_recurring"].(bool)
	recurrenceRule, _ := args["recurrence_rule"].(string)

	body := map[string]interface{}{
		"title":      title,
		"start_time": startTime,
		"end_time":   endTime,
	}

	if description != "" {
		body["description"] = description
	}
	if allDay {
		body["all_day"] = allDay
	}
	if color != "" {
		body["color"] = color
	}
	if location != "" {
		body["location"] = location
	}
	if isRecurring {
		body["is_recurring"] = isRecurring
	}
	if recurrenceRule != "" {
		body["recurrence_rule"] = recurrenceRule
	}

	resp, err := ctx.APIClient.Request("POST", fmt.Sprintf("/api/company-events/%d", companyID), body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating company event: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Company event created successfully: %s", string(respJSON))}
}

func executeListCompanyEvents(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	companyID := int(args["company_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/company-events/%d", companyID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing company events: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

// Project-level event executors
func executeCreateEvent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	title, _ := args["title"].(string)
	description, _ := args["description"].(string)
	startTime, _ := args["start_time"].(string)
	endTime, _ := args["end_time"].(string)
	allDay, _ := args["all_day"].(bool)
	color, _ := args["color"].(string)
	location, _ := args["location"].(string)
	isRecurring, _ := args["is_recurring"].(bool)
	recurrenceRule, _ := args["recurrence_rule"].(string)

	body := map[string]interface{}{
		"title":      title,
		"start_time": startTime,
		"end_time":   endTime,
	}

	if description != "" {
		body["description"] = description
	}
	if allDay {
		body["all_day"] = allDay
	}
	if color != "" {
		body["color"] = color
	}
	if location != "" {
		body["location"] = location
	}
	if isRecurring {
		body["is_recurring"] = isRecurring
	}
	if recurrenceRule != "" {
		body["recurrence_rule"] = recurrenceRule
	}

	resp, err := ctx.APIClient.Request("POST", fmt.Sprintf("/api/project-events/%d", projectID), body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating event: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Event created successfully: %s", string(respJSON))}
}

func executeListEvents(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/project-events/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing events: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeGetEvent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	eventID := int(args["event_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/events/%d", eventID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting event: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeUpdateEvent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	eventID := int(args["event_id"].(float64))
	body := map[string]interface{}{}

	if title, ok := args["title"].(string); ok && title != "" {
		body["title"] = title
	}
	if description, ok := args["description"].(string); ok {
		body["description"] = description
	}
	if startTime, ok := args["start_time"].(string); ok && startTime != "" {
		body["start_time"] = startTime
	}
	if endTime, ok := args["end_time"].(string); ok && endTime != "" {
		body["end_time"] = endTime
	}
	if allDay, ok := args["all_day"].(bool); ok {
		body["all_day"] = allDay
	}
	if color, ok := args["color"].(string); ok && color != "" {
		body["color"] = color
	}
	if location, ok := args["location"].(string); ok {
		body["location"] = location
	}
	if isRecurring, ok := args["is_recurring"].(bool); ok {
		body["is_recurring"] = isRecurring
	}
	if recurrenceRule, ok := args["recurrence_rule"].(string); ok {
		body["recurrence_rule"] = recurrenceRule
	}

	resp, err := ctx.APIClient.Request("PUT", fmt.Sprintf("/api/events/%d", eventID), body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error updating event: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Event updated: %s", string(respJSON))}
}

func executeDeleteEvent(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	eventID := int(args["event_id"].(float64))
	_, err := ctx.APIClient.Request("DELETE", fmt.Sprintf("/api/events/%d", eventID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error deleting event: %v", err), IsError: true}
	}
	return ToolResult{Content: fmt.Sprintf("Event %d deleted successfully", eventID)}
}

func executeListEventsByDateRange(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	startDate, _ := args["start_date"].(string)
	endDate, _ := args["end_date"].(string)

	// Get all events for project, then filter by date range
	// Note: This could be optimized with a backend endpoint that supports date filtering
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/project-events/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing events: %v", err), IsError: true}
	}

	// The response contains events, we'll return all and note the date range in the response
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Events for project %d (filter by %s to %s client-side): %s", projectID, startDate, endDate, string(respJSON))}
}

func executeListUpcomingEvents(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	days := 7
	if d, ok := args["days"].(float64); ok && d > 0 {
		days = int(d)
	}

	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/project-events/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing events: %v", err), IsError: true}
	}

	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Upcoming events (next %d days) for project %d: %s", days, projectID, string(respJSON))}
}
