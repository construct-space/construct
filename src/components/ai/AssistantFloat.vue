<script setup lang="ts">
/**
 * AI Assistant Floating Component
 *
 * Context-aware AI assistant that connects to the local context service.
 * Automatically adapts behavior based on current mode (code/design/chat).
 */

import { useContextService, type ModelRoute } from '~/composables/useContextService'
import { useAIModel } from '~/composables/useAIModel'
import { useAuthStore } from '~/stores/auth'
import { useProjectStore } from '~/stores/project'
import {
  getLatestSpaceContext,
  subscribeSpaceContext,
} from '~/lib/spaceContextBus'
import type {
  DocumentListItem,
  FileTreeEntry,
  GitChange,
  GitCommit,
  GitRepoInfo,
  TaskCacheItem,
  DocCacheItem,
  ConductorOption,
  ConductorQuestion,
  SearchImageResult,
  ChatMessage,
} from '~/types/assistant'
import {
  parseReferences,
  formatToolName,
  formatToolResult,
} from '~/utils/parseReferences'
import { useAssistantPanel } from '~/composables/useAssistantPanel'
import { useConversationCache } from '~/composables/useConversationCache'
import { useMarkdown } from '~/composables/useMarkdown'
import { parseToolResult } from '~/composables/useDesignActions'
import { useCanvasContext } from '~/composables/useCanvasContext'
import { useAssistantData, taskPriorityColors } from '~/composables/useAssistantData'
import { useAssistantAutocomplete } from '~/composables/useAssistantAutocomplete'
import { useAssistantCommands } from '~/composables/useAssistantCommands'
import { useAssistantPrompt, compactForLLM, buildMessageWithToolContext } from '~/composables/useAssistantPrompt'

// Space composables are provided at runtime by IIFE bundles.
// These defaults are used when a space is not installed.
const useCodeEditor = (() => ({
  state: { rootPath: '', currentFile: '', fileContent: '', currentLanguage: '', fileTree: [] as FileTreeEntry[] },
  selection: ref<{ text: string; startLine: number; endLine: number } | null>(null),
  loadDirectory: (..._args: unknown[]) => Promise.resolve(),
  selectFile: () => {},
  openFolder: () => {},
  getFileIcon: () => 'i-lucide-file',
  getFileIconColor: () => '',
}))
const useGitRepo = (() => ({
  state: {
    repositories: new Map<string, unknown>(), currentRepoPath: '', currentBranch: '', commits: [] as GitCommit[],
    stagedChanges: [] as GitChange[], unstagedChanges: [] as GitChange[],
    untrackedFiles: [] as GitChange[], conflictedFiles: [] as GitChange[],
  },
  currentRepo: ref<GitRepoInfo | null>(null),
  hasChanges: ref(false),
}))
import { detectCodeFramework, resolveAssistantAgentId } from './assistant/spaceBehavior'
import AssistantCodeSpace from './assistant/code.vue'
import AssistantUISpace from './assistant/ui.vue'
import AssistantGitSpace from './assistant/git.vue'
import AssistantKanbanSpace from './assistant/kanban.vue'
import AssistantNotesSpace from './assistant/notes.vue'
import AssistantDocsSpace from './assistant/docs.vue'
import AssistantAISpace from './assistant/ai.vue'
import AssistantDeploySpace from './assistant/deploy.vue'
import AssistantProjectSpace from './assistant/project.vue'
import AssistantDashboardSpace from './assistant/dashboard.vue'
import AssistantGeneralSpace from './assistant/general.vue'

// Props — popoutMode when opened in a separate ConstructWindow
const props = defineProps<{
  popoutMode?: boolean
  /** Space name passed from AssistantPage (received via Tauri event) */
  popoutSpace?: string | null
}>()

// Define emits
const emit = defineEmits<{
  'preview-image': [url: string]
}>()

// Initialize markdown module (client-side)
const { renderMarkdown } = useMarkdown()

// Get the vision model - vision+tools requires Claude (via OAuth)
// Falls back to user's selected model, then auto
const getVisionModel = () => {
  const { defaultModelId, resolveModelId } = useAIModel()
  const selected = resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto', persist: true })
  // If user selected a Claude model, use it (best vision+tools support)
  if (selected.includes('claude')) return selected
  // Otherwise use auto and let the router pick (will prefer Claude if available)
  return 'auto'
}

// Track design actions created during this session
const designActionsCreated = ref(0)

// Vision detail level for screenshot-to-UI conversion

// Get canvas context for local_data
const { designsCache, currentNodes, currentDesignName } = useCanvasContext()

// Get code editor state for current folder path and file content
const {
  state: codeEditorState,
  selection: codeEditorSelection,
  loadDirectory: reloadCodeDirectory,
} = useCodeEditor()

const FILE_TREE_MUTATION_TOOLS = new Set(['write_file', 'create_file', 'delete_file', 'move_file'])
let pendingExplorerRefresh: ReturnType<typeof setTimeout> | null = null

const scheduleExplorerRefresh = () => {
  const rootPath = codeEditorState.rootPath
  if (!rootPath) return

  if (pendingExplorerRefresh) {
    clearTimeout(pendingExplorerRefresh)
  }

  pendingExplorerRefresh = setTimeout(() => {
    pendingExplorerRefresh = null
    const currentRootPath = codeEditorState.rootPath
    if (!currentRootPath) return
    reloadCodeDirectory(currentRootPath, { preserveExpanded: true }).catch((err) => {
      console.debug('[AssistantFloat] Explorer refresh failed:', err)
    })
  }, 180)
}


const route = useRoute()
const authStore = useAuthStore()
const projectStore = useProjectStore()

// ---------------------------------------------------------------------------
// Space Context Bus — reactive caches for domain data
// Replaces direct imports of useTasksStore, useDocumentsStore, useUsersStore
// ---------------------------------------------------------------------------
const busTasksCache = ref<TaskCacheItem[]>([])
const busDocsCache = ref<DocumentListItem[]>([])
const busCurrentDoc = ref<DocCacheItem | null>(null)

// Subscribe to space context updates
subscribeSpaceContext('tasks', (payload) => {
  const summary = payload.summary as { recentTasks?: TaskCacheItem[] } | undefined
  if (summary?.recentTasks) busTasksCache.value = summary.recentTasks
})
subscribeSpaceContext('documents', (payload) => {
  const summary = payload.summary as { documents?: DocumentListItem[]; activeDocument?: DocCacheItem | null } | undefined
  if (summary?.documents) busDocsCache.value = summary.documents
  if (summary?.activeDocument !== undefined) busCurrentDoc.value = summary.activeDocument ?? null
})

// Seed caches from last-published context (if spaces already running)
const initialTasks = getLatestSpaceContext('tasks')
if (initialTasks?.summary?.recentTasks) busTasksCache.value = initialTasks.summary.recentTasks as TaskCacheItem[]
const initialDocs = getLatestSpaceContext('documents')
if (initialDocs?.summary?.documents) busDocsCache.value = initialDocs.summary.documents as DocumentListItem[]
if (initialDocs?.summary?.activeDocument) busCurrentDoc.value = initialDocs.summary.activeDocument as DocCacheItem

// Credits for AI usage tracking (can be re-enabled in settings for API-key models)
// const credits = useCredits()
// const { balance, userRemaining, hasUnlimitedAllocation, isLowCredits, formatCredits } = credits

// Credits: users provide their own API keys, no server-side credit tracking

// Context service integration
const {
  connected,
  mode,
  currentComponent,
  project: _project, // Reserved for future use
  ping,
  chat: _chat, // Reserved for non-streaming fallback
  chatStream,
  callTool,
  isTauri,
  sendRequest,
} = useContextService()

// AI Model - uses default from preferences
const { defaultModelId, currentModel, getProviderId, resolveModelId } = useAIModel()

// Check if current model is Claude (uses OAuth via context service)
const _isClaudeModel = computed(() => {
  const providerId = getProviderId(resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto', persist: true }))
  return providerId === 'anthropic-oauth'
})

// Mutable cache — loaded async on mount, accessed directly throughout
let conversationCache = new Map<string, ChatMessage[]>()

// Use global assistant state
const { isOpen, isPoppedOut } = useAssistant()

// Pop out assistant into a separate ConstructWindow
async function popOutAssistant() {
  const { useConstructWindow } = await import('@/composables/useConstructWindow')
  const { open: openWindow, getByLabel, focus: focusWin } = useConstructWindow()

  // If already popped out, focus the existing window
  const existing = getByLabel('standalone-assistant')
  if (existing) {
    await focusWin(existing)
    return
  }

  // Gather current context
  const project = projectStore.currentProject
  const space = route.path.match(/\/app\/(?:projects\/[^/]+\/)?(\w+)/)?.[1] || ''
  const contextPayload = {
    type: 'assistant-context' as const,
    project: project ? { id: project.id, name: project.name, path: project.path } : null,
    space: space || null,
  }

  // Signal the router guard to redirect to /assistant
  localStorage.setItem('construct_popout_route', '/assistant')

  await openWindow('/', {
    label: 'standalone-assistant',
    title: project ? `Construct AI — ${project.name}` : 'Construct AI',
    width: 520,
    height: 780,
    center: true,
    decorations: false,
    resizable: true,
    skipTaskbar: false,
    visible: true,
  })

  // Close the float in main window
  isOpen.value = false
  isPoppedOut.value = true

  // Send context via BroadcastChannel — the popout listens on mount.
  // Retry a few times to ensure the popout's listener is ready.
  const channel = new BroadcastChannel('construct-assistant')
  const sendContext = () => channel.postMessage(contextPayload)
  setTimeout(sendContext, 200)
  setTimeout(sendContext, 800)
  setTimeout(sendContext, 2000)

  // Listen for popout window close via the channel
  const closeChannel = new BroadcastChannel('construct-assistant')
  closeChannel.onmessage = (event) => {
    if (event.data?.type === 'assistant-closed') {
      isPoppedOut.value = false
      closeChannel.close()
    }
  }
}

// Double Shift detection (left Shift = assistant).
// Right Shift is handled by ChatFloat for side-panel toggle.
let lastLeftShiftPress = 0
const DOUBLE_PRESS_DELAY = 300 // ms

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key !== 'Shift') return
  // Only react to physical LEFT Shift.
  if (e.location !== 1 || e.code !== 'ShiftLeft') return

  const now = Date.now()
  if (now - lastLeftShiftPress < DOUBLE_PRESS_DELAY) {
    // If popped out, focus the popout window instead of toggling float
    if (isPoppedOut.value) {
      focusPopoutWindow()
      lastLeftShiftPress = 0
      return
    }
    isOpen.value = !isOpen.value
    lastLeftShiftPress = 0
  } else {
    lastLeftShiftPress = now
  }
}

