package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// sharedUIHTTPClient is a package-level shared HTTP client for UI tool HTTP requests.
var sharedUIHTTPClient = providers.NewHTTPClient(10 * time.Second)

// sharedUIShortClient is a package-level shared HTTP client for short-timeout requests (icon fetches, etc).
var sharedUIShortClient = providers.NewHTTPClient(5 * time.Second)

// Unsplash API configuration
// Set via environment variable or use default (for development only)
var unsplashAccessKey = getEnvOrDefault("UNSPLASH_ACCESS_KEY", "T8claltbRFlHkmcWOasi4CcZiBjYcDeppUSFWtNJTAg")

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// randomString generates a random alphanumeric string of given length
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// UITools - Tools for UI/Design space (canvas elements, screens, layouts)
func init() {
	category := &ToolCategory{
		Name:        "ui",
		Description: "UI Design tools for creating and managing canvas elements, screens, and layouts",
		Tools: []providers.Tool{
			MakeTool("create_design_element",
				"Create a UI design element on the canvas. Supported types: 'screen' (container/artboard), 'rectangle', 'ellipse', 'text', 'line', 'polygon', 'star', 'path', 'image'. Coordinates are relative to parent if parent_id is set, otherwise absolute canvas position. Colors use hex format (#ffffff). For gradients, use fill_gradient instead of fill.",
				map[string]providers.Property{
					"type":              {Type: "string", Description: "Element type: 'screen', 'rectangle', 'ellipse', 'text', 'line', 'polygon', 'star', 'path', 'image'"},
					"name":              {Type: "string", Description: "Element name for layers panel"},
					"x":                 {Type: "number", Description: "X position (default: 100)"},
					"y":                 {Type: "number", Description: "Y position (default: 100)"},
					"width":             {Type: "number", Description: "Width in pixels (default: 200)"},
					"height":            {Type: "number", Description: "Height in pixels (default: 150)"},
					"rotation":          {Type: "number", Description: "Rotation angle in degrees (0-360)"},
					"fill":              {Type: "string", Description: "Fill color hex (default: #e5e7eb for shapes, #ffffff for screens, #000000 for text)"},
					"fill_gradient":     {Type: "object", Description: "Gradient fill. Linear: {type:'linear', angle:90, stops:[{offset:0, color:'#fff'}, {offset:1, color:'#000'}]}. Radial: {type:'radial', centerX:0.5, centerY:0.5, radius:0.5, stops:[...]}. Stops have offset (0-1) and color (hex)."},
					"stroke":            {Type: "string", Description: "Border color hex"},
					"stroke_width":      {Type: "number", Description: "Border width (default: 0)"},
					"stroke_dash_array": {Type: "array", Description: "Dash pattern [dash, gap] for dashed/dotted lines"},
					"stroke_line_cap":   {Type: "string", Description: "Line cap: 'butt', 'round', 'square'"},
					"stroke_line_join":  {Type: "string", Description: "Line join: 'miter', 'round', 'bevel'"},
					"corner_radius":     {Type: "number", Description: "Corner radius for rounded corners"},
					"opacity":           {Type: "number", Description: "Opacity 0-1 (default: 1)"},
					"blend_mode":        {Type: "string", Description: "Blend mode: 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', etc."},
					"flip_x":            {Type: "boolean", Description: "Flip horizontally"},
					"flip_y":            {Type: "boolean", Description: "Flip vertically"},
					"sides":             {Type: "number", Description: "Number of sides for polygon (3-12, default: 6)"},
					"points":            {Type: "number", Description: "Number of points for star (3-12, default: 5)"},
					"inner_radius":      {Type: "number", Description: "Inner radius for star (0-100, default: 50)"},
					"shadow_color":      {Type: "string", Description: "Shadow color hex"},
					"shadow_blur":       {Type: "number", Description: "Shadow blur radius"},
					"shadow_offset_x":   {Type: "number", Description: "Shadow X offset"},
					"shadow_offset_y":   {Type: "number", Description: "Shadow Y offset"},
					"text":              {Type: "string", Description: "Text content (for type='text')"},
					"font_size":         {Type: "number", Description: "Font size in px (default: 16)"},
					"font_weight":       {Type: "string", Description: "'normal' or 'bold'"},
					"font_family":       {Type: "string", Description: "Font family name"},
					"text_align":        {Type: "string", Description: "'left', 'center', or 'right'"},
					"line_height":       {Type: "number", Description: "Line height multiplier"},
					"letter_spacing":    {Type: "number", Description: "Letter spacing in px"},
					"path_data":         {Type: "string", Description: "SVG path data for type='path' (e.g., 'M 0 0 C 50 0 50 100 100 100' for curves)"},
					"image_url":         {Type: "string", Description: "Image URL for type='image' (https:// or data:image/...)"},
					"object_fit":        {Type: "string", Description: "Image fit mode: 'cover' (fill, crop overflow — use for backgrounds), 'contain' (fit inside), 'fill' (stretch). Default: 'cover'"},
					"parent_id":         {Type: "string", Description: "Parent element ID for nesting inside screens"},
				}, []string{"type", "name"}),

			MakeTool("create_ui_screen",
				`Create a complete UI screen with child elements in one call. Pass an 'elements' array where each element has: type, name, x, y, width, height, and type-specific props (fill, text, fontSize, cornerRadius, etc). Child element positions are relative to the screen. Example element: {"type": "rectangle", "name": "Button", "x": 24, "y": 100, "width": 327, "height": 48, "fill": "#3b82f6", "cornerRadius": 8}. For gradients in elements, use fill as an object with type, angle/center, and stops.`,
				map[string]providers.Property{
					"screen_name": {Type: "string", Description: "Screen name (e.g., 'Login', 'Dashboard', 'Settings')"},
					"width":       {Type: "number", Description: "Screen width (375 mobile, 1440 desktop)"},
					"height":      {Type: "number", Description: "Screen height (812 mobile, 900 desktop)"},
					"x":           {Type: "number", Description: "Canvas X position (default: 100)"},
					"y":           {Type: "number", Description: "Canvas Y position (default: 100)"},
					"design_name": {Type: "string", Description: "Optional design name for overlap/placement scoping"},
					"page_name":   {Type: "string", Description: "Target page name to place the screen on (e.g., 'Landing', 'Dashboard'). If omitted, the screen is added to the current/active page."},
					"elements":    {Type: "array", Description: "Array of child elements with type, name, x, y, width, height, fill (string or gradient object), text, fontSize, fontWeight, textAlign, cornerRadius, stroke, strokeWidth, opacity, rotation, blendMode, shadow properties"},
				}, []string{"screen_name"}),

			MakeTool("update_design_element",
				"Update properties of an existing canvas element by ID. Supports all visual properties including position, size, fill (solid or gradient), stroke, effects, and typography.",
				map[string]providers.Property{
					"element_id":        {Type: "string", Description: "Element ID to update"},
					"name":              {Type: "string", Description: "New element name"},
					"x":                 {Type: "number", Description: "New X position"},
					"y":                 {Type: "number", Description: "New Y position"},
					"width":             {Type: "number", Description: "New width"},
					"height":            {Type: "number", Description: "New height"},
					"rotation":          {Type: "number", Description: "Rotation angle in degrees"},
					"fill":              {Type: "string", Description: "New fill color (hex string for solid color)"},
					"fill_gradient":     {Type: "object", Description: "Gradient fill. Linear: {type:'linear', angle:90, stops:[{offset:0, color:'#fff'}, {offset:1, color:'#000'}]}. Radial: {type:'radial', centerX:0.5, centerY:0.5, radius:0.5, stops:[...]}"},
					"stroke":            {Type: "string", Description: "New stroke color"},
					"stroke_width":      {Type: "number", Description: "Stroke width"},
					"stroke_dash_array": {Type: "array", Description: "Dash pattern [dash, gap]"},
					"stroke_line_cap":   {Type: "string", Description: "Line cap: 'butt', 'round', 'square'"},
					"stroke_line_join":  {Type: "string", Description: "Line join: 'miter', 'round', 'bevel'"},
					"corner_radius":     {Type: "number", Description: "Corner radius"},
					"opacity":           {Type: "number", Description: "Opacity 0-1"},
					"blend_mode":        {Type: "string", Description: "Blend mode"},
					"flip_x":            {Type: "boolean", Description: "Flip horizontally"},
					"flip_y":            {Type: "boolean", Description: "Flip vertically"},
					"sides":             {Type: "number", Description: "Polygon sides"},
					"points":            {Type: "number", Description: "Star points"},
					"inner_radius":      {Type: "number", Description: "Star inner radius"},
					"shadow_color":      {Type: "string", Description: "Shadow color"},
					"shadow_blur":       {Type: "number", Description: "Shadow blur"},
					"shadow_offset_x":   {Type: "number", Description: "Shadow X offset"},
					"shadow_offset_y":   {Type: "number", Description: "Shadow Y offset"},
					"text":              {Type: "string", Description: "New text content"},
					"font_size":         {Type: "number", Description: "Font size"},
					"font_weight":       {Type: "string", Description: "Font weight"},
					"font_family":       {Type: "string", Description: "Font family"},
					"text_align":        {Type: "string", Description: "Text alignment"},
					"line_height":       {Type: "number", Description: "Line height"},
					"letter_spacing":    {Type: "number", Description: "Letter spacing"},
					"visible":           {Type: "boolean", Description: "Show/hide"},
					"locked":            {Type: "boolean", Description: "Lock/unlock"},
				}, []string{"element_id"}),

			MakeTool("delete_design_element",
				"Delete an element from the canvas by ID",
				map[string]providers.Property{
					"element_id": {Type: "string", Description: "Element ID to delete"},
				}, []string{"element_id"}),

			MakeTool("list_fonts",
				"List available Google Fonts. Returns popular fonts by default, or search results if query provided. Use these font names with font_family parameter in create/update tools.",
				map[string]providers.Property{
					"query": {Type: "string", Description: "Search query to filter fonts (optional). Leave empty for popular fonts."},
					"limit": {Type: "number", Description: "Max results to return (default: 20, max: 50)"},
				}, []string{}),

			MakeTool("search_images",
				"Search for images to use in designs. Returns image URLs from Unsplash. Use the returned URL with create_design_element type='image'.",
				map[string]providers.Property{
					"query":  {Type: "string", Description: "Search query (e.g., 'water bottle', 'laptop', 'nature background')"},
					"width":  {Type: "number", Description: "Desired image width in pixels (default: 800)"},
					"height": {Type: "number", Description: "Desired image height in pixels (default: 600)"},
					"count":  {Type: "number", Description: "Number of image URLs to return (default: 3, max: 5)"},
				}, []string{"query"}),

			MakeTool("get_lucide_icon",
				"Get Lucide icon SVG for use in designs. Returns SVG path data that can be used with create_design_element type='path'. Lucide has 1400+ icons for common UI elements (arrows, menus, social, devices, etc).",
				map[string]providers.Property{
					"name":   {Type: "string", Description: "Icon name (e.g., 'shopping-cart', 'user', 'menu', 'arrow-right', 'heart', 'star', 'check', 'x', 'plus', 'minus', 'search', 'settings', 'home', 'mail', 'phone', 'camera', 'image', 'file', 'folder', 'download', 'upload', 'share', 'edit', 'trash', 'copy', 'save', 'refresh', 'play', 'pause', 'volume', 'wifi', 'bluetooth', 'battery', 'sun', 'moon', 'cloud', 'droplet')"},
					"search": {Type: "string", Description: "Search for icons by keyword instead of exact name"},
					"size":   {Type: "number", Description: "Icon size in pixels (default: 24, icons scale well)"},
					"color":  {Type: "string", Description: "Icon color hex (default: #000000)"},
				}, []string{}),

			MakeTool("search_icons",
				"Search for icons from multiple icon sets via Iconify API. Returns SVG data for use with create_design_element type='path'. Supports Material, Feather, Font Awesome, Heroicons, and 100+ more icon sets.",
				map[string]providers.Property{
					"query":    {Type: "string", Description: "Search query (e.g., 'shopping cart', 'user profile', 'settings')"},
					"icon_set": {Type: "string", Description: "Icon set prefix: 'mdi' (Material), 'fa6-solid' (Font Awesome), 'heroicons' (Heroicons), 'ph' (Phosphor), 'tabler' (Tabler), 'bi' (Bootstrap). Default: searches all sets."},
					"limit":    {Type: "number", Description: "Max results (default: 10, max: 20)"},
				}, []string{"query"}),

			MakeTool("get_canvas_state",
				"Get current canvas state: screens, element details, and suggested position for new screens. CALL THIS FIRST before creating or modifying screens. Elements include: fill (solid hex or gradient with stops), stroke, cornerRadius, text props, etc. Use detail_level='full' for all properties, 'summary' for compact view (default), 'placement' for just screen positions + suggested_x/y (lightest). Use element_id to get full details of a specific element. The response includes a 'pages' array listing all pages/tabs in the design — use page_name to target a specific page.",
				map[string]providers.Property{
					"design_name":  {Type: "string", Description: "Optional design name to scope screen discovery/placement (recommended when project has multiple designs)"},
					"detail_level": {Type: "string", Description: "'summary' (default): id, type, name, position, fill, text. 'full': all properties including stroke, shadow, gradient stops, font details. 'ids': minimal — just id and name for each element. 'placement': screen bounding boxes + suggested next position only (lightest, ~100B — use for positioning new screens)."},
					"element_id":   {Type: "string", Description: "Get full details for a specific element by ID (ignores detail_level, always returns everything)"},
					"page_name":    {Type: "string", Description: "Filter screens by page name (e.g., 'Landing', 'Dashboard'). If omitted, returns screens from all pages."},
				}, []string{}),

			MakeTool("create_plan",
				"Write your execution plan BEFORE creating any elements. Lists what you'll build: screen type, dimensions, total elements, icons needed, images needed, color palette. This structures your thinking and ensures complete output. The plan is shown to the user for transparency.",
				map[string]providers.Property{
					"screen_type":    {Type: "string", Description: "What you're building: 'mobile app', 'desktop page', 'card', 'component', etc."},
					"dimensions":     {Type: "string", Description: "Screen dimensions: '375x812' for mobile, '1440x900' for desktop, etc."},
					"total_elements": {Type: "number", Description: "Estimated total elements to create"},
					"sections":       {Type: "array", Description: "List of sections/areas: [{name: 'Header', elements: 5}, {name: 'Cards', elements: 12}]"},
					"icons_needed":   {Type: "array", Description: "Lucide icon names to fetch: ['search', 'heart', 'star', 'clock']"},
					"images_needed":  {Type: "array", Description: "Image search queries: ['sushi platter', 'pizza margherita']"},
					"color_palette":  {Type: "array", Description: "Main colors to use: ['#1a1a2e', '#e94560', '#ffffff']"},
				}, []string{"screen_type", "total_elements"}),

			MakeTool("export_element",
				"Export a design element from the canvas as SVG or PNG. Use this to extract individual elements for frontend developers to use as assets. Returns an action that the frontend will execute to perform the actual export.",
				map[string]providers.Property{
					"element_id":       {Type: "string", Description: "ID of the element to export"},
					"format":           {Type: "string", Description: "Export format: 'svg' or 'png' (default: svg)"},
					"scale":            {Type: "number", Description: "Scale multiplier for PNG export: 1, 2, or 3 (default: 2)"},
					"include_children": {Type: "boolean", Description: "Include child elements in export (default: true)"},
					"filename":         {Type: "string", Description: "Custom filename without extension (optional, defaults to element name)"},
				}, []string{"element_id"}),

			MakeTool("make_component",
				"Mark an existing element (group/screen/shape) as a reusable component. The element and its children become a master component that can be instanced. Like Figma's Cmd+Alt+K.",
				map[string]providers.Property{
					"element_id": {Type: "string", Description: "ID of the element to convert to a component"},
				}, []string{"element_id"}),

			MakeTool("create_component_instance",
				"Create an instance of an existing component at a position. The instance renders the component's visual and stays in sync with the master. Like dragging from Figma's Assets panel.",
				map[string]providers.Property{
					"component_id": {Type: "string", Description: "ID of the master component to instance"},
					"x":            {Type: "number", Description: "X position for the instance (default: 100)"},
					"y":            {Type: "number", Description: "Y position for the instance (default: 100)"},
					"name":         {Type: "string", Description: "Optional name for the instance (defaults to component name)"},
					"parent_id":    {Type: "string", Description: "Optional parent element ID for nesting inside screens"},
				}, []string{"component_id"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("create_design_element", executeCreateDesignElement)
	DefaultRegistry.RegisterExecutor("create_ui_screen", executeCreateUIScreen)
	DefaultRegistry.RegisterExecutor("update_design_element", executeUpdateDesignElement)
	DefaultRegistry.RegisterExecutor("delete_design_element", executeDeleteDesignElement)
	DefaultRegistry.RegisterExecutor("list_fonts", executeListFonts)
	DefaultRegistry.RegisterExecutor("search_images", executeSearchImages)
	DefaultRegistry.RegisterExecutor("get_lucide_icon", executeGetLucideIcon)
	DefaultRegistry.RegisterExecutor("search_icons", executeSearchIcons)
	DefaultRegistry.RegisterExecutor("get_canvas_state", executeGetCanvasState)
	DefaultRegistry.RegisterExecutor("create_plan", executeCreatePlan)
	DefaultRegistry.RegisterExecutor("export_element", executeExportElement)
	DefaultRegistry.RegisterExecutor("make_component", executeMakeComponent)
	DefaultRegistry.RegisterExecutor("create_component_instance", executeCreateComponentInstance)
}

func executeCreatePlan(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	screenType, _ := args["screen_type"].(string)
	dimensions, _ := args["dimensions"].(string)
	totalElements, _ := args["total_elements"].(float64)
	sections, _ := args["sections"].([]interface{})
	iconsNeeded, _ := args["icons_needed"].([]interface{})
	imagesNeeded, _ := args["images_needed"].([]interface{})
	colorPalette, _ := args["color_palette"].([]interface{})

	if dimensions == "" {
		dimensions = "375x812"
	}

	// Build execution steps based on the plan
	steps := []string{}
	stepNum := 1

	// Step 1: gather icons
	if len(iconsNeeded) > 0 {
		iconNames := make([]string, 0, len(iconsNeeded))
		for _, ic := range iconsNeeded {
			if name, ok := ic.(string); ok {
				iconNames = append(iconNames, name)
			}
		}
		steps = append(steps, fmt.Sprintf("Step %d: Call get_lucide_icon for each: %v", stepNum, iconNames))
		stepNum++
	}

	// Step 2: gather images
	if len(imagesNeeded) > 0 {
		imageQueries := make([]string, 0, len(imagesNeeded))
		for _, img := range imagesNeeded {
			if q, ok := img.(string); ok {
				imageQueries = append(imageQueries, q)
			}
		}
		steps = append(steps, fmt.Sprintf("Step %d: Call search_images for each: %v", stepNum, imageQueries))
		stepNum++
	}

	// Step 3: create screen
	steps = append(steps, fmt.Sprintf("Step %d: Call create_ui_screen with ALL %d structural elements", stepNum, int(totalElements)))
	stepNum++

	// Step 4: add images/icons
	if len(iconsNeeded) > 0 || len(imagesNeeded) > 0 {
		steps = append(steps, fmt.Sprintf("Step %d: Call create_design_element for each icon (type=path) and image (type=image) with parent_id", stepNum))
		stepNum++
	}

	steps = append(steps, fmt.Sprintf("Step %d: DONE — summarize what was created", stepNum))

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":          "plan",
		"screen_type":     screenType,
		"dimensions":      dimensions,
		"total_elements":  int(totalElements),
		"sections":        sections,
		"icons_needed":    iconsNeeded,
		"images_needed":   imagesNeeded,
		"color_palette":   colorPalette,
		"execution_steps": steps,
		"message":         fmt.Sprintf("Plan confirmed: %s (%s) with ~%d elements. IMPORTANT: This plan changed NOTHING on canvas. You MUST now execute the steps above by calling the actual tools (create_ui_screen, create_design_element, update_design_element, etc.). Do NOT say 'Done' until you have called those tools.", screenType, dimensions, int(totalElements)),
	})
	return ToolResult{Content: string(respJSON)}
}

func getStringFromMap(m map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key].(string); ok {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func getNumberFromMap(m map[string]interface{}, keys ...string) float64 {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			switch n := v.(type) {
			case float64:
				return n
			case float32:
				return float64(n)
			case int:
				return float64(n)
			case int64:
				return float64(n)
			case int32:
				return float64(n)
			case json.Number:
				if f, err := n.Float64(); err == nil {
					return f
				}
			}
		}
	}
	return 0
}

func normalizeDesignName(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

func designNameMatchesScope(designName, scope string) bool {
	normalizedScope := normalizeDesignName(scope)
	if normalizedScope == "" {
		return true
	}
	normalizedDesignName := normalizeDesignName(designName)
	if normalizedDesignName == "" {
		return false
	}
	if normalizedDesignName == normalizedScope {
		return true
	}
	return strings.Contains(normalizedDesignName, normalizedScope) || strings.Contains(normalizedScope, normalizedDesignName)
}

func getNestedMapValue(root map[string]interface{}, path ...string) map[string]interface{} {
	current := root
	for _, key := range path {
		next, ok := current[key].(map[string]interface{})
		if !ok {
			return nil
		}
		current = next
	}
	return current
}

func resolveDesignScope(args map[string]interface{}, ctx *ExecutionContext) string {
	for _, key := range []string{"design_name", "current_design", "design"} {
		if v, ok := args[key].(string); ok {
			if trimmed := strings.TrimSpace(v); trimmed != "" {
				return trimmed
			}
		}
	}

	if ctx == nil || ctx.LocalData == nil {
		return ""
	}

	for _, key := range []string{"design_name", "current_design", "design"} {
		if v, ok := ctx.LocalData[key].(string); ok {
			if trimmed := strings.TrimSpace(v); trimmed != "" {
				return trimmed
			}
		}
	}

	if ui := getNestedMapValue(ctx.LocalData, "space_context", "ui"); ui != nil {
		for _, key := range []string{"design_name", "current_design", "currentDesign", "design", "activeDesign", "active_design"} {
			if v, ok := ui[key].(string); ok {
				if trimmed := strings.TrimSpace(v); trimmed != "" {
					return trimmed
				}
			}
		}
	}

	return ""
}

func shouldUseLocalCanvasForScope(scope string, ctx *ExecutionContext) bool {
	if normalizeDesignName(scope) == "" || ctx == nil || ctx.LocalData == nil {
		return true
	}
	currentDesign, _ := ctx.LocalData["current_design"].(string)
	if strings.TrimSpace(currentDesign) == "" {
		return true
	}
	return designNameMatchesScope(currentDesign, scope)
}

// formatFillCompact returns a compact string representation of a fill value.
// Solid: "#ff0000". Gradient: "linear 180° #1e293b→#0f172a" or "radial #fff→#000".
func formatFillCompact(fillVal interface{}) string {
	switch fv := fillVal.(type) {
	case string:
		return fv
	case map[string]interface{}:
		gradType, _ := fv["type"].(string)
		stops, _ := fv["stops"].([]interface{})
		if len(stops) == 0 {
			return gradType + " gradient"
		}
		// Build compact: "linear 90° #fff→#000→#red"
		var sb strings.Builder
		sb.WriteString(gradType)
		if angle := getNumberFromMap(fv, "angle"); angle != 0 {
			sb.WriteString(fmt.Sprintf(" %.0f°", angle))
		}
		sb.WriteString(" ")
		for i, stop := range stops {
			if i > 0 {
				sb.WriteString("→")
			}
			if sm, ok := stop.(map[string]interface{}); ok {
				if c, ok := sm["color"].(string); ok {
					sb.WriteString(c)
				}
			}
		}
		return sb.String()
	default:
		return fmt.Sprintf("%v", fillVal)
	}
}

// buildElementDetail creates a map for a canvas element at the given detail level.
// "ids": just id + name
// "summary": id, type, name, position, compact fill, text snippet, cornerRadius
// "full": all properties including gradient stops, shadow, font details, etc.
func buildElementDetail(node map[string]interface{}, level string) map[string]interface{} {
	id := getStringFromMap(node, "id")
	name := getStringFromMap(node, "name")

	if level == "ids" {
		return map[string]interface{}{"id": id, "name": name}
	}

	nodeType := getStringFromMap(node, "type")
	child := map[string]interface{}{
		"id":   id,
		"type": nodeType,
		"name": name,
		"x":    getNumberFromMap(node, "x"),
		"y":    getNumberFromMap(node, "y"),
		"w":    getNumberFromMap(node, "width"),
		"h":    getNumberFromMap(node, "height"),
	}

	// Fill — always include, format depends on level
	if fillVal, exists := node["fill"]; exists && fillVal != nil {
		if level == "full" {
			// Full: include gradient object as-is
			switch fv := fillVal.(type) {
			case string:
				if fv != "" {
					child["fill"] = fv
				}
			case map[string]interface{}:
				child["fill"] = "gradient"
				child["fill_gradient"] = fv
			default:
				if b, err := json.Marshal(fv); err == nil {
					child["fill"] = string(b)
				}
			}
		} else {
			// Summary: compact one-liner for gradients
			child["fill"] = formatFillCompact(fillVal)
		}
	}

	// Text — always include for text nodes (truncated)
	if text := getStringFromMap(node, "text"); text != "" {
		maxLen := 40
		if level == "full" {
			maxLen = 200
		}
		if len(text) > maxLen {
			text = text[:maxLen] + "..."
		}
		child["text"] = text
	}

	// Summary: only a few key properties
	if cr := getNumberFromMap(node, "cornerRadius", "corner_radius"); cr > 0 {
		child["cornerRadius"] = cr
	}
	if op := getNumberFromMap(node, "opacity"); op > 0 && op < 1 {
		child["opacity"] = op
	}
	if nodeType == "text" {
		if fs := getNumberFromMap(node, "fontSize", "font_size"); fs > 0 {
			child["fontSize"] = fs
		}
		if fw := getStringFromMap(node, "fontWeight", "font_weight"); fw != "" && fw != "normal" {
			child["fontWeight"] = fw
		}
	}

	if level != "full" {
		return child
	}

	// === Full detail below ===

	// Stroke
	if stroke := getStringFromMap(node, "stroke"); stroke != "" {
		child["stroke"] = stroke
		if sw := getNumberFromMap(node, "strokeWidth", "stroke_width"); sw > 0 {
			child["strokeWidth"] = sw
		}
	}

	// Rotation
	if rot := getNumberFromMap(node, "rotation"); rot != 0 {
		child["rotation"] = rot
	}

	// Blend mode
	if bm := getStringFromMap(node, "blendMode", "blend_mode"); bm != "" && bm != "normal" {
		child["blendMode"] = bm
	}

	// Visibility / lock
	if visible, ok := node["visible"].(bool); ok && !visible {
		child["visible"] = false
	}
	if locked, ok := node["locked"].(bool); ok && locked {
		child["locked"] = true
	}

	// Shadow
	if sc := getStringFromMap(node, "shadowColor", "shadow_color"); sc != "" {
		child["shadow"] = fmt.Sprintf("%s blur=%.0f offset=%.0f,%.0f",
			sc,
			getNumberFromMap(node, "shadowBlur", "shadow_blur"),
			getNumberFromMap(node, "shadowOffsetX", "shadow_offset_x"),
			getNumberFromMap(node, "shadowOffsetY", "shadow_offset_y"),
		)
	}

	// Full text props
	if nodeType == "text" {
		if ff := getStringFromMap(node, "fontFamily", "font_family"); ff != "" {
			child["fontFamily"] = ff
		}
		if ta := getStringFromMap(node, "textAlign", "text_align"); ta != "" {
			child["textAlign"] = ta
		}
		if lh := getNumberFromMap(node, "lineHeight", "line_height"); lh > 0 {
			child["lineHeight"] = lh
		}
		if ls := getNumberFromMap(node, "letterSpacing", "letter_spacing"); ls != 0 {
			child["letterSpacing"] = ls
		}
	}

	// Polygon/star
	if nodeType == "polygon" {
		if sides := getNumberFromMap(node, "sides"); sides > 0 {
			child["sides"] = sides
		}
	}
	if nodeType == "star" {
		if pts := getNumberFromMap(node, "points"); pts > 0 {
			child["points"] = pts
		}
		if ir := getNumberFromMap(node, "innerRadius", "inner_radius"); ir > 0 {
			child["innerRadius"] = ir
		}
	}

	// Image
	if nodeType == "image" {
		if imgURL := getStringFromMap(node, "imageUrl", "image_url"); imgURL != "" {
			if strings.HasPrefix(imgURL, "data:") {
				child["imageUrl"] = "(data uri)"
			} else if len(imgURL) > 120 {
				child["imageUrl"] = imgURL[:120] + "..."
			} else {
				child["imageUrl"] = imgURL
			}
		}
		if of := getStringFromMap(node, "objectFit", "object_fit"); of != "" {
			child["objectFit"] = of
		}
	}

	// Path
	if nodeType == "path" {
		if pd := getStringFromMap(node, "pathData", "path_data"); pd != "" {
			if len(pd) > 60 {
				child["pathData"] = pd[:60] + "..."
			} else {
				child["pathData"] = pd
			}
		}
	}

	// Flip
	if fx, ok := node["flipX"].(bool); ok && fx {
		child["flipX"] = true
	}
	if fy, ok := node["flipY"].(bool); ok && fy {
		child["flipY"] = true
	}

	return child
}

func executeGetCanvasState(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	var screenInfos []map[string]interface{}
	var maxRight float64
	var localCanvasMaxRight float64
	hasLocalCanvasScreens := false
	totalElements := 0

	detailLevel, _ := args["detail_level"].(string)
	if detailLevel == "" {
		detailLevel = "summary"
	}
	singleElementID, _ := args["element_id"].(string)
	pageNameFilter, _ := args["page_name"].(string)

	designScope := resolveDesignScope(args, ctx)
	scopeMatchedInDB := false
	ambiguousUnscopedDesigns := false

	// Track pages metadata for the response
	type pageInfo struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		ScreenCount int    `json:"screen_count"`
	}
	var pagesMetadata []pageInfo

	// Primary source: read from database (always fresh)
	if ctx != nil && ctx.Storage != nil {
		var projectID *int
		if ctx.Project != nil && ctx.Project.ID > 0 {
			pid := ctx.Project.ID
			projectID = &pid
		}
		designs, err := ctx.Storage.UIDesignList(projectID)
		if err == nil {
			if strings.TrimSpace(designScope) == "" && len(designs) > 1 {
				ambiguousUnscopedDesigns = true
				designs = nil
			}
			for _, design := range designs {
				if !designNameMatchesScope(design.Name, designScope) {
					continue
				}
				scopeMatchedInDB = true

				// Try PagesJSON first (multi-page designs)
				if design.PagesJSON != "" {
					var pages []map[string]interface{}
					if err := json.Unmarshal([]byte(design.PagesJSON), &pages); err == nil && len(pages) > 0 {
						for _, page := range pages {
							pageName, _ := page["name"].(string)
							pageID, _ := page["id"].(string)

							// Filter by page_name if specified
							if pageNameFilter != "" && !strings.EqualFold(pageName, pageNameFilter) {
								continue
							}

							pageNodes, _ := page["nodes"].([]interface{})
							screenCount := 0
							for _, nodeRaw := range pageNodes {
								node, ok := nodeRaw.(map[string]interface{})
								if !ok {
									continue
								}
								totalElements++
								parentID := getStringFromMap(node, "parentId", "parent_id")
								nodeType := strings.ToLower(getStringFromMap(node, "type"))
								if nodeType != "screen" || parentID != "" {
									continue
								}
								screenCount++
								name := getStringFromMap(node, "name")
								id := getStringFromMap(node, "id")
								sx := getNumberFromMap(node, "x")
								sy := getNumberFromMap(node, "y")
								sw := getNumberFromMap(node, "width")
								sh := getNumberFromMap(node, "height")

								childCount := 0
								for _, childRaw := range pageNodes {
									child, ok := childRaw.(map[string]interface{})
									if !ok {
										continue
									}
									if pid := getStringFromMap(child, "parentId", "parent_id"); pid == id {
										childCount++
									}
								}

								screenInfo := map[string]interface{}{
									"id":          id,
									"name":        name,
									"design":      design.Name,
									"page_id":     pageID,
									"page_name":   pageName,
									"x":           sx,
									"y":           sy,
									"width":       sw,
									"height":      sh,
									"child_count": childCount,
								}
								if fillVal, exists := node["fill"]; exists && fillVal != nil {
									screenInfo["fill"] = formatFillCompact(fillVal)
								}
								screenInfos = append(screenInfos, screenInfo)

								if right := sx + sw; right > maxRight {
									maxRight = right
								}
							}

							pagesMetadata = append(pagesMetadata, pageInfo{
								ID:          pageID,
								Name:        pageName,
								ScreenCount: screenCount,
							})
						}
						continue // Used PagesJSON, skip NodesJSON fallback
					}
				}

				// Fallback to NodesJSON (legacy single-page designs)
				if design.NodesJSON == "" {
					continue
				}
				var nodes []map[string]interface{}
				if err := json.Unmarshal([]byte(design.NodesJSON), &nodes); err != nil {
					continue
				}
				for _, node := range nodes {
					totalElements++
					parentID := getStringFromMap(node, "parentId", "parent_id")
					nodeType := strings.ToLower(getStringFromMap(node, "type"))
					if nodeType != "screen" || parentID != "" {
						continue
					}
					name := getStringFromMap(node, "name")
					id := getStringFromMap(node, "id")
					sx := getNumberFromMap(node, "x")
					sy := getNumberFromMap(node, "y")
					sw := getNumberFromMap(node, "width")
					sh := getNumberFromMap(node, "height")

					childCount := 0
					for _, child := range nodes {
						if pid := getStringFromMap(child, "parentId", "parent_id"); pid == id {
							childCount++
						}
					}

					screenInfo := map[string]interface{}{
						"id":          id,
						"name":        name,
						"design":      design.Name,
						"x":           sx,
						"y":           sy,
						"width":       sw,
						"height":      sh,
						"child_count": childCount,
					}
					if fillVal, exists := node["fill"]; exists && fillVal != nil {
						screenInfo["fill"] = formatFillCompact(fillVal)
					}
					screenInfos = append(screenInfos, screenInfo)

					if right := sx + sw; right > maxRight {
						maxRight = right
					}
				}
			}
		}
	}

	// Fallback: check local canvas_data from local_data (screens created/edited in current session)
	if ctx != nil && ctx.LocalData != nil && shouldUseLocalCanvasForScope(designScope, ctx) {
		if canvasData, ok := ctx.LocalData["canvas_data"].([]interface{}); ok {
			existingIDs := make(map[string]bool, len(screenInfos))
			for _, s := range screenInfos {
				if id, ok := s["id"].(string); ok {
					existingIDs[id] = true
				}
			}

			for _, node := range canvasData {
				nodeMap, ok := node.(map[string]interface{})
				if !ok {
					continue
				}
				nodeType := strings.ToLower(getStringFromMap(nodeMap, "type"))
				parentID := getStringFromMap(nodeMap, "parentId", "parent_id")
				id := getStringFromMap(nodeMap, "id")
				if nodeType != "screen" || parentID != "" || existingIDs[id] {
					continue
				}

				// Screen exists in local_data but not in DB yet.
				sx := getNumberFromMap(nodeMap, "x")
				sw := getNumberFromMap(nodeMap, "width")
				screenInfos = append(screenInfos, map[string]interface{}{
					"id":     id,
					"name":   getStringFromMap(nodeMap, "name"),
					"x":      sx,
					"y":      getNumberFromMap(nodeMap, "y"),
					"width":  sw,
					"height": getNumberFromMap(nodeMap, "height"),
				})
				if right := sx + sw; right > maxRight {
					maxRight = right
				}
			}

			// Use local canvas bounds to keep placement aligned with currently edited canvas.
			for _, node := range canvasData {
				nodeMap, ok := node.(map[string]interface{})
				if !ok {
					continue
				}
				nodeType := strings.ToLower(getStringFromMap(nodeMap, "type"))
				parentID := getStringFromMap(nodeMap, "parentId", "parent_id")
				if nodeType != "screen" || parentID != "" {
					continue
				}
				sx := getNumberFromMap(nodeMap, "x")
				sw := getNumberFromMap(nodeMap, "width")
				right := sx + sw
				hasLocalCanvasScreens = true
				if right > localCanvasMaxRight {
					localCanvasMaxRight = right
				}
			}
		}
	}

	// Suggest next screen position.
	suggestedX := 100.0
	suggestedY := 100.0
	if hasLocalCanvasScreens {
		suggestedX = localCanvasMaxRight + 80
	} else if len(screenInfos) > 0 {
		suggestedX = maxRight + 80
	}

	// "placement" detail level: return only screen bounding boxes + suggested position.
	// Skips element collection entirely — this is the lightest response (~100-200B).
	if detailLevel == "placement" {
		placementScreens := make([]map[string]interface{}, 0, len(screenInfos))
		for _, screen := range screenInfos {
			ps := map[string]interface{}{
				"id":          screen["id"],
				"name":        screen["name"],
				"x":           screen["x"],
				"y":           screen["y"],
				"width":       screen["width"],
				"height":      screen["height"],
				"child_count": screen["child_count"],
			}
			if d, ok := screen["design"]; ok {
				ps["design"] = d
			}
			if pn, ok := screen["page_name"]; ok {
				ps["page_name"] = pn
			}
			placementScreens = append(placementScreens, ps)
		}
		response := map[string]interface{}{
			"action":       "canvas_state",
			"detail_level": "placement",
			"screen_count": len(placementScreens),
			"screens":      placementScreens,
			"suggested_x":  suggestedX,
			"suggested_y":  suggestedY,
			"IMPORTANT":    fmt.Sprintf("Use x=%.0f, y=%.0f for your new screen.", suggestedX, suggestedY),
		}
		if len(pagesMetadata) > 0 {
			response["pages"] = pagesMetadata
		}
		if strings.TrimSpace(designScope) != "" {
			response["design_scope"] = designScope
		}
		respJSON, _ := json.Marshal(response)
		return ToolResult{Content: string(respJSON)}
	}

	// Build element details for each screen (for update workflows)
	// Collect all nodes from both DB and local canvas for element lookup
	var allNodes []map[string]interface{}
	if ctx != nil && ctx.Storage != nil {
		var projectID *int
		if ctx.Project != nil && ctx.Project.ID > 0 {
			pid := ctx.Project.ID
			projectID = &pid
		}
		designs, err := ctx.Storage.UIDesignList(projectID)
		if err == nil {
			for _, design := range designs {
				if designScope != "" && !designNameMatchesScope(design.Name, designScope) {
					continue
				}
				// Try PagesJSON first (multi-page designs)
				if design.PagesJSON != "" {
					var pages []map[string]interface{}
					if err := json.Unmarshal([]byte(design.PagesJSON), &pages); err == nil && len(pages) > 0 {
						for _, page := range pages {
							pageName, _ := page["name"].(string)
							if pageNameFilter != "" && !strings.EqualFold(pageName, pageNameFilter) {
								continue
							}
							if pageNodes, ok := page["nodes"].([]interface{}); ok {
								for _, nodeRaw := range pageNodes {
									if node, ok := nodeRaw.(map[string]interface{}); ok {
										allNodes = append(allNodes, node)
									}
								}
							}
						}
						continue
					}
				}
				// Fallback to NodesJSON (legacy single-page designs)
				if design.NodesJSON == "" {
					continue
				}
				var nodes []map[string]interface{}
				if err := json.Unmarshal([]byte(design.NodesJSON), &nodes); err == nil {
					allNodes = append(allNodes, nodes...)
				}
			}
		}
	}
	// Also include local canvas data
	if ctx != nil && ctx.LocalData != nil {
		if canvasData, ok := ctx.LocalData["canvas_data"].([]interface{}); ok {
			for _, node := range canvasData {
				if nodeMap, ok := node.(map[string]interface{}); ok {
					allNodes = append(allNodes, nodeMap)
				}
			}
		}
	}

	// If element_id is requested, find and return just that element with full detail
	if singleElementID != "" {
		for _, node := range allNodes {
			if getStringFromMap(node, "id") == singleElementID {
				detail := buildElementDetail(node, "full")
				respJSON, _ := json.Marshal(map[string]interface{}{
					"action":  "element_detail",
					"element": detail,
				})
				return ToolResult{Content: string(respJSON)}
			}
		}
		return ToolResult{Content: fmt.Sprintf(`{"action":"element_detail","error":"Element '%s' not found"}`, singleElementID), IsError: true}
	}

	// Attach child elements to each screen info
	for _, screen := range screenInfos {
		screenID, _ := screen["id"].(string)
		if screenID == "" {
			continue
		}
		var children []map[string]interface{}
		for _, node := range allNodes {
			pid := getStringFromMap(node, "parentId", "parent_id")
			if pid != screenID {
				continue
			}
			children = append(children, buildElementDetail(node, detailLevel))
		}
		if len(children) > 0 {
			screen["elements"] = children
		}
	}

	response := map[string]interface{}{
		"action":         "canvas_state",
		"detail_level":   detailLevel,
		"total_elements": totalElements,
		"screens":        screenInfos,
		"screen_count":   len(screenInfos),
		"suggested_x":    suggestedX,
		"suggested_y":    suggestedY,
		"IMPORTANT":      fmt.Sprintf("Use x=%.0f, y=%.0f for your new screen. Do NOT use x=100 y=100 — that overlaps existing screens.", suggestedX, suggestedY),
	}
	if len(pagesMetadata) > 0 {
		response["pages"] = pagesMetadata
	}
	if detailLevel != "full" {
		response["tip"] = "For full element details (gradient stops, stroke, shadow, fonts), call get_canvas_state with detail_level='full' or element_id='<id>' for a single element."
	}
	if strings.TrimSpace(designScope) != "" {
		response["design_scope"] = designScope
		response["design_scope_matched"] = scopeMatchedInDB || hasLocalCanvasScreens
		if !scopeMatchedInDB && !hasLocalCanvasScreens {
			response["scope_warning"] = "No existing screens matched the requested design scope; using default placement."
		}
	} else if ambiguousUnscopedDesigns && !hasLocalCanvasScreens {
		response["scope_warning"] = "Multiple designs found in this project. Provide design_name (or open the target design) for accurate placement."
	}

	respJSON, _ := json.Marshal(response)
	return ToolResult{Content: string(respJSON)}
}

var supportedDesignElementTypes = map[string]struct{}{
	"screen":    {},
	"rectangle": {},
	"ellipse":   {},
	"text":      {},
	"line":      {},
	"polygon":   {},
	"star":      {},
	"path":      {},
	"image":     {},
}

func normalizeDesignElementType(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func listSupportedDesignElementTypes() string {
	types := make([]string, 0, len(supportedDesignElementTypes))
	for t := range supportedDesignElementTypes {
		types = append(types, t)
	}
	sort.Strings(types)
	return strings.Join(types, ", ")
}

func isSupportedDesignElementType(raw string) bool {
	_, ok := supportedDesignElementTypes[normalizeDesignElementType(raw)]
	return ok
}

func parseElementsArgument(raw interface{}) ([]interface{}, bool, error) {
	switch v := raw.(type) {
	case nil:
		return nil, false, nil
	case []interface{}:
		return v, true, nil
	case []string:
		elements := make([]interface{}, len(v))
		for i, item := range v {
			elements[i] = item
		}
		return elements, true, nil
	case []map[string]interface{}:
		elements := make([]interface{}, len(v))
		for i, item := range v {
			elements[i] = item
		}
		return elements, true, nil
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil, false, nil
		}
		if strings.HasPrefix(trimmed, "[") {
			var elements []interface{}
			if err := json.Unmarshal([]byte(trimmed), &elements); err != nil {
				return nil, true, fmt.Errorf("failed to parse elements JSON array: %w", err)
			}
			return elements, true, nil
		}
		var single map[string]interface{}
		if err := json.Unmarshal([]byte(trimmed), &single); err != nil {
			return nil, true, fmt.Errorf("failed to parse elements JSON object: %w", err)
		}
		return []interface{}{single}, true, nil
	default:
		return nil, true, fmt.Errorf("elements must be an array, []string, []object, or JSON string; got %T", raw)
	}
}

func parseElementObject(raw interface{}, index int) (map[string]interface{}, error) {
	switch v := raw.(type) {
	case map[string]interface{}:
		return v, nil
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil, fmt.Errorf("elements[%d] is an empty string", index)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
			return nil, fmt.Errorf("elements[%d] is a string but not a valid JSON object: %w", index, err)
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("elements[%d] must be an object or JSON string object; got %T", index, raw)
	}
}

func validateDesignElementMap(elem map[string]interface{}, index int) (string, error) {
	rawType := toStringValue(elem["type"])
	elementType := normalizeDesignElementType(rawType)
	if elementType == "" {
		return "", fmt.Errorf("elements[%d] is missing required field 'type'", index)
	}
	if !isSupportedDesignElementType(elementType) {
		return "", fmt.Errorf("elements[%d] has unsupported type '%s'. Supported types: %s", index, rawType, listSupportedDesignElementTypes())
	}

	if elementType == "path" {
		pathData := toStringValue(elem["pathData"])
		if pathData == "" {
			pathData = toStringValue(elem["path_data"])
		}
		if pathData == "" {
			return "", fmt.Errorf("elements[%d] type='path' requires pathData (or path_data) with SVG commands", index)
		}
	}

	if elementType == "image" {
		imageURL := toStringValue(elem["imageUrl"])
		if imageURL == "" {
			imageURL = toStringValue(elem["image_url"])
		}
		if imageURL == "" {
			return "", fmt.Errorf("elements[%d] type='image' requires imageUrl (or image_url)", index)
		}
	}

	if w, ok := toFloatValue(elem["width"]); ok && w < 0 {
		return "", fmt.Errorf("elements[%d] width must be >= 0", index)
	}
	if h, ok := toFloatValue(elem["height"]); ok && h < 0 {
		return "", fmt.Errorf("elements[%d] height must be >= 0", index)
	}

	elem["type"] = elementType
	return elementType, nil
}

func toStringValue(v interface{}) string {
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func toFloatValue(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		parsed, err := n.Float64()
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func executeCreateDesignElement(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	elementType, _ := args["type"].(string)
	name, _ := args["name"].(string)
	x, _ := args["x"].(float64)
	y, _ := args["y"].(float64)
	width, _ := args["width"].(float64)
	height, _ := args["height"].(float64)
	rotation, _ := args["rotation"].(float64)
	fill, _ := args["fill"].(string)
	fillGradient, hasFillGradient := args["fill_gradient"].(map[string]interface{})
	stroke, _ := args["stroke"].(string)
	strokeWidth, _ := args["stroke_width"].(float64)
	strokeDashArray, hasDashArray := args["stroke_dash_array"].([]interface{})
	strokeLineCap, _ := args["stroke_line_cap"].(string)
	strokeLineJoin, _ := args["stroke_line_join"].(string)
	cornerRadius, _ := args["corner_radius"].(float64)
	opacity, hasOpacity := args["opacity"].(float64)
	blendMode, _ := args["blend_mode"].(string)
	flipX, _ := args["flip_x"].(bool)
	flipY, _ := args["flip_y"].(bool)
	sides, _ := args["sides"].(float64)
	points, _ := args["points"].(float64)
	innerRadius, _ := args["inner_radius"].(float64)
	shadowColor, _ := args["shadow_color"].(string)
	shadowBlur, _ := args["shadow_blur"].(float64)
	shadowOffsetX, _ := args["shadow_offset_x"].(float64)
	shadowOffsetY, _ := args["shadow_offset_y"].(float64)
	text, _ := args["text"].(string)
	fontSize, _ := args["font_size"].(float64)
	fontWeight, _ := args["font_weight"].(string)
	fontFamily, _ := args["font_family"].(string)
	textAlign, _ := args["text_align"].(string)
	lineHeight, _ := args["line_height"].(float64)
	letterSpacing, _ := args["letter_spacing"].(float64)
	pathData, _ := args["path_data"].(string)
	imageUrl, _ := args["image_url"].(string)
	objectFit, _ := args["object_fit"].(string)
	parentID, _ := args["parent_id"].(string)

	elementType = normalizeDesignElementType(elementType)
	name = strings.TrimSpace(name)

	if elementType == "" {
		return ToolResult{
			Content: "ERROR: type is required for create_design_element. Supported types: " + listSupportedDesignElementTypes(),
			IsError: true,
		}
	}
	if !isSupportedDesignElementType(elementType) {
		return ToolResult{
			Content: fmt.Sprintf("ERROR: Unsupported element type '%s'. Supported types: %s", elementType, listSupportedDesignElementTypes()),
			IsError: true,
		}
	}
	if name == "" {
		name = strings.ToUpper(elementType[:1]) + elementType[1:]
	}
	if width < 0 || height < 0 {
		return ToolResult{
			Content: fmt.Sprintf("ERROR: width and height must be >= 0 (got width=%v, height=%v).", width, height),
			IsError: true,
		}
	}

	// CRITICAL: Reject path elements without pathData - they would be invisible
	if elementType == "path" && pathData == "" {
		return ToolResult{
			Content: `ERROR: path elements MUST include path_data with SVG commands. Example: path_data="M10,80 L10,30 Q10,5 50,5 Q90,5 90,30 L90,80 L50,50 Z". Without path_data, the path is INVISIBLE. Please retry with actual SVG path commands.`,
			IsError: true,
		}
	}
	if elementType == "image" && strings.TrimSpace(imageUrl) == "" {
		return ToolResult{
			Content: "ERROR: image elements MUST include image_url. Example: type='image', image_url='https://...'",
			IsError: true,
		}
	}

	// Set defaults — only for root elements (children use 0,0 = top-left of parent)
	if x == 0 && parentID == "" {
		x = 100
	}
	if y == 0 && parentID == "" {
		y = 100
	}
	if width == 0 {
		width = 200
	}
	if height == 0 {
		height = 150
	}

	// For screen elements, check overlap with existing screens and auto-offset
	if elementType == "screen" && parentID == "" {
		existingScreens := getExistingScreens(ctx, resolveDesignScope(args, ctx))
		x, y = findNonOverlappingPosition(x, y, width, height, existingScreens)
	}

	if fill == "" && !hasFillGradient {
		switch elementType {
		case "screen":
			fill = "#ffffff"
		case "text":
			fill = "#000000"
		default:
			fill = "#e5e7eb"
		}
	}
	if !hasOpacity {
		opacity = 1
	}
	if blendMode == "" {
		blendMode = "normal"
	}
	if elementType == "text" && fontSize == 0 {
		fontSize = 16
	}
	if elementType == "text" && fontWeight == "" {
		fontWeight = "normal"
	}
	if elementType == "text" && textAlign == "" {
		textAlign = "left"
	}
	if elementType == "polygon" && sides == 0 {
		sides = 6
	}
	if elementType == "star" && points == 0 {
		points = 5
	}
	if elementType == "star" && innerRadius == 0 {
		innerRadius = 50
	}

	id := fmt.Sprintf("node-%d-%s", time.Now().UnixNano(), randomString(8))

	element := map[string]interface{}{
		"id":        id,
		"type":      elementType,
		"name":      name,
		"x":         x,
		"y":         y,
		"width":     width,
		"height":    height,
		"rotation":  rotation,
		"visible":   true,
		"locked":    false,
		"opacity":   opacity,
		"blendMode": blendMode,
		"flipX":     flipX,
		"flipY":     flipY,
	}

	// Set fill - either solid color or gradient
	if hasFillGradient {
		element["fill"] = fillGradient
	} else {
		element["fill"] = fill
	}

	if stroke != "" {
		element["stroke"] = stroke
		if strokeWidth > 0 {
			element["strokeWidth"] = strokeWidth
		} else {
			element["strokeWidth"] = 1
		}
	}
	if hasDashArray && len(strokeDashArray) > 0 {
		element["strokeDashArray"] = strokeDashArray
	}
	if strokeLineCap != "" {
		element["strokeLineCap"] = strokeLineCap
	}
	if strokeLineJoin != "" {
		element["strokeLineJoin"] = strokeLineJoin
	}
	if cornerRadius > 0 {
		element["cornerRadius"] = cornerRadius
	}
	if shadowColor != "" {
		element["shadowColor"] = shadowColor
		element["shadowBlur"] = shadowBlur
		element["shadowOffsetX"] = shadowOffsetX
		element["shadowOffsetY"] = shadowOffsetY
	}
	if elementType == "polygon" {
		element["sides"] = sides
	}
	if elementType == "star" {
		element["points"] = points
		element["innerRadius"] = innerRadius
	}
	if elementType == "text" {
		if text == "" {
			text = "Text"
		}
		element["text"] = text
		element["fontSize"] = fontSize
		element["fontWeight"] = fontWeight
		element["textAlign"] = textAlign
		if fontFamily != "" {
			element["fontFamily"] = fontFamily
		}
		if lineHeight > 0 {
			element["lineHeight"] = lineHeight
		}
		if letterSpacing != 0 {
			element["letterSpacing"] = letterSpacing
		}
	}
	if elementType == "path" && pathData != "" {
		element["pathData"] = pathData
	}
	if elementType == "image" && imageUrl != "" {
		element["imageUrl"] = imageUrl
		// Default to 'cover' for images (fills container, crops overflow)
		if objectFit == "" {
			objectFit = "cover"
		}
		element["objectFit"] = objectFit
	}
	if parentID != "" {
		element["parentId"] = parentID
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":     "create_element",
		"element":    element,
		"element_id": id,
		"name":       name,
		"type":       elementType,
		"message":    fmt.Sprintf("Created %s '%s' (id: %s). Use this element_id with update_design_element to modify it.", elementType, name, id),
	})
	return ToolResult{Content: string(respJSON)}
}

// getExistingScreens reads screen positions from DB + LocalData, optionally scoped by design.
func getExistingScreens(ctx *ExecutionContext, designScope string) []screenRect {
	if ctx == nil {
		return nil
	}
	var screens []screenRect
	seenIDs := make(map[string]bool)
	useLocalCanvas := shouldUseLocalCanvasForScope(designScope, ctx)

	// Primary: read from database
	if ctx.Storage != nil {
		var projectID *int
		if ctx.Project != nil && ctx.Project.ID > 0 {
			pid := ctx.Project.ID
			projectID = &pid
		}
		designs, err := ctx.Storage.UIDesignList(projectID)
		if err == nil {
			if strings.TrimSpace(designScope) == "" && len(designs) > 1 {
				// Ambiguous target design: avoid cross-design overlap forcing far-right placement.
				designs = nil
			}
			for _, design := range designs {
				if !designNameMatchesScope(design.Name, designScope) {
					continue
				}
				if design.NodesJSON == "" {
					continue
				}
				var nodes []map[string]interface{}
				if err := json.Unmarshal([]byte(design.NodesJSON), &nodes); err != nil {
					continue
				}
				for _, node := range nodes {
					parentID := getStringFromMap(node, "parentId", "parent_id")
					nodeType := strings.ToLower(getStringFromMap(node, "type"))
					if nodeType != "screen" || parentID != "" {
						continue
					}
					id := getStringFromMap(node, "id")
					sx := getNumberFromMap(node, "x")
					sy := getNumberFromMap(node, "y")
					sw := getNumberFromMap(node, "width")
					sh := getNumberFromMap(node, "height")
					if sw > 0 && sh > 0 {
						screens = append(screens, screenRect{x: sx, y: sy, w: sw, h: sh})
						if id != "" {
							seenIDs[id] = true
						}
					}
				}
			}
		}
	}

	// Fallback: also check canvas_data from LocalData (screens created in current session)
	if useLocalCanvas && ctx.LocalData != nil {
		if canvasData, ok := ctx.LocalData["canvas_data"].([]interface{}); ok {
			for _, node := range canvasData {
				nodeMap, ok := node.(map[string]interface{})
				if !ok {
					continue
				}
				parentID := getStringFromMap(nodeMap, "parentId", "parent_id")
				nodeType := strings.ToLower(getStringFromMap(nodeMap, "type"))
				id := getStringFromMap(nodeMap, "id")
				if nodeType != "screen" || parentID != "" || seenIDs[id] {
					continue
				}
				sx := getNumberFromMap(nodeMap, "x")
				sy := getNumberFromMap(nodeMap, "y")
				sw := getNumberFromMap(nodeMap, "width")
				sh := getNumberFromMap(nodeMap, "height")
				if sw > 0 && sh > 0 {
					screens = append(screens, screenRect{x: sx, y: sy, w: sw, h: sh})
				}
			}
		}
	}

	return screens
}

type screenRect struct {
	x, y, w, h float64
}

// rectsOverlap checks if two rectangles overlap (with a gap margin)
func rectsOverlap(a, b screenRect, gap float64) bool {
	return a.x < b.x+b.w+gap && a.x+a.w+gap > b.x &&
		a.y < b.y+b.h+gap && a.y+a.h+gap > b.y
}

// findNonOverlappingPosition finds an x,y that doesn't overlap existing screens
// Tries the given position first, then shifts right until clear
func findNonOverlappingPosition(x, y, w, h float64, existing []screenRect) (float64, float64) {
	if len(existing) == 0 {
		return x, y
	}
	const gap = 80.0
	candidate := screenRect{x: x, y: y, w: w, h: h}
	for attempts := 0; attempts < 50; attempts++ {
		overlaps := false
		for _, s := range existing {
			if rectsOverlap(candidate, s, gap) {
				overlaps = true
				// Shift right past this screen
				candidate.x = s.x + s.w + gap
				break
			}
		}
		if !overlaps {
			return candidate.x, candidate.y
		}
	}
	return candidate.x, candidate.y
}

func executeCreateUIScreen(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	screenName, _ := args["screen_name"].(string)
	pageName, _ := args["page_name"].(string)
	x, _ := args["x"].(float64)
	y, _ := args["y"].(float64)
	width, _ := args["width"].(float64)
	height, _ := args["height"].(float64)
	screenName = strings.TrimSpace(screenName)
	pageName = strings.TrimSpace(pageName)
	if screenName == "" {
		screenName = "Screen"
	}
	if width < 0 || height < 0 {
		return ToolResult{
			Content: fmt.Sprintf("ERROR: screen width and height must be >= 0 (got width=%v, height=%v).", width, height),
			IsError: true,
		}
	}

	rawElements, hasElementsArg := args["elements"]
	elements, hasElementsInput, parseErr := parseElementsArgument(rawElements)
	if parseErr != nil {
		return ToolResult{
			Content: fmt.Sprintf("ERROR: invalid elements payload: %v. Expected array of element objects or JSON array string.", parseErr),
			IsError: true,
		}
	}

	if x == 0 {
		x = 100
	}
	if y == 0 {
		y = 100
	}
	if width == 0 {
		width = 375
	}
	if height == 0 {
		height = 812
	}

	// Check for overlap with existing screens and auto-offset if needed
	existingScreens := getExistingScreens(ctx, resolveDesignScope(args, ctx))
	x, y = findNonOverlappingPosition(x, y, width, height, existingScreens)

	screenID := fmt.Sprintf("node-%d-%s", time.Now().UnixNano(), randomString(8))

	screen := map[string]interface{}{
		"id":          screenID,
		"type":        "screen",
		"name":        screenName,
		"x":           x,
		"y":           y,
		"width":       width,
		"height":      height,
		"fill":        "#ffffff",
		"stroke":      "#d1d5db",
		"strokeWidth": 1,
		"visible":     true,
		"locked":      false,
		"opacity":     1,
		"blendMode":   "normal",
	}

	allElements := []map[string]interface{}{screen}
	validChildCount := 0

	// Process child elements
	for i, elem := range elements {
		elemMap, err := parseElementObject(elem, i)
		if err != nil {
			return ToolResult{
				Content: fmt.Sprintf("ERROR: %v. Example: elements=[{\"type\":\"rectangle\",\"name\":\"Card\",\"x\":16,\"y\":16,\"width\":200,\"height\":120,\"fill\":\"#1f2937\"}]", err),
				IsError: true,
			}
		}

		if _, err := validateDesignElementMap(elemMap, i); err != nil {
			return ToolResult{
				Content: fmt.Sprintf("ERROR: %v", err),
				IsError: true,
			}
		}

		// Generate ID if not provided
		if _, hasID := elemMap["id"]; !hasID {
			elemMap["id"] = fmt.Sprintf("node-%d-%s", time.Now().UnixNano()+int64(i+100), randomString(8))
		}

		// Normalize snake_case to camelCase for common properties
		if v, ok := elemMap["path_data"]; ok {
			elemMap["pathData"] = v
			delete(elemMap, "path_data")
		}
		if v, ok := elemMap["corner_radius"]; ok {
			elemMap["cornerRadius"] = v
			delete(elemMap, "corner_radius")
		}
		if v, ok := elemMap["stroke_width"]; ok {
			elemMap["strokeWidth"] = v
			delete(elemMap, "stroke_width")
		}
		if v, ok := elemMap["font_size"]; ok {
			elemMap["fontSize"] = v
			delete(elemMap, "font_size")
		}
		if v, ok := elemMap["font_weight"]; ok {
			elemMap["fontWeight"] = v
			delete(elemMap, "font_weight")
		}
		if v, ok := elemMap["text_align"]; ok {
			elemMap["textAlign"] = v
			delete(elemMap, "text_align")
		}
		if v, ok := elemMap["image_url"]; ok {
			elemMap["imageUrl"] = v
			delete(elemMap, "image_url")
			// Default images to 'cover' fit
			if _, hasFit := elemMap["object_fit"]; hasFit {
				elemMap["objectFit"] = elemMap["object_fit"]
				delete(elemMap, "object_fit")
			} else if _, hasFitCamel := elemMap["objectFit"]; !hasFitCamel {
				elemMap["objectFit"] = "cover"
			}
		}

		// Set parent to this screen
		elemMap["parentId"] = screenID

		// Set defaults
		if _, hasVisible := elemMap["visible"]; !hasVisible {
			elemMap["visible"] = true
		}
		if _, hasLocked := elemMap["locked"]; !hasLocked {
			elemMap["locked"] = false
		}
		if _, hasOpacity := elemMap["opacity"]; !hasOpacity {
			elemMap["opacity"] = 1
		}
		if _, hasBlendMode := elemMap["blendMode"]; !hasBlendMode {
			elemMap["blendMode"] = "normal"
		}

		allElements = append(allElements, elemMap)
		validChildCount++
	}

	if hasElementsArg && hasElementsInput && validChildCount == 0 {
		return ToolResult{
			Content: "ERROR: elements was provided but no valid child elements were parsed. Ensure each entry is an object with at least a valid type field.",
			IsError: true,
		}
	}

	resp := map[string]interface{}{
		"action":   "create_screen",
		"screen":   screen,
		"elements": allElements,
		"success":  true,
		"message":  fmt.Sprintf("Successfully created screen '%s' with %d child elements at position (%v, %v). Screen ID: %s. You can now add images (type='image') and icons (type='path') as child elements using parent_id='%s'.", screenName, len(allElements)-1, x, y, screenID, screenID),
	}
	if pageName != "" {
		resp["page_name"] = pageName
	}
	respJSON, _ := json.Marshal(resp)
	return ToolResult{Content: string(respJSON)}
}

func executeUpdateDesignElement(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	elementID, _ := args["element_id"].(string)

	updates := map[string]interface{}{}

	// Position & Size
	if v, ok := args["x"].(float64); ok {
		updates["x"] = v
	}
	if v, ok := args["y"].(float64); ok {
		updates["y"] = v
	}
	if v, ok := args["width"].(float64); ok {
		updates["width"] = v
	}
	if v, ok := args["height"].(float64); ok {
		updates["height"] = v
	}
	if v, ok := args["rotation"].(float64); ok {
		updates["rotation"] = v
	}

	// Fill - supports both solid color string and gradient object
	if v, ok := args["fill"].(string); ok {
		updates["fill"] = v
	}
	if v, ok := args["fill_gradient"].(map[string]interface{}); ok {
		updates["fill"] = v
	}

	// Stroke
	if v, ok := args["stroke"].(string); ok {
		updates["stroke"] = v
	}
	if v, ok := args["stroke_width"].(float64); ok {
		updates["strokeWidth"] = v
	}
	if v, ok := args["stroke_dash_array"].([]interface{}); ok {
		updates["strokeDashArray"] = v
	}
	if v, ok := args["stroke_line_cap"].(string); ok {
		updates["strokeLineCap"] = v
	}
	if v, ok := args["stroke_line_join"].(string); ok {
		updates["strokeLineJoin"] = v
	}
	if v, ok := args["corner_radius"].(float64); ok {
		updates["cornerRadius"] = v
	}

	// Appearance
	if v, ok := args["opacity"].(float64); ok {
		updates["opacity"] = v
	}
	if v, ok := args["blend_mode"].(string); ok {
		updates["blendMode"] = v
	}
	if v, ok := args["flip_x"].(bool); ok {
		updates["flipX"] = v
	}
	if v, ok := args["flip_y"].(bool); ok {
		updates["flipY"] = v
	}

	// Shape-specific
	if v, ok := args["sides"].(float64); ok {
		updates["sides"] = v
	}
	if v, ok := args["points"].(float64); ok {
		updates["points"] = v
	}
	if v, ok := args["inner_radius"].(float64); ok {
		updates["innerRadius"] = v
	}

	// Shadow
	if v, ok := args["shadow_color"].(string); ok {
		updates["shadowColor"] = v
	}
	if v, ok := args["shadow_blur"].(float64); ok {
		updates["shadowBlur"] = v
	}
	if v, ok := args["shadow_offset_x"].(float64); ok {
		updates["shadowOffsetX"] = v
	}
	if v, ok := args["shadow_offset_y"].(float64); ok {
		updates["shadowOffsetY"] = v
	}

	// Text properties
	if v, ok := args["text"].(string); ok {
		updates["text"] = v
	}
	if v, ok := args["font_size"].(float64); ok {
		updates["fontSize"] = v
	}
	if v, ok := args["font_weight"].(string); ok {
		updates["fontWeight"] = v
	}
	if v, ok := args["font_family"].(string); ok {
		updates["fontFamily"] = v
	}
	if v, ok := args["text_align"].(string); ok {
		updates["textAlign"] = v
	}
	if v, ok := args["line_height"].(float64); ok {
		updates["lineHeight"] = v
	}
	if v, ok := args["letter_spacing"].(float64); ok {
		updates["letterSpacing"] = v
	}

	// Visibility & Lock
	if v, ok := args["visible"].(bool); ok {
		updates["visible"] = v
	}
	if v, ok := args["locked"].(bool); ok {
		updates["locked"] = v
	}
	if v, ok := args["name"].(string); ok {
		updates["name"] = v
	}

	// Build a human-readable list of what was updated
	var updatedFields []string
	for k := range updates {
		updatedFields = append(updatedFields, k)
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":     "update_element",
		"element_id": elementID,
		"updates":    updates,
		"success":    true,
		"message":    fmt.Sprintf("Updated element %s. Modified: %v", elementID, updatedFields),
	})
	return ToolResult{Content: string(respJSON)}
}

func executeDeleteDesignElement(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	elementID, _ := args["element_id"].(string)

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":     "delete_element",
		"element_id": elementID,
	})
	return ToolResult{Content: string(respJSON)}
}

