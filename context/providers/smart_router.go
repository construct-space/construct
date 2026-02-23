package providers

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// ModelTier represents the cost/capability tier
type ModelTier string

const (
	TierFree     ModelTier = "free"     // Free models, good for trivial tasks
	TierBudget   ModelTier = "budget"   // Cheap, fast, simple tasks
	TierBalanced ModelTier = "balanced" // Good quality/cost ratio
	TierPremium  ModelTier = "premium"  // Best quality, complex reasoning
	TierVision   ModelTier = "vision"   // Image understanding
)

// ModelRoute represents a routed model selection
type ModelRoute struct {
	Tier       ModelTier `json:"tier"`
	Model      string    `json:"model"`      // Full model ID (provider:model)
	Reason     string    `json:"reason"`      // Why this model was selected
	HasVision  bool      `json:"hasVision"`   // Whether content has images
	Complexity string    `json:"complexity"`  // simple, moderate, complex
	Confidence float64   `json:"confidence"`  // 0.0-1.0, how confident the routing is
}

// ModelInfo describes a model's capabilities for routing decisions
type ModelInfo struct {
	ID          string    // Composite ID: "provider:model"
	Label       string    // Human-readable name
	Tier        ModelTier // Default tier
	Tags        []string  // Capability tags: vision, reasoning, coding, tools, fast, free
	Description string    // What this model excels at — fed to conductor LLM
	CostPer1M   float64   // Approximate cost per 1M tokens (input)
}