async function focusPopoutWindow() {
  try {
    const { useConstructWindow } = await import('@/composables/useConstructWindow')
    const { getByLabel, focus } = useConstructWindow()
    const win = getByLabel('standalone-assistant')
    if (win) {
      await focus(win)
    } else {
      // Window was closed externally — reset state and open float
      isPoppedOut.value = false
      isOpen.value = true
    }
  } catch {
    isPoppedOut.value = false
    isOpen.value = true
  }
}

onMounted(async () => {
  window.addEventListener('keyup', handleKeyUp)
  // Load available agents for slash commands
  loadAgents()
  // Load dev mode setting
  loadDevMode()
  // Load conversation cache from SQLite/localStorage
  conversationCache = await loadConversationCache()
  // Re-check dock target availability after mount (layout targets may now exist)
  if (wantsDocked.value) {
    nextTick(() => {
      requestAnimationFrame(() => {
        dockTargetEl.value = resolveDockTarget()
      })
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('keyup', handleKeyUp)
  if (pendingExplorerRefresh) {
    clearTimeout(pendingExplorerRefresh)
    pendingExplorerRefresh = null
  }
  // Cleanup drag/resize listeners if still active
  cleanupPanelListeners()
})

// Conversation key based on route (space + project query)
const conversationKey = computed(() => {
  // Popout mode: build key from props + project store
  if (props.popoutMode) {
    const space = props.popoutSpace || 'assistant'
    const projectId = projectStore.currentProject?.id
    if (projectId) return `${space}-${projectId}`
    return `popout-${space}`
  }

  const path = route.path
  const project = route.query.project
  if (path === '/app' || path === '/app/') {
    return 'dashboard-global-v2'
  }
  // Extract space from path like /app/code
  const spaceMatch = path.match(/\/app\/(\w+)/)
  if (spaceMatch && project) {
    return `${spaceMatch[1]}-${project}`
  }
  // Fallback to full path for other routes
  return path
})

// Local state
const message = ref('')
const messages = ref<ChatMessage[]>([])
const isLoading = ref(false)
const abortController = ref<AbortController | null>(null)
const currentRoute = ref<ModelRoute | null>(null) // Track routed model info
const messageQueue = ref<string[]>([]) // Queue messages while AI is processing

// Conversation persistence — extracted to composable
const conversationCacheComposable = useConversationCache({ isTauri, sendRequest, messages })
const { loadConversationCache, saveConversation, saveMessageIncremental } = conversationCacheComposable
const _saveConversationCache = conversationCacheComposable.saveConversationCache

// Panel position, drag-to-move, resize, dock — extracted to composable
const {
  panelPosition,
  isDraggingPanel,
  showDockMenu,
  panelRef,
  panelSize,
  isResizing,
  wantsDocked,
  dockTargetEl,
  isDocked,
  panelPositionClasses,
  panelStyle,
  setPanelPosition,
  startPanelDrag,
  startResize,
  resolveDockTarget,
  cleanupListeners: cleanupPanelListeners,
} = useAssistantPanel()

// Dev mode - shows internal AI operations (tool calls, routing, debug info)
const devMode = ref(import.meta.env.DEV) // Default to env check
const debugMessages = ref<string[]>([]) // Debug messages for current request
const debugPanelRef = ref<HTMLElement | null>(null) // Ref for auto-scroll

// Auto-scroll debug panel to bottom on new messages
watch(debugMessages, () => {
  nextTick(() => {
    if (debugPanelRef.value) {
      debugPanelRef.value.scrollTop = debugPanelRef.value.scrollHeight
    }
  })
}, { deep: true })

// Load dev mode setting — only enabled during tauri dev, never in release builds
const loadDevMode = async () => {
  if (!isTauri.value) return
  // Only show debug panel in dev builds (cargo tauri dev / bun run dev)
  devMode.value = import.meta.env.DEV === true
}

// Stop the current streaming response
function stopGeneration() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  isLoading.value = false
  // Mark the last assistant message as stopped
  const lastMsg = messages.value[messages.value.length - 1]
  if (lastMsg && lastMsg.role === 'assistant') {
    lastMsg.content += '\n\n*[Stopped by user]*'
    lastMsg.renderedHtml = renderMarkdown(lastMsg.content)
  }
}

const latency = ref<number | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

// Project data loading (designs, docs, files) delegated to useAssistantData composable
const {
  projectDesigns,
  syncApiDesigns,
  projectDocs,
  localDocs,
  projectFiles,
  docsTauriFs: getDocsTauriFs,
} = useAssistantData({
  projectStore,
  sendRequest,
  callTool,
  connected,
  busTasksCache,
  codeEditorState,
})

// Autocomplete system (trigger detection, suggestions, keyboard nav, selection)
const {
  showAutocomplete,
  autocompleteType,
  autocompleteIndex,
  autocompleteSuggestions,
  inputHistory,
  historyIndex,
  tempInput,
  handleInput,
  handleKeydown,
  selectAutocomplete,
  loadAgents,
  agents,
} = useAssistantAutocomplete({
  message,
  inputRef,
  isLoading,
  projectDesigns,
  syncApiDesigns,
  projectDocs,
  localDocs,
  projectFiles,
  busTasksCache,
  codeEditorRootPath: computed(() => codeEditorState.rootPath),
  stopGeneration,
  sendMessage: () => sendMessage(),
})

// Active agent tracking — resolved from brain's agent registry
const activeAgentId = ref<string | null>(null)
const activeAgent = computed(() => {
  if (!activeAgentId.value) return null
  return agents.value.find(a => a.id === activeAgentId.value) || null
})

// Drag-drop state for image upload (only in UI space)
const isDragging = ref(false)
const dragCounter = ref(0) // Counter to handle dragLeave on child elements
const droppedImage = ref<{ file: File; base64: string; preview: string; mimeType: string } | null>(null)

// Check if in UI space (for enabling image drop)
const isUISpace = computed(() => {
  const space = currentSpace.value?.toLowerCase()
  return space === 'ui' || space === 'design'
})

// Load/save messages from cache based on route
watch(conversationKey, (newKey, oldKey) => {
  // Save current messages to old key before switching
  if (oldKey && messages.value.length > 0) {
    conversationCache.set(oldKey, [...messages.value])
    // Save individual conversation (more efficient than saving entire cache)
    saveConversation(oldKey, [...messages.value])
  }
  // Load messages for new key
  const cached = conversationCache.get(newKey)
  messages.value = cached ? [...cached] : []
}, { immediate: true })

// Save messages to cache when they change (debounced)
// When incremental saves are active, full-blob save acts as safety net at 30s cadence.
// Without incremental saves (localStorage fallback), full save fires at 500ms as before.
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const FULL_SAVE_INTERVAL_INCREMENTAL = 30_000 // 30s safety net when incremental is active
const FULL_SAVE_INTERVAL_DEFAULT = 500 // 500ms for localStorage fallback
watch(messages, (newMessages) => {
  if (newMessages.length > 0) {
    conversationCache.set(conversationKey.value, [...newMessages])
    // Debounce storage write - save individual conversation
    if (saveTimeout) clearTimeout(saveTimeout)
    const interval = (isTauri.value && conversationCacheComposable.lastIncrementalSaveTs > 0)
      ? FULL_SAVE_INTERVAL_INCREMENTAL
      : FULL_SAVE_INTERVAL_DEFAULT
    saveTimeout = setTimeout(() => {
      saveConversation(conversationKey.value, [...newMessages])
    }, interval)
  }
}, { deep: true })


// Compute context label based on mode and route
const contextInfo = computed(() => {
  // Use context service mode if connected
  if (connected.value) {
    switch (mode.value) {
      case 'code':
        return {
          label: 'Code',
          hint: 'Ask about code, debugging, or implementation',
          icon: 'i-lucide-code-2',
          color: 'text-blue-500',
        }
      case 'ui':
        return {
          label: 'Design',
          hint: 'Ask about UI/UX, styling, or layout',
          icon: 'i-lucide-palette',
          color: 'text-fuchsia-500',
        }
      default:
        return {
          label: 'Chat',
          hint: 'How can I help?',
          icon: 'i-lucide-message-square',
          color: 'text-app-accent',
        }
    }
  }

  // Fallback to route-based context
  const path = route.path

  // Popout mode: derive context from space prop
  if (props.popoutMode && props.popoutSpace) {
    const ps = props.popoutSpace.toLowerCase()
    if (ps === 'code') return { label: 'Code', hint: 'Ask about code, debugging, or implementation', icon: 'i-lucide-code-2', color: 'text-blue-500' }
    if (ps === 'design' || ps === 'ui') return { label: 'Design', hint: 'Ask about design, UI/UX, or assets', icon: 'i-lucide-palette', color: 'text-fuchsia-500' }
    if (ps === 'git') return { label: 'Git', hint: 'Ask about version control', icon: 'i-lucide-git-branch', color: 'text-emerald-500' }
    if (ps === 'ai') return { label: 'AI Space', hint: 'Ask about AI features', icon: 'i-lucide-brain', color: 'text-violet-500' }
    if (ps === 'notes' || ps === 'docs') return { label: 'Notes', hint: 'Ask about documentation', icon: 'i-lucide-file-text', color: 'text-amber-500' }
    if (ps === 'kanban') return { label: 'Kanban', hint: 'Ask about tasks', icon: 'i-lucide-kanban', color: 'text-orange-500' }
    if (ps === 'deploy') return { label: 'Deploy', hint: 'Ask about deployments', icon: 'i-lucide-rocket', color: 'text-rose-500' }
  }
  // Popout with project but no space
  if (props.popoutMode && projectStore.currentProject) {
    return { label: 'Project', hint: 'Ask about this project', icon: 'i-lucide-folder', color: 'text-slate-500' }
  }

  if (currentSpaceKey.value === 'vibe') {
    return { label: 'Vibe', hint: 'Ask about execution plans, delivery flow, or session results', icon: 'i-lucide-zap', color: 'text-amber-400' }
  }

  if (path.match(/\/app\/projects\/\d+\/code/)) {
    return { label: 'Code', hint: 'Ask about code, debugging, or implementation', icon: 'i-lucide-code-2', color: 'text-blue-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/design/)) {
    return { label: 'Design', hint: 'Ask about design, UI/UX, or assets', icon: 'i-lucide-palette', color: 'text-fuchsia-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/git/)) {
    return { label: 'Git', hint: 'Ask about version control', icon: 'i-lucide-git-branch', color: 'text-emerald-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/ai/)) {
    return { label: 'AI Space', hint: 'Ask about AI features', icon: 'i-lucide-brain', color: 'text-violet-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/notes/)) {
    return { label: 'Notes', hint: 'Ask about documentation', icon: 'i-lucide-file-text', color: 'text-amber-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/kanban/)) {
    return { label: 'Kanban', hint: 'Ask about tasks', icon: 'i-lucide-kanban', color: 'text-orange-500' }
  }
  if (path.match(/\/app\/projects\/\d+\/deploy/)) {
    return { label: 'Deploy', hint: 'Ask about deployments', icon: 'i-lucide-rocket', color: 'text-rose-500' }
  }
  if (path.match(/\/app\/projects\/\d+/)) {
    return { label: 'Project', hint: 'Ask about this project', icon: 'i-lucide-folder', color: 'text-slate-500' }
  }
  if (path === '/app' || path === '/app/') {
    return { label: 'Dashboard', hint: 'Ask about your projects', icon: 'i-lucide-layout-dashboard', color: 'text-cyan-500' }
  }

  return { label: 'General', hint: 'How can I help?', icon: 'i-lucide-sparkles', color: 'text-app-accent' }
})

// Component context display
const componentLabel = computed(() => {
  if (currentComponent.value) {
    return `${currentComponent.value.name} (${currentComponent.value.type})`
  }
  return null
})

// Extract current space from route (project-scoped and direct space routes)
const currentSpace = computed(() => {
  // Popout mode: read space from prop (received via Tauri event from main window)
  if (props.popoutMode && props.popoutSpace) {
    const s = props.popoutSpace
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const path = route.path
  // Project-scoped: /app/projects/:projectId/:spaceName (projectId can be string slug or number)
  const projectMatch = path.match(/\/app\/projects\/[^/]+\/(\w+)/)
  if (projectMatch?.[1]) {
    return projectMatch[1].charAt(0).toUpperCase() + projectMatch[1].slice(1)
  }
  // Direct space: /app/:spaceName (exclude non-space routes)
  const directMatch = path.match(/\/app\/([a-z][\w-]*)/)
  if (directMatch?.[1] && !['projects', 'settings', 'marketplace', 'onboarding'].includes(directMatch[1])) {
    return directMatch[1].charAt(0).toUpperCase() + directMatch[1].slice(1)
  }
  return null
})

const currentSpaceKey = computed(() => currentSpace.value?.toLowerCase() || '')
const hasExplicitProjectContext = computed(() => {
  if (props.popoutMode) return !!projectStore.currentProject
  if (/\/app\/projects\/[^/]+/.test(route.path)) return true
  const routeProject = route.query.project
  return typeof routeProject === 'string' && routeProject.trim().length > 0
})
const activeProjectName = computed(() => hasExplicitProjectContext.value ? (projectStore.currentProject?.name || '') : '')
const detectedFramework = computed(() => detectCodeFramework(projectFiles.value.map(f => f.path)))

const assistantSpaceUiComponent = computed(() => {
  const path = route.path
  if (path === '/app' || path === '/app/') return AssistantDashboardSpace

  switch (currentSpaceKey.value) {
    case 'code': return AssistantCodeSpace
    case 'ui':
    case 'design': return AssistantUISpace
    case 'git': return AssistantGitSpace
    case 'kanban': return AssistantKanbanSpace
    case 'docs': return AssistantDocsSpace
    case 'notes': return AssistantNotesSpace
    case 'ai': return AssistantAISpace
    case 'deploy': return AssistantDeploySpace
    default:
      if (/\/app\/projects\/\d+/.test(path)) return AssistantProjectSpace
      // Popout mode with project context but no specific space
      if (props.popoutMode && projectStore.currentProject && !currentSpaceKey.value) return AssistantProjectSpace
      return AssistantGeneralSpace
  }
})

// Slash commands — extracted to composable
const { handleSlashCommand } = useAssistantCommands({ messages, isLoading, sendRequest, renderMarkdown })

// System prompt, local data, doc context — extracted to composable
const {
  buildLocalData,
  getReferencedDocsContext,
  buildSystemPrompt,
} = useAssistantPrompt({
  currentSpace,
  projectStore,
  route,
  currentComponent,
  useGitRepo,
  busCurrentDoc,
  projectDocs,
  localDocs,
  projectDesigns,
  syncApiDesigns,
  projectFiles,
  codeEditorState,
  codeEditorSelection,
  currentNodes,
  currentDesignName,
  designsCache,
  getDocsTauriFs,
})

// Place selected image on canvas
function placeSearchImage(msgIndex: number, image: SearchImageResult) {
  const msg = messages.value[msgIndex]
  if (!msg) return

  // Create image element on canvas
  const elemId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
  const element = {
    id: elemId,
    type: 'image',
    name: image.description || 'Image',
    x: 100,
    y: 100,
    width: image.width || 400,
    height: image.height || 300,
    imageUrl: image.url,
    visible: true,
    locked: false,
    opacity: 1,
  }

  // Queue the design action
  parseToolResult(JSON.stringify({ action: 'create_element', element }))

  // Update message to show what was placed
  msg.searchImages = undefined // Remove the image options
  msg.content = `✓ Added **${image.description || 'image'}** to canvas\n\n_Credit: ${image.credit}_`
  msg.renderedHtml = renderMarkdown(msg.content)
}

// Handle conductor option selection
function selectConductorOption(msgIndex: number, option: ConductorOption, isMultiple: boolean) {
  const msg = messages.value[msgIndex]
  if (!msg?.conductorQuestion) return

  if (isMultiple) {
    // Toggle selection for multiple choice
    if (!msg.selectedOptions) msg.selectedOptions = []
    const idx = msg.selectedOptions.indexOf(option.value)
    if (idx >= 0) {
      msg.selectedOptions.splice(idx, 1)
    } else {
      msg.selectedOptions.push(option.value)
    }
  } else {
    // Single selection - send immediately
    msg.selectedOptions = [option.value]
    submitConductorSelection(msgIndex)
  }
}

// Submit conductor selection as a new user message
function submitConductorSelection(msgIndex: number) {
  const msg = messages.value[msgIndex]
  if (!msg?.conductorQuestion || !msg.selectedOptions?.length) return

  // Build response from selected options
  const selectedLabels = msg.selectedOptions.map(val => {
    const opt = msg.conductorQuestion?.options.find(o => o.value === val)
    return opt?.label || val
  })

  // Clear the conductor question (mark as answered)
  msg.conductorQuestion = undefined

  // Send the selection as a new user message
  message.value = selectedLabels.join(', ')
  sendMessage()
}

// Handle "Other" input for conductor question
function submitConductorOther(msgIndex: number, otherValue: string) {
  const msg = messages.value[msgIndex]
  if (!msg?.conductorQuestion || !otherValue.trim()) return

  msg.conductorQuestion = undefined
  message.value = otherValue.trim()
  sendMessage()
}

// Send message to AI with streaming
async function sendMessage() {
  if (!message.value.trim()) return

  // Queue message if AI is currently processing
  if (isLoading.value) {
    messageQueue.value.push(message.value.trim())
    // Show queued message in chat
    messages.value.push({
      role: 'user',
      content: message.value.trim(),
    })
    message.value = ''
    return
  }

  // Clear previous route info
  currentRoute.value = null

  const userMessage = message.value.trim()

  // Check for slash commands
  if (userMessage.startsWith('/')) {
    message.value = ''
    const handled = await handleSlashCommand(userMessage)
    if (handled) return
  }

  // Check if there's an attached image - capture before clearing
  const hasImage = !!droppedImage.value
  let imageContext: { base64: string; mimeType: string } | null = null
  let imageDataUrl: string | undefined

  if (hasImage && droppedImage.value) {
    imageContext = {
      base64: droppedImage.value.base64,
      mimeType: droppedImage.value.mimeType
    }
    imageDataUrl = `data:${imageContext.mimeType};base64,${imageContext.base64}`
    // Clear the dropped image after capturing it
    clearDroppedImage()
  }

  // Push user message with image if present
  const userMessageIndex = messages.value.length
  messages.value.push({
    role: 'user',
    content: userMessage,
    imageUrl: imageDataUrl
  })
  // Incremental save — persist user message immediately
  const userMsg = messages.value[userMessageIndex]
  if (isTauri.value && userMsg) {
    saveMessageIncremental(conversationKey.value, userMessageIndex, userMsg)
  }

  // Save to input history (avoid duplicates)
  if (inputHistory.value[inputHistory.value.length - 1] !== userMessage) {
    inputHistory.value.push(userMessage)
    // Keep last 50 entries
    if (inputHistory.value.length > 50) {
      inputHistory.value.shift()
    }
  }
  historyIndex.value = -1
  tempInput.value = ''

  message.value = ''
  isLoading.value = true
  debugMessages.value = [] // Clear debug messages for new request

  // Create abort controller for this request — allows stopGeneration() to cancel the stream
  const controller = new AbortController()
  abortController.value = controller

  // Add empty assistant message that will be filled by streaming
  const assistantMessageIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '' })

  try {

    // Parse @design, #task, ~component, $file references from the user message
    const references = parseReferences(userMessage)

    // Pre-fetch doc content for ^DocTitle references
    const docContents = references.docs.length > 0
      ? await getReferencedDocsContext(references.docs)
      : undefined

    // Build system prompt with context (including all referenced items)
    let systemPrompt = buildSystemPrompt(references, docContents)

    // If there's an image, add image context instructions
    if (hasImage) {
      systemPrompt += `\n\n## Image Context\nThe user has attached an image. Analyze the image and respond to their message with the image in mind. If they ask for design work, use the image as reference for creating UI elements.`
    }

    // Build messages array (without the empty assistant message we just added)
    // For vision models, the last user message needs to include the image
    // Include tool call summaries so follow-up messages have context about what was done
    // compactForLLM prunes old tool results to save context window budget
    const compactedMsgs = compactForLLM(messages.value.slice(0, -2))
    const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> }> = [
      { role: 'system', content: systemPrompt },
      ...compactedMsgs.map(m => ({
        role: m.role,
        content: m.role === 'assistant' && m.toolCalls?.length
          ? buildMessageWithToolContext(m, projectDocs, projectStore)
          : m.content
      }))
    ]

    const spaceContext = currentSpace.value?.toLowerCase() || mode.value || 'chat'
    let llmUserMessage = userMessage
    let forcedAgentId: string | undefined
    let localDataPatch: Record<string, unknown> = {}

    // Load code assistant behavior dynamically only on Code route.
    if (route.path) {
      const { isCodeRoute, buildCodeAssistantPayload } = await import('./assistant/codeAssistant')
      if (isCodeRoute(route.path)) {
        const codePayload = buildCodeAssistantPayload({
          userMessage,
          designReferenceCount: references.designs.length,
          projectFilePaths: projectFiles.value.map(f => f.path),
        })
        llmUserMessage = codePayload.userMessage
        forcedAgentId = codePayload.agentId
        localDataPatch = codePayload.localDataPatch
      }
    }

    // Add the last user message with image if present
    if (hasImage && imageContext) {
      // Multi-modal message with image
      chatMessages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${imageContext.mimeType};base64,${imageContext.base64}` }
          },
          {
            type: 'text',
            text: llmUserMessage
          }
        ]
      })
    } else {
      // Regular text message
      chatMessages.push({ role: 'user', content: llmUserMessage })
    }

    // Chunk handler for streaming
    const handleChunk = (chunk: { content: string; done: boolean; error?: string; type?: string; route?: ModelRoute }) => {
      // Capture routing info if present (sent in first chunk when auto-routed)
      if (chunk.route) {
        currentRoute.value = chunk.route
        console.log('[AssistantFloat] Routed to:', chunk.route.model, `(${chunk.route.tier}, ${chunk.route.reason})`)
      }

      // Handle tool_call events - show tool as "calling" in UI
      if (chunk.type === 'tool_call' && chunk.content) {
        try {
          const toolData = JSON.parse(chunk.content) as { name: string; arguments: string; id: string }
          const assistantMessage = messages.value[assistantMessageIndex]
          if (assistantMessage) {
            // Initialize toolCalls array if needed
            if (!assistantMessage.toolCalls) {
              assistantMessage.toolCalls = []
            }

            // Parse arguments safely
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(toolData.arguments || '{}')
            } catch {
              args = { raw: toolData.arguments }
            }

            // Add tool call to the message
            assistantMessage.toolCalls.push({
              id: toolData.id,
              name: toolData.name,
              arguments: args,
              status: 'calling',
              expanded: false,
              startTime: Date.now()
            })
          }
        } catch (e) {
          console.warn('Failed to parse tool_call:', e)
        }
        return
      }

      // Handle thinking content from agent reasoning between iterations
      if (chunk.type === 'thinking' && chunk.content) {
        const msg = messages.value[assistantMessageIndex]
        if (msg) {
          msg.thinking = (msg.thinking || '') +
            (msg.thinking ? '\n---\n' : '') + chunk.content
        }
        return
      }

      // Show tool_status and progress as live status updates
      if (chunk.type === 'tool_status' || chunk.type === 'progress') {
        const assistantMessage = messages.value[assistantMessageIndex]
        if (assistantMessage && chunk.content) {
          assistantMessage.statusText = chunk.content

          // Parse server-measured duration from "Tool X completed (Nms)" and attach to tool
          const durationMatch = chunk.content.match(/completed \((\d+)ms\)/)
          if (durationMatch?.[1] && assistantMessage.toolCalls?.length) {
            const durationMs = parseInt(durationMatch[1], 10)
            // Find the most recently completed tool (or still calling) and set its server duration
            const recentTool = [...(assistantMessage.toolCalls || [])].reverse()
              .find(t => t.status === 'calling' || t.status === 'completed')
            if (recentTool) {
              recentTool.durationMs = durationMs
            }
          }
        }
        return
      }

      // Handle structured tool errors with rich context
      if (chunk.type === 'tool_error' && chunk.content) {
        try {
          const errorData = JSON.parse(chunk.content) as { tool: string; error: string; iteration: number; duration_ms: number }
          const assistantMessage = messages.value[assistantMessageIndex]
          if (assistantMessage?.toolCalls?.length) {
            const errorTool = assistantMessage.toolCalls.find(t => t.name === errorData.tool && t.status === 'calling')
            if (errorTool) {
              errorTool.status = 'error'
              errorTool.result = errorData.error
              errorTool.durationMs = errorData.duration_ms
              errorTool.endTime = Date.now()
            }
          }
          // Always push to debug messages for diagnostics
          debugMessages.value.push(`[error] tool=${errorData.tool} error=${errorData.error}`)
        } catch {
          debugMessages.value.push(`[error] ${chunk.content}`)
        }
        return
      }

      // Handle debug messages - only shown when dev mode is enabled
      if (chunk.type === 'debug') {
        if (devMode.value && chunk.content) {
          debugMessages.value.push(chunk.content)
        }
        return
      }

      // Handle tool_result - process tool execution results and update tool call status
      if (chunk.type === 'tool_result' && chunk.content) {
        // Design actions go to canvas (search_images lets AI continue to create_design_element)
        const isDesignAction = parseToolResult(chunk.content)

        const assistantMessage = messages.value[assistantMessageIndex]
        if (assistantMessage) {
          let completedToolName: string | null = null
          let completedToolHadError = false

          // Update the most recent "calling" tool to "completed"
          if (assistantMessage.toolCalls?.length) {
            const callingTool = assistantMessage.toolCalls.find(t => t.status === 'calling')
            if (callingTool) {
              callingTool.status = 'completed'
              callingTool.endTime = Date.now()
              callingTool.result = chunk.content
              completedToolName = callingTool.name

              // Check if it's an error result
              try {
                const data = JSON.parse(chunk.content)
                if (data.error) {
                  callingTool.status = 'error'
                  completedToolHadError = true
                }
              } catch {
                // Not JSON
              }
            }
          }

          if (completedToolName && !completedToolHadError && FILE_TREE_MUTATION_TOOLS.has(completedToolName)) {
            scheduleExplorerRefresh()
          }

          try {
            const data = JSON.parse(chunk.content)

            // Design actions - show brief status only
            if (isDesignAction) {
              designActionsCreated.value++
              if (data.action === 'create_screen') {
                const screenName = data.screen?.name || 'Screen'
                const elementCount = data.elements?.length || 0
                assistantMessage.content += `\n\n✓ Created **${screenName}** with ${elementCount} elements on canvas.`
                assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
              } else if (data.action === 'create_element') {
                const elemName = data.element?.name || data.element?.type || 'Element'
                assistantMessage.content += `\n\n✓ Added **${elemName}** to canvas.`
                assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
              }
            }
            // Task/Project actions - show brief status
            else if (data.task || data.tasks) {
              const taskCount = data.tasks?.length || 1
              const taskName = data.task?.title || data.tasks?.[0]?.title || 'task'
              assistantMessage.content += taskCount > 1
                ? `\n\n✓ Created **${taskCount} tasks** in kanban.`
                : `\n\n✓ Created task: **${taskName}**`
              assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
            }
            else if (data.project) {
              assistantMessage.content += `\n\n✓ Created project: **${data.project.name}**`
              assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
            }
            // Error results - show error
            else if (data.error) {
              assistantMessage.content += `\n\n⚠ Tool error: ${data.error}`
              assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
            }
            // Image search results - AI will auto-pick first result and create element
            else if (data.action === 'search_images' && data.images?.length > 0) {
              const firstImage = data.images[0] as Record<string, unknown>
              console.log('[Chat] Images found:', data.images.length, '— AI will use:', (firstImage.url as string)?.substring(0, 60))
            }
            // All other tool results (icons, etc.) are processed silently by the AI
          } catch {
            // Not JSON or parse error - ignore
          }
        }

        // Tool results are always handled internally, never shown as raw content
        return
      }

      // Append each chunk to the assistant message and re-render markdown
      const assistantMessage = messages.value[assistantMessageIndex]
      if (chunk.content && assistantMessage) {
        assistantMessage.content += chunk.content

        // Check for conductor question in the content
        const questionMatch = assistantMessage.content.match(/```json\s*(\{[\s\S]*?"type"\s*:\s*"question"[\s\S]*?\})\s*```/)
        if (questionMatch && questionMatch[1]) {
          try {
            const questionData = JSON.parse(questionMatch[1]) as ConductorQuestion
            if (questionData.type === 'question' && questionData.options) {
              assistantMessage.conductorQuestion = questionData
              // Remove the JSON block from the visible content
              assistantMessage.content = assistantMessage.content.replace(/```json\s*\{[\s\S]*?"type"\s*:\s*"question"[\s\S]*?\}\s*```/, '').trim()
            }
          } catch {
            // Not valid question JSON, continue normally
          }
        }

        // Re-render markdown on each chunk for real-time formatting
        assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
      }
    }

    // Use the selected model from settings, or fall back to auto routing
    // If user explicitly selected a model, use it. Otherwise let conductor decide.
    const chatModel = resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto', persist: true })
    const chatToken = authStore.token || undefined
    console.log('[AssistantFloat] Using model:', chatModel, 'space:', spaceContext)

    // Use specialized agents per space (system prompts come from Go agent registry)
    const routeAgentId = resolveAssistantAgentId({
      spaceContext,
      userMessage,
      hasImage,
      designReferenceCount: references.designs.length,
    })
    const agentId = forcedAgentId || routeAgentId
    activeAgentId.value = agentId

    // Stream chat response with space context and local data for smart routing
    await chatStream({
      model: chatModel,
      messages: chatMessages,
      token: chatToken,
      agent_id: agentId,
      space: spaceContext,
      local_data: { ...buildLocalData(references), ...localDataPatch }, // Include project context and route-specific assistant context
    }, handleChunk, { signal: controller.signal })
  }
  catch (error) {
    console.error('Chat error:', error)
    // Update the assistant message with error
    const errorMessage = messages.value[assistantMessageIndex]
    if (errorMessage) {
      errorMessage.content = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`
    }
  }
  finally {
    isLoading.value = false
    abortController.value = null
    // Clear any lingering status text
    const finalMsg = messages.value[assistantMessageIndex]
    if (finalMsg) finalMsg.statusText = undefined
    // Incremental save — just the completed assistant message, not the full blob
    if (finalMsg && isTauri.value) {
      saveMessageIncremental(conversationKey.value, assistantMessageIndex, finalMsg)
    }
    // Process queued messages
    processMessageQueue()
  }
}

// Process queued messages after current response completes
async function processMessageQueue() {
  if (messageQueue.value.length === 0) return
  const nextMessage = messageQueue.value.shift()!
  message.value = nextMessage
  await sendMessage()
}



// Measure latency
async function measureLatency() {
  if (connected.value) {
    try {
      latency.value = await ping()
    }
    catch {
      latency.value = null
    }
  }
}

// Measure latency periodically when open
watch(isOpen, (open) => {
  if (open && connected.value) {
    measureLatency()
  }
})

// Clear chat - fully reset conversation context
async function clearChat() {
  // Clear messages
  messages.value = []

  // Reset session state
  designActionsCreated.value = 0
  debugMessages.value = []

  // Clear any dropped image
  if (droppedImage.value) {
    clearDroppedImage()
  }

  // Delete from conversation cache
  conversationCache.delete(conversationKey.value)

  // Use dedicated delete endpoint for Tauri
  if (isTauri.value) {
    try {
      await sendRequest('ai.conversations.delete', { contextKey: conversationKey.value })
    } catch (e) {
      console.warn('[AssistantFloat] Failed to delete conversation:', e)
    }
  } else {
    // localStorage fallback - save the updated cache
    _saveConversationCache(conversationCache)
  }
}

// === Drag-drop image handling ===

function handleDragEnter(e: DragEvent) {
  if (!isUISpace.value) return
  e.preventDefault()
  dragCounter.value++
  isDragging.value = true
}

function handleDragOver(e: DragEvent) {
  if (!isUISpace.value) return
  e.preventDefault()
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter.value--
  if (dragCounter.value <= 0) {
    dragCounter.value = 0
    isDragging.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter.value = 0
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files[0]
  if (!file || !file.type.startsWith('image/')) {
    console.warn('[AssistantFloat] Dropped file is not an image')
    return
  }

  // Convert to base64 (may resize if too large)
  const { base64, mimeType } = await fileToBase64(file)
  const preview = URL.createObjectURL(file)

  droppedImage.value = { file, base64, preview, mimeType }
}

// Max image size for vision APIs (4MB base64, ~3MB raw to stay under 5MB limit)
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // If file is small enough, use as-is
    if (file.size <= MAX_IMAGE_BYTES) {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] || ''
        resolve({ base64, mimeType: file.type })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
      return
    }

    // File is too large — resize using canvas
    const img = new Image()
    img.onload = () => {
      // Scale down to fit under size limit
      const scale = Math.sqrt(MAX_IMAGE_BYTES / file.size)
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }

      ctx.drawImage(img, 0, 0, width, height)

      // Export as JPEG with quality tuning to stay under limit
      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      // If still too large, reduce quality
      while (dataUrl.length * 0.75 > MAX_IMAGE_BYTES && quality > 0.3) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }

      const base64 = dataUrl.split(',')[1] || ''
      console.log(`[Vision] Resized image: ${img.width}x${img.height} → ${width}x${height}, quality=${quality.toFixed(1)}, size=${(base64.length * 0.75 / 1024 / 1024).toFixed(1)}MB`)
      resolve({ base64, mimeType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function clearDroppedImage() {
  if (droppedImage.value?.preview) {
    URL.revokeObjectURL(droppedImage.value.preview)
  }
  droppedImage.value = null
}

// Analyze dropped image and convert to UI elements
// Sends image + detail level to context service, which loads the right prompt and streams JSON back
async function analyzeScreenshot() {
  if (!droppedImage.value || isLoading.value) return

  // Check if Tauri is available
  if (!isTauri.value) {
    messages.value.push({
      role: 'user',
      content: `[Screenshot uploaded] Convert this UI design to canvas elements`,
    })
    messages.value.push({
      role: 'assistant',
      content: '⚠️ Vision analysis requires the desktop app (Tauri). Running in browser mode - vision API is not available.\n\nPlease run the app with `pnpm tauri dev` to enable screenshot-to-UI conversion.',
      renderedHtml: renderMarkdown('⚠️ Vision analysis requires the desktop app (Tauri). Running in browser mode - vision API is not available.\n\nPlease run the app with `pnpm tauri dev` to enable screenshot-to-UI conversion.'),
    })
    clearDroppedImage()
    return
  }

  isLoading.value = true
  designActionsCreated.value = 0

  // Capture user's typed message (additional instructions alongside screenshot)
  const userInstruction = message.value.trim()
  message.value = ''

  // Vision prompt — uses same tool-driven workflow as regular chat
  const visionInstruction = `Recreate this screenshot as a full UI design. Follow the workflow using tools:

1. get_canvas_state → check existing screens, get suggested position
2. create_plan → plan: screen type, dimensions (~375x812 mobile, ~1440x900 desktop), total elements, list every icon name, every image search query, color palette from the screenshot
3. get_lucide_icon for each icon in plan → save path_data
4. search_images for each image in plan → save URLs
5. create_ui_screen with ALL structural elements (use suggested_x from step 1)
6. create_design_element for each icon (type=path, parent_id=screen) and each image (type=image, parent_id=screen)

Rules:
- Match colors exactly (hex). Match ALL text content exactly.
- Child x,y are RELATIVE to screen (0,0 = top-left)
- Background images: x=0, y=0, width=SCREEN_WIDTH, height=SCREEN_HEIGHT
- Gradients: fill as object {type:'linear', angle:NUMBER, stops:[{offset:0, color:'#hex'}, {offset:1, color:'#hex'}]}
- NEVER use emoji. NEVER stop after step 5 — complete step 6.${userInstruction ? `\n\nUser instructions: ${userInstruction}` : ''}`

  const imageDataUrl = `data:${droppedImage.value.mimeType};base64,${droppedImage.value.base64}`

  // Add user message with image context
  const userContent = userInstruction
    ? `[Screenshot uploaded] ${userInstruction}`
    : '[Screenshot uploaded] Convert to UI'
  messages.value.push({
    role: 'user',
    content: userContent,
    imageUrl: imageDataUrl,
  })

  // Add assistant placeholder
  const assistantMessageIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '🔍 Analyzing screenshot...' })

  // Create abort controller for vision request
  const controller = new AbortController()
  abortController.value = controller

  try {
    let visionScreensCreated = 0
    let visionToolCount = 0
    const chatModel = getVisionModel()
    const chatToken = authStore.token || undefined
    console.log('[Vision] Using tool-based chat with', chatModel)

    // Build system prompt with full context (same as regular chat)
    const systemPrompt = buildSystemPrompt()

    // Build conversation history + new vision message
    // compactForLLM prunes old tool results to save context window budget
    const compactedVisionMsgs = compactForLLM(messages.value.slice(0, -2))
    const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> }> = [
      { role: 'system', content: systemPrompt },
      // Include prior conversation for context (skip the last 2: user screenshot msg + assistant placeholder)
      ...compactedVisionMsgs.map(m => ({
        role: m.role,
        content: m.role === 'assistant' && m.toolCalls?.length
          ? buildMessageWithToolContext(m, projectDocs, projectStore)
          : m.content
      })),
      // Vision message with image + instructions
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: imageDataUrl },
          },
          {
            type: 'text' as const,
            text: visionInstruction,
          },
        ],
      },
    ]

    // Stream through existing tool-based chat (handles create_ui_screen tool calls)
    // Use same chunk handling as sendMessage() for proper tool_call/tool_result processing
    await chatStream({
      model: chatModel,
      messages: chatMessages,
      token: chatToken,
      agent_id: 'design',
      space: 'ui',
      local_data: buildLocalData(),
      max_iterations: 5, // Vision: create screen + enhance with icons/images
    }, (chunk: { content: string; done: boolean; error?: string; type?: string; route?: ModelRoute }) => {
      const assistantMessage = messages.value[assistantMessageIndex]
      if (!assistantMessage) return

      // Capture routing info
      if (chunk.route) {
        currentRoute.value = chunk.route
        console.log('[Vision] Routed to:', chunk.route.model)
      }

      // Handle tool_call events
      if (chunk.type === 'tool_call' && chunk.content) {
        try {
          const toolData = JSON.parse(chunk.content) as { name: string; arguments: string; id: string }
          if (!assistantMessage.toolCalls) assistantMessage.toolCalls = []
          let args: Record<string, unknown> = {}
          if (typeof toolData.arguments === 'string') {
            try { args = JSON.parse(toolData.arguments) } catch { args = {} }
          } else if (typeof toolData.arguments === 'object' && toolData.arguments) {
            args = toolData.arguments as Record<string, unknown>
          }

          assistantMessage.toolCalls.push({
            id: toolData.id, name: toolData.name, arguments: args,
            status: 'calling', expanded: false, startTime: Date.now(),
          })
          visionToolCount++

          // Debug log with full details
          console.log(`[Vision] Tool #${visionToolCount}: ${toolData.name}`, args)

          // Build descriptive status based on tool + args
          let status = ''
          switch (toolData.name) {
            case 'create_ui_screen':
              status = `Creating screen: **${args.screen_name || 'Screen'}** (${args.width || 1440}x${args.height || 900})`
              break
            case 'create_design_element':
              status = `Adding ${args.type || 'element'}: **${args.name || ''}**`
              break
            case 'get_lucide_icon':
              status = `Fetching icon: **${args.name || args.search || 'icon'}**`
              break
            case 'search_icons':
              status = `Searching icons: **${args.query || ''}**`
              break
            case 'search_images':
              status = `Searching images: **${args.query || ''}**`
              break
            default:
              status = `Running: ${toolData.name}`
          }

          // Update message with step count + current action
          const stepLine = `Step ${visionToolCount} — ${status}`
          if (visionScreensCreated > 0) {
            // After screen created, show additions below the screen info
            const lines = assistantMessage.content.split('\n')
            const screenLine = lines.find(l => l.includes('✓'))
            assistantMessage.content = `${screenLine || ''}\n\n${stepLine}`
          } else {
            assistantMessage.content = stepLine
          }
          assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
        } catch (e) {
          console.warn('[Vision] Failed to parse tool_call:', e)
        }
        return
      }

      // Skip tool_status and debug messages
      if (chunk.type === 'tool_status' || chunk.type === 'debug') return

      // Handle tool_result
      if (chunk.type === 'tool_result' && chunk.content) {
        const isDesignAction = parseToolResult(chunk.content)

        // Update tool call status
        if (assistantMessage.toolCalls?.length) {
          const callingTool = assistantMessage.toolCalls.find(t => t.status === 'calling')
          if (callingTool) {
            callingTool.status = 'completed'
            callingTool.endTime = Date.now()
            callingTool.result = chunk.content
          }
        }

        if (isDesignAction) {
          try {
            const data = JSON.parse(chunk.content)
            designActionsCreated.value++
            if (data.action === 'create_screen') {
              visionScreensCreated++
              const screenName = data.screen?.name || 'Screen'
              const elementCount = data.elements?.length || 0
              console.log(`[Vision] Screen created: ${screenName} with ${elementCount} elements`)
              assistantMessage.content = `✓ **${screenName}** with ${elementCount} elements\n\nEnhancing with icons and images...`
              assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
            } else if (data.action === 'create_element') {
              const elemName = data.element?.name || 'Element'
              console.log(`[Vision] Element added: ${elemName}`)
            }
          } catch { /* ignore */ }
        } else {
          // Non-design tool results (icons, images) — log them
          try {
            const data = JSON.parse(chunk.content)
            if (data.svg || data.pathData) {
              console.log('[Vision] Icon fetched:', data.name || 'unknown')
            } else if (data.images) {
              console.log('[Vision] Images found:', data.images?.length || 0)
            } else {
              console.log('[Vision] Tool result:', chunk.content.substring(0, 100))
            }
          } catch {
            console.log('[Vision] Tool result (raw):', chunk.content.substring(0, 100))
          }
        }
        return
      }

      // Regular content chunks (text from the model)
      if (chunk.content && !chunk.type) {
        console.log('[Vision] Content:', chunk.content.substring(0, 80))
        if (assistantMessage.content.startsWith('Step') || assistantMessage.content.startsWith('🔍')) {
          assistantMessage.content = chunk.content
        } else {
          assistantMessage.content += chunk.content
        }
        assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
      }

      if (chunk.done) {
        console.log(`[Vision] Done. Screens: ${visionScreensCreated}, Tools: ${visionToolCount}, Actions: ${designActionsCreated.value}`)
        if (designActionsCreated.value > 0) {
          assistantMessage.content += `\n\n🎉 Done! Created ${designActionsCreated.value} design actions.`
          assistantMessage.renderedHtml = renderMarkdown(assistantMessage.content)
        }
      }
    }, { signal: controller.signal })

    // Clear the dropped image after processing
    clearDroppedImage()
  } catch (error) {
    console.error('[AssistantFloat] Vision analysis error:', error)
    const errorMessage = messages.value[assistantMessageIndex]
    if (errorMessage) {
      errorMessage.content = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      errorMessage.renderedHtml = renderMarkdown(errorMessage.content)
    }
  } finally {
    isLoading.value = false
    abortController.value = null
    // Process queued messages
    processMessageQueue()
  }
}


