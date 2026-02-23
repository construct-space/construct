package handlers

import (
	"encoding/json"
	"fmt"

	"construct-context/agents"
	"construct-context/mcp"
	"construct-context/svc"
)

// HandleAgentsMCP handles agents.* and mcp.* requests.
func HandleAgentsMCP(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "agents.list":
		agentConfigs := agents.DefaultRegistry.GetAll()
		agentList := make([]map[string]any, 0, len(agentConfigs))
		for _, config := range agentConfigs {
			agentList = append(agentList, map[string]any{
				"id":           config.ID,
				"name":         config.Name,
				"category":     config.Category,
				"description":  config.Description,
				"allowedTools": config.AllowedTools,
				"blockedTools": config.BlockedTools,
			})
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"agents": agentList,
		}}

	case "agents.get":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		config, ok := agents.DefaultRegistry.Get(payload.ID)
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("agent not found: %s", payload.ID)}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"id":              config.ID,
			"name":            config.Name,
			"category":        config.Category,
			"description":     config.Description,
			"systemPrompt":    config.SystemPrompt,
			"allowedTools":    config.AllowedTools,
			"blockedTools":    config.BlockedTools,
			"canInvokeAgents": config.CanInvokeAgents,
			"maxIterations":   config.GetMaxIterations(),
		}}

	case "agents.analyze":
		var payload struct {
			Prompt string `json:"prompt"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		analysis := agents.DefaultRouter.AnalyzeIntent(payload.Prompt)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"primary_agent":    analysis.PrimaryAgent,
			"secondary_agents": analysis.SecondaryAgents,
			"reasoning":        analysis.Reasoning,
			"confidence":       analysis.Confidence,
			"keywords":         analysis.Keywords,
		}}

	case "agents.dispatch":
		var payload struct {
			AgentID   string                 `json:"agent_id"`
			Task      string                 `json:"task"`
			Context   map[string]interface{} `json:"context,omitempty"`
			SessionID string                 `json:"session_id,omitempty"`
			Model     string                 `json:"model,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		conductor := agents.NewConductor(agents.DefaultRegistry, agents.DefaultRouter, s.Providers.Default())

		dispatchReq := &agents.DispatchRequest{
			AgentID:   payload.AgentID,
			Task:      payload.Task,
			Context:   payload.Context,
			SessionID: payload.SessionID,
			Model:     payload.Model,
		}

		resp, err := conductor.Dispatch(dispatchReq)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		if resp.Error != "" {
			return svc.Response{ID: req.ID, Success: false, Error: resp.Error}
		}

		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"session_id": resp.SessionID,
			"agent_id":   resp.AgentID,
			"result":     resp.Result,
		}}

	case "agents.session":
		var payload struct {
			SessionID string `json:"session_id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		session, ok := agents.DefaultRegistry.GetSession(payload.SessionID)
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("session not found: %s", payload.SessionID)}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"id":         session.ID,
			"agent_id":   session.AgentID,
			"parent_id":  session.ParentID,
			"state":      session.State,
			"start_time": session.StartTime,
			"end_time":   session.EndTime,
			"tokens":     session.TokensUsed,
			"iterations": session.Iterations,
			"error":      session.Error,
		}}

	case "agents.metrics":
		var payload struct {
			AgentID string `json:"agent_id,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			// Allow empty payload to get all metrics
		}
		if payload.AgentID != "" {
			metrics, ok := agents.DefaultRegistry.GetMetrics(payload.AgentID)
			if !ok {
				return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("no metrics for agent: %s", payload.AgentID)}
			}
			return svc.Response{ID: req.ID, Success: true, Data: metrics}
		}
		allMetrics := agents.DefaultRegistry.GetAllMetrics()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"metrics": allMetrics,
		}}

	case "agents.tools":
		var payload struct {
			AgentID string `json:"agent_id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		config, ok := agents.DefaultRegistry.Get(payload.AgentID)
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("agent not found: %s", payload.AgentID)}
		}
		allTools := svc.GetAvailableTools(s.IsSkillRuntimeEnabled())
		filteredTools := config.FilterTools(allTools)
		toolNames := make([]string, 0, len(filteredTools))
		for _, tool := range filteredTools {
			toolNames = append(toolNames, tool.Function.Name)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"agent_id": payload.AgentID,
			"tools":    toolNames,
			"count":    len(toolNames),
		}}

	// MCP Server Management
	case "mcp.list":
		servers := mcp.DefaultManager.List()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"servers": servers,
		}}

	case "mcp.get":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		server, err := mcp.DefaultManager.Get(payload.ID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: server}

	case "mcp.enable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := mcp.DefaultManager.Enable(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		_ = mcp.DefaultManager.SaveConfig(svc.McpConfigPath)
		return svc.Response{ID: req.ID, Success: true}

	case "mcp.disable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := mcp.DefaultManager.Disable(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		_ = mcp.DefaultManager.SaveConfig(svc.McpConfigPath)
		return svc.Response{ID: req.ID, Success: true}

	case "mcp.add":
		var payload struct {
			Type      string `json:"type"`
			Package   string `json:"package,omitempty"`
			Path      string `json:"path,omitempty"`
			URL       string `json:"url,omitempty"`
			Transport string `json:"transport,omitempty"`
			Name      string `json:"name,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		serverType := mcp.ServerTypeNPM
		switch payload.Type {
		case "local":
			serverType = mcp.ServerTypeLocal
		case "url":
			serverType = mcp.ServerTypeURL
		}
		id, err := mcp.DefaultManager.Add(serverType, payload.Package, payload.Path, payload.URL, payload.Transport, payload.Name)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		_ = mcp.DefaultManager.SaveConfig(svc.McpConfigPath)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"id": id,
		}}

	case "mcp.remove":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := mcp.DefaultManager.Remove(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		_ = mcp.DefaultManager.SaveConfig(svc.McpConfigPath)
		return svc.Response{ID: req.ID, Success: true}

	case "mcp.test":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if err := mcp.DefaultManager.Test(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