// ModelCatalog is the authoritative description of all available models.
// The conductor LLM reads these descriptions to make routing decisions.
// Keep descriptions honest and specific — the conductor needs to know
// what each model is actually good at, not marketing copy.
var ModelCatalog = map[string]ModelInfo{
	// === FREE TIER ===
	"zai:glm-4.7-flash": {
		ID: "zai:glm-4.7-flash", Label: "GLM 4.7 Flash", Tier: TierFree,
		Tags: []string{"free", "fast"},
		Description: "Free, fast Chinese model. Good for simple Q&A, translations, " +
			"casual conversation, summarization. Not great at complex code or reasoning.",
		CostPer1M: 0,
	},

	// === BUDGET TIER ===
	"deepseek:deepseek-chat": {
		ID: "deepseek:deepseek-chat", Label: "DeepSeek V3", Tier: TierBudget,
		Tags: []string{"value", "tools", "coding"},
		Description: "Very cheap general-purpose model with tool support. Good at code generation, " +
			"general Q&A, and structured tasks. Solid all-rounder for the price.",
		CostPer1M: 0.27,
	},
	"kimi:moonshot-v1-128k": {
		ID: "kimi:moonshot-v1-128k", Label: "Moonshot V1 128K", Tier: TierBudget,
		Tags: []string{"value", "long_context"},
		Description: "Budget model with massive 128K context window. Best for long document " +
			"analysis, summarizing large codebases, or processing lengthy inputs.",
		CostPer1M: 0.80,
	},
	"gemini:gemini-2.5-flash": {
		ID: "gemini:gemini-2.5-flash", Label: "Gemini 2.5 Flash", Tier: TierBudget,
		Tags: []string{"fast", "vision"},
		Description: "Fast Google model with vision support. Good for quick tasks " +
			"and image understanding. Fast responses at very low cost.",
		CostPer1M: 0.15,
	},

	// === BALANCED TIER ===
	"zai:glm-5": {
		ID: "zai:glm-5", Label: "GLM-5", Tier: TierBalanced,
		Tags: []string{"reasoning", "flagship"},
		Description: "Z.ai's flagship reasoning model. Strong at complex reasoning, math, " +
			"and analytical tasks. Good balance of capability and cost.",
		CostPer1M: 2.00,
	},
	"xai:grok-code-fast-1": {
		ID: "xai:grok-code-fast-1", Label: "Grok Code", Tier: TierBalanced,
		Tags: []string{"coding", "tools", "fast"},
		Description: "xAI's code-specialized model. Best for code generation, debugging, " +
			"refactoring, and code review. Has tool support for agentic coding.",
		CostPer1M: 1.50,
	},
	"gemini:gemini-2.5-pro": {
		ID: "gemini:gemini-2.5-pro", Label: "Gemini 2.5 Pro", Tier: TierBalanced,
		Tags: []string{"reasoning", "vision"},
		Description: "Google's strong reasoning model with vision. Good for complex analysis, " +
			"image understanding, and multi-step reasoning tasks.",
		CostPer1M: 2.50,
	},
	"anthropic-oauth:claude-haiku-4-5": {
		ID: "anthropic-oauth:claude-haiku-4-5", Label: "Claude Haiku 4.5", Tier: TierBalanced,
		Tags: []string{"fast", "tools"},
		Description: "Fast Claude model. Good for quick tool use, simple code tasks, " +
			"and conversational responses where speed matters more than depth.",
		CostPer1M: 0.80,
	},

	// === PREMIUM TIER ===
	"deepseek:deepseek-reasoner": {
		ID: "deepseek:deepseek-reasoner", Label: "DeepSeek R1", Tier: TierPremium,
		Tags: []string{"reasoning"},
		Description: "Deep reasoning model with chain-of-thought. Best for math, logic puzzles, " +
			"and problems requiring step-by-step thinking. Shows reasoning trace.",
		CostPer1M: 2.19,
	},
	"xai:grok-4-1-fast-reasoning": {
		ID: "xai:grok-4-1-fast-reasoning", Label: "Grok 4.1 Fast", Tier: TierPremium,
		Tags: []string{"vision", "reasoning", "value"},
		Description: "xAI's reasoning model with vision. Strong at complex reasoning with " +
			"image understanding. Good value for premium tier.",
		CostPer1M: 3.00,
	},
	"kimi:kimi-k2.5": {
		ID: "kimi:kimi-k2.5", Label: "Kimi K2.5", Tier: TierPremium,
		Tags: []string{"vision", "reasoning"},
		Description: "Moonshot's premium model with vision and strong reasoning. Good at " +
			"complex tasks, image analysis, and creative work.",
		CostPer1M: 3.50,
	},
	"anthropic-oauth:claude-sonnet-4-6": {
		ID: "anthropic-oauth:claude-sonnet-4-6", Label: "Claude Sonnet 4.6", Tier: TierPremium,
		Tags: []string{"balanced", "vision", "tools", "coding"},
		Description: "Anthropic's latest balanced flagship. Excellent at code, vision, tool use, " +
			"and nuanced writing. Best all-rounder for complex tasks.",
		CostPer1M: 3.00,
	},
	"anthropic-oauth:claude-sonnet-4-5": {
		ID: "anthropic-oauth:claude-sonnet-4-5", Label: "Claude Sonnet 4.5", Tier: TierPremium,
		Tags: []string{"balanced", "vision", "tools", "coding"},
		Description: "Anthropic's balanced model. Excellent at code, vision, tool use, " +
			"and nuanced writing. Great all-rounder for complex tasks.",
		CostPer1M: 3.00,
	},
	"anthropic-oauth:claude-opus-4-6": {
		ID: "anthropic-oauth:claude-opus-4-6", Label: "Claude Opus 4.6", Tier: TierPremium,
		Tags: []string{"flagship", "vision", "tools", "reasoning"},
		Description: "Most capable model available. ONLY use for genuinely complex tasks: " +
			"system architecture, deep analysis, multi-step reasoning over large contexts, " +
			"or when other models have failed. Expensive — don't waste on simple tasks.",
		CostPer1M: 15.00,
	},
}

// VisionModels lists models that support vision (image understanding)
var VisionModels = map[string]bool{
	"claude-sonnet-4-6": true,
	"claude-sonnet-4-5": true,
	"claude-opus-4-6":   true,
	"grok-4-1-fast-reasoning": true,
	"kimi-k2.5":         true,
	"gemini-2.5-flash":  true,
	"gemini-2.5-pro":    true,
	"glm-4.6v":          true,
}

// PreferredVisionModel is the default model for vision tasks (cheapest with good vision)
const PreferredVisionModel = "xai:grok-4-1-fast-reasoning"

// Simple query patterns -> Free/Budget tier
var simplePatterns = []string{
	`^(hi|hello|hey|yo|sup)[\s\!\.\?]*$`,
	`^what (is|are|was|were)\b`,
	`^how (do|does|did|can|could)\b`,
	`^explain\b`,
	`^list\b`,
	`^show me\b`,
	`^tell me\b`,
	`^define\b`,
	`^who (is|are|was|were)\b`,
	`^when (is|are|was|were|did)\b`,
	`^where (is|are|was|were)\b`,
	`^thanks`,
	`^thank you`,
}

// Action patterns -> Balanced tier (requires tool use)
var actionPatterns = []string{
	`\b(invite|add|remove|delete|create|update|assign|move|send|upload)\b`,
	`\b(set|change|rename|schedule|cancel|approve|reject|deploy|publish)\b`,
	`\b(search|find|get|fetch|list|show)\b.*(project|user|member|task|file|company)`,
	`\bas\s+(developer|admin|member|designer|manager)\b`,
}

