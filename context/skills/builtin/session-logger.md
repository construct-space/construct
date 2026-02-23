---
id: builtin.session-logger
name: Session Logger
category: core
description: Logs all session lifecycle events for debugging and monitoring
version: 1.0.0
author: Construct
icon: file-text
enabled: true

settings:
  logLevel:
    type: string
    description: Minimum log level (debug, info, warn, error)
    default: info

hooks:
  - id: log-session-create
    name: Log Session Create
    type: session.create
    priority: 0
    action: log
    description: Logs session creation

  - id: log-session-start
    name: Log Session Start
    type: session.start
    priority: 0
    action: log
    description: Logs session start

  - id: log-session-complete
    name: Log Session Complete
    type: session.complete
    priority: 100
    action: log
    description: Logs successful session completion

  - id: log-session-error
    name: Log Session Error
    type: session.error
    priority: 100
    action: log
    description: Logs session errors

  - id: log-session-stop
    name: Log Session Stop
    type: session.stop
    priority: 100
    action: log
    description: Logs session termination
---

# Session Logger Skill

Provides comprehensive logging for all session lifecycle events. Useful for:

- Debugging session issues
- Monitoring session performance
- Tracking session flow
- Audit trails

## Log Output

Each log entry includes:
- Timestamp
- Session ID
- Agent ID (if applicable)
- Event type
- Duration (for completion/stop events)
