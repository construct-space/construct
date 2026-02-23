package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"construct-context/handlers"
	"construct-context/mcp"
	"construct-context/providers"
	"construct-context/svc"
)

// dispatch routes incoming requests to the appropriate handler.
func dispatch(s *svc.Service, req svc.Request) svc.Response {
	switch {
	case req.Type == "system.ping" || req.Type == "system.info":
		return handlers.HandleSystemContextAgent(s, req)
	case strings.HasPrefix(req.Type, "context.") || strings.HasPrefix(req.Type, "agent."):
		return handlers.HandleSystemContextAgent(s, req)
	case strings.HasPrefix(req.Type, "agents."):
		return handlers.HandleAgentsMCP(s, req)
	case strings.HasPrefix(req.Type, "mcp."):
		return handlers.HandleAgentsMCP(s, req)
	case strings.HasPrefix(req.Type, "conversation."):
		return handlers.HandleConversation(s, req)
	case strings.HasPrefix(req.Type, "ai.conversations."):
		return handlers.HandleAIConversations(s, req)
	case strings.HasPrefix(req.Type, "ai.") || req.Type == "code.complete":
		return handlers.HandleAI(s, req)
	case strings.HasPrefix(req.Type, "auth.anthropic."):
		return handlers.HandleAuth(s, req)
	case strings.HasPrefix(req.Type, "auth.openai."):
		return handlers.HandleAuth(s, req)
	case strings.HasPrefix(req.Type, "auth.") || strings.HasPrefix(req.Type, "user.") || strings.HasPrefix(req.Type, "settings."):
		return handlers.HandleAuth(s, req)
	case strings.HasPrefix(req.Type, "kv."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "storage."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "designs."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "project_settings."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "pinned."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "tools."):
		return handlers.HandleStorage(s, req)
	case strings.HasPrefix(req.Type, "hooks."):
		return handlers.HandleHooksSkills(s, req)
	case strings.HasPrefix(req.Type, "skills."):
		return handlers.HandleHooksSkills(s, req)
	case strings.HasPrefix(req.Type, "rag."):
		return handlers.HandleRAG(s, req)
	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown request type: " + req.Type}
	}
}

// handleConnection handles a single client connection
func handleConnection(s *svc.Service, conn net.Conn) {
	defer conn.Close()

	s.ClientsMu.Lock()
	s.Clients[conn] = true
	s.ClientsMu.Unlock()

	defer func() {
		s.ClientsMu.Lock()
		delete(s.Clients, conn)
		s.ClientsMu.Unlock()
	}()

	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}

		var req svc.Request
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			resp := svc.Response{Success: false, Error: "invalid JSON"}
			data, _ := json.Marshal(resp)
			conn.Write(append(data, '\n'))
			continue
		}

		// Handle streaming requests specially
		if req.Type == "ai.chat_stream" {
			handlers.HandleStreamingChat(s, conn, req)
			continue
		}
		if req.Type == "ai.vision_analyze" {
			s.HandleVisionAnalyze(conn, req)
			continue
		}

		resp := dispatch(s, req)
		data, _ := json.Marshal(resp)
		conn.Write(append(data, '\n'))
	}
}

