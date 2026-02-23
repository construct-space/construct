package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"construct-context/hooks"
	"construct-context/skills"
	"construct-context/svc"
)

// HandleHooksSkills handles hooks.* and skills.* requests.
func HandleHooksSkills(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "hooks.list":
		allHooks := hooks.DefaultRegistry.GetAll()
		hookList := make([]map[string]any, 0, len(allHooks))
		for _, hook := range allHooks {
			hookList = append(hookList, map[string]any{
				"id":          hook.ID,
				"name":        hook.Name,
				"type":        hook.Type,
				"priority":    hook.Priority,
				"skillId":     hook.SkillID,
				"enabled":     hook.Enabled,
				"description": hook.Description,
				"createdAt":   hook.CreatedAt,
			})
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"hooks": hookList,
		}}

	case "hooks.by_type":
		var payload struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		typeHooks := hooks.DefaultRegistry.GetByType(hooks.HookType(payload.Type))
		hookList := make([]map[string]any, 0, len(typeHooks))
		for _, hook := range typeHooks {
			hookList = append(hookList, map[string]any{
				"id":       hook.ID,
				"name":     hook.Name,
				"priority": hook.Priority,
				"skillId":  hook.SkillID,
				"enabled":  hook.Enabled,
			})
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"type":  payload.Type,
			"hooks": hookList,
		}}

	case "hooks.enable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := hooks.DefaultRegistry.Enable(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "hooks.disable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := hooks.DefaultRegistry.Disable(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "hooks.metrics":
		var payload struct {
			ID string `json:"id,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			// Allow empty payload
		}
		if payload.ID != "" {
			metrics, ok := hooks.DefaultRegistry.GetMetrics(payload.ID)
			if !ok {
				return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("hook not found: %s", payload.ID)}
			}
			return svc.Response{ID: req.ID, Success: true, Data: metrics}
		}
		allMetrics := hooks.DefaultRegistry.GetAllMetrics()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"metrics": allMetrics,
		}}

	case "hooks.stop_config":
		config := hooks.DefaultRegistry.GetStopConfig()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"runOnSuccess":    config.RunOnSuccess,
			"runOnError":      config.RunOnError,
			"runOnCancel":     config.RunOnCancel,
			"timeout":         config.Timeout.String(),
			"continueOnError": config.ContinueOnError,
		}}

	case "hooks.set_stop_config":
		var payload struct {
			RunOnSuccess    *bool `json:"runOnSuccess,omitempty"`
			RunOnError      *bool `json:"runOnError,omitempty"`
			RunOnCancel     *bool `json:"runOnCancel,omitempty"`
			TimeoutMs       *int  `json:"timeoutMs,omitempty"`
			ContinueOnError *bool `json:"continueOnError,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		config := hooks.DefaultRegistry.GetStopConfig()
		if payload.RunOnSuccess != nil {
			config.RunOnSuccess = *payload.RunOnSuccess
		}
		if payload.RunOnError != nil {
			config.RunOnError = *payload.RunOnError
		}
		if payload.RunOnCancel != nil {
			config.RunOnCancel = *payload.RunOnCancel
		}
		if payload.TimeoutMs != nil {
			config.Timeout = time.Duration(*payload.TimeoutMs) * time.Millisecond
		}
		if payload.ContinueOnError != nil {
			config.ContinueOnError = *payload.ContinueOnError
		}
		hooks.DefaultRegistry.SetStopConfig(config)
		return svc.Response{ID: req.ID, Success: true}

	// Skills API
	case "skills.list":
		allInfo := skills.DefaultRegistry.GetAllInfo()
		skillList := make([]map[string]any, 0, len(allInfo))
		for _, info := range allInfo {
			skillList = append(skillList, map[string]any{
				"id":           info.ID,
				"name":         info.Name,
				"category":     info.Category,
				"description":  info.Description,
				"version":      info.Version,
				"state":        info.State,
				"dependencies": info.Dependencies,
				"hooksCount":   info.HooksCount,
				"toolsCount":   info.ToolsCount,
				"loadedAt":     info.LoadedAt,
				"error":        info.Error,
			})
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"skills": skillList,
		}}

	case "skills.get":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		info, ok := skills.DefaultRegistry.GetInfo(payload.ID)
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("skill not found: %s", payload.ID)}
		}
		return svc.Response{ID: req.ID, Success: true, Data: info}

	case "skills.load":
		var payload struct {
			ID       string                 `json:"id"`
			Settings map[string]interface{} `json:"settings,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		config := &skills.SkillConfig{
			Enabled:     true,
			Settings:    payload.Settings,
			Permissions: skills.DefaultPermissions(),
		}
		if err := skills.DefaultLoader.LoadSkill(context.Background(), payload.ID, config); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := s.PersistActiveSkillState(); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] persist warning after load '%s': %v\n", payload.ID, err)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "skills.unload":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := skills.DefaultRegistry.Unload(context.Background(), payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := s.PersistActiveSkillState(); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] persist warning after unload '%s': %v\n", payload.ID, err)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "skills.enable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := skills.DefaultRegistry.Enable(context.Background(), payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := s.PersistActiveSkillState(); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] persist warning after enable '%s': %v\n", payload.ID, err)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "skills.disable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := skills.DefaultRegistry.Disable(context.Background(), payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := s.PersistActiveSkillState(); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] persist warning after disable '%s': %v\n", payload.ID, err)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "skills.metrics":
		var payload struct {
			ID string `json:"id,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			// Allow empty payload
		}
		if payload.ID != "" {
			metrics, ok := skills.DefaultRegistry.GetMetrics(payload.ID)
			if !ok {
				return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("skill not found: %s", payload.ID)}
			}
			return svc.Response{ID: req.ID, Success: true, Data: metrics}
		}
		allMetrics := skills.DefaultRegistry.GetAllMetrics()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"metrics": allMetrics,
		}}

	case "skills.tools":
		skillTools := skills.DefaultRegistry.GetTools()
		toolList := make([]map[string]any, 0, len(skillTools))
		for _, tool := range skillTools {
			toolList = append(toolList, map[string]any{
				"name":        tool.Function.Name,
				"description": tool.Function.Description,
			})
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"tools": toolList,
		}}

	case "skills.load_builtins":
		if err := svc.LoadBuiltinsIdempotent(context.Background()); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := s.RestorePersistedSkillState(context.Background()); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] restore warning after loading builtins: %v\n", err)
		}
		if err := s.PersistActiveSkillState(); err != nil {
			fmt.Fprintf(os.Stderr, "[skills] persist warning after loading builtins: %v\n", err)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "skills.summaries":
		summaries := skills.DefaultLoader.GetAllSummaries()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"summaries": summaries,
		}}

	case "skills.content":
		var payload struct {
			SkillID string `json:"skillId"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if payload.SkillID == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "skillId required"}
		}
		content, err := skills.DefaultLoader.GetContent(payload.SkillID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"content": content,
		}}

	case "skills.search":
		var payload struct {
			Query      string   `json:"query"`
			Categories []string `json:"categories"`
			Keywords   []string `json:"keywords"`
			HasTools   bool     `json:"hasTools"`
			HasHooks   bool     `json:"hasHooks"`
			Limit      int      `json:"limit"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		query := &skills.SkillSearchQuery{
			Query:    payload.Query,
			Keywords: payload.Keywords,
			HasTools: payload.HasTools,
			HasHooks: payload.HasHooks,
			Limit:    payload.Limit,
		}
		for _, cat := range payload.Categories {
			query.Categories = append(query.Categories, skills.SkillCategory(cat))
		}
		result := skills.DefaultLoader.Search(query)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"matches":    result.Matches,
			"totalCount": result.TotalCount,
			"query":      result.Query,
		}}

	case "skills.instructions":
		var payload struct {
			SkillID string `json:"skillId"`
		}
		_ = json.Unmarshal(req.Payload, &payload)
		if payload.SkillID == "" {
			instructions := skills.DefaultLoader.GetActiveInstructions()
			return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
				"instructions": instructions,
			}}
		}
		instructions, err := skills.DefaultLoader.GetInstructions(payload.SkillID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"instructions": instructions,
		}}

	case "skills.format_for_ai":
		var payload struct {
			SkillID string `json:"skillId"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if payload.SkillID == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "skillId required"}
		}
		formatted, err := skills.DefaultLoader.FormatForAI(payload.SkillID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]interface{}{
			"formatted": formatted,
		}}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
