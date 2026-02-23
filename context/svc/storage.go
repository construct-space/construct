package svc

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// ChatMessage represents a chat message (storage version)
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// StorageConversationWindow represents a conversation for storage
type StorageConversationWindow struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Messages  []ChatMessage `json:"messages"`
	Model     string        `json:"model"`
	Context   *Context      `json:"context,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
	UpdatedAt time.Time     `json:"updatedAt"`
}

// Storage handles SQLite database operations
type Storage struct {
	db       *sql.DB
	upsertMu sync.Map // per-contextKey mutexes for UpsertAIMessage serialization
}

// NewStorage creates a new storage instance
func NewStorage(dbPath string) (*Storage, error) {
	startTotal := time.Now()

	// Log call site to detect unexpected multiple initializations
	_, callerFile, callerLine, callerOk := runtime.Caller(1)
	if callerOk {
		fmt.Fprintf(os.Stderr, "[context] [perf] NewStorage called from %s:%d\n", callerFile, callerLine)
	} else {
		fmt.Fprintf(os.Stderr, "[context] [perf] NewStorage called (caller unknown)\n")
	}

	// Ensure directory exists
	startMkdir := time.Now()
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] MkdirAll took %v\n", time.Since(startMkdir))

	startOpen := time.Now()
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] sql.Open took %v\n", time.Since(startOpen))

	s := &Storage{db: db}

	startMigrate := time.Now()
	if err := s.migrate(); err != nil {
		return nil, err
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] migrate (table creation) took %v\n", time.Since(startMigrate))

	fmt.Fprintf(os.Stderr, "[context] [perf] NewStorage total took %v\n", time.Since(startTotal))
	return s, nil
}

// migrate creates the database schema
func (s *Storage) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS conversations (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		model TEXT NOT NULL,
		context_json TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		conversation_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		tokens_input INTEGER DEFAULT 0,
		tokens_output INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS context_state (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		mode TEXT DEFAULT 'chat',
		component_json TEXT,
		project_json TEXT,
		selection_json TEXT,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS token_usage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		conversation_id TEXT,
		model TEXT NOT NULL,
		tokens_input INTEGER DEFAULT 0,
		tokens_output INTEGER DEFAULT 0,
		cost_usd REAL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
	);

	CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
	CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id);
	CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);

	-- Auth tokens table for shared access between context service and Construct app
	CREATE TABLE IF NOT EXISTS auth_tokens (
		key TEXT PRIMARY KEY,
		token TEXT NOT NULL,
		user_id TEXT,
		user_json TEXT,
		expires_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Initialize context state if not exists
	INSERT OR IGNORE INTO context_state (id, mode) VALUES (1, 'chat');

	-- Generic key-value store
	CREATE TABLE IF NOT EXISTS kv_store (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		category TEXT DEFAULT 'general',
		user_id TEXT,
		project_id INTEGER,
		synced_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_kv_category ON kv_store(category);
	CREATE INDEX IF NOT EXISTS idx_kv_user ON kv_store(user_id);
	CREATE INDEX IF NOT EXISTS idx_kv_project ON kv_store(project_id);

	-- UI Designs (migrate from IndexedDB)
	CREATE TABLE IF NOT EXISTS ui_designs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		local_id TEXT UNIQUE NOT NULL,
		project_id INTEGER,
		name TEXT NOT NULL,
		nodes_json TEXT,
		pages_json TEXT,
		viewport_json TEXT,
		history_json TEXT,
		history_index INTEGER DEFAULT 0,
		synced_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_designs_project ON ui_designs(project_id);
	CREATE INDEX IF NOT EXISTS idx_designs_local_id ON ui_designs(local_id);

	-- Project local settings
	CREATE TABLE IF NOT EXISTS project_local_settings (
		project_id INTEGER PRIMARY KEY,
		local_path TEXT,
		editor_path TEXT,
		synced_at DATETIME,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Pinned items
	CREATE TABLE IF NOT EXISTS pinned_items (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		name TEXT NOT NULL,
		icon TEXT,
		path TEXT,
		color TEXT,
		metadata_json TEXT,
		sort_order INTEGER DEFAULT 0,
		pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Sync queue
	CREATE TABLE IF NOT EXISTS sync_queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		table_name TEXT NOT NULL,
		record_id TEXT NOT NULL,
		operation TEXT NOT NULL,
		data_json TEXT,
		status TEXT DEFAULT 'pending',
		retry_count INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);

	-- User context cache (avoid repeated API calls for user/company info)
	CREATE TABLE IF NOT EXISTS user_context (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		user_id INTEGER,
		company_id INTEGER,
		user_json TEXT,
		company_json TEXT,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	INSERT OR IGNORE INTO user_context (id) VALUES (1);

	-- AI assistant conversations (per context key like project-123-ui, with user/company for cloud sync)
	CREATE TABLE IF NOT EXISTS ai_conversations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		context_key TEXT NOT NULL,
		user_id INTEGER,
		company_id INTEGER,
		messages_json TEXT NOT NULL,
		synced_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(context_key, user_id, company_id)
	);
	CREATE INDEX IF NOT EXISTS idx_ai_conv_updated ON ai_conversations(updated_at);
	CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
	CREATE INDEX IF NOT EXISTS idx_ai_conv_company ON ai_conversations(company_id);
	CREATE INDEX IF NOT EXISTS idx_ai_conv_context ON ai_conversations(context_key);
	`
	_, err := s.db.Exec(schema)
	return err
}

