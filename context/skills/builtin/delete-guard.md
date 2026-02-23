---
id: builtin.delete-guard
name: Delete Guard
category: core
description: Blocks file/data deletion unless user explicitly says DELETE
version: 1.0.0
author: Construct
icon: trash-2
enabled: true

settings:
  requireExplicitDelete:
    type: boolean
    description: Require "DELETE" keyword in user message
    default: true
  protectedPaths:
    type: array
    description: Paths that always require confirmation
    default: ["src/", "app/", "lib/", "packages/"]
  allowedPatterns:
    type: array
    description: File patterns that can be deleted without confirmation
    default: ["*.tmp", "*.log", "node_modules/", ".cache/"]

hooks:
  - id: block-delete-operations
    name: Block Delete Operations
    type: tool.call.start
    priority: 0
    action: validate
    description: Block delete operations unless user said DELETE
    config:
      tools: [delete_file, remove_file, rm, unlink]
      requireKeyword: "DELETE"

  - id: block-destructive-git
    name: Block Destructive Git
    type: tool.call.start
    priority: 0
    action: validate
    description: Block destructive git operations
    config:
      tools: [git_reset_hard, git_clean, git_force_push]
      requireKeyword: "DELETE"

  - id: log-blocked-deletion
    name: Log Blocked Deletion
    type: tool.call.start
    priority: 1
    action: log
    description: Log when deletion is blocked
---

# Delete Guard Skill

Prevents accidental file and data deletion by requiring explicit user confirmation.

## How It Works

The AI will NOT delete files unless the user's message contains the word **DELETE** (case-insensitive).

### Without DELETE keyword:
```
User: "Clean up the old config files"
AI: "I found 5 old config files. To delete them, please confirm
     by saying 'DELETE the old config files'"
```

### With DELETE keyword:
```
User: "DELETE the old config files"
AI: "Deleting 5 config files..." [proceeds with deletion]
```

## Protected Operations

| Operation | Requires DELETE |
|-----------|-----------------|
| `delete_file` | Yes |
| `rm -rf` | Yes |
| `git reset --hard` | Yes |
| `git clean -fd` | Yes |
| `DROP TABLE` | Yes |
| `truncate` | Yes |

## Allowed Without Confirmation

- Temp files (`*.tmp`, `*.log`)
- Build artifacts (`dist/`, `build/`)
- Dependencies (`node_modules/`)
- Cache directories (`.cache/`)

## Configuration

```yaml
settings:
  requireExplicitDelete: true
  protectedPaths:
    - "src/"
    - "app/"
    - "config/"
  allowedPatterns:
    - "*.tmp"
    - "*.log"
    - "node_modules/"
```

## Why This Matters

- Prevents "rm -rf" accidents
- Protects against misunderstood instructions
- Creates audit trail of intentional deletions
- Gives users a moment to reconsider
