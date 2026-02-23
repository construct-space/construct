package tools

import (
	"bufio"
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// CodeTools - Comprehensive tools for code operations, file management, and design-to-code generation
func init() {
	category := &ToolCategory{
		Name:        "code",
		Description: "Code generation, file operations, and project context tools",
		Tools: []providers.Tool{
			// === FILE SEARCH & READ ===
			MakeTool("file_search",
				`Search for content patterns in files (grep-like).
Searches recursively through directories. Supports regex patterns.
Returns matching file paths and optionally the matching lines with context.`,
				map[string]providers.Property{
					"path":           {Type: "string", Description: "Directory or file to search in"},
					"pattern":        {Type: "string", Description: "Regex pattern to search for"},
					"file_pattern":   {Type: "string", Description: "Glob pattern to filter files (e.g., '*.ts', '*.vue')"},
					"context_lines":  {Type: "number", Description: "Number of context lines before/after match (default: 0)"},
					"max_results":    {Type: "number", Description: "Maximum number of results (default: 50)"},
					"case_sensitive": {Type: "boolean", Description: "Case sensitive search (default: true)"},
				}, []string{"path", "pattern"}),

			// === FILE EDITING ===
			MakeTool("fast_apply",
				`Smart code patching with fuzzy matching.
Uses context markers (// ... existing code ...) to locate and replace code sections.
Best for targeted changes that preserve surrounding code.`,
				map[string]providers.Property{
					"path":       {Type: "string", Description: "Path to the file to edit"},
					"change_str": {Type: "string", Description: "Code change with context markers. Use '// ... existing code ...' to mark unchanged sections"},
				}, []string{"path", "change_str"}),

			MakeTool("edit_file",
				`Exact string replacement in a file.
Replaces the first occurrence of old_str with new_str.
Use for precise, targeted edits when you know the exact text.`,
				map[string]providers.Property{
					"path":        {Type: "string", Description: "Path to the file to edit"},
					"old_str":     {Type: "string", Description: "Exact string to find and replace"},
					"new_str":     {Type: "string", Description: "Replacement string"},
					"replace_all": {Type: "boolean", Description: "Replace all occurrences (default: false)"},
				}, []string{"path", "old_str", "new_str"}),

			MakeTool("write_file",
				`Write content to a file. Creates the file if it doesn't exist.
For new files only - use edit_file or fast_apply for existing files.`,
				map[string]providers.Property{
					"path":        {Type: "string", Description: "Path to write the file"},
					"content":     {Type: "string", Description: "The file content to write"},
					"create_dirs": {Type: "boolean", Description: "Create parent directories if needed (default: true)"},
				}, []string{"path", "content"}),

			// === FILE OPERATIONS ===
			MakeTool("delete_file",
				`Delete a file or directory.
Use with caution - this is irreversible.`,
				map[string]providers.Property{
					"path":      {Type: "string", Description: "Path to delete"},
					"recursive": {Type: "boolean", Description: "Delete directories recursively (default: false)"},
				}, []string{"path"}),

			MakeTool("move_file",
				`Move or rename a file or directory.`,
				map[string]providers.Property{
					"source": {Type: "string", Description: "Source path"},
					"dest":   {Type: "string", Description: "Destination path"},
				}, []string{"source", "dest"}),

			MakeTool("copy_file",
				`Copy a file or directory.`,
				map[string]providers.Property{
					"source":    {Type: "string", Description: "Source path"},
					"dest":      {Type: "string", Description: "Destination path"},
					"recursive": {Type: "boolean", Description: "Copy directories recursively (default: true)"},
				}, []string{"source", "dest"}),

			MakeTool("create_directory",
				`Create a directory (and parent directories if needed).`,
				map[string]providers.Property{
					"path": {Type: "string", Description: "Directory path to create"},
				}, []string{"path"}),

			// === PROJECT CONTEXT ===
			MakeTool("get_file_tree",
				`Get the file tree structure of a directory.
Returns a hierarchical view of files and folders.`,
				map[string]providers.Property{
					"path":           {Type: "string", Description: "Root directory path"},
					"max_depth":      {Type: "number", Description: "Maximum depth to traverse (default: 5)"},
					"include_hidden": {Type: "boolean", Description: "Include hidden files/folders (default: false)"},
					"file_pattern":   {Type: "string", Description: "Only include files matching pattern"},
				}, []string{"path"}),

			MakeTool("get_project_context",
				`Get comprehensive project context including structure, dependencies, and configuration.
Essential for understanding a project before making changes.`,
				map[string]providers.Property{
					"path": {Type: "string", Description: "Project root directory"},
				}, []string{"path"}),

			MakeTool("get_dependencies",
				`Get project dependencies from package.json, requirements.txt, go.mod, etc.
Automatically detects the project type and reads appropriate files.`,
				map[string]providers.Property{
					"path": {Type: "string", Description: "Project root directory"},
				}, []string{"path"}),

			// === DESIGN TO CODE ===
			MakeTool("generate_code_from_design",
				`Generate code (Vue, React, or HTML/CSS) from a UI design.
Analyzes design elements and produces component code with proper structure and styling.

Supported frameworks: vue, react, html
Returns the generated code as a string.`,
				map[string]providers.Property{
					"design_name": {Type: "string", Description: "Name of the design/component"},
					"design_json": {Type: "string", Description: "JSON string of design nodes/elements"},
					"framework":   {Type: "string", Description: "Target framework: 'vue', 'react', or 'html'"},
					"style_type":  {Type: "string", Description: "Styling approach: 'tailwind', 'css', or 'styled'"},
				}, []string{"design_name", "design_json"}),

			MakeTool("scaffold_from_design",
				`Scaffold a complete feature from a UI design.
Creates multiple files: component, styles, types, and optionally tests.

Returns a list of files that were created.`,
				map[string]providers.Property{
					"design_name":   {Type: "string", Description: "Name of the design/feature"},
					"design_json":   {Type: "string", Description: "JSON string of design nodes/elements"},
					"output_dir":    {Type: "string", Description: "Directory to create files in"},
					"framework":     {Type: "string", Description: "Target framework: 'vue', 'react', or 'html'"},
					"include_tests": {Type: "boolean", Description: "Generate test files (default: false)"},
				}, []string{"design_name", "design_json", "output_dir"}),

			MakeTool("analyze_design_structure",
				`Analyze a design and return a structured breakdown of components and their hierarchy.
Useful for understanding the design before generating code.`,
				map[string]providers.Property{
					"design_json": {Type: "string", Description: "JSON string of design nodes/elements"},
				}, []string{"design_json"}),

			MakeTool("get_design_context",
				`Get a design from the database with all its nodes for code generation.
Fetches the design by name or ID and returns it in a format ready for code generation.`,
				map[string]providers.Property{
					"project_id":  {Type: "number", Description: "Project ID"},
					"design_name": {Type: "string", Description: "Name of the design to fetch"},
				}, []string{"project_id", "design_name"}),

			// === CODE ANALYSIS ===
			MakeTool("analyze_codebase",
				`Analyze codebase structure and patterns.
Provides insights about architecture, code patterns, and potential improvements.`,
				map[string]providers.Property{
					"path":         {Type: "string", Description: "Root directory to analyze"},
					"focus":        {Type: "string", Description: "Focus area: 'structure', 'patterns', 'dependencies', 'all'"},
					"file_pattern": {Type: "string", Description: "Only analyze files matching pattern"},
				}, []string{"path"}),

			MakeTool("find_references",
				`Find all references to a symbol (function, class, variable) in the codebase.
Useful for refactoring and understanding code impact.`,
				map[string]providers.Property{
					"path":   {Type: "string", Description: "Root directory to search"},
					"symbol": {Type: "string", Description: "Symbol name to find references for"},
					"type":   {Type: "string", Description: "Symbol type: 'function', 'class', 'variable', 'import', 'all'"},
				}, []string{"path", "symbol"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// File search
	DefaultRegistry.RegisterExecutor("file_search", executeFileSearch)

	// File editing
	DefaultRegistry.RegisterExecutor("fast_apply", executeFastApply)
	DefaultRegistry.RegisterExecutor("edit_file", executeEditFile)
	DefaultRegistry.RegisterExecutor("write_file", executeWriteFile)

	// File operations
	DefaultRegistry.RegisterExecutor("delete_file", executeDeleteFile)
	DefaultRegistry.RegisterExecutor("move_file", executeMoveFile)
	DefaultRegistry.RegisterExecutor("copy_file", executeCopyFile)
	DefaultRegistry.RegisterExecutor("create_directory", executeCreateDirectory)

	// Project context
	DefaultRegistry.RegisterExecutor("get_file_tree", executeGetFileTree)
	DefaultRegistry.RegisterExecutor("get_project_context", executeGetProjectContext)
	DefaultRegistry.RegisterExecutor("get_dependencies", executeGetDependencies)

	// Design to code
	DefaultRegistry.RegisterExecutor("generate_code_from_design", executeGenerateCodeFromDesign)
	DefaultRegistry.RegisterExecutor("scaffold_from_design", executeScaffoldFromDesign)
	DefaultRegistry.RegisterExecutor("analyze_design_structure", executeAnalyzeDesignStructure)
	DefaultRegistry.RegisterExecutor("get_design_context", executeGetDesignContext)

	// Code analysis
	DefaultRegistry.RegisterExecutor("analyze_codebase", executeAnalyzeCodebase)
	DefaultRegistry.RegisterExecutor("find_references", executeFindReferences)
}

// Pre-compiled regexes (avoid recompiling on every call)
var (
	wordTokenRegex   = regexp.MustCompile(`\w+`)
	nonAlphaNumRegex = regexp.MustCompile(`[^a-zA-Z0-9]+`)
)

// CodeDesignNode represents a UI element for code generation
type CodeDesignNode struct {
	ID           string                 `json:"id"`
	Type         string                 `json:"type"`
	Name         string                 `json:"name"`
	X            float64                `json:"x"`
	Y            float64                `json:"y"`
	Width        float64                `json:"width"`
	Height       float64                `json:"height"`
	Fill         interface{}            `json:"fill"`
	Stroke       string                 `json:"stroke,omitempty"`
	StrokeWidth  float64                `json:"strokeWidth,omitempty"`
	Text         string                 `json:"text,omitempty"`
	FontSize     float64                `json:"fontSize,omitempty"`
	FontWeight   string                 `json:"fontWeight,omitempty"`
	TextAlign    string                 `json:"textAlign,omitempty"`
	CornerRadius interface{}            `json:"cornerRadius,omitempty"`
	Opacity      float64                `json:"opacity,omitempty"`
	ParentID     string                 `json:"parentId,omitempty"`
	Children     []CodeDesignNode       `json:"children,omitempty"`
	Props        map[string]interface{} `json:"props,omitempty"`
}

func executeGenerateCodeFromDesign(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	designName := args["design_name"].(string)
	designJSON := args["design_json"].(string)
	framework, _ := args["framework"].(string)
	styleType, _ := args["style_type"].(string)

	if framework == "" {
		framework = "vue"
	}
	if styleType == "" {
		styleType = "tailwind"
	}

	// Parse design nodes
	var nodes []CodeDesignNode
	if err := json.Unmarshal([]byte(designJSON), &nodes); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error parsing design JSON: %v", err), IsError: true}
	}

	// Generate code based on framework
	var code string
	switch framework {
	case "vue":
		code = generateVueComponent(designName, nodes, styleType)
	case "react":
		code = generateReactComponent(designName, nodes, styleType)
	case "html":
		code = generateHTMLComponent(designName, nodes, styleType)
	default:
		return ToolResult{Content: fmt.Sprintf("Unsupported framework: %s", framework), IsError: true}
	}

	result := map[string]interface{}{
		"success":     true,
		"design_name": designName,
		"framework":   framework,
		"style_type":  styleType,
		"code":        code,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func generateVueComponent(name string, nodes []CodeDesignNode, styleType string) string {
	componentName := toPascalCase(name)

	// Find screen/root element
	var screen *CodeDesignNode
	var elements []CodeDesignNode

	for i := range nodes {
		if nodes[i].Type == "screen" {
			screen = &nodes[i]
		} else {
			elements = append(elements, nodes[i])
		}
	}

	// Build template
	var template strings.Builder
	template.WriteString("<template>\n")

	// Container div
	containerClass := "relative"
	if screen != nil {
		if styleType == "tailwind" {
			containerClass = fmt.Sprintf("relative w-full max-w-[%dpx] min-h-[%dpx]", int(screen.Width), int(screen.Height))
		}
	}
	template.WriteString(fmt.Sprintf("  <div class=\"%s\"", containerClass))

	// Add background
	if screen != nil {
		bgStyle := extractBackgroundStyle(screen.Fill, styleType)
		if bgStyle != "" {
			template.WriteString(fmt.Sprintf(" style=\"%s\"", bgStyle))
		}
	}
	template.WriteString(">\n")

	// Generate elements
	for _, elem := range elements {
		template.WriteString(generateVueElement(elem, styleType, 4))
	}

	template.WriteString("  </div>\n")
	template.WriteString("</template>\n\n")

	// Script section
	template.WriteString("<script setup lang=\"ts\">\n")
	template.WriteString(fmt.Sprintf("/**\n * %s Component\n * Generated from UI Design\n */\n", componentName))
	template.WriteString("</script>\n")

	return template.String()
}

func generateVueElement(node CodeDesignNode, styleType string, indent int) string {
	spaces := strings.Repeat(" ", indent)
	var sb strings.Builder

	switch node.Type {
	case "text":
		tag := "p"
		if node.FontSize > 40 {
			tag = "h1"
		} else if node.FontSize > 30 {
			tag = "h2"
		} else if node.FontSize > 24 {
			tag = "h3"
		}

		classes := generateTextClasses(node, styleType)
		styles := generatePositionStyle(node)

		sb.WriteString(fmt.Sprintf("%s<%s class=\"%s\"", spaces, tag, classes))
		if styles != "" {
			sb.WriteString(fmt.Sprintf(" style=\"%s\"", styles))
		}
		sb.WriteString(fmt.Sprintf(">%s</%s>\n", escapeHTML(node.Text), tag))

	case "rectangle":
		classes := generateRectClasses(node, styleType)
		styles := generatePositionStyle(node)
		bgStyle := extractBackgroundStyle(node.Fill, styleType)
		if bgStyle != "" {
			styles = styles + "; " + bgStyle
		}

		// Check if it looks like a button
		if node.CornerRadius != nil && node.Width < 400 && node.Height < 100 {
			sb.WriteString(fmt.Sprintf("%s<button class=\"%s\" style=\"%s\">\n", spaces, classes, styles))
			sb.WriteString(fmt.Sprintf("%s  Button\n", spaces))
			sb.WriteString(fmt.Sprintf("%s</button>\n", spaces))
		} else {
			sb.WriteString(fmt.Sprintf("%s<div class=\"%s\" style=\"%s\"></div>\n", spaces, classes, styles))
		}

	case "ellipse":
		classes := "rounded-full"
		styles := generatePositionStyle(node)
		bgStyle := extractBackgroundStyle(node.Fill, styleType)
		if bgStyle != "" {
			styles = styles + "; " + bgStyle
		}
		sb.WriteString(fmt.Sprintf("%s<div class=\"%s\" style=\"%s\"></div>\n", spaces, classes, styles))

	default:
		sb.WriteString(fmt.Sprintf("%s<!-- Unknown element type: %s -->\n", spaces, node.Type))
	}

	return sb.String()
}

func generateReactComponent(name string, nodes []CodeDesignNode, styleType string) string {
	componentName := toPascalCase(name)

	var screen *CodeDesignNode
	var elements []CodeDesignNode

	for i := range nodes {
		if nodes[i].Type == "screen" {
			screen = &nodes[i]
		} else {
			elements = append(elements, nodes[i])
		}
	}

	var sb strings.Builder

	// Imports
	sb.WriteString("import React from 'react'\n\n")

	// Component
	sb.WriteString(fmt.Sprintf("export const %s: React.FC = () => {\n", componentName))
	sb.WriteString("  return (\n")

	// Container
	containerClass := "relative"
	if screen != nil && styleType == "tailwind" {
		containerClass = fmt.Sprintf("relative w-full max-w-[%dpx] min-h-[%dpx]", int(screen.Width), int(screen.Height))
	}

	sb.WriteString(fmt.Sprintf("    <div className=\"%s\"", containerClass))
	if screen != nil {
		bgStyle := extractBackgroundStyle(screen.Fill, styleType)
		if bgStyle != "" {
			sb.WriteString(fmt.Sprintf(" style={{%s}}", cssToReactStyle(bgStyle)))
		}
	}
	sb.WriteString(">\n")

	// Elements
	for _, elem := range elements {
		sb.WriteString(generateReactElement(elem, styleType, 6))
	}

	sb.WriteString("    </div>\n")
	sb.WriteString("  )\n")
	sb.WriteString("}\n\n")
	sb.WriteString(fmt.Sprintf("export default %s\n", componentName))

	return sb.String()
}

func generateReactElement(node CodeDesignNode, styleType string, indent int) string {
	spaces := strings.Repeat(" ", indent)
	var sb strings.Builder

	switch node.Type {
	case "text":
		tag := "p"
		if node.FontSize > 40 {
			tag = "h1"
		} else if node.FontSize > 30 {
			tag = "h2"
		}

		classes := generateTextClasses(node, styleType)
		styles := generatePositionStyle(node)

		sb.WriteString(fmt.Sprintf("%s<%s className=\"%s\" style={{%s}}>%s</%s>\n",
			spaces, tag, classes, cssToReactStyle(styles), escapeHTML(node.Text), tag))

	case "rectangle":
		classes := generateRectClasses(node, styleType)
		styles := generatePositionStyle(node)
		bgStyle := extractBackgroundStyle(node.Fill, styleType)
		if bgStyle != "" {
			styles = styles + "; " + bgStyle
		}

		if node.CornerRadius != nil && node.Width < 400 && node.Height < 100 {
			sb.WriteString(fmt.Sprintf("%s<button className=\"%s\" style={{%s}}>\n", spaces, classes, cssToReactStyle(styles)))
			sb.WriteString(fmt.Sprintf("%s  Button\n", spaces))
			sb.WriteString(fmt.Sprintf("%s</button>\n", spaces))
		} else {
			sb.WriteString(fmt.Sprintf("%s<div className=\"%s\" style={{%s}} />\n", spaces, classes, cssToReactStyle(styles)))
		}

	default:
		sb.WriteString(fmt.Sprintf("%s{/* Unknown element: %s */}\n", spaces, node.Type))
	}

	return sb.String()
}

func generateHTMLComponent(name string, nodes []CodeDesignNode, styleType string) string {
	var screen *CodeDesignNode
	var elements []CodeDesignNode

	for i := range nodes {
		if nodes[i].Type == "screen" {
			screen = &nodes[i]
		} else {
			elements = append(elements, nodes[i])
		}
	}

	var sb strings.Builder

	sb.WriteString("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n")
	sb.WriteString("  <meta charset=\"UTF-8\">\n")
	sb.WriteString("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n")
	sb.WriteString(fmt.Sprintf("  <title>%s</title>\n", name))

	if styleType == "tailwind" {
		sb.WriteString("  <script src=\"https://cdn.tailwindcss.com\"></script>\n")
	}

	sb.WriteString("</head>\n<body>\n")

	// Container
	containerStyle := ""
	if screen != nil {
		containerStyle = fmt.Sprintf("width: %dpx; min-height: %dpx; position: relative;", int(screen.Width), int(screen.Height))
		bgStyle := extractBackgroundStyle(screen.Fill, styleType)
		if bgStyle != "" {
			containerStyle += " " + bgStyle
		}
	}

	sb.WriteString(fmt.Sprintf("  <div class=\"container\" style=\"%s\">\n", containerStyle))

	// Elements
	for _, elem := range elements {
		sb.WriteString(generateHTMLElement(elem, styleType, 4))
	}

	sb.WriteString("  </div>\n")
	sb.WriteString("</body>\n</html>\n")

	return sb.String()
}

func generateHTMLElement(node CodeDesignNode, styleType string, indent int) string {
	spaces := strings.Repeat(" ", indent)
	var sb strings.Builder

	styles := generatePositionStyle(node)
	bgStyle := extractBackgroundStyle(node.Fill, styleType)
	if bgStyle != "" {
		styles = styles + "; " + bgStyle
	}

	switch node.Type {
	case "text":
		tag := "p"
		if node.FontSize > 40 {
			tag = "h1"
		} else if node.FontSize > 30 {
			tag = "h2"
		}

		textStyles := styles
		if node.FontSize > 0 {
			textStyles += fmt.Sprintf("; font-size: %dpx", int(node.FontSize))
		}
		if node.FontWeight != "" {
			textStyles += fmt.Sprintf("; font-weight: %s", node.FontWeight)
		}

		sb.WriteString(fmt.Sprintf("%s<%s style=\"%s\">%s</%s>\n", spaces, tag, textStyles, escapeHTML(node.Text), tag))

	case "rectangle":
		cornerRadius := extractCornerRadius(node.CornerRadius)
		if cornerRadius > 0 {
			styles += fmt.Sprintf("; border-radius: %dpx", int(cornerRadius))
		}

		sb.WriteString(fmt.Sprintf("%s<div style=\"%s\"></div>\n", spaces, styles))

	case "ellipse":
		styles += "; border-radius: 50%"
		sb.WriteString(fmt.Sprintf("%s<div style=\"%s\"></div>\n", spaces, styles))
	}

	return sb.String()
}

func executeWriteComponentFile(args map[string]any, _ *ExecutionContext) ToolResult {
	filePath := args["file_path"].(string)
	content := args["content"].(string)
	createDirs := true
	if val, ok := args["create_dirs"].(bool); ok {
		createDirs = val
	}

	// Create parent directories if needed
	if createDirs {
		dir := filepath.Dir(filePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return ToolResult{Content: fmt.Sprintf("Error creating directories: %v", err), IsError: true}
		}
	}

	// Write file
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error writing file: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":   true,
		"file_path": filePath,
		"size":      len(content),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeScaffoldFromDesign(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	designName := args["design_name"].(string)
	designJSON := args["design_json"].(string)
	outputDir := args["output_dir"].(string)
	framework, _ := args["framework"].(string)
	includeTests, _ := args["include_tests"].(bool)

	if framework == "" {
		framework = "vue"
	}

	// Parse design nodes
	var nodes []CodeDesignNode
	if err := json.Unmarshal([]byte(designJSON), &nodes); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error parsing design JSON: %v", err), IsError: true}
	}

	componentName := toPascalCase(designName)
	createdFiles := []string{}

	// Create output directory
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating output directory: %v", err), IsError: true}
	}

	// Generate and write main component
	var componentFile string
	var componentCode string

	switch framework {
	case "vue":
		componentFile = filepath.Join(outputDir, componentName+".vue")
		componentCode = generateVueComponent(designName, nodes, "tailwind")
	case "react":
		componentFile = filepath.Join(outputDir, componentName+".tsx")
		componentCode = generateReactComponent(designName, nodes, "tailwind")
	case "html":
		componentFile = filepath.Join(outputDir, strings.ToLower(designName)+".html")
		componentCode = generateHTMLComponent(designName, nodes, "tailwind")
	}

	if err := os.WriteFile(componentFile, []byte(componentCode), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error writing component: %v", err), IsError: true}
	}
	createdFiles = append(createdFiles, componentFile)

	// Generate types file (for Vue/React)
	if framework == "vue" || framework == "react" {
		typesFile := filepath.Join(outputDir, "types.ts")
		typesCode := generateTypesFile(designName, nodes)
		if err := os.WriteFile(typesFile, []byte(typesCode), 0644); err == nil {
			createdFiles = append(createdFiles, typesFile)
		}
	}

	// Generate test file if requested
	if includeTests {
		var testFile string
		var testCode string

		switch framework {
		case "vue":
			testFile = filepath.Join(outputDir, componentName+".spec.ts")
			testCode = generateVueTestFile(componentName)
		case "react":
			testFile = filepath.Join(outputDir, componentName+".test.tsx")
			testCode = generateReactTestFile(componentName)
		}

		if testFile != "" {
			if err := os.WriteFile(testFile, []byte(testCode), 0644); err == nil {
				createdFiles = append(createdFiles, testFile)
			}
		}
	}

	// Generate index file
	indexFile := filepath.Join(outputDir, "index.ts")
	indexCode := fmt.Sprintf("export { default as %s } from './%s'\nexport * from './types'\n", componentName, componentName)
	if err := os.WriteFile(indexFile, []byte(indexCode), 0644); err == nil {
		createdFiles = append(createdFiles, indexFile)
	}

	result := map[string]interface{}{
		"success":       true,
		"design_name":   designName,
		"output_dir":    outputDir,
		"framework":     framework,
		"files_created": createdFiles,
		"file_count":    len(createdFiles),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeAnalyzeDesignStructure(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	designJSON := args["design_json"].(string)

	var nodes []CodeDesignNode
	if err := json.Unmarshal([]byte(designJSON), &nodes); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error parsing design JSON: %v", err), IsError: true}
	}

	analysis := analyzeNodes(nodes)

	jsonResult, _ := json.MarshalIndent(analysis, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func analyzeNodes(nodes []CodeDesignNode) map[string]interface{} {
	analysis := map[string]interface{}{
		"total_elements":      len(nodes),
		"by_type":             map[string]int{},
		"screens":             []map[string]interface{}{},
		"components":          []map[string]interface{}{},
		"suggested_structure": []string{},
	}

	byType := analysis["by_type"].(map[string]int)
	screens := []map[string]interface{}{}
	components := []map[string]interface{}{}

	for _, node := range nodes {
		byType[node.Type]++

		if node.Type == "screen" {
			screens = append(screens, map[string]interface{}{
				"name":   node.Name,
				"width":  node.Width,
				"height": node.Height,
			})
		} else if node.Type == "rectangle" && node.CornerRadius != nil && node.Width < 400 {
			components = append(components, map[string]interface{}{
				"type":   "button",
				"name":   node.Name,
				"width":  node.Width,
				"height": node.Height,
			})
		} else if node.Type == "text" && node.FontSize > 30 {
			components = append(components, map[string]interface{}{
				"type":     "heading",
				"name":     node.Name,
				"text":     truncateString(node.Text, 50),
				"fontSize": node.FontSize,
			})
		}
	}

	analysis["screens"] = screens
	analysis["components"] = components

	// Suggest structure
	suggestions := []string{}
	if len(screens) > 0 {
		suggestions = append(suggestions, "Create a page/view component for the screen container")
	}
	if byType["text"] > 0 {
		suggestions = append(suggestions, fmt.Sprintf("Add %d text elements with proper semantic tags", byType["text"]))
	}
	if len(components) > 0 {
		suggestions = append(suggestions, fmt.Sprintf("Extract %d interactive components", len(components)))
	}
	analysis["suggested_structure"] = suggestions

	return analysis
}

// Helper functions

func toPascalCase(s string) string {
	words := nonAlphaNumRegex.Split(s, -1)
	var result strings.Builder
	for _, word := range words {
		if word != "" {
			result.WriteString(strings.ToUpper(word[:1]) + strings.ToLower(word[1:]))
		}
	}
	return result.String()
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func generateTextClasses(node CodeDesignNode, styleType string) string {
	if styleType != "tailwind" {
		return ""
	}

	classes := []string{"absolute"}

	if node.FontSize > 40 {
		classes = append(classes, "text-6xl")
	} else if node.FontSize > 30 {
		classes = append(classes, "text-4xl")
	} else if node.FontSize > 20 {
		classes = append(classes, "text-2xl")
	}

	if node.FontWeight == "bold" || node.FontWeight == "600" || node.FontWeight == "700" {
		classes = append(classes, "font-semibold")
	}

	return strings.Join(classes, " ")
}

func generateRectClasses(node CodeDesignNode, styleType string) string {
	if styleType != "tailwind" {
		return ""
	}

	classes := []string{"absolute"}

	cornerRadius := extractCornerRadius(node.CornerRadius)
	if cornerRadius > 0 {
		if cornerRadius > 20 {
			classes = append(classes, "rounded-2xl")
		} else if cornerRadius > 10 {
			classes = append(classes, "rounded-xl")
		} else {
			classes = append(classes, "rounded-lg")
		}
	}

	return strings.Join(classes, " ")
}

func generatePositionStyle(node CodeDesignNode) string {
	return fmt.Sprintf("left: %dpx; top: %dpx; width: %dpx; height: %dpx",
		int(node.X), int(node.Y), int(node.Width), int(node.Height))
}

func extractBackgroundStyle(fill interface{}, _ string) string {
	if fill == nil {
		return ""
	}

	switch v := fill.(type) {
	case string:
		return fmt.Sprintf("background-color: %s", v)
	case map[string]interface{}:
		if t, ok := v["type"].(string); ok {
			if t == "linear" || t == "radial" {
				// Handle gradient
				stops, _ := v["stops"].([]interface{})
				if len(stops) >= 2 {
					colors := []string{}
					for _, stop := range stops {
						if s, ok := stop.(map[string]interface{}); ok {
							color, _ := s["color"].(string)
							colors = append(colors, color)
						}
					}
					if t == "linear" {
						angle, _ := v["angle"].(float64)
						return fmt.Sprintf("background: linear-gradient(%ddeg, %s)", int(angle), strings.Join(colors, ", "))
					} else {
						return fmt.Sprintf("background: radial-gradient(circle, %s)", strings.Join(colors, ", "))
					}
				}
			}
		}
	}

	return ""
}

func extractCornerRadius(cr interface{}) float64 {
	switch v := cr.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case []interface{}:
		if len(v) > 0 {
			if f, ok := v[0].(float64); ok {
				return f
			}
		}
	}
	return 0
}

func cssToReactStyle(css string) string {
	// Convert CSS string to React style object format
	parts := strings.Split(css, ";")
	var result []string

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		kv := strings.SplitN(part, ":", 2)
		if len(kv) != 2 {
			continue
		}

		key := strings.TrimSpace(kv[0])
		value := strings.TrimSpace(kv[1])

		// Convert kebab-case to camelCase
		key = toCamelCase(key)

		// Wrap string values in quotes
		if !strings.HasPrefix(value, "'") && !strings.HasPrefix(value, "\"") {
			value = fmt.Sprintf("'%s'", value)
		}

		result = append(result, fmt.Sprintf("%s: %s", key, value))
	}

	return strings.Join(result, ", ")
}

func toCamelCase(s string) string {
	parts := strings.Split(s, "-")
	for i := 1; i < len(parts); i++ {
		if len(parts[i]) > 0 {
			parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
		}
	}
	return strings.Join(parts, "")
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func generateTypesFile(name string, _ []CodeDesignNode) string {
	componentName := toPascalCase(name)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("/**\n * Types for %s component\n */\n\n", componentName))
	sb.WriteString(fmt.Sprintf("export interface %sProps {\n", componentName))
	sb.WriteString("  className?: string\n")
	sb.WriteString("  style?: React.CSSProperties\n")
	sb.WriteString("}\n")

	return sb.String()
}

func generateVueTestFile(componentName string) string {
	return fmt.Sprintf(`import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import %s from './%s.vue'

describe('%s', () => {
  it('renders correctly', () => {
    const wrapper = mount(%s)
    expect(wrapper.exists()).toBe(true)
  })
})
`, componentName, componentName, componentName, componentName)
}

func generateReactTestFile(componentName string) string {
	return fmt.Sprintf(`import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { %s } from './%s'

describe('%s', () => {
  it('renders correctly', () => {
    render(<%s />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
`, componentName, componentName, componentName, componentName)
}

// ============================================================================
// FILE SEARCH & READ EXECUTORS
// ============================================================================

type SearchMatch struct {
	File    string   `json:"file"`
	Line    int      `json:"line"`
	Content string   `json:"content"`
	Context []string `json:"context,omitempty"`
}

func executeFileSearch(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	searchPath := args["path"].(string)
	pattern := args["pattern"].(string)
	filePattern, _ := args["file_pattern"].(string)
	contextLines := 0
	if val, ok := args["context_lines"].(float64); ok {
		contextLines = int(val)
	}
	maxResults := 50
	if val, ok := args["max_results"].(float64); ok {
		maxResults = int(val)
	}
	caseSensitive := true
	if val, ok := args["case_sensitive"].(bool); ok {
		caseSensitive = val
	}

	// Compile regex
	flags := ""
	if !caseSensitive {
		flags = "(?i)"
	}
	re, err := regexp.Compile(flags + pattern)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Invalid regex pattern: %v", err), IsError: true}
	}

	matches := []SearchMatch{}
	resultCount := 0

	// Walk directory
	err = filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		// Skip common non-code directories
		if strings.Contains(path, "node_modules") || strings.Contains(path, ".git") ||
			strings.Contains(path, "__pycache__") || strings.Contains(path, "vendor") {
			return nil
		}

		// Apply file pattern filter
		if filePattern != "" {
			matched, _ := filepath.Match(filePattern, info.Name())
			if !matched {
				return nil
			}
		}

		// Check if it's likely a text file
		if !isTextFile(info.Name()) {
			return nil
		}

		// Search file
		fileMatches, err := searchInFile(path, re, contextLines)
		if err != nil {
			return nil
		}

		for _, m := range fileMatches {
			if resultCount >= maxResults {
				return filepath.SkipAll
			}
			matches = append(matches, m)
			resultCount++
		}

		return nil
	})

	if err != nil && err != filepath.SkipAll {
		return ToolResult{Content: fmt.Sprintf("Error searching: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":     true,
		"pattern":     pattern,
		"path":        searchPath,
		"match_count": len(matches),
		"matches":     matches,
		"truncated":   resultCount >= maxResults,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func searchInFile(path string, re *regexp.Regexp, contextLines int) ([]SearchMatch, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var matches []SearchMatch
	var lines []string
	scanner := bufio.NewScanner(file)

	// Read all lines
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	// Find matches
	for i, line := range lines {
		if re.MatchString(line) {
			match := SearchMatch{
				File:    path,
				Line:    i + 1,
				Content: line,
			}

			// Add context
			if contextLines > 0 {
				start := i - contextLines
				if start < 0 {
					start = 0
				}
				end := i + contextLines + 1
				if end > len(lines) {
					end = len(lines)
				}
				match.Context = lines[start:end]
			}

			matches = append(matches, match)
		}
	}

	return matches, nil
}

func isTextFile(name string) bool {
	textExtensions := map[string]bool{
		".go": true, ".js": true, ".ts": true, ".tsx": true, ".jsx": true,
		".vue": true, ".svelte": true, ".html": true, ".css": true, ".scss": true,
		".json": true, ".yaml": true, ".yml": true, ".toml": true, ".xml": true,
		".md": true, ".txt": true, ".py": true, ".rb": true, ".rs": true,
		".java": true, ".kt": true, ".swift": true, ".c": true, ".cpp": true,
		".h": true, ".hpp": true, ".sh": true, ".bash": true, ".zsh": true,
		".sql": true, ".graphql": true, ".proto": true, ".env": true,
		".gitignore": true, ".dockerignore": true, ".eslintrc": true,
	}
	ext := strings.ToLower(filepath.Ext(name))
	return textExtensions[ext] || ext == ""
}

// ============================================================================
// FILE EDITING EXECUTORS
// ============================================================================

const existingCodeMarker = "// ... existing code ..."

func executeFastApply(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)
	changeStr := args["change_str"].(string)

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	// Read original file
	originalContent, err := os.ReadFile(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error reading file: %v", err), IsError: true}
	}

	originalLines := strings.Split(string(originalContent), "\n")

	// Parse change blocks
	blocks := parseChangeBlocks(changeStr)
	if len(blocks) == 0 {
		return ToolResult{Content: "No change blocks found in change_str", IsError: true}
	}

	// Apply each change block
	result := make([]string, len(originalLines))
	copy(result, originalLines)

	appliedChanges := 0
	for _, block := range blocks {
		if block.isMarker {
			continue
		}

		// Find best match location
		matchStart, matchEnd := findBestMatch(result, block.lines)
		if matchStart == -1 {
			continue
		}

		// Replace matched section
		newResult := make([]string, 0, len(result)-matchEnd+matchStart+len(block.lines))
		newResult = append(newResult, result[:matchStart]...)
		newResult = append(newResult, block.lines...)
		newResult = append(newResult, result[matchEnd:]...)
		result = newResult
		appliedChanges++
	}

	if appliedChanges == 0 {
		return ToolResult{Content: "Could not find matching locations for any change blocks", IsError: true}
	}

	// Write result
	newContent := strings.Join(result, "\n")
	if err := os.WriteFile(path, []byte(newContent), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error writing file: %v", err), IsError: true}
	}

	resultMap := map[string]interface{}{
		"success":         true,
		"path":            path,
		"changes_applied": appliedChanges,
	}

	jsonResult, _ := json.MarshalIndent(resultMap, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

type changeBlock struct {
	lines    []string
	isMarker bool
}

func parseChangeBlocks(changeStr string) []changeBlock {
	lines := strings.Split(changeStr, "\n")
	var blocks []changeBlock
	var currentBlock []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == existingCodeMarker || trimmed == "// ...existing code..." {
			if len(currentBlock) > 0 {
				blocks = append(blocks, changeBlock{lines: currentBlock, isMarker: false})
				currentBlock = nil
			}
			blocks = append(blocks, changeBlock{isMarker: true})
		} else {
			currentBlock = append(currentBlock, line)
		}
	}

	if len(currentBlock) > 0 {
		blocks = append(blocks, changeBlock{lines: currentBlock, isMarker: false})
	}

	return blocks
}

func findBestMatch(original []string, search []string) (int, int) {
	if len(search) == 0 {
		return -1, -1
	}

	bestScore := 0.0
	bestStart := -1
	bestEnd := -1

	// Sliding window
	for i := 0; i <= len(original)-len(search); i++ {
		window := original[i : i+len(search)]
		score := calculateSimilarity(window, search)

		if score > bestScore && score > 0.6 { // 60% threshold
			bestScore = score
			bestStart = i
			bestEnd = i + len(search)
		}
	}

	return bestStart, bestEnd
}

func calculateSimilarity(window, search []string) float64 {
	if len(window) != len(search) {
		return 0
	}

	matches := 0.0
	for i := range window {
		w := normalizeLineForMatch(window[i])
		s := normalizeLineForMatch(search[i])

		if w == s {
			matches += 1.0
		} else if fuzzyLineMatch(w, s) {
			matches += 0.8
		}
	}

	return matches / float64(len(search))
}

func normalizeLineForMatch(line string) string {
	return strings.TrimSpace(line)
}

func fuzzyLineMatch(line1, line2 string) bool {
	// Same structural elements
	if len(line1) == 0 || len(line2) == 0 {
		return false
	}

	// Check if they share significant tokens
	tokens1 := wordTokenRegex.FindAllString(line1, -1)
	tokens2 := wordTokenRegex.FindAllString(line2, -1)

	if len(tokens1) == 0 || len(tokens2) == 0 {
		return false
	}

	// Count matching tokens
	tokenSet := make(map[string]bool)
	for _, t := range tokens1 {
		tokenSet[t] = true
	}

	matches := 0
	for _, t := range tokens2 {
		if tokenSet[t] {
			matches++
		}
	}

	similarity := float64(matches) / float64(max(len(tokens1), len(tokens2)))
	return similarity > 0.5
}

// resolvePath resolves a file path relative to the project root.
// If the path is already absolute, it's returned as-is.
// If relative and project root is set, it's joined with the project root.
func resolvePath(path string, ctx *ExecutionContext) string {
	if filepath.IsAbs(path) {
		return path
	}
	if ctx != nil && ctx.Project != nil && ctx.Project.RootPath != "" {
		return filepath.Join(ctx.Project.RootPath, path)
	}
	return path
}

// validatePathWithinProject checks that a resolved path stays within the project root directory.
// Returns an error string if the path escapes the allowed directory, or empty string if valid.
// This prevents path traversal attacks (e.g., "../../etc/passwd").
func validatePathWithinProject(resolvedPath string, ctx *ExecutionContext) string {
	if ctx == nil || ctx.Project == nil || ctx.Project.RootPath == "" {
		// No project root configured — cannot validate, allow for backward compatibility
		return ""
	}

	// Clean and resolve both paths to absolute form
	absPath, err := filepath.Abs(filepath.Clean(resolvedPath))
	if err != nil {
		return fmt.Sprintf("Failed to resolve absolute path: %v", err)
	}

	absRoot, err := filepath.Abs(filepath.Clean(ctx.Project.RootPath))
	if err != nil {
		return fmt.Sprintf("Failed to resolve project root: %v", err)
	}

	// Ensure the resolved path is within the project root (using separator to avoid prefix false positives)
	if !strings.HasPrefix(absPath, absRoot+string(filepath.Separator)) && absPath != absRoot {
		return fmt.Sprintf("Path '%s' is outside the project directory '%s'", absPath, absRoot)
	}

	return ""
}

func executeEditFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)
	oldStr := args["old_str"].(string)
	newStr := args["new_str"].(string)
	replaceAll := false
	if val, ok := args["replace_all"].(bool); ok {
		replaceAll = val
	}

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error reading file: %v", err), IsError: true}
	}

	contentStr := string(content)

	// Check if old_str exists
	if !strings.Contains(contentStr, oldStr) {
		return ToolResult{Content: "old_str not found in file", IsError: true}
	}

	// Replace
	var newContent string
	var count int
	if replaceAll {
		count = strings.Count(contentStr, oldStr)
		newContent = strings.ReplaceAll(contentStr, oldStr, newStr)
	} else {
		count = 1
		newContent = strings.Replace(contentStr, oldStr, newStr, 1)
	}

	// Write
	if err := os.WriteFile(path, []byte(newContent), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error writing file: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success":      true,
		"path":         path,
		"replacements": count,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeWriteFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)
	content, _ := args["content"].(string)
	createDirs := true
	if val, ok := args["create_dirs"].(bool); ok {
		createDirs = val
	}

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	// Create directories if needed
	if createDirs {
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return ToolResult{Content: fmt.Sprintf("Error creating directories: %v", err), IsError: true}
		}
	}

	// Write file
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error writing file: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"path":    path,
		"size":    len(content),
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// FILE OPERATIONS EXECUTORS
// ============================================================================

func executeDeleteFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)
	recursive := false
	if val, ok := args["recursive"].(bool); ok {
		recursive = val
	}

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	info, err := os.Stat(path)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Path not found: %v", err), IsError: true}
	}

	if info.IsDir() && !recursive {
		return ToolResult{Content: "Cannot delete directory without recursive=true", IsError: true}
	}

	if recursive {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}

	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error deleting: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"path":    path,
		"deleted": true,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeMoveFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	source := resolvePath(args["source"].(string), ctx)
	dest := resolvePath(args["dest"].(string), ctx)

	// Validate both paths stay within project directory
	if errMsg := validatePathWithinProject(source, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}
	if errMsg := validatePathWithinProject(dest, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	if err := os.Rename(source, dest); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error moving: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"source":  source,
		"dest":    dest,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func executeCopyFile(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	source := resolvePath(args["source"].(string), ctx)
	dest := resolvePath(args["dest"].(string), ctx)
	recursive := true
	if val, ok := args["recursive"].(bool); ok {
		recursive = val
	}

	// Validate both paths stay within project directory
	if errMsg := validatePathWithinProject(source, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}
	if errMsg := validatePathWithinProject(dest, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	info, err := os.Stat(source)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Source not found: %v", err), IsError: true}
	}

	if info.IsDir() {
		if recursive {
			err = copyDir(source, dest)
		} else {
			return ToolResult{Content: "Cannot copy directory without recursive=true", IsError: true}
		}
	} else {
		err = copyFileContent(source, dest)
	}

	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error copying: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"source":  source,
		"dest":    dest,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func copyFileContent(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		destPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}

		return copyFileContent(path, destPath)
	})
}

func executeCreateDirectory(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	path := resolvePath(args["path"].(string), ctx)

	// Validate path stays within project directory
	if errMsg := validatePathWithinProject(path, ctx); errMsg != "" {
		return ToolResult{Content: errMsg, IsError: true}
	}

	if err := os.MkdirAll(path, 0755); err != nil {
		return ToolResult{Content: fmt.Sprintf("Error creating directory: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"path":    path,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

// ============================================================================
// PROJECT CONTEXT EXECUTORS
// ============================================================================

type FileTreeEntry struct {
	Name     string          `json:"name"`
	Path     string          `json:"path"`
	Type     string          `json:"type"` // "file" or "directory"
	Size     int64           `json:"size,omitempty"`
	Children []FileTreeEntry `json:"children,omitempty"`
}

func executeGetFileTree(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	rootPath := resolvePath(args["path"].(string), ctx)
	maxDepth := 5
	if val, ok := args["max_depth"].(float64); ok {
		maxDepth = int(val)
	}
	includeHidden := false
	if val, ok := args["include_hidden"].(bool); ok {
		includeHidden = val
	}
	filePattern, _ := args["file_pattern"].(string)

	tree, err := buildFileTree(rootPath, 0, maxDepth, includeHidden, filePattern)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error building file tree: %v", err), IsError: true}
	}

	result := map[string]interface{}{
		"success": true,
		"root":    rootPath,
		"tree":    tree,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func buildFileTree(path string, depth, maxDepth int, includeHidden bool, filePattern string) ([]FileTreeEntry, error) {
	if depth >= maxDepth {
		return nil, nil
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	var tree []FileTreeEntry

	// Skip common non-essential directories
	skipDirs := map[string]bool{
		"node_modules": true, ".git": true, "__pycache__": true,
		"vendor": true, "dist": true, "build": true, ".next": true,
		".nuxt": true, "coverage": true, ".cache": true,
	}

	for _, entry := range entries {
		name := entry.Name()

		// Skip hidden files unless requested
		if !includeHidden && strings.HasPrefix(name, ".") {
			continue
		}

		// Skip non-essential directories
		if entry.IsDir() && skipDirs[name] {
			continue
		}

		fullPath := filepath.Join(path, name)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		treeEntry := FileTreeEntry{
			Name: name,
			Path: fullPath,
		}

		if entry.IsDir() {
			treeEntry.Type = "directory"
			children, err := buildFileTree(fullPath, depth+1, maxDepth, includeHidden, filePattern)
			if err == nil {
				treeEntry.Children = children
			}
		} else {
			treeEntry.Type = "file"
			treeEntry.Size = info.Size()

			// Apply file pattern filter
			if filePattern != "" {
				matched, _ := filepath.Match(filePattern, name)
				if !matched {
					continue
				}
			}
		}

		tree = append(tree, treeEntry)
	}

	// Sort: directories first, then alphabetically
	sort.Slice(tree, func(i, j int) bool {
		if tree[i].Type != tree[j].Type {
			return tree[i].Type == "directory"
		}
		return tree[i].Name < tree[j].Name
	})

	return tree, nil
}

func executeGetProjectContext(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	rootPath := resolvePath(args["path"].(string), ctx)

	context := map[string]interface{}{
		"root":         rootPath,
		"project_type": detectProjectType(rootPath),
		"structure":    map[string]interface{}{},
		"config_files": []string{},
		"dependencies": map[string]interface{}{},
	}

	// Get directory structure (shallow)
	tree, err := buildFileTree(rootPath, 0, 2, false, "")
	if err == nil {
		context["structure"] = tree
	}

	// Find config files
	configFiles := []string{}
	configPatterns := []string{
		"package.json", "tsconfig.json", "vite.config.*", "nuxt.config.*",
		"tailwind.config.*", "go.mod", "Cargo.toml", "requirements.txt",
		"pyproject.toml", "composer.json", ".env.example", "docker-compose.*",
	}

	for _, pattern := range configPatterns {
		matches, _ := filepath.Glob(filepath.Join(rootPath, pattern))
		for _, m := range matches {
			rel, _ := filepath.Rel(rootPath, m)
			configFiles = append(configFiles, rel)
		}
	}
	context["config_files"] = configFiles

	// Get dependencies
	deps := getDependencies(rootPath)
	context["dependencies"] = deps

	result := map[string]interface{}{
		"success": true,
		"context": context,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func detectProjectType(path string) string {
	// Check for various project indicators
	checks := map[string]string{
		"package.json":     "node",
		"go.mod":           "go",
		"Cargo.toml":       "rust",
		"requirements.txt": "python",
		"pyproject.toml":   "python",
		"composer.json":    "php",
		"Gemfile":          "ruby",
		"pubspec.yaml":     "flutter",
	}

	for file, projectType := range checks {
		if _, err := os.Stat(filepath.Join(path, file)); err == nil {
			return projectType
		}
	}

	return "unknown"
}

func executeGetDependencies(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	rootPath := args["path"].(string)

	deps := getDependencies(rootPath)

	result := map[string]interface{}{
		"success":      true,
		"path":         rootPath,
		"dependencies": deps,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func getDependencies(rootPath string) map[string]interface{} {
	deps := map[string]interface{}{}

	// Node.js
	pkgPath := filepath.Join(rootPath, "package.json")
	if content, err := os.ReadFile(pkgPath); err == nil {
		var pkg map[string]interface{}
		if json.Unmarshal(content, &pkg) == nil {
			nodeDeps := map[string]interface{}{}
			if d, ok := pkg["dependencies"].(map[string]interface{}); ok {
				nodeDeps["dependencies"] = d
			}
			if d, ok := pkg["devDependencies"].(map[string]interface{}); ok {
				nodeDeps["devDependencies"] = d
			}
			deps["node"] = nodeDeps
		}
	}

	// Go
	goModPath := filepath.Join(rootPath, "go.mod")
	if content, err := os.ReadFile(goModPath); err == nil {
		deps["go"] = parseGoMod(string(content))
	}

	// Python
	reqPath := filepath.Join(rootPath, "requirements.txt")
	if content, err := os.ReadFile(reqPath); err == nil {
		deps["python"] = parseRequirements(string(content))
	}

	return deps
}

func parseGoMod(content string) map[string]interface{} {
	result := map[string]interface{}{}
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "module ") {
			result["module"] = strings.TrimPrefix(line, "module ")
		}
		if strings.HasPrefix(line, "go ") {
			result["go_version"] = strings.TrimPrefix(line, "go ")
		}
	}

	// Extract requires
	requires := []string{}
	inRequire := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "require (" {
			inRequire = true
			continue
		}
		if line == ")" {
			inRequire = false
			continue
		}
		if inRequire && line != "" {
			parts := strings.Fields(line)
			if len(parts) >= 1 {
				requires = append(requires, parts[0])
			}
		}
	}
	result["requires"] = requires

	return result
}

func parseRequirements(content string) []string {
	var reqs []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			reqs = append(reqs, line)
		}
	}
	return reqs
}

// ============================================================================
// DESIGN CONTEXT EXECUTOR
// ============================================================================

func executeGetDesignContext(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	projectID := int(args["project_id"].(float64))
	designName := args["design_name"].(string)

	// First try to get design from local storage (context.db)
	if ctx.Storage != nil {
		// Try exact name match first
		var pid *int
		if projectID > 0 {
			pid = &projectID
		}

		design, err := ctx.Storage.UIDesignGetByName(designName, pid)
		if err == nil && design != nil {
			// Parse nodes JSON
			var nodes interface{}
			if design.NodesJSON != "" {
				json.Unmarshal([]byte(design.NodesJSON), &nodes)
			}

			result := map[string]interface{}{
				"success":     true,
				"project_id":  projectID,
				"design_name": design.Name,
				"design_id":   design.LocalID,
				"nodes":       nodes,
				"source":      "context.db",
			}
			jsonResult, _ := json.MarshalIndent(result, "", "  ")
			return ToolResult{Content: string(jsonResult)}
		}

		// Try listing all designs and fuzzy match
		designs, err := ctx.Storage.UIDesignList(pid)
		if err == nil && len(designs) > 0 {
			for _, d := range designs {
				if strings.EqualFold(d.Name, designName) || strings.Contains(strings.ToLower(d.Name), strings.ToLower(designName)) {
					var nodes interface{}
					if d.NodesJSON != "" {
						json.Unmarshal([]byte(d.NodesJSON), &nodes)
					}

					result := map[string]interface{}{
						"success":     true,
						"project_id":  projectID,
						"design_name": d.Name,
						"design_id":   d.LocalID,
						"nodes":       nodes,
						"source":      "context.db",
					}
					jsonResult, _ := json.MarshalIndent(result, "", "  ")
					return ToolResult{Content: string(jsonResult)}
				}
			}

			// Return list of available designs
			designNames := make([]string, len(designs))
			for i, d := range designs {
				designNames[i] = d.Name
			}

			result := map[string]interface{}{
				"success":           false,
				"project_id":        projectID,
				"design_name":       designName,
				"error":             fmt.Sprintf("Design '%s' not found in context.db", designName),
				"available_designs": designNames,
				"hint":              "Available designs: " + strings.Join(designNames, ", "),
			}
			jsonResult, _ := json.MarshalIndent(result, "", "  ")
			return ToolResult{Content: string(jsonResult), IsError: true}
		}
	}

	// Fallback: check local_data (from frontend)
	if ctx.LocalData != nil {
		if designs, ok := ctx.LocalData["designs"].([]interface{}); ok {
			for _, d := range designs {
				if design, ok := d.(map[string]interface{}); ok {
					name, _ := design["name"].(string)
					if strings.EqualFold(name, designName) || strings.Contains(strings.ToLower(name), strings.ToLower(designName)) {
						result := map[string]interface{}{
							"success":     true,
							"project_id":  projectID,
							"design_name": designName,
							"design":      design,
							"source":      "local_data",
						}
						jsonResult, _ := json.MarshalIndent(result, "", "  ")
						return ToolResult{Content: string(jsonResult)}
					}
				}
			}
		}

		// Check for canvas_data directly (current UI space canvas)
		if canvasData, ok := ctx.LocalData["canvas_data"].([]interface{}); ok && len(canvasData) > 0 {
			result := map[string]interface{}{
				"success":      true,
				"project_id":   projectID,
				"design_name":  designName,
				"design_nodes": canvasData,
				"source":       "local_canvas",
				"hint":         "Use design_nodes with generate_code_from_design tool",
			}
			jsonResult, _ := json.MarshalIndent(result, "", "  ")
			return ToolResult{Content: string(jsonResult)}
		}
	}

	// Design not found - return helpful error
	result := map[string]interface{}{
		"success":     false,
		"project_id":  projectID,
		"design_name": designName,
		"error":       fmt.Sprintf("Design '%s' not found. Create a design in the UI space first.", designName),
		"hint":        "Go to UI space and create/save a design, then reference it by name",
	}
	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult), IsError: true}
}

// ============================================================================
// CODE ANALYSIS EXECUTORS
// ============================================================================

func executeAnalyzeCodebase(args map[string]interface{}, _ *ExecutionContext) ToolResult {
	rootPath := args["path"].(string)
	focus, _ := args["focus"].(string)
	filePattern, _ := args["file_pattern"].(string)

	if focus == "" {
		focus = "all"
	}

	analysis := map[string]interface{}{
		"root":         rootPath,
		"project_type": detectProjectType(rootPath),
	}

	// Count files by extension
	fileStats := map[string]int{}
	totalFiles := 0
	totalLines := 0

	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		// Skip common non-code directories
		if strings.Contains(path, "node_modules") || strings.Contains(path, ".git") {
			return nil
		}

		// Apply file pattern
		if filePattern != "" {
			matched, _ := filepath.Match(filePattern, info.Name())
			if !matched {
				return nil
			}
		}

		ext := filepath.Ext(info.Name())
		if ext != "" {
			fileStats[ext]++
			totalFiles++

			// Count lines for code files
			if isTextFile(info.Name()) {
				if content, err := os.ReadFile(path); err == nil {
					lines := strings.Count(string(content), "\n")
					totalLines += lines
				}
			}
		}

		return nil
	})

	analysis["file_stats"] = fileStats
	analysis["total_files"] = totalFiles
	analysis["total_lines"] = totalLines

	// Detect patterns/frameworks
	if focus == "patterns" || focus == "all" {
		patterns := detectPatterns(rootPath)
		analysis["patterns"] = patterns
	}

	result := map[string]interface{}{
		"success":  true,
		"analysis": analysis,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}

func detectPatterns(rootPath string) map[string]interface{} {
	patterns := map[string]interface{}{}

	// Check for Vue
	if matches, _ := filepath.Glob(filepath.Join(rootPath, "**/*.vue")); len(matches) > 0 {
		patterns["vue"] = true
	}

	// Check for React
	if matches, _ := filepath.Glob(filepath.Join(rootPath, "**/*.tsx")); len(matches) > 0 {
		patterns["react"] = true
	}

	// Check for Tailwind
	if _, err := os.Stat(filepath.Join(rootPath, "tailwind.config.js")); err == nil {
		patterns["tailwind"] = true
	}
	if _, err := os.Stat(filepath.Join(rootPath, "tailwind.config.ts")); err == nil {
		patterns["tailwind"] = true
	}

	// Check for Nuxt
	if _, err := os.Stat(filepath.Join(rootPath, "nuxt.config.ts")); err == nil {
		patterns["nuxt"] = true
	}

	// Check for testing frameworks
	if _, err := os.Stat(filepath.Join(rootPath, "vitest.config.ts")); err == nil {
		patterns["vitest"] = true
	}
	if _, err := os.Stat(filepath.Join(rootPath, "jest.config.js")); err == nil {
		patterns["jest"] = true
	}

	return patterns
}

func executeFindReferences(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	rootPath := args["path"].(string)
	symbol := args["symbol"].(string)
	symbolType, _ := args["type"].(string)

	if symbolType == "" {
		symbolType = "all"
	}

	// Build search patterns based on type
	var patterns []string
	switch symbolType {
	case "function":
		patterns = []string{
			fmt.Sprintf(`\b%s\s*\(`, symbol),      // function call
			fmt.Sprintf(`function\s+%s`, symbol),  // function definition
			fmt.Sprintf(`const\s+%s\s*=`, symbol), // arrow function
		}
	case "class":
		patterns = []string{
			fmt.Sprintf(`class\s+%s`, symbol),   // class definition
			fmt.Sprintf(`new\s+%s`, symbol),     // instantiation
			fmt.Sprintf(`extends\s+%s`, symbol), // inheritance
		}
	case "import":
		patterns = []string{
			fmt.Sprintf(`import.*%s`, symbol), // import statement
			fmt.Sprintf(`from.*%s`, symbol),   // from clause
		}
	default:
		patterns = []string{fmt.Sprintf(`\b%s\b`, symbol)}
	}

	allMatches := []SearchMatch{}

	for _, pattern := range patterns {
		re, err := regexp.Compile(pattern)
		if err != nil {
			continue
		}

		filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			if strings.Contains(path, "node_modules") || strings.Contains(path, ".git") {
				return nil
			}

			if !isTextFile(info.Name()) {
				return nil
			}

			matches, _ := searchInFile(path, re, 1)
			allMatches = append(allMatches, matches...)

			return nil
		})
	}

	result := map[string]interface{}{
		"success":     true,
		"symbol":      symbol,
		"type":        symbolType,
		"match_count": len(allMatches),
		"references":  allMatches,
	}

	jsonResult, _ := json.MarshalIndent(result, "", "  ")
	return ToolResult{Content: string(jsonResult)}
}
