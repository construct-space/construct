package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode"
)

// formatAPIError converts API errors into user-friendly messages
func formatAPIError(err error, action string) string {
	errStr := err.Error()

	// Check for permission/authorization errors (403)
	if strings.Contains(errStr, "403") {
		return fmt.Sprintf("Permission denied: You don't have permission to %s. Contact your administrator to request access.", action)
	}

	// Check for authentication errors (401)
	if strings.Contains(errStr, "401") {
		return fmt.Sprintf("Authentication required: Please log in to %s.", action)
	}

	// Check for not found errors (404)
	if strings.Contains(errStr, "404") {
		return fmt.Sprintf("Not found: The requested resource for '%s' does not exist.", action)
	}

	// Default error message
	return fmt.Sprintf("Error: %v", err)
}

// ConstructTools - Tools for interacting with Construct API (projects, companies, members)
func init() {
	category := &ToolCategory{
		Name:        "construct",
		Description: "Construct platform tools for managing projects, companies, and team members",
		Tools: []providers.Tool{
			// Context tool - get current user and company
			MakeTool("get_current_context", "Get current user info including their company. Use this to get company_id when not specified.",
				map[string]providers.Property{}, nil),

			// Project tools
			MakeTool("create_project", "Create a new project with specified name, description, and enabled spaces (code, design, git, ai, notes, kanban, deploy)",
				map[string]providers.Property{
					"name":        {Type: "string", Description: "The name of the project"},
					"description": {Type: "string", Description: "A description of the project"},
					"spaces":      {Type: "array", Description: "List of spaces to enable: code, design, git, ai, notes, kanban, deploy"},
					"company_id":  {Type: "number", Description: "The company ID (optional - uses current user's company if not specified)"},
				}, []string{"name"}),

			MakeTool("list_projects", "List all projects the user has access to",
				map[string]providers.Property{}, nil),

			MakeTool("resolve_project_name", "Resolve a project by fuzzy name match. Use before project-specific actions when only a project name is provided.",
				map[string]providers.Property{
					"query": {Type: "string", Description: "Project name or partial project name to resolve"},
					"limit": {Type: "number", Description: "Maximum number of candidates to return (default: 5)"},
				}, []string{"query"}),

			MakeTool("resolve_design_name", "Resolve a design by name, scoped to a project (by project_id or project_name). Returns best match plus candidates for clarification.",
				map[string]providers.Property{
					"design_name":  {Type: "string", Description: "Design name or partial design name"},
					"project_id":   {Type: "number", Description: "Project ID (optional; if omitted, project_name or current project is used)"},
					"project_name": {Type: "string", Description: "Project name to resolve first (optional if project_id provided)"},
					"limit":        {Type: "number", Description: "Maximum number of design candidates to return (default: 5)"},
				}, []string{"design_name"}),

			MakeTool("get_project", "Get details of a specific project by ID",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project to retrieve"},
				}, []string{"project_id"}),

			MakeTool("update_project", "Update an existing project's name or description",
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "The ID of the project to update"},
					"name":        {Type: "string", Description: "New name for the project"},
					"description": {Type: "string", Description: "New description for the project"},
				}, []string{"project_id"}),

			MakeTool("delete_project", "Delete a project by ID",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project to delete"},
				}, []string{"project_id"}),

			// Member tools
			MakeTool("add_project_member", "Add a user as a member to a project",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"user_id":    {Type: "number", Description: "The ID of the user to add"},
				}, []string{"project_id", "user_id"}),

			MakeTool("remove_project_member", "Remove a member from a project",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"member_id":  {Type: "number", Description: "The ID of the member to remove"},
				}, []string{"project_id", "member_id"}),

			MakeTool("grant_space_access", "Grant a project member access to a specific space (code, design, git, ai, notes, kanban, deploy)",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"member_id":  {Type: "number", Description: "The ID of the member (from project members list)"},
					"space_name": {Type: "string", Description: "The space to grant access to: code, design, git, ai, notes, kanban, or deploy"},
				}, []string{"project_id", "member_id", "space_name"}),

			MakeTool("revoke_space_access", "Revoke a project member's access to a specific space",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
					"member_id":  {Type: "number", Description: "The ID of the member"},
					"space_name": {Type: "string", Description: "The space to revoke access from"},
				}, []string{"project_id", "member_id", "space_name"}),

			MakeTool("list_project_members", "List all members of a project",
				map[string]providers.Property{
					"project_id": {Type: "number", Description: "The ID of the project"},
				}, []string{"project_id"}),

			// User tools
			MakeTool("list_users", "List all users in the system (for assigning to projects)",
				map[string]providers.Property{}, nil),

			MakeTool("get_user", "Get details of a specific user by ID",
				map[string]providers.Property{
					"user_id": {Type: "number", Description: "The ID of the user"},
				}, []string{"user_id"}),

			MakeTool("search_users", "Search for users by name or email",
				map[string]providers.Property{
					"query": {Type: "string", Description: "Search query (name or email)"},
				}, []string{"query"}),

			MakeTool("create_user", "Create a new user in the system. Uses current user's company if not specified.",
				map[string]providers.Property{
					"name":       {Type: "string", Description: "Full name of the user"},
					"email":      {Type: "string", Description: "Email address of the user"},
					"role":       {Type: "string", Description: "Role: admin, designer, developer, member"},
					"company_id": {Type: "number", Description: "Company ID (optional - uses current user's company if not specified)"},
				}, []string{"name", "email"}),

			// Company tools
			MakeTool("list_companies", "List all companies the user has access to",
				map[string]providers.Property{}, nil),

			MakeTool("get_company", "Get details of a specific company by ID",
				map[string]providers.Property{
					"company_id": {Type: "number", Description: "The ID of the company"},
				}, []string{"company_id"}),

			MakeTool("create_company", "Create a new company",
				map[string]providers.Property{
					"name":        {Type: "string", Description: "The name of the company"},
					"description": {Type: "string", Description: "A description of the company"},
				}, []string{"name"}),

			// Invite tools
			MakeTool("invite_to_company", "Invite a user to join a company by email. If company not specified, uses current user's company.",
				map[string]providers.Property{
					"company_id":  {Type: "number", Description: "Company ID (optional - uses current user's company if not specified)"},
					"email":       {Type: "string", Description: "Email address of the person to invite"},
					"role":        {Type: "string", Description: "Role: admin, designer, developer, member"},
					"member_type": {Type: "string", Description: "Member type: employee or external (default: employee)"},
					"position":    {Type: "string", Description: "Job title/position (e.g., Designer, Developer)"},
				}, []string{"email"}),

			MakeTool("list_company_invites", "List pending invites for a company",
				map[string]providers.Property{
					"company_id": {Type: "number", Description: "The ID of the company"},
				}, []string{"company_id"}),

			// Task tools
			MakeTool("create_task", "Create a new task in a project",
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "The ID of the project"},
					"title":       {Type: "string", Description: "The title of the task"},
					"description": {Type: "string", Description: "Detailed description of the task"},
					"status":      {Type: "string", Description: "Task status: backlog, todo, in_progress, review, done"},
					"priority":    {Type: "string", Description: "Task priority: low, medium, high, urgent"},
					"space":       {Type: "string", Description: "The space this task belongs to: code, design, git, ai, notes"},
					"assignee_id": {Type: "number", Description: "The member ID to assign the task to"},
				}, []string{"project_id", "title"}),

			MakeTool("list_tasks", "List tasks with optional filters",
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Filter by project ID"},
					"assignee_id": {Type: "number", Description: "Filter by assignee member ID"},
					"status":      {Type: "string", Description: "Filter by status: backlog, todo, in_progress, review, done"},
					"space":       {Type: "string", Description: "Filter by space"},
				}, nil),

			MakeTool("get_task", "Get details of a specific task",
				map[string]providers.Property{
					"task_id": {Type: "number", Description: "The ID of the task"},
				}, []string{"task_id"}),

			MakeTool("update_task", "Update an existing task",
				map[string]providers.Property{
					"task_id":     {Type: "number", Description: "The ID of the task to update"},
					"title":       {Type: "string", Description: "New title for the task"},
					"description": {Type: "string", Description: "New description"},
					"status":      {Type: "string", Description: "New status: backlog, todo, in_progress, review, done"},
					"priority":    {Type: "string", Description: "New priority: low, medium, high, urgent"},
					"space":       {Type: "string", Description: "New space assignment"},
					"assignee_id": {Type: "number", Description: "New assignee member ID (0 to unassign)"},
				}, []string{"task_id"}),

			MakeTool("delete_task", "Delete a task",
				map[string]providers.Property{
					"task_id": {Type: "number", Description: "The ID of the task to delete"},
				}, []string{"task_id"}),

			MakeTool("list_my_tasks", "List all tasks assigned to the current user across all projects",
				map[string]providers.Property{
					"status": {Type: "string", Description: "Filter by status: backlog, todo, in_progress, review, done"},
				}, nil),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Register executors
	DefaultRegistry.RegisterExecutor("get_current_context", executeGetCurrentContext)
	DefaultRegistry.RegisterExecutor("create_project", executeCreateProject)
	DefaultRegistry.RegisterExecutor("list_projects", executeListProjects)
	DefaultRegistry.RegisterExecutor("resolve_project_name", executeResolveProjectName)
	DefaultRegistry.RegisterExecutor("resolve_design_name", executeResolveDesignName)
	DefaultRegistry.RegisterExecutor("get_project", executeGetProject)
	DefaultRegistry.RegisterExecutor("update_project", executeUpdateProject)
	DefaultRegistry.RegisterExecutor("delete_project", executeDeleteProject)
	DefaultRegistry.RegisterExecutor("add_project_member", executeAddProjectMember)
	DefaultRegistry.RegisterExecutor("remove_project_member", executeRemoveProjectMember)
	DefaultRegistry.RegisterExecutor("grant_space_access", executeGrantSpaceAccess)
	DefaultRegistry.RegisterExecutor("revoke_space_access", executeRevokeSpaceAccess)
	DefaultRegistry.RegisterExecutor("list_project_members", executeListProjectMembers)
	DefaultRegistry.RegisterExecutor("list_users", executeListUsers)
	DefaultRegistry.RegisterExecutor("get_user", executeGetUser)
	DefaultRegistry.RegisterExecutor("search_users", executeSearchUsers)
	DefaultRegistry.RegisterExecutor("create_user", executeCreateUser)
	DefaultRegistry.RegisterExecutor("list_companies", executeListCompanies)
	DefaultRegistry.RegisterExecutor("get_company", executeGetCompany)
	DefaultRegistry.RegisterExecutor("create_company", executeCreateCompany)
	DefaultRegistry.RegisterExecutor("invite_to_company", executeInviteToCompany)
	DefaultRegistry.RegisterExecutor("list_company_invites", executeListCompanyInvites)

	// Task executors
	DefaultRegistry.RegisterExecutor("create_task", executeCreateTask)
	DefaultRegistry.RegisterExecutor("list_tasks", executeListTasks)
	DefaultRegistry.RegisterExecutor("get_task", executeGetTask)
	DefaultRegistry.RegisterExecutor("update_task", executeUpdateTask)
	DefaultRegistry.RegisterExecutor("delete_task", executeDeleteTask)
	DefaultRegistry.RegisterExecutor("list_my_tasks", executeListMyTasks)
}