// Popular Google Fonts (preloaded in the app)
var popularFonts = []string{
	"Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
	"Source Sans 3", "Nunito", "Playfair Display", "Merriweather",
	"PT Sans", "Raleway", "Ubuntu", "Oswald", "Fira Sans", "Work Sans",
	"DM Sans", "Space Grotesk", "JetBrains Mono", "Fira Code",
}

// Additional common fonts available via Google Fonts
var additionalFonts = []string{
	"Rubik", "Quicksand", "Cabin", "Karla", "Barlow", "Mulish",
	"Josefin Sans", "Exo 2", "Archivo", "Red Hat Display", "Outfit",
	"Plus Jakarta Sans", "Manrope", "Lexend", "Sora", "Urbanist",
	"IBM Plex Sans", "IBM Plex Mono", "Source Code Pro", "Inconsolata",
	"Bitter", "Libre Baskerville", "Crimson Text", "EB Garamond",
	"Cormorant", "Spectral", "Lora", "Noto Serif", "PT Serif",
	"Dancing Script", "Pacifico", "Satisfy", "Great Vibes", "Caveat",
}

func executeListFonts(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	limit, hasLimit := args["limit"].(float64)

	if !hasLimit || limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	var results []string

	if query == "" {
		// Return popular fonts
		results = popularFonts
	} else {
		// Search all fonts
		allFonts := append(popularFonts, additionalFonts...)
		queryLower := query
		for _, font := range allFonts {
			if len(results) >= int(limit) {
				break
			}
			// Case-insensitive contains
			if contains(font, queryLower) {
				results = append(results, font)
			}
		}
	}

	// Apply limit
	if len(results) > int(limit) {
		results = results[:int(limit)]
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":       "list_fonts",
		"fonts":        results,
		"count":        len(results),
		"is_popular":   query == "",
		"search_query": query,
		"hint":         "Use these font names with font_family parameter. All 1900+ Google Fonts are available - these are just suggestions.",
	})
	return ToolResult{Content: string(respJSON)}
}

