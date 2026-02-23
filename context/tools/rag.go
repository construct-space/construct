package tools

import (
	"encoding/json"
	"fmt"

	"construct-context/providers"
	"construct-context/rag"
)

// RAGTools returns tool definitions for RAG-powered search and indexing
func RAGTools() *ToolCategory {
	return &ToolCategory{
		Name:        "knowledge",
		Description: "Project knowledge search and indexing tools",
		Tools: []providers.Tool{
			MakeToolWithExamples("search_project_knowledge",
				"Search the project's indexed knowledge base using semantic and keyword search. "+
					"Returns relevant code snippets, documentation, design specs, and task descriptions. "+
					"Use this to find relevant context before answering questions or making changes.",
				map[string]providers.Property{
					"query": {
						Type:        "string",
						Description: "The search query - describe what you're looking for",
					},
					"content_type": {
						Type:        "string",
						Description: "Filter by content type",
						Enum:        []string{"code", "doc", "design", "task", "note", ""},
					},
					"max_results": {
						Type:        "string",
						Description: "Maximum number of results to return (default: 5, max: 20)",
					},
				},
				[]string{"query"},
				[]map[string]interface{}{
					{"query": "authentication middleware", "content_type": "code"},
					{"query": "how does the payment flow work", "max_results": "10"},
					{"query": "user onboarding design", "content_type": "design"},
				},
			),
			MakeTool("index_project",
				"Index or re-index the current project for knowledge search. "+
					"Run this when the user asks to index their project or when search results seem stale. "+
					"Indexing happens in the background and enables semantic search.",
				map[string]providers.Property{
					"path": {
						Type:        "string",
						Description: "Project directory path to index. If empty, uses current project.",
					},
				},
				[]string{},
			),
			MakeTool("get_rag_stats",
				"Get statistics about the project's knowledge index - how many files are indexed, "+
					"what types of content are available, and which embedding provider is active.",
				map[string]providers.Property{},
				[]string{},
			),
			MakeToolWithExamples("save_progress",
				"Save a progress checkpoint for long-running tasks. Records what has been done, "+
					"what's remaining, and any important decisions. Useful for multi-session work "+
					"where context may be lost between sessions.",
				map[string]providers.Property{
					"summary": {
						Type:        "string",
						Description: "Summary of progress so far",
					},
					"completed": {
						Type:        "string",
						Description: "JSON array of completed items",
					},
					"remaining": {
						Type:        "string",
						Description: "JSON array of remaining items",
					},
					"decisions": {
						Type:        "string",
						Description: "Key decisions made during this session",
					},
				},
				[]string{"summary"},
				[]map[string]interface{}{
					{
						"summary":   "Implemented user auth with JWT tokens",
						"completed": "[\"JWT generation\", \"Login endpoint\", \"Auth middleware\"]",
						"remaining": "[\"Password reset\", \"Email verification\"]",
						"decisions": "Using RS256 for JWT, refresh tokens in httpOnly cookies",
					},
				},
			),
			MakeTool("read_progress",
				"Read the last saved progress checkpoint. Use at the start of a session to "+
					"understand what was done previously and what still needs to be done.",
				map[string]providers.Property{},
				[]string{},
			),
		},
	}
}

func init() {
	category := RAGTools()
	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("search_project_knowledge", executeSearchProjectKnowledge)
	DefaultRegistry.RegisterExecutor("index_project", executeIndexProject)
	DefaultRegistry.RegisterExecutor("get_rag_stats", executeGetRAGStats)
	DefaultRegistry.RegisterExecutor("save_progress", executeSaveProgress)
	DefaultRegistry.RegisterExecutor("read_progress", executeReadProgress)
}

func executeSearchProjectKnowledge(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	if query == "" {
		return ToolResult{Content: "Error: query is required", IsError: true}
	}

	// Get RAG service from storage
	ragSvc := getRAGService(ctx)
	if ragSvc == nil {
		return ToolResult{Content: "RAG service not available. Project may not be indexed yet.", IsError: true}
	}

	projectID := getProjectIDFromContext(ctx)
	if projectID == 0 {
		return ToolResult{Content: "No project context available", IsError: true}
	}

	opts := rag.DefaultRetrievalOptions()

	// Parse content type filter
	if ct, ok := args["content_type"].(string); ok && ct != "" {
		opts.ContentTypes = []rag.ContentType{rag.ContentType(ct)}
	}

	// Parse max results
	if mr, ok := args["max_results"].(string); ok && mr != "" {
		var n int
		if _, err := fmt.Sscanf(mr, "%d", &n); err == nil && n > 0 {
			if n > 20 {
				n = 20
			}
			opts.TopK = n
		}
	}

	results, err := ragSvc.Search(projectID, query, opts)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Search error: %v", err), IsError: true}
	}

	if len(results) == 0 {
		return ToolResult{Content: "No relevant results found. The project may not be indexed yet. Use `index_project` to index it."}
	}

	// Format results
	formatted := rag.FormatResults(results, 8000)
	return ToolResult{Content: formatted}
}

