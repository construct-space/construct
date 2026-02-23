package svc

import (
	"fmt"
	"strings"
)

// BuildSystemPrompt creates a context-aware system prompt
func (s *Service) BuildSystemPrompt() string {
	var identity string
	if s.MatrixMode {
		identity = `I am Morpheus. Welcome to the Construct.

If explicitly asked "who are you": "I am Morpheus."
If explicitly asked "what model are you": "I am Morpheus."
Do NOT use identity responses for project/company/task/design requests (e.g. "status of CONSTRUCT"). Resolve the entity instead.

I help you build in this digital world. Be direct and helpful.`
	} else {
		identity = `I am Construct, your development assistant.

If explicitly asked "who are you": "I am Construct."
If explicitly asked "what model are you": "I am Construct."
Do NOT use identity responses for project/company/task/design requests (e.g. "status of CONSTRUCT"). Resolve the entity instead.

I help you build software. Be direct and helpful.`
	}
	parts := []string{identity}

	switch s.AppCtx.Mode {
	case ModeCode:
		parts = append(parts, "Focus: code development.")
	case ModeDesign:
		parts = append(parts, "Focus: UI/UX design.")
	}

	if s.AppCtx.Project != nil {
		parts = append(parts, fmt.Sprintf("Project: %s (%s, %s)",
			s.AppCtx.Project.Name, s.AppCtx.Project.Type, s.AppCtx.Project.Framework))
	}

	if s.AppCtx.Component != nil {
		parts = append(parts, fmt.Sprintf("Editing: %s (%s)",
			s.AppCtx.Component.Name, s.AppCtx.Component.Type))
	}

	if s.AppCtx.Selection != nil && s.AppCtx.Selection.Content != "" {
		parts = append(parts, fmt.Sprintf("Selected: %s", s.AppCtx.Selection.Content))
	}

	return strings.Join(parts, "\n")
}