// Case-insensitive contains helper
func contains(s, substr string) bool {
	sLower := ""
	substrLower := ""
	for _, c := range s {
		if c >= 'A' && c <= 'Z' {
			sLower += string(c + 32)
		} else {
			sLower += string(c)
		}
	}
	for _, c := range substr {
		if c >= 'A' && c <= 'Z' {
			substrLower += string(c + 32)
		} else {
			substrLower += string(c)
		}
	}
	for i := 0; i <= len(sLower)-len(substrLower); i++ {
		if sLower[i:i+len(substrLower)] == substrLower {
			return true
		}
	}
	return false
}

func executeSearchImages(args map[string]any, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	width, hasWidth := args["width"].(float64)
	height, hasHeight := args["height"].(float64)
	count, hasCount := args["count"].(float64)

	if query == "" {
		return ToolResult{Content: `{"error": "query is required"}`}
	}

	if !hasWidth || width <= 0 {
		width = 800
	}
	if !hasHeight || height <= 0 {
		height = 600
	}
	if !hasCount || count <= 0 {
		count = 3
	}
	if count > 10 {
		count = 10
	}

	// Use Unsplash API for proper image search
	searchURL := fmt.Sprintf("https://api.unsplash.com/search/photos?query=%s&per_page=%d&orientation=landscape",
		url.QueryEscape(query), int(count))

	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf(`{"error": "Failed to create request: %v"}`, err)}
	}

	req.Header.Set("Authorization", "Client-ID "+unsplashAccessKey)
	req.Header.Set("Accept-Version", "v1")

	resp, err := sharedUIHTTPClient.Do(req)
	if err != nil {
		// Fallback to source.unsplash.com if API fails
		return fallbackUnsplashSearch(query, int(width), int(height), int(count))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return ToolResult{Content: fmt.Sprintf(`{"error": "Unsplash API error: %d - %s"}`, resp.StatusCode, string(body))}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fallbackUnsplashSearch(query, int(width), int(height), int(count))
	}

	var searchResult struct {
		Results []struct {
			ID             string `json:"id"`
			Description    string `json:"description"`
			AltDescription string `json:"alt_description"`
			URLs           struct {
				Raw     string `json:"raw"`
				Full    string `json:"full"`
				Regular string `json:"regular"`
				Small   string `json:"small"`
				Thumb   string `json:"thumb"`
			} `json:"urls"`
			Width  int `json:"width"`
			Height int `json:"height"`
			User   struct {
				Name string `json:"name"`
			} `json:"user"`
		} `json:"results"`
	}

	if err := json.Unmarshal(body, &searchResult); err != nil {
		return fallbackUnsplashSearch(query, int(width), int(height), int(count))
	}

	var images []map[string]any
	for _, photo := range searchResult.Results {
		// Use regular size with custom dimensions via Unsplash dynamic resizing
		imageURL := fmt.Sprintf("%s&w=%d&h=%d&fit=crop&auto=format", photo.URLs.Raw, int(width), int(height))

		images = append(images, map[string]any{
			"url":         imageURL,
			"thumb":       photo.URLs.Thumb,
			"width":       int(width),
			"height":      int(height),
			"description": photo.AltDescription,
			"credit":      photo.User.Name,
			"source":      "unsplash",
		})
	}

	// Build example call showing exactly what AI should do next
	firstURL := ""
	if len(images) > 0 {
		firstURL = images[0]["url"].(string)
	}

	respJSON, _ := json.Marshal(map[string]any{
		"action":    "search_images",
		"query":     query,
		"images":    images,
		"count":     len(images),
		"NEXT_STEP": fmt.Sprintf("STOP SEARCHING. Call create_design_element with: type='image', image_url='%s'", firstURL),
		"DO_NOT":    "DO NOT call search_images again. Use the URL above.",
	})
	return ToolResult{Content: string(respJSON)}
}