</script>

<template>
  <!-- Chat Popover - Double Shift to toggle -->
  <Teleport :to="dockTargetEl || 'body'" :disabled="!isDocked || props.popoutMode">
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    :enter-from-class="isDocked ? 'opacity-0' : 'opacity-0 scale-95'"
    :enter-to-class="isDocked ? 'opacity-100' : 'opacity-100 scale-100'"
    leave-active-class="transition-all duration-200 ease-in"
    :leave-from-class="isDocked ? 'opacity-100' : 'opacity-100 scale-100'"
    :leave-to-class="isDocked ? 'opacity-0' : 'opacity-0 scale-95'">
    <div
      v-if="isOpen || props.popoutMode"
      ref="panelRef"
      :class="[
        props.popoutMode ? 'w-full h-full flex flex-col bg-app' : panelPositionClasses,
        !props.popoutMode && isDocked ? 'bg-app flex flex-col' : !props.popoutMode ? 'z-50 bg-app rounded-2xl shadow-2xl border flex flex-col' : '',
        isDraggingPanel || isResizing ? 'select-none' : 'transition-colors',
        !props.popoutMode && !isDocked && isDragging ? 'border-2 border-dashed border-(--app-accent)' : !props.popoutMode && !isDocked ? 'border-gray-200/50 dark:border-gray-800/50' : ''
      ]"
      :style="props.popoutMode ? {} : panelStyle"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop">
      <!-- Header (drag handle in float mode) -->
      <div
        :class="[
          'flex items-center justify-between px-4 border-b border-gray-200/50 dark:border-gray-800/50 shrink-0',
          props.popoutMode ? 'py-2.5' : 'py-3 cursor-grab active:cursor-grabbing'
        ]"
        @mousedown="!props.popoutMode && startPanelDrag($event)"
      >
        <div class="flex items-center gap-2">
          <svg :class="['size-5 transition-colors', contextInfo.color]" viewBox="0 0 533 750" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M424.999 672C446.538 672 463.999 689.461 463.999 711C463.999 732.539 446.538 750 424.999 750H110C88.4609 750 70.999 732.539 70.999 711C70.999 689.461 88.4609 672 110 672H424.999ZM39 0C60.5389 0.000263886 78 17.4611 78 39V184.97C126.23 136.682 192.894 106.811 266.534 106.811C413.699 106.811 533 226.112 533 373.276C533 520.441 413.699 639.742 266.534 639.742C119.369 639.742 0.0674128 520.441 0.0673828 373.276C0.0673828 368.709 0.182077 364.168 0.40918 359.657C0.140766 357.81 0 355.921 0 354V39C5.50921e-06 17.4609 17.4609 0 39 0ZM266.533 184.8C162.441 184.8 78.0576 269.184 78.0576 373.276C78.0577 477.369 162.441 561.752 266.533 561.752C370.625 561.752 455.01 477.369 455.01 373.276C455.01 269.184 370.625 184.8 266.533 184.8Z"/></svg>
          <span class="font-semibold text-app">BRAIN</span>
          <!-- Connection status -->
          <span