// DB returns the underlying database connection for use by other packages
func (s *Storage) DB() *sql.DB {
	return s.db
}

// Close closes the database connection
func (s *Storage) Close() error {
	return s.db.Close()
}

// SaveConversation saves a conversation to the database
func (s *Storage) SaveConversation(conv *StorageConversationWindow) error {
	contextJSON, err := json.Marshal(conv.Context)
	if err != nil {
		return fmt.Errorf("failed to marshal conversation context: %w", err)
	}

	_, err = s.db.Exec(`
		INSERT INTO conversations (id, name, model, context_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			model = excluded.model,
			context_json = excluded.context_json,
			updated_at = excluded.updated_at
	`, conv.ID, conv.Name, conv.Model, string(contextJSON), conv.CreatedAt, conv.UpdatedAt)

	return err
}

// GetConversation retrieves a conversation by ID
func (s *Storage) GetConversation(id string) (*StorageConversationWindow, error) {
	var conv StorageConversationWindow
	var contextJSON sql.NullString

	err := s.db.QueryRow(`
		SELECT id, name, model, context_json, created_at, updated_at
		FROM conversations WHERE id = ?
	`, id).Scan(&conv.ID, &conv.Name, &conv.Model, &contextJSON, &conv.CreatedAt, &conv.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if contextJSON.Valid && contextJSON.String != "" {
		if err := json.Unmarshal([]byte(contextJSON.String), &conv.Context); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] failed to parse context_json for conversation %s: %v\n", id, err)
		}
	}

	// Load messages
	conv.Messages, err = s.GetMessages(id)
	if err != nil {
		return nil, err
	}

	return &conv, nil
}

// ListConversations lists all conversations
func (s *Storage) ListConversations() ([]*StorageConversationWindow, error) {
	rows, err := s.db.Query(`
		SELECT id, name, model, context_json, created_at, updated_at
		FROM conversations ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []*StorageConversationWindow
	for rows.Next() {
		var conv StorageConversationWindow
		var contextJSON sql.NullString

		if err := rows.Scan(&conv.ID, &conv.Name, &conv.Model, &contextJSON, &conv.CreatedAt, &conv.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in ListConversations: %v\n", err)
			continue
		}

		if contextJSON.Valid && contextJSON.String != "" {
			if err := json.Unmarshal([]byte(contextJSON.String), &conv.Context); err != nil {
				fmt.Fprintf(os.Stderr, "[storage] failed to parse context_json in ListConversations: %v\n", err)
			}
		}

		convs = append(convs, &conv)
	}

	return convs, nil
}

// DeleteConversation deletes a conversation and its messages
func (s *Storage) DeleteConversation(id string) error {
	_, err := s.db.Exec(`DELETE FROM conversations WHERE id = ?`, id)
	return err
}

// SaveMessage saves a message to the database
func (s *Storage) SaveMessage(conversationID string, msg ChatMessage, tokensIn, tokensOut int) error {
	_, err := s.db.Exec(`
		INSERT INTO messages (conversation_id, role, content, tokens_input, tokens_output)
		VALUES (?, ?, ?, ?, ?)
	`, conversationID, msg.Role, msg.Content, tokensIn, tokensOut)

	if err == nil {
		// Update conversation updated_at
		if _, execErr := s.db.Exec(`UPDATE conversations SET updated_at = ? WHERE id = ?`, time.Now(), conversationID); execErr != nil {
			fmt.Fprintf(os.Stderr, "[storage] failed to update conversation updated_at for %s: %v\n", conversationID, execErr)
		}
	}

	return err
}

// GetMessages retrieves all messages for a conversation
func (s *Storage) GetMessages(conversationID string) ([]ChatMessage, error) {
	rows, err := s.db.Query(`
		SELECT role, content FROM messages
		WHERE conversation_id = ?
		ORDER BY id ASC
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ChatMessage
	for rows.Next() {
		var msg ChatMessage
		if err := rows.Scan(&msg.Role, &msg.Content); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in GetMessages: %v\n", err)
			continue
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

// SaveContext saves the current context state
func (s *Storage) SaveContext(ctx *Context) error {
	componentJSON, err := json.Marshal(ctx.Component)
	if err != nil {
		return fmt.Errorf("failed to marshal component context: %w", err)
	}
	projectJSON, err := json.Marshal(ctx.Project)
	if err != nil {
		return fmt.Errorf("failed to marshal project context: %w", err)
	}
	selectionJSON, err := json.Marshal(ctx.Selection)
	if err != nil {
		return fmt.Errorf("failed to marshal selection context: %w", err)
	}

	_, err = s.db.Exec(`
		UPDATE context_state SET
			mode = ?,
			component_json = ?,
			project_json = ?,
			selection_json = ?,
			updated_at = ?
		WHERE id = 1
	`, ctx.Mode, string(componentJSON), string(projectJSON), string(selectionJSON), time.Now())

	return err
}

// LoadContext loads the saved context state
func (s *Storage) LoadContext() (*Context, error) {
	var ctx Context
	var componentJSON, projectJSON, selectionJSON sql.NullString
	var mode string

	err := s.db.QueryRow(`
		SELECT mode, component_json, project_json, selection_json, updated_at
		FROM context_state WHERE id = 1
	`).Scan(&mode, &componentJSON, &projectJSON, &selectionJSON, &ctx.Timestamp)

	if err != nil {
		return nil, err
	}

	ctx.Mode = Mode(mode)

	if componentJSON.Valid && componentJSON.String != "" && componentJSON.String != "null" {
		if err := json.Unmarshal([]byte(componentJSON.String), &ctx.Component); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] failed to parse component_json in LoadContext: %v\n", err)
		}
	}
	if projectJSON.Valid && projectJSON.String != "" && projectJSON.String != "null" {
		if err := json.Unmarshal([]byte(projectJSON.String), &ctx.Project); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] failed to parse project_json in LoadContext: %v\n", err)
		}
	}
	if selectionJSON.Valid && selectionJSON.String != "" && selectionJSON.String != "null" {
		if err := json.Unmarshal([]byte(selectionJSON.String), &ctx.Selection); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] failed to parse selection_json in LoadContext: %v\n", err)
		}
	}

	return &ctx, nil
}

