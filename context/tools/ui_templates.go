package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// TemplateTheme holds color parameters for UI templates. All fields optional with sensible defaults.
type TemplateTheme struct {
	BgPrimary   string `json:"bg_primary"`
	BgSecondary string `json:"bg_secondary"`
	TextPrimary string `json:"text_primary"`
	TextSecondary string `json:"text_secondary"`
	Accent      string `json:"accent"`
	AccentText  string `json:"accent_text"`
	Border      string `json:"border"`
	IconColor   string `json:"icon_color"`
	ActiveBg    string `json:"active_bg"`
	ActiveText  string `json:"active_text"`
}

// defaultTheme returns sensible light-mode defaults.
func defaultTheme() TemplateTheme {
	return TemplateTheme{
		BgPrimary:     "#ffffff",
		BgSecondary:   "#f8fafc",
		TextPrimary:   "#0f172a",
		TextSecondary: "#64748b",
		Accent:        "#3b82f6",
		AccentText:    "#ffffff",
		Border:        "#e2e8f0",
		IconColor:     "#64748b",
		ActiveBg:      "#eff6ff",
		ActiveText:    "#2563eb",
	}
}

// mergeTheme overlays user-provided overrides onto defaults.
func mergeTheme(base TemplateTheme, overrides map[string]interface{}) TemplateTheme {
	if overrides == nil {
		return base
	}
	if v, ok := overrides["bg_primary"].(string); ok && v != "" {
		base.BgPrimary = v
	}
	if v, ok := overrides["bg_secondary"].(string); ok && v != "" {
		base.BgSecondary = v
	}
	if v, ok := overrides["text_primary"].(string); ok && v != "" {
		base.TextPrimary = v
	}
	if v, ok := overrides["text_secondary"].(string); ok && v != "" {
		base.TextSecondary = v
	}
	if v, ok := overrides["accent"].(string); ok && v != "" {
		base.Accent = v
	}
	if v, ok := overrides["accent_text"].(string); ok && v != "" {
		base.AccentText = v
	}
	if v, ok := overrides["border"].(string); ok && v != "" {
		base.Border = v
	}
	if v, ok := overrides["icon_color"].(string); ok && v != "" {
		base.IconColor = v
	}
	if v, ok := overrides["active_bg"].(string); ok && v != "" {
		base.ActiveBg = v
	}
	if v, ok := overrides["active_text"].(string); ok && v != "" {
		base.ActiveText = v
	}
	return base
}

// TemplateItem represents a menu/nav/tab item.
type TemplateItem struct {
	Label    string `json:"label"`
	Icon     string `json:"icon"`
	IsActive bool   `json:"is_active"`
	Badge    string `json:"badge"`
}

// parseTemplateItems parses the items array from tool args.
func parseTemplateItems(raw interface{}) []TemplateItem {
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	items := make([]TemplateItem, 0, len(arr))
	for _, v := range arr {
		m, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		item := TemplateItem{}
		if l, ok := m["label"].(string); ok {
			item.Label = l
		}
		if ic, ok := m["icon"].(string); ok {
			item.Icon = ic
		}
		if a, ok := m["is_active"].(bool); ok {
			item.IsActive = a
		}
		if b, ok := m["badge"].(string); ok {
			item.Badge = b
		}
		items = append(items, item)
	}
	return items
}

// resolveIconPath resolves a Lucide icon name to SVG path data.
// Priority: hardcoded map → fuzzy lookup → CDN fetch.
func resolveIconPath(name string) string {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == "" {
		return ""
	}
	// Exact match in hardcoded map
	if pd, ok := lucideIcons[lower]; ok {
		return pd
	}
	// Fuzzy lookup (synonyms, plural/singular, substring)
	if pd, resolvedName, found := fuzzyIconLookup(lower); found {
		// Cache the resolved name for future lookups
		lucideIconsMu.Lock()
		lucideIcons[lower] = pd
		_ = resolvedName
		lucideIconsMu.Unlock()
		return pd
	}
	// CDN fallback
	if pd := fetchLucideFromCDN(lower); pd != "" {
		lucideIconsMu.Lock()
		lucideIcons[lower] = pd
		lucideIconsMu.Unlock()
		return pd
	}
	return ""
}