:class="[
            'size-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-gray-400'
          ]" :title="connected ? `Connected (${latency?.toFixed(1)}ms)` : 'Disconnected'" />
          <!-- Project | Space | Agent context -->
          <span v-if="activeProjectName || activeAgent" class="text-xs text-app-muted">
            <template v-if="activeProjectName">{{ activeProjectName }}</template>
            <template v-if="activeProjectName && currentSpace"> | {{ currentSpace }}</template>
            <template v-if="!activeProjectName && currentSpace">{{ currentSpace }}</template>
            <template v-if="activeAgent"> · {{ activeAgent.name }}</template>
          </span>
        </div>
        <div class="flex items-center gap-1" @mousedown.stop>
          <!-- Current model indicator with provider & auth type -->
          <div v-if="currentModel" class="flex items-center gap-1.5 mr-1">
            <span class="text-xs px-2 py-1 rounded-md bg-white/30 dark:bg-white/10 text-app font-medium">
              {{ currentModel.providerLabel }}
            </span>
            <span
              class="text-[10px] px-1.5 py-0.5 rounded font-medium"
              :class="[
                currentModel.authType === 'oauth'
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : currentModel.authType === 'local'
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                    : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
              ]"
            >
              {{ currentModel.authType === 'oauth' ? 'OAuth' : currentModel.authType === 'local' ? 'Local' : 'API' }}
            </span>
            <span class="text-xs text-app-muted">{{ currentModel.label }}</span>
          </div>
          <button
            class="p-1 hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors" title="Clear chat"
            @click="clearChat">
            <Icon name="i-lucide-trash-2" class="size-4 text-app-muted" />
          </button>
          <!-- Dock menu (three dots) — hidden in popout mode -->
          <div v-if="!props.popoutMode" class="relative">
            <button
              class="p-1 rounded-md transition-colors"
              :class="showDockMenu ? 'bg-white/20 dark:bg-white/10 text-app-accent' : 'hover:bg-white/30 dark:hover:bg-white/10 text-app-muted'"
              title="Dock options"
              @click="showDockMenu = !showDockMenu"
            >
              <Icon name="i-lucide-ellipsis-vertical" class="size-4" />
            </button>
            <Transition
              enter-active-class="transition-all duration-150 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-100 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
            >
              <div
                v-if="showDockMenu"
                class="absolute right-0 top-full mt-1 w-40 py-1 bg-app border border-gray-200/50 dark:border-gray-700/50 rounded-lg shadow-xl z-50"
                @mouseleave="showDockMenu = false"
              >
                <button
                  class="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                  :class="panelPosition === 'left' ? 'text-app-accent bg-white/10' : 'text-app-muted hover:text-app hover:bg-white/10'"
                  @click="setPanelPosition(panelPosition === 'left' ? 'bottom-center' : 'left'); showDockMenu = false"
                >
                  <Icon name="i-lucide-panel-left" class="size-3.5" />
                  Dock left
                </button>
                <button
                  class="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                  :class="panelPosition === 'bottom' ? 'text-app-accent bg-white/10' : 'text-app-muted hover:text-app hover:bg-white/10'"
                  @click="setPanelPosition(panelPosition === 'bottom' ? 'bottom-center' : 'bottom'); showDockMenu = false"
                >
                  <Icon name="i-lucide-panel-bottom" class="size-3.5" />
                  Dock bottom
                </button>
                <button
                  class="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                  :class="panelPosition === 'right' ? 'text-app-accent bg-white/10' : 'text-app-muted hover:text-app hover:bg-white/10'"
                  @click="setPanelPosition(panelPosition === 'right' ? 'bottom-center' : 'right'); showDockMenu = false"
                >
                  <Icon name="i-lucide-panel-right" class="size-3.5" />
                  Dock right
                </button>
                <div class="border-t border-gray-200/30 dark:border-gray-700/30 my-1" />
                <button
                  class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-app-muted hover:text-app hover:bg-white/10 transition-colors"
                  @click="popOutAssistant(); showDockMenu = false"
                >
                  <Icon name="i-lucide-external-link" class="size-3.5" />
                  Open in window
                </button>
              </div>
            </Transition>
          </div>
          <button
            v-if="!props.popoutMode"
            class="p-1 hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors"
            @click="isOpen = false">
            <Icon name="i-lucide-x" class="size-4 text-app-muted" />
          </button>
        </div>
      </div>

      <!-- Drag overlay for image upload -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0">
        <div
          v-if="isDragging && isUISpace"
          class="absolute inset-0 bg-(--app-accent)/20 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-(--app-accent)">
          <div class="text-center">
            <Icon name="i-lucide-image-plus" class="size-16 text-(--app-accent) mb-2" />
            <p class="text-lg font-medium text-(--app-accent)">Drop screenshot to convert to UI</p>
          </div>
        </div>
      </Transition>

      <!-- Component context banner -->
      <div
        v-if="componentLabel"
        class="px-4 py-2 bg-(--app-accent)/5 border-b border-gray-200/50 dark:border-gray-800/50">
        <div class="flex items-center gap-2 text-xs text-app-muted">
          <Icon name="i-lucide-component" class="size-3" />
          <span>Working on: <strong class="text-app">{{ componentLabel }}</strong></span>
        </div>
      </div>

      <!-- Space-specific assistant surface -->
      <AssistantCodeSpace
        v-if="assistantSpaceUiComponent === AssistantCodeSpace"
        :framework="detectedFramework"
      />
      <AssistantUISpace
        v-else-if="assistantSpaceUiComponent === AssistantUISpace"
        :can-drop-image="isUISpace"
      />
      <component
        :is="assistantSpaceUiComponent"
        v-else
      />

      <!-- Dropped image preview -->
      <div
        v-if="droppedImage"
        class="px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/30 dark:bg-white/5">
        <div class="flex items-start gap-3">
          <img
            :src="droppedImage.preview"
            :alt="droppedImage.file.name"
            class="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-app truncate">{{ droppedImage.file.name }}</p>
            <p class="text-xs text-app-muted mt-1">
              {{ (droppedImage.file.size / 1024).toFixed(1) }}KB •
              <template v-if="isUISpace">Ready to convert</template>
              <template v-else>Will be sent with your message</template>
            </p>
            <!-- Convert + actions (UI space) -->
            <template v-if="isUISpace">
              <div class="flex items-center gap-2 mt-2.5">
                <button
                  class="px-3 py-1.5 text-xs font-medium bg-(--app-accent) text-app-accent-foreground rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                  :disabled="isLoading"
                  @click="analyzeScreenshot">
                  <Icon name="i-lucide-sparkles" class="size-3 mr-1 inline" />
                  Convert to UI
                </button>
                <button
                  class="px-3 py-1.5 text-xs text-app-muted hover:text-app transition-colors"
                  :disabled="isLoading"
                  @click="clearDroppedImage">
                  Remove
                </button>
              </div>
            </template>
            <!-- Non-UI space: just show attached -->
            <div v-else class="flex gap-2 mt-2">
              <span class="px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                <Icon name="i-lucide-check" class="size-3" />
                Image attached
              </span>
              <button
                class="px-3 py-1.5 text-xs text-app-muted hover:text-app transition-colors"
                :disabled="isLoading"
                @click="clearDroppedImage">
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div :class="[isDocked || panelSize.height ? 'flex-1' : 'h-80', 'overflow-y-auto p-4 space-y-4']">
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-center">
          <Icon name="i-lucide-message-square" class="size-12 text-app-muted/30 mb-3" />
          <p class="text-sm text-app-muted">{{ contextInfo.hint }}</p>
          <p v-if="!connected" class="text-xs text-app-muted/70 mt-2">
            Context service not connected
          </p>
        </div>

        <div
