package prompts

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed vision/*.md
var visionPrompts embed.FS

// ValidVisionLevels lists accepted detail levels
var ValidVisionLevels = []string{"quick", "balanced", "detailed"}

// GetVisionPrompt returns the vision system prompt for the given detail level.
// Falls back to "balanced" if level is unknown.
func GetVisionPrompt(level string) string {
	level = strings.ToLower(strings.TrimSpace(level))

	// Validate level, fall back to balanced
	switch level {
	case "quick", "balanced", "detailed":
		// valid
	default:
		level = "balanced"
	}

	data, err := visionPrompts.ReadFile(fmt.Sprintf("vision/%s.md", level))
	if err != nil {
		// Fallback to balanced if file read fails
		data, err = visionPrompts.ReadFile("vision/balanced.md")
		if err != nil {
			return "You are a design analyst. Analyze the image and output JSON with screen and elements fields."
		}
	}

	return string(data)
}

// GetVisionUserHint returns the user-message text hint based on detail level.
// This tells the model how many elements to target.
func GetVisionUserHint(level string) string {
	level = strings.ToLower(strings.TrimSpace(level))
	switch level {
	case "quick":
		return "Output JSON. 15-20 elements max. Major layout blocks only. Start with {"
	case "detailed":
		return "Output JSON. 40-60 elements. Include shadows, gradients, all text, icons. Start with {"
	default:
		return "Output JSON. 25-40 elements. All sections + text + icon placeholders. Start with {"
	}
}