// fallbackUnsplashSearch uses source.unsplash.com when API is unavailable
func fallbackUnsplashSearch(query string, width, height, count int) ToolResult {
	var images []map[string]any
	for i := 0; i < count; i++ {
		imgURL := fmt.Sprintf("https://source.unsplash.com/%dx%d/?%s&sig=%d",
			width, height, url.QueryEscape(query), time.Now().UnixNano()+int64(i*1000))

		images = append(images, map[string]any{
			"url":    imgURL,
			"width":  width,
			"height": height,
			"source": "unsplash_source",
		})
	}

	// Build example call showing exactly what AI should do next
	firstURL := ""
	if len(images) > 0 {
		firstURL = images[0]["url"].(string)
	}

	respJSON, _ := json.Marshal(map[string]any{
		"action":    "search_images",
		"query":     query,
		"images":    images,
		"count":     len(images),
		"note":      "Using fallback source (API unavailable)",
		"NEXT_STEP": fmt.Sprintf("STOP SEARCHING. Call create_design_element with: type='image', image_url='%s'", firstURL),
		"DO_NOT":    "DO NOT call search_images again. Use the URL above.",
	})
	return ToolResult{Content: string(respJSON)}
}

// Common Lucide icon names and their SVG path data (subset for common UI icons)
var lucideIcons = map[string]string{
	// Navigation & Actions
	"menu":          "M4 6h16M4 12h16M4 18h16",
	"x":             "M18 6L6 18M6 6l12 12",
	"check":         "M20 6L9 17l-5-5",
	"plus":          "M12 5v14M5 12h14",
	"minus":         "M5 12h14",
	"arrow-left":    "M19 12H5M12 19l-7-7 7-7",
	"arrow-right":   "M5 12h14M12 5l7 7-7 7",
	"arrow-up":      "M12 19V5M5 12l7-7 7 7",
	"arrow-down":    "M12 5v14M19 12l-7 7-7-7",
	"chevron-left":  "M15 18l-6-6 6-6",
	"chevron-right": "M9 18l6-6-6-6",
	"chevron-up":    "M18 15l-6-6-6 6",
	"chevron-down":  "M6 9l6 6 6-6",

	// Common UI
	"search":   "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
	"home":     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
	"settings": "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 8a4 4 0 100 8 4 4 0 000-8z",
	"user":     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z",
	"users":    "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 3a4 4 0 100 8 4 4 0 000-8z M22 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
	"bell":     "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
	"mail":     "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
	"phone":    "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z",
	"calendar": "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18",
	"clock":    "M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v6l4 2",
	"heart":    "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
	"star":     "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",

	// E-commerce
	"shopping-cart": "M9 22a1 1 0 100-2 1 1 0 000 2z M20 22a1 1 0 100-2 1 1 0 000 2z M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6",
	"shopping-bag":  "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0",
	"credit-card":   "M1 4c0-1.1.9-2 2-2h18c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V4z M1 10h22",
	"tag":           "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01",
	"gift":          "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z",

	// Media
	"image":    "M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21",
	"camera":   "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z",
	"video":    "M23 7l-7 5 7 5V7z M14 5H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z",
	"play":     "M5 3l14 9-14 9V3z",
	"pause":    "M6 4h4v16H6z M14 4h4v16h-4z",
	"volume-2": "M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 010 14.14 M15.54 8.46a5 5 0 010 7.07",
	"mic":      "M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8",

	// Files & Documents
	"file":      "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7",
	"file-text": "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7 M16 13H8 M16 17H8 M10 9H8",
	"folder":    "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
	"download":  "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3",
	"upload":    "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
	"trash":     "M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2 M10 11v6 M14 11v6",
	"edit":      "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
	"copy":      "M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
	"save":      "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8 M7 3v5h8",
	"link":      "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",

	// System & Device
	"refresh":    "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15",
	"wifi":       "M5 12.55a11 11 0 0114.08 0 M1.42 9a16 16 0 0121.16 0 M8.53 16.11a6 6 0 016.95 0 M12 20h.01",
	"bluetooth":  "M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11",
	"battery":    "M17 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z M23 13v-2",
	"monitor":    "M20 3H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z M8 21h8 M12 17v4",
	"smartphone": "M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z M12 18h.01",

	// Weather
	"sun":             "M12 17a5 5 0 100-10 5 5 0 000 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
	"moon":            "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
	"cloud":           "M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z",
	"cloud-rain":      "M20 16.58A5 5 0 0018 7h-1.26A8 8 0 104 15.25 M16 14v6 M8 14v6 M12 16v6",
	"cloud-snow":      "M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 16.25 M8 16h.01 M8 20h.01 M12 18h.01 M12 22h.01 M16 16h.01 M16 20h.01",
	"cloud-lightning": "M19 16.9A5 5 0 0018 7h-1.26a8 8 0 10-11.62 9 M13 11l-4 6h6l-4 6",
	"droplet":         "M12 2.69l5.66 5.66a8 8 0 11-11.31 0z",
	"droplets":        "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z M12.56 14.06c1.74 0 3.15-1.44 3.15-3.19 0-.91-.45-1.78-1.35-2.51-.89-.74-1.48-1.73-1.71-2.76-.24 1.03-.83 2.02-1.72 2.76-.9.73-1.34 1.6-1.34 2.51 0 1.75 1.23 3.19 2.97 3.19z",
	"wind":            "M17.7 7.7a2.5 2.5 0 111.8 4.3H2 M9.6 4.6A2 2 0 1111 8H2 M12.6 19.4A2 2 0 1014 16H2",
	"thermometer":     "M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z",
	"snowflake":       "M12 2v20 M4.93 4.93l14.14 14.14 M2 12h20 M4.93 19.07l14.14-14.14",
	"umbrella":        "M18 19a3 3 0 01-6 0V12 M22 12a10.06 10.06 0 00-20 0z",
	"sunrise":         "M17 18a5 5 0 00-10 0 M12 9V2 M4.22 10.22l1.42 1.42 M1 18h2 M21 18h2 M18.36 11.64l1.42-1.42 M23 22H1 M8 6l4-4 4 4",

	// Social
	"share":          "M18 8a3 3 0 100-6 3 3 0 000 6z M6 15a3 3 0 100-6 3 3 0 000 6z M18 22a3 3 0 100-6 3 3 0 000 6z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98",
	"message-circle": "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
	"send":           "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
	"thumbs-up":      "M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z M4 15v7a1 1 0 01-1 1H2",

	// Misc
	"eye":          "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z",
	"eye-off":      "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24 M1 1l22 22",
	"lock":         "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4",
	"unlock":       "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 019.9-1",
	"filter":       "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
	"layers":       "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
	"map-pin":      "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7a3 3 0 100 6 3 3 0 000-6z",
	"globe":        "M12 22a10 10 0 100-20 10 10 0 000 20z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
	"zap":          "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
	"info":         "M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01",
	"alert-circle": "M12 22a10 10 0 100-20 10 10 0 000 20z M12 8v4 M12 16h.01",
	"help-circle":  "M12 22a10 10 0 100-20 10 10 0 000 20z M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3 M12 17h.01",
}

