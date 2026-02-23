package svc

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"construct-context/providers"
	"construct-context/rag"
)

// Mode represents the current editing mode
type Mode string

const (
	ModeCode   Mode = "code"
	ModeDesign Mode = "design"
	ModeChat   Mode = "chat"
)

// ComponentContext represents current component being edited
type ComponentContext struct {
	Name       string            `json:"name"`
	Type       string            `json:"type"`
	FilePath   string            `json:"filePath,omitempty"`
	Framework  string            `json:"framework,omitempty"`
	Props      map[string]any    `json:"props,omitempty"`
	Styles     map[string]string `json:"styles,omitempty"`
	Children   []string          `json:"children,omitempty"`
	ParentName string            `json:"parentName,omitempty"`
}

// ProjectContext represents current project
type ProjectContext struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	RootPath    string   `json:"rootPath"`
	Framework   string   `json:"framework"`
	UILibrary   string   `json:"uiLibrary,omitempty"`
	StyleSystem string   `json:"styleSystem,omitempty"`
	Components  []string `json:"components,omitempty"`
}

// SelectionContext represents current selection
type SelectionContext struct {
	Type      string `json:"type"` // element, text, code
	Content   string `json:"content,omitempty"`
	ElementID string `json:"elementId,omitempty"`
	StartLine int    `json:"startLine,omitempty"`
	EndLine   int    `json:"endLine,omitempty"`
}

// Context represents the full application context
type Context struct {
	Mode      Mode              `json:"mode"`
	Component *ComponentContext `json:"component,omitempty"`
	Project   *ProjectContext   `json:"project,omitempty"`
	Selection *SelectionContext `json:"selection,omitempty"`
	Timestamp string            `json:"timestamp"`
}

// ConversationWindow represents a chat conversation with its own context
type ConversationWindow struct {
	ID        string                  `json:"id"`
	Name      string                  `json:"name"`
	Messages  []providers.ChatMessage `json:"messages"`
	Model     string                  `json:"model"`
	Context   *Context                `json:"context,omitempty"`
	CreatedAt time.Time               `json:"createdAt"`
	UpdatedAt time.Time               `json:"updatedAt"`
}

// Service is the main context service
type Service struct {
	Mu            sync.RWMutex
	AppCtx        Context
	AgentMode     AgentMode
	MatrixMode    bool
	DevMode       bool
	Conversations map[string]*ConversationWindow
	Clients       map[net.Conn]bool
	ClientsMu     sync.RWMutex
	Storage       *Storage
	APIBaseURL    string
	APIToken      string
	APIKey        string
	Providers     *providers.Registry
	ImageGen      *ImageGenRouter
	RAG           *rag.Service
	Logger        *log.Logger
	LogFile       *os.File
}

// IsDevMode returns true if dev mode is enabled
func (s *Service) IsDevMode() bool {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	return s.DevMode
}

// SendDebug sends a debug message to the client (only if dev mode is on)
func (s *Service) SendDebug(conn net.Conn, reqID string, message string) {
	if !s.IsDevMode() {
		return
	}
	msg := StreamMessage{
		ID:      reqID,
		Type:    "debug",
		Content: message,
		Done:    false,
	}
	data, _ := json.Marshal(msg)
	conn.Write(append(data, '\n'))
}

