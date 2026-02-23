package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"construct-context/providers"
	"construct-context/svc"
)

// HandleConversation handles conversation.* requests.
func HandleConversation(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "conversation.create":
		var payload struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Model string `json:"model"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		convID := payload.ID
		if convID == "" {
			convID = fmt.Sprintf("conv_%d", time.Now().UnixNano())
		}
		conv := &svc.ConversationWindow{
			ID:        convID,
			Name:      payload.Name,
			Model:     payload.Model,
			Messages:  []providers.ChatMessage{},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		s.Mu.Lock()
		s.Conversations[payload.ID] = conv
		s.Mu.Unlock()
		if s.Storage != nil {
			storageConv := &svc.StorageConversationWindow{
				ID:        conv.ID,
				Name:      conv.Name,
				Model:     conv.Model,
				Messages:  []svc.ChatMessage{},
				CreatedAt: conv.CreatedAt,
				UpdatedAt: conv.UpdatedAt,
			}
			s.Storage.SaveConversation(storageConv)
		}
		return svc.Response{ID: req.ID, Success: true, Data: conv}

	case "conversation.list":
		s.Mu.RLock()
		convs := make([]*svc.ConversationWindow, 0, len(s.Conversations))
		for _, c := range s.Conversations {
			convs = append(convs, c)
		}
		s.Mu.RUnlock()
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"conversations": convs}}

	case "conversation.get":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.RLock()
		conv, ok := s.Conversations[payload.ID]
		s.Mu.RUnlock()
		if !ok {
			return svc.Response{ID: req.ID, Success: false, Error: "conversation not found"}
		}
		return svc.Response{ID: req.ID, Success: true, Data: conv}

	case "conversation.delete":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		delete(s.Conversations, payload.ID)
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.DeleteConversation(payload.ID)
		}
		return svc.Response{ID: req.ID, Success: true}

	case "conversation.add_message":
		var payload struct {
			ID      string `json:"id"`
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		s.Mu.Lock()
		conv, ok := s.Conversations[payload.ID]
		if !ok {
			s.Mu.Unlock()
			return svc.Response{ID: req.ID, Success: false, Error: "conversation not found"}
		}
		conv.Messages = append(conv.Messages, providers.ChatMessage{Role: payload.Role, Content: payload.Content})
		conv.UpdatedAt = time.Now()
		s.Mu.Unlock()
		if s.Storage != nil {
			s.Storage.SaveMessage(payload.ID, svc.ChatMessage{Role: payload.Role, Content: payload.Content}, 0, 0)
		}
		return svc.Response{ID: req.ID, Success: true}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}
