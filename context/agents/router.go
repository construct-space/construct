package agents

import (
	"regexp"
	"strings"
)

// Router handles intent-based routing to specialized agents
type Router struct {
	patterns map[string][]*regexp.Regexp
	keywords map[string][]string
}

// NewRouter creates a new router with default patterns
func NewRouter() *Router {
	r := &Router{
		patterns: make(map[string][]*regexp.Regexp),
		keywords: make(map[string][]string),
	}
	r.initDefaultPatterns()
	return r
}

// initDefaultPatterns sets up the default routing patterns
func (r *Router) initDefaultPatterns() {
	// Code Agent patterns
	r.keywords["code"] = []string{
		"code", "implement", "write", "create function", "create class",
		"fix bug", "debug", "refactor", "add feature", "modify",
		"update code", "change code", "edit file", "create file",
		"typescript", "javascript", "python", "golang", "rust",
		"component", "api", "endpoint", "function", "method",
		"test", "unit test", "integration test",
	}
	r.patterns["code"] = compilePatterns([]string{
		`(?i)write\s+(a\s+)?code`,
		`(?i)create\s+(a\s+)?(new\s+)?(component|function|class|file)`,
		`(?i)implement\s+`,
		`(?i)fix\s+(the\s+)?bug`,
		`(?i)refactor\s+`,
		`(?i)add\s+(a\s+)?feature`,
		`(?i)(edit|modify|update)\s+(the\s+)?file`,
	})

	// Design Agent patterns
	r.keywords["design"] = []string{
		"design", "ui", "ux", "screen", "layout", "button", "form",
		"component", "style", "css", "visual", "interface", "canvas",
		"wireframe", "mockup", "prototype", "color", "theme",
		"responsive", "mobile", "desktop", "animation",
	}
	r.patterns["design"] = compilePatterns([]string{
		`(?i)design\s+(a\s+)?(new\s+)?(screen|page|component|ui)`,
		`(?i)create\s+(a\s+)?(ui|screen|layout|button|form)`,
		`(?i)add\s+(a\s+)?(button|input|form|card|modal)`,
		`(?i)(update|change|modify)\s+(the\s+)?(design|style|layout)`,
		`(?i)make\s+(it\s+)?(look|style|design)`,
	})

	// Kanban Agent patterns
	r.keywords["kanban"] = []string{
		"task", "ticket", "issue", "backlog", "sprint", "board",
		"todo", "doing", "done", "move", "assign", "priority",
		"story", "epic", "milestone", "project management",
		"kanban", "scrum", "agile",
	}
	r.patterns["kanban"] = compilePatterns([]string{
		`(?i)create\s+(a\s+)?(new\s+)?(task|ticket|issue)`,
		`(?i)add\s+(a\s+)?(task|ticket|item)\s+to`,
		`(?i)move\s+(the\s+)?(task|ticket|card)`,
		`(?i)(show|list|get)\s+(my\s+)?(tasks|tickets|backlog)`,
		`(?i)(assign|reassign)\s+(the\s+)?(task|ticket)`,
		`(?i)update\s+(the\s+)?(task|ticket)\s+(status|state)`,
	})

	// Calendar Agent patterns
	r.keywords["calendar"] = []string{
		"calendar", "event", "meeting", "schedule", "appointment",
		"remind", "reminder", "date", "time", "today", "tomorrow",
		"week", "month", "availability", "free", "busy",
	}
	r.patterns["calendar"] = compilePatterns([]string{
		`(?i)schedule\s+(a\s+)?(meeting|event|appointment)`,
		`(?i)create\s+(a\s+)?(new\s+)?(event|meeting|appointment)`,
		`(?i)add\s+(to\s+)?(my\s+)?calendar`,
		`(?i)what('s|\s+is)\s+(on\s+)?(my\s+)?(schedule|calendar)`,
		`(?i)when\s+(am\s+i|is\s+the)`,
		`(?i)(check|show)\s+(my\s+)?availability`,
		`(?i)remind\s+me`,
	})

	// Git Agent patterns
	r.keywords["git"] = []string{
		"git", "commit", "push", "pull", "branch", "merge",
		"pr", "pull request", "checkout", "diff", "status",
		"history", "log", "stash", "rebase", "conflict",
	}
	r.patterns["git"] = compilePatterns([]string{
		`(?i)git\s+(commit|push|pull|branch|merge|checkout|status|diff|log)`,
		`(?i)commit\s+(the\s+)?(changes|files)`,
		`(?i)create\s+(a\s+)?(new\s+)?branch`,
		`(?i)push\s+(to\s+)?(remote|origin|main|master)`,
		`(?i)create\s+(a\s+)?pr`,
		`(?i)pull\s+request`,
		`(?i)(show|get)\s+(the\s+)?diff`,
		`(?i)merge\s+(the\s+)?branch`,
	})

	// Media Agent patterns
	r.keywords["media"] = []string{
		"image", "photo", "picture", "generate image", "ai image",
		"resize", "crop", "convert", "thumbnail", "optimize",
		"png", "jpg", "jpeg", "webp", "svg",
	}
	r.patterns["media"] = compilePatterns([]string{
		`(?i)generate\s+(an?\s+)?image`,
		`(?i)create\s+(an?\s+)?(image|picture|photo)`,
		`(?i)(resize|crop|convert|optimize)\s+(the\s+)?image`,
		`(?i)make\s+(a\s+)?thumbnail`,
	})

	// Explorer Agent patterns
	r.keywords["explorer"] = []string{
		"explain", "how does", "what is", "where is", "find",
		"search", "look for", "understand", "describe",
		"show me", "navigate", "explore",
	}
	r.patterns["explorer"] = compilePatterns([]string{
		`(?i)explain\s+(how|what|why)`,
		`(?i)how\s+does\s+.+\s+work`,
		`(?i)what\s+(is|are)\s+`,
		`(?i)where\s+(is|are|can\s+i\s+find)`,
		`(?i)find\s+(the\s+)?(file|function|class|method)`,
		`(?i)search\s+(for|the)`,
		`(?i)show\s+me\s+(the|how)`,
	})

	// Chat Agent patterns (default/fallback)
	r.keywords["chat"] = []string{
		"help", "hi", "hello", "hey", "thanks", "thank you",
		"question", "ask", "tell me", "can you", "please",
	}
	r.patterns["chat"] = compilePatterns([]string{
		`(?i)^(hi|hello|hey)\b`,
		`(?i)^help\b`,
		`(?i)^thank`,
	})
}