// Project executors
// executeGetCurrentContext returns the current user's context including company
func executeGetCurrentContext(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	// Get current user info from /api/profile
	resp, err := ctx.APIClient.Request("GET", "/api/profile", nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "get current context"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

// getCompanyIDFromContext extracts company_id from args or gets it from cached/current user context
func getCompanyIDFromContext(args map[string]interface{}, ctx *ExecutionContext) int {
	// First check if company_id was provided in args
	if companyID, ok := args["company_id"].(float64); ok && companyID > 0 {
		return int(companyID)
	}

	// Try cached context first (fast, no API call)
	if ctx.Storage != nil {
		if companyID := ctx.Storage.GetCurrentCompanyID(); companyID > 0 {
			return companyID
		}
	}

	// Fallback to API call if cache miss
	resp, err := ctx.APIClient.Request("GET", "/api/profile", nil)
	if err != nil {
		return 0
	}

	// Extract company_id from response
	if companyID, ok := resp["company_id"].(float64); ok {
		return int(companyID)
	}
	// Also check nested company object
	if company, ok := resp["company"].(map[string]interface{}); ok {
		if id, ok := company["id"].(float64); ok {
			return int(id)
		}
	}
	return 0
}

func executeCreateProject(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	spaces, _ := args["spaces"].([]interface{})
	companyID := getCompanyIDFromContext(args, ctx)

	spaceStrings := []string{}
	for _, sp := range spaces {
		if s, ok := sp.(string); ok {
			spaceStrings = append(spaceStrings, s)
		}
	}
	if len(spaceStrings) == 0 {
		spaceStrings = []string{"code", "design", "notes"}
	}

	body := map[string]interface{}{
		"name":        name,
		"description": description,
		"spaces":      spaceStrings,
	}
	if companyID > 0 {
		body["company_id"] = companyID
	}

	resp, err := ctx.APIClient.Request("POST", "/api/projects", body)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "create project"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Project created successfully: %s", string(respJSON))}
}

func executeListProjects(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	resp, err := ctx.APIClient.Request("GET", "/api/projects", nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list projects"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

type namedMatchCandidate struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Score float64 `json:"score"`
}

type scopedDesignMatchCandidate struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Score       float64 `json:"score"`
	ProjectID   int     `json:"project_id"`
	ProjectName string  `json:"project_name"`
}

func normalizeLookupName(input string) string {
	lower := strings.ToLower(strings.TrimSpace(input))
	if lower == "" {
		return ""
	}

	var b strings.Builder
	b.Grow(len(lower))
	lastSpace := false

	for _, r := range lower {
		switch {
		case unicode.IsLetter(r), unicode.IsNumber(r):
			b.WriteRune(r)
			lastSpace = false
		default:
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
		}
	}

	return strings.TrimSpace(b.String())
}

func tokenizeLookupName(input string) []string {
	normalized := normalizeLookupName(input)
	if normalized == "" {
		return nil
	}
	return strings.Fields(normalized)
}

func nameSimilarityScore(query, candidate string) float64 {
	q := normalizeLookupName(query)
	c := normalizeLookupName(candidate)
	if q == "" || c == "" {
		return 0
	}
	if q == c {
		return 1
	}

	maxScore := 0.0
	if strings.HasPrefix(c, q) || strings.HasPrefix(q, c) {
		maxScore = 0.92
	}
	if strings.Contains(c, q) || strings.Contains(q, c) {
		if maxScore < 0.88 {
			maxScore = 0.88
		}
	}

	qTokens := tokenizeLookupName(q)
	cTokens := tokenizeLookupName(c)
	if len(qTokens) == 0 || len(cTokens) == 0 {
		return maxScore
	}

	qSet := make(map[string]struct{}, len(qTokens))
	for _, token := range qTokens {
		qSet[token] = struct{}{}
	}
	cSet := make(map[string]struct{}, len(cTokens))
	for _, token := range cTokens {
		cSet[token] = struct{}{}
	}

	intersection := 0
	for token := range qSet {
		if _, ok := cSet[token]; ok {
			intersection++
		}
	}
	if intersection == 0 {
		return maxScore
	}

	union := len(qSet)
	for token := range cSet {
		if _, ok := qSet[token]; !ok {
			union++
		}
	}
	if union > 0 {
		jaccard := float64(intersection) / float64(union)
		tokenScore := 0.55 + (0.4 * jaccard)
		if tokenScore > maxScore {
			maxScore = tokenScore
		}
	}

	return maxScore
}

func extractListProjects(resp map[string]interface{}) []map[string]interface{} {
	var items []interface{}

	switch {
	case resp == nil:
		return nil
	case resp["data"] != nil:
		if arr, ok := resp["data"].([]interface{}); ok {
			items = arr
		}
	case resp["projects"] != nil:
		if arr, ok := resp["projects"].([]interface{}); ok {
			items = arr
		}
	case resp["id"] != nil && resp["name"] != nil:
		items = []interface{}{resp}
	}

	projects := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		project, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if _, ok := project["id"]; !ok {
			continue
		}
		if _, ok := project["name"]; !ok {
			continue
		}
		projects = append(projects, project)
	}
	return projects
}

func extractDesignsList(resp map[string]interface{}) []map[string]interface{} {
	if resp == nil {
		return nil
	}

	var items []interface{}
	switch {
	case resp["data"] != nil:
		if arr, ok := resp["data"].([]interface{}); ok {
			items = arr
		}
	case resp["designs"] != nil:
		if arr, ok := resp["designs"].([]interface{}); ok {
			items = arr
		}
	}

	designs := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		design, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if _, ok := design["id"]; !ok {
			continue
		}
		if _, ok := design["name"]; !ok {
			continue
		}
		designs = append(designs, design)
	}
	return designs
}