func executeIndexProject(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	ragSvc := getRAGService(ctx)
	if ragSvc == nil {
		return ToolResult{Content: "RAG service not available", IsError: true}
	}

	projectID := getProjectIDFromContext(ctx)
	if projectID == 0 {
		return ToolResult{Content: "No project context available", IsError: true}
	}

	projectDir := ""
	if path, ok := args["path"].(string); ok && path != "" {
		projectDir = path
	} else if ctx.Project != nil && ctx.Project.LocalPath != "" {
		projectDir = ctx.Project.LocalPath
	} else if ctx.LocalData != nil {
		projectDir = rag.ExtractProjectDir(ctx.LocalData)
	}

	if projectDir == "" {
		return ToolResult{Content: "No project directory available. Please provide a path.", IsError: true}
	}

	if ragSvc.Indexer().IsRunning() {
		return ToolResult{Content: "Indexing is already in progress. Please wait for it to complete."}
	}

	// Start async indexing
	ragSvc.IndexProjectAsync(projectID, projectDir)

	stats, _ := ragSvc.GetStats(projectID)
	statsJSON, _ := json.MarshalIndent(stats, "", "  ")

	return ToolResult{Content: fmt.Sprintf("Started background indexing of %s\nCurrent stats:\n%s", projectDir, string(statsJSON))}
}

func executeGetRAGStats(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	ragSvc := getRAGService(ctx)
	if ragSvc == nil {
		return ToolResult{Content: "RAG service not available", IsError: true}
	}

	projectID := getProjectIDFromContext(ctx)
	stats, err := ragSvc.GetStats(projectID)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error getting stats: %v", err), IsError: true}
	}

	data, _ := json.MarshalIndent(stats, "", "  ")
	return ToolResult{Content: string(data)}
}

func executeSaveProgress(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	summary, _ := args["summary"].(string)
	if summary == "" {
		return ToolResult{Content: "Error: summary is required", IsError: true}
	}

	progress := map[string]interface{}{
		"summary": summary,
	}
	if completed, ok := args["completed"].(string); ok {
		progress["completed"] = completed
	}
	if remaining, ok := args["remaining"].(string); ok {
		progress["remaining"] = remaining
	}
	if decisions, ok := args["decisions"].(string); ok {
		progress["decisions"] = decisions
	}

	data, _ := json.Marshal(progress)

	// Store in KV store
	if ctx.Storage != nil {
		projectID := getProjectIDFromContext(ctx)
		key := fmt.Sprintf("progress-%d", projectID)
		if err := ctx.Storage.SetSetting(key, string(data)); err != nil {
			return ToolResult{Content: fmt.Sprintf("Error saving progress: %v", err), IsError: true}
		}
	}

	return ToolResult{Content: fmt.Sprintf("Progress saved:\n%s", string(data))}
}

func executeReadProgress(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	if ctx.Storage == nil {
		return ToolResult{Content: "No storage available", IsError: true}
	}

	projectID := getProjectIDFromContext(ctx)
	key := fmt.Sprintf("progress-%d", projectID)
	value, err := ctx.Storage.GetSetting(key)
	if err != nil || value == "" {
		return ToolResult{Content: "No progress checkpoint found for this project."}
	}

	return ToolResult{Content: fmt.Sprintf("Last saved progress:\n%s", value)}
}

// --- Helpers ---

// getRAGService extracts the RAG service from the execution context.
// The RAG service is stored as a special key in LocalData by the streaming handler.
func getRAGService(ctx *ExecutionContext) *rag.Service {
	if ctx.LocalData == nil {
		return nil
	}
	if svc, ok := ctx.LocalData["_rag_service"].(*rag.Service); ok {
		return svc
	}
	return nil
}

func getProjectIDFromContext(ctx *ExecutionContext) int {
	if ctx.Project != nil && ctx.Project.ID > 0 {
		return ctx.Project.ID
	}
	if ctx.LocalData != nil {
		return rag.ExtractProjectID(ctx.LocalData)
	}
	return 0
}
