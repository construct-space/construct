---
# Skill Definition Template
# Copy this file and rename it (remove underscore prefix) to create a custom skill

id: custom.my-skill           # Unique identifier (required)
name: My Custom Skill         # Display name (required)
category: custom              # core | agent | tool | integration | ui | custom
description: |
  A brief description of what this skill does.
  Can be multiple lines.
version: 1.0.0
author: Your Name
icon: puzzle-piece            # Icon name for UI
enabled: true                 # Auto-enable on load

# Dependencies (other skills that must be loaded first)
dependencies: []

# Keywords for relevance-based discovery (helps AI find this skill)
keywords:
  - example
  - template
  - custom

# Examples for AI context (shows how to use this skill)
examples:
  - title: Basic Usage
    description: How to use this skill in a typical scenario
    input: User request that triggers this skill
    output: Expected result from the skill
  - title: Advanced Usage
    description: More complex scenario
    input: Complex user request
    output: Detailed result

# Settings that can be configured
settings:
  logLevel:
    type: string
    description: Logging verbosity level
    default: info
  maxRetries:
    type: number
    description: Maximum retry attempts
    default: 3

# Hooks this skill registers
hooks:
  - id: on-session-start
    name: Session Start Handler
    type: session.start        # Hook type (see list below)
    priority: 50               # 0=first, 50=normal, 100=last
    action: log                # log | validate | cancel
    description: Logs when a session starts
    config:
      message: "Session started"

  - id: block-dangerous-tools
    name: Tool Validator
    type: tool.call.start
    priority: 0                # Run first to block early
    action: validate
    description: Blocks dangerous tools
    config:
      blockedTools:
        - dangerous_tool
        - risky_command

# Tools this skill provides
tools:
  - name: my_skill_tool
    description: Does something useful
    action: shell              # shell | http | script
    parameters:
      - name: input
        type: string
        description: Input value
        required: true
      - name: format
        type: string
        description: Output format
        required: false
        default: json
        enum: [json, text, yaml]
    config:
      command: echo "{{input}}"
---

# My Custom Skill

This is the body of the skill definition. You can include detailed documentation,
usage examples, and notes here.

## Hook Types Available

| Hook Type | When Triggered |
|-----------|----------------|
| session.create | Before session created |
| session.start | When session starts |
| session.complete | On successful completion |
| session.error | On failure |
| session.stop | Always at end |
| tool.call.start | Before tool executes |
| tool.call.end | After tool succeeds |
| tool.call.error | After tool fails |
| agent.dispatch | When agent dispatched |
| agent.switch | When switching agents |
| context.change | Context state changes |
| mode.change | Mode changes |
| project.change | Project changes |

## Hook Actions

- **log**: Logs information about the event
- **validate**: Can inspect and optionally cancel the operation
- **cancel**: Always cancels the operation

## Tool Actions

- **shell**: Executes a shell command
- **http**: Makes an HTTP request
- **script**: Runs embedded script logic

## Progressive Loading

Skills support progressive loading for efficiency:

1. **Summary (~100 tokens)**: id, name, description, keywords, tool names, hook types
   - Loaded first for discovery and relevance matching
   - Used by AI to decide which skills are relevant

2. **Content (on-demand)**: Full instructions, tools, hooks, examples
   - Loaded only when skill is activated or explicitly requested
   - Reduces context window usage

3. **Instructions (AI knowledge)**: The markdown body below the frontmatter
   - Injected into AI context when skill is active
   - Acts as procedural knowledge for the AI

## Relevance Search

Skills are found by matching:
- **Query** against name, description, ID
- **Keywords** for semantic matching
- **Tool names** for capability matching
- **Hook types** for behavior matching

Higher relevance scores mean better matches. Use descriptive keywords!