// Mutex for thread-safe icon cache writes
var lucideIconsMu sync.Mutex

// fetchLucideFromCDN fetches an SVG icon from the Lucide CDN and extracts path data
func fetchLucideFromCDN(name string) string {
	url := fmt.Sprintf("https://unpkg.com/lucide-static@latest/icons/%s.svg", name)
	resp, err := sharedUIShortClient.Get(url)
	if err != nil || resp.StatusCode != 200 {
		return ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	svgStr := string(body)
	// Extract all d="..." attributes from path elements
	var paths []string
	remaining := svgStr
	for {
		idx := strings.Index(remaining, " d=\"")
		if idx == -1 {
			break
		}
		remaining = remaining[idx+4:]
		endIdx := strings.Index(remaining, "\"")
		if endIdx == -1 {
			break
		}
		paths = append(paths, remaining[:endIdx])
		remaining = remaining[endIdx:]
	}

	// Also check for line/circle/rect/polyline elements and extract their attributes
	// For simple paths, join with space
	if len(paths) > 0 {
		return strings.Join(paths, " ")
	}

	// Try extracting from other SVG elements (line, circle, polyline, rect)
	// These are less common but some Lucide icons use them
	return ""
}

// fuzzyIconLookup tries plural/singular forms, synonyms, and partial matches
// Returns (pathData, resolvedName, found)
func fuzzyIconLookup(name string) (string, string, bool) {
	lower := strings.ToLower(name)

	// 1. Try removing trailing 's' (plural → singular: "droplets" → "droplet")
	if strings.HasSuffix(lower, "s") && len(lower) > 2 {
		singular := lower[:len(lower)-1]
		if pd, ok := lucideIcons[singular]; ok {
			return pd, singular, true
		}
	}

	// 2. Try adding trailing 's' (singular → plural: "droplet" → "droplets")
	plural := lower + "s"
	if pd, ok := lucideIcons[plural]; ok {
		return pd, plural, true
	}

	// 3. Try common synonyms / alternate names
	synonyms := map[string][]string{
		"temperature":  {"thermometer"},
		"thermometer":  {"thermometer"},
		"temp":         {"thermometer"},
		"humidity":     {"droplet", "droplets"},
		"rain":         {"cloud-rain", "droplet"},
		"water":        {"droplet", "droplets"},
		"breeze":       {"wind"},
		"gust":         {"wind"},
		"weather":      {"cloud", "sun"},
		"storm":        {"cloud-lightning"},
		"snow":         {"cloud-snow", "snowflake"},
		"email":        {"mail"},
		"envelope":     {"mail"},
		"password":     {"lock"},
		"key":          {"lock"},
		"close":        {"x"},
		"remove":       {"x", "trash"},
		"delete":       {"trash"},
		"add":          {"plus"},
		"location":     {"map-pin"},
		"pin":          {"map-pin"},
		"navigate":     {"map-pin", "arrow-right"},
		"time":         {"clock"},
		"photo":        {"image", "camera"},
		"picture":      {"image"},
		"profile":      {"user"},
		"account":      {"user"},
		"love":         {"heart"},
		"favorite":     {"heart", "star"},
		"bookmark":     {"star"},
		"cart":         {"shopping-cart"},
		"bag":          {"shopping-bag"},
		"notification": {"bell"},
		"alert":        {"alert-circle", "bell"},
		"warning":      {"alert-circle"},
		"error":        {"alert-circle", "x"},
		"success":      {"check"},
		"done":         {"check"},
		"complete":     {"check"},
		"back":         {"arrow-left", "chevron-left"},
		"forward":      {"arrow-right", "chevron-right"},
		"next":         {"arrow-right", "chevron-right"},
		"previous":     {"arrow-left", "chevron-left"},
		"expand":       {"chevron-down"},
		"collapse":     {"chevron-up"},
		"visible":      {"eye"},
		"hidden":       {"eye-off"},
		"show":         {"eye"},
		"hide":         {"eye-off"},
		"power":        {"zap"},
		"energy":       {"zap"},
		"lightning":    {"zap", "cloud-lightning"},
		"world":        {"globe"},
		"earth":        {"globe"},
		"internet":     {"globe", "wifi"},
	}

	if alts, ok := synonyms[lower]; ok {
		for _, alt := range alts {
			if pd, ok2 := lucideIcons[alt]; ok2 {
				return pd, alt, true
			}
		}
	}

	// 4. Try partial/substring match (e.g. "arrow" matches "arrow-right")
	for iconName, pd := range lucideIcons {
		if strings.HasPrefix(iconName, lower+"-") || strings.HasPrefix(iconName, lower) {
			return pd, iconName, true
		}
	}

	// 5. Try reverse substring (e.g. "right-arrow" finds "arrow-right")
	for iconName, pd := range lucideIcons {
		if strings.Contains(iconName, lower) {
			return pd, iconName, true
		}
	}

	return "", name, false
}

func executeGetLucideIcon(args map[string]any, ctx *ExecutionContext) ToolResult {
	name, _ := args["name"].(string)
	search, _ := args["search"].(string)
	size, hasSize := args["size"].(float64)
	color, _ := args["color"].(string)

	if !hasSize || size == 0 {
		size = 24
	}
	if color == "" {
		color = "#000000"
	}

	// If search query provided, find matching icons
	if search != "" {
		matches := []map[string]any{}
		for iconName, pathData := range lucideIcons {
			if containsIgnoreCase(iconName, search) {
				matches = append(matches, map[string]any{
					"name":      iconName,
					"path_data": pathData,
					"svg_url":   fmt.Sprintf("https://unpkg.com/lucide-static@latest/icons/%s.svg", iconName),
				})
				if len(matches) >= 10 {
					break
				}
			}
		}

		respJSON, _ := json.Marshal(map[string]any{
			"action":  "get_lucide_icon",
			"search":  search,
			"matches": matches,
			"count":   len(matches),
			"hint":    "Use path_data with create_design_element type='path' path_data=PATH_DATA",
		})
		return ToolResult{Content: string(respJSON)}
	}

	// Get specific icon by name
	if name != "" {
		pathData, exists := lucideIcons[name]

		// If exact match fails, try fuzzy: singular/plural, synonyms, partial matches
		if !exists {
			pathData, name, exists = fuzzyIconLookup(name)
		}

		// If still not found, try fetching from Lucide CDN
		if !exists {
			fetchedPath := fetchLucideFromCDN(name)
			if fetchedPath != "" {
				pathData = fetchedPath
				exists = true
				// Cache it for future lookups
				lucideIconsMu.Lock()
				lucideIcons[name] = fetchedPath
				lucideIconsMu.Unlock()
			}
		}

		if !exists {
			// Still not found — find similar icons and auto-resolve to the best match
			suggestions := []string{}
			for iconName := range lucideIcons {
				if containsIgnoreCase(iconName, name) || containsIgnoreCase(name, iconName) {
					suggestions = append(suggestions, iconName)
					if len(suggestions) >= 5 {
						break
					}
				}
			}

			// Auto-resolve: if we have a suggestion, return its path_data directly
			// so the model doesn't need another round-trip
			if len(suggestions) > 0 {
				bestMatch := suggestions[0]
				bestPathData := lucideIcons[bestMatch]
				respJSON, _ := json.Marshal(map[string]any{
					"action":         "get_lucide_icon",
					"name":           bestMatch,
					"original_query": name,
					"path_data":      bestPathData,
					"size":           int(size),
					"color":          color,
					"svg_url":        fmt.Sprintf("https://unpkg.com/lucide-static@latest/icons/%s.svg", bestMatch),
					"resolved":       true,
					"hint":           fmt.Sprintf("Icon '%s' not found — auto-resolved to '%s'. Use path_data with create_design_element.", name, bestMatch),
				})
				return ToolResult{Content: string(respJSON)}
			}

			respJSON, _ := json.Marshal(map[string]any{
				"action":      "get_lucide_icon",
				"error":       fmt.Sprintf("Icon '%s' not found and no similar icons available", name),
				"suggestions": []string{},
				"hint":        "Icon not found. Try a different name: menu, x, check, plus, search, home, settings, user, star, heart.",
			})
			return ToolResult{Content: string(respJSON), IsError: true}
		}

		respJSON, _ := json.Marshal(map[string]any{
			"action":    "get_lucide_icon",
			"name":      name,
			"path_data": pathData,
			"size":      int(size),
			"color":     color,
			"svg_url":   fmt.Sprintf("https://unpkg.com/lucide-static@latest/icons/%s.svg", name),
			"hint":      "Use with create_design_element type='path' path_data=PATH_DATA width=SIZE height=SIZE stroke=COLOR",
		})
		return ToolResult{Content: string(respJSON)}
	}

	// No name or search - return popular icons list
	popular := []string{"menu", "x", "check", "plus", "minus", "search", "home", "settings", "user", "heart", "star", "shopping-cart", "mail", "phone", "camera", "image", "download", "upload", "edit", "trash", "share", "eye", "lock", "play", "pause", "sun", "moon"}

	respJSON, _ := json.Marshal(map[string]any{
		"action":        "get_lucide_icon",
		"popular_icons": popular,
		"total_cached":  len(lucideIcons),
		"hint":          "Use name parameter for specific icon, or search parameter to find icons by keyword",
	})
	return ToolResult{Content: string(respJSON)}
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		(len(substr) > 0 && (indexIgnoreCase(s, substr) >= 0)))
}