// Code task patterns -> Balanced tier
var codePatterns = []string{
	`\b(write|create|make|build|implement|add)\b.*(code|function|class|component|module)`,
	`\bfix\b.*(bug|error|issue)`,
	`\brefactor\b`,
	`\bdebug\b`,
	`\btest\b.*(function|code|unit)`,
	`\b(typescript|javascript|python|go|rust|java)\b`,
	`\bapi\b.*(endpoint|route|call)`,
}

// Complex reasoning patterns -> Premium tier
var complexPatterns = []string{
	`\b(design|architect)\b.*(system|architecture|solution)`,
	`\banalyze\b`,
	`\baudit\b`,
	`\bcompare\b.*(and|vs)`,
	`\bevaluate\b`,
	`\boptimize\b.*(performance|algorithm)`,
	`\bsecurity\b.*(review|audit|vulnerability)`,
	`\bscale\b.*(system|infrastructure)`,
	`\bmicroservices\b`,
	`\bdistributed\b`,
}

// Vision patterns
var visionPatterns = []string{
	`\bscreenshot\b`,
	`\bimage\b`,
	`\bphoto\b`,
	`\bpicture\b`,
	`\bui\b.*(design|mockup|wireframe)`,
	`\bconvert\b.*(to|into)\b.*(code|component)`,
}

// SmartRoute analyzes a message and returns the optimal model using regex (fast path)
func SmartRoute(messages []ChatMessage, hasImages bool, availableModels []string) ModelRoute {
	return SmartRouteWithContext(messages, hasImages, availableModels, "")
}

// SmartRouteWithContext analyzes a message with space context using regex
func SmartRouteWithContext(messages []ChatMessage, hasImages bool, availableModels []string, space string) ModelRoute {
	var userMessage string
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == "user" {
			userMessage = strings.ToLower(messages[i].GetContentString())
			break
		}
	}

	route := ModelRoute{
		Tier:       TierBalanced,
		Complexity: "moderate",
		HasVision:  hasImages,
		Confidence: 0.5, // Default medium confidence
	}

	// Vision always takes priority when images are present
	if hasImages {
		route.Tier = TierVision
		route.Confidence = 0.95
		route.Reason = "Image content in message"
		route.Model = selectModel(TierVision, availableModels, "")
		return route
	}

	// Space-based routing (high confidence)
	switch strings.ToLower(space) {
	case "kanban", "calendar", "tasks":
		route.Tier = TierFree
		route.Complexity = "simple"
		route.Confidence = 0.85
		route.Reason = "Project management space"
		route.Model = selectModel(TierFree, availableModels, "")
		return route
	case "code":
		if matchesAny(userMessage, complexPatterns) {
			route.Tier = TierPremium
			route.Complexity = "complex"
			route.Confidence = 0.8
			route.Reason = "Code space — complex task"
			route.Model = selectModel(TierPremium, availableModels, "coding")
			return route
		}
		route.Tier = TierBalanced
		route.Confidence = 0.75
		route.Reason = "Code space"
		route.Model = selectModel(TierBalanced, availableModels, "coding")
		return route
	}

	// Pattern-based routing
	if matchesAny(userMessage, visionPatterns) {
		route.Tier = TierVision
		route.Confidence = 0.7
		route.Reason = "Vision-related keywords"
		route.Model = selectModel(TierVision, availableModels, "")
		return route
	}

	if matchesAny(userMessage, complexPatterns) {
		route.Tier = TierPremium
		route.Complexity = "complex"
		route.Confidence = 0.7
		route.Reason = "Complex reasoning keywords"
		route.Model = selectModel(TierPremium, availableModels, "")
		return route
	}

	if matchesAny(userMessage, codePatterns) {
		route.Tier = TierBalanced
		route.Complexity = "moderate"
		route.Confidence = 0.7
		route.Reason = "Code-related keywords"
		route.Model = selectModel(TierBalanced, availableModels, "coding")
		return route
	}

	// Action patterns — needs tool use, route to balanced (not free)
	if matchesAny(userMessage, actionPatterns) {
		route.Tier = TierBalanced
		route.Complexity = "moderate"
		route.Confidence = 0.75
		route.Reason = "Action requiring tools"
		route.Model = selectModel(TierBalanced, availableModels, "tools")
		return route
	}

	if matchesAny(userMessage, simplePatterns) {
		route.Tier = TierFree
		route.Complexity = "simple"
		route.Confidence = 0.8
		route.Reason = "Simple query"
		route.Model = selectModel(TierFree, availableModels, "")
		return route
	}

	// No strong match — low confidence, caller should use LLM routing
	route.Confidence = 0.3
	route.Reason = "No strong pattern match"
	route.Model = selectModel(TierBalanced, availableModels, "")
	return route
}