func toInt(value interface{}) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	default:
		return 0
	}
}

func toString(value interface{}) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func rankNameMatches(query string, items []map[string]interface{}) []namedMatchCandidate {
	candidates := make([]namedMatchCandidate, 0, len(items))
	for _, item := range items {
		id := toInt(item["id"])
		name := toString(item["name"])
		if id <= 0 || strings.TrimSpace(name) == "" {
			continue
		}
		score := nameSimilarityScore(query, name)
		if score <= 0 {
			continue
		}
		candidates = append(candidates, namedMatchCandidate{
			ID:    id,
			Name:  name,
			Score: score,
		})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score == candidates[j].Score {
			return candidates[i].Name < candidates[j].Name
		}
		return candidates[i].Score > candidates[j].Score
	})

	return candidates
}

func isConfidentScore(top, second float64) bool {
	if top >= 0.92 {
		return true
	}
	return top >= 0.8 && (top-second) >= 0.12
}

func isConfidentMatch(candidates []namedMatchCandidate) bool {
	if len(candidates) == 0 {
		return false
	}
	top := candidates[0].Score
	second := 0.0
	if len(candidates) > 1 {
		second = candidates[1].Score
	}
	return isConfidentScore(top, second)
}

func rankProjectCandidatesFromDesignMatches(matches []scopedDesignMatchCandidate) []namedMatchCandidate {
	bestByProject := make(map[int]namedMatchCandidate)
	for _, match := range matches {
		if match.ProjectID <= 0 || strings.TrimSpace(match.ProjectName) == "" {
			continue
		}
		current, exists := bestByProject[match.ProjectID]
		if !exists || match.Score > current.Score {
			bestByProject[match.ProjectID] = namedMatchCandidate{
				ID:    match.ProjectID,
				Name:  match.ProjectName,
				Score: match.Score,
			}
		}
	}

	candidates := make([]namedMatchCandidate, 0, len(bestByProject))
	for _, candidate := range bestByProject {
		candidates = append(candidates, candidate)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score == candidates[j].Score {
			return candidates[i].Name < candidates[j].Name
		}
		return candidates[i].Score > candidates[j].Score
	})

	return candidates
}

