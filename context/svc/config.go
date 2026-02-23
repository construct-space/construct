package svc

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// McpConfigPath is the file path for persisting MCP server configs.
var McpConfigPath string

// OpenAIOAuthConfig holds OpenAI OAuth configuration.
type OpenAIOAuthConfig struct {
	ClientID     string
	ClientSecret string
	AuthorizeURL string
	TokenURL     string
	RedirectURI  string
	Scope        string
}

// GetOpenAIOAuthConfig returns the OpenAI OAuth configuration from environment.
func GetOpenAIOAuthConfig() OpenAIOAuthConfig {
	return OpenAIOAuthConfig{
		ClientID:     strings.TrimSpace(os.Getenv("OPENAI_OAUTH_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("OPENAI_OAUTH_CLIENT_SECRET")),
		AuthorizeURL: strings.TrimSpace(DefaultIfEmpty(os.Getenv("OPENAI_OAUTH_AUTHORIZE_URL"), "https://auth.openai.com/oauth/authorize")),
		TokenURL:     strings.TrimSpace(DefaultIfEmpty(os.Getenv("OPENAI_OAUTH_TOKEN_URL"), "https://auth.openai.com/oauth/token")),
		RedirectURI:  strings.TrimSpace(DefaultIfEmpty(os.Getenv("OPENAI_OAUTH_REDIRECT_URI"), "https://platform.openai.com/oauth/callback")),
		Scope:        strings.TrimSpace(DefaultIfEmpty(os.Getenv("OPENAI_OAUTH_SCOPE"), "openid profile email offline_access")),
	}
}

// DefaultIfEmpty returns value if non-empty, otherwise fallback.
func DefaultIfEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

// ParseBoolSetting parses a string as a boolean with a fallback.
func ParseBoolSetting(value string, fallback bool) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case "":
		return fallback
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

// InitLogger sets up file logging to ~/.construct/logs/context.log.
// Simple rotation: if existing log > 10MB, rename to context.log.1.
func (s *Service) InitLogger(dataDir string) {
	logDir := filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "[context] WARNING: Failed to create log dir %s: %v\n", logDir, err)
		s.Logger = log.New(os.Stderr, "", 0) // fallback to stderr
		return
	}

	logPath := filepath.Join(logDir, "context.log")

	// Simple rotation: if > 10MB, rename to .1
	if info, err := os.Stat(logPath); err == nil && info.Size() > 10*1024*1024 {
		os.Rename(logPath, logPath+".1")
	}

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[context] WARNING: Failed to open log file %s: %v\n", logPath, err)
		s.Logger = log.New(os.Stderr, "", 0)
		return
	}

	s.LogFile = f
	s.Logger = log.New(f, "", 0) // no prefix — we add our own timestamps
	fmt.Fprintf(os.Stderr, "[context] Log file: %s\n", logPath)
}

// Logf writes a structured log entry with timestamp.
func (s *Service) Logf(format string, args ...interface{}) {
	if s.Logger == nil {
		return
	}
	ts := time.Now().Format("2006-01-02 15:04:05.000")
	s.Logger.Printf(ts+" "+format, args...)
}
