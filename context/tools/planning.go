package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
)

// PlanningTools - Tools for project planning and PRD management
func init() {
	category := &ToolCategory{
		Name:        "planning",
		Description: "Project planning tools for creating PRDs and managing project setup",
		Tools: []providers.Tool{
			MakeTool("save_project_prd",
				"Save a PRD (Product Requirements Document) and create the project. Creates a new project with the PRD stored in notes.",
				map[string]providers.Property{
					"project_name":        {Type: "string", Description: "Project name"},
					"project_description": {Type: "string", Description: "Project description"},
					"prd_content":         {Type: "string", Description: "PRD content in markdown format"},
					"spaces":              {Type: "array", Description: "Spaces to enable: code, design, git, ai, notes, kanban, deploy"},
					"company_id":          {Type: "number", Description: "Company ID (optional)"},
				}, []string{"project_name", "prd_content"}),

			MakeTool("finalize_planning",
				"Signal that planning is complete and the project is ready for creation",
				map[string]providers.Property{
					"project_name":    {Type: "string", Description: "Project name"},
					"summary":         {Type: "string", Description: "Brief summary of what was decided"},
					"ready_to_create": {Type: "boolean", Description: "Whether the project is ready to be created"},
				}, []string{"project_name", "summary"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("save_project_prd", executeSaveProjectPRD)
	DefaultRegistry.RegisterExecutor("finalize_planning", executeFinalizePlanning)
}

func executeSaveProjectPRD(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectName, _ := args["project_name"].(string)
	projectDescription, _ := args["project_description"].(string)
	prdContent, _ := args["prd_content"].(string)
	spaces, _ := args["spaces"].([]interface{})
	companyID, _ := args["company_id"].(float64)

	spaceStrings := []string{}
	for _, sp := range spaces {
		if s, ok := sp.(string); ok {
			spaceStrings = append(spaceStrings, s)
		}
	}
	if len(spaceStrings) == 0 {
		spaceStrings = []string{"code", "design", "notes", "kanban"}
	}

	body := map[string]interface{}{
		"name":        projectName,
		"description": projectDescription,
		"spaces":      spaceStrings,
		"prd":         prdContent,
	}
	if companyID > 0 {
		body["company_id"] = int(companyID)
	}

	resp, err := ctx.APIClient.Request("POST", "/api/projects", body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating project with PRD: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Project created with PRD saved! %s", string(respJSON))}
}

func executeFinalizePlanning(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectName, _ := args["project_name"].(string)
	summary, _ := args["summary"].(string)
	readyToCreate, _ := args["ready_to_create"].(bool)

	return ToolResult{Content: fmt.Sprintf(`Planning complete for "%s"!

Summary: %s

Ready to create: %v

The user can now review and create the project.`, projectName, summary, readyToCreate)}
}