func indexIgnoreCase(s, substr string) int {
	sLower := toLower(s)
	substrLower := toLower(substr)
	for i := 0; i <= len(sLower)-len(substrLower); i++ {
		if sLower[i:i+len(substrLower)] == substrLower {
			return i
		}
	}
	return -1
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		} else {
			b[i] = c
		}
	}
	return string(b)
}

func executeSearchIcons(args map[string]any, ctx *ExecutionContext) ToolResult {
	query, _ := args["query"].(string)
	iconSet, _ := args["icon_set"].(string)
	limit, hasLimit := args["limit"].(float64)

	if query == "" {
		return ToolResult{Content: `{"error": "query parameter is required"}`}
	}

	if !hasLimit || limit == 0 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}

	// Build Iconify API search URL
	// API docs: https://iconify.design/docs/api/search.html
	searchURL := fmt.Sprintf("https://api.iconify.design/search?query=%s&limit=%d", query, int(limit))
	if iconSet != "" {
		searchURL += "&prefix=" + iconSet
	}

	// Return the search URL and instructions since we can't make HTTP requests here
	// The AI or frontend will need to fetch this
	respJSON, _ := json.Marshal(map[string]any{
		"action":     "search_icons",
		"query":      query,
		"icon_set":   iconSet,
		"search_url": searchURL,
		"hint":       "Fetch search_url to get icon results. Each icon can be fetched as SVG via: https://api.iconify.design/{prefix}/{name}.svg",
		"popular_sets": []map[string]string{
			{"prefix": "mdi", "name": "Material Design Icons", "count": "7000+"},
			{"prefix": "lucide", "name": "Lucide", "count": "1400+"},
			{"prefix": "heroicons", "name": "Heroicons", "count": "450+"},
			{"prefix": "fa6-solid", "name": "Font Awesome 6 Solid", "count": "1000+"},
			{"prefix": "ph", "name": "Phosphor", "count": "6000+"},
			{"prefix": "tabler", "name": "Tabler Icons", "count": "4500+"},
			{"prefix": "bi", "name": "Bootstrap Icons", "count": "1800+"},
		},
		"example_urls": []string{
			"https://api.iconify.design/mdi/cart.svg",
			"https://api.iconify.design/lucide/shopping-cart.svg",
			"https://api.iconify.design/heroicons/shopping-cart.svg",
		},
	})
	return ToolResult{Content: string(respJSON)}
}

