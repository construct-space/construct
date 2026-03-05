/**
 * Context Service Composable
 *
 * Vue composable for integrating with the Construct Context Service
 * via Tauri IPC. Provides reactive access to context state and tools.
 */

import { ref, readonly, onMounted, onUnmounted, computed, getCurrentInstance } from 'vue'
import type { Ref } from 'vue'

// Types matching the Go backend
export type Mode = 'code' | 'ui'

export interface ComponentContext {
  name: string
  type: string
  filePath?: string
  framework?: string
  props?: Record<string, unknown>
  styles?: Record<string, string>
  children?: string[]
  parentName?: string
}

export interface ProjectContext {
  name: string
  type: string
  rootPath: string
  framework: string
  uiLibrary?: string
  styleSystem?: string
  components?: string[]
}

export interface SelectionContext {
  type: 'element' | 'text' | 'code'
  content?: string
  elementId?: string
  startLine?: number
  endLine?: number
}

export interface Context {
  mode: Mode
  component?: ComponentContext
  project?: ProjectContext
  selection?: SelectionContext
  timestamp: string
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: string
      properties: Record<string, { type: string; description: string; enum?: string[] }>
      required?: string[]
    }
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  content: string
  is_error?: boolean
}

// Content can be string for text-only, or array for multimodal (with images)
export type ChatMessageContent = string | Array<{
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}>

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: ChatMessageContent
}

export interface RichChatMessage extends ChatMessage {
  model_id?: string       // "anthropic:claude-opus-4-6"
  model_label?: string    // "Claude Opus 4.6"
  provider_id?: string    // "anthropic"
  provider_label?: string // "Anthropic"
  timestamp?: string
  message_id?: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  token?: string
  agent_id?: string  // Agent ID from registry (e.g. "design") — uses agent's prompt + tools from Go side
  space?: string  // Current space context for smart routing (code, ui, kanban, etc.)
  local_data?: Record<string, unknown>  // Frontend-provided local data (designs, canvas state, etc.)
  include_space_context?: boolean // Disable automatic space_context injection when caller provides scoped context
  max_iterations?: number  // Override max agentic loop iterations (for vision: 1)
}

export interface ChatResponse {
  message: {
    role: string
    content: string
  }
  done: boolean
}

export interface ContextConversation {
  id: string
  name: string
  model: string
  messages?: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ConversationListItem {
  id: string
  name: string
  model: string
  created_at: string
  updated_at: string
}

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
}

export interface ProviderModel {
  id: string
  label: string
}

export interface AIProvider {
  id: string
  label: string
  icon?: string
  authType?: 'oauth' | 'api' | 'local'
  models: ProviderModel[]
}

export interface ProvidersResponse {
  providers: AIProvider[]
  default: string // Legacy: default provider ID
  defaultProvider?: string
  defaultModel?: string
}

export interface Agent {
  id: string
  name: string
  category: string
  description: string
  icon?: string
  isBuiltin?: boolean
  allowedTools?: string[]
  blockedTools?: string[]
  canInvokeAgents?: string[]
  maxIterations?: number
  systemPrompt?: string
}

export interface AgentsResponse {
  agents: Agent[]
}

// Model routing info from smart router
export interface ModelRoute {
  tier?: string      // budget, balanced, premium, vision
  model?: string     // Full model ID (provider:model)
  reason?: string    // Why this model was selected
  hasVision?: boolean
  complexity?: string // simple, moderate, complex
}

// Context service stream chunk (SDK uses different StreamChunk type)
export interface ContextStreamChunk {
  content: string
  done: boolean
  error?: string
  type?: 'content' | 'stream' | 'tool_call' | 'tool_status' | 'tool_result' | 'debug' | 'thinking' | 'progress' | 'tool_error'
  tool_calls?: ToolCall[]
  route?: ModelRoute  // Routing info (only sent in first chunk when auto-routed)
}

