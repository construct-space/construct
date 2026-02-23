---
# =============================================================================
# AGENT CONFIGURATION TEMPLATE
# =============================================================================
# Copy this file and rename it to your-agent-name.md
# Fill in the fields below to create your custom agent
# =============================================================================

# REQUIRED FIELDS
# -----------------------------------------------------------------------------
id: my-custom-agent           # Unique ID (lowercase, hyphens ok, no spaces)
name: My Custom Agent         # Display name shown in UI
description: Brief description of what this agent does

# OPTIONAL FIELDS
# -----------------------------------------------------------------------------
category: specialized         # specialized | utility
icon: lucide:bot              # Icon from lucide.dev/icons (lucide:icon-name)
maxIterations: 20             # Max tool calls per request (default: 30)
model: ""                     # Preferred AI model (leave empty for default)

# TOOL ACCESS
# -----------------------------------------------------------------------------
# By default, agents have access to all tools.
# Use allowedTools to ONLY allow specific tools (whitelist)
# Use blockedTools to block specific tools (blacklist)
# Don't use both - pick one approach

# Option 1: Whitelist - only these tools are available
# allowedTools:
#   - read_file
#   - write_file
#   - file_search
#   - grep_search

# Option 2: Blacklist - block these tools
# blockedTools:
#   - run_command
#   - delete_file
#   - git_push

# AGENT DELEGATION
# -----------------------------------------------------------------------------
# Allow this agent to dispatch tasks to other agents
# canInvokeAgents:
#   - code
#   - explorer
#   - design

---

# System Prompt

Write your agent's instructions here. This is what guides the AI's behavior.

{{#if context.company}}
## Company Context
You are working for **{{context.company.name}}**.
{{/if}}

{{#if context.project}}
## Project Context
Current project: **{{context.project.name}}**
{{/if}}

## Role
Describe what this agent does and its primary purpose.

## Guidelines
- Guideline 1
- Guideline 2
- Guideline 3

## What You Can Do
- Action 1
- Action 2
- Action 3

## What You Cannot Do
- Restriction 1
- Restriction 2

## Response Format
Describe how the agent should format its responses.