// Message types
type Request struct {
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Response struct {
	ID      string `json:"id,omitempty"`
	Type    string `json:"type,omitempty"`
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

// BroadcastContextChange notifies all connected clients of context changes
func (s *Service) BroadcastContextChange() {
	s.Mu.RLock()
	ctx := s.AppCtx
	s.Mu.RUnlock()

	msg := map[string]any{
		"type": "context.changed",
		"data": ctx,
	}
	data, _ := json.Marshal(msg)
	data = append(data, '\n')

	s.ClientsMu.RLock()
	for conn := range s.Clients {
		conn.Write(data)
	}
	s.ClientsMu.RUnlock()
}

// StreamMessage represents a streaming message sent to client
type StreamMessage struct {
	ID      string                `json:"id"`
	Type    string                `json:"type"`
	Content string                `json:"content,omitempty"`
	Done    bool                  `json:"done"`
	Error   string                `json:"error,omitempty"`
	Route   *providers.ModelRoute `json:"route,omitempty"`
}

// NewService creates a new context service
func NewService(storage *Storage, apiBaseURL string, apiKey string, providerRegistry *providers.Registry) *Service {
	startTotal := time.Now()

	s := &Service{
		AppCtx: Context{
			Mode:      ModeChat,
			Timestamp: time.Now().Format(time.RFC3339),
		},
		AgentMode:     AgentModeAssistant, // Default to assistant mode (Morpheus)
		Conversations: make(map[string]*ConversationWindow),
		Clients:       make(map[net.Conn]bool),
		Storage:       storage,
		APIBaseURL:    apiBaseURL,
		APIKey:        apiKey,
		Providers:     providerRegistry,
	}

	// Initialize RAG service
	if storage != nil && storage.DB() != nil {
		startRAG := time.Now()
		ragService, err := rag.NewService(storage.DB())
		if err != nil {
			fmt.Fprintf(os.Stderr, "[context] [warn] RAG service init failed: %v\n", err)
		} else {
			s.RAG = ragService
			fmt.Fprintf(os.Stderr, "[context] [perf] RAG service init took %v\n", time.Since(startRAG))
		}
	}

	// Load persisted context
	if storage != nil {
		startLoadCtx := time.Now()
		if ctx, err := storage.LoadContext(); err == nil && ctx != nil {
			s.AppCtx = *ctx
		}
		fmt.Fprintf(os.Stderr, "[context] [perf] LoadContext took %v\n", time.Since(startLoadCtx))

		// Load matrix mode setting
		startSettings := time.Now()
		if matrixSetting, err := storage.GetSetting("matrix_mode"); err == nil && matrixSetting == "true" {
			s.MatrixMode = true
		}

		// Load dev mode setting
		if devSetting, err := storage.GetSetting("dev_mode"); err == nil && devSetting == "true" {
			s.DevMode = true
			fmt.Fprintf(os.Stderr, "[context] Dev mode enabled\n")
		}
		fmt.Fprintf(os.Stderr, "[context] [perf] LoadSettings (matrix_mode, dev_mode) took %v\n", time.Since(startSettings))

		// Load conversations
		startConvs := time.Now()
		if convs, err := storage.ListConversations(); err == nil {
			fmt.Fprintf(os.Stderr, "[context] [perf] ListConversations returned %d conversations\n", len(convs))
			for _, conv := range convs {
				if fullConv, err := storage.GetConversation(conv.ID); err == nil {
					// Convert storage messages to provider messages
					providerConv := &ConversationWindow{
						ID:        fullConv.ID,
						Name:      fullConv.Name,
						Model:     fullConv.Model,
						Context:   fullConv.Context,
						CreatedAt: fullConv.CreatedAt,
						UpdatedAt: fullConv.UpdatedAt,
						Messages:  make([]providers.ChatMessage, len(fullConv.Messages)),
					}
					for i, msg := range fullConv.Messages {
						providerConv.Messages[i] = providers.ChatMessage{
							Role:    msg.Role,
							Content: msg.Content,
						}
					}
					s.Mu.Lock()
					s.Conversations[conv.ID] = providerConv
					s.Mu.Unlock()
				}
			}
		}
		fmt.Fprintf(os.Stderr, "[context] [perf] LoadConversations took %v\n", time.Since(startConvs))
	}

	startSkills := time.Now()
	if err := s.InitializeSkillRuntime(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "[skills] runtime initialization warning: %v\n", err)
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] initializeSkillRuntime took %v\n", time.Since(startSkills))

	fmt.Fprintf(os.Stderr, "[context] [perf] NewService total took %v\n", time.Since(startTotal))
	return s
}
