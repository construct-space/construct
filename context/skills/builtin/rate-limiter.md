---
id: builtin.rate-limiter
name: Rate Limiter
category: core
description: Prevents API abuse by limiting tool calls per minute
version: 1.0.0
author: Construct
icon: gauge
enabled: true

settings:
  maxCallsPerMinute:
    type: number
    description: Maximum tool calls allowed per minute
    default: 60
  maxCallsPerSession:
    type: number
    description: Maximum tool calls per session (0 = unlimited)
    default: 0
  blockedAfterLimit:
    type: boolean
    description: Block all calls after limit (vs just warning)
    default: false

hooks:
  - id: check-rate-limit
    name: Rate Limit Checker
    type: tool.call.start
    priority: 0
    action: validate
    description: Checks if tool call rate is within limits
    config:
      maxCallsPerMinute: 60

  - id: log-rate-warning
    name: Rate Warning Logger
    type: tool.call.start
    priority: 1
    action: log
    description: Logs when approaching rate limit
---

# Rate Limiter Skill

Prevents runaway tool usage and API abuse by enforcing rate limits.

## Features

- **Per-minute limits**: Cap tool calls per minute
- **Per-session limits**: Optional total session limit
- **Warning mode**: Warn instead of block when limits approached
- **Configurable thresholds**: Adjust limits per use case

## Configuration

```yaml
settings:
  maxCallsPerMinute: 60    # 1 call per second average
  maxCallsPerSession: 500  # Hard cap per session
  blockedAfterLimit: false # Warn only, don't block
```

## Use Cases

- Prevent infinite loops in agent execution
- Protect against accidental API cost spikes
- Enforce fair usage in multi-user environments