// compilePatterns compiles a list of regex patterns
func compilePatterns(patterns []string) []*regexp.Regexp {
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		if re, err := regexp.Compile(p); err == nil {
			compiled = append(compiled, re)
		}
	}
	return compiled
}

// Route determines which agent should handle the prompt
func (r *Router) Route(prompt string) string {
	scores := r.GetScores(prompt)

	// Find the highest scoring agent
	bestAgent := "chat" // Default fallback
	bestScore := 0.0

	for agent, score := range scores {
		if score > bestScore {
			bestScore = score
			bestAgent = agent
		}
	}

	// Only return specialized agent if confidence is high enough
	if bestScore < 0.3 && bestAgent != "chat" {
		return "chat"
	}

	return bestAgent
}

// GetScores returns confidence scores for each agent
func (r *Router) GetScores(prompt string) map[string]float64 {
	scores := make(map[string]float64)
	promptLower := strings.ToLower(prompt)

	agents := []string{"code", "design", "kanban", "calendar", "git", "media", "explorer", "chat"}

	for _, agent := range agents {
		score := 0.0

		// Check keyword matches
		if keywords, ok := r.keywords[agent]; ok {
			for _, keyword := range keywords {
				if strings.Contains(promptLower, keyword) {
					score += 0.1
				}
			}
		}

		// Check pattern matches (weighted higher)
		if patterns, ok := r.patterns[agent]; ok {
			for _, pattern := range patterns {
				if pattern.MatchString(prompt) {
					score += 0.3
				}
			}
		}

		// Cap at 1.0
		if score > 1.0 {
			score = 1.0
		}

		scores[agent] = score
	}

	return scores
}

// GetConfidence returns the routing confidence for a specific agent
func (r *Router) GetConfidence(prompt string, agentID string) float64 {
	scores := r.GetScores(prompt)
	if score, ok := scores[agentID]; ok {
		return score
	}
	return 0.0
}

// AnalyzeIntent performs detailed intent analysis
func (r *Router) AnalyzeIntent(prompt string) *IntentAnalysis {
	scores := r.GetScores(prompt)

	// Sort agents by score
	type agentScore struct {
		agent string
		score float64
	}
	sorted := make([]agentScore, 0)
	for agent, score := range scores {
		if score > 0 {
			sorted = append(sorted, agentScore{agent, score})
		}
	}

	// Simple sort (descending)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].score > sorted[i].score {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	// Build analysis
	analysis := &IntentAnalysis{
		PrimaryAgent: "chat",
		Confidence:   0.0,
	}

	if len(sorted) > 0 {
		analysis.PrimaryAgent = sorted[0].agent
		analysis.Confidence = sorted[0].score

		// Add secondary agents
		for i := 1; i < len(sorted) && i < 3; i++ {
			if sorted[i].score > 0.2 {
				analysis.SecondaryAgents = append(analysis.SecondaryAgents, sorted[i].agent)
			}
		}
	}

	// Extract keywords that matched
	promptLower := strings.ToLower(prompt)
	if keywords, ok := r.keywords[analysis.PrimaryAgent]; ok {
		for _, keyword := range keywords {
			if strings.Contains(promptLower, keyword) {
				analysis.Keywords = append(analysis.Keywords, keyword)
			}
		}
	}

	// Build reasoning
	if len(analysis.Keywords) > 0 {
		analysis.Reasoning = "Matched keywords: " + strings.Join(analysis.Keywords, ", ")
	} else {
		analysis.Reasoning = "Default routing to chat agent"
	}

	return analysis
}

// DefaultRouter is the global router instance
var DefaultRouter = NewRouter()
