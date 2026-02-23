package svc

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileLogger_InitAndWrite(t *testing.T) {
	// Create a temp directory to act as dataDir
	tmpDir := t.TempDir()

	s := &Service{}
	s.InitLogger(tmpDir)
	defer func() {
		if s.LogFile != nil {
			s.LogFile.Close()
		}
	}()

	if s.Logger == nil {
		t.Fatal("expected logger to be initialized")
	}

	// Write a log entry
	s.Logf("[test] req=%s message=%s", "test-123", "hello world")

	// Verify log file was created and contains content
	logPath := filepath.Join(tmpDir, "logs", "context.log")
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("expected log file at %s, got error: %v", logPath, err)
	}

	content := string(data)
	if !strings.Contains(content, "[test]") {
		t.Errorf("expected log to contain '[test]', got: %s", content)
	}
	if !strings.Contains(content, "req=test-123") {
		t.Errorf("expected log to contain 'req=test-123', got: %s", content)
	}
}

func TestFileLogger_Rotation(t *testing.T) {
	tmpDir := t.TempDir()
	logDir := filepath.Join(tmpDir, "logs")
	os.MkdirAll(logDir, 0755)

	// Create a log file > 10MB
	logPath := filepath.Join(logDir, "context.log")
	bigData := make([]byte, 11*1024*1024) // 11MB
	for i := range bigData {
		bigData[i] = 'x'
	}
	os.WriteFile(logPath, bigData, 0644)

	s := &Service{}
	s.InitLogger(tmpDir)
	defer func() {
		if s.LogFile != nil {
			s.LogFile.Close()
		}
	}()

	// Old log should be rotated to .1
	rotatedPath := logPath + ".1"
	if _, err := os.Stat(rotatedPath); os.IsNotExist(err) {
		t.Error("expected rotated log file at context.log.1")
	}

	// New log file should exist and be small
	info, err := os.Stat(logPath)
	if err != nil {
		t.Fatal("expected new log file to exist")
	}
	if info.Size() > 1024 {
		t.Errorf("expected new log file to be small, got %d bytes", info.Size())
	}
}
