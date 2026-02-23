package rag

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ContextBuilderOptions configures context building behavior
type ContextBuilderOptions struct {
	MaxRAGTokens       int     // Max tokens for RAG context (default 4096)
	MaxFileTokens      int     // Max tokens for current file content (default 2048)
	MaxProjectTokens   int     // Max tokens for project context (default 1024)
	IncludeRAG         bool    // Whether to include RAG results (default true)
	IncludeProjectCtx  bool    // Whether to include project context (default true)
	IncludeSpaceCtx    bool    // Whether to include space-specific context (default true)
	RAGRetrievalOpts   RetrievalOptions
}

// DefaultContextBuilderOptions returns defaults
func DefaultContextBuilderOptions() ContextBuilderOptions {
	return ContextBuilderOptions{
		MaxRAGTokens:     4096,
		MaxFileTokens:    2048,
		MaxProjectTokens: 1024,
		IncludeRAG:       true,
		IncludeProjectCtx: true,
		IncludeSpaceCtx:  true,
		RAGRetrievalOpts: DefaultRetrievalOptions(),
	}
}

// ContextBuilder constructs unified system prompts from agent config, local data, and RAG
type ContextBuilder struct {
	retriever *Retriever
	opts      ContextBuilderOptions
}

// NewContextBuilder creates a new context builder
func NewContextBuilder(retriever *Retriever, opts ContextBuilderOptions) *ContextBuilder {
	if opts.MaxRAGTokens == 0 {
		opts = DefaultContextBuilderOptions()
	}
	return &ContextBuilder{
		retriever: retriever,
		opts:      opts,
	}
}

// BuildContext constructs a complete system prompt by combining:
// 1. Agent behavioral prompt (from .md file)
// 2. Project context (from local_data)
// 3. RAG results (semantically relevant content)
// 4. Live state (current file, space-specific state)
// 5. Cross-space references
func (cb *ContextBuilder) BuildContext(agentPrompt string, localData map[string]interface{}, userMessage string, space string) string {
	var sb strings.Builder

	// 1. Agent behavioral prompt (always first)
	sb.WriteString(agentPrompt)

	// 2. Project context
	if cb.opts.IncludeProjectCtx {
		projectCtx := cb.buildProjectContext(localData)
		if projectCtx != "" {
			sb.WriteString("\n\n")
			sb.WriteString(projectCtx)
		}
	}

	// 3. Space-specific context
	if cb.opts.IncludeSpaceCtx {
		spaceCtx := cb.buildSpaceContext(localData, space)
		if spaceCtx != "" {
			sb.WriteString("\n\n")
			sb.WriteString(spaceCtx)
		}
	}

	// 4. RAG results
	if cb.opts.IncludeRAG && cb.retriever != nil && userMessage != "" {
		ragCtx := cb.buildRAGContext(localData, userMessage)
		if ragCtx != "" {
			sb.WriteString("\n\n")
			sb.WriteString(ragCtx)
		}
	}

	// 5. Cross-space reference syntax
	sb.WriteString("\n\n")
	sb.WriteString(crossSpaceReferenceGuide)

	return sb.String()
}