func resolveDesignAcrossProjects(designName string, limit int, ctx *ExecutionContext) (map[string]interface{}, error) {
	if limit <= 0 {
		limit = 5
	}

	projectsResp, err := ctx.APIClient.Request("GET", "/api/projects", nil)
	if err != nil {
		return nil, err
	}
	projects := extractListProjects(projectsResp)

	result := map[string]interface{}{
		"success":                true,
		"design_name":            designName,
		"matched":                false,
		"requires_clarification": true,
		"project_resolution":     map[string]interface{}{},
		"project_first_required": true,
		"project_candidates":     []namedMatchCandidate{},
		"candidates":             []scopedDesignMatchCandidate{},
	}

	if len(projects) == 0 {
		result["message"] = "No accessible projects found. Provide a valid project first."
		return result, nil
	}

	matches := make([]scopedDesignMatchCandidate, 0)
	for _, project := range projects {
		projectID := toInt(project["id"])
		projectName := toString(project["name"])
		if projectID <= 0 || strings.TrimSpace(projectName) == "" {
			continue
		}

		designsResp, listErr := ctx.APIClient.Request("GET", fmt.Sprintf("/project-designs/%d", projectID), nil)
		if listErr != nil {
			continue
		}
		designs := extractDesignsList(designsResp)
		for _, candidate := range rankNameMatches(designName, designs) {
			matches = append(matches, scopedDesignMatchCandidate{
				ID:          candidate.ID,
				Name:        candidate.Name,
				Score:       candidate.Score,
				ProjectID:   projectID,
				ProjectName: projectName,
			})
		}
	}

	sort.SliceStable(matches, func(i, j int) bool {
		if matches[i].Score == matches[j].Score {
			if matches[i].ProjectName == matches[j].ProjectName {
				return matches[i].Name < matches[j].Name
			}
			return matches[i].ProjectName < matches[j].ProjectName
		}
		return matches[i].Score > matches[j].Score
	})

	if len(matches) == 0 {
		result["message"] = "No design names matched across accessible projects. Provide project_name to narrow the search."
		return result, nil
	}

	projectCandidates := rankProjectCandidatesFromDesignMatches(matches)
	result["project_candidates"] = projectCandidates

	topN := len(matches)
	if topN > limit {
		topN = limit
	}
	result["candidates"] = matches[:topN]

	top := matches[0]
	secondScore := 0.0
	if len(matches) > 1 {
		secondScore = matches[1].Score
	}
	if isConfidentScore(top.Score, secondScore) {
		result["matched"] = true
		result["requires_clarification"] = false
		result["project_first_required"] = false
		result["project_id"] = top.ProjectID
		result["project_name"] = top.ProjectName
		result["project"] = map[string]interface{}{
			"id":    top.ProjectID,
			"name":  top.ProjectName,
			"score": top.Score,
		}
		result["design"] = map[string]interface{}{
			"id":    top.ID,
			"name":  top.Name,
			"score": top.Score,
		}
		result["confidence"] = top.Score
		result["message"] = "Resolved project and design name confidently."
		return result, nil
	}

	result["project_id"] = top.ProjectID
	result["project_name"] = top.ProjectName
	result["project"] = map[string]interface{}{
		"id":    top.ProjectID,
		"name":  top.ProjectName,
		"score": top.Score,
	}
	result["design"] = map[string]interface{}{
		"id":    top.ID,
		"name":  top.Name,
		"score": top.Score,
	}
	result["confidence"] = top.Score
	result["message"] = "Multiple projects/designs matched. Clarify the project first."
	return result, nil
}