// RecordTokenUsage records token usage for billing/tracking
func (s *Storage) RecordTokenUsage(conversationID, model string, tokensIn, tokensOut int, costUSD float64) error {
	_, err := s.db.Exec(`
		INSERT INTO token_usage (conversation_id, model, tokens_input, tokens_output, cost_usd)
		VALUES (?, ?, ?, ?, ?)
	`, conversationID, model, tokensIn, tokensOut, costUSD)
	return err
}

// GetTokenUsage returns total token usage, optionally filtered by time range
func (s *Storage) GetTokenUsage(since *time.Time) (tokensIn, tokensOut int, costUSD float64, err error) {
	var query string
	var args []interface{}

	if since != nil {
		query = `SELECT COALESCE(SUM(tokens_input), 0), COALESCE(SUM(tokens_output), 0), COALESCE(SUM(cost_usd), 0) FROM token_usage WHERE created_at >= ?`
		args = append(args, since)
	} else {
		query = `SELECT COALESCE(SUM(tokens_input), 0), COALESCE(SUM(tokens_output), 0), COALESCE(SUM(cost_usd), 0) FROM token_usage`
	}

	err = s.db.QueryRow(query, args...).Scan(&tokensIn, &tokensOut, &costUSD)
	return
}

// GetConversationTokenUsage returns token usage for a specific conversation
func (s *Storage) GetConversationTokenUsage(conversationID string) (tokensIn, tokensOut int, err error) {
	err = s.db.QueryRow(`
		SELECT COALESCE(SUM(tokens_input), 0), COALESCE(SUM(tokens_output), 0)
		FROM messages WHERE conversation_id = ?
	`, conversationID).Scan(&tokensIn, &tokensOut)
	return
}

// AuthToken represents a stored authentication token
type AuthToken struct {
	Key       string     `json:"key"`
	Token     string     `json:"token"`
	UserID    string     `json:"user_id,omitempty"`
	UserJSON  string     `json:"user_json,omitempty"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// SaveAuthToken saves or updates an auth token
func (s *Storage) SaveAuthToken(key, token, userID, userJSON string, expiresAt *time.Time) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO auth_tokens (key, token, user_id, user_json, expires_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			token = excluded.token,
			user_id = excluded.user_id,
			user_json = excluded.user_json,
			expires_at = excluded.expires_at,
			updated_at = excluded.updated_at
	`, key, token, userID, userJSON, expiresAt, now, now)
	return err
}

// GetAuthToken retrieves an auth token by key
func (s *Storage) GetAuthToken(key string) (*AuthToken, error) {
	var token AuthToken
	var userID, userJSON sql.NullString
	var expiresAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT key, token, user_id, user_json, expires_at, created_at, updated_at
		FROM auth_tokens WHERE key = ?
	`, key).Scan(&token.Key, &token.Token, &userID, &userJSON, &expiresAt, &token.CreatedAt, &token.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if userID.Valid {
		token.UserID = userID.String
	}
	if userJSON.Valid {
		token.UserJSON = userJSON.String
	}
	if expiresAt.Valid {
		token.ExpiresAt = &expiresAt.Time
	}

	// NOTE: Don't check expiry here - let the caller handle expired tokens
	// so they can attempt refresh if needed

	return &token, nil
}

// DeleteAuthToken removes an auth token
func (s *Storage) DeleteAuthToken(key string) error {
	_, err := s.db.Exec(`DELETE FROM auth_tokens WHERE key = ?`, key)
	return err
}

// ClearAllAuthTokens removes all auth tokens (for logout)
func (s *Storage) ClearAllAuthTokens() error {
	_, err := s.db.Exec(`DELETE FROM auth_tokens`)
	return err
}

// SetCurrentUser stores the current user info
func (s *Storage) SetCurrentUser(userID uint, userJSON string) error {
	return s.SaveAuthToken("current_user", "", fmt.Sprintf("%d", userID), userJSON, nil)
}

// GetCurrentUser retrieves the current user info
func (s *Storage) GetCurrentUser() (uint, string, error) {
	token, err := s.GetAuthToken("current_user")
	if err != nil {
		return 0, "", err
	}
	var userID uint
	if token.UserID != "" {
		if id, err := strconv.ParseUint(token.UserID, 10, 32); err == nil {
			userID = uint(id)
		}
	}
	return userID, token.UserJSON, nil
}

// GetCurrentUserID retrieves just the current user ID
// Checks both "current_user" and "construct_api" tokens
func (s *Storage) GetCurrentUserID() uint {
	// First try current_user
	userID, _, err := s.GetCurrentUser()
	if err == nil && userID > 0 {
		return userID
	}
	// Fallback to construct_api token
	token, err := s.GetAuthToken("construct_api")
	if err == nil && token != nil && token.UserID != "" {
		if id, err := strconv.ParseUint(token.UserID, 10, 32); err == nil {
			return uint(id)
		}
	}
	return 0
}

// ============================================================================
// KV Store
// ============================================================================

// KVEntry represents an entry in the key-value store
type KVEntry struct {
	Key       string     `json:"key"`
	Value     string     `json:"value"`
	Category  string     `json:"category"`
	UserID    *string    `json:"user_id,omitempty"`
	ProjectID *int       `json:"project_id,omitempty"`
	SyncedAt  *time.Time `json:"synced_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// KVGet retrieves a value by key
func (s *Storage) KVGet(key string) (*KVEntry, error) {
	var entry KVEntry
	var userID, category sql.NullString
	var projectID sql.NullInt64
	var syncedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT key, value, category, user_id, project_id, synced_at, created_at, updated_at
		FROM kv_store WHERE key = ?
	`, key).Scan(&entry.Key, &entry.Value, &category, &userID, &projectID, &syncedAt, &entry.CreatedAt, &entry.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if category.Valid {
		entry.Category = category.String
	}
	if userID.Valid {
		entry.UserID = &userID.String
	}
	if projectID.Valid {
		pid := int(projectID.Int64)
		entry.ProjectID = &pid
	}
	if syncedAt.Valid {
		entry.SyncedAt = &syncedAt.Time
	}

	return &entry, nil
}

// KVSet sets a key-value pair
func (s *Storage) KVSet(key, value, category string, userID *string, projectID *int) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO kv_store (key, value, category, user_id, project_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			category = excluded.category,
			user_id = excluded.user_id,
			project_id = excluded.project_id,
			updated_at = excluded.updated_at
	`, key, value, category, userID, projectID, now, now)
	return err
}