// batchResolveIcons concurrently resolves a list of icon names to SVG path data.
// Returns map[name]pathData. Missing icons map to "".
func batchResolveIcons(names []string) map[string]string {
	result := make(map[string]string, len(names))
	if len(names) == 0 {
		return result
	}

	// Deduplicate
	unique := make(map[string]bool, len(names))
	for _, n := range names {
		lower := strings.ToLower(strings.TrimSpace(n))
		if lower != "" {
			unique[lower] = true
		}
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	for name := range unique {
		wg.Add(1)
		go func(n string) {
			defer wg.Done()
			pd := resolveIconPath(n)
			mu.Lock()
			result[n] = pd
			mu.Unlock()
		}(name)
	}
	wg.Wait()
	return result
}

// collectIconNames gathers all icon names needed from items + extra template-specific icons.
func collectIconNames(items []TemplateItem, extra ...string) []string {
	names := make([]string, 0, len(items)+len(extra))
	for _, item := range items {
		if item.Icon != "" {
			names = append(names, item.Icon)
		}
	}
	names = append(names, extra...)
	return names
}

// makeID generates a unique element ID.
func makeID() string {
	return fmt.Sprintf("node-%d-%s", time.Now().UnixNano(), randomString(8))
}

// makeElement creates a base element map with common defaults set.
func makeElement(elemType, name string, x, y, w, h float64, parentID string) map[string]interface{} {
	return map[string]interface{}{
		"id":        makeID(),
		"type":      elemType,
		"name":      name,
		"x":         x,
		"y":         y,
		"width":     w,
		"height":    h,
		"parentId":  parentID,
		"visible":   true,
		"locked":    false,
		"opacity":   1,
		"blendMode": "normal",
	}
}

// addFill sets fill on an element.
func addFill(elem map[string]interface{}, color string) {
	elem["fill"] = color
}

// addText sets text properties on an element.
func addText(elem map[string]interface{}, text string, fontSize float64, fontWeight, fill, textAlign string) {
	elem["text"] = text
	elem["fontSize"] = fontSize
	elem["fontWeight"] = fontWeight
	elem["fill"] = fill
	if textAlign != "" {
		elem["textAlign"] = textAlign
	}
}

// addCornerRadius sets cornerRadius on an element.
func addCornerRadius(elem map[string]interface{}, r float64) {
	elem["cornerRadius"] = r
}

// addStroke sets stroke properties on an element.
func addStroke(elem map[string]interface{}, color string, width float64) {
	elem["stroke"] = color
	elem["strokeWidth"] = width
}

// addPathIcon creates a path element for a resolved icon.
func addPathIcon(name string, x, y, size float64, color, parentID string, icons map[string]string) map[string]interface{} {
	elem := makeElement("path", name+"-icon", x, y, size, size, parentID)
	lower := strings.ToLower(strings.TrimSpace(name))
	if pd, ok := icons[lower]; ok && pd != "" {
		elem["pathData"] = pd
		elem["stroke"] = color
	}
	return elem
}

// --- Tool Registration ---

func init() {
	category := &ToolCategory{
		Name:        "ui_templates",
		Description: "Pre-built parameterized UI component templates that stamp down complete patterns in one tool call",
		Tools: []providers.Tool{
			MakeTool("place_template",
				`Place a pre-built UI component template on the canvas. Stamps down a complete pattern (sidebar, navbar, card, hero, tab_bar, stat_card) with all elements, icons resolved internally. Returns the same create_screen action as create_ui_screen — zero frontend changes needed.

Templates:
- sidebar (260×812): Navigation sidebar with brand header, icon+label menu items, active states, badges
- navbar (1440×64): Horizontal nav bar with logo, nav links, CTA button
- card (340×400): Content card with image area, title, body text, action button
- hero (1440×600): Hero section with large heading, subtitle, two CTA buttons, background image
- tab_bar (375×83): Mobile bottom tab bar with icon+label tabs, active indicator
- stat_card (280×160): Metric display with large number, label, trend indicator`,
				map[string]providers.Property{
					"template_name":    {Type: "string", Description: "Template to place: 'sidebar', 'navbar', 'card', 'hero', 'tab_bar', 'stat_card'", Enum: []string{"sidebar", "navbar", "card", "hero", "tab_bar", "stat_card"}},
					"items":            {Type: "array", Description: "Menu/nav/tab items array. Each: {label, icon, is_active?, badge?}. For sidebar, navbar, tab_bar."},
					"brand_name":       {Type: "string", Description: "Brand/logo text for sidebar and navbar"},
					"title":            {Type: "string", Description: "Main title text for card, hero"},
					"subtitle":         {Type: "string", Description: "Subtitle text for card, hero"},
					"body_text":        {Type: "string", Description: "Body paragraph text for card"},
					"cta_text":         {Type: "string", Description: "Primary CTA button label"},
					"cta_secondary_text": {Type: "string", Description: "Secondary CTA button label (hero)"},
					"metric_value":     {Type: "string", Description: "Large metric number for stat_card (e.g. '2,847')"},
					"metric_label":     {Type: "string", Description: "Metric description label for stat_card (e.g. 'Total Users')"},
					"metric_trend":     {Type: "string", Description: "Trend text for stat_card (e.g. '+12.5%')"},
					"image_query":      {Type: "string", Description: "Unsplash search query for card/hero background image"},
					"width":            {Type: "number", Description: "Override default template width"},
					"height":           {Type: "number", Description: "Override default template height"},
					"x":                {Type: "number", Description: "Canvas X position (auto-positioned if omitted)"},
					"y":                {Type: "number", Description: "Canvas Y position (auto-positioned if omitted)"},
					"design_name":      {Type: "string", Description: "Design scope name"},
					"theme":            {Type: "object", Description: "Color overrides: {bg_primary, bg_secondary, text_primary, text_secondary, accent, accent_text, border, icon_color, active_bg, active_text}"},
				}, []string{"template_name"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)
	DefaultRegistry.RegisterExecutor("place_template", executePlaceTemplate)
}

// --- Executor ---

func executePlaceTemplate(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	templateName, _ := args["template_name"].(string)
	templateName = strings.ToLower(strings.TrimSpace(templateName))
	if templateName == "" {
		return ToolResult{Content: "ERROR: template_name is required", IsError: true}
	}

	// Parse common params
	items := parseTemplateItems(args["items"])
	brandName, _ := args["brand_name"].(string)
	title, _ := args["title"].(string)
	subtitle, _ := args["subtitle"].(string)
	bodyText, _ := args["body_text"].(string)
	ctaText, _ := args["cta_text"].(string)
	ctaSecondaryText, _ := args["cta_secondary_text"].(string)
	metricValue, _ := args["metric_value"].(string)
	metricLabel, _ := args["metric_label"].(string)
	metricTrend, _ := args["metric_trend"].(string)
	imageQuery, _ := args["image_query"].(string)

	x, _ := args["x"].(float64)
	y, _ := args["y"].(float64)
	width, _ := args["width"].(float64)
	height, _ := args["height"].(float64)

	// Theme
	theme := defaultTheme()
	if themeArg, ok := args["theme"].(map[string]interface{}); ok {
		theme = mergeTheme(theme, themeArg)
	}

	// Template params bundle
	p := templateParams{
		Items:            items,
		BrandName:        brandName,
		Title:            title,
		Subtitle:         subtitle,
		BodyText:         bodyText,
		CTAText:          ctaText,
		CTASecondaryText: ctaSecondaryText,
		MetricValue:      metricValue,
		MetricLabel:      metricLabel,
		MetricTrend:      metricTrend,
		ImageQuery:       imageQuery,
		Theme:            theme,
	}

	// Dispatch to generator
	var elements []map[string]interface{}
	var defaultW, defaultH float64
	var screenName string

	switch templateName {
	case "sidebar":
		defaultW, defaultH = 260, 812
		screenName = "Sidebar"
		elements = generateSidebar(p)
	case "navbar":
		defaultW, defaultH = 1440, 64
		screenName = "Navbar"
		elements = generateNavbar(p)
	case "card":
		defaultW, defaultH = 340, 400
		screenName = "Card"
		elements = generateCard(p)
	case "hero":
		defaultW, defaultH = 1440, 600
		screenName = "Hero"
		elements = generateHero(p)
	case "tab_bar":
		defaultW, defaultH = 375, 83
		screenName = "Tab Bar"
		elements = generateTabBar(p)
	case "stat_card":
		defaultW, defaultH = 280, 160
		screenName = "Stat Card"
		elements = generateStatCard(p)
	default:
		return ToolResult{
			Content: fmt.Sprintf("ERROR: unknown template_name '%s'. Valid: sidebar, navbar, card, hero, tab_bar, stat_card", templateName),
			IsError: true,
		}
	}

	// Apply dimension overrides
	if width == 0 {
		width = defaultW
	}
	if height == 0 {
		height = defaultH
	}
	if x == 0 {
		x = 100
	}
	if y == 0 {
		y = 100
	}

	// Auto-position to avoid overlap
	designScope := resolveDesignScope(args, ctx)
	existingScreens := getExistingScreens(ctx, designScope)
	x, y = findNonOverlappingPosition(x, y, width, height, existingScreens)

	// Build screen container
	screenID := makeID()
	screen := map[string]interface{}{
		"id":          screenID,
		"type":        "screen",
		"name":        screenName,
		"x":           x,
		"y":           y,
		"width":       width,
		"height":      height,
		"fill":        theme.BgPrimary,
		"stroke":      "#d1d5db",
		"strokeWidth": 1,
		"visible":     true,
		"locked":      false,
		"opacity":     1,
		"blendMode":   "normal",
	}

	// Assign parentId to all child elements
	allElements := make([]map[string]interface{}, 0, len(elements)+1)
	allElements = append(allElements, screen)
	for _, elem := range elements {
		elem["parentId"] = screenID
		allElements = append(allElements, elem)
	}

	respJSON, _ := json.Marshal(map[string]interface{}{
		"action":   "create_screen",
		"screen":   screen,
		"elements": allElements,
		"success":  true,
		"message": fmt.Sprintf(
			"Successfully placed '%s' template as screen '%s' with %d elements at (%v, %v). Screen ID: %s.",
			templateName, screenName, len(elements), x, y, screenID,
		),
	})
	return ToolResult{Content: string(respJSON)}
}

// templateParams bundles all possible template parameters.
type templateParams struct {
	Items            []TemplateItem
	BrandName        string
	Title            string
	Subtitle         string
	BodyText         string
	CTAText          string
	CTASecondaryText string
	MetricValue      string
	MetricLabel      string
	MetricTrend      string
	ImageQuery       string
	Theme            TemplateTheme
}

// --- Template Generators ---

// generateSidebar creates a vertical sidebar with brand header, divider, and icon+label menu items.
func generateSidebar(p templateParams) []map[string]interface{} {
	t := p.Theme
	if p.BrandName == "" {
		p.BrandName = "Brand"
	}
	if len(p.Items) == 0 {
		p.Items = []TemplateItem{
			{Label: "Home", Icon: "home", IsActive: true},
			{Label: "Dashboard", Icon: "layers"},
			{Label: "Users", Icon: "users"},
			{Label: "Settings", Icon: "settings"},
		}
	}

	// Collect and resolve icons
	iconNames := collectIconNames(p.Items)
	icons := batchResolveIcons(iconNames)

	var elements []map[string]interface{}
	sidebarW := 260.0

	// Background
	bg := makeElement("rectangle", "sidebar-bg", 0, 0, sidebarW, 812, "")
	addFill(bg, t.BgSecondary)
	elements = append(elements, bg)

	// Brand header
	brandText := makeElement("text", "brand-name", 20, 20, sidebarW-40, 32, "")
	addText(brandText, p.BrandName, 20, "bold", t.TextPrimary, "left")
	elements = append(elements, brandText)

	// Divider
	divider := makeElement("rectangle", "header-divider", 16, 64, sidebarW-32, 1, "")
	addFill(divider, t.Border)
	elements = append(elements, divider)

	// Menu items
	itemY := 80.0
	itemH := 44.0
	for _, item := range p.Items {
		// Row background (visible only if active)
		rowBg := makeElement("rectangle", item.Label+"-row", 8, itemY, sidebarW-16, itemH, "")
		addCornerRadius(rowBg, 8)
		if item.IsActive {
			addFill(rowBg, t.ActiveBg)
		} else {
			addFill(rowBg, "transparent")
		}
		elements = append(elements, rowBg)

		// Icon
		iconColor := t.IconColor
		if item.IsActive {
			iconColor = t.ActiveText
		}
		if item.Icon != "" {
			icon := addPathIcon(item.Icon, 20, itemY+10, 24, iconColor, "", icons)
			elements = append(elements, icon)
		}

		// Label
		labelColor := t.TextSecondary
		labelWeight := "normal"
		if item.IsActive {
			labelColor = t.ActiveText
			labelWeight = "600"
		}
		label := makeElement("text", item.Label+"-label", 52, itemY+10, sidebarW-80, 24, "")
		addText(label, item.Label, 14, labelWeight, labelColor, "left")
		elements = append(elements, label)

		// Badge
		if item.Badge != "" {
			badgeBg := makeElement("rectangle", item.Label+"-badge-bg", sidebarW-52, itemY+10, 32, 24, "")
			addFill(badgeBg, t.Accent)
			addCornerRadius(badgeBg, 12)
			elements = append(elements, badgeBg)

			badgeText := makeElement("text", item.Label+"-badge", sidebarW-52, itemY+12, 32, 20, "")
			addText(badgeText, item.Badge, 12, "600", t.AccentText, "center")
			elements = append(elements, badgeText)
		}

		itemY += itemH + 4
	}

	return elements
}

// generateNavbar creates a horizontal navigation bar with logo, nav links, and CTA button.
func generateNavbar(p templateParams) []map[string]interface{} {
	t := p.Theme
	if p.BrandName == "" {
		p.BrandName = "Brand"
	}
	if p.CTAText == "" {
		p.CTAText = "Get Started"
	}
	if len(p.Items) == 0 {
		p.Items = []TemplateItem{
			{Label: "Home", IsActive: true},
			{Label: "Features"},
			{Label: "Pricing"},
			{Label: "About"},
		}
	}

	navW := 1440.0
	navH := 64.0

	var elements []map[string]interface{}

	// Background
	bg := makeElement("rectangle", "navbar-bg", 0, 0, navW, navH, "")
	addFill(bg, t.BgPrimary)
	addStroke(bg, t.Border, 1)
	elements = append(elements, bg)

	// Brand / logo text
	brand := makeElement("text", "navbar-brand", 40, 18, 160, 28, "")
	addText(brand, p.BrandName, 20, "bold", t.TextPrimary, "left")
	elements = append(elements, brand)

	// Nav links — centered
	linkStartX := (navW - float64(len(p.Items))*100) / 2
	for i, item := range p.Items {
		lx := linkStartX + float64(i)*100
		color := t.TextSecondary
		weight := "normal"
		if item.IsActive {
			color = t.TextPrimary
			weight = "600"
		}
		link := makeElement("text", item.Label+"-link", lx, 22, 80, 20, "")
		addText(link, item.Label, 14, weight, color, "center")
		elements = append(elements, link)

		// Active underline
		if item.IsActive {
			underline := makeElement("rectangle", item.Label+"-active", lx+10, 56, 60, 3, "")
			addFill(underline, t.Accent)
			addCornerRadius(underline, 2)
			elements = append(elements, underline)
		}
	}

	// CTA button
	ctaW := float64(len(p.CTAText)*8 + 32)
	if ctaW < 100 {
		ctaW = 100
	}
	ctaBg := makeElement("rectangle", "cta-bg", navW-40-ctaW, 14, ctaW, 36, "")
	addFill(ctaBg, t.Accent)
	addCornerRadius(ctaBg, 8)
	elements = append(elements, ctaBg)

	ctaLabel := makeElement("text", "cta-text", navW-40-ctaW, 20, ctaW, 24, "")
	addText(ctaLabel, p.CTAText, 14, "600", t.AccentText, "center")
	elements = append(elements, ctaLabel)

	return elements
}

// generateCard creates a content card with image area, title, body text, and action button.
func generateCard(p templateParams) []map[string]interface{} {
	t := p.Theme
	if p.Title == "" {
		p.Title = "Card Title"
	}
	if p.BodyText == "" {
		p.BodyText = "Card description text goes here. Add details about the content."
	}
	if p.CTAText == "" {
		p.CTAText = "Learn More"
	}

	cardW := 340.0
	imgH := 200.0

	var elements []map[string]interface{}

	// Card background
	bg := makeElement("rectangle", "card-bg", 0, 0, cardW, 400, "")
	addFill(bg, t.BgPrimary)
	addCornerRadius(bg, 16)
	addStroke(bg, t.Border, 1)
	elements = append(elements, bg)

	// Image area
	imgBg := makeElement("rectangle", "card-image-area", 0, 0, cardW, imgH, "")
	addFill(imgBg, t.BgSecondary)
	addCornerRadius(imgBg, 16)
	elements = append(elements, imgBg)

	// If image_query provided, add an image element
	if p.ImageQuery != "" {
		imgURL := searchUnsplashForTemplate(p.ImageQuery)
		if imgURL != "" {
			img := makeElement("image", "card-image", 0, 0, cardW, imgH, "")
			img["imageUrl"] = imgURL
			img["objectFit"] = "cover"
			addCornerRadius(img, 16)
			elements = append(elements, img)
		}
	}

	// Title
	titleElem := makeElement("text", "card-title", 20, imgH+20, cardW-40, 28, "")
	addText(titleElem, p.Title, 20, "bold", t.TextPrimary, "left")
	elements = append(elements, titleElem)

	// Subtitle
	if p.Subtitle != "" {
		subElem := makeElement("text", "card-subtitle", 20, imgH+52, cardW-40, 20, "")
		addText(subElem, p.Subtitle, 13, "normal", t.TextSecondary, "left")
		elements = append(elements, subElem)
	}

	// Body text
	bodyY := imgH + 56
	if p.Subtitle != "" {
		bodyY = imgH + 76
	}
	bodyElem := makeElement("text", "card-body", 20, bodyY, cardW-40, 48, "")
	addText(bodyElem, p.BodyText, 14, "normal", t.TextSecondary, "left")
	elements = append(elements, bodyElem)

	// CTA button
	btnY := 400.0 - 60
	ctaW := cardW - 40
	btnBg := makeElement("rectangle", "card-cta-bg", 20, btnY, ctaW, 44, "")
	addFill(btnBg, t.Accent)
	addCornerRadius(btnBg, 10)
	elements = append(elements, btnBg)

	btnLabel := makeElement("text", "card-cta-text", 20, btnY+10, ctaW, 24, "")
	addText(btnLabel, p.CTAText, 14, "600", t.AccentText, "center")
	elements = append(elements, btnLabel)

	return elements
}

// generateHero creates a hero section with heading, subtitle, two CTA buttons, and optional bg image.
func generateHero(p templateParams) []map[string]interface{} {
	t := p.Theme
	if p.Title == "" {
		p.Title = "Build Something Amazing"
	}
	if p.Subtitle == "" {
		p.Subtitle = "The fastest way to turn your ideas into reality."
	}
	if p.CTAText == "" {
		p.CTAText = "Get Started"
	}
	if p.CTASecondaryText == "" {
		p.CTASecondaryText = "Learn More"
	}

	heroW := 1440.0
	heroH := 600.0

	var elements []map[string]interface{}

	// Background
	bg := makeElement("rectangle", "hero-bg", 0, 0, heroW, heroH, "")
	addFill(bg, t.BgSecondary)
	elements = append(elements, bg)

	// Optional background image
	if p.ImageQuery != "" {
		imgURL := searchUnsplashForTemplate(p.ImageQuery)
		if imgURL != "" {
			img := makeElement("image", "hero-bg-image", 0, 0, heroW, heroH, "")
			img["imageUrl"] = imgURL
			img["objectFit"] = "cover"
			img["opacity"] = 0.3
			elements = append(elements, img)
		}
	}

	// Center content vertically
	contentY := (heroH - 220) / 2

	// Heading
	heading := makeElement("text", "hero-heading", heroW*0.15, contentY, heroW*0.7, 60, "")
	addText(heading, p.Title, 48, "bold", t.TextPrimary, "center")
	elements = append(elements, heading)

	// Subtitle
	sub := makeElement("text", "hero-subtitle", heroW*0.2, contentY+80, heroW*0.6, 32, "")
	addText(sub, p.Subtitle, 20, "normal", t.TextSecondary, "center")
	elements = append(elements, sub)

	// CTA buttons row
	btnY := contentY + 150
	primaryW := float64(len(p.CTAText)*9 + 48)
	if primaryW < 140 {
		primaryW = 140
	}
	secondaryW := float64(len(p.CTASecondaryText)*9 + 48)
	if secondaryW < 140 {
		secondaryW = 140
	}
	gap := 16.0
	totalBtnW := primaryW + gap + secondaryW
	btnStartX := (heroW - totalBtnW) / 2

	// Primary CTA
	primaryBg := makeElement("rectangle", "hero-primary-cta-bg", btnStartX, btnY, primaryW, 52, "")
	addFill(primaryBg, t.Accent)
	addCornerRadius(primaryBg, 10)
	elements = append(elements, primaryBg)

	primaryLabel := makeElement("text", "hero-primary-cta-text", btnStartX, btnY+14, primaryW, 24, "")
	addText(primaryLabel, p.CTAText, 16, "600", t.AccentText, "center")
	elements = append(elements, primaryLabel)

	// Secondary CTA
	secondaryBg := makeElement("rectangle", "hero-secondary-cta-bg", btnStartX+primaryW+gap, btnY, secondaryW, 52, "")
	addFill(secondaryBg, "transparent")
	addStroke(secondaryBg, t.Accent, 2)
	addCornerRadius(secondaryBg, 10)
	elements = append(elements, secondaryBg)

	secondaryLabel := makeElement("text", "hero-secondary-cta-text", btnStartX+primaryW+gap, btnY+14, secondaryW, 24, "")
	addText(secondaryLabel, p.CTASecondaryText, 16, "600", t.Accent, "center")
	elements = append(elements, secondaryLabel)

	return elements
}

// generateTabBar creates a mobile bottom tab bar with icon+label tabs and active indicator.
func generateTabBar(p templateParams) []map[string]interface{} {
	t := p.Theme
	if len(p.Items) == 0 {
		p.Items = []TemplateItem{
			{Label: "Home", Icon: "home", IsActive: true},
			{Label: "Search", Icon: "search"},
			{Label: "Favorites", Icon: "heart"},
			{Label: "Profile", Icon: "user"},
		}
	}

	tabW := 375.0
	tabH := 83.0

	// Resolve icons
	iconNames := collectIconNames(p.Items)
	icons := batchResolveIcons(iconNames)

	var elements []map[string]interface{}

	// Background
	bg := makeElement("rectangle", "tabbar-bg", 0, 0, tabW, tabH, "")
	addFill(bg, t.BgPrimary)
	addStroke(bg, t.Border, 1)
	elements = append(elements, bg)

	// Tabs — evenly distributed
	n := len(p.Items)
	if n == 0 {
		return elements
	}
	tabItemW := tabW / float64(n)

	for i, item := range p.Items {
		cx := float64(i)*tabItemW + tabItemW/2 // center x of this tab

		iconColor := t.IconColor
		labelColor := t.TextSecondary
		if item.IsActive {
			iconColor = t.Accent
			labelColor = t.Accent
		}

		// Active indicator dot
		if item.IsActive {
			dot := makeElement("rectangle", item.Label+"-indicator", cx-12, 6, 24, 3, "")
			addFill(dot, t.Accent)
			addCornerRadius(dot, 2)
			elements = append(elements, dot)
		}

		// Icon
		if item.Icon != "" {
			icon := addPathIcon(item.Icon, cx-12, 16, 24, iconColor, "", icons)
			elements = append(elements, icon)
		}

		// Label
		label := makeElement("text", item.Label+"-label", cx-tabItemW/2, 46, tabItemW, 16, "")
		addText(label, item.Label, 11, "normal", labelColor, "center")
		elements = append(elements, label)
	}

	// Home indicator bar (iOS style)
	homeBar := makeElement("rectangle", "home-indicator", (tabW-134)/2, tabH-8, 134, 5, "")
	addFill(homeBar, t.TextPrimary)
	addCornerRadius(homeBar, 3)
	homeBar["opacity"] = 0.2
	elements = append(elements, homeBar)

	return elements
}

// generateStatCard creates a metric display card with large number, label, and trend indicator.
func generateStatCard(p templateParams) []map[string]interface{} {
	t := p.Theme
	if p.MetricValue == "" {
		p.MetricValue = "2,847"
	}
	if p.MetricLabel == "" {
		p.MetricLabel = "Total Users"
	}
	if p.MetricTrend == "" {
		p.MetricTrend = "+12.5%"
	}

	cardW := 280.0
	cardH := 160.0

	// Determine trend direction for icon
	trendUp := strings.HasPrefix(p.MetricTrend, "+")
	trendIconName := "arrow-up"
	trendColor := "#16a34a" // green
	if !trendUp {
		trendIconName = "arrow-down"
		trendColor = "#dc2626" // red
	}

	icons := batchResolveIcons([]string{trendIconName})

	var elements []map[string]interface{}

	// Card background
	bg := makeElement("rectangle", "stat-card-bg", 0, 0, cardW, cardH, "")
	addFill(bg, t.BgPrimary)
	addCornerRadius(bg, 12)
	addStroke(bg, t.Border, 1)
	elements = append(elements, bg)

	// Metric label (top)
	label := makeElement("text", "stat-label", 24, 24, cardW-48, 20, "")
	addText(label, p.MetricLabel, 14, "normal", t.TextSecondary, "left")
	elements = append(elements, label)

	// Large metric value
	value := makeElement("text", "stat-value", 24, 52, cardW-48, 44, "")
	addText(value, p.MetricValue, 36, "bold", t.TextPrimary, "left")
	elements = append(elements, value)

	// Trend row: icon + percentage
	trendIcon := addPathIcon(trendIconName, 24, 112, 18, trendColor, "", icons)
	elements = append(elements, trendIcon)

	trendText := makeElement("text", "stat-trend", 48, 112, 100, 20, "")
	addText(trendText, p.MetricTrend, 14, "600", trendColor, "left")
	elements = append(elements, trendText)

	trendDesc := makeElement("text", "stat-trend-desc", 120, 112, cardW-144, 20, "")
	addText(trendDesc, "vs last month", 12, "normal", t.TextSecondary, "left")
	elements = append(elements, trendDesc)

	return elements
}

// searchUnsplashForTemplate does a quick Unsplash search and returns the first image URL, or "".
// Reuses the existing Unsplash API key from ui.go.
func searchUnsplashForTemplate(query string) string {
	if query == "" {
		return ""
	}
	searchURL := fmt.Sprintf("https://api.unsplash.com/search/photos?query=%s&per_page=1&orientation=landscape",
		strings.ReplaceAll(query, " ", "+"))
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Client-ID "+unsplashAccessKey)
	resp, err := sharedUIHTTPClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return ""
	}
	defer resp.Body.Close()
	var result struct {
		Results []struct {
			URLs struct {
				Regular string `json:"regular"`
			} `json:"urls"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Results) == 0 {
		return ""
	}
	return result.Results[0].URLs.Regular
}
