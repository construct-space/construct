package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPServer connects to a remote MCP server over HTTP (streamable) transport.
type HTTPServer struct {
	url       string
	client    *http.Client
	tools     []Tool
	sessionID string
}

// NewHTTPServer creates a new HTTP MCP server client.
func NewHTTPServer(url string) *HTTPServer {
	return &HTTPServer{
		url: url,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// jsonrpcRequest is a JSON-RPC 2.0 request
type jsonrpcRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// jsonrpcResponse is a JSON-RPC 2.0 response
type jsonrpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonrpcError   `json:"error,omitempty"`
}

type jsonrpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Initialize sends the initialize request and fetches tools from the remote server.
func (s *HTTPServer) Initialize() error {
	// Step 1: Initialize
	initResp, err := s.call("initialize", map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo": map[string]any{
			"name":    "construct",
			"version": "1.0.0",
		},
	})
	if err != nil {
		return fmt.Errorf("initialize failed: %w", err)
	}

	// Check if we got a valid response
	var initResult map[string]any
	if err := json.Unmarshal(initResp, &initResult); err != nil {
		return fmt.Errorf("failed to parse initialize response: %w", err)
	}

	// Step 2: Send initialized notification (no response expected)
	_ = s.notify("notifications/initialized", nil)

	// Step 3: List tools
	toolsResp, err := s.call("tools/list", nil)
	if err != nil {
		return fmt.Errorf("tools/list failed: %w", err)
	}

	var toolsResult struct {
		Tools []struct {
			Name        string                 `json:"name"`
			Description string                 `json:"description"`
			InputSchema map[string]interface{} `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(toolsResp, &toolsResult); err != nil {
		return fmt.Errorf("failed to parse tools response: %w", err)
	}

	s.tools = make([]Tool, len(toolsResult.Tools))
	for i, t := range toolsResult.Tools {
		s.tools[i] = Tool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		}
	}

	return nil
}

// GetTools returns the cached tools from the remote server.
func (s *HTTPServer) GetTools() []Tool {
	return s.tools
}

// CallTool calls a tool on the remote server.
func (s *HTTPServer) CallTool(name string, args map[string]interface{}) (string, error) {
	resp, err := s.call("tools/call", map[string]any{
		"name":      name,
		"arguments": args,
	})
	if err != nil {
		return "", err
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return string(resp), nil
	}

	// Concatenate all text content
	var text string
	for _, c := range result.Content {
		if c.Type == "text" {
			text += c.Text
		}
	}
	if text == "" {
		return string(resp), nil
	}
	return text, nil
}

// call sends a JSON-RPC request and returns the result.
func (s *HTTPServer) call(method string, params interface{}) (json.RawMessage, error) {
	reqBody := jsonrpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", s.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if s.sessionID != "" {
		req.Header.Set("Mcp-Session-Id", s.sessionID)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Capture session ID from response
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		s.sessionID = sid
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var rpcResp jsonrpcResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("failed to parse JSON-RPC response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}

// notify sends a JSON-RPC notification (no ID, no response expected).
func (s *HTTPServer) notify(method string, params interface{}) error {
	type notification struct {
		JSONRPC string      `json:"jsonrpc"`
		Method  string      `json:"method"`
		Params  interface{} `json:"params,omitempty"`
	}

	body, err := json.Marshal(notification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", s.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.sessionID != "" {
		req.Header.Set("Mcp-Session-Id", s.sessionID)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Capture session ID
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		s.sessionID = sid
	}

	return nil
}
