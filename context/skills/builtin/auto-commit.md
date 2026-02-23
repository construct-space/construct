---
id: builtin.auto-commit
name: Auto Commit
category: core
description: Suggests git commits after significant code changes
version: 1.0.0
author: Construct
icon: git-commit
enabled: false

settings:
  autoSuggest:
    type: boolean
    description: Automatically suggest commits
    default: true
  minChanges:
    type: number
    description: Minimum file changes before suggesting
    default: 3
  commitStyle:
    type: string
    description: Commit message style (conventional, simple, detailed)
    default: conventional
  includeCoAuthor:
    type: boolean
    description: Include AI co-author in commits
    default: true

hooks:
  - id: track-file-changes
    name: Track File Changes
    type: tool.call.end
    priority: 50
    action: log
    description: Track files modified during session
    config:
      tools: [write_file, edit_file, delete_file]

  - id: suggest-commit
    name: Suggest Commit
    type: session.complete
    priority: 70
    action: log
    description: Suggest commit when session completes with changes
    config:
      minChanges: 3

  - id: generate-message
    name: Generate Commit Message
    type: agent.dispatch
    priority: 50
    action: log
    description: Generate conventional commit message
---

# Auto Commit Skill

Intelligently suggests git commits after AI-assisted code changes.

## Features

- **Change tracking**: Monitor all file modifications
- **Smart grouping**: Group related changes logically
- **Conventional commits**: Generate standardized messages
- **Co-authorship**: Attribute AI assistance in commits

## Commit Styles

### Conventional (default)
```
feat(auth): add OAuth2 login flow

- Add login endpoint
- Implement token refresh
- Add session management

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Simple
```
Add OAuth2 login flow
```

### Detailed
```
feat(auth): add OAuth2 login flow

This commit implements the complete OAuth2 authentication flow
including login, token refresh, and session management.

Files changed:
- src/auth/login.ts (new)
- src/auth/refresh.ts (new)
- src/middleware/session.ts (modified)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Configuration

```yaml
settings:
  autoSuggest: true
  minChanges: 3
  commitStyle: conventional
  includeCoAuthor: true
```

## Behavior

1. Tracks all file operations during session
2. On session complete, analyzes changes
3. Groups changes by feature/fix/refactor
4. Generates appropriate commit message
5. Presents suggestion to user (doesn't auto-commit)