// BuildConductorPrompt creates the system prompt for LLM-based model routing.
// This is sent to a cheap/fast model (Haiku, GLM-4.7-flash) to classify the task.
func BuildConductorPrompt(availableModels []string) string {
	var sb strings.Builder
	sb.WriteString("You are a model router for Construct, an AI-powered development environment.\n")
	sb.WriteString("Your job: pick the cheapest model that can handle the task well. Don't waste expensive models on simple tasks.\n\n")
	sb.WriteString("Available models (pick ONLY from this list):\n")

	// Only include models that are actually available
	available := make(map[string]bool, len(availableModels))
	for _, m := range availableModels {
		available[m] = true
	}

	for _, info := range sortedCatalog() {
		if !available[info.ID] {
			continue
		}
		costStr := "FREE"
		if info.CostPer1M > 0 {
			costStr = fmt.Sprintf("$%.2f/1M tokens", info.CostPer1M)
		}
		tags := strings.Join(info.Tags, ", ")
		fmt.Fprintf(&sb, "\n- **%s** (%s) [%s] — %s — %s", info.ID, info.Label, costStr, tags, info.Description)
	}

	sb.WriteString("\n\nRULES:\n")
	sb.WriteString("1. Pick the CHEAPEST model that can do the job well\n")
	sb.WriteString("2. Use free/budget models for: greetings, simple Q&A, explanations, translations, summaries\n")
	sb.WriteString("3. Use balanced models for: code generation, moderate reasoning, tool-based tasks\n")
	sb.WriteString("4. Use premium models ONLY for: complex architecture, deep analysis, multi-step reasoning\n")
	sb.WriteString("5. Use claude-opus-4-6 ONLY when the task genuinely requires the best reasoning available\n")
	sb.WriteString("6. If the task involves images, pick a model with vision capability\n")
	sb.WriteString("7. If the task involves code, prefer models tagged with \"coding\"\n")
	sb.WriteString("8. If the task requires ACTIONS (invite, create, delete, update, send, etc.), pick a model with \"tools\" tag — free models can't do tool use reliably\n\n")
	sb.WriteString("Respond with ONLY valid JSON (no markdown, no explanation):\n")
	sb.WriteString(`{"model": "provider:model-id", "tier": "free|budget|balanced|premium", "complexity": "simple|moderate|complex", "reason": "brief 5-10 word reason"}`)

	return sb.String()
}

// BuildConductorUserMessage creates the user message for the conductor LLM
func BuildConductorUserMessage(userMessage string, space string, hasImages bool, messageCount int) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Route this task:\n\"%s\"", userMessage)
	if space != "" {
		fmt.Fprintf(&sb, "\nSpace: %s", space)
	}
	if hasImages {
		sb.WriteString("\nContains: images")
	}
	if messageCount > 1 {
		fmt.Fprintf(&sb, "\nConversation length: %d messages", messageCount)
	}
	return sb.String()
}

// ParseConductorResponse parses the LLM's JSON routing decision
func ParseConductorResponse(response string, availableModels []string) (ModelRoute, error) {
	// Try to extract JSON from response
	response = strings.TrimSpace(response)
	start := strings.Index(response, "{")
	end := strings.LastIndex(response, "}")
	if start >= 0 && end > start {
		response = response[start : end+1]
	}

	var result struct {
		Model      string `json:"model"`
		Tier       string `json:"tier"`
		Complexity string `json:"complexity"`
		Reason     string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(response), &result); err != nil {
		return ModelRoute{}, fmt.Errorf("failed to parse conductor response: %v", err)
	}

	// Validate the model is actually available
	modelValid := false
	for _, m := range availableModels {
		if m == result.Model {
			modelValid = true
			break
		}
	}
	if !modelValid {
		return ModelRoute{}, fmt.Errorf("conductor selected unavailable model: %s", result.Model)
	}

	route := ModelRoute{
		Tier:       ModelTier(result.Tier),
		Model:      result.Model,
		Complexity: result.Complexity,
		Reason:     result.Reason,
		Confidence: 0.9, // LLM routing is high confidence
	}

	// Check if selected model has vision
	modelName := ExtractModelName(result.Model)
	route.HasVision = VisionModels[modelName]

	return route, nil
}