func main() {
	startMain := time.Now()

	// Get data directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	dataDir := homeDir + "/.construct-personal"
	dbPath := dataDir + "/personal.db"

	// Initialize storage
	startStorage := time.Now()
	storage, err := svc.NewStorage(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to initialize storage: %v\n", err)
		// Continue without storage
	} else {
		defer storage.Close()
		fmt.Fprintf(os.Stderr, "Storage initialized at %s\n", dbPath)
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] Storage init took %v\n", time.Since(startStorage))

	// Initialize provider registry
	startProviders := time.Now()
	providerRegistry := providers.NewRegistry()

	// Register Gemini provider
	geminiAPIKey := os.Getenv("GEMINI_API_KEY")
	if geminiAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: GEMINI_API_KEY not set. Gemini provider will not work.\n")
	}
	geminiProvider := providers.NewGeminiProvider(geminiAPIKey)
	providerRegistry.Register(geminiProvider)

	// Register DeepSeek provider (unified OpenAI-compatible)
	deepseekAPIKey := os.Getenv("DEEPSEEK_API_KEY")
	if deepseekAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: DEEPSEEK_API_KEY not set. DeepSeek provider will not work.\n")
	}
	deepseekProvider := providers.NewDeepSeekProviderV2(deepseekAPIKey)
	providerRegistry.Register(deepseekProvider)

	// Register xAI provider (unified OpenAI-compatible)
	xaiAPIKey := os.Getenv("XAI_API_KEY")
	if xaiAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: XAI_API_KEY not set. xAI provider will not work.\n")
	}
	xaiProvider := providers.NewXAIProviderV2(xaiAPIKey)
	providerRegistry.Register(xaiProvider)

	// Register Anthropic provider (API key - disabled, using OAuth instead)
	// anthropicAPIKey := os.Getenv("ANTHROPIC_API_KEY")
	// if anthropicAPIKey == "" {
	// 	anthropicAPIKey = ""
	// }
	// anthropicProvider := providers.NewAnthropicProvider(anthropicAPIKey)
	// providerRegistry.Register(anthropicProvider)

	// Register Z.ai provider (unified OpenAI-compatible)
	zaiAPIKey := os.Getenv("ZAI_API_KEY")
	if zaiAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: ZAI_API_KEY not set. Z.ai provider will not work.\n")
	}
	zaiProvider := providers.NewZAIProviderV2(zaiAPIKey)
	providerRegistry.Register(zaiProvider)

	// Register Xiaomi MiMo provider
	mimoAPIKey := os.Getenv("MIMO_API_KEY")
	if mimoAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: MIMO_API_KEY not set. MiMo provider will not work.\n")
	}
	mimoProvider := providers.NewMiMoProvider(mimoAPIKey)
	providerRegistry.Register(mimoProvider)

	// Register Moonshot AI (Kimi) provider
	kimiAPIKey := os.Getenv("KIMI_API_KEY")
	if kimiAPIKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: KIMI_API_KEY not set. Kimi provider will not work.\n")
	}
	kimiProvider := providers.NewMoonshotProvider(kimiAPIKey)
	providerRegistry.Register(kimiProvider)

	// Register LM Studio provider (local OpenAI-compatible server)
	lmStudioURL := os.Getenv("LMSTUDIO_URL")
	if lmStudioURL == "" {
		lmStudioURL = "http://localhost:1234/v1"
	}
	lmStudioProvider := providers.NewOpenAICompatibleProvider(providers.OpenAIProviderConfig{
		Name:    "LM Studio",
		Key:     "lmstudio",
		BaseURL: lmStudioURL,
		APIKey:  "lm-studio", // LM Studio doesn't require a real key but needs a non-empty value
		Models: []string{
			"mistralai/ministral-3-3b",
		},
	})
	providerRegistry.Register(lmStudioProvider)

	// Set DeepSeek as default
	providerRegistry.SetDefault("deepseek")
	fmt.Fprintf(os.Stderr, "[context] [perf] Provider registration took %v\n", time.Since(startProviders))

	// Initialize image generation router (sorted by cost — cheapest first)
	imageGenRouter := svc.NewImageGenRouter()
	imageGenRouter.AddProvider(&svc.ImageGenProvider{
		ID: "zai", Name: "Z.ai CogView-4", Model: "cogview-4-250304",
		BaseURL: "https://api.z.ai/api/paas/v4", APIKey: zaiAPIKey, Cost: 0.01,
	})
	imageGenRouter.AddProvider(&svc.ImageGenProvider{
		ID: "xai", Name: "xAI Grok Imagine", Model: "grok-imagine-image",
		BaseURL: "https://api.x.ai/v1", APIKey: xaiAPIKey, Cost: 0.02,
	})

	// Register MCP servers
	startMCP := time.Now()
	mcp.DefaultManager.RegisterZAI(zaiAPIKey)

	// Load persisted MCP configs
	svc.McpConfigPath = dataDir + "/mcp.json"
	if err := mcp.DefaultManager.LoadConfig(svc.McpConfigPath); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to load MCP config: %v\n", err)
	}
	fmt.Fprintf(os.Stderr, "[context] [perf] MCP setup (register + load config) took %v\n", time.Since(startMCP))
	// Auto-connect any saved URL servers in background (network calls, don't block startup)
	go func() {
		startAutoConnect := time.Now()
		servers := mcp.DefaultManager.List()
		fmt.Fprintf(os.Stderr, "[context] [mcp] Background auto-connect starting for %d servers\n", len(servers))
		for _, info := range servers {
			if info.Type == mcp.ServerTypeURL && info.Enabled && info.Status != mcp.StatusRunning {
				startConnect := time.Now()
				if err := mcp.DefaultManager.Enable(info.ID); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: Failed to connect MCP server %s: %v\n", info.ID, err)
				}
				fmt.Fprintf(os.Stderr, "[context] [perf] MCP auto-connect %s took %v\n", info.ID, time.Since(startConnect))
			}
		}
		fmt.Fprintf(os.Stderr, "[context] [mcp] Background auto-connect finished in %v\n", time.Since(startAutoConnect))
	}()
	fmt.Fprintf(os.Stderr, "Registered MCP servers: zai\n")

	// Log registered providers
	var providerNames []string
	for key := range providerRegistry.All() {
		providerNames = append(providerNames, key)
	}
	fmt.Fprintf(os.Stderr, "Registered providers: %s (default: %s)\n", strings.Join(providerNames, ", "), providerRegistry.DefaultKey())
	fmt.Fprintf(os.Stderr, "Available model IDs: %v\n", providerRegistry.AllModelIDs())

	// Listen on TCP port
	startListen := time.Now()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
	defer listener.Close()
	fmt.Fprintf(os.Stderr, "[context] [perf] TCP listen took %v\n", time.Since(startListen))

	addr := listener.Addr().(*net.TCPAddr)
	fmt.Printf("CONTEXT_ADDR=127.0.0.1:%d\n", addr.Port)

	// Default API base URL (can be updated via auth.set_api_base)
	apiBaseURL := os.Getenv("CONSTRUCT_API_URL")
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8000" // Default construct-api URL
	}

	// Read API key from environment variable; warn if not configured
	apiKey := os.Getenv("CONSTRUCT_API_KEY")
	if apiKey == "" {
		fmt.Fprintf(os.Stderr, "[context] WARNING: CONSTRUCT_API_KEY not set. API authentication to construct-api will not work.\n")
	}

	startNewService := time.Now()
	service := svc.NewService(storage, apiBaseURL, apiKey, providerRegistry)
	service.ImageGen = imageGenRouter
	service.InitLogger(dataDir)
	fmt.Fprintf(os.Stderr, "[context] [perf] NewService took %v\n", time.Since(startNewService))

	fmt.Fprintf(os.Stderr, "[context] [perf] === Total startup took %v ===\n", time.Since(startMain))

	for {
		conn, err := listener.Accept()
		if err != nil {
			continue
		}
		go handleConnection(service, conn)
	}
}
