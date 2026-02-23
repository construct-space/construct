package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"construct-context/svc"
)

// HandleSystemContextAgent handles system, context, and agent mode requests.
func HandleSystemContextAgent(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "system.ping":
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"pong":      true,
			"timestamp": time.Now().UnixMilli(),
		}}

	case "system.info":
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"version":  "2.0.0",
			"platform": "darwin",
			"arch":     "arm64",
			"zai":      false,
		}}

	// Context operations
	case "context.get":
		s.Mu.RLock()
		ctx := s.AppCtx
		s.Mu.RUnlock()
		return svc.Response{ID: req.ID, Success: true, Data: ctx}

	case "context.set_mode":
		var payload struct {
			Mode string `json:"mode"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.AppCtx.Mode = svc.Mode(payload.Mode)
		s.AppCtx.Timestamp = time.Now().Format(time.RFC3339)
		ctx := s.AppCtx
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SaveContext(&ctx)
		}
		s.BroadcastContextChange()
		return svc.Response{ID: req.ID, Success: true}

	case "context.set_component":
		var component svc.ComponentContext
		if err := json.Unmarshal(req.Payload, &component); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.AppCtx.Component = &component
		s.AppCtx.Timestamp = time.Now().Format(time.RFC3339)
		ctx := s.AppCtx
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SaveContext(&ctx)
		}
		s.BroadcastContextChange()
		return svc.Response{ID: req.ID, Success: true}

	case "context.set_project":
		var project svc.ProjectContext
		if err := json.Unmarshal(req.Payload, &project); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.AppCtx.Project = &project
		s.AppCtx.Timestamp = time.Now().Format(time.RFC3339)
		ctx := s.AppCtx
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SaveContext(&ctx)
		}
		s.BroadcastContextChange()
		return svc.Response{ID: req.ID, Success: true}

	case "context.set_selection":
		var selection svc.SelectionContext
		if err := json.Unmarshal(req.Payload, &selection); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		s.AppCtx.Selection = &selection
		s.AppCtx.Timestamp = time.Now().Format(time.RFC3339)
		ctx := s.AppCtx
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SaveContext(&ctx)
		}
		s.BroadcastContextChange()
		return svc.Response{ID: req.ID, Success: true}

	// Agent mode operations
	case "agent.get_mode":
		s.Mu.RLock()
		mode := s.AgentMode
		s.Mu.RUnlock()
		config, _ := svc.GetAgentModeConfig(mode)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"mode":   mode,
			"config": config,
		}}

	case "agent.set_mode":
		var payload struct {
			Mode string `json:"mode"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		mode, ok := svc.ValidateAgentMode(payload.Mode)
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("unknown agent mode: %s", payload.Mode)}
		}
		s.Mu.Lock()
		s.AgentMode = mode
		s.Mu.Unlock()
		config, _ := svc.GetAgentModeConfig(mode)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"mode":   mode,
			"config": config,
		}}

	case "agent.list_modes":
		modes := svc.GetAllAgentModes()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"modes": modes,
		}}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
