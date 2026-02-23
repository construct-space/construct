package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SSEServer connects to a remote MCP server over SSE transport.
// SSE transport uses GET /sse for event stream and POST /messages for requests.
// Auto-reconnects when the connection drops.
type SSEServer struct {
	baseURL     string
	endpointURL string
	client      *http.Client
	tools       []Tool

	// SSE stream management
	mu        sync.Mutex
	responses map[int]chan json.RawMessage
	nextID    int
	connected bool
}

// NewSSEServer creates a new SSE MCP server client.
func NewSSEServer(baseURL string) *SSEServer {
	return &SSEServer{
		baseURL: strings.TrimRight(baseURL, "/"),
		client: &http.Client{
			Timeout: 0,
		},
		responses: make(map[int]chan json.RawMessage),
		nextID:    1,
	}
}

// Initialize connects to the SSE stream, performs MCP handshake, and fetches tools.
func (s *SSEServer) Initialize() error {
	return s.handshake()
}

// handshake connects SSE, runs MCP init, and lists tools.
func (s *SSEServer) handshake() error {
	if err := s.connectSSE(); err != nil {
		return fmt.Errorf("SSE connect failed: %w", err)
	}

	initResp, err := s.callDirect("initialize", map[string]any{
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

	var initResult map[string]any
	if err := json.Unmarshal(initResp, &initResult); err != nil {
		return fmt.Errorf("failed to parse initialize response: %w", err)
	}

	_ = s.notifyDirect("notifications/initialized", nil)

	toolsResp, err := s.callDirect("tools/list", nil)
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

// reconnect re-establishes the SSE connection and MCP handshake.
func (s *SSEServer) reconnect() error {
	s.mu.Lock()
	s.connected = false
	s.endpointURL = ""
	// Drain any pending response channels
	for id, ch := range s.responses {
		close(ch)
		delete(s.responses, id)
	}
	s.mu.Unlock()

	return s.handshake()
}

// GetTools returns the cached tools from the remote server.
func (s *SSEServer) GetTools() []Tool {
	return s.tools
}

// CallTool calls a tool on the remote server with auto-reconnect.
func (s *SSEServer) CallTool(name string, args map[string]interface{}) (string, error) {
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

// connectSSE establishes the SSE connection and starts reading events.
func (s *SSEServer) connectSSE() error {
	sseURL := s.baseURL + "/sse"

	req, err := http.NewRequest("GET", sseURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")

	sseClient := &http.Client{Timeout: 0}
	resp, err := sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to SSE: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return fmt.Errorf("SSE connection returned HTTP %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	endpointFound := false

	done := make(chan struct{})
	go func() {
		defer close(done)
		var eventType string
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "event: ") {
				eventType = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				if eventType == "endpoint" {
					if strings.HasPrefix(data, "/") {
						s.endpointURL = s.baseURL + data
					} else {
						s.endpointURL = data
					}
					endpointFound = true
					return
				}
			}
		}
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		resp.Body.Close()
		return fmt.Errorf("timeout waiting for SSE endpoint event")
	}

	if !endpointFound {
		resp.Body.Close()
		return fmt.Errorf("SSE stream closed without providing endpoint")
	}

	go s.readSSEEvents(resp, scanner)

	s.mu.Lock()
	s.connected = true
	s.mu.Unlock()
	return nil
}

// readSSEEvents reads SSE events in the background and dispatches responses.
func (s *SSEServer) readSSEEvents(resp *http.Response, scanner *bufio.Scanner) {
	defer resp.Body.Close()

	var eventType string
	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			eventType = ""
			continue
		}

		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")

			if eventType == "message" {
				var rpcResp jsonrpcResponse
				if err := json.Unmarshal([]byte(data), &rpcResp); err != nil {
					continue
				}

				s.mu.Lock()
				if ch, ok := s.responses[rpcResp.ID]; ok {
					// Use a func with recover to guard against sending on a
					// channel that was closed by the timeout path in callDirect.
					func() {
						defer func() { recover() }()
						select {
						case ch <- []byte(data):
						default:
						}
					}()
					delete(s.responses, rpcResp.ID)
				}
				s.mu.Unlock()
			}
		}
	}

	s.mu.Lock()
	s.connected = false
	s.mu.Unlock()
}

// call sends a JSON-RPC request with auto-reconnect on stale connection.
func (s *SSEServer) call(method string, params interface{}) (json.RawMessage, error) {
	result, err := s.callDirect(method, params)
	if err != nil && isStaleConnectionError(err) {
		// Reconnect and retry once
		if reconnErr := s.reconnect(); reconnErr != nil {
			return nil, fmt.Errorf("reconnect failed: %w (original: %v)", reconnErr, err)
		}
		return s.callDirect(method, params)
	}
	return result, err
}

// isStaleConnectionError returns true if the error indicates a dropped SSE connection.
func isStaleConnectionError(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "404") ||
		strings.Contains(msg, "not connected") ||
		strings.Contains(msg, "timeout waiting for response")
}

// callDirect sends a JSON-RPC request without reconnect logic.
func (s *SSEServer) callDirect(method string, params interface{}) (json.RawMessage, error) {
	s.mu.Lock()
	if s.endpointURL == "" {
		s.mu.Unlock()
		return nil, fmt.Errorf("not connected (no endpoint URL)")
	}
	id := s.nextID
	s.nextID++
	ch := make(chan json.RawMessage, 1)
	s.responses[id] = ch
	endpoint := s.endpointURL
	s.mu.Unlock()

	reqBody := jsonrpcRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		s.mu.Lock()
		delete(s.responses, id)
		s.mu.Unlock()
		return nil, err
	}

	postClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		s.mu.Lock()
		delete(s.responses, id)
		s.mu.Unlock()
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := postClient.Do(req)
	if err != nil {
		s.mu.Lock()
		delete(s.responses, id)
		s.mu.Unlock()
		return nil, fmt.Errorf("POST request failed: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusNoContent {
		s.mu.Lock()
		delete(s.responses, id)
		s.mu.Unlock()
		return nil, fmt.Errorf("POST returned HTTP %d", resp.StatusCode)
	}

	select {
	case data, ok := <-ch:
		if !ok {
			return nil, fmt.Errorf("connection closed while waiting for response")
		}
		var rpcResp jsonrpcResponse
		if err := json.Unmarshal(data, &rpcResp); err != nil {
			return nil, fmt.Errorf("failed to parse JSON-RPC response: %w", err)
		}
		if rpcResp.Error != nil {
			return nil, fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
		}
		return rpcResp.Result, nil
	case <-time.After(30 * time.Second):
		s.mu.Lock()
		delete(s.responses, id)
		close(ch)
		s.mu.Unlock()
		return nil, fmt.Errorf("timeout waiting for response to %s", method)
	}
}

// notifyDirect sends a JSON-RPC notification without reconnect logic.
func (s *SSEServer) notifyDirect(method string, params interface{}) error {
	s.mu.Lock()
	endpoint := s.endpointURL
	s.mu.Unlock()

	if endpoint == "" {
		return fmt.Errorf("not connected (no endpoint URL)")
	}

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

	postClient := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := postClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()

	return nil
}