// buildProjectContext extracts project info from local_data
func (cb *ContextBuilder) buildProjectContext(localData map[string]interface{}) string {
	if localData == nil {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Project Context\n")
	hasContent := false

	// Project name
	if name, ok := localData["project_name"].(string); ok && name != "" {
		sb.WriteString(fmt.Sprintf("- **Project:** %s\n", name))
		hasContent = true
	}

	// Framework
	if fw, ok := localData["project_framework"].(string); ok && fw != "" {
		sb.WriteString(fmt.Sprintf("- **Framework:** %s\n", fw))
		hasContent = true
	}

	// Current folder
	if folder, ok := localData["current_folder"].(string); ok && folder != "" {
		sb.WriteString(fmt.Sprintf("- **Working directory:** %s\n", folder))
		hasContent = true
	}

	// Team members (for task assignment and @mentions)
	if members, ok := localData["project_members"].([]interface{}); ok && len(members) > 0 {
		sb.WriteString("\n### Team Members\n")
		for _, m := range members {
			if member, ok := m.(map[string]interface{}); ok {
				name, _ := member["name"].(string)
				position, _ := member["position"].(string)
				role, _ := member["role"].(string)
				if name != "" {
					sb.WriteString(fmt.Sprintf("- **%s**", name))
					if position != "" {
						sb.WriteString(fmt.Sprintf(" (%s)", position))
					}
					if role != "" {
						sb.WriteString(fmt.Sprintf(" [%s]", role))
					}
					sb.WriteString("\n")
				}
			}
		}
		sb.WriteString("When user mentions a person by name, match against this list.\n")
		hasContent = true
	}

	// Current file
	if cf, ok := localData["current_file"].(map[string]interface{}); ok {
		if path, ok := cf["path"].(string); ok && path != "" {
			sb.WriteString(fmt.Sprintf("\n### Current File: %s\n", path))
			if lang, ok := cf["language"].(string); ok && lang != "" {
				sb.WriteString(fmt.Sprintf("Language: %s\n", lang))
			}
			if content, ok := cf["content"].(string); ok && content != "" {
				// Truncate to max tokens
				lines := strings.SplitN(content, "\n", 301)
				if len(lines) > 300 {
					lines = lines[:300]
					lines = append(lines, "... (truncated)")
				}
				sb.WriteString("```\n")
				sb.WriteString(strings.Join(lines, "\n"))
				sb.WriteString("\n```\n")
			}
			hasContent = true
		}
	}

	// Selection
	if sel, ok := localData["selection"].(map[string]interface{}); ok {
		if text, ok := sel["text"].(string); ok && text != "" {
			sb.WriteString("\n### Selected Code\n```\n")
			sb.WriteString(text)
			sb.WriteString("\n```\n")
			hasContent = true
		}
	}

	if !hasContent {
		return ""
	}

	return sb.String()
}

// buildSpaceContext adds space-specific context based on current route/space
func (cb *ContextBuilder) buildSpaceContext(localData map[string]interface{}, space string) string {
	if space == "" {
		return ""
	}

	var sb strings.Builder

	switch strings.ToLower(space) {
	case "code":
		sb.WriteString("## Context: Code Editor\n")
		sb.WriteString("You are helping the user in the Code Editor. Focus on coding, debugging, testing, and code review.\n")
		sb.WriteString("You can read and write files, run commands, and search the codebase.\n")

	case "design", "ui":
		sb.WriteString("## Context: UI Designer\n")
		sb.WriteString("You are helping the user in the UI Designer. Focus on creating screens, layouts, and visual elements.\n")
		if cb.buildCanvasContext(localData) != "" {
			sb.WriteString(cb.buildCanvasContext(localData))
		}

	case "git":
		sb.WriteString("## Context: Git & Version Control\n")
		sb.WriteString("You are helping the user with version control. Focus on commits, branches, merges, and repository management.\n")
		sb.WriteString(cb.buildGitContext(localData))

	case "kanban":
		sb.WriteString("## Context: Task Management\n")
		sb.WriteString("You are helping the user manage tasks and project workflow. Focus on creating, updating, and organizing tasks.\n")

	case "docs", "notes":
		sb.WriteString("## Context: Documentation\n")
		sb.WriteString("You are helping the user with documentation. Focus on writing, editing, and organizing documents.\n")
		sb.WriteString(cb.buildDocsContext(localData))

	case "calendar":
		sb.WriteString("## Context: Calendar & Scheduling\n")
		sb.WriteString("You are helping the user with scheduling and time management.\n")

	case "ai", "conductor":
		sb.WriteString("## Context: AI Assistant\n")
		sb.WriteString("You are the main AI conductor. Route requests to specialized agents or handle general queries directly.\n")

	default:
		sb.WriteString(fmt.Sprintf("## Context: %s\n", space))
	}

	return sb.String()
}

// buildGitContext extracts git state from local_data
func (cb *ContextBuilder) buildGitContext(localData map[string]interface{}) string {
	sc, ok := localData["space_context"].(map[string]interface{})
	if !ok {
		return ""
	}
	git, ok := sc["git"].(map[string]interface{})
	if !ok {
		return ""
	}

	var sb strings.Builder
	if branch, ok := git["currentBranch"].(string); ok && branch != "" {
		sb.WriteString(fmt.Sprintf("- **Branch:** %s\n", branch))
	}
	if hasChanges, ok := git["hasUncommittedChanges"].(bool); ok && hasChanges {
		sb.WriteString("- **Status:** Has uncommitted changes\n")
	}
	if commits, ok := git["recentCommits"].([]interface{}); ok && len(commits) > 0 {
		sb.WriteString("- **Recent commits:**\n")
		for _, c := range commits {
			if s, ok := c.(string); ok {
				sb.WriteString(fmt.Sprintf("  - %s\n", s))
			}
		}
	}
	return sb.String()
}

// buildDocsContext extracts document context from local_data
func (cb *ContextBuilder) buildDocsContext(localData map[string]interface{}) string {
	sc, ok := localData["space_context"].(map[string]interface{})
	if !ok {
		return ""
	}
	docs, ok := sc["docs"].(map[string]interface{})
	if !ok {
		return ""
	}

	var sb strings.Builder
	if activeDoc, ok := docs["activeDocument"].(map[string]interface{}); ok {
		if title, ok := activeDoc["title"].(string); ok && title != "" {
			sb.WriteString(fmt.Sprintf("\n### Current Document: %s\n", title))
			sb.WriteString("When the user says 'this document', they mean the document above.\n")
		}
		if content, ok := activeDoc["content"].(string); ok && content != "" {
			// Limit to 4000 chars
			if len(content) > 4000 {
				content = content[:4000] + "\n... (truncated)"
			}
			sb.WriteString("```\n")
			sb.WriteString(content)
			sb.WriteString("\n```\n")
		}
	}
	return sb.String()
}

// buildCanvasContext extracts design canvas context from local_data
func (cb *ContextBuilder) buildCanvasContext(localData map[string]interface{}) string {
	var sb strings.Builder

	if summary, ok := localData["canvas_summary"].(map[string]interface{}); ok {
		total, _ := summary["total_elements"]
		sb.WriteString(fmt.Sprintf("\n### Canvas State\nTotal elements: %v\n", total))

		if screens, ok := summary["screens"].([]interface{}); ok && len(screens) > 0 {
			sb.WriteString("Screens:\n")
			for _, s := range screens {
				if screen, ok := s.(map[string]interface{}); ok {
					name, _ := screen["name"].(string)
					sb.WriteString(fmt.Sprintf("  - %s\n", name))
				}
			}
		}
	}

	if designs, ok := localData["designs"].([]interface{}); ok && len(designs) > 0 {
		sb.WriteString("\n### Available Designs\n")
		for _, d := range designs {
			if design, ok := d.(map[string]interface{}); ok {
				name, _ := design["name"].(string)
				screens, _ := design["screen_count"]
				elements, _ := design["element_count"]
				sb.WriteString(fmt.Sprintf("- %s (%v screens, %v elements)\n", name, screens, elements))
			}
		}
	}

	return sb.String()
}

// buildRAGContext retrieves relevant content via RAG
func (cb *ContextBuilder) buildRAGContext(localData map[string]interface{}, userMessage string) string {
	projectID := extractProjectID(localData)
	if projectID == 0 {
		return ""
	}

	results, err := cb.retriever.Search(projectID, userMessage, cb.opts.RAGRetrievalOpts)
	if err != nil || len(results) == 0 {
		return ""
	}

	return FormatResults(results, cb.opts.MaxRAGTokens)
}

// --- Helper functions ---

func extractProjectID(localData map[string]interface{}) int {
	if localData == nil {
		return 0
	}

	// Try direct project_id
	if id, ok := localData["project_id"].(float64); ok {
		return int(id)
	}
	if id, ok := localData["project_id"].(int); ok {
		return id
	}

	// Try from space_context.project
	if sc, ok := localData["space_context"].(map[string]interface{}); ok {
		if proj, ok := sc["project"].(map[string]interface{}); ok {
			if id, ok := proj["id"].(float64); ok {
				return int(id)
			}
		}
	}

	return 0
}

// ExtractProjectDir extracts the project directory from local_data
func ExtractProjectDir(localData map[string]interface{}) string {
	if localData == nil {
		return ""
	}

	if folder, ok := localData["current_folder"].(string); ok && folder != "" {
		return folder
	}

	if sc, ok := localData["space_context"].(map[string]interface{}); ok {
		if proj, ok := sc["project"].(map[string]interface{}); ok {
			if path, ok := proj["localPath"].(string); ok && path != "" {
				return path
			}
		}
	}

	return ""
}

// ExtractProjectID exports project ID extraction
func ExtractProjectID(localData map[string]interface{}) int {
	return extractProjectID(localData)
}

// FormatRAGStats returns a summary of RAG state for debugging
func FormatRAGStats(store *Store, projectID int) string {
	counts, err := store.CountByType(projectID)
	if err != nil {
		return "RAG stats unavailable"
	}

	total := 0
	var parts []string
	for ct, count := range counts {
		total += count
		parts = append(parts, fmt.Sprintf("%s: %d", ct, count))
	}

	if total == 0 {
		return "RAG: No indexed content"
	}

	return fmt.Sprintf("RAG: %d chunks indexed (%s)", total, strings.Join(parts, ", "))
}

// --- Static context data ---

// crossSpaceReferenceGuide documents the reference syntax users can use
const crossSpaceReferenceGuide = `## Cross-Space References
Users can reference content from other spaces using these patterns:
- ` + "`@DesignName`" + ` - Reference a design by name
- ` + "`^DocTitle`" + ` - Reference a document by title
- ` + "`#123`" + ` - Reference a task by ID
- ` + "`~ComponentName`" + ` - Reference a component
- ` + "`$path/to/file`" + ` - Reference a file by path
- ` + "`!filename`" + ` - Quick file reference (searched in project)

When you see these references, resolve them to provide relevant context.`

// SerializeLocalDataSummary creates a compact JSON summary of local_data for logging
func SerializeLocalDataSummary(localData map[string]interface{}) string {
	summary := make(map[string]interface{})

	if name, ok := localData["project_name"]; ok {
		summary["project"] = name
	}
	if folder, ok := localData["current_folder"]; ok {
		summary["folder"] = folder
	}
	if cf, ok := localData["current_file"].(map[string]interface{}); ok {
		if path, ok := cf["path"]; ok {
			summary["file"] = path
		}
	}
	if designs, ok := localData["designs"].([]interface{}); ok {
		summary["designs"] = len(designs)
	}

	data, _ := json.Marshal(summary)
	return string(data)
}