func resolveProjectByName(query string, limit int, ctx *ExecutionContext) (map[string]interface{}, error) {
	resp, err := ctx.APIClient.Request("GET", "/api/projects", nil)
	if err != nil {
		return nil, err
	}

	projects := extractListProjects(resp)
	candidates := rankNameMatches(query, projects)
	if limit <= 0 {
		limit = 5
	}
	if len(candidates) < limit {
		limit = len(candidates)
	}
	topCandidates := candidates[:limit]

	result := map[string]interface{}{
		"success":                true,
		"query":                  query,
		"matched":                false,
		"requires_clarification": true,
		"candidates":             topCandidates,
	}

	if len(candidates) == 0 {
		result["message"] = "No project names matched the query."
		return result, nil
	}

	if isConfidentMatch(candidates) {
		result["matched"] = true
		result["requires_clarification"] = false
		result["project"] = map[string]interface{}{
			"id":    candidates[0].ID,
			"name":  candidates[0].Name,
			"score": candidates[0].Score,
		}
		result["confidence"] = candidates[0].Score
		result["message"] = "Resolved project name confidently."
		return result, nil
	}

	result["project"] = map[string]interface{}{
		"id":    candidates[0].ID,
		"name":  candidates[0].Name,
		"score": candidates[0].Score,
	}
	result["confidence"] = candidates[0].Score
	result["message"] = "Multiple similar project names found."
	return result, nil
}

