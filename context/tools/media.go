package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"strings"
)

// MediaTools - Tools for media library, image generation, and web search
func init() {
	category := &ToolCategory{
		Name:        "media",
		Description: "Media tools for file management, image generation, and web search",
		Tools: []providers.Tool{
			MakeTool("upload_media",
				"Upload a file or create a document in the media library",
				map[string]providers.Property{
					"name":        {Type: "string", Description: "File/document name"},
					"type":        {Type: "string", Description: "Media type: 'file', 'folder', or 'document'"},
					"content":     {Type: "string", Description: "For documents: markdown content. For files: base64 data or URL"},
					"parent_id":   {Type: "number", Description: "Parent folder ID (optional)"},
					"description": {Type: "string", Description: "Description (optional)"},
					"company_id":  {Type: "number", Description: "Company ID (optional)"},
					"author_id":   {Type: "number", Description: "Author user ID (optional)"},
				}, []string{"name", "type"}),

			MakeTool("list_media",
				"List media files and folders",
				map[string]providers.Property{
					"parent_id":  {Type: "number", Description: "Parent folder ID (omit for root)"},
					"type":       {Type: "string", Description: "Filter: 'file', 'folder', 'document', or 'all'"},
					"company_id": {Type: "number", Description: "Filter by company ID"},
					"author_id":  {Type: "number", Description: "Filter by author ID"},
				}, nil),

			MakeTool("create_media_folder",
				"Create a folder in the media library",
				map[string]providers.Property{
					"name":       {Type: "string", Description: "Folder name"},
					"parent_id":  {Type: "number", Description: "Parent folder ID (omit for root)"},
					"company_id": {Type: "number", Description: "Company ID (optional)"},
					"author_id":  {Type: "number", Description: "Author user ID (optional)"},
				}, []string{"name"}),

			MakeTool("generate_image",
				"Generate an image using AI from a text prompt",
				map[string]providers.Property{
					"prompt": {Type: "string", Description: "Text description of the image to generate"},
					"size":   {Type: "string", Description: "Image size: 1024x1024, 1280x720, or 720x1280"},
				}, []string{"prompt"}),

			MakeTool("web_search",
				"Search the web for information",
				map[string]providers.Property{
					"query": {Type: "string", Description: "Search query"},
					"count": {Type: "number", Description: "Number of results (default: 10)"},
				}, []string{"query"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("upload_media", executeUploadMedia)
	DefaultRegistry.RegisterExecutor("list_media", executeListMedia)
	DefaultRegistry.RegisterExecutor("create_media_folder", executeCreateMediaFolder)
	DefaultRegistry.RegisterExecutor("generate_image", executeGenerateImage)
	DefaultRegistry.RegisterExecutor("web_search", executeWebSearch)
}

func executeUploadMedia(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	mediaType, _ := args["type"].(string)
	content, _ := args["content"].(string)
	description, _ := args["description"].(string)
	parentID, _ := args["parent_id"].(float64)
	companyID, _ := args["company_id"].(float64)
	authorID, _ := args["author_id"].(float64)

	body := map[string]interface{}{
		"name":        name,
		"type":        mediaType,
		"description": description,
	}
	if content != "" {
		body["content"] = content
	}
	if parentID > 0 {
		body["parent_id"] = int(parentID)
	}
	if companyID > 0 {
		body["company_id"] = int(companyID)
	}
	if authorID > 0 {
		body["author_id"] = int(authorID)
	}

	resp, err := ctx.APIClient.Request("POST", "/api/media", body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error uploading media: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Media uploaded: %s", string(respJSON))}
}

func executeListMedia(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	parentID, hasParent := args["parent_id"].(float64)
	mediaType, _ := args["type"].(string)
	companyID, _ := args["company_id"].(float64)
	authorID, _ := args["author_id"].(float64)

	endpoint := "/api/media/all"
	params := []string{}
	if hasParent && parentID > 0 {
		params = append(params, fmt.Sprintf("parent_id=%d", int(parentID)))
	}
	if mediaType != "" && mediaType != "all" {
		params = append(params, fmt.Sprintf("type=%s", mediaType))
	}
	if companyID > 0 {
		params = append(params, fmt.Sprintf("company_id=%d", int(companyID)))
	}
	if authorID > 0 {
		params = append(params, fmt.Sprintf("author_id=%d", int(authorID)))
	}
	if len(params) > 0 {
		endpoint += "?" + strings.Join(params, "&")
	}

	resp, err := ctx.APIClient.Request("GET", endpoint, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error listing media: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeCreateMediaFolder(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	parentID, _ := args["parent_id"].(float64)
	companyID, _ := args["company_id"].(float64)
	authorID, _ := args["author_id"].(float64)

	body := map[string]interface{}{
		"name": name,
		"type": "folder",
	}
	if parentID > 0 {
		body["parent_id"] = int(parentID)
	}
	if companyID > 0 {
		body["company_id"] = int(companyID)
	}
	if authorID > 0 {
		body["author_id"] = int(authorID)
	}

	resp, err := ctx.APIClient.Request("POST", "/api/media", body)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating folder: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: fmt.Sprintf("Folder created: %s", string(respJSON))}
}

func executeGenerateImage(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	prompt, _ := args["prompt"].(string)
	size, _ := args["size"].(string)
	if size == "" {
		size = "1024x1024"
	}

	if ctx.ImageGenerator == nil {
		return ToolResult{Content: "No image generation providers configured", IsError: true}
	}

	result, err := ctx.ImageGenerator.Generate(prompt, size, "standard", "")
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error generating image: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeWebSearch(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	count := 10
	if c, ok := args["count"].(float64); ok {
		count = int(c)
	}

	// Find provider that supports web search
	var searchProvider interface {
		WebSearch(query string, count int, recency string) (interface{}, error)
	}
	for _, p := range ctx.ProviderManager.All() {
		if p.SupportsWebSearch() {
			if sp, ok := p.(interface {
				WebSearch(query string, count int, recency string) (interface{}, error)
			}); ok {
				searchProvider = sp
				break
			}
		}
	}
	if searchProvider == nil {
		return ToolResult{Content: "No provider supports web search", IsError: true}
	}

	resp, err := searchProvider.WebSearch(query, count, "noLimit")
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error searching: %v", err), IsError: true}
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}