// KVDelete removes a key from the store
func (s *Storage) KVDelete(key string) error {
	_, err := s.db.Exec(`DELETE FROM kv_store WHERE key = ?`, key)
	return err
}

// GetSetting retrieves a setting value by key
func (s *Storage) GetSetting(key string) (string, error) {
	entry, err := s.KVGet("setting:" + key)
	if err != nil {
		return "", err
	}
	if entry == nil {
		return "", nil
	}
	return entry.Value, nil
}

// SetSetting stores a setting value
func (s *Storage) SetSetting(key, value string) error {
	return s.KVSet("setting:"+key, value, "settings", nil, nil)
}

// KVList returns all entries for a given category
func (s *Storage) KVList(category string) ([]*KVEntry, error) {
	rows, err := s.db.Query(`
		SELECT key, value, category, user_id, project_id, synced_at, created_at, updated_at
		FROM kv_store WHERE category = ?
		ORDER BY key
	`, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []*KVEntry
	for rows.Next() {
		var entry KVEntry
		var userID, cat sql.NullString
		var projectID sql.NullInt64
		var syncedAt sql.NullTime

		if err := rows.Scan(&entry.Key, &entry.Value, &cat, &userID, &projectID, &syncedAt, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in KVList: %v\n", err)
			continue
		}

		if cat.Valid {
			entry.Category = cat.String
		}
		if userID.Valid {
			entry.UserID = &userID.String
		}
		if projectID.Valid {
			pid := int(projectID.Int64)
			entry.ProjectID = &pid
		}
		if syncedAt.Valid {
			entry.SyncedAt = &syncedAt.Time
		}

		entries = append(entries, &entry)
	}

	return entries, nil
}

// KVBatchGet retrieves multiple values by keys
func (s *Storage) KVBatchGet(keys []string) ([]*KVEntry, error) {
	if len(keys) == 0 {
		return nil, nil
	}

	// Build placeholders
	placeholders := ""
	args := make([]interface{}, len(keys))
	for i, key := range keys {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args[i] = key
	}

	rows, err := s.db.Query(`
		SELECT key, value, category, user_id, project_id, synced_at, created_at, updated_at
		FROM kv_store WHERE key IN (`+placeholders+`)
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []*KVEntry
	for rows.Next() {
		var entry KVEntry
		var userID, cat sql.NullString
		var projectID sql.NullInt64
		var syncedAt sql.NullTime

		if err := rows.Scan(&entry.Key, &entry.Value, &cat, &userID, &projectID, &syncedAt, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in KVBatchGet: %v\n", err)
			continue
		}

		if cat.Valid {
			entry.Category = cat.String
		}
		if userID.Valid {
			entry.UserID = &userID.String
		}
		if projectID.Valid {
			pid := int(projectID.Int64)
			entry.ProjectID = &pid
		}
		if syncedAt.Valid {
			entry.SyncedAt = &syncedAt.Time
		}

		entries = append(entries, &entry)
	}

	return entries, nil
}

// KVBatchSet sets multiple key-value pairs in a transaction
func (s *Storage) KVBatchSet(entries []*KVEntry) error {
	if len(entries) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO kv_store (key, value, category, user_id, project_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			category = excluded.category,
			user_id = excluded.user_id,
			project_id = excluded.project_id,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now()
	for _, entry := range entries {
		_, err := stmt.Exec(entry.Key, entry.Value, entry.Category, entry.UserID, entry.ProjectID, now, now)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// ============================================================================
// UI Designs
// ============================================================================

// UIDesign represents a UI design document
type UIDesign struct {
	ID           int        `json:"id"`
	LocalID      string     `json:"local_id"`
	ProjectID    *int       `json:"project_id,omitempty"`
	Name         string     `json:"name"`
	NodesJSON    string     `json:"nodes_json,omitempty"`
	PagesJSON    string     `json:"pages_json,omitempty"`
	ViewportJSON string     `json:"viewport_json,omitempty"`
	HistoryJSON  string     `json:"history_json,omitempty"`
	HistoryIndex int        `json:"history_index"`
	SyncedAt     *time.Time `json:"synced_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// UIDesignList returns all designs for a project (nil projectID returns all)
func (s *Storage) UIDesignList(projectID *int) ([]*UIDesign, error) {
	var query string
	var args []interface{}

	if projectID != nil {
		query = `
			SELECT id, local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, synced_at, created_at, updated_at
			FROM ui_designs WHERE project_id = ?
			ORDER BY updated_at DESC
		`
		args = append(args, *projectID)
	} else {
		query = `
			SELECT id, local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, synced_at, created_at, updated_at
			FROM ui_designs
			ORDER BY updated_at DESC
		`
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var designs []*UIDesign
	for rows.Next() {
		var d UIDesign
		var projectID sql.NullInt64
		var nodesJSON, pagesJSON, viewportJSON, historyJSON sql.NullString
		var syncedAt sql.NullTime

		if err := rows.Scan(&d.ID, &d.LocalID, &projectID, &d.Name, &nodesJSON, &pagesJSON, &viewportJSON, &historyJSON, &d.HistoryIndex, &syncedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in UIDesignList: %v\n", err)
			continue
		}

		if projectID.Valid {
			pid := int(projectID.Int64)
			d.ProjectID = &pid
		}
		if nodesJSON.Valid {
			d.NodesJSON = nodesJSON.String
		}
		if pagesJSON.Valid {
			d.PagesJSON = pagesJSON.String
		}
		if viewportJSON.Valid {
			d.ViewportJSON = viewportJSON.String
		}
		if historyJSON.Valid {
			d.HistoryJSON = historyJSON.String
		}
		if syncedAt.Valid {
			d.SyncedAt = &syncedAt.Time
		}

		designs = append(designs, &d)
	}

	return designs, nil
}

// UIDesignGet retrieves a design by local ID
func (s *Storage) UIDesignGet(localID string) (*UIDesign, error) {
	var d UIDesign
	var projectID sql.NullInt64
	var nodesJSON, pagesJSON, viewportJSON, historyJSON sql.NullString
	var syncedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT id, local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, synced_at, created_at, updated_at
		FROM ui_designs WHERE local_id = ?
	`, localID).Scan(&d.ID, &d.LocalID, &projectID, &d.Name, &nodesJSON, &pagesJSON, &viewportJSON, &historyJSON, &d.HistoryIndex, &syncedAt, &d.CreatedAt, &d.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if projectID.Valid {
		pid := int(projectID.Int64)
		d.ProjectID = &pid
	}
	if nodesJSON.Valid {
		d.NodesJSON = nodesJSON.String
	}
	if pagesJSON.Valid {
		d.PagesJSON = pagesJSON.String
	}
	if viewportJSON.Valid {
		d.ViewportJSON = viewportJSON.String
	}
	if historyJSON.Valid {
		d.HistoryJSON = historyJSON.String
	}
	if syncedAt.Valid {
		d.SyncedAt = &syncedAt.Time
	}

	return &d, nil
}

// UIDesignSave creates or updates a design (upsert by local_id)
func (s *Storage) UIDesignSave(design *UIDesign) error {
	now := time.Now()
	result, err := s.db.Exec(`
		INSERT INTO ui_designs (local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(local_id) DO UPDATE SET
			project_id = excluded.project_id,
			name = excluded.name,
			nodes_json = excluded.nodes_json,
			pages_json = excluded.pages_json,
			viewport_json = excluded.viewport_json,
			history_json = excluded.history_json,
			history_index = excluded.history_index,
			updated_at = excluded.updated_at
	`, design.LocalID, design.ProjectID, design.Name, design.NodesJSON, design.PagesJSON, design.ViewportJSON, design.HistoryJSON, design.HistoryIndex, now, now)

	if err != nil {
		return err
	}

	// Update the ID if this was an insert
	if design.ID == 0 {
		id, err := result.LastInsertId()
		if err == nil {
			design.ID = int(id)
		}
	}
	design.UpdatedAt = now

	return nil
}

// UIDesignDelete removes a design by local ID
func (s *Storage) UIDesignDelete(localID string) error {
	_, err := s.db.Exec(`DELETE FROM ui_designs WHERE local_id = ?`, localID)
	return err
}

// UIDesignGetByName retrieves a design by name (for a project or all if projectID is nil)
func (s *Storage) UIDesignGetByName(name string, projectID *int) (*UIDesign, error) {
	var query string
	var args []interface{}

	if projectID != nil {
		query = `
			SELECT id, local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, synced_at, created_at, updated_at
			FROM ui_designs WHERE LOWER(name) = LOWER(?) AND project_id = ?
			LIMIT 1
		`
		args = append(args, name, *projectID)
	} else {
		query = `
			SELECT id, local_id, project_id, name, nodes_json, pages_json, viewport_json, history_json, history_index, synced_at, created_at, updated_at
			FROM ui_designs WHERE LOWER(name) = LOWER(?)
			LIMIT 1
		`
		args = append(args, name)
	}

	var d UIDesign
	var pid sql.NullInt64
	var nodesJSON, pagesJSON, viewportJSON, historyJSON sql.NullString
	var syncedAt sql.NullTime

	err := s.db.QueryRow(query, args...).Scan(&d.ID, &d.LocalID, &pid, &d.Name, &nodesJSON, &pagesJSON, &viewportJSON, &historyJSON, &d.HistoryIndex, &syncedAt, &d.CreatedAt, &d.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if pid.Valid {
		p := int(pid.Int64)
		d.ProjectID = &p
	}
	if nodesJSON.Valid {
		d.NodesJSON = nodesJSON.String
	}
	if pagesJSON.Valid {
		d.PagesJSON = pagesJSON.String
	}
	if viewportJSON.Valid {
		d.ViewportJSON = viewportJSON.String
	}
	if historyJSON.Valid {
		d.HistoryJSON = historyJSON.String
	}
	if syncedAt.Valid {
		d.SyncedAt = &syncedAt.Time
	}

	return &d, nil
}

// ============================================================================
// Project Local Settings
// ============================================================================

// ProjectLocalSettings represents local settings for a project
type ProjectLocalSettings struct {
	ProjectID  int        `json:"project_id"`
	LocalPath  string     `json:"local_path,omitempty"`
	EditorPath string     `json:"editor_path,omitempty"`
	SyncedAt   *time.Time `json:"synced_at,omitempty"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// ProjectLocalSettingsGet retrieves settings for a project
func (s *Storage) ProjectLocalSettingsGet(projectID int) (*ProjectLocalSettings, error) {
	var settings ProjectLocalSettings
	var localPath, editorPath sql.NullString
	var syncedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT project_id, local_path, editor_path, synced_at, updated_at
		FROM project_local_settings WHERE project_id = ?
	`, projectID).Scan(&settings.ProjectID, &localPath, &editorPath, &syncedAt, &settings.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if localPath.Valid {
		settings.LocalPath = localPath.String
	}
	if editorPath.Valid {
		settings.EditorPath = editorPath.String
	}
	if syncedAt.Valid {
		settings.SyncedAt = &syncedAt.Time
	}

	return &settings, nil
}

// ProjectLocalSettingsSet creates or updates settings for a project
func (s *Storage) ProjectLocalSettingsSet(settings *ProjectLocalSettings) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO project_local_settings (project_id, local_path, editor_path, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(project_id) DO UPDATE SET
			local_path = excluded.local_path,
			editor_path = excluded.editor_path,
			updated_at = excluded.updated_at
	`, settings.ProjectID, settings.LocalPath, settings.EditorPath, now)

	if err == nil {
		settings.UpdatedAt = now
	}

	return err
}

// ============================================================================
// Pinned Items
// ============================================================================

// PinnedItem represents a pinned item in the UI
type PinnedItem struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Name         string    `json:"name"`
	Icon         string    `json:"icon,omitempty"`
	Path         string    `json:"path,omitempty"`
	Color        string    `json:"color,omitempty"`
	MetadataJSON string    `json:"metadata_json,omitempty"`
	SortOrder    int       `json:"sort_order"`
	PinnedAt     time.Time `json:"pinned_at"`
}

// PinnedItemList returns all pinned items sorted by sort_order
func (s *Storage) PinnedItemList() ([]*PinnedItem, error) {
	rows, err := s.db.Query(`
		SELECT id, type, name, icon, path, color, metadata_json, sort_order, pinned_at
		FROM pinned_items
		ORDER BY sort_order ASC, pinned_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*PinnedItem
	for rows.Next() {
		var item PinnedItem
		var icon, path, color, metadataJSON sql.NullString

		if err := rows.Scan(&item.ID, &item.Type, &item.Name, &icon, &path, &color, &metadataJSON, &item.SortOrder, &item.PinnedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in PinnedItemList: %v\n", err)
			continue
		}

		if icon.Valid {
			item.Icon = icon.String
		}
		if path.Valid {
			item.Path = path.String
		}
		if color.Valid {
			item.Color = color.String
		}
		if metadataJSON.Valid {
			item.MetadataJSON = metadataJSON.String
		}

		items = append(items, &item)
	}

	return items, nil
}

// PinnedItemAdd adds a new pinned item
func (s *Storage) PinnedItemAdd(item *PinnedItem) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO pinned_items (id, type, name, icon, path, color, metadata_json, sort_order, pinned_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			type = excluded.type,
			name = excluded.name,
			icon = excluded.icon,
			path = excluded.path,
			color = excluded.color,
			metadata_json = excluded.metadata_json,
			sort_order = excluded.sort_order
	`, item.ID, item.Type, item.Name, item.Icon, item.Path, item.Color, item.MetadataJSON, item.SortOrder, now)

	if err == nil && item.PinnedAt.IsZero() {
		item.PinnedAt = now
	}

	return err
}

// PinnedItemRemove removes a pinned item by ID
func (s *Storage) PinnedItemRemove(id string) error {
	_, err := s.db.Exec(`DELETE FROM pinned_items WHERE id = ?`, id)
	return err
}

// PinnedItemReorder updates the sort order of pinned items
func (s *Storage) PinnedItemReorder(orderedIDs []string) error {
	if len(orderedIDs) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`UPDATE pinned_items SET sort_order = ? WHERE id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, id := range orderedIDs {
		_, err := stmt.Exec(i, id)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// ============================================================================
// Sync Queue
// ============================================================================

// SyncQueueItem represents an item in the sync queue
type SyncQueueItem struct {
	ID         int       `json:"id"`
	TableName  string    `json:"table_name"`
	RecordID   string    `json:"record_id"`
	Operation  string    `json:"operation"`
	DataJSON   string    `json:"data_json,omitempty"`
	Status     string    `json:"status"`
	RetryCount int       `json:"retry_count"`
	CreatedAt  time.Time `json:"created_at"`
}

// SyncQueueAdd adds an item to the sync queue
func (s *Storage) SyncQueueAdd(tableName, recordID, operation, dataJSON string) error {
	_, err := s.db.Exec(`
		INSERT INTO sync_queue (table_name, record_id, operation, data_json, status)
		VALUES (?, ?, ?, ?, 'pending')
	`, tableName, recordID, operation, dataJSON)
	return err
}

// SyncQueueGetPending retrieves all pending items from the sync queue
func (s *Storage) SyncQueueGetPending(limit int) ([]*SyncQueueItem, error) {
	rows, err := s.db.Query(`
		SELECT id, table_name, record_id, operation, data_json, status, retry_count, created_at
		FROM sync_queue
		WHERE status = 'pending'
		ORDER BY created_at ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*SyncQueueItem
	for rows.Next() {
		var item SyncQueueItem
		var dataJSON sql.NullString

		if err := rows.Scan(&item.ID, &item.TableName, &item.RecordID, &item.Operation, &dataJSON, &item.Status, &item.RetryCount, &item.CreatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in SyncQueueGetPending: %v\n", err)
			continue
		}

		if dataJSON.Valid {
			item.DataJSON = dataJSON.String
		}

		items = append(items, &item)
	}

	return items, nil
}

// SyncQueueMarkComplete marks an item as completed and removes it
func (s *Storage) SyncQueueMarkComplete(id int) error {
	_, err := s.db.Exec(`DELETE FROM sync_queue WHERE id = ?`, id)
	return err
}

// SyncQueueMarkFailed marks an item as failed and increments retry count
func (s *Storage) SyncQueueMarkFailed(id int, maxRetries int) error {
	// If max retries exceeded, mark as failed; otherwise keep as pending and increment
	_, err := s.db.Exec(`
		UPDATE sync_queue
		SET retry_count = retry_count + 1,
		    status = CASE WHEN retry_count + 1 >= ? THEN 'failed' ELSE 'pending' END
		WHERE id = ?
	`, maxRetries, id)
	return err
}

// ============================================================================
// User Context (cached user/company info to avoid API calls)
// ============================================================================

// UserContext represents the cached current user context
type UserContext struct {
	UserID      int       `json:"user_id"`
	CompanyID   int       `json:"company_id"`
	UserJSON    string    `json:"user_json,omitempty"`
	CompanyJSON string    `json:"company_json,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// GetUserContext retrieves the cached user context
func (s *Storage) GetUserContext() (*UserContext, error) {
	var ctx UserContext
	var userJSON, companyJSON sql.NullString
	var userID, companyID sql.NullInt64

	err := s.db.QueryRow(`
		SELECT user_id, company_id, user_json, company_json, updated_at
		FROM user_context WHERE id = 1
	`).Scan(&userID, &companyID, &userJSON, &companyJSON, &ctx.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if userID.Valid {
		ctx.UserID = int(userID.Int64)
	}
	if companyID.Valid {
		ctx.CompanyID = int(companyID.Int64)
	}
	if userJSON.Valid {
		ctx.UserJSON = userJSON.String
	}
	if companyJSON.Valid {
		ctx.CompanyJSON = companyJSON.String
	}

	return &ctx, nil
}

// SetUserContext saves the user context cache
func (s *Storage) SetUserContext(userID, companyID int, userJSON, companyJSON string) error {
	_, err := s.db.Exec(`
		UPDATE user_context SET
			user_id = ?,
			company_id = ?,
			user_json = ?,
			company_json = ?,
			updated_at = ?
		WHERE id = 1
	`, userID, companyID, userJSON, companyJSON, time.Now())
	return err
}

// ClearUserContext clears the cached user context (on logout)
func (s *Storage) ClearUserContext() error {
	_, err := s.db.Exec(`
		UPDATE user_context SET
			user_id = NULL,
			company_id = NULL,
			user_json = NULL,
			company_json = NULL,
			updated_at = ?
		WHERE id = 1
	`, time.Now())
	return err
}

// GetCurrentCompanyID returns the cached company ID (fast, no API call)
func (s *Storage) GetCurrentCompanyID() int {
	ctx, err := s.GetUserContext()
	if err != nil || ctx == nil {
		return 0
	}
	return ctx.CompanyID
}

// ============================================================================
// AI Conversations (assistant chat history, keyed by context like project-123-ui)
// ============================================================================

// AIConversation represents an AI conversation entry
type AIConversation struct {
	ID           int        `json:"id"`
	ContextKey   string     `json:"context_key"`
	UserID       int        `json:"user_id"`
	CompanyID    int        `json:"company_id"`
	MessagesJSON string     `json:"messages_json"`
	SyncedAt     *time.Time `json:"synced_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// GetAIConversation retrieves messages for a context key (for current user/company)
func (s *Storage) GetAIConversation(contextKey string, userID, companyID int) (*AIConversation, error) {
	var conv AIConversation
	var syncedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT id, context_key, user_id, company_id, messages_json, synced_at, created_at, updated_at
		FROM ai_conversations
		WHERE context_key = ? AND user_id = ? AND company_id = ?
	`, contextKey, userID, companyID).Scan(&conv.ID, &conv.ContextKey, &conv.UserID, &conv.CompanyID, &conv.MessagesJSON, &syncedAt, &conv.CreatedAt, &conv.UpdatedAt)

	if err != nil {
		return nil, err
	}

	if syncedAt.Valid {
		conv.SyncedAt = &syncedAt.Time
	}

	return &conv, nil
}

// SaveAIConversation saves messages for a context key
func (s *Storage) SaveAIConversation(contextKey string, userID, companyID int, messagesJSON string) error {
	now := time.Now()
	_, err := s.db.Exec(`
		INSERT INTO ai_conversations (context_key, user_id, company_id, messages_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(context_key, user_id, company_id) DO UPDATE SET
			messages_json = excluded.messages_json,
			updated_at = excluded.updated_at
	`, contextKey, userID, companyID, messagesJSON, now, now)
	return err
}

// UpsertAIMessage upserts a single message in the conversation blob.
// Loads existing messages, finds by messageIndex, replaces or appends, saves back.
// This avoids sending the entire conversation on every change.
// Uses per-contextKey mutex to prevent lost-update races on concurrent writes.
func (s *Storage) UpsertAIMessage(contextKey string, userID, companyID int, messageIndex int, messageJSON string) error {
	// Serialize writes per conversation key to prevent lost updates
	mu, _ := s.upsertMu.LoadOrStore(contextKey, &sync.Mutex{})
	mu.(*sync.Mutex).Lock()
	defer mu.(*sync.Mutex).Unlock()

	// Load existing conversation
	conv, err := s.GetAIConversation(contextKey, userID, companyID)

	var messages []json.RawMessage
	if err == nil && conv != nil {
		if jsonErr := json.Unmarshal([]byte(conv.MessagesJSON), &messages); jsonErr != nil {
			messages = nil // corrupted — start fresh
		}
	}

	msgRaw := json.RawMessage(messageJSON)

	// Replace at index or append
	if messageIndex >= 0 && messageIndex < len(messages) {
		messages[messageIndex] = msgRaw
	} else {
		messages = append(messages, msgRaw)
	}

	// Serialize and save
	data, err := json.Marshal(messages)
	if err != nil {
		return fmt.Errorf("marshal messages: %w", err)
	}

	return s.SaveAIConversation(contextKey, userID, companyID, string(data))
}

// GetAllAIConversations retrieves all AI conversations for a user/company
func (s *Storage) GetAllAIConversations(userID, companyID int) ([]*AIConversation, error) {
	rows, err := s.db.Query(`
		SELECT id, context_key, user_id, company_id, messages_json, synced_at, created_at, updated_at
		FROM ai_conversations
		WHERE user_id = ? AND company_id = ?
		ORDER BY updated_at DESC
	`, userID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*AIConversation
	for rows.Next() {
		var conv AIConversation
		var syncedAt sql.NullTime
		if err := rows.Scan(&conv.ID, &conv.ContextKey, &conv.UserID, &conv.CompanyID, &conv.MessagesJSON, &syncedAt, &conv.CreatedAt, &conv.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in GetAllAIConversations: %v\n", err)
			continue
		}
		if syncedAt.Valid {
			conv.SyncedAt = &syncedAt.Time
		}
		conversations = append(conversations, &conv)
	}
	return conversations, nil
}

// GetAIConversationsForSync retrieves conversations that need syncing (updated since last sync)
func (s *Storage) GetAIConversationsForSync(userID, companyID int) ([]*AIConversation, error) {
	rows, err := s.db.Query(`
		SELECT id, context_key, user_id, company_id, messages_json, synced_at, created_at, updated_at
		FROM ai_conversations
		WHERE user_id = ? AND company_id = ? AND (synced_at IS NULL OR updated_at > synced_at)
		ORDER BY updated_at ASC
	`, userID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*AIConversation
	for rows.Next() {
		var conv AIConversation
		var syncedAt sql.NullTime
		if err := rows.Scan(&conv.ID, &conv.ContextKey, &conv.UserID, &conv.CompanyID, &conv.MessagesJSON, &syncedAt, &conv.CreatedAt, &conv.UpdatedAt); err != nil {
			fmt.Fprintf(os.Stderr, "[storage] scan error in GetAIConversationsForSync: %v\n", err)
			continue
		}
		if syncedAt.Valid {
			conv.SyncedAt = &syncedAt.Time
		}
		conversations = append(conversations, &conv)
	}
	return conversations, nil
}

// MarkAIConversationSynced marks a conversation as synced
func (s *Storage) MarkAIConversationSynced(id int) error {
	_, err := s.db.Exec(`UPDATE ai_conversations SET synced_at = ? WHERE id = ?`, time.Now(), id)
	return err
}

// DeleteAIConversation removes a conversation by context key for user/company
func (s *Storage) DeleteAIConversation(contextKey string, userID, companyID int) error {
	_, err := s.db.Exec(`DELETE FROM ai_conversations WHERE context_key = ? AND user_id = ? AND company_id = ?`, contextKey, userID, companyID)
	return err
}

// ClearAIConversations removes all AI conversations for a user/company
func (s *Storage) ClearAIConversations(userID, companyID int) error {
	_, err := s.db.Exec(`DELETE FROM ai_conversations WHERE user_id = ? AND company_id = ?`, userID, companyID)
	return err
}
