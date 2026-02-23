package handlers

import (
	"encoding/json"
	"fmt"

	"construct-context/providers"
	"construct-context/svc"
)

// HandleStorage handles kv.*, storage.*, designs.*, project_settings.*, pinned.*, and tools.* requests.
func HandleStorage(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "kv.get":
		var payload struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"value": nil}}
		}
		entry, err := s.Storage.KVGet(payload.Key)
		if err != nil || entry == nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"value": nil}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"value": entry.Value}}

	case "kv.set":
		var payload struct {
			Key      string `json:"key"`
			Value    string `json:"value"`
			Category string `json:"category,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		category := payload.Category
		if category == "" {
			category = "general"
		}
		if err := s.Storage.KVSet(payload.Key, payload.Value, category, nil, nil); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "kv.delete":
		var payload struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.KVDelete(payload.Key); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "tools.list":
		tools := svc.GetAvailableTools(s.IsSkillRuntimeEnabled())
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"tools": tools,
		}}

	case "tools.call":
		var payload struct {
			ToolCall providers.ToolCall `json:"toolCall"`
			Token    string             `json:"token"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		s.Mu.RLock()
		token := payload.Token
		if token == "" && s.Storage != nil {
			if storedToken, err := s.Storage.GetAuthToken("construct_api"); err == nil {
				token = storedToken.Token
			}
		}
		if token == "" {
			token = s.APIToken
		}
		apiClient := svc.NewAPIClient(s.APIBaseURL, token, s.APIKey)
		s.Mu.RUnlock()

		result := s.ExecuteTool(payload.ToolCall, apiClient, nil)
		return svc.Response{ID: req.ID, Success: !result.IsError, Data: result}

	case "storage.get":
		var payload struct {
			Key       string `json:"key"`
			Category  string `json:"category,omitempty"`
			ProjectID *int   `json:"projectId,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		entry, err := s.Storage.KVGet(payload.Key)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("key not found: %v", err)}
		}
		var value any
		if err := json.Unmarshal([]byte(entry.Value), &value); err != nil {
			value = entry.Value
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"value":    value,
			"category": entry.Category,
		}}

	case "storage.set":
		var payload struct {
			Key       string `json:"key"`
			Value     any    `json:"value"`
			Category  string `json:"category,omitempty"`
			ProjectID *int   `json:"projectId,omitempty"`
			UserID    string `json:"userId,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		var valueStr string
		switch v := payload.Value.(type) {
		case string:
			valueStr = v
		default:
			valueBytes, err := json.Marshal(v)
			if err != nil {
				return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("failed to marshal value: %v", err)}
			}
			valueStr = string(valueBytes)
		}
		category := payload.Category
		if category == "" {
			category = "general"
		}
		var userID *string
		if payload.UserID != "" {
			userID = &payload.UserID
		}
		if err := s.Storage.KVSet(payload.Key, valueStr, category, userID, payload.ProjectID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "storage.delete":
		var payload struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.KVDelete(payload.Key); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "storage.list":
		var payload struct {
			Category  string `json:"category,omitempty"`
			ProjectID *int   `json:"projectId,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		category := payload.Category
		if category == "" {
			category = "general"
		}
		entries, err := s.Storage.KVList(category)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		items := make([]map[string]any, 0, len(entries))
		for _, entry := range entries {
			var value any
			if err := json.Unmarshal([]byte(entry.Value), &value); err != nil {
				value = entry.Value
			}
			item := map[string]any{
				"key":       entry.Key,
				"value":     value,
				"category":  entry.Category,
				"createdAt": entry.CreatedAt,
				"updatedAt": entry.UpdatedAt,
			}
			if entry.UserID != nil {
				item["userId"] = *entry.UserID
			}
			if entry.ProjectID != nil {
				item["projectId"] = *entry.ProjectID
			}
			items = append(items, item)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"items": items}}

	case "storage.batch_get":
		var payload struct {
			Keys []string `json:"keys"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		entries, err := s.Storage.KVBatchGet(payload.Keys)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		items := make(map[string]any)
		for _, entry := range entries {
			var value any
			if err := json.Unmarshal([]byte(entry.Value), &value); err != nil {
				value = entry.Value
			}
			items[entry.Key] = value
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"items": items}}

	case "storage.batch_set":
		var payload struct {
			Items    map[string]any `json:"items"`
			Category string         `json:"category,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		category := payload.Category
		if category == "" {
			category = "general"
		}
		entries := make([]*svc.KVEntry, 0, len(payload.Items))
		for key, value := range payload.Items {
			var valueStr string
			switch v := value.(type) {
			case string:
				valueStr = v
			default:
				valueBytes, err := json.Marshal(v)
				if err != nil {
					return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("failed to marshal value for key %s: %v", key, err)}
				}
				valueStr = string(valueBytes)
			}
			entries = append(entries, &svc.KVEntry{
				Key:      key,
				Value:    valueStr,
				Category: category,
			})
		}
		if err := s.Storage.KVBatchSet(entries); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	// UI Designs
	case "designs.list":
		var payload struct {
			ProjectID *int `json:"projectId,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			payload.ProjectID = nil
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		designs, err := s.Storage.UIDesignList(payload.ProjectID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		designList := make([]map[string]any, 0, len(designs))
		for _, d := range designs {
			design := map[string]any{
				"id":           d.ID,
				"localId":      d.LocalID,
				"name":         d.Name,
				"historyIndex": d.HistoryIndex,
				"createdAt":    d.CreatedAt,
				"updatedAt":    d.UpdatedAt,
			}
			if d.ProjectID != nil {
				design["projectId"] = *d.ProjectID
			}
			if d.NodesJSON != "" {
				var nodes any
				if err := json.Unmarshal([]byte(d.NodesJSON), &nodes); err == nil {
					design["nodes"] = nodes
				}
			}
			if d.PagesJSON != "" {
				var pages any
				if err := json.Unmarshal([]byte(d.PagesJSON), &pages); err == nil {
					design["pages"] = pages
				}
			}
			if d.ViewportJSON != "" {
				var viewport any
				if err := json.Unmarshal([]byte(d.ViewportJSON), &viewport); err == nil {
					design["viewport"] = viewport
				}
			}
			if d.HistoryJSON != "" {
				var history any
				if err := json.Unmarshal([]byte(d.HistoryJSON), &history); err == nil {
					design["history"] = history
				}
			}
			designList = append(designList, design)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"designs": designList}}

	case "designs.get":
		var payload struct {
			LocalID string `json:"localId"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		d, err := s.Storage.UIDesignGet(payload.LocalID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: fmt.Sprintf("design not found: %v", err)}
		}
		design := map[string]any{
			"id":           d.ID,
			"localId":      d.LocalID,
			"name":         d.Name,
			"historyIndex": d.HistoryIndex,
			"createdAt":    d.CreatedAt,
			"updatedAt":    d.UpdatedAt,
		}
		if d.ProjectID != nil {
			design["projectId"] = *d.ProjectID
		}
		if d.NodesJSON != "" {
			var nodes any
			if err := json.Unmarshal([]byte(d.NodesJSON), &nodes); err == nil {
				design["nodes"] = nodes
			}
		}
		if d.PagesJSON != "" {
			var pages any
			if err := json.Unmarshal([]byte(d.PagesJSON), &pages); err == nil {
				design["pages"] = pages
			}
		}
		if d.ViewportJSON != "" {
			var viewport any
			if err := json.Unmarshal([]byte(d.ViewportJSON), &viewport); err == nil {
				design["viewport"] = viewport
			}
		}
		if d.HistoryJSON != "" {
			var history any
			if err := json.Unmarshal([]byte(d.HistoryJSON), &history); err == nil {
				design["history"] = history
			}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"design": design}}

	case "designs.save":
		var payload struct {
			LocalID      string `json:"localId"`
			ProjectID    *int   `json:"projectId,omitempty"`
			Name         string `json:"name"`
			Nodes        any    `json:"nodes,omitempty"`
			Pages        any    `json:"pages,omitempty"`
			Viewport     any    `json:"viewport,omitempty"`
			History      any    `json:"history,omitempty"`
			HistoryIndex int    `json:"historyIndex"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		design := &svc.UIDesign{
			LocalID:      payload.LocalID,
			ProjectID:    payload.ProjectID,
			Name:         payload.Name,
			HistoryIndex: payload.HistoryIndex,
		}
		if payload.Nodes != nil {
			if nodesBytes, err := json.Marshal(payload.Nodes); err == nil {
				design.NodesJSON = string(nodesBytes)
			}
		}
		if payload.Pages != nil {
			if pagesBytes, err := json.Marshal(payload.Pages); err == nil {
				design.PagesJSON = string(pagesBytes)
			}
		}
		if payload.Viewport != nil {
			if viewportBytes, err := json.Marshal(payload.Viewport); err == nil {
				design.ViewportJSON = string(viewportBytes)
			}
		}
		if payload.History != nil {
			if historyBytes, err := json.Marshal(payload.History); err == nil {
				design.HistoryJSON = string(historyBytes)
			}
		}
		if err := s.Storage.UIDesignSave(design); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"id":      design.ID,
			"localId": design.LocalID,
		}}

	case "designs.delete":
		var payload struct {
			LocalID string `json:"localId"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.UIDesignDelete(payload.LocalID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	// Project Settings
	case "project_settings.get":
		var payload struct {
			ProjectID int `json:"projectId"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		settings, err := s.Storage.ProjectLocalSettingsGet(payload.ProjectID)
		if err != nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
				"projectId":  payload.ProjectID,
				"localPath":  "",
				"editorPath": "",
			}}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"projectId":  settings.ProjectID,
			"localPath":  settings.LocalPath,
			"editorPath": settings.EditorPath,
			"updatedAt":  settings.UpdatedAt,
		}}

	case "project_settings.set":
		var payload struct {
			ProjectID  int    `json:"projectId"`
			LocalPath  string `json:"localPath,omitempty"`
			EditorPath string `json:"editorPath,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		settings := &svc.ProjectLocalSettings{
			ProjectID:  payload.ProjectID,
			LocalPath:  payload.LocalPath,
			EditorPath: payload.EditorPath,
		}
		if err := s.Storage.ProjectLocalSettingsSet(settings); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	// Pinned Items
	case "pinned.list":
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		items, err := s.Storage.PinnedItemList()
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		itemList := make([]map[string]any, 0, len(items))
		for _, item := range items {
			itemMap := map[string]any{
				"id":        item.ID,
				"type":      item.Type,
				"name":      item.Name,
				"sortOrder": item.SortOrder,
				"pinnedAt":  item.PinnedAt,
			}
			if item.Icon != "" {
				itemMap["icon"] = item.Icon
			}
			if item.Path != "" {
				itemMap["path"] = item.Path
			}
			if item.Color != "" {
				itemMap["color"] = item.Color
			}
			if item.MetadataJSON != "" {
				var metadata any
				if err := json.Unmarshal([]byte(item.MetadataJSON), &metadata); err == nil {
					itemMap["metadata"] = metadata
				}
			}
			itemList = append(itemList, itemMap)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"items": itemList}}

	case "pinned.add":
		var payload struct {
			ID        string `json:"id"`
			Type      string `json:"type"`
			Name      string `json:"name"`
			Icon      string `json:"icon,omitempty"`
			Path      string `json:"path,omitempty"`
			Color     string `json:"color,omitempty"`
			Metadata  any    `json:"metadata,omitempty"`
			SortOrder int    `json:"sortOrder"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		item := &svc.PinnedItem{
			ID:        payload.ID,
			Type:      payload.Type,
			Name:      payload.Name,
			Icon:      payload.Icon,
			Path:      payload.Path,
			Color:     payload.Color,
			SortOrder: payload.SortOrder,
		}
		if payload.Metadata != nil {
			if metadataBytes, err := json.Marshal(payload.Metadata); err == nil {
				item.MetadataJSON = string(metadataBytes)
			}
		}
		if err := s.Storage.PinnedItemAdd(item); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "pinned.remove":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		if err := s.Storage.PinnedItemRemove(payload.ID); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	case "pinned.reorder":
		var payload struct {
			Items []struct {
				ID        string `json:"id"`
				SortOrder int    `json:"sortOrder"`
			} `json:"items"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		if s.Storage == nil {
			return svc.Response{ID: req.ID, Success: false, Error: "storage not available"}
		}
		orderedIDs := make([]string, len(payload.Items))
		for i, item := range payload.Items {
			orderedIDs[i] = item.ID
		}
		if err := s.Storage.PinnedItemReorder(orderedIDs); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