func executeResolveProjectName(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return ToolResult{Content: "Error: query is required.", IsError: true}
	}

	limit := 5
	if rawLimit, ok := args["limit"].(float64); ok && rawLimit > 0 {
		limit = int(rawLimit)
	}

	result, err := resolveProjectByName(query, limit, ctx)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "resolve project name"), IsError: true}
	}

	respJSON, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(respJSON)}
}

func executeResolveDesignName(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	designName, _ := args["design_name"].(string)
	designName = strings.TrimSpace(designName)
	if designName == "" {
		return ToolResult{Content: "Error: design_name is required.", IsError: true}
	}

	limit := 5
	if rawLimit, ok := args["limit"].(float64); ok && rawLimit > 0 {
		limit = int(rawLimit)
	}

	projectID := 0
	if rawProjectID, ok := args["project_id"].(float64); ok && rawProjectID > 0 {
		projectID = int(rawProjectID)
	}
	projectName, _ := args["project_name"].(string)
	projectName = strings.TrimSpace(projectName)

	// Use frontend-provided current project context when project_id wasn't explicitly provided.
	if projectID == 0 && ctx.LocalData != nil {
		if localProjectID, ok := ctx.LocalData["project_id"].(float64); ok && localProjectID > 0 {
			projectID = int(localProjectID)
		}
		if projectName == "" {
			if localProjectName, ok := ctx.LocalData["project_name"].(string); ok {
				projectName = strings.TrimSpace(localProjectName)
			}
		}
	}

	projectResolve := map[string]interface{}{}
	if projectID == 0 && projectName != "" {
		resolvedProject, err := resolveProjectByName(projectName, limit, ctx)
		if err != nil {
			return ToolResult{Content: formatAPIError(err, "resolve project for design"), IsError: true}
		}
		projectResolve = resolvedProject
		if matched, _ := resolvedProject["matched"].(bool); !matched {
			respJSON, _ := json.MarshalIndent(map[string]interface{}{
				"success":                true,
				"design_name":            designName,
				"matched":                false,
				"requires_clarification": true,
				"message":                "Project name is ambiguous; clarify project first.",
				"project_resolution":     resolvedProject,
			}, "", "  ")
			return ToolResult{Content: string(respJSON)}
		}

		if project, ok := resolvedProject["project"].(map[string]interface{}); ok {
			projectID = toInt(project["id"])
			if projectName == "" {
				projectName = toString(project["name"])
			}
		}
	}

	if projectID == 0 {
		autoResolved, err := resolveDesignAcrossProjects(designName, limit, ctx)
		if err != nil {
			return ToolResult{Content: formatAPIError(err, "resolve design name"), IsError: true}
		}
		respJSON, _ := json.MarshalIndent(autoResolved, "", "  ")
		return ToolResult{Content: string(respJSON)}
	}

	designsResp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/project-designs/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list project designs"), IsError: true}
	}

	designs := extractDesignsList(designsResp)
	candidates := rankNameMatches(designName, designs)
	if len(candidates) < limit {
		limit = len(candidates)
	}
	topCandidates := candidates[:limit]

	result := map[string]interface{}{
		"success":                true,
		"design_name":            designName,
		"project_id":             projectID,
		"project_name":           projectName,
		"project_resolution":     projectResolve,
		"matched":                false,
		"requires_clarification": true,
		"candidates":             topCandidates,
	}

	if len(candidates) == 0 {
		result["message"] = "No design names matched in the specified project."
		respJSON, _ := json.MarshalIndent(result, "", "  ")
		return ToolResult{Content: string(respJSON)}
	}

	if isConfidentMatch(candidates) {
		result["matched"] = true
		result["requires_clarification"] = false
		result["design"] = candidates[0]
		result["confidence"] = candidates[0].Score
		result["message"] = "Resolved design name confidently."
		respJSON, _ := json.MarshalIndent(result, "", "  ")
		return ToolResult{Content: string(respJSON)}
	}

	result["design"] = candidates[0]
	result["confidence"] = candidates[0].Score
	result["message"] = "Multiple similar design names found."
	respJSON, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(respJSON)}
}