func executeExportElement(args map[string]any, ctx *ExecutionContext) ToolResult {
	elementID, _ := args["element_id"].(string)
	format, _ := args["format"].(string)
	scale, hasScale := args["scale"].(float64)
	includeChildren, hasIncludeChildren := args["include_children"].(bool)
	filename, _ := args["filename"].(string)

	if elementID == "" {
		return ToolResult{Content: `{"error": "element_id is required"}`}
	}

	// Default values
	if format == "" {
		format = "svg"
	}
	if format != "svg" && format != "png" {
		return ToolResult{Content: `{"error": "format must be 'svg' or 'png'"}`}
	}
	if !hasScale || scale < 1 {
		scale = 2
	}
	if scale > 3 {
		scale = 3
	}
	if !hasIncludeChildren {
		includeChildren = true
	}

	respJSON, _ := json.Marshal(map[string]any{
		"action":           "export_element",
		"element_id":       elementID,
		"format":           format,
		"scale":            int(scale),
		"include_children": includeChildren,
		"filename":         filename,
		"hint":             "The frontend will export the element with the specified options and trigger a download.",
	})
	return ToolResult{Content: string(respJSON)}
}

func executeMakeComponent(args map[string]any, ctx *ExecutionContext) ToolResult {
	elementID, _ := args["element_id"].(string)
	if elementID == "" {
		return ToolResult{Content: `{"error": "element_id is required"}`, IsError: true}
	}

	respJSON, _ := json.Marshal(map[string]any{
		"action":     "update_element",
		"element_id": elementID,
		"updates": map[string]any{
			"isComponent": true,
		},
		"message": fmt.Sprintf("Marked element '%s' as a reusable component. You can now create instances of it using create_component_instance.", elementID),
	})
	return ToolResult{Content: string(respJSON)}
}

