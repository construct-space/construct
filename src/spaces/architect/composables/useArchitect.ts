/**
 * useArchitect - Main composable for Architect space
 *
 * Orchestrates chat, tool calling, conversations, and cross-space integrations.
 */
import { useConversationsStore, type Conversation } from '~/stores/conversations'
import { useMarkdown } from '~/composables/useMarkdown'
import { useArchitectActions } from './useArchitectActions'
import { useArchitectToolExecutor, architectTools } from './useArchitectTools'
import type {
  ChatMessage,
  ParsedContent,
  ParsedQuestion,
  PRDContent,
  TaskItem
} from '../types/architect'

export function useArchitect() {
  const authStore = useAuthStore()
  const _projectStore = useProjectStore()
  const conversationsStore = useConversationsStore()
  const { chatStream, chatStreamWithTools, listProviders } = useContextService()
  const { renderMarkdown, renderStreamingMarkdown } = useMarkdown()
  const actions = useArchitectActions()
  const toolExecutor = useArchitectToolExecutor()
  const toast = useToast()

  // State
  const messages = ref<ChatMessage[]>([])
  const inputMessage = ref('')
  const isLoading = ref(false)
  const streamingContent = ref('')
  const streamingStatus = ref('Thinking...')
  const selectedOptions = ref<Record<string, string | string[]>>({})

  // Conversations
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<number | null>(null)
  const loadingConversations = ref(false)

  // Providers
  const providers = ref<{ id: string; label: string; models: { id: string; label: string }[] }[]>([])
  const selectedProvider = ref('deepseek')
  const selectedModel = ref('deepseek-chat')

  // Tool mode
  const useTools = ref(true)

  // Computed
  const providerOptions = computed(() =>
    providers.value.map(p => ({ label: p.label, value: p.id }))
  )

  const modelOptions = computed(() => {
    const provider = providers.value.find(p => p.id === selectedProvider.value)
    return provider?.models.map(m => ({ label: m.label || m.id, value: m.id })) || []
  })

  const currentConversationName = computed(() => {
    const conv = conversations.value.find(c => c.id === currentConversationId.value)
    return conv?.name || 'New Session'
  })

  const suggestions = [
    'Build me a SaaS dashboard',
    'Create an e-commerce platform',
    'Design a project management tool',
    'Develop a social media app'
  ]

  // System prompt with tool awareness
  const systemPrompt = computed(() => {
    const basePrompt = `You are JARVIS, an advanced AI assistant specialized in software project architecture.

IMPORTANT: Always narrate what you're doing so the user knows you're working:
- "Let me analyze your requirements..."
- "I'm putting together the PRD now..."
- "Creating your task breakdown..."

Your role is to help users architect software projects by:
1. Understanding their vision
2. Asking clarifying questions (one at a time)
3. Generating a comprehensive PRD
4. Breaking down the project into actionable tasks

QUESTION FORMAT - Use this JSON block (UI will render as buttons):
\`\`\`json:question
{
  "id": "unique_question_id",
  "question": "Your question here?",
  "options": [
    {"value": "option1", "label": "Option 1", "icon": "i-lucide-icon", "description": "Brief description"},
    {"value": "option2", "label": "Option 2", "icon": "i-lucide-icon", "description": "Brief description"}
  ]
}
\`\`\`

PRD FORMAT - The markdown field MUST use proper markdown with headers, lists, and formatting:
\`\`\`json:prd
{
  "name": "Project Name",
  "description": "Brief one-line description",
  "markdown": "# Project Name\\n\\n## Overview\\nDescription paragraph...\\n\\n## Goals\\n- Goal 1\\n- Goal 2\\n\\n## User Stories\\n### Primary User\\n- As a user, I want...\\n\\n## Technical Stack\\n| Layer | Technology |\\n|-------|------------|\\n| Frontend | Vue.js |\\n\\n## Features\\n### Core Features\\n1. **Feature Name** - Description\\n\\n## Architecture\\n\`\`\`\\ndiagram or description\\n\`\`\`\\n\\n## Timeline\\n| Phase | Duration |\\n|-------|----------|"
}
\`\`\`

TASKS FORMAT - When generating tasks:
\`\`\`json:tasks
[
  {"title": "Setup Project", "description": "Initialize the project structure", "priority": "high", "subtasks": ["Create repo", "Setup tooling"]},
  ...
]
\`\`\`

Guidelines:
- Be conversational, like Tony Stark's JARVIS
- Ask one question at a time with 2-4 options
- Use Lucide icons (i-lucide-*)
- PRD markdown MUST include: ## headers, - bullet lists, **bold**, tables where appropriate
- Generate 8-15 actionable tasks

Start by understanding the project, then guide through: scope, platform, tech stack, features.`

    if (useTools.value) {
      return basePrompt + `

TOOLS AVAILABLE:
You have access to tools that can directly interact with the project:
- create_kanban_tasks: Add tasks to the Kanban board
- initialize_git_repo: Set up a git repository
- create_design_file: Create a new design file
- get_project_status: Check current project state

When you generate tasks, you can offer to add them to Kanban directly.
When the user wants to start coding, you can initialize a repository.
For UI/UX work, you can create design files.

Ask for user approval before executing major actions (project creation, multiple tasks).
For single tasks or quick actions, you can proceed autonomously.`
    }

    return basePrompt
  })

  // Watch provider changes
  watch(selectedProvider, () => {
    const models = modelOptions.value
    if (models.length > 0 && !models.find(m => m.value === selectedModel.value)) {
      selectedModel.value = models[0]?.value || ''
    }
  })

  // Save model selection
  watch(selectedModel, async (newModel) => {
    if (currentConversationId.value && newModel) {
      await conversationsStore.updateConversation(currentConversationId.value, { model: newModel })
    }
  })

  /**
   * Parse message content for structured data
   */
  function getParsedContent(content: string): ParsedContent {
    const result: ParsedContent = {
      textBefore: '',
      question: null,
      prd: null,
      tasks: null,
      textAfter: ''
    }

    // Extract question
    const questionMatch = content.match(/```json:question\s*([\s\S]*?)```/)
    if (questionMatch?.[1]) {
      try { result.question = JSON.parse(questionMatch[1]) } catch { /* ignore */ }
    }

    // Extract PRD
    const prdMatch = content.match(/```json:prd\s*([\s\S]*?)```/)
    if (prdMatch?.[1]) {
      try { result.prd = JSON.parse(prdMatch[1]) } catch { /* ignore */ }
    }

    // Extract tasks
    const tasksMatch = content.match(/```json:tasks\s*([\s\S]*?)```/)
    if (tasksMatch?.[1]) {
      try { result.tasks = JSON.parse(tasksMatch[1]) } catch { /* ignore */ }
    }

    // Get text before/after JSON blocks
    const cleanContent = content.replace(/```json:(question|prd|tasks)[\s\S]*?```/g, '|||BLOCK|||')
    const parts = cleanContent.split('|||BLOCK|||')
    result.textBefore = (parts[0] || '').trim()
    result.textAfter = parts.length > 1 ? (parts[parts.length - 1] || '').trim() : ''

    return result
  }

  /**
   * Update streaming status based on content
   */
  function updateStreamingStatus(content: string) {
    const lowerContent = content.toLowerCase()

    if (!content) {
      streamingStatus.value = 'Thinking...'
      return
    }

    if (lowerContent.includes('```json:prd') || lowerContent.includes('putting together the prd')) {
      streamingStatus.value = 'Creating PRD...'
    } else if (lowerContent.includes('```json:tasks') || lowerContent.includes('task breakdown')) {
      streamingStatus.value = 'Generating tasks...'
    } else if (lowerContent.includes('```json:question')) {
      streamingStatus.value = 'Preparing question...'
    } else if (lowerContent.includes('analyze') || lowerContent.includes('understanding')) {
      streamingStatus.value = 'Analyzing...'
    } else if (content.length < 50) {
      streamingStatus.value = 'Thinking...'
    } else if (content.length < 200) {
      streamingStatus.value = 'Working...'
    } else {
      streamingStatus.value = 'Writing...'
    }
  }

  /**
   * Load AI providers
   */
  async function loadProviders() {
    try {
      const result = await listProviders()
      if (result?.providers) {
        providers.value = result.providers
        if (result.default && providers.value.find(p => p.id === result.default)) {
          selectedProvider.value = result.default
        }
        const currentProvider = providers.value.find(p => p.id === selectedProvider.value)
        if (currentProvider?.models.length) {
          selectedModel.value = currentProvider.models[0]?.id || ''
        }
      }
    } catch (err) {
      console.error('Failed to load providers:', err)
    }
  }

  /**
   * Load conversation list
   */
  async function loadConversationList() {
    loadingConversations.value = true
    try {
      const result = await conversationsStore.fetchConversations()
      if (result.success) {
        conversations.value = conversationsStore.conversations
      }
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      loadingConversations.value = false
    }
  }

  /**
   * Load a specific conversation
   */
  async function loadConversation(id: number) {
    currentConversationId.value = id
    messages.value = []
    selectedOptions.value = {}

    // Restore model from conversation
    const convResult = await conversationsStore.getConversation(id)
    if (convResult.success && convResult.data?.model) {
      const provider = providers.value.find(p => p.models.some(m => m.id === convResult.data!.model))
      if (provider) {
        selectedProvider.value = provider.id
        selectedModel.value = convResult.data.model
      }
    }

    const result = await conversationsStore.getMessages(id)
    if (result.success && result.data) {
      messages.value = result.data.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    }
  }

  /**
   * Start new conversation
   */
  function startNewConversation() {
    currentConversationId.value = null
    messages.value = []
    selectedOptions.value = {}
  }

  /**
   * Delete conversation
   */
  async function deleteConversation(id: number) {
    try {
      const result = await conversationsStore.deleteConversation(id)
      if (result.success) {
        conversations.value = conversations.value.filter(c => c.id !== id)
        if (currentConversationId.value === id) startNewConversation()
      }
    } catch {
      toast.add({ title: 'Error', description: 'Failed to delete', color: 'error' })
    }
  }

  /**
   * Send a message
   */
  async function sendMessage(text?: string) {
    const message = text || inputMessage.value.trim()
    if (!message) return

    inputMessage.value = ''
    messages.value.push({ role: 'user', content: message })

    // Create conversation if needed
    if (!currentConversationId.value) {
      try {
        const result = await conversationsStore.createConversation({
          name: message.slice(0, 50),
          model: selectedModel.value
        })
        if (result.success && result.data) {
          currentConversationId.value = result.data.id
          conversations.value = conversationsStore.conversations
        }
      } catch (err) {
        console.error('Failed to create conversation:', err)
      }
    }

    // Save user message
    if (currentConversationId.value) {
      await conversationsStore.addMessage(currentConversationId.value, { role: 'user', content: message })
    }

    await streamAIResponse()
  }

  /**
   * Stream AI response
   */
  async function streamAIResponse() {
    isLoading.value = true
    streamingContent.value = ''
    let fullContent = ''

    try {
      const token = authStore.token || undefined
      const chatMessages = [{ role: 'system' as const, content: systemPrompt.value }, ...messages.value]

      const handleChunk = (chunk: { content: string; done: boolean; error?: string }) => {
        if (chunk.error) {
          toast.add({ title: 'Error', description: chunk.error, color: 'error' })
          return
        }
        if (chunk.content) {
          fullContent += chunk.content
          // Show content before JSON blocks
          streamingContent.value = fullContent.split(/```json:(question|prd|tasks)/)[0] || ''
          updateStreamingStatus(fullContent)
        }
        if (chunk.done) {
          streamingContent.value = ''
          messages.value.push({ role: 'assistant', content: fullContent })

          if (currentConversationId.value && fullContent) {
            conversationsStore.addMessage(currentConversationId.value, { role: 'assistant', content: fullContent })
          }

          loadConversationList()
        }
      }

      if (useTools.value) {
        await chatStreamWithTools(
          {
            model: selectedModel.value,
            messages: chatMessages,
            token,
            tools: architectTools
          },
          handleChunk,
          toolExecutor.executeTool
        )
      } else {
        await chatStream(
          { model: selectedModel.value, messages: chatMessages, token },
          handleChunk
        )
      }
    } catch {
      toast.add({ title: 'Error', description: 'Failed to get response', color: 'error' })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Handle option selection
   */
  function handleOptionSelect(question: ParsedQuestion, value: string) {
    selectedOptions.value[question.id] = value
    const option = question.options.find(o => o.value === value)
    sendMessage(option?.label || value)
  }

  /**
   * Handle "not sure" for questions
   */
  function handleNotSure(question: ParsedQuestion) {
    sendMessage(`I'm not sure. What would you recommend for ${question.id}?`)
  }

  /**
   * Check if option is selected
   */
  function isOptionSelected(questionId: string, optionValue: string): boolean {
    const selected = selectedOptions.value[questionId]
    return Array.isArray(selected) ? selected.includes(optionValue) : selected === optionValue
  }

  /**
   * Check if question is answered
   */
  function hasAnsweredQuestion(questionId: string): boolean {
    return !!selectedOptions.value[questionId]
  }

  /**
   * Download PRD as markdown
   */
  function downloadPRD(prd: PRDContent) {
    const blob = new Blob([prd.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prd.name.toLowerCase().replace(/\s+/g, '-')}-prd.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.add({ title: 'Downloaded', description: 'PRD saved', color: 'success' })
  }

  /**
   * Generate tasks from PRD
   */
  function generateTasks(prd: PRDContent) {
    sendMessage(`Generate detailed tasks from this PRD: ${prd.name}`)
  }

  /**
   * Add tasks to Kanban
   */
  async function addTasksToKanban(tasks: TaskItem[]) {
    const result = await actions.createKanbanTasks(tasks, { requireApproval: false })
    if (!result.success) {
      toast.add({ title: 'Error', description: result.message, color: 'error' })
    }
  }

  return {
    // State
    messages,
    inputMessage,
    isLoading,
    streamingContent,
    streamingStatus,
    selectedOptions,
    conversations,
    currentConversationId,
    currentConversationName,
    loadingConversations,
    providers,
    selectedProvider,
    selectedModel,
    providerOptions,
    modelOptions,
    useTools,
    suggestions,

    // Actions from useArchitectActions
    pendingActions: actions.pendingActions,
    hasPendingActions: actions.hasPendingActions,
    approveAction: actions.approveAction,
    rejectAction: actions.rejectAction,
    approveAllActions: actions.approveAllActions,

    // Methods
    loadProviders,
    loadConversationList,
    loadConversation,
    startNewConversation,
    deleteConversation,
    sendMessage,
    getParsedContent,
    handleOptionSelect,
    handleNotSure,
    isOptionSelected,
    hasAnsweredQuestion,
    downloadPRD,
    generateTasks,
    addTasksToKanban,

    // Markdown rendering
    renderMarkdown,
    renderStreamingMarkdown
  }
}