func executeGetProject(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/projects/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "get project details"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeUpdateProject(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	body := map[string]interface{}{}
	if name, ok := args["name"].(string); ok && name != "" {
		body["name"] = name
	}
	if description, ok := args["description"].(string); ok {
		body["description"] = description
	}

	resp, err := ctx.APIClient.Request("PUT", fmt.Sprintf("/api/projects/%d", projectID), body)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "update project"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Project updated: %s", string(respJSON))}
}

func executeDeleteProject(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	_, err := ctx.APIClient.Request("DELETE", fmt.Sprintf("/api/projects/%d", projectID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "delete project"), IsError: true}
	}
	return ToolResult{Content: fmt.Sprintf("Project %d deleted successfully", projectID)}
}

// Member executors
func executeAddProjectMember(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	userID := int(args["user_id"].(float64))
	resp, err := ctx.APIClient.Request("POST", fmt.Sprintf("/api/projects/%d/members", projectID), map[string]interface{}{
		"user_id": userID,
	})
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "add project member"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Member added successfully: %s", string(respJSON))}
}

func executeRemoveProjectMember(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	memberID := int(args["member_id"].(float64))
	_, err := ctx.APIClient.Request("DELETE", fmt.Sprintf("/api/projects/%d/members/%d", projectID, memberID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "remove project member"), IsError: true}
	}
	return ToolResult{Content: fmt.Sprintf("Member %d removed from project %d", memberID, projectID)}
}

func executeGrantSpaceAccess(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	memberID := int(args["member_id"].(float64))
	spaceName, _ := args["space_name"].(string)
	resp, err := ctx.APIClient.Request("POST", fmt.Sprintf("/api/projects/%d/members/%d/spaces", projectID, memberID), map[string]interface{}{
		"space_name": spaceName,
	})
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "grant space access"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Space access granted: %s", string(respJSON))}
}

func executeRevokeSpaceAccess(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	memberID := int(args["member_id"].(float64))
	spaceName, _ := args["space_name"].(string)
	_, err := ctx.APIClient.Request("DELETE", fmt.Sprintf("/api/projects/%d/members/%d/spaces/%s", projectID, memberID, spaceName), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "revoke space access"), IsError: true}
	}
	return ToolResult{Content: fmt.Sprintf("Space access revoked for %s", spaceName)}
}

func executeListProjectMembers(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/projects/%d/members", projectID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list project members"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

// User executors
func executeListUsers(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	resp, err := ctx.APIClient.Request("GET", "/api/users/all", nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list users"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeGetUser(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	userID := int(args["user_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/users/%d", userID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "view user details"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeSearchUsers(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	query = strings.ToLower(query)

	// Get all users from the list endpoint
	resp, err := ctx.APIClient.Request("GET", "/api/users/all", nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "search users"), IsError: true}
	}

	// Filter results by query (case-insensitive name match)
	if data, ok := resp["data"].([]interface{}); ok {
		var filtered []interface{}
		for _, item := range data {
			if user, ok := item.(map[string]interface{}); ok {
				name, _ := user["name"].(string)
				if strings.Contains(strings.ToLower(name), query) {
					filtered = append(filtered, user)
				}
			}
		}
		resp["data"] = filtered
	}

	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeCreateUser(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	email, _ := args["email"].(string)
	role, _ := args["role"].(string)
	companyID := getCompanyIDFromContext(args, ctx)
	if companyID == 0 {
		return ToolResult{Content: "Error: Could not determine company. Please specify company_id.", IsError: true}
	}

	// Split name into first/last
	nameParts := strings.SplitN(name, " ", 2)
	firstName := nameParts[0]
	lastName := ""
	if len(nameParts) > 1 {
		lastName = nameParts[1]
	}

	// Map role to role_id (system roles: 1=SuperAdmin, 2=Admin, 3=Member)
	roleID := 3 // default to Member
	switch strings.ToLower(role) {
	case "super admin", "superadmin", "owner":
		roleID = 1
	case "admin", "administrator":
		roleID = 2
	case "member", "designer", "developer": // Designer/Developer map to Member
		roleID = 3
	}

	// Generate a temporary password (user should reset)
	tempPassword := "Construct2024!"

	payload := map[string]interface{}{
		"first_name": firstName,
		"last_name":  lastName,
		"username":   strings.Split(email, "@")[0],
		"email":      email,
		"password":   tempPassword,
		"role_id":    roleID,
		"company_id": companyID,
	}

	resp, err := ctx.APIClient.Request("POST", "/api/users", payload)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "create user"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("User created: %s (temp password: %s)", string(respJSON), tempPassword)}
}

// Company executors
func executeListCompanies(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	resp, err := ctx.APIClient.Request("GET", "/api/companies/all", nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list companies"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeGetCompany(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	companyID := int(args["company_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/companies/%d", companyID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "get company details"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeCreateCompany(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	resp, err := ctx.APIClient.Request("POST", "/api/companies", map[string]interface{}{
		"name":        name,
		"description": description,
	})
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "create company"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Company created: %s", string(respJSON))}
}

