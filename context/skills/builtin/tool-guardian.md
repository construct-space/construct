---
id: builtin.tool-guardian
name: Tool Guardian
category: core
description: Validates and optionally blocks tool calls based on configurable rules
version: 1.0.0
author: Construct
icon: shield
enabled: false

settings:
  blockedTools:
    type: array
    description: List of tool names to block
    default: []
  allowedTools:
    type: array
    description: List of allowed tools (if set, only these can run)
    default: []
  requireConfirmation:
    type: array
    description: Tools that require user confirmation
    default: []

hooks:
  - id: validate-tool-call
    name: Tool Call Validator
    type: tool.call.start
    priority: 0
    action: validate
    description: Validates tool calls against blocked/allowed lists
    config:
      blockedTools: []

  - id: log-blocked-tool
    name: Log Blocked Tools
    type: tool.call.start
    priority: 1
    action: log
    description: Logs when a tool is blocked
---

# Tool Guardian Skill

Provides security controls for tool execution:

## Features

- **Blocklist**: Prevent specific tools from running
- **Allowlist**: Only permit specific tools
- **Confirmation**: Require user approval for sensitive tools

## Configuration

```yaml
settings:
  blockedTools:
    - dangerous_command
    - rm_rf
  allowedTools: []  # Empty means all non-blocked tools allowed
  requireConfirmation:
    - file_write
    - shell_exec
```

## Use Cases

- Prevent accidental destructive operations
- Enforce security policies
- Audit tool usage
