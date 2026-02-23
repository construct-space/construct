# MCP Servers

Model Context Protocol (MCP) servers for integrating external services into Construct.

## Available MCP Servers

### Z.AI (`zai/`)

Z.AI (智谱AI) integration providing:

- **zai_chat** - Text chat with GLM models
- **zai_vision** - Image analysis with GLM-4.6V
- **zai_web_search** - Web search via Z.AI search engine
- **zai_image_generate** - Image generation with CogView-4

## Usage

```go
import "construct-context/mcp/zai"

// Create server
server := zai.NewServer(apiKey)

// Get available tools
tools := server.GetTools()

// Call a tool
result, err := server.CallTool("zai_chat", map[string]interface{}{
    "prompt": "Hello!",
    "model": "glm-4.7",
})
```

## Adding New MCP Servers

1. Create a new directory: `mcp/[provider]/`
2. Implement `server.go` with:
   - `NewServer(config)` constructor
   - `GetTools() []Tool` method
   - `CallTool(name, args)` method
3. Register in main.go if needed

## Tool Definition Format

```go
Tool{
    Name:        "tool_name",
    Description: "What the tool does",
    InputSchema: map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "param1": map[string]interface{}{
                "type":        "string",
                "description": "Parameter description",
            },
        },
        "required": []string{"param1"},
    },
}
```