func executeInviteToCompany(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	companyID := getCompanyIDFromContext(args, ctx)
	if companyID == 0 {
		return ToolResult{Content: "Error: Could not determine company. Please specify company_id.", IsError: true}
	}

	email, _ := args["email"].(string)
	role, _ := args["role"].(string)
	memberType, _ := args["member_type"].(string)
	position, _ := args["position"].(string)

	// Default member type to employee
	if memberType == "" {
		memberType = "employee"
	}

	// Map role string to role_id (system roles: 1=SuperAdmin, 2=Admin, 3=Member)
	roleID := 3 // default to Member
	switch strings.ToLower(role) {
	case "super admin", "superadmin", "owner":
		roleID = 1
	case "admin", "administrator":
		roleID = 2
	case "member", "designer", "developer":
		roleID = 3
	}

	payload := map[string]interface{}{
		"email":       email,
		"role_id":     roleID,
		"member_type": memberType,
	}
	if position != "" {
		payload["position"] = position
	}

	resp, err := ctx.APIClient.Request("POST", fmt.Sprintf("/api/companies/%d/invite", companyID), payload)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "invite user to company"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Invite sent: %s", string(respJSON))}
}

func executeListCompanyInvites(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	companyID := int(args["company_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/companies/%d/invites", companyID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list company invites"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

// Task executors
func executeCreateTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	title, _ := args["title"].(string)
	description, _ := args["description"].(string)
	status, _ := args["status"].(string)
	priority, _ := args["priority"].(string)
	space, _ := args["space"].(string)
	assigneeID, _ := args["assignee_id"].(float64)

	if status == "" {
		status = "backlog"
	}
	if priority == "" {
		priority = "medium"
	}

	body := map[string]interface{}{
		"project_id":  projectID,
		"title":       title,
		"description": description,
		"status":      status,
		"priority":    priority,
	}
	if space != "" {
		body["space"] = space
	}
	if assigneeID > 0 {
		body["assignee_id"] = int(assigneeID)
	}

	resp, err := ctx.APIClient.Request("POST", "/api/tasks", body)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "create task"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Task created successfully: %s", string(respJSON))}
}

func executeListTasks(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	// Build query params
	params := []string{}
	if projectID, ok := args["project_id"].(float64); ok && projectID > 0 {
		params = append(params, fmt.Sprintf("project_id=%d", int(projectID)))
	}
	if assigneeID, ok := args["assignee_id"].(float64); ok && assigneeID > 0 {
		params = append(params, fmt.Sprintf("assignee_id=%d", int(assigneeID)))
	}
	if status, ok := args["status"].(string); ok && status != "" {
		params = append(params, fmt.Sprintf("status=%s", status))
	}
	if space, ok := args["space"].(string); ok && space != "" {
		params = append(params, fmt.Sprintf("space=%s", space))
	}

	url := "/api/tasks"
	if len(params) > 0 {
		url += "?" + params[0]
		for _, p := range params[1:] {
			url += "&" + p
		}
	}

	resp, err := ctx.APIClient.Request("GET", url, nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list tasks"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeGetTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	taskID := int(args["task_id"].(float64))
	resp, err := ctx.APIClient.Request("GET", fmt.Sprintf("/api/tasks/%d", taskID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "get task details"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeUpdateTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	taskID := int(args["task_id"].(float64))
	body := map[string]interface{}{}

	if title, ok := args["title"].(string); ok && title != "" {
		body["title"] = title
	}
	if description, ok := args["description"].(string); ok {
		body["description"] = description
	}
	if status, ok := args["status"].(string); ok && status != "" {
		body["status"] = status
	}
	if priority, ok := args["priority"].(string); ok && priority != "" {
		body["priority"] = priority
	}
	if space, ok := args["space"].(string); ok {
		body["space"] = space
	}
	if assigneeID, ok := args["assignee_id"].(float64); ok {
		if assigneeID == 0 {
			body["assignee_id"] = nil
		} else {
			body["assignee_id"] = int(assigneeID)
		}
	}

	resp, err := ctx.APIClient.Request("PUT", fmt.Sprintf("/api/tasks/%d", taskID), body)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "update task"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Task updated: %s", string(respJSON))}
}

func executeDeleteTask(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	taskID := int(args["task_id"].(float64))
	_, err := ctx.APIClient.Request("DELETE", fmt.Sprintf("/api/tasks/%d", taskID), nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "delete task"), IsError: true}
	}
	return ToolResult{Content: fmt.Sprintf("Task %d deleted successfully", taskID)}
}

func executeListMyTasks(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	url := "/api/tasks/my"
	if status, ok := args["status"].(string); ok && status != "" {
		url += "?status=" + status
	}

	resp, err := ctx.APIClient.Request("GET", url, nil)
	if err != nil {
		return ToolResult{Content: formatAPIError(err, "list my tasks"), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}
