# Construct Agents

Agents are specialized AI assistants that help with different tasks. Each agent has a specific focus, set of tools, and guidelines.

## Directory Structure

```
agents/
  builtin/          # Default Construct agents (do not modify)
    code.md
    design.md
    kanban.md
    ...
  custom/           # Your custom agents (add your agents here)
    _template.md    # Full template with all options
    _simple.md      # Simple template for quick agents
    your-agent.md   # Your custom agents
```

## Creating a Custom Agent

### Quick Start

1. Copy `custom/_simple.md` to `custom/your-agent-name.md`
2. Fill in the basic fields
3. Write your system prompt in the markdown body
4. Restart Construct or reload agents

### Full Customization

For more control, use `custom/_template.md` which includes all available options.

## Agent File Format

Agents are defined as Markdown files with YAML frontmatter:

```markdown
---
id: my-agent              # Unique identifier (required)
name: My Custom Agent     # Display name (required)
category: specialized     # Category: specialized, utility
description: What it does # Short description (required)
icon: lucide:bot          # Icon from Lucide icons
maxIterations: 20         # Max tool calls per request

# Tool access (optional - defaults to all tools)
allowedTools:             # Only these tools are available
  - read_file
  - write_file
blockedTools:             # These tools are blocked
  - run_command

# Agent delegation (optional)
canInvokeAgents:          # Can delegate to these agents
  - code
  - explorer
---

# System Prompt

Your agent's instructions go here as markdown.

You can use template variables for context:
- {{context.user.name}} - Current user's name
- {{context.company.name}} - Company name
- {{context.project.name}} - Current project name

## Guidelines
- List specific guidelines for your agent
- What it should and shouldn't do

## Available Actions
- Describe what the agent can help with
```

## Template Variables

Your system prompt can include these variables that get replaced with actual values:

### User Context
- `{{context.user.name}}` - User's display name
- `{{context.user.email}}` - User's email
- `{{context.user.timezone}}` - User's timezone

### Company Context
- `{{context.company.name}}` - Company name
- `{{context.company.description}}` - Company description
- `{{context.company.guidelines}}` - General guidelines
- `{{context.company.brandGuidelines}}` - Brand/style guidelines
- `{{context.company.techStack}}` - Technology stack

### Project Context
- `{{context.project.name}}` - Current project name
- `{{context.project.description}}` - Project description

### Conditional Sections
```markdown
{{#if context.company}}
Only show this if company context exists
{{/if}}
```

## Available Tools

### File Operations
- `read_file` - Read file contents
- `write_file` - Write to existing file
- `create_file` - Create new file
- `delete_file` - Delete file
- `file_search` - Search for files by name
- `grep_search` - Search file contents
- `list_directory` - List directory contents
- `get_file_tree` - Get project file tree

### Execution
- `run_command` - Execute shell commands

### Git Operations
- `git_status`, `git_diff`, `git_log`
- `git_commit`, `git_push`
- `git_branch`, `git_checkout`, `git_merge`
- `create_pr`, `list_prs`

### Design Operations
- `create_ui_screen`, `get_design`, `list_project_designs`
- `create_design_element`, `update_design_element`, `delete_design_element`

### Task Operations
- `list_project_tasks`, `get_task`
- `create_task`, `update_task`, `delete_task`
- `move_task`, `assign_task`

### Calendar Operations
- `list_events`, `create_event`, `update_event`, `delete_event`
- `check_availability`, `get_today_schedule`

### Media Operations
- `generate_image`, `resize_image`, `convert_image`, `optimize_image`
- `list_media_files`, `get_media_info`

### Web Operations
- `web_search` - Search the web
- `read_url` - Read webpage content

### Agent Operations
- `dispatch_to_agent` - Delegate to another agent

## Examples

### Simple Support Agent
```markdown
---
id: support
name: Support Agent
description: Customer support assistant
icon: lucide:headphones
maxIterations: 15
allowedTools:
  - web_search
  - read_url
---

You are a customer support assistant for {{context.company.name}}.
Help users with questions about products and services.
Be friendly, patient, and helpful.
```

### Code Review Agent
```markdown
---
id: reviewer
name: Code Review Agent
description: Reviews code for quality and best practices
icon: lucide:search-check
maxIterations: 20
allowedTools:
  - read_file
  - file_search
  - grep_search
  - list_directory
blockedTools:
  - write_file
  - create_file
  - delete_file
  - run_command
---

You are a code review assistant. Review code for:
- Code quality and readability
- Potential bugs and issues
- Performance concerns
- Security vulnerabilities
- Best practices

You can READ code but CANNOT modify it. Provide feedback only.
```

## Troubleshooting

### Agent not appearing
- Ensure the file has `.md` extension
- Check YAML frontmatter syntax (use online YAML validator)
- Verify required fields: `id`, `name`, `description`
- Restart Construct to reload agents

### Tools not working
- Check tool names are spelled correctly
- Verify tool exists in available tools list
- Check `allowedTools`/`blockedTools` configuration