export interface ChatRequestWithTools extends ChatRequest {
  tools?: Tool[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export interface ToolExecutor {
  (toolCall: ToolCall): Promise<ToolResult>
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

export interface UseContextServiceReturn {
  // State
  connected: Ref<boolean>
  context: Ref<Context | null>
  mode: Ref<Mode>
  currentComponent: Ref<ComponentContext | null>
  project: Ref<ProjectContext | null>
  selection: Ref<SelectionContext | null>
  tools: Ref<Tool[]>
  isTauri: Ref<boolean>

  // Actions
  connect: () => Promise<void>
  setMode: (mode: Mode) => Promise<void>
  setComponent: (component: ComponentContext) => Promise<void>
  setProject: (project: ProjectContext) => Promise<void>
  setSelection: (selection: SelectionContext) => Promise<void>
  clearSelection: () => Promise<void>
  callTool: (toolCall: ToolCall) => Promise<ToolResult>
  refreshContext: () => Promise<void>
  ping: () => Promise<number>
  chat: (request: ChatRequest) => Promise<ChatResponse>
  chatStream: (request: ChatRequest, onChunk: (chunk: ContextStreamChunk) => void, options?: { signal?: AbortSignal }) => Promise<void>
  chatStreamWithTools: (request: ChatRequestWithTools, onChunk: (chunk: ContextStreamChunk) => void, toolExecutor?: ToolExecutor) => Promise<void>
  visionAnalyze: (model: string, imageUrl: string, detailLevel: 'quick' | 'balanced' | 'detailed', canvasContext?: { elementCount: number; rightmostX: number }, onChunk?: (chunk: ContextStreamChunk) => void) => Promise<void>
  listModels: () => Promise<{ models: OllamaModel[] }>
  listProviders: () => Promise<ProvidersResponse>

  // Conversation management
  sendRequest: <T = unknown>(requestType: string, payload?: Record<string, unknown>) => Promise<T>
  createConversation: (name: string, model: string) => Promise<ContextConversation>
  listConversations: () => Promise<ConversationListItem[]>
  getConversation: (id: string) => Promise<ContextConversation>
  deleteConversation: (id: string) => Promise<void>

  // Agent system
  listAgents: () => Promise<AgentsResponse>
  getAgent: (id: string) => Promise<Agent>
  analyzeIntent: (prompt: string) => Promise<{ primary_agent: string; secondary_agents: string[]; reasoning: string; confidence: number }>
  dispatchToAgent: (agentId: string, task: string, context?: Record<string, unknown>) => Promise<{ session_id: string; agent_id: string; result?: unknown }>

  // OAuth for Anthropic MAX subscription
  oauthStart: (scopes?: string[]) => Promise<string>
  oauthGetPending: () => Promise<{ state: string; code_verifier: string; client_id: string; redirect_uri: string }>
  oauthExchange: (code: string, state: string) => Promise<OAuthTokenResponse>
  oauthCloseWindow: () => Promise<void>
  oauthReadKeychain: () => Promise<OAuthTokenResponse>

  // Space context integration
  buildSystemPrompt: () => string
  enrichLocalData: (request: ChatRequest) => Record<string, unknown> | null
}

// Check if running in Tauri
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  )
}

// Tauri invoke helper
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(cmd, args)
}

// Shared context service state across all composable consumers.
const sharedConnected = ref(false)
const sharedContext = ref<Context | null>(null)
const sharedMode = ref<Mode>('code')
const sharedCurrentComponent = ref<ComponentContext | null>(null)
const sharedProject = ref<ProjectContext | null>(null)
const sharedSelection = ref<SelectionContext | null>(null)
const sharedTools = ref<Tool[]>([])
const sharedIsTauri = ref(isTauriEnvironment())
// Shared promise that deduplicates concurrent initializeTauri() calls.
// On success the resolved promise is kept so later callers get the cached result
// without re-invoking Tauri IPC.  Only cleared on failure so a retry can happen.
let connectInFlight: Promise<boolean> | null = null

const isNotConnectedError = (error: unknown): boolean =>
  String(error).toLowerCase().includes('not connected')

/** Mark the connection as lost.  Clears both the reactive flag and the
 *  cached connectInFlight promise so the next initializeTauri() call
 *  will actually attempt a fresh connection. */
function markDisconnected() {
  sharedConnected.value = false
  connectInFlight = null
}

/**
 * Use the context service
 */
