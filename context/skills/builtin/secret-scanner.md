---
id: builtin.secret-scanner
name: Secret Scanner
category: core
description: Detects and blocks accidental exposure of secrets and API keys
version: 1.0.0
author: Construct
icon: shield-alert
enabled: true

# Keywords for relevance search
keywords:
  - security
  - secrets
  - api keys
  - credentials
  - tokens
  - password
  - authentication
  - sensitive data
  - leak prevention

# Examples for AI context
examples:
  - title: Block API Key Commit
    description: Prevent committing a file with hardcoded API key
    input: git commit with file containing AKIA1234567890ABCDEF
    output: "Blocked: AWS Access Key detected in file.js"
  - title: Warn on JWT Token
    description: Warn when JWT token found in code
    input: const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    output: "Warning: JWT token detected - consider using environment variable"

settings:
  blockOnDetection:
    type: boolean
    description: Block action when secret detected
    default: true
  patterns:
    type: array
    description: Additional regex patterns to detect
    default: []
  allowedFiles:
    type: array
    description: Files exempt from scanning (e.g., .env.example)
    default: [".env.example", "*.example"]

hooks:
  - id: scan-file-write
    name: Scan File Writes
    type: tool.call.start
    priority: 0
    action: validate
    description: Scan content before writing to files
    config:
      tools: [write_file, edit_file, create_file]

  - id: scan-git-commit
    name: Scan Git Commits
    type: tool.call.start
    priority: 0
    action: validate
    description: Scan staged content before commits
    config:
      tools: [git_commit, git_add]

  - id: log-detection
    name: Log Secret Detection
    type: tool.call.start
    priority: 1
    action: log
    description: Log when secrets are detected
---

# Secret Scanner Skill

Prevents accidental exposure of sensitive credentials in code and commits.

## Detected Patterns

| Type | Pattern Example |
|------|-----------------|
| AWS Access Key | `AKIA[0-9A-Z]{16}` |
| AWS Secret Key | 40-char base64 after "aws_secret" |
| GitHub Token | `ghp_[a-zA-Z0-9]{36}` |
| GitLab Token | `glpat-[a-zA-Z0-9]{20}` |
| Slack Token | `xox[baprs]-[a-zA-Z0-9-]+` |
| Generic API Key | `api[_-]?key.*['\"][a-zA-Z0-9]{20,}` |
| Private Key | `-----BEGIN.*PRIVATE KEY-----` |
| JWT | `eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*` |

## Configuration

```yaml
settings:
  blockOnDetection: true
  patterns:
    - "my_company_secret_[a-z0-9]+"
  allowedFiles:
    - ".env.example"
    - "docs/setup.md"
```

## Actions on Detection

1. **Block** - Prevent the file write/commit
2. **Warn** - Log warning but allow action
3. **Redact** - Replace detected secret with placeholder

## Use Cases

- Prevent committing .env files
- Block hardcoded API keys in source
- Audit trail of detected secrets
