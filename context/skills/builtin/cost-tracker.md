---
id: builtin.cost-tracker
name: Cost Tracker
category: core
description: Tracks token usage and estimated costs across sessions
version: 1.0.0
author: Construct
icon: dollar-sign
enabled: true

settings:
  warnThreshold:
    type: number
    description: Warn when session cost exceeds this (USD)
    default: 1.0
  hardLimit:
    type: number
    description: Stop session when cost exceeds this (0 = no limit)
    default: 0
  trackByProvider:
    type: boolean
    description: Track costs separately per provider
    default: true

hooks:
  - id: track-session-start
    name: Session Cost Init
    type: session.start
    priority: 0
    action: log
    description: Initialize cost tracking for session

  - id: track-completion
    name: Track Completion Cost
    type: session.complete
    priority: 50
    action: log
    description: Log token usage and estimated cost
    config:
      logTokens: true
      logCost: true

  - id: check-cost-limit
    name: Cost Limit Checker
    type: tool.call.start
    priority: 5
    action: validate
    description: Check if session cost is within limits

  - id: session-cost-summary
    name: Session Cost Summary
    type: session.stop
    priority: 90
    action: log
    description: Log final cost summary when session ends
---

# Cost Tracker Skill

Monitor and control AI API costs in real-time.

## Features

- **Real-time tracking**: Track tokens as they're used
- **Cost estimation**: Estimate USD cost per provider
- **Warnings**: Alert when approaching budget
- **Hard limits**: Optionally stop sessions exceeding budget
- **Per-provider breakdown**: See costs by AI provider

## Pricing Reference (per 1M tokens)

| Provider | Input | Output |
|----------|-------|--------|
| Claude 3.5 Sonnet | $3 | $15 |
| Claude 3 Opus | $15 | $75 |
| GPT-4 | $30 | $60 |
| GPT-4o | $5 | $15 |

## Configuration

```yaml
settings:
  warnThreshold: 1.0    # Warn at $1
  hardLimit: 10.0       # Stop at $10
  trackByProvider: true
```

## Metrics Tracked

- Input tokens per request
- Output tokens per request
- Cumulative session cost
- Cost per agent/tool
