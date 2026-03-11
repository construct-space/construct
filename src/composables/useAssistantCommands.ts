/**
 * useAssistantCommands — Slash command handler for the AI Assistant.
 *
 * Handles /agents, /agent, /analyze, /dispatch, /help commands.
 *
 * Extracted from AssistantFloat.vue.
 */
import type { Ref } from 'vue'
import type { Agent as AgentInfo } from '~/composables/useContextService'
import type { ChatMessage, IntentAnalysis } from '~/types/assistant'

interface CommandDeps {
  messages: Ref<ChatMessage[]>
  isLoading: Ref<boolean>
  sendRequest: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
  renderMarkdown: (text: string) => string
}

export function useAssistantCommands(deps: CommandDeps) {
  const { messages, isLoading, sendRequest, renderMarkdown } = deps

  async function handleSlashCommand(command: string): Promise<boolean> {
    const parts = command.slice(1).split(' ')
    const cmd = parts[0]?.toLowerCase()
    const args = parts.slice(1).join(' ')

    switch (cmd) {
      case 'agents': {
        messages.value.push({ role: 'user', content: command })
        isLoading.value = true

        try {
          const result = await sendRequest<{ agents: AgentInfo[] }>('agents.list')
          const agentsList = result.agents || []

          let response = '## Available Agents\n\n'
          const categories: Record<string, AgentInfo[]> = {}
          for (const agent of agentsList) {
            const cat = agent.category || 'other'
            if (!categories[cat]) categories[cat] = []
            categories[cat].push(agent)
          }

          for (const [category, categoryAgents] of Object.entries(categories)) {
            response += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`
            for (const agent of categoryAgents) {
              response += `- **${agent.name}** (\`${agent.id}\`): ${agent.description}\n`
            }
            response += '\n'
          }

          response += '---\n\n'
          response += '**Commands:**\n'
          response += '- `/agent <id>` - Get details about a specific agent\n'
          response += '- `/analyze <text>` - Analyze which agent would handle a task\n'
          response += '- `/dispatch <id> <task>` - Dispatch a task to a specific agent\n'

          messages.value.push({ role: 'assistant', content: response, renderedHtml: renderMarkdown(response) })
        } catch (error) {
          messages.value.push({
            role: 'assistant',
            content: `Error fetching agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
            renderedHtml: renderMarkdown(`Error fetching agents: ${error instanceof Error ? error.message : 'Unknown error'}`),
          })
        } finally {
          isLoading.value = false
        }
        return true
      }

      case 'agent': {
        if (!args) {
          messages.value.push({ role: 'user', content: command })
          messages.value.push({
            role: 'assistant',
            content: 'Usage: `/agent <id>` - Get details about a specific agent\n\nExample: `/agent code`',
            renderedHtml: renderMarkdown('Usage: `/agent <id>` - Get details about a specific agent\n\nExample: `/agent code`'),
          })
          return true
        }

        messages.value.push({ role: 'user', content: command })
        isLoading.value = true

        try {
          const result = await sendRequest<{
            id: string; name: string; category: string; description: string
            systemPrompt: string; allowedTools?: string[]; blockedTools?: string[]
            canInvokeAgents?: string[]; maxIterations: number
          }>('agents.get', { id: args.trim() })

          let response = `## ${result.name}\n\n`
          response += `**ID:** \`${result.id}\`\n`
          response += `**Category:** ${result.category}\n`
          response += `**Description:** ${result.description}\n\n`
          if (result.allowedTools && result.allowedTools.length > 0) {
            response += `**Allowed Tools:** ${result.allowedTools.slice(0, 10).join(', ')}${result.allowedTools.length > 10 ? ` (+${result.allowedTools.length - 10} more)` : ''}\n\n`
          }
          if (result.blockedTools && result.blockedTools.length > 0) {
            response += `**Blocked Tools:** ${result.blockedTools.slice(0, 5).join(', ')}${result.blockedTools.length > 5 ? ` (+${result.blockedTools.length - 5} more)` : ''}\n\n`
          }
          if (result.canInvokeAgents && result.canInvokeAgents.length > 0) {
            response += `**Can Invoke:** ${result.canInvokeAgents.join(', ')}\n\n`
          }
          response += `**Max Iterations:** ${result.maxIterations}\n\n`
          response += '---\n\n'
          response += `Use \`/dispatch ${result.id} <task>\` to send a task to this agent.`

          messages.value.push({ role: 'assistant', content: response, renderedHtml: renderMarkdown(response) })
        } catch {
          messages.value.push({
            role: 'assistant',
            content: `Agent not found: ${args}`,
            renderedHtml: renderMarkdown(`Agent not found: \`${args}\`\n\nUse \`/agents\` to see available agents.`),
          })
        } finally {
          isLoading.value = false
        }
        return true
      }

      case 'analyze': {
        if (!args) {
          messages.value.push({ role: 'user', content: command })
          messages.value.push({
            role: 'assistant',
            content: 'Usage: `/analyze <text>` - Analyze which agent would handle a task\n\nExample: `/analyze create a login form`',
            renderedHtml: renderMarkdown('Usage: `/analyze <text>` - Analyze which agent would handle a task\n\nExample: `/analyze create a login form`'),
          })
          return true
        }

        messages.value.push({ role: 'user', content: command })
        isLoading.value = true

        try {
          const result = await sendRequest<IntentAnalysis>('agents.analyze', { prompt: args })

          let response = `## Intent Analysis\n\n`
          response += `**Task:** "${args}"\n\n`
          response += `**Primary Agent:** \`${result.primary_agent}\`\n`
          response += `**Confidence:** ${Math.round(result.confidence * 100)}%\n\n`
          if (result.secondary_agents && result.secondary_agents.length > 0) {
            response += `**Secondary Agents:** ${result.secondary_agents.map(a => `\`${a}\``).join(', ')}\n\n`
          }
          if (result.keywords && result.keywords.length > 0) {
            response += `**Matched Keywords:** ${result.keywords.join(', ')}\n\n`
          }
          response += `**Reasoning:** ${result.reasoning}\n\n`
          response += '---\n\n'
          response += `Use \`/dispatch ${result.primary_agent} ${args}\` to execute this task.`

          messages.value.push({ role: 'assistant', content: response, renderedHtml: renderMarkdown(response) })
        } catch (error) {
          messages.value.push({
            role: 'assistant',
            content: `Error analyzing intent: ${error instanceof Error ? error.message : 'Unknown error'}`,
            renderedHtml: renderMarkdown(`Error analyzing intent: ${error instanceof Error ? error.message : 'Unknown error'}`),
          })
        } finally {
          isLoading.value = false
        }
        return true
      }

      case 'dispatch': {
        const dispatchParts = args.split(' ')
        const agentId = dispatchParts[0]
        const task = dispatchParts.slice(1).join(' ')

        if (!agentId || !task) {
          messages.value.push({ role: 'user', content: command })
          messages.value.push({
            role: 'assistant',
            content: 'Usage: `/dispatch <agent_id> <task>` - Dispatch a task to a specific agent\n\nExample: `/dispatch code create a function to validate emails`',
            renderedHtml: renderMarkdown('Usage: `/dispatch <agent_id> <task>` - Dispatch a task to a specific agent\n\nExample: `/dispatch code create a function to validate emails`'),
          })
          return true
        }

        messages.value.push({ role: 'user', content: command })
        isLoading.value = true

        try {
          const result = await sendRequest<{
            session_id: string; agent_id: string
            result?: { content: string; toolsUsed?: string[]; tokensUsed?: number; duration?: number }
          }>('agents.dispatch', { agent_id: agentId, task })

          let response = `## Agent Dispatch\n\n`
          response += `**Agent:** \`${result.agent_id}\`\n`
          response += `**Session:** \`${result.session_id}\`\n\n`
          if (result.result) {
            response += `### Result\n\n${result.result.content}\n\n`
            if (result.result.toolsUsed && result.result.toolsUsed.length > 0) {
              response += `**Tools Used:** ${result.result.toolsUsed.join(', ')}\n`
            }
            if (result.result.tokensUsed) {
              response += `**Tokens:** ${result.result.tokensUsed}\n`
            }
          }

          messages.value.push({ role: 'assistant', content: response, renderedHtml: renderMarkdown(response) })
        } catch (error) {
          messages.value.push({
            role: 'assistant',
            content: `Error dispatching task: ${error instanceof Error ? error.message : 'Unknown error'}`,
            renderedHtml: renderMarkdown(`Error dispatching task: ${error instanceof Error ? error.message : 'Unknown error'}`),
          })
        } finally {
          isLoading.value = false
        }
        return true
      }

      case 'help': {
        messages.value.push({ role: 'user', content: command })
        const response = `## Available Commands

### Agent Commands
- \`/agents\` - List all available specialized agents
- \`/agent <id>\` - Get details about a specific agent
- \`/analyze <text>\` - Analyze which agent would handle a task
- \`/dispatch <id> <task>\` - Dispatch a task to a specific agent

### Reference Syntax
- \`@DesignName\` - Reference a UI design
- \`^DocTitle\` - Reference a project document (PRD, README, etc.)
- \`#123\` - Reference a task by ID
- \`~ComponentName\` - Reference a code component
- \`!filename\` - Fuzzy file search

### Keyboard Shortcuts
- \`Double Left-Shift\` - Toggle AI Assistant
- \`Double Right-Shift\` - Toggle Chat
- \`Enter\` - Send message
- \`Escape\` - Close autocomplete`

        messages.value.push({ role: 'assistant', content: response, renderedHtml: renderMarkdown(response) })
        return true
      }

      default:
        return false
    }
  }

  return { handleSlashCommand }
}

/**
 * Get context description based on current route path.
 * Pure function — no dependencies.
 */
export function getRouteContext(path: string): string | null {
  if (path.match(/\/app\/projects\/[^/]+\/code/)) {
    return 'The user is in the Code Editor for a project. Help with coding, debugging, file management, and implementation questions.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/design/)) {
    return 'The user is in the Design Studio for a project. Help with UI/UX design, styling, component layouts, and visual design questions.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/git/)) {
    return 'The user is viewing Git/version control for a project. Help with commits, branches, merging, pull requests, and version control workflows.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/ai/)) {
    return 'The user is in the AI Space for a project. Help with AI features, prompts, model configuration, and AI-assisted development.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/notes/)) {
    return 'The user is in the Notes/Documentation section for a project. Help with documentation, markdown, README files, and technical writing.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/kanban/)) {
    return 'The user is viewing the Kanban board for a project. Help with task management, sprint planning, workflow organization, and project tracking.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/deploy/)) {
    return 'The user is in the Deployment section for a project. Help with deployment configuration, CI/CD, hosting, and production releases.'
  }
  if (path.match(/\/app\/projects\/[^/]+\/settings/)) {
    return 'The user is in Project Settings. Help with project configuration, environment variables, integrations, and project management.'
  }
  if (path.match(/\/app\/projects\/[^/]+/)) {
    return 'The user is viewing a Project overview. Help with project information, recent activity, and project navigation.'
  }
  if (path.includes('/app/settings/profile')) {
    return 'The user is viewing Profile Settings. Help with account settings, profile information, and personal preferences.'
  }
  if (path.includes('/app/settings/security')) {
    return 'The user is viewing Security Settings. Help with password changes, two-factor authentication, and security best practices.'
  }
  if (path.includes('/app/settings/notifications')) {
    return 'The user is viewing Notification Settings. Help with notification preferences and alert configuration.'
  }
  if (path.includes('/app/settings')) {
    return 'The user is in the Settings area. Help with application configuration and preferences.'
  }
  if (path.includes('/app/users')) {
    return 'The user is in User Management. Help with user accounts, permissions, roles, and team management.'
  }
  if (path.includes('/app/media')) {
    return 'The user is in the Media Library. Help with file uploads, asset management, and media organization.'
  }
  if (path.includes('/app/reports')) {
    return 'The user is viewing Reports. Help with analytics, metrics, data visualization, and report generation.'
  }
  if (path === '/app' || path === '/app/') {
    return 'The user is on the Dashboard. Help with project overview, navigation, and getting started with Construct.'
  }
  return null
}