v-for="(msg, index) in messages" :key="index" :class="[
          'max-w-[85%] p-3 rounded-2xl text-sm',
          msg.role === 'user'
            ? 'ml-auto bg-(--app-accent) text-app-accent-foreground rounded-br-md'
            : 'bg-white/50 dark:bg-white/10 text-app rounded-bl-md'
        ]">
          <!-- Thinking/Reasoning block (collapsible) -->
          <details v-if="msg.thinking" class="text-xs text-app-muted mb-2 pb-2 border-b border-gray-200/50 dark:border-gray-700/50 group">
            <summary class="cursor-pointer font-medium select-none hover:text-app-accent transition-colors">
              Reasoning
              <span class="font-normal opacity-70 ml-1">{{ msg.thinking.length > 150 ? msg.thinking.slice(0, 150) + '...' : msg.thinking }}</span>
            </summary>
            <div class="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed max-h-48 overflow-y-auto">{{ msg.thinking }}</div>
          </details>

          <!-- Live progress status -->
          <div v-if="msg.statusText && (!msg.content || msg.toolCalls?.some(t => t.status === 'calling'))" class="flex items-center gap-2 mb-2 px-1 text-xs text-blue-500">
            <span class="size-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>{{ msg.statusText }}</span>
          </div>

          <!-- Tool calls display (Claude-like collapsible sections) -->
          <div v-if="msg.toolCalls?.length" class="space-y-1.5 mb-3">
            <div
              v-for="tool in msg.toolCalls"
              :key="tool.id"
              class="rounded-lg border overflow-hidden"
              :class="[
                tool.status === 'calling' ? 'border-blue-500/30 bg-blue-500/5' :
                tool.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                'border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-white/5'
              ]">
              <!-- Tool call header (clickable to expand) -->
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/20 dark:hover:bg-white/5 transition-colors"
                @click="tool.expanded = !tool.expanded">
                <!-- Status indicator -->
                <span v-if="tool.status === 'calling'" class="flex items-center gap-1.5 text-blue-500">
                  <span class="size-2 rounded-full bg-blue-500 animate-pulse" />
                  <span class="font-medium">Calling</span>
                </span>
                <span v-else-if="tool.status === 'error'" class="flex items-center gap-1.5 text-red-500">
                  <Icon name="i-lucide-x-circle" class="size-3.5" />
                  <span class="font-medium">Error</span>
                </span>
                <span v-else class="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <Icon name="i-lucide-check-circle" class="size-3.5" />
                  <span class="font-medium">Done</span>
                </span>

                <!-- Tool name with icon -->
                <span class="text-app font-medium">{{ formatToolName(tool.name) }}</span>

                <!-- Duration (for completed tools) -->
                <span v-if="tool.durationMs != null" class="text-app-muted ml-auto">
                  {{ tool.durationMs >= 1000 ? (tool.durationMs / 1000).toFixed(1) + 's' : tool.durationMs + 'ms' }}
                </span>
                <span v-else-if="tool.endTime && tool.startTime" class="text-app-muted ml-auto">
                  {{ ((tool.endTime - tool.startTime) / 1000).toFixed(1) }}s
                </span>

                <!-- Expand/collapse icon -->
                <Icon
                  :name="tool.expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-3.5 text-app-muted ml-1" />
              </button>

              <!-- Expanded details -->
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 max-h-0"
                enter-to-class="opacity-100 max-h-96"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 max-h-96"
                leave-to-class="opacity-0 max-h-0">
                <div v-if="tool.expanded" class="border-t border-gray-200/50 dark:border-gray-700/50">
                  <!-- Arguments -->
                  <div class="px-3 py-2 text-[11px]">
                    <div class="text-app-muted mb-1 font-medium">Arguments:</div>
                    <pre class="text-app whitespace-pre-wrap break-all font-mono bg-black/5 dark:bg-black/20 rounded p-2 max-h-32 overflow-auto">{{ JSON.stringify(tool.arguments, null, 2) }}</pre>
                  </div>
                  <!-- Result (if completed) -->
                  <div v-if="tool.result" class="px-3 py-2 text-[11px] border-t border-gray-200/50 dark:border-gray-700/50">
                    <div class="text-app-muted mb-1 font-medium">Result:</div>
                    <pre class="text-app whitespace-pre-wrap break-all font-mono bg-black/5 dark:bg-black/20 rounded p-2 max-h-32 overflow-auto">{{ formatToolResult(tool.result) }}</pre>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- User messages as plain text with optional image, assistant messages as markdown -->
          <template v-if="msg.role === 'user'">
            <img
              v-if="msg.imageUrl"
              :src="msg.imageUrl"
              alt="Attached image"
              class="max-w-48 max-h-48 rounded-lg mb-2 object-cover cursor-pointer hover:opacity-80"
              @click="emit('preview-image', msg.imageUrl)"
            >
            {{ msg.content }}
          </template>
          <template v-else>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-if="msg.content" class="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-code:text-app-accent prose-a:text-app-accent" v-html="msg.renderedHtml || renderMarkdown(msg.content)" />

            <!-- Search Images - Clickable Thumbnails -->
            <div v-if="msg.searchImages?.length" class="mt-3 pt-3 border-t border-gray-200/30 dark:border-gray-700/30">
              <p class="text-xs text-app-muted mb-2">Click an image to add to canvas:</p>
              <div class="flex gap-2 overflow-x-auto pb-2">
                <button
                  v-for="(img, imgIdx) in msg.searchImages"
                  :key="imgIdx"
                  class="flex-shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-(--app-accent) transition-all group relative"
                  :title="`${img.description}\nCredit: ${img.credit}`"
                  @click="placeSearchImage(index, img)">
                  <img
                    :src="img.thumb"
                    :alt="img.description"
                    class="w-24 h-18 object-cover"
                    loading="lazy">
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <span class="text-white text-xs opacity-0 group-hover:opacity-100 font-medium">+ Add</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Conductor Question UI -->
            <div v-if="msg.conductorQuestion" class="mt-3 pt-3 border-t border-gray-200/30 dark:border-gray-700/30">
              <p class="text-sm font-medium mb-2">{{ msg.conductorQuestion.question }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in msg.conductorQuestion.options"
                  :key="opt.value"
                  class="px-3 py-1.5 text-xs rounded-lg border transition-all"
                  :class="[
                    msg.selectedOptions?.includes(opt.value)
                      ? 'bg-(--app-accent) text-app-accent-foreground border-transparent'
                      : 'bg-white/50 dark:bg-white/10 text-app border-gray-200 dark:border-gray-700 hover:border-(--app-accent)'
                  ]"
                  :title="opt.description"
                  @click="selectConductorOption(index, opt, msg.conductorQuestion?.allowMultiple || false)">
                  {{ opt.label }}
                </button>
              </div>
              <!-- Multiple choice submit button -->
              <div v-if="msg.conductorQuestion.allowMultiple && msg.selectedOptions?.length" class="mt-2">
                <button
                  class="px-3 py-1.5 text-xs font-medium bg-(--app-accent) text-app-accent-foreground rounded-lg"
                  @click="submitConductorSelection(index)">
                  Continue with {{ msg.selectedOptions.length }} selected
                </button>
              </div>
              <!-- Other option -->
              <div v-if="msg.conductorQuestion.allowOther" class="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Other..."
                  class="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent"
                  @keydown.enter="submitConductorOther(index, ($event.target as HTMLInputElement).value)">
                <button
                  class="px-2 py-1 text-xs text-app-muted hover:text-app"
                  @click="submitConductorOther(index, '')">
                  Skip
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Loading indicator with Stop button -->
        <div v-if="isLoading" class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-app-muted">
            <div class="flex gap-1">
              <span class="size-2 rounded-full animate-bounce bg-app-muted" style="animation-delay: 0ms" />
              <span class="size-2 rounded-full animate-bounce bg-app-muted" style="animation-delay: 150ms" />
              <span class="size-2 rounded-full animate-bounce bg-app-muted" style="animation-delay: 300ms" />
            </div>
            <span class="text-xs opacity-50">
              {{ messages[messages.length - 1]?.statusText || 'Processing...' }}
            </span>
          </div>
          <button
            class="px-3 py-1 text-xs font-medium bg-red-500/20 text-red-500 hover:bg-red-500/30 rounded-lg transition-colors flex items-center gap-1"
            @click="stopGeneration">
            <Icon name="i-lucide-square" class="size-3" />
            Stop
          </button>
        </div>

        <!-- Dev Mode: Debug Messages Panel -->
        <div v-if="devMode && debugMessages.length > 0" class="mt-3 p-2 rounded-lg bg-gray-900 border border-gray-700/50">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="i-lucide-bug" class="size-3 text-green-400" />
            <span class="text-[11px] font-medium text-green-400 uppercase tracking-wider">Debug</span>
            <span class="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{{ debugMessages.length }}</span>
            <button
              class="ml-auto text-[10px] text-gray-500 hover:text-gray-300"
              @click="debugMessages = []"
            >
              Clear
            </button>
          </div>
          <div ref="debugPanelRef" class="space-y-0.5 max-h-64 overflow-y-auto font-mono text-[11px]">
            <div
              v-for="(debugMsg, idx) in debugMessages"
              :key="idx"
              class="whitespace-pre-wrap px-1 py-0.5 rounded"
              :class="[
                debugMsg.startsWith('[error]') ? 'text-red-400 bg-red-500/10' :
                debugMsg.startsWith('[warn]') ? 'text-yellow-400 bg-yellow-500/10' :
                debugMsg.includes('tool=') || debugMsg.includes('Calling') ? 'text-blue-400' :
                'text-gray-400'
              ]"
            >
              {{ debugMsg }}
            </div>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="p-3 border-t border-gray-200/50 dark:border-gray-800/50 relative shrink-0">
        <!-- Autocomplete dropdown -->
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2">
          <div
            v-if="showAutocomplete && autocompleteSuggestions.length > 0"
            class="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-10">
            <div class="px-3 py-1.5 text-[10px] font-medium text-app-muted uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
              {{ autocompleteType === 'design' ? 'Designs' : autocompleteType === 'doc' ? 'Documents' : autocompleteType === 'task' ? 'Tasks' : autocompleteType === 'component' ? 'Components' : autocompleteType === 'codeFile' ? 'Project Files' : autocompleteType === 'command' ? 'Commands' : 'Files' }}
            </div>
            <div class="max-h-48 overflow-y-auto">
              <button
                v-for="(suggestion, idx) in autocompleteSuggestions"
                :key="suggestion.label"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                :class="[
                  idx === autocompleteIndex ? 'bg-(--app-accent)/10 text-app' : 'text-app-muted hover:bg-gray-50 dark:hover:bg-gray-800',
                  ('disabled' in suggestion && suggestion.disabled) ? 'opacity-50 cursor-not-allowed' : ''
                ]"
                :disabled="('disabled' in suggestion && suggestion.disabled) || false"
                @click="!('disabled' in suggestion && suggestion.disabled) && selectAutocomplete(suggestion)"
                @mouseenter="autocompleteIndex = idx">
                <Icon
                  :name="suggestion.icon"
                  class="size-4 shrink-0"
                  :class="('priority' in suggestion && suggestion.priority) ? taskPriorityColors[suggestion.priority as string] : ''" />
                <span class="truncate font-medium">{{ suggestion.label }}</span>
                <span v-if="'sublabel' in suggestion && suggestion.sublabel" class="truncate text-app-muted text-xs flex-1">
                  {{ suggestion.sublabel }}
                </span>
                <span v-if="idx === autocompleteIndex && !('disabled' in suggestion && suggestion.disabled)" class="ml-auto text-[10px] text-app-muted shrink-0">
                  ↵ select
                </span>
              </button>
            </div>
            <div class="px-3 py-1.5 text-[10px] text-app-muted border-t border-gray-100 dark:border-gray-800 flex gap-3">
              <span><kbd class="px-1 rounded bg-gray-100 dark:bg-gray-800">↑↓</kbd> navigate</span>
              <span><kbd class="px-1 rounded bg-gray-100 dark:bg-gray-800">Tab</kbd> select</span>
              <span><kbd class="px-1 rounded bg-gray-100 dark:bg-gray-800">Esc</kbd> close</span>
            </div>
          </div>
        </Transition>

        <div class="flex items-center gap-2">
          <input
            ref="inputRef"
            v-model="message"
            type="text"
            :placeholder="isLoading ? 'Type to queue a follow-up... (Esc to stop)' : 'Ask anything... (@ designs, ^ docs, # tasks, /agents)'"
            class="flex-1 px-4 py-2 text-sm bg-white/30 dark:bg-white/10 rounded-full border-0 focus:ring-2 focus:ring-(--app-accent) outline-none text-app placeholder-app-muted"
            @input="handleInput"
            @keydown="handleKeydown">
          <!-- Stop button when loading (and no text typed) -->
          <button
            v-if="isLoading && !message.trim()"
            class="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            title="Stop generation (Esc)"
            @click="stopGeneration">
            <Icon name="i-lucide-square" class="size-4" />
          </button>
          <!-- Send/Queue button -->
          <button
            v-else
            class="p-2 rounded-full hover:opacity-90 transition-colors disabled:opacity-50"
            :class="isLoading ? 'bg-amber-500 text-white' : 'bg-(--app-accent) text-app-accent-foreground'"
            :disabled="!message.trim()"
            :title="isLoading ? 'Queue message (will send after current response)' : 'Send message'"
            @click="sendMessage">
            <Icon :name="isLoading ? 'i-lucide-list-plus' : 'i-lucide-arrow-up'" class="size-4" />
          </button>
        </div>
        <!-- Queue indicator -->
        <div v-if="messageQueue.length > 0" class="px-3 pb-1 text-[10px] text-amber-400">
          {{ messageQueue.length }} message{{ messageQueue.length > 1 ? 's' : '' }} queued
        </div>
      </div>

      <!-- Resize handles -->
      <div
        v-if="!isDocked && !props.popoutMode"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
        @mousedown="startResize($event, 'corner')"
      >
        <svg class="w-3 h-3 text-app-muted/40 absolute bottom-1 right-1" viewBox="0 0 6 6"><circle cx="5" cy="1" r="0.8" fill="currentColor" /><circle cx="1" cy="5" r="0.8" fill="currentColor" /><circle cx="5" cy="5" r="0.8" fill="currentColor" /><circle cx="3" cy="5" r="0.8" fill="currentColor" /><circle cx="5" cy="3" r="0.8" fill="currentColor" /></svg>
      </div>
      <div
        v-if="!isDocked && !props.popoutMode"
        class="absolute bottom-0 left-4 right-4 h-1.5 cursor-s-resize"
        @mousedown="startResize($event, 'bottom')"
      />
      <div
        v-if="!isDocked && !props.popoutMode"
        class="absolute top-4 bottom-4 right-0 w-1.5 cursor-e-resize"
        @mousedown="startResize($event, 'right')"
      />
    </div>
  </Transition>
  </Teleport>
</template>
