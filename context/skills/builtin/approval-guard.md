---
id: builtin.approval-guard
name: Approval Guard
category: core
description: Requires user approval before running servers, installs, or potentially dangerous commands
version: 1.0.0
author: Construct
icon: shield-check
enabled: true

settings:
  requireApproval:
    type: array
    description: Commands that always require approval
    default:
      - npm start
      - npm run dev
      - npm run serve
      - yarn start
      - yarn dev
      - bun run dev
      - bun start
      - pnpm start
      - pnpm dev
      - python -m
      - python app.py
      - node server
      - go run
      - cargo run
      - docker run
      - docker-compose up
      - kubectl apply
      - npm install
      - yarn add
      - bun add
      - pip install
  maxIterations:
    type: number
    description: Max agent iterations before forcing stop
    default: 20
  loopDetection:
    type: boolean
    description: Detect and stop command loops
    default: true

hooks:
  - id: require-command-approval
    name: Require Command Approval
    type: tool.call.start
    priority: 0
    action: validate
    description: Block server/install commands until user approves
    config:
      tools: [shell_exec, run_command, exec, bash]
      requireApproval: true
      message: "This command needs your approval before running"

  - id: detect-loops
    name: Loop Detection
    type: tool.call.start
    priority: 5
    action: validate
    description: Detect repeated commands that might indicate a loop
    config:
      maxRepeats: 3
      timeWindow: 60

  - id: iteration-limit
    name: Iteration Limit
    type: agent.dispatch
    priority: 0
    action: validate
    description: Limit agent iterations to prevent runaway execution
    config:
      maxIterations: 20

  - id: log-blocked-command
    name: Log Blocked Command
    type: tool.call.start
    priority: 10
    action: log
    description: Log when commands are blocked for approval
---

# Approval Guard Skill

Prevents AI from automatically running servers, installing packages, or executing potentially dangerous commands without explicit user approval.

## Why This Matters

AI assistants can sometimes:
- Start dev servers when you want to see logs yourself
- Install packages without asking
- Get into loops running the same command repeatedly
- Execute destructive operations too quickly

## Protected Commands

| Category | Commands |
|----------|----------|
| **Servers** | `npm start`, `npm run dev`, `yarn dev`, `bun dev`, `go run`, `cargo run` |
| **Installs** | `npm install`, `yarn add`, `bun add`, `pip install` |
| **Docker** | `docker run`, `docker-compose up` |
| **Kubernetes** | `kubectl apply`, `kubectl delete` |

## How It Works

```
AI: "I'll start the development server..."
    > npm run dev

┌─────────────────────────────────────────────┐
│  🛡️ Approval Required                       │
│                                             │
│  Command: npm run dev                       │
│  Reason: Server startup command             │
│                                             │
│  [Approve]  [Deny]  [Run Myself]            │
└─────────────────────────────────────────────┘

User clicks "Run Myself" → AI continues without running the command
```

## Loop Detection

Detects when the same command is attempted multiple times:

```
Attempt 1: npm test → fails
Attempt 2: npm test → fails
Attempt 3: npm test → BLOCKED

"Loop detected: 'npm test' has failed 3 times.
 Please review the error before continuing."
```

## Iteration Limits

Agents are limited to 20 iterations by default to prevent:
- Infinite loops
- Runaway token consumption
- Stuck execution paths

## Configuration

```yaml
settings:
  requireApproval:
    - npm start
    - npm run dev
    - docker run
  maxIterations: 20
  loopDetection: true
```

## User Override

Users can bypass approval with explicit commands:
- "Run the dev server" → Still requires approval
- "APPROVED: start the server" → Bypasses approval
- "I'll run the server myself" → AI skips the command