// PreferredConductorModel returns the cheapest fast model to use as the conductor.
// Preference: GLM-4.7-flash (free) > Gemini Flash > DeepSeek > Haiku
func PreferredConductorModel(availableModels []string) string {
	preferences := []string{
		"zai:glm-4.7-flash",           // Free
		"gemini:gemini-2.5-flash",     // $0.15/1M
		"deepseek:deepseek-chat",       // $0.27/1M
		"anthropic-oauth:claude-haiku-4-5", // $0.80/1M
	}
	available := make(map[string]bool, len(availableModels))
	for _, m := range availableModels {
		available[m] = true
	}
	for _, pref := range preferences {
		if available[pref] {
			return pref
		}
	}
	// Fallback to first available
	if len(availableModels) > 0 {
		return availableModels[0]
	}
	return ""
}

// sortedCatalog returns the model catalog sorted by cost (cheapest first)
func sortedCatalog() []ModelInfo {
	models := make([]ModelInfo, 0, len(ModelCatalog))
	for _, m := range ModelCatalog {
		models = append(models, m)
	}
	// Simple bubble sort by cost
	for i := 0; i < len(models); i++ {
		for j := i + 1; j < len(models); j++ {
			if models[j].CostPer1M < models[i].CostPer1M {
				models[i], models[j] = models[j], models[i]
			}
		}
	}
	return models
}

// selectModel picks the best available model for a tier, optionally preferring a tag
func selectModel(tier ModelTier, availableModels []string, preferTag string) string {
	if len(availableModels) == 0 {
		return "deepseek:deepseek-chat"
	}

	available := make(map[string]bool, len(availableModels))
	for _, m := range availableModels {
		available[m] = true
	}

	// Find matching models from catalog, sorted by cost
	var matches []ModelInfo
	var tagMatches []ModelInfo
	var fallbacks []ModelInfo

	for _, info := range sortedCatalog() {
		if !available[info.ID] {
			continue
		}

		effectiveTier := info.Tier
		// Vision tier: prefer models with vision+tools (needed for agentic workflows)
		if tier == TierVision {
			if hasTag(info.Tags, "vision") {
				if hasTag(info.Tags, "tools") {
					// Vision + tools = best for design work (tagMatches = preferred)
					tagMatches = append(tagMatches, info)
				} else {
					matches = append(matches, info)
				}
			}
			continue
		}
		// Free tier: accept free and budget
		if tier == TierFree {
			if effectiveTier == TierFree || effectiveTier == TierBudget {
				if preferTag != "" && hasTag(info.Tags, preferTag) {
					tagMatches = append(tagMatches, info)
				} else {
					matches = append(matches, info)
				}
				continue
			}
		}

		if effectiveTier == tier {
			if preferTag != "" && hasTag(info.Tags, preferTag) {
				tagMatches = append(tagMatches, info)
			} else {
				matches = append(matches, info)
			}
		} else {
			// Build fallbacks: tier adjacency
			switch tier {
			case TierPremium:
				if effectiveTier == TierBalanced {
					fallbacks = append(fallbacks, info)
				}
			case TierBalanced:
				if effectiveTier == TierBudget || effectiveTier == TierFree {
					fallbacks = append(fallbacks, info)
				}
			}
		}
	}

	// Prefer tag-matched models first
	if len(tagMatches) > 0 {
		return tagMatches[0].ID
	}
	if len(matches) > 0 {
		return matches[0].ID
	}
	if len(fallbacks) > 0 {
		return fallbacks[0].ID
	}

	// For vision tier, don't fall back to non-vision models (they'll reject image content)
	if tier == TierVision {
		return "no_vision_model"
	}

	// Last resort: first available
	return availableModels[0]
}

func hasTag(tags []string, tag string) bool {
	for _, t := range tags {
		if t == tag {
			return true
		}
	}
	return false
}

// matchesAny checks if text matches any of the patterns
func matchesAny(text string, patterns []string) bool {
	for _, pattern := range patterns {
		if matched, _ := regexp.MatchString(pattern, text); matched {
			return true
		}
	}
	return false
}

// IsAutoModel checks if the model ID indicates auto-routing
func IsAutoModel(model string) bool {
	model = strings.ToLower(model)
	return model == "" || model == "auto" || model == "conductor" || model == "smart"
}
