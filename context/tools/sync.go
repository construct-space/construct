package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"strings"
)

// SyncTools - Tools for syncing Construct spaces with sync-api (team cloud)
// This ensures the whole company has the same context
func init() {
	category := &ToolCategory{
		Name:        "sync",
		Description: "Sync tools for team collaboration - connects to sync-api cloud",
		Tools: []providers.Tool{
			// === DESIGN SYNC ===
			MakeTool("list_project_designs",
				`List all UI designs for a project from sync-api (team cloud).
Returns design names, IDs, and metadata for the whole team to access.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
				}, []string{"project_id"}),

			MakeTool("get_design",
				`Get a specific design from sync-api by ID or name.
Returns full canvas_data (nodes/elements) for code generation.`,
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Project ID"},
					"design_id":   {Type: "number", Description: "Design ID (optional if name provided)"},
					"design_name": {Type: "string", Description: "Design name (optional if ID provided)"},
				}, []string{"project_id"}),

			MakeTool("sync_design",
				`Sync a design to sync-api for team sharing.
Creates or updates the design in the cloud.`,
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Project ID"},
					"design_name": {Type: "string", Description: "Design name"},
					"canvas_data": {Type: "string", Description: "JSON string of canvas nodes/elements"},
					"viewport":    {Type: "string", Description: "JSON string of viewport state"},
				}, []string{"project_id", "design_name", "canvas_data"}),

			// === TASK SYNC ===
			MakeTool("list_project_tasks",
				`List all tasks for a project from sync-api.
Returns tasks with status, priority, assignee for kanban board.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
					"status":     {Type: "string", Description: "Filter by status: todo, in_progress, done, blocked, all"},
				}, []string{"project_id"}),

			MakeTool("sync_get_task",
				`Get a specific task from sync-api by ID.`,
				map[string]providers.Property{
					"task_id": {Type: "number", Description: "Task ID"},
				}, []string{"task_id"}),

			MakeTool("sync_task",
				`Create or update a task in sync-api.`,
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Project ID"},
					"task_id":     {Type: "number", Description: "Task ID (for updates, omit for create)"},
					"title":       {Type: "string", Description: "Task title"},
					"description": {Type: "string", Description: "Task description"},
					"status":      {Type: "string", Description: "Status: backlog, todo, in_progress, review, done"},
					"priority":    {Type: "string", Description: "Priority: low, medium, high, urgent"},
					"assignee_id": {Type: "number", Description: "Assignee user ID"},
				}, []string{"project_id", "title"}),

			// === STICKY NOTE SYNC (notes space - visual sticky notes) ===
			MakeTool("list_project_notes",
				`List all sticky notes for a project from sync-api.
Returns notes with content, color, position for the notes board.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
				}, []string{"project_id"}),

			MakeTool("get_note",
				`Get a specific sticky note from sync-api by ID.`,
				map[string]providers.Property{
					"note_id": {Type: "number", Description: "Note ID"},
				}, []string{"note_id"}),

			MakeTool("sync_note",
				`Create or update a sticky note in sync-api.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
					"note_id":    {Type: "number", Description: "Note ID (for updates, omit for create)"},
					"content":    {Type: "string", Description: "Note content text"},
					"color":      {Type: "string", Description: "Note color (hex or name)"},
					"position_x": {Type: "number", Description: "X position on board"},
					"position_y": {Type: "number", Description: "Y position on board"},
					"width":      {Type: "number", Description: "Note width"},
					"height":     {Type: "number", Description: "Note height"},
				}, []string{"project_id", "content"}),

			// === DOCUMENT SYNC (docs space - PRDs, READMEs, etc.) ===
			MakeTool("list_project_documents",
				`List all documents for a project from sync-api.
Returns documents with title, type (prd, readme, architecture, etc.).`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
				}, []string{"project_id"}),

			MakeTool("get_document",
				`Get a specific document from sync-api by ID.`,
				map[string]providers.Property{
					"document_id": {Type: "number", Description: "Document ID"},
				}, []string{"document_id"}),

			MakeTool("sync_document",
				`Create or update a document in sync-api.`,
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Project ID"},
					"document_id": {Type: "number", Description: "Document ID (for updates, omit for create)"},
					"title":       {Type: "string", Description: "Document title"},
					"content":     {Type: "string", Description: "Document content (markdown)"},
					"type":        {Type: "string", Description: "Document type: prd, readme, architecture, roadmap, setup, custom"},
				}, []string{"project_id", "title", "content"}),

			// === CONVERSATION SYNC ===
			MakeTool("list_conversations",
				`List AI conversations for a project from sync-api.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
				}, []string{"project_id"}),

			MakeTool("sync_conversation",
				`Sync an AI conversation to sync-api for team context.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
					"title":      {Type: "string", Description: "Conversation title/summary"},
					"messages":   {Type: "string", Description: "JSON array of messages [{role, content}]"},
					"space":      {Type: "string", Description: "Space context: code, ui, kanban, notes"},
				}, []string{"project_id", "messages"}),

			// === PROJECT CONTEXT ===
			MakeTool("get_project_sync_status",
				`Get sync status for a project - shows what's synced vs local-only.`,
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "Project ID"},
				}, []string{"project_id"}),

			MakeTool("get_full_project_context",
				`Get comprehensive project context from sync-api.
Returns designs, tasks, sticky notes, documents, and recent conversations for AI context.`,
				map[string]providers.Property{
					"project_id":      {Type: "number", Description: "Project ID"},
					"include_designs": {Type: "boolean", Description: "Include UI designs (default: true)"},
					"include_tasks":   {Type: "boolean", Description: "Include kanban tasks (default: true)"},
					"include_notes":   {Type: "boolean", Description: "Include sticky notes (default: true)"},
					"include_docs":    {Type: "boolean", Description: "Include documents/PRDs (default: true)"},
					"include_convos":  {Type: "boolean", Description: "Include recent conversations (default: false)"},
				}, []string{"project_id"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Design sync
	DefaultRegistry.RegisterExecutor("list_project_designs", executeListProjectDesigns)
	DefaultRegistry.RegisterExecutor("get_design", executeGetDesign)
	DefaultRegistry.RegisterExecutor("sync_design", executeSyncDesign)

	// Task sync
	DefaultRegistry.RegisterExecutor("list_project_tasks", executeSyncListProjectTasks)
	DefaultRegistry.RegisterExecutor("sync_get_task", executeSyncGetTask)
	DefaultRegistry.RegisterExecutor("sync_task", executeSyncTask)

	// Sticky note sync
	DefaultRegistry.RegisterExecutor("list_project_notes", executeListProjectNotes)
	DefaultRegistry.RegisterExecutor("get_note", executeGetNote)
	DefaultRegistry.RegisterExecutor("sync_note", executeSyncNote)

	// Document sync
	DefaultRegistry.RegisterExecutor("list_project_documents", executeListProjectDocuments)
	DefaultRegistry.RegisterExecutor("get_document", executeGetDocument)
	DefaultRegistry.RegisterExecutor("sync_document", executeSyncDocument)

	// Conversation sync
	DefaultRegistry.RegisterExecutor("list_conversations", executeListConversations)
	DefaultRegistry.RegisterExecutor("sync_conversation", executeSyncConversation)

	// Project context
	DefaultRegistry.RegisterExecutor("get_project_sync_status", executeGetProjectSyncStatus)
	DefaultRegistry.RegisterExecutor("get_full_project_context", executeGetFullProjectContext)
}

// ============================================================================
// DESIGN SYNC EXECUTORS
// ============================================================================

func executeListProjectDesigns(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := 0
	if rawID, ok := args["project_id"].(float64); ok {
		projectID = int(rawID)
	}

	// Primary source: read from local database (canvas state) — same as get_canvas_state
	if ctx != nil && ctx.Storage != nil {
		var pidPtr *int
		if projectID > 0 {
			pidPtr = &projectID
		} else if ctx.Project != nil && ctx.Project.ID > 0 {
			pid := ctx.Project.ID
			pidPtr = &pid
		}
		dbDesigns, err := ctx.Storage.UIDesignList(pidPtr)
		if err == nil && len(dbDesigns) > 0 {
			designList := make([]map[string]interface{}, 0, len(dbDesigns))
			for _, d := range dbDesigns {
				entry := map[string]interface{}{
					"id":       d.LocalID,
					"name":     d.Name,
					"db_id":    d.ID,
				}
				if d.NodesJSON != "" {
					var nodes []map[string]interface{}
					if jsonErr := json.Unmarshal([]byte(d.NodesJSON), &nodes); jsonErr == nil {
						// Count screens (top-level nodes without parentId)
						screenCount := 0
						for _, node := range nodes {
							parentID := ""
							if p, ok := node["parentId"].(string); ok {
								parentID = p
							}
							if p, ok := node["parent_id"].(string); ok && parentID == "" {
								parentID = p
							}
							nodeType := ""
							if t, ok := node["type"].(string); ok {
								nodeType = strings.ToLower(t)
							}
							if nodeType == "screen" && parentID == "" {
								screenCount++
							}
						}
						entry["screen_count"] = screenCount
						entry["element_count"] = len(nodes)
					}
				}
				designList = append(designList, entry)
			}
			result := map[string]interface{}{
				"success":      true,
				"project_id":   projectID,
				"design_count": len(designList),
				"designs":      designList,
				"source":       "canvas-db",
			}
			jsonResult, _ := json.MarshalIndent(result, "", "  ")
			return ToolResult{Content: string(jsonResult)}
		}
	}

	// Fallback: try sync API (remote team data)
	if projectID == 0 {
		return ToolResult{Content: `{"success":false,"error":"No designs found. Use get_canvas_state to see screens on the canvas."}`, IsError: true}
	}

	endpoint := fmt.Sprintf("/project-designs/%d", projectID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf(`{"success":false,"error":"No local designs and sync API unavailable. Use get_canvas_state to see current screens.","details":"%s"}`, err.Error()), IsError: true}
	}

	designs := []map[string]interface{}{}
	if data, ok := resp["data"].([]interface{}); ok {
		for _, d := range data {
			design := d.(map[string]interface{})
			designs = append(designs, map[string]interface{}{
				"id":         design["id"],
				"name":       design["name"],
				"updated_at": design["updated_at"],
			})
		}
	}

	result := map[string]interface{}{
		"success":      true,
		"project_id":   projectID,
		"design_count": len(designs),
		"designs":      designs,
		"source":       "sync-api",
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeGetDesign(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	var designName string

	if name, ok := args["design_name"].(string); ok {
		designName = name
	}

	// First, check local data passed from frontend (designs array)
	if ctx.LocalData != nil {
		if designs, ok := ctx.LocalData["designs"].([]interface{}); ok {
			for _, d := range designs {
				design := d.(map[string]interface{})
				if name, ok := design["name"].(string); ok {
					if strings.EqualFold(name, designName) || strings.Contains(strings.ToLower(name), strings.ToLower(designName)) {
						result := map[string]interface{}{
							"success": true,
							"design":  design,
							"source":  "local",
						}
						jsonResult, _ := json.MarshalIndent(result, "", "  ")
						return ToolResult{Content: string(jsonResult)}
					}
				}
			}
		}

		// Also check current canvas data
		if currentDesign, ok := ctx.LocalData["current_design"].(string); ok {
			if strings.EqualFold(currentDesign, designName) || strings.Contains(strings.ToLower(currentDesign), strings.ToLower(designName)) {
				if canvasData, ok := ctx.LocalData["canvas_data"]; ok {
					result := map[string]interface{}{
						"success":     true,
						"design_name": currentDesign,
						"nodes":       canvasData,
						"source":      "current_canvas",
					}
					jsonResult, _ := json.MarshalIndent(result, "", "  ")
					return ToolResult{Content: string(jsonResult)}
				}
			}
		}
	}

	// Design not found locally
	// Note: Removed sync-api call as the endpoint doesn't exist
	// Designs are stored locally and synced via different mechanism
	_ = projectID // unused but kept for future sync-api integration
	return ToolResult{Content: fmt.Sprintf("Design '%s' not found. Available designs are in the current canvas context. The design may need to be opened first in the UI space.", designName), IsError: true}
}

func executeSyncDesign(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	designName := args["design_name"].(string)
	canvasData := args["canvas_data"].(string)
	viewport, _ := args["viewport"].(string)

	payload := map[string]interface{}{
		"name":        designName,
		"canvas_data": json.RawMessage(canvasData),
	}
	if viewport != "" {
		payload["viewport"] = json.RawMessage(viewport)
	}

	endpoint := fmt.Sprintf("/project-designs/%d", projectID)
	resp, err := ctx.APIClient.Request("POST", endpoint, payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error syncing design: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"synced":  true,
		"design":  resp,
		"message": fmt.Sprintf("Design '%s' synced to team cloud", designName),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// TASK SYNC EXECUTORS
// ============================================================================

func executeSyncListProjectTasks(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	status, _ := args["status"].(string)

	endpoint := fmt.Sprintf("/tasks?project_id=%d", projectID)
	if status != "" && status != "all" {
		endpoint += "&status=" + status
	}

	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching tasks: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeSyncGetTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	taskID := int(args["task_id"].(float64))

	endpoint := fmt.Sprintf("/tasks/%d", taskID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching task: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeSyncTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	title := args["title"].(string)

	payload := map[string]interface{}{
		"project_id": projectID,
		"title":      title,
	}

	if desc, ok := args["description"].(string); ok {
		payload["description"] = desc
	}
	if status, ok := args["status"].(string); ok {
		payload["status"] = status
	}
	if priority, ok := args["priority"].(string); ok {
		payload["priority"] = priority
	}
	if assigneeID, ok := args["assignee_id"].(float64); ok {
		payload["assignee_id"] = int(assigneeID)
	}

	var endpoint string
	var method string

	if taskID, ok := args["task_id"].(float64); ok && taskID > 0 {
		endpoint = fmt.Sprintf("/tasks/%d", int(taskID))
		method = "PUT"
	} else {
		endpoint = "/tasks"
		method = "POST"
	}

	resp, err := ctx.APIClient.Request(method, endpoint, payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error syncing task: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"synced":  true,
		"task":    resp,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// NOTE SYNC EXECUTORS
// ============================================================================

func executeListProjectNotes(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))

	// Use project-scoped endpoint (matches sync-api route pattern)
	endpoint := fmt.Sprintf("/project-notes/%d", projectID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching notes: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeGetNote(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	noteID := int(args["note_id"].(float64))

	endpoint := fmt.Sprintf("/notes/%d", noteID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching note: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeSyncNote(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	content := args["content"].(string)

	payload := map[string]interface{}{
		"project_id": projectID,
		"content":    content,
	}

	// Optional sticky note properties
	if color, ok := args["color"].(string); ok {
		payload["color"] = color
	}
	if posX, ok := args["position_x"].(float64); ok {
		payload["position_x"] = int(posX)
	}
	if posY, ok := args["position_y"].(float64); ok {
		payload["position_y"] = int(posY)
	}
	if width, ok := args["width"].(float64); ok {
		payload["width"] = int(width)
	}
	if height, ok := args["height"].(float64); ok {
		payload["height"] = int(height)
	}

	var endpoint string
	var method string

	if noteID, ok := args["note_id"].(float64); ok && noteID > 0 {
		endpoint = fmt.Sprintf("/notes/%d", int(noteID))
		method = "PUT"
	} else {
		endpoint = fmt.Sprintf("/project-notes/%d", projectID)
		method = "POST"
	}

	resp, err := ctx.APIClient.Request(method, endpoint, payload)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "sync sticky note"), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"synced":  true,
		"note":    resp,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// DOCUMENT SYNC EXECUTORS (docs space - markdown files)
// ============================================================================

func executeListProjectDocuments(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))

	endpoint := fmt.Sprintf("/project-documents/%d", projectID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list project documents"), IsError: true}
	}

	// API returns array directly for project-documents endpoint
	result := map[string]interface{}{
		"success":    true,
		"project_id": projectID,
		"documents":  resp,
		"source":     "sync-api",
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeGetDocument(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	documentID := int(args["document_id"].(float64))

	endpoint := fmt.Sprintf("/documents/%d", documentID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "get document"), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeSyncDocument(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	title := args["title"].(string)
	content := args["content"].(string)

	payload := map[string]interface{}{
		"title":   title,
		"content": content,
	}

	if docType, ok := args["type"].(string); ok {
		payload["type"] = docType
	}

	var endpoint string
	var method string

	if documentID, ok := args["document_id"].(float64); ok && documentID > 0 {
		endpoint = fmt.Sprintf("/documents/%d", int(documentID))
		method = "PUT"
	} else {
		endpoint = fmt.Sprintf("/project-documents/%d", projectID)
		method = "POST"
	}

	resp, err := ctx.APIClient.Request(method, endpoint, payload)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "sync document"), IsError: true}
	}

	result := map[string]interface{}{
		"success":  true,
		"synced":   true,
		"document": resp,
		"message":  fmt.Sprintf("Document '%s' synced to team cloud", title),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// CONVERSATION SYNC EXECUTORS
// ============================================================================

func executeListConversations(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))

	endpoint := fmt.Sprintf("/conversations?project_id=%d", projectID)
	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error fetching conversations: %v", err), IsError: true}
	}

	jsonResult, _ := json.MarshalIndent(resp, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeSyncConversation(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	messages := args["messages"].(string)

	payload := map[string]interface{}{
		"project_id": projectID,
		"messages":   json.RawMessage(messages),
	}

	if title, ok := args["title"].(string); ok {
		payload["title"] = title
	}
	if space, ok := args["space"].(string); ok {
		payload["space"] = space
	}

	endpoint := "/conversations"
	resp, err := ctx.APIClient.Request("POST", endpoint, payload)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error syncing conversation: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"synced":  true,
		"conversation": resp,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// PROJECT CONTEXT EXECUTORS
// ============================================================================

func executeGetProjectSyncStatus(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))

	// Fetch counts from sync-api
	synced := map[string]int{}

	// Count designs
	if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-designs/%d", projectID), nil); err == nil {
		if data, ok := resp["data"].([]interface{}); ok {
			synced["designs"] = len(data)
		}
	}

	// Count tasks
	if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/tasks?project_id=%d", projectID), nil); err == nil {
		if data, ok := resp["data"].([]interface{}); ok {
			synced["tasks"] = len(data)
		}
	}

	// Count sticky notes
	if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-notes/%d", projectID), nil); err == nil {
		if data, ok := resp["data"].([]interface{}); ok {
			synced["notes"] = len(data)
		}
	}

	// Count documents - API returns array directly, but client wraps in map
	if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-documents/%d", projectID), nil); err == nil {
		// Try "data" key first (standard format), then count map entries
		if data, ok := resp["data"].([]interface{}); ok {
			synced["documents"] = len(data)
		} else {
			// Response might be the array content itself
			synced["documents"] = len(resp)
		}
	}

	status := map[string]interface{}{
		"project_id": projectID,
		"synced":     synced,
	}

	result := map[string]interface{}{
		"success": true,
		"status":  status,
		"source":  "sync-api",
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeGetFullProjectContext(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))

	includeDesigns := true
	includeTasks := true
	includeNotes := true
	includeDocs := true
	includeConvos := false

	if val, ok := args["include_designs"].(bool); ok {
		includeDesigns = val
	}
	if val, ok := args["include_tasks"].(bool); ok {
		includeTasks = val
	}
	if val, ok := args["include_notes"].(bool); ok {
		includeNotes = val
	}
	if val, ok := args["include_docs"].(bool); ok {
		includeDocs = val
	}
	if val, ok := args["include_convos"].(bool); ok {
		includeConvos = val
	}

	context := map[string]interface{}{
		"project_id": projectID,
		"source":     "sync-api (team shared)",
	}

	// Fetch designs (UI space)
	if includeDesigns {
		if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-designs/%d", projectID), nil); err == nil {
			context["designs"] = resp["data"]
		}
	}

	// Fetch tasks (kanban space)
	if includeTasks {
		if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/tasks?project_id=%d", projectID), nil); err == nil {
			context["tasks"] = resp["data"]
		}
	}

	// Fetch sticky notes (notes space)
	if includeNotes {
		if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-notes/%d", projectID), nil); err == nil {
			context["notes"] = resp["data"]
		}
	}

	// Fetch documents (docs space - PRDs, READMEs, etc.)
	if includeDocs {
		if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-documents/%d", projectID), nil); err == nil {
			// project-documents returns array directly
			context["documents"] = resp
		}
	}

	// Fetch recent conversations
	if includeConvos {
		if resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/conversations?project_id=%d&limit=5", projectID), nil); err == nil {
			context["conversations"] = resp["data"]
		}
	}

	result := map[string]interface{}{
		"success": true,
		"context": context,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}