export function useContextService(): UseContextServiceReturn {
  // Shared reactive state
  const connected = sharedConnected
  const context = sharedContext
  const mode = sharedMode
  const currentComponent = sharedCurrentComponent
  const project = sharedProject
  const selection = sharedSelection
  const tools = sharedTools
  const isTauri = sharedIsTauri

  // Update local state from context
  function updateFromContext(ctx: Context) {
    context.value = ctx
    mode.value = ctx.mode
    currentComponent.value = ctx.component || null
    project.value = ctx.project || null
    selection.value = ctx.selection || null
  }

  // Initialize Tauri context service.
  // The connectInFlight promise is shared across ALL useContextService() callers
  // so that only ONE Tauri IPC round-trip happens regardless of how many
  // components mount simultaneously.
  async function initializeTauri(): Promise<boolean> {
    if (!isTauri.value) return false
    if (connected.value) return true
    if (connectInFlight) {
      console.log('[contextService] initializeTauri: joining existing connectInFlight promise')
      return connectInFlight
    }

    console.log('[contextService] initializeTauri: starting (first caller)')

    connectInFlight = (async () => {
      const _tInit = performance.now()
      try {
        // Start the sidecar binary
        //  const _tStart = performance.now()
        const address = await tauriInvoke<string>('start_context_service')
        //console.log('[perf] contextService: start_context_service invoke:', (performance.now() - _tStart).toFixed(1), 'ms')

        // Connect to it
        const _tConnect = performance.now()
        await tauriInvoke('connect_context', { address })
        // console.log('[perf] contextService: connect_context invoke:', (performance.now() - _tConnect).toFixed(1), 'ms')
        connected.value = true

        // Get initial context
        try {
          const _tCtx = performance.now()
          const ctx = await tauriInvoke<{ mode: string; component?: ComponentContext; project?: ProjectContext }>('context_get')
          //  console.log('[perf] contextService: context_get invoke:', (performance.now() - _tCtx).toFixed(1), 'ms')
          mode.value = (ctx.mode as Mode) || 'code'
          currentComponent.value = ctx.component || null
          project.value = ctx.project || null
        } catch {
          // Context get may fail if service doesn't have context yet
        }

        //  console.log('[perf] contextService: initializeTauri total:', (performance.now() - _tInit).toFixed(1), 'ms')
        // NOTE: on success we intentionally keep connectInFlight assigned so
        // that any later callers (components mounting after this resolves)
        // immediately get the cached resolved promise instead of re-invoking
        // start_context_service via Tauri IPC.
        return true
      } catch {
        // Clear both the reactive flag and the cached promise so a retry can happen.
        markDisconnected()
        //   console.warn('[contextService] initializeTauri FAILED after:', (performance.now() - _tInit).toFixed(1), 'ms', err)
        return false
      }
    })()

    try {
      return await connectInFlight
    } catch {
      return false
    }
  }

  // Track cleanup functions for broadcast/event listeners
  const cleanupFns: Array<() => void> = []

  function _registerCleanup(fn: () => void) {
    cleanupFns.push(fn)
  }

  function runCleanup() {
    for (const fn of cleanupFns) {
      try { fn() } catch { /* ignore cleanup errors */ }
    }
    cleanupFns.length = 0
  }

  // Setup event listeners (only when called from component setup context)
  if (getCurrentInstance()) {
    onMounted(async () => {
      if (isTauri.value) {
        await initializeTauri()
      }
    })

    onUnmounted(() => {
      runCleanup()
    })
  }

  // Actions
  async function connect() {
    if (isTauri.value) {
      const ok = await initializeTauri()
      if (!ok) throw new Error('Not connected')
      return
    }

    throw new Error('Not running in Tauri')
  }

  async function setMode(newMode: Mode) {
    if (isTauri.value) {
      await sendRequest('context.set_mode', { mode: newMode })
      mode.value = newMode
    }
  }

  async function setComponent(component: ComponentContext) {
    if (isTauri.value) {
      await sendRequest('context.set_component', component as unknown as Record<string, unknown>)
      currentComponent.value = component
    }
  }

  async function setProject(proj: ProjectContext) {
    if (isTauri.value) {
      await sendRequest('context.set_project', proj as unknown as Record<string, unknown>)
      project.value = proj
    }
  }

  async function setSelection(sel: SelectionContext) {
    if (isTauri.value) {
      await sendRequest('context.set_selection', sel as unknown as Record<string, unknown>)
      selection.value = sel
    }
  }

  async function clearSelection() {
    if (isTauri.value) {
      await sendRequest('context.set_selection', { type: 'text', content: '' })
      selection.value = null
    }
  }

  async function callTool(toolCall: ToolCall, token?: string): Promise<ToolResult> {
    if (isTauri.value) {
      // Get auth token from localStorage if not provided
      const authToken = token || localStorage.getItem('cp_auth_token') || ''
      return tauriInvoke('context_call_tool', { toolCall, token: authToken })
    }
    throw new Error('Not running in Tauri')
  }

  async function refreshContext() {
    if (!isTauri.value) return

    try {
      const ctx = await tauriInvoke<Context>('context_get')
      updateFromContext(ctx)
    } catch {
      // Silently fail
    }
  }

  async function _refreshTools() {
    if (!isTauri.value) return

    try {
      tools.value = await tauriInvoke<Tool[]>('context_get_tools')
    } catch {
      // Silently fail
    }
  }

  async function ping(): Promise<number> {
    if (isTauri.value) {
      const start = performance.now()
      await tauriInvoke('context_ping')
      return performance.now() - start
    }
    return -1
  }

  // ---------------------------------------------------------------------------
  // Space Context Integration
  // ---------------------------------------------------------------------------

  /**
   * Lazily initialized space context. We use a getter to avoid circular
   * composable initialization issues -- useSpaceContext reads stores that
   * may themselves use useContextService indirectly.
   */
  let _spaceCtx: ReturnType<typeof useSpaceContext> | null = null
  function getSpaceCtx() {
    if (!_spaceCtx) {
      try {
        _spaceCtx = useSpaceContext()
      } catch {
        // If stores aren't ready yet, return null silently
        return null
      }
    }
    return _spaceCtx
  }

  /**
   * Build a system prompt section that includes aggregated space context.
   * This can be prepended to or merged with existing system prompts to
   * give the AI full awareness of the user's current workspace state.
   */
  function buildSystemPrompt(): string {
    const ctx = getSpaceCtx()
    if (!ctx) return ''

    const summary = ctx.getContextSummary()
    if (!summary) return ''

    return [
      '## Current Workspace Context',
      summary,
    ].join('\n')
  }

  /**
   * Enrich a ChatRequest's local_data with the current space context
   * and canvas state. Merges with any existing local_data the caller already set.
   */
  function enrichLocalData(request: ChatRequest): Record<string, unknown> | null {
    const ctx = getSpaceCtx()
    const existing = request.local_data || {}

    if (!ctx) return Object.keys(existing).length > 0 ? existing : null

    const spaceData = ctx.spaceContext.value

    // Include canvas data so brain tools (get_canvas_state) can see current elements
    const { currentNodes, currentDesignName, currentPageId } = useCanvasContext()
    const canvasNodes = currentNodes.value
    // Detect project-scoped route for AI context
    const currentRoute = useRoute?.()
    const routePath = currentRoute?.path || ''
    const projectRouteMatch = routePath.match(/\/app\/projects\/([^/]+)\/([^/]+)/)
    const routeContext = projectRouteMatch
      ? { isProjectScoped: true, projectId: projectRouteMatch[1], spaceName: projectRouteMatch[2] }
      : { isProjectScoped: false, projectId: null, spaceName: spaceData.activeSpace }

    const enriched: Record<string, unknown> = {
      ...existing,
      space_context: {
        activeSpace: spaceData.activeSpace,
        project: spaceData.project,
        code: spaceData.code,
        ui: spaceData.ui,
        tasks: spaceData.tasks,
        notes: spaceData.notes,
        git: spaceData.git,
        docs: spaceData.docs,
      },
      route_context: routeContext,
    }

    // Attach canvas data for get_canvas_state and other design tools
    if (canvasNodes.length > 0) {
      enriched.canvas_data = canvasNodes.map(n => ({ ...n }))
      enriched.current_design = currentDesignName.value || undefined
      enriched.current_page_id = currentPageId.value || undefined
    }

    return enriched
  }

  function resolveLocalData(request: ChatRequest): Record<string, unknown> | null {
    if (request.include_space_context === false) {
      return request.local_data || null
    }
    return enrichLocalData(request)
  }

  async function chat(request: ChatRequest): Promise<ChatResponse> {
    if (isTauri.value) {
      return tauriInvoke('chat_direct', {
        model: request.model,
        messages: request.messages,
      })
    }
    throw new Error('Not running in Tauri')
  }

  // Direct Anthropic API streaming from browser (bypasses Go backend) - kept for fallback
  async function _directAnthropicStream(
    messages: ChatMessage[],
    model: string,
    token: string,
    onChunk: (chunk: ContextStreamChunk) => void
  ): Promise<void> {
    // Extract system message and convert to Anthropic format
    let systemPrompt = ''
    const anthropicMessages: { role: string; content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> }[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages are always string
        systemPrompt = typeof msg.content === 'string' ? msg.content : ''
        continue
      }
      // Handle multimodal content (with images)
      if (Array.isArray(msg.content)) {
        // Convert OpenAI format to Anthropic format
        const anthropicContent: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            anthropicContent.push({ type: 'text', text: part.text })
          } else if (part.type === 'image_url' && part.image_url) {
            // Convert data URL to Anthropic image format
            const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
            if (match && match[1] && match[2]) {
              anthropicContent.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: match[1],
                  data: match[2]
                }
              })
            }
          }
        }
        if (anthropicContent.length > 0) {
          anthropicMessages.push({ role: msg.role, content: anthropicContent })
        }
      } else {
        // Regular string content
        if (!msg.content || msg.content.trim() === '') {
          continue
        }
        anthropicMessages.push({ role: msg.role, content: msg.content })
      }
    }

    const requestBody = {
      model,
      max_tokens: 8192,
      messages: anthropicMessages,
      system: systemPrompt || undefined,
      stream: true,
      metadata: {
        user_id: 'claude-code'
      }
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages?beta=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20,interleaved-thinking-2025-05-14',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        onChunk({ content: '', done: true, error: `Anthropic API error: ${response.status} - ${errorText}` })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        onChunk({ content: '', done: true, error: 'No response body' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          onChunk({ content: '', done: true })
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          const data = line.slice(6)
          if (data === '[DONE]') {
            onChunk({ content: '', done: true })
            return
          }

          try {
            const event = JSON.parse(data)

            if (event.type === 'content_block_delta' && event.delta?.text) {
              onChunk({ content: event.delta.text, done: false })
            } else if (event.type === 'message_stop') {
              onChunk({ content: '', done: true })
              return
            } else if (event.type === 'error') {
              onChunk({ content: '', done: true, error: event.error?.message || 'Unknown error' })
              return
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } catch (error) {
      onChunk({ content: '', done: true, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  async function chatStream(request: ChatRequest, onChunk: (chunk: ContextStreamChunk) => void, options?: { signal?: AbortSignal }): Promise<void> {
    if (isTauri.value) {
      let unlisten: (() => void) | null = null
      try {
        const { listen } = await import('@tauri-apps/api/event')

        // Set up the listener BEFORE invoking the Tauri command to prevent
        // a race where the stream completes before unlistenFn is assigned.
        let isDone = false
        const streamComplete = new Promise<void>((resolve, reject) => {
          // Helper to clean up and resolve on abort or completion
          const finish = (error?: string) => {
            if (isDone) return
            isDone = true
            if (unlisten) { unlisten(); unlisten = null }
            if (error) {
              reject(new Error(error))
            } else {
              resolve()
            }
          }

          // Listen for abort signal — resolves the promise immediately so sendMessage
          // can exit, preventing zombie listeners when the user clicks Stop or navigates away.
          if (options?.signal) {
            if (options.signal.aborted) {
              finish()
              return
            }
            options.signal.addEventListener('abort', () => { finish() }, { once: true })
          }

          listen<ContextStreamChunk>('chat-stream-chunk', (event) => {
            if (isDone) return
            // Skip delivering chunks if the caller has been aborted (e.g. component unmounted)
            if (options?.signal?.aborted) {
              finish()
              return
            }
            onChunk(event.payload)
            if (event.payload.done || event.payload.error) {
              finish(event.payload.error)
            }
          }).then((fn) => {
            unlisten = fn
            // If stream already finished before listener was assigned, clean up immediately
            if (isDone) {
              unlisten()
              unlisten = null
            }
          }).catch((err) => { console.error('[chatStream] listener setup failed:', err); finish(err instanceof Error ? err.message : 'Listener setup failed') })
        })

        // Start the streaming request AFTER listener is registered
        await tauriInvoke('chat_stream', {
          model: request.model,
          messages: request.messages,
          token: request.token || null,
          agent_id: request.agent_id || null,
          space: request.space || null,
          local_data: resolveLocalData(request),
          max_iterations: request.max_iterations || null,
        })
        // Wait for streaming to complete
        await streamComplete
      } catch (error) {
        console.error('[chatStream] ERROR:', error)
        // Ensure listener is cleaned up on any error path.
        // Cast needed: TS can't track that .then() callback mutates unlisten.
        const fn = unlisten as (() => void) | null
        if (fn) {
          fn()
          unlisten = null
        }
        onChunk({ content: '', done: true, error: error instanceof Error ? error.message : 'Unknown error' })
      }
      return
    }

    throw new Error('Not running in Tauri')
  }

  async function listModels(): Promise<{ models: OllamaModel[] }> {
    if (isTauri.value) {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!connected.value) {
            await connect()
          }
          return await tauriInvoke('list_models')
        } catch (error) {
          lastError = error
          if (!isNotConnectedError(error) || attempt === 2) {
            throw error
          }
          markDisconnected()
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Not connected')
    }
    throw new Error('Not running in Tauri')
  }

  async function listProviders(): Promise<ProvidersResponse> {
    if (isTauri.value) {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!connected.value) {
            await connect()
          }
          return await tauriInvoke('list_providers')
        } catch (error) {
          lastError = error
          if (!isNotConnectedError(error) || attempt === 2) {
            throw error
          }
          markDisconnected()
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Not connected')
    }
    // Fallback for non-Tauri (browser dev) — mirrors context/handlers/ai.go ai.providers
    return {
      providers: [
        {
          id: 'zai', label: 'Z.ai', authType: 'api',
          models: [
            { id: 'glm-5', label: 'GLM-5' },
            { id: 'glm-4.7-flash', label: 'GLM 4.7 Flash' },
            { id: 'glm-4.6v', label: 'GLM 4.6V' },
          ],
        },
        {
          id: 'anthropic', label: 'Anthropic', authType: 'api',
          models: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
          ],
        },
        {
          id: 'deepseek', label: 'DeepSeek', authType: 'api',
          models: [
            { id: 'deepseek-chat', label: 'DeepSeek V3' },
            { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
          ],
        },
        {
          id: 'xai', label: 'xAI', authType: 'api',
          models: [
            { id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast' },
            { id: 'grok-code-fast-1', label: 'Grok Code' },
          ],
        },
        {
          id: 'xiaomi', label: 'Xiaomi', authType: 'api',
          models: [
            { id: 'mimo-v2-flash', label: 'MiMo V2 Flash' },
          ],
        },
        {
          id: 'lmstudio', label: 'LM Studio', authType: 'local',
          models: [
            { id: 'mistralai/ministral-3-3b', label: 'Ministral 3B' },
          ],
        },
      ],
      default: 'zai',
      defaultProvider: 'zai',
      defaultModel: 'zai:glm-4.7-flash',
    }
  }

  async function listAgents(): Promise<AgentsResponse> {
    if (isTauri.value) {
      return tauriInvoke('list_agents')
    }
    // Fallback for non-Tauri (browser dev)
    return {
      agents: [
        { id: 'code', name: 'Code Agent', category: 'specialized', description: 'Full codebase access for development', icon: 'lucide:code', isBuiltin: true },
        { id: 'design', name: 'Design Agent', category: 'specialized', description: 'UI/UX design assistant', icon: 'lucide:palette', isBuiltin: true },
        { id: 'kanban', name: 'Kanban Agent', category: 'specialized', description: 'Project management', icon: 'lucide:kanban', isBuiltin: true },
        { id: 'calendar', name: 'Calendar Agent', category: 'specialized', description: 'Scheduling', icon: 'lucide:calendar', isBuiltin: true },
        { id: 'git', name: 'Git Agent', category: 'specialized', description: 'Version control', icon: 'lucide:git-branch', isBuiltin: true },
        { id: 'explorer', name: 'Explorer Agent', category: 'specialized', description: 'Codebase exploration', icon: 'lucide:compass', isBuiltin: true },
        { id: 'planner', name: 'Planner Agent', category: 'specialized', description: 'Technical planning', icon: 'lucide:clipboard-list', isBuiltin: true },
      ]
    }
  }

  async function getAgent(id: string): Promise<Agent> {
    if (isTauri.value) {
      const response = await sendRequest<Agent>('agents.get', { id })
      return response
    }
    throw new Error('Not running in Tauri')
  }

  async function analyzeIntent(prompt: string): Promise<{ primary_agent: string; secondary_agents: string[]; reasoning: string; confidence: number }> {
    if (isTauri.value) {
      return sendRequest('agents.analyze', { prompt })
    }
    throw new Error('Not running in Tauri')
  }

  async function dispatchToAgent(agentId: string, task: string, context?: Record<string, unknown>): Promise<{ session_id: string; agent_id: string; result?: unknown }> {
    if (isTauri.value) {
      return sendRequest('agents.dispatch', { agent_id: agentId, task, context })
    }
    throw new Error('Not running in Tauri')
  }

  /**
   * Chat streaming with tool calling support
   * When the AI wants to call a tool, the toolExecutor is invoked and the result is sent back
   */
  async function chatStreamWithTools(
    request: ChatRequestWithTools,
    onChunk: (chunk: ContextStreamChunk) => void,
    toolExecutor?: ToolExecutor
  ): Promise<void> {
    if (!isTauri.value) {
      throw new Error('Tool streaming not available outside Tauri')
    }

    // Declared outside try so it's accessible from the catch block.
    let currentUnlisten: (() => void) | null = null
    try {
      const { listen } = await import('@tauri-apps/api/event')
      let accumulatedToolCalls: ToolCall[] = []
      const conversationMessages = [...request.messages]

      // Helper: register listener, invoke stream command, wait for completion.
      // Returns 'tools' if tool calls need processing, 'done' otherwise.
      const listenAndStream = async (messages: ChatMessage[]): Promise<'done' | 'tools'> => {
        let isDone = false
        currentUnlisten = null
        return new Promise<'done' | 'tools'>((resolve, reject) => {
          // Register listener BEFORE invoking the command to avoid race.
          listen<ContextStreamChunk>('chat-stream-chunk', (event) => {
            if (isDone) return
            const chunk = event.payload

            if (chunk.tool_calls && chunk.tool_calls.length > 0) {
              accumulatedToolCalls = [...accumulatedToolCalls, ...chunk.tool_calls]
              onChunk({ content: '', done: false, tool_calls: chunk.tool_calls })
            }

            if (chunk.content) {
              onChunk({ content: chunk.content, done: false })
            }

            if (chunk.done || chunk.error) {
              isDone = true
              if (currentUnlisten) currentUnlisten()
              currentUnlisten = null

              if (chunk.error) {
                reject(new Error(chunk.error))
              } else if (accumulatedToolCalls.length > 0 && toolExecutor) {
                resolve('tools')
              } else {
                resolve('done')
              }
            }
          }).then((fn) => {
            currentUnlisten = fn
            // If stream already finished before listener was assigned, clean up immediately
            if (isDone) {
              currentUnlisten()
              currentUnlisten = null
            }
          }).catch(reject)

          // Invoke the stream command AFTER listener registration starts.
          tauriInvoke('chat_stream', {
            model: request.model,
            messages,
            tools: request.tools,
            tool_choice: request.tool_choice || 'auto',
            token: request.token || null,
            agent_id: request.agent_id || null,
            space: request.space || null,
            local_data: resolveLocalData(request),
            max_iterations: request.max_iterations || null,
          }).catch(reject)
        })
      }

      // Iterative loop: stream -> process tools -> stream again, no recursion.
      let streamResult = await listenAndStream(conversationMessages)

      while (streamResult === 'tools') {
        // Execute each tool call
        const toolResults: ToolResult[] = []
        for (const toolCall of accumulatedToolCalls) {
          try {
            const result = await toolExecutor!(toolCall)
            toolResults.push(result)
            onChunk({
              content: `\n[Tool ${toolCall.function.name} completed]\n`,
              done: false
            })
          } catch (e) {
            toolResults.push({
              tool_call_id: toolCall.id,
              content: `Error: ${e instanceof Error ? e.message : String(e)}`,
              is_error: true
            })
          }
        }

        // Add assistant message with tool calls and tool results to conversation
        conversationMessages.push({
          role: 'assistant',
          content: `[Tool calls executed: ${accumulatedToolCalls.map(t => t.function.name).join(', ')}]`
        })

        // Add tool results as user message
        conversationMessages.push({
          role: 'user',
          content: `Tool results:\n${toolResults.map(r =>
            `${r.tool_call_id}: ${r.is_error ? 'ERROR: ' : ''}${r.content}`
          ).join('\n')}`
        })

        // Clear accumulated tool calls and continue
        accumulatedToolCalls = []

        // Continue the conversation with tool results (new listener per iteration)
        streamResult = await listenAndStream(conversationMessages)
      }

      onChunk({ content: '', done: true })
    } catch (error) {
      // Ensure listener is cleaned up on any error path
      if (currentUnlisten) {
        currentUnlisten()
        currentUnlisten = null
      }
      onChunk({ content: '', done: true, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  async function visionAnalyze(
    model: string,
    imageUrl: string,
    detailLevel: 'quick' | 'balanced' | 'detailed',
    canvasContext?: { elementCount: number; rightmostX: number },
    onChunk?: (chunk: ContextStreamChunk) => void,
  ): Promise<void> {
    if (!isTauri.value) {
      throw new Error('Vision analysis requires the desktop app (Tauri)')
    }

    try {
      const { listen } = await import('@tauri-apps/api/event')

      // Set up listener BEFORE invoking the Tauri command to prevent
      // race where stream completes before unlisten is assigned.
      let isDone = false
      const streamComplete = new Promise<void>((resolve, reject) => {
        let unlisten: (() => void) | null = null

        const setup = async () => {
          unlisten = await listen<ContextStreamChunk>('vision-stream-chunk', (event) => {
            if (isDone) return
            if (onChunk) onChunk(event.payload)
            if (event.payload.done || event.payload.error) {
              isDone = true
              if (unlisten) unlisten()
              if (event.payload.error) {
                reject(new Error(event.payload.error))
              } else {
                resolve()
              }
            }
          })
        }
        setup()
      })

      await tauriInvoke('vision_analyze', {
        model,
        imageUrl,
        detailLevel,
        canvasContext: canvasContext ? {
          element_count: canvasContext.elementCount,
          rightmost_x: canvasContext.rightmostX,
        } : null,
      })

      await streamComplete
    } catch (error) {
      if (onChunk) onChunk({ content: '', done: true, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  // Generic request sender for Tauri
  async function sendRequest<T = unknown>(requestType: string, payload?: Record<string, unknown>): Promise<T> {
    if (isTauri.value) {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!connected.value) {
            await connect()
          }
          return await tauriInvoke<T>('send_context_request', {
            requestType,
            payload: payload || null
          })
        } catch (error) {
          lastError = error
          if (!isNotConnectedError(error) || attempt === 2) {
            throw error
          }
          markDisconnected()
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Not connected')
    }
    throw new Error('sendRequest only available in Tauri')
  }

  // Conversation management
  async function createConversation(name: string, model: string): Promise<ContextConversation> {
    return sendRequest<ContextConversation>('conversation.create', { name, model })
  }

  async function listConversations(): Promise<ConversationListItem[]> {
    const result = await sendRequest<{ conversations: ConversationListItem[] }>('conversation.list', {})
    return result.conversations || []
  }

  async function getConversation(id: string): Promise<ContextConversation> {
    return sendRequest<ContextConversation>('conversation.get', { id })
  }

  async function deleteConversation(id: string): Promise<void> {
    await sendRequest('conversation.delete', { id })
  }

  // OAuth functions for Anthropic MAX subscription
  async function oauthStart(scopes: string[] = []): Promise<string> {
    if (!isTauri.value) {
      throw new Error('OAuth only available in Tauri')
    }
    // Claude Code's client ID
    const clientId = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
    return tauriInvoke<string>('oauth_start', { clientId, scopes })
  }

  async function oauthGetPending(): Promise<{
    state: string
    code_verifier: string
    client_id: string
    redirect_uri: string
  }> {
    if (!isTauri.value) {
      throw new Error('OAuth only available in Tauri')
    }
    return tauriInvoke('oauth_get_pending')
  }

  async function oauthExchange(code: string, state: string): Promise<OAuthTokenResponse> {
    if (!isTauri.value) {
      throw new Error('OAuth only available in Tauri')
    }
    return tauriInvoke<OAuthTokenResponse>('oauth_exchange', { code, state })
  }

  async function oauthCloseWindow(): Promise<void> {
    if (!isTauri.value) {
      throw new Error('OAuth only available in Tauri')
    }
    return tauriInvoke('oauth_close_window')
  }

  async function oauthReadKeychain(): Promise<OAuthTokenResponse> {
    if (!isTauri.value) {
      throw new Error('OAuth only available in Tauri')
    }
    return tauriInvoke<OAuthTokenResponse>('oauth_read_keychain')
  }

  return {
    // State (readonly refs) - cast to Ref for interface compatibility
    connected: readonly(connected) as unknown as Ref<boolean>,
    context: readonly(context) as unknown as Ref<Context | null>,
    mode: readonly(mode) as unknown as Ref<Mode>,
    currentComponent: readonly(currentComponent) as unknown as Ref<ComponentContext | null>,
    project: readonly(project) as unknown as Ref<ProjectContext | null>,
    selection: readonly(selection) as unknown as Ref<SelectionContext | null>,
    tools: readonly(tools) as unknown as Ref<Tool[]>,
    isTauri: readonly(isTauri) as unknown as Ref<boolean>,

    // Actions
    connect,
    setMode,
    setComponent,
    setProject,
    setSelection,
    clearSelection,
    callTool,
    refreshContext,
    ping,
    chat,
    chatStream,
    chatStreamWithTools,
    visionAnalyze,
    listModels,
    listProviders,

    // Conversation management
    sendRequest,
    createConversation,
    listConversations,
    getConversation,
    deleteConversation,

    // Agent system
    listAgents,
    getAgent,
    analyzeIntent,
    dispatchToAgent,

    // OAuth for Anthropic MAX
    oauthStart,
    oauthGetPending,
    oauthExchange,
    oauthCloseWindow,
    oauthReadKeychain,

    // Space context integration
    buildSystemPrompt,
    enrichLocalData,
  }
}

/**
 * Use just the mode state with auto-sync
 */
export function useContextMode() {
  const { mode, setMode, connected, isTauri } = useContextService()

  return {
    mode,
    setMode,
    connected,
    isTauri,
    isCode: computed(() => mode.value === 'code'),
    isUI: computed(() => mode.value === 'ui'),
  }
}

/**
 * Use component context
 */
export function useComponentContext() {
  const { currentComponent, setComponent, connected, isTauri } = useContextService()

  async function focusComponent(name: string, type: string = 'component') {
    await setComponent({ name, type })
  }

  return {
    component: currentComponent,
    setComponent,
    focusComponent,
    connected,
    isTauri,
  }
}