func executeCreateComponentInstance(args map[string]any, ctx *ExecutionContext) ToolResult {
	componentID, _ := args["component_id"].(string)
	x, _ := args["x"].(float64)
	y, _ := args["y"].(float64)
	name, _ := args["name"].(string)
	parentID, _ := args["parent_id"].(string)

	if componentID == "" {
		return ToolResult{Content: `{"error": "component_id is required"}`, IsError: true}
	}

	if x == 0 && parentID == "" {
		x = 100
	}
	if y == 0 && parentID == "" {
		y = 100
	}

	id := fmt.Sprintf("inst-%d-%s", time.Now().UnixNano(), randomString(7))

	element := map[string]any{
		"id":          id,
		"type":        "component-instance",
		"name":        name,
		"x":           x,
		"y":           y,
		"width":       0,
		"height":      0,
		"componentId": componentID,
		"overrides":   map[string]any{},
		"visible":     true,
		"locked":      false,
		"opacity":     1,
	}
	if parentID != "" {
		element["parentId"] = parentID
	}

	respJSON, _ := json.Marshal(map[string]any{
		"action":       "create_element",
		"element":      element,
		"element_id":   id,
		"component_id": componentID,
		"message":      fmt.Sprintf("Created component instance of '%s' (instance id: %s).", componentID, id),
	})
	return ToolResult{Content: string(respJSON)}
}
