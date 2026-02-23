---
id: builtin.session-summary
name: Session Summary
category: core
description: Generates summaries of completed sessions for context resumption
version: 1.0.0
author: Construct
icon: file-text
enabled: true

settings:
  autoSave:
    type: boolean
    description: Automatically save summaries to project
    default: true
  includeToolCalls:
    type: boolean
    description: Include tool call details in summary
    default: false
  maxSummaryLength:
    type: number
    description: Maximum summary length in characters
    default: 2000

hooks:
  - id: generate-summary
    name: Generate Session Summary
    type: session.complete
    priority: 80
    action: log
    description: Generate a summary of what was accomplished

  - id: save-summary
    name: Save Summary
    type: session.stop
    priority: 95
    action: log
    description: Persist summary for future reference
    config:
      autoSave: true
---

# Session Summary Skill

Automatically generates summaries when sessions complete, enabling easy context resumption.

## Features

- **Auto-summarization**: Capture key points from each session
- **Context preservation**: Resume where you left off
- **Project linking**: Associate summaries with projects
- **Searchable history**: Find past work by topic

## Summary Contents

Each summary includes:
- Session goal/intent
- Key decisions made
- Files modified
- Tasks completed
- Open questions/next steps

## Configuration

```yaml
settings:
  autoSave: true           # Save to project automatically
  includeToolCalls: false  # Keep summaries concise
  maxSummaryLength: 2000   # ~500 words
```

## Use Cases

- Resume interrupted work sessions
- Handoff context between team members
- Create audit trail of AI-assisted work
- Generate daily/weekly activity reports
