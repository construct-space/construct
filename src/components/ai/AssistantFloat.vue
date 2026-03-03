<script setup lang="ts">
/**
 * AI Assistant Floating Component
 *
 * Context-aware AI assistant that connects to the local context service.
 * Automatically adapts behavior based on current mode (code/design/chat).
 */

import { useContextService, type Agent as AgentInfo, type ModelRoute } from '~/composables/useContextService'
import { useAIModel } from '~/composables/useAIModel'
import { useAuthStore } from '~/stores/auth'
import { useProjectStore } from '~/stores/project'
import {
  getLatestSpaceContext,
  requestSpaceData,
  subscribeSpaceContext,
} from '~/lib/spaceContextBus'

// DocumentListItem type — inline to avoid importing the domain store
interface DocumentListItem {
  id: number
  created_at: string
  updated_at: string
  title: string
  type: string
  project_id?: number
  company_id?: number
}
import { useMarkdown } from '~/composables/useMarkdown'
import { parseToolResult } from '~/composables/useDesignActions'
import { listAvailableDesigns, getDesignForCodeGeneration, registerDesign, useCanvasContext } from '~/composables/useCanvasContext'
import type { DesignNode } from '~/types/design'

// Stub types for space composables provided at runtime by IIFE bundles
interface FileTreeEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeEntry[]
}
interface GitChange { path: string; status?: string }
interface GitCommit { shortHash?: string; subject?: string; author?: string; message?: string }
interface GitRepoInfo { name?: string; status?: string; remoteUrl?: string; hasUpstream?: boolean; ahead?: number; behind?: number }
interface TaskCacheItem { id: number | string; title: string; status: string; priority?: number | string }
interface DocCacheItem { content: string; title: string; type: string; id: number | string }

// Space composables are provided at runtime by IIFE bundles.
// These defaults are used when a space is not installed.
const useCodeEditor = (() => ({
  state: { rootPath: '', currentFile: '', fileContent: '', currentLanguage: '', fileTree: [] as FileTreeEntry[] },
  selection: ref<string | null>(null),
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
// UIDesign type — use inline definition to avoid hard import from space
interface UIDesign {
  id: string
  name: string
  [key: string]: unknown
}

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

// Build local_data with project and design context for code tools
function buildLocalData(): Record<string, unknown> {
  const localData: Record<string, unknown> = {}

  // Include current project context
  const project = projectStore.currentProject
  if (project) {
    localData.project_id = project.id
    localData.project_name = project.name

    // Include project members so backend tools can resolve names
    if (projectMembers.value.length > 0) {
      localData.project_members = projectMembers.value
    }
  }

  // Include current code folder path if available
  if (codeEditorState.rootPath) {
    localData.current_folder = codeEditorState.rootPath
    const folderName = codeEditorState.rootPath.split('/').pop()
    localData.current_folder_name = folderName
  }

  // Include current file context from code editor
  if (codeEditorState.currentFile) {
    localData.current_file = {
      path: codeEditorState.currentFile,
      language: codeEditorState.currentLanguage,
      // Send first 300 lines for context (avoid huge payloads)
      content: codeEditorState.fileContent?.split('\n').slice(0, 300).join('\n') || '',
    }
  }

  // Include editor selection if any
  if (codeEditorSelection.value) {
    localData.selection = codeEditorSelection.value
  }

  // Include compact canvas summary (NOT full node data — that bloats the LLM context)
  // The AI can call get_canvas_state tool for full details when needed
  if (currentNodes.value.length > 0) {
    localData.current_design = currentDesignName.value
    localData.canvas_summary = {
      total_elements: currentNodes.value.length,
      screens: currentNodes.value
        .filter((n: { type: string; parentId?: string | null }) => n.type === 'screen' && !n.parentId)
        .map((n: { id: string; name: string; x: number; y: number; width: number; height: number }) => ({
          id: n.id, name: n.name, x: n.x, y: n.y, w: n.width, h: n.height,
        })),
      hint: 'Call get_canvas_state for full element details including fills, text, and styles.',
    }
    // Still send canvas_data for tool execution (get_canvas_state fallback reads it)
    // but only screen-level data to keep payload small
    localData.canvas_data = currentNodes.value.map((n: { id: string; type: string; name: string; x: number; y: number; width: number; height: number; parentId?: string | null; fill?: unknown }) => ({
      id: n.id, type: n.type, name: n.name, x: n.x, y: n.y, width: n.width, height: n.height,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(typeof n.fill === 'string' ? { fill: n.fill } : n.fill ? { fill: 'gradient' } : {}),
    }))
  }

  // Include compact design list (names + screen counts only, NOT full nodes)
  if (designsCache.value.size > 0) {
    const designs: Array<{ name: string; screen_count: number; element_count: number }> = []
    for (const [, design] of designsCache.value) {
      const nodes = design.nodes as readonly { type: string; parentId?: string | null }[]
      designs.push({
        name: design.name,
        screen_count: nodes.filter(n => n.type === 'screen' && !n.parentId).length,
        element_count: nodes.length,
      })
    }
    localData.designs = designs
  }

  return localData
}

// Reference types for cross-space linking
interface DesignReference {
  design: string        // Design/screen name
  variant?: string      // Optional variant/page (after /)
  raw: string           // Original matched text
}

interface FileReference {
  filename: string      // File name or partial path
  raw: string           // Original matched text
}

interface DocReference {
  title: string         // Document title or partial match
  raw: string           // Original matched text
}

interface ParsedReferences {
  designs: DesignReference[]
  docs: DocReference[]  // ^DocTitle references
  tasks: string[]
  components: string[]  // ~ComponentName
  files: string[]       // $path/to/file (explicit paths)
  codeFiles: FileReference[]  // !filename (fuzzy file search like CMD+P)
}

// Parse @design, #task, ~component, $file, and !file references from message
// Supports: @DesignName, @DesignName/VariantPage, #123, ~ComponentName, $src/file.ts, !login.vue
function parseReferences(text: string): ParsedReferences {
  // @Design or @Design/Variant Page - supports paths and spaces
  // Match @ followed by text until we hit certain delimiters (but allow / and spaces inside)
  const designMatches = [...text.matchAll(/@([\w][\w\s-]*(?:\/[\w\s-]+)?)(?=\s+(?:make|create|build|convert|redesign|update|change|adapt|plus)\b|\s*[,.|!?]|\s+[^/\w]|$)/gi)]
  const designs: DesignReference[] = designMatches.map(m => {
    const raw = m[1]?.trim() || ''
    const parts = raw.split('/')
    return {
      design: parts[0]?.trim() || '',
      variant: parts[1]?.trim(),
      raw
    }
  })

  // #123 - Task references
  const tasks = [...text.matchAll(/#(\d+)/g)].map(m => m[1]).filter((t): t is string => !!t)

  // ~ComponentName - Component references
  const components = [...text.matchAll(/~([\w-]+)/g)].map(m => m[1]).filter((c): c is string => !!c)

  // $path/to/file - Explicit file path references
  const files = [...text.matchAll(/\$([\w./-]+)/g)].map(m => m[1]).filter((f): f is string => !!f)

  // !filename - Fuzzy file search (like VS Code CMD+P)
  const codeFileMatches = [...text.matchAll(/!([\w.-]+(?:\/[\w.-]+)*)/g)]
  const codeFiles: FileReference[] = codeFileMatches.map(m => ({
    filename: m[1] || '',
    raw: m[0] || ''
  }))

  // ^DocTitle - Document references
  const docMatches = [...text.matchAll(/\^([\w][\w\s-]*?)(?=\s*[,.|!?]|\s+[^\w]|$)/g)]
  const docs: DocReference[] = docMatches.map(m => ({
    title: m[1]?.trim() || '',
    raw: m[1]?.trim() || ''
  }))

  return { designs, docs, tasks, components, files, codeFiles }
}

// Get referenced designs context
function getReferencedDesignsContext(refs: DesignReference[]): string {
  if (refs.length === 0) return ''

  const contexts: string[] = []
  for (const ref of refs) {
    // Use raw reference which includes variant path if present
    const context = getDesignForCodeGeneration(ref.raw)
    if (ref.variant) {
      contexts.push(`### ${ref.design} / ${ref.variant}\n${context}`)
    } else {
      contexts.push(context)
    }
  }
  return '\n\n## Referenced Designs\n' + contexts.join('\n\n')
}

// Get referenced components context (from code space)
function getReferencedComponentsContext(components: string[]): string {
  if (components.length === 0) return ''
  // TODO: Implement component lookup from code space
  return `\n\n## Referenced Components\nComponents referenced: ${components.map(c => `~${c}`).join(', ')}`
}

// Get referenced files context
function getReferencedFilesContext(files: string[]): string {
  if (files.length === 0) return ''
  // TODO: Implement file content lookup for $path references
  return `\n\n## Referenced Files\nFiles referenced: ${files.map(f => `$${f}`).join(', ')}`
}

// Get referenced code files context (for !filename references)
// Returns file paths that match the fuzzy search
function getReferencedCodeFilesContext(refs: FileReference[], allFiles: ProjectFile[]): string {
  if (refs.length === 0 || allFiles.length === 0) return ''

  const matchedFiles: string[] = []

  for (const ref of refs) {
    const query = ref.filename.toLowerCase()
    // Fuzzy match - find files containing the query
    const matches = allFiles.filter(f =>
      f.name.toLowerCase().includes(query) ||
      f.path.toLowerCase().includes(query)
    )
    matchedFiles.push(...matches.slice(0, 3).map(f => f.path))
  }

  if (matchedFiles.length === 0) return ''

  return `\n\n## Referenced Code Files (via ! search)\nMatched files: ${matchedFiles.join(', ')}\n\nUse the read_file or file_search tools to access these files if needed.`
}

// Get referenced documents context (for ^DocTitle references)
// Fetches actual content from DB or local files
async function getReferencedDocsContext(refs: DocReference[]): Promise<string> {
  if (refs.length === 0) return ''

  const contexts: string[] = ['\n\n## Referenced Documents']
  for (const ref of refs) {
    const query = ref.title.toLowerCase()

    // Check DB docs first
    const dbDoc = projectDocs.value.find(d =>
      d.title.toLowerCase().includes(query)
    )
    if (dbDoc) {
      try {
        const fullDoc = await requestSpaceData('docs', { type: 'documents.fetch', params: { id: dbDoc.id } }) as { content?: string } | undefined
        if (fullDoc?.content) {
          // Limit content to ~4000 chars to avoid bloating the prompt
          const content = fullDoc.content.length > 4000
            ? fullDoc.content.substring(0, 4000) + '\n\n... [truncated]'
            : fullDoc.content
          contexts.push(`### ${dbDoc.title} (${dbDoc.type})\n${content}`)
        } else {
          contexts.push(`### ${dbDoc.title} (${dbDoc.type})\n[Document found but content is empty]`)
        }
      } catch {
        contexts.push(`### ${dbDoc.title} (${dbDoc.type})\nDocument ID: ${dbDoc.id}\n[Failed to fetch content — use get_document tool with document_id: ${dbDoc.id}]`)
      }
      continue
    }

    // Check local .md files
    const localDoc = localDocs.value.find(d =>
      d.title.toLowerCase().includes(query)
    )
    if (localDoc) {
      try {
        if (docsTauriFs) {
          const content = await docsTauriFs.readTextFile(localDoc.path)
          const trimmed = content.length > 4000
            ? content.substring(0, 4000) + '\n\n... [truncated]'
            : content
          contexts.push(`### ${localDoc.title} (${localDoc.type})\n${trimmed}`)
        } else {
          contexts.push(`### ${localDoc.title} (${localDoc.type})\nFile: ${localDoc.path}\n[Use read_file tool to access: ${localDoc.path}]`)
        }
      } catch {
        contexts.push(`### ${localDoc.title} (${localDoc.type})\nFile: ${localDoc.path}\n[Use read_file tool to access: ${localDoc.path}]`)
      }
    }
  }
  return contexts.join('\n')
}

// Project file structure for !autocomplete
interface ProjectFile {
  name: string
  path: string
  type: 'file' | 'directory'
}

// Get design data from IndexedDB for AI context
function getDesignDataForAI(refs: DesignReference[], designs: UIDesign[]): string {
  if (refs.length === 0 || designs.length === 0) return ''

  const parts: string[] = ['\n\n## Design Data from Project']

  for (const ref of refs) {
    const designName = ref.design.toLowerCase()
    const design = designs.find(d =>
      d.name.toLowerCase() === designName ||
      d.name.toLowerCase().includes(designName)
    )

    if (design) {
      parts.push(`\n### ${design.name}`)
      parts.push(`Design ID: ${design.id}`)
      const designNodes = design.nodes as DesignNode[] | undefined
      parts.push(`Elements: ${designNodes?.length || 0}`)

      // Include actual node data for code generation
      if (designNodes && designNodes.length > 0) {
        // Limit to essential properties for context size
        const essentialNodes = designNodes.map((node: DesignNode) => ({
          id: node.id,
          type: node.type,
          name: node.name,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          fill: node.fill,
          text: node.text,
          fontSize: node.fontSize,
          cornerRadius: node.cornerRadius,
          parentId: node.parentId,
        }))
        parts.push(`\n\`\`\`json\n${JSON.stringify(essentialNodes, null, 2)}\n\`\`\``)
      }
    }
  }

  return parts.join('\n')
}

// Format tool name for display (snake_case -> Title Case with icon hint)
function formatToolName(name: string): string {
  // Map tool names to friendlier labels
  const toolLabels: Record<string, string> = {
    'read_file': 'Reading file',
    'write_file': 'Writing file',
    'create_file': 'Creating file',
    'edit_file': 'Editing file',
    'list_files': 'Listing files',
    'file_search': 'Searching files',
    'search_code': 'Searching code',
    'run_command': 'Running command',
    'create_task': 'Creating task',
    'update_task': 'Updating task',
    'list_tasks': 'Listing tasks',
    'create_project': 'Creating project',
    'list_projects': 'Listing projects',
    'list_users': 'Listing users',
    'invite_user': 'Inviting user',
    'search_users': 'Searching users',
    'create_screen': 'Creating screen',
    'create_element': 'Creating element',
    'search_images': 'Searching images',
    'search_icons': 'Searching icons',
    'git_status': 'Git status',
    'git_diff': 'Git diff',
    'git_commit': 'Git commit',
    'get_current_time': 'Getting time',
    'execute_code': 'Executing code'
  }
  return toolLabels[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Format tool result for display (truncate if too long)
function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    const formatted = JSON.stringify(parsed, null, 2)
    // Truncate very long results
    if (formatted.length > 500) {
      return formatted.substring(0, 500) + '\n... (truncated)'
    }
    return formatted
  } catch {
    // Not JSON, return as-is (truncated if needed)
    if (result.length > 500) {
      return result.substring(0, 500) + '\n... (truncated)'
    }
    return result
  }
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

// Agent types - AgentInfo is imported from useContextService

interface IntentAnalysis {
  primary_agent: string
  secondary_agents?: string[]
  reasoning: string
  confidence: number
  keywords?: string[]
}

// AI Model - uses default from preferences
const { defaultModelId, currentModel, getProviderId, resolveModelId } = useAIModel()

// Check if current model is Claude (uses OAuth via context service)
const _isClaudeModel = computed(() => {
  const providerId = getProviderId(resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto', persist: true }))
  return providerId === 'anthropic-oauth'
})

// Conductor question option
interface ConductorOption {
  label: string
  value: string
  description?: string
}

// Conductor question for structured choices
interface ConductorQuestion {
  type: 'question'
  question: string
  options: ConductorOption[]
  allowMultiple?: boolean
  allowOther?: boolean
}

// Message type with rendered HTML cache
// Tool call display for Claude-like UI
interface ToolCallDisplay {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: 'calling' | 'completed' | 'error'
  result?: string
  expanded: boolean
  startTime: number
  endTime?: number
  durationMs?: number // Server-measured duration (from Go-side timing)
}

// Image search result for clickable placement
interface SearchImageResult {
  url: string
  thumb: string
  description: string
  credit: string
  width: number
  height: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  renderedHtml?: string
  conductorQuestion?: ConductorQuestion // Structured question with options
  selectedOptions?: string[] // User's selected options
  imageUrl?: string // Base64 data URL for attached images
  toolCalls?: ToolCallDisplay[] // Tool executions for this message
  searchImages?: SearchImageResult[] // Clickable image results from search
  statusText?: string // Live progress status (e.g., "Executing 3 tool(s)...", "Iteration 2/15...")
}

// Global conversation cache - persists across navigation and page refreshes
// Uses SQLite ai_conversations table (per user/company for cloud sync) for Tauri
// localStorage fallback for web
const STORAGE_KEY = 'construct_ai_conversations'

// Type for AI conversation response
interface AIConversationResponse {
  conversations?: Array<{
    context_key: string
    messages_json: string
    user_id: number
    company_id: number
  }>
}

const isContextNotConnectedError = (error: unknown): boolean =>
  String(error).toLowerCase().includes('not connected')

// Load conversation cache - async for SQLite support
const loadConversationCache = async (): Promise<Map<string, ChatMessage[]>> => {
  if (typeof window === 'undefined') return new Map()

  if (isTauri.value) {
    try {
      // Use dedicated ai.conversations.list endpoint (scoped to user/company)
      const result = await sendRequest('ai.conversations.list', {}) as AIConversationResponse
      if (result?.conversations) {
        const map = new Map<string, ChatMessage[]>()
        for (const conv of result.conversations) {
          try {
            const messages = JSON.parse(conv.messages_json) as ChatMessage[]
            map.set(conv.context_key, messages)
          } catch {
            // Skip invalid entries
          }
        }
        return map
      }
    } catch (e) {
      if (!isContextNotConnectedError(e)) {
        console.warn('[AssistantFloat] Failed to load conversation cache from SQLite:', e)
      }
    }
    return new Map()
  }

  // localStorage fallback for web
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return new Map(Object.entries(parsed))
    }
  } catch (e) {
    console.warn('[AssistantFloat] Failed to load conversation cache:', e)
  }
  return new Map()
}

// Compact messages for storage — strip heavy fields that bloat the payload
const compactMessagesForStorage = (msgs: ChatMessage[]): ChatMessage[] => {
  const MAX_RESULT_LEN = 300
  const MAX_ARG_LEN = 200

  return msgs.map(msg => {
    const compact: ChatMessage = {
      role: msg.role,
      content: msg.content,
    }

    // Keep structured question/answer data
    if (msg.conductorQuestion) compact.conductorQuestion = msg.conductorQuestion
    if (msg.selectedOptions) compact.selectedOptions = msg.selectedOptions

    // Keep image references (base64 URLs are needed to show inline images)
    if (msg.imageUrl) compact.imageUrl = msg.imageUrl
    if (msg.searchImages?.length) compact.searchImages = msg.searchImages

    // Strip: renderedHtml (re-rendered on load), statusText (transient), thinking (large, not shown in history)

    // Compact tool calls — keep name/status, truncate results and args
    if (msg.toolCalls?.length) {
      compact.toolCalls = msg.toolCalls.map(tc => {
        const compactTc: ToolCallDisplay = {
          id: tc.id,
          name: tc.name,
          arguments: {},
          status: tc.status,
          expanded: false,
          startTime: 0,
        }

        // Truncate arguments — just keep keys with shortened values
        if (tc.arguments) {
          const args: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(tc.arguments)) {
            if (k === 'raw' && typeof v === 'object' && v !== null) {
              // For raw tool args, keep the object but truncate string values
              const rawArgs: Record<string, unknown> = {}
              for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) {
                if (typeof rv === 'string' && rv.length > MAX_ARG_LEN) {
                  rawArgs[rk] = rv.slice(0, MAX_ARG_LEN) + '…'
                } else {
                  rawArgs[rk] = rv
                }
              }
              args[k] = rawArgs
            } else if (typeof v === 'string' && v.length > MAX_ARG_LEN) {
              args[k] = v.slice(0, MAX_ARG_LEN) + '…'
            } else {
              args[k] = v
            }
          }
          compactTc.arguments = args
        }

        // Truncate result — biggest source of bloat (canvas state, file contents, etc.)
        if (tc.result) {
          if (tc.result.length > MAX_RESULT_LEN) {
            compactTc.result = tc.result.slice(0, MAX_RESULT_LEN) + '… [truncated]'
          } else {
            compactTc.result = tc.result
          }
        }

        return compactTc
      })
    }

    return compact
  })
}

// Save a single conversation by context key - more efficient for SQLite
const RECENT_TURNS_FOR_SAVE = 6
const selectRecentTurns = (msgs: ChatMessage[], turns = RECENT_TURNS_FOR_SAVE): ChatMessage[] => {
  const selected: ChatMessage[] = []
  let capturedTurns = 0
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const msg = msgs[i]
    if (!msg) continue
    selected.unshift(msg)
    if (msg.role === 'user') {
      capturedTurns += 1
      if (capturedTurns >= turns) break
    }
  }
  return selected
}

const saveConversation = async (contextKey: string, messages: ChatMessage[]) => {
  if (typeof window === 'undefined') return

  if (isTauri.value) {
    try {
      const trimmed = selectRecentTurns(messages)
      const compacted = compactMessagesForStorage(trimmed)
      const payload = JSON.stringify(compacted)
      if (import.meta.env.DEV) {
        console.log(`[save] contextKey=${contextKey} payload=${Math.round(payload.length / 1024)}KB messages=${messages.length}`)
      }
      await sendRequest('ai.conversations.save', {
        contextKey,
        messages: payload
      })
    } catch (e) {
      // If payload too large, strip all tool results and retry once
      if (String(e).includes('payload_too_large')) {
        console.warn('[AssistantFloat] Payload too large, retrying with stripped tool results')
        const compactedForRetry = compactMessagesForStorage(messages)
        // Find the last message that has an image — preserve only that one
        const lastImageIdx = compactedForRetry.reduce((last, m, i) => m.imageUrl ? i : last, -1)
        const stripped = compactedForRetry.map((m, i) => ({
          ...m,
          imageUrl: (m.imageUrl && i !== lastImageIdx) ? undefined : m.imageUrl,
          toolCalls: m.toolCalls?.map(tc => ({
            ...tc,
            result: tc.result ? `[${tc.name} result stripped — payload too large]` : tc.result,
            arguments: {}
          }))
        }))
        try {
          await sendRequest('ai.conversations.save', {
            contextKey,
            messages: JSON.stringify(stripped)
          })
        } catch (retryErr) {
          console.warn('[AssistantFloat] Retry save also failed:', retryErr)
        }
      } else if (!isContextNotConnectedError(e)) {
        console.warn('[AssistantFloat] Failed to save conversation to SQLite:', e)
      }
    }
    return
  }

  // localStorage fallback - save entire cache (also compact)
  const obj: Record<string, ChatMessage[]> = {}
  conversationCache.forEach((v, k) => { obj[k] = compactMessagesForStorage(v) })
  obj[contextKey] = compactMessagesForStorage(messages)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch (e) {
    console.warn('[AssistantFloat] Failed to save conversation cache:', e)
  }
}

// Incremental save — upsert a single message by index instead of full blob
// Uses keyed debounce so concurrent saves to different messages don't cancel each other
const upsertTimers = new Map<string, ReturnType<typeof setTimeout>>()
let lastIncrementalSaveTs = 0
const saveMessageIncremental = (contextKey: string, messageIndex: number, message: ChatMessage) => {
  if (typeof window === 'undefined' || !isTauri.value) return

  // Keyed debounce — each contextKey:messageIndex gets its own timer
  const key = `${contextKey}:${messageIndex}`
  const existing = upsertTimers.get(key)
  if (existing) clearTimeout(existing)

  upsertTimers.set(key, setTimeout(async () => {
    upsertTimers.delete(key)
    try {
      const compacted = compactMessagesForStorage([message])[0]
      await sendRequest('ai.conversations.upsert_message', {
        contextKey,
        messageIndex,
        message: JSON.stringify(compacted)
      })
      lastIncrementalSaveTs = Date.now()
    } catch (e) {
      if (!isContextNotConnectedError(e)) {
        console.warn('[AssistantFloat] Incremental save failed, falling back to full save:', e)
        // Fallback to full save
        saveConversation(contextKey, messages.value)
      }
    }
  }, 200))
}

// Save conversation cache - for backwards compatibility (used by clear operations)
const _saveConversationCache = async (cache: Map<string, ChatMessage[]>) => {
  if (typeof window === 'undefined') return

  if (isTauri.value) {
    // For Tauri, save each conversation individually
    for (const [key, messages] of cache.entries()) {
      await saveConversation(key, messages)
    }
    return
  }

  // localStorage fallback for web
  const obj: Record<string, ChatMessage[]> = {}
  cache.forEach((v, k) => { obj[k] = v })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch (e) {
    console.warn('[AssistantFloat] Failed to save conversation cache:', e)
  }
}

// Initialize cache (will be loaded async on mount)
let conversationCache = new Map<string, ChatMessage[]>()

// Use global assistant state
const { isOpen } = useAssistant()

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
    isOpen.value = !isOpen.value
    lastLeftShiftPress = 0
  } else {
    lastLeftShiftPress = now
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
  document.removeEventListener('mousemove', onPanelDrag)
  document.removeEventListener('mouseup', stopPanelDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

// Conversation key based on route (space + project query)
const conversationKey = computed(() => {
  const path = route.path
  const project = route.query.project
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

// Panel position & drag-to-move
type PanelPosition = 'bottom-center' | 'left' | 'right' | 'bottom' | 'floating'
const panelPosition = ref<PanelPosition>(
  (typeof window !== 'undefined' && localStorage.getItem('construct_assistant_position') as PanelPosition) || 'bottom-center'
)
const floatingPos = reactive({ x: 0, y: 0 })
const isDraggingPanel = ref(false)
const showDockMenu = ref(false)
const panelRef = ref<HTMLElement | null>(null)
let dragOffset = { x: 0, y: 0 }

// Resize state
const panelSize = reactive({
  width: parseInt(localStorage.getItem('construct_assistant_w') || '0') || 0,
  height: parseInt(localStorage.getItem('construct_assistant_h') || '0') || 0,
})
const isResizing = ref(false)
let resizeEdge = '' // 'right', 'bottom', 'corner'
let resizeStart = { x: 0, y: 0, w: 0, h: 0 }

const wantsDocked = computed(() => ['left', 'right', 'bottom'].includes(panelPosition.value))
const dockTargetEl = ref<HTMLElement | null>(null)
const isDocked = computed(() => wantsDocked.value && dockTargetEl.value !== null)

function resolveDockTarget(): HTMLElement | null {
  switch (panelPosition.value) {
    case 'left': return document.getElementById('assistant-dock-left')
    case 'right': return document.getElementById('assistant-dock-right')
    case 'bottom': return document.getElementById('assistant-dock-bottom')
    default: return null
  }
}

watch(panelPosition, () => {
  if (wantsDocked.value) {
    // Wait for DOM to settle then resolve the target.
    // Don't null out dockTargetEl first — changing Teleport target
    // mid-transition causes "parent.insertBefore on null" errors.
    nextTick(() => {
      requestAnimationFrame(() => {
        dockTargetEl.value = resolveDockTarget()
      })
    })
  } else {
    dockTargetEl.value = null
  }
}, { immediate: true })

const panelPositionClasses = computed(() => {
  switch (panelPosition.value) {
    case 'left':
      return 'w-[420px] h-full border-r border-gray-200/50 dark:border-gray-800/50'
    case 'right':
      return 'w-[420px] h-full border-l border-gray-200/50 dark:border-gray-800/50'
    case 'bottom':
      return 'w-full h-[350px] border-t border-gray-200/50 dark:border-gray-800/50'
    case 'floating':
      return 'fixed w-[50vw] min-w-[420px] max-w-[800px]'
    case 'bottom-center':
    default:
      return 'fixed bottom-6 left-[calc(50%+36px)] -translate-x-1/2 w-[50vw] min-w-[420px] max-w-[800px]'
  }
})

const panelStyle = computed(() => {
  const style: Record<string, string> = {}
  if (panelPosition.value === 'floating') {
    style.left = `${floatingPos.x}px`
    style.top = `${floatingPos.y}px`
  }
  // Apply custom size only for floating modes
  if (!isDocked.value) {
    if (panelSize.width) {
      style.width = `${panelSize.width}px`
      style.minWidth = '380px'
      style.maxWidth = `${window.innerWidth - 32}px`
    }
    if (panelSize.height) {
      style.height = `${panelSize.height}px`
    }
  }
  return style
})

function savePanelPosition() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('construct_assistant_position', panelPosition.value)
  }
}

function setPanelPosition(pos: PanelPosition) {
  panelPosition.value = pos
  savePanelPosition()
}

function startPanelDrag(e: MouseEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  const panel = panelRef.value
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  if (panelPosition.value !== 'floating') {
    floatingPos.x = rect.left
    floatingPos.y = rect.top
    panelPosition.value = 'floating'
  }
  dragOffset = { x: e.clientX - floatingPos.x, y: e.clientY - floatingPos.y }
  isDraggingPanel.value = true
  document.addEventListener('mousemove', onPanelDrag)
  document.addEventListener('mouseup', stopPanelDrag)
}

function onPanelDrag(e: MouseEvent) {
  if (!isDraggingPanel.value) return
  const panel = panelRef.value
  const pw = panel?.offsetWidth || 420
  const ph = panel?.offsetHeight || 400
  floatingPos.x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - pw))
  floatingPos.y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - ph))
}

function stopPanelDrag() {
  isDraggingPanel.value = false
  document.removeEventListener('mousemove', onPanelDrag)
  document.removeEventListener('mouseup', stopPanelDrag)
  // Snap to edges if close enough — dock into layout
  const threshold = 50
  const pw = panelRef.value?.offsetWidth || 420
  if (floatingPos.x < threshold) {
    setPanelPosition('left')
  } else if (floatingPos.x + pw > window.innerWidth - threshold) {
    setPanelPosition('right')
  } else if (floatingPos.y + 200 > window.innerHeight - threshold) {
    setPanelPosition('bottom')
  } else {
    savePanelPosition()
  }
}

// Resize handlers
function startResize(e: MouseEvent, edge: string) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const panel = panelRef.value
  if (!panel) return
  resizeEdge = edge
  resizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: panel.offsetWidth,
    h: panel.offsetHeight,
  }
  isResizing.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const dx = e.clientX - resizeStart.x
  const dy = e.clientY - resizeStart.y
  const minW = 380
  const maxW = window.innerWidth - 32
  const minH = 300
  const maxH = window.innerHeight - 32

  if (resizeEdge === 'right' || resizeEdge === 'corner') {
    panelSize.width = Math.max(minW, Math.min(resizeStart.w + dx, maxW))
  }
  if (resizeEdge === 'bottom' || resizeEdge === 'corner') {
    panelSize.height = Math.max(minH, Math.min(resizeStart.h + dy, maxH))
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  // Persist size
  if (panelSize.width) localStorage.setItem('construct_assistant_w', String(panelSize.width))
  if (panelSize.height) localStorage.setItem('construct_assistant_h', String(panelSize.height))
}

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

// Load dev mode setting from context service
const loadDevMode = async () => {
  if (!isTauri.value) return
  try {
    // In dev builds, auto-enable. In production, check settings.
    if (import.meta.env.DEV) {
      devMode.value = true
    } else {
      const result = await sendRequest('settings.get', { key: 'dev_mode' }) as { value?: string }
      devMode.value = result?.value === 'true'
    }
  } catch {
    // Ignore - use default
  }
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

// Input history for up/down arrow navigation
const inputHistory = ref<string[]>([])
const historyIndex = ref(-1)
const tempInput = ref('') // Store current input when navigating history
const latency = ref<number | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

// Autocomplete state
const showAutocomplete = ref(false)
const autocompleteType = ref<'design' | 'task' | 'component' | 'file' | 'codeFile' | 'doc' | 'command' | null>(null)
const autocompleteQuery = ref('')
const autocompleteIndex = ref(0)
const autocompleteStartPos = ref(0)

// Project files for ! autocomplete (loaded from code space)
const projectFiles = ref<ProjectFile[]>([])

// Available agents (loaded from API) - uses AgentInfo type imported from useContextService
const agents = ref<AgentInfo[]>([])

// Available slash commands (built-in + dynamic agent dispatch commands)
const slashCommands = computed(() => {
  // Built-in commands
  const commands = [
    { label: 'agents', description: 'List all available specialized agents', icon: 'i-lucide-users', type: 'command' },
    { label: 'analyze', description: 'Analyze intent and suggest best agent', icon: 'i-lucide-search', type: 'command' },
    { label: 'help', description: 'Show all available commands', icon: 'i-lucide-help-circle', type: 'command' },
    { label: 'clear', description: 'Clear conversation history', icon: 'i-lucide-trash-2', type: 'command' },
  ]

  // Add agent dispatch commands (e.g., /code, /design, /kanban)
  for (const agent of agents.value) {
    // Convert icon format: lucide:code -> i-lucide-code
    const iconName = agent.icon
      ? `i-${agent.icon.replace(':', '-')}`
      : 'i-lucide-bot'
    commands.push({
      label: agent.id,
      description: agent.description,
      icon: iconName,
      type: 'agent',
    })
  }

  return commands
})

// Load agents from context service
async function loadAgents() {
  try {
    const { listAgents } = useContextService()
    const response = await listAgents()
    agents.value = response.agents
  } catch {
    // Fallback to basic agents if API fails
    agents.value = [
      { id: 'code', name: 'Code Agent', category: 'specialized', description: 'Full codebase access for development', icon: 'lucide:code', isBuiltin: true },
      { id: 'design', name: 'Design Agent', category: 'specialized', description: 'UI/UX design assistant', icon: 'lucide:palette', isBuiltin: true },
      { id: 'kanban', name: 'Kanban Agent', category: 'specialized', description: 'Project management', icon: 'lucide:kanban', isBuiltin: true },
      { id: 'git', name: 'Git Agent', category: 'specialized', description: 'Version control', icon: 'lucide:git-branch', isBuiltin: true },
      { id: 'explorer', name: 'Explorer Agent', category: 'specialized', description: 'Codebase exploration', icon: 'lucide:compass', isBuiltin: true },
      { id: 'planner', name: 'Planner Agent', category: 'specialized', description: 'Technical planning', icon: 'lucide:clipboard-list', isBuiltin: true },
    ]
  }
}

// Status icons for tasks
const taskStatusIcons: Record<string, string> = {
  backlog: 'i-lucide-inbox',
  todo: 'i-lucide-circle',
  in_progress: 'i-lucide-loader',
  review: 'i-lucide-eye',
  done: 'i-lucide-check-circle',
}

// Priority colors for tasks
const taskPriorityColors: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

// Get suggestions based on type and query
const autocompleteSuggestions = computed(() => {
  if (!autocompleteType.value) return []

  const query = autocompleteQuery.value.toLowerCase()

  switch (autocompleteType.value) {
    case 'design': {
      // Merge designs from all sources: IndexedDB (local), sync-api (team cloud), and in-memory canvas
      const dbDesigns = projectDesigns.value
      const cloudDesigns = syncApiDesigns.value
      const memoryDesigns = listAvailableDesigns()

      // Merge and deduplicate (prefer cloud > local > memory for source indicator)
      const allDesignNames = new Set<string>()
      const allDesigns: { name: string; nodeCount: number; source: 'cloud' | 'local' | 'memory' }[] = []

      // Cloud designs first (team shared)
      for (const d of cloudDesigns) {
        if (!allDesignNames.has(d.name.toLowerCase())) {
          allDesignNames.add(d.name.toLowerCase())
          allDesigns.push({ name: d.name, nodeCount: (d.nodes as DesignNode[] | undefined)?.length || 0, source: 'cloud' })
        }
      }
      // Local IndexedDB designs
      for (const d of dbDesigns) {
        if (!allDesignNames.has(d.name.toLowerCase())) {
          allDesignNames.add(d.name.toLowerCase())
          allDesigns.push({ name: d.name, nodeCount: (d.nodes as DesignNode[] | undefined)?.length || 0, source: 'local' })
        }
      }
      // In-memory canvas designs (not yet saved)
      for (const name of memoryDesigns) {
        if (!allDesignNames.has(name.toLowerCase())) {
          allDesignNames.add(name.toLowerCase())
          allDesigns.push({ name, nodeCount: 0, source: 'memory' })
        }
      }

      if (allDesigns.length === 0) {
        return [{ label: 'No designs available', icon: 'i-lucide-layout', type: 'design' as const, disabled: true }]
      }
      return allDesigns
        .filter(d => d.name.toLowerCase().includes(query))
        .slice(0, 8)
        .map(d => ({
          label: d.name,
          sublabel: d.nodeCount > 0
            ? `${d.nodeCount} elements${d.source === 'cloud' ? ' (team)' : d.source === 'local' ? ' (local)' : ''}`
            : d.source === 'cloud' ? '(team)' : d.source === 'local' ? '(local)' : undefined,
          icon: d.source === 'cloud' ? 'i-lucide-cloud' : 'i-lucide-layout',
          type: 'design' as const
        }))
    }
    case 'task': {
      const tasks = busTasksCache.value
      if (tasks.length === 0) {
        return [{ label: 'No tasks loaded', icon: 'i-lucide-check-square', type: 'task' as const, disabled: true }]
      }
      // Filter tasks by query (match ID or title)
      const filtered = tasks.filter(t =>
        t.id.toString().includes(query) ||
        t.title.toLowerCase().includes(query)
      )
      return filtered
        .slice(0, 8)
        .map(t => ({
          label: `${t.id}`,
          sublabel: t.title,
          icon: taskStatusIcons[t.status] || 'i-lucide-check-square',
          priority: t.priority,
          type: 'task' as const
        }))
    }
    case 'doc': {
      // Merge DB docs and local .md files, deduplicate by title
      const allDocNames = new Set<string>()
      const allDocs: { title: string; docType: string; source: 'cloud' | 'local' }[] = []

      // DB docs first (authoritative)
      for (const d of projectDocs.value) {
        if (!allDocNames.has(d.title.toLowerCase())) {
          allDocNames.add(d.title.toLowerCase())
          allDocs.push({ title: d.title, docType: d.type, source: 'cloud' })
        }
      }
      // Local .md files
      for (const d of localDocs.value) {
        if (!allDocNames.has(d.title.toLowerCase())) {
          allDocNames.add(d.title.toLowerCase())
          allDocs.push({ title: d.title, docType: d.type, source: 'local' })
        }
      }

      if (allDocs.length === 0) {
        return [{ label: 'No documents available', icon: 'i-lucide-file-text', type: 'doc' as const, disabled: true }]
      }
      return allDocs
        .filter(d => d.title.toLowerCase().includes(query))
        .slice(0, 8)
        .map(d => ({
          label: d.title,
          sublabel: `${d.docType}${d.source === 'local' ? ' (local)' : ''}`,
          icon: d.docType === 'prd' ? 'i-lucide-clipboard-list' : d.docType === 'architecture' ? 'i-lucide-boxes' : d.docType === 'readme' ? 'i-lucide-book-open' : 'i-lucide-file-text',
          type: 'doc' as const
        }))
    }
    case 'component':
      // TODO: Fetch components from code space
      return [
        { label: 'Components will appear here', icon: 'i-lucide-component', type: 'component' as const, disabled: true }
      ]
    case 'codeFile': {
      // !filename - fuzzy file search like VS Code CMD+P
      if (projectFiles.value.length === 0) {
        return [{ label: 'No project files loaded', icon: 'i-lucide-folder-open', type: 'codeFile' as const, disabled: true }]
      }
      // Fuzzy filter files by query
      const filtered = projectFiles.value.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.path.toLowerCase().includes(query)
      )
      if (filtered.length === 0) {
        return [{ label: 'No matching files', icon: 'i-lucide-file-x', type: 'codeFile' as const, disabled: true }]
      }
      const root = codeEditorState.rootPath
      return filtered
        .slice(0, 10)
        .map(f => {
          // Show relative path from project root (e.g. "Landing/index.html" instead of full absolute path)
          const relativePath = root && f.path.startsWith(root)
            ? f.path.slice(root.length + 1)
            : f.path
          // Show parent directory as sublabel for context (e.g. "Landing/" for "Landing/index.html")
          const parentDir = relativePath.includes('/')
            ? relativePath.substring(0, relativePath.lastIndexOf('/') + 1)
            : ''
          return {
            label: f.name,
            sublabel: parentDir || '/',
            fullPath: relativePath,
            icon: getFileIcon(f.name),
            type: 'codeFile' as const
          }
        })
    }
    case 'command': {
      // Filter slash commands by query
      const filtered = slashCommands.value.filter(c =>
        c.label.toLowerCase().includes(query)
      )
      return filtered.map(c => ({
        label: `/${c.label}`,
        sublabel: c.description,
        icon: c.icon,
        type: 'command' as const,
        commandType: c.type, // 'command' or 'agent'
      }))
    }
    default:
      return []
  }
})

// Get icon based on file extension
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    vue: 'i-logos-vue',
    ts: 'i-logos-typescript-icon',
    tsx: 'i-logos-react',
    js: 'i-logos-javascript',
    jsx: 'i-logos-react',
    go: 'i-logos-go',
    py: 'i-logos-python',
    css: 'i-vscode-icons-file-type-css',
    scss: 'i-vscode-icons-file-type-scss',
    html: 'i-logos-html-5',
    json: 'i-vscode-icons-file-type-json',
    md: 'i-lucide-file-text',
  }
  return icons[ext || ''] || 'i-lucide-file-code'
}

// Handle input changes to detect @ # ~ $ ! / triggers
function handleInput(e: Event) {
  const input = e.target as HTMLInputElement
  const value = input.value
  const cursorPos = input.selectionStart || 0

  // Check for / at the start of input (slash command)
  const slashMatch = value.match(/^\/(\S*)$/)
  if (slashMatch) {
    autocompleteStartPos.value = 0
    autocompleteQuery.value = slashMatch[1] || ''
    autocompleteIndex.value = 0
    autocompleteType.value = 'command'
    showAutocomplete.value = true
    return
  }

  // Find the trigger character before cursor
  const textBeforeCursor = value.substring(0, cursorPos)
  const triggerMatch = textBeforeCursor.match(/(?:^|\s)([@#~$!^])(\S*)$/)

  if (triggerMatch) {
    const trigger = triggerMatch[1]
    const query = triggerMatch[2] || ''
    autocompleteStartPos.value = cursorPos - query.length - 1
    autocompleteQuery.value = query
    autocompleteIndex.value = 0

    switch (trigger) {
      case '@':
        autocompleteType.value = 'design'
        showAutocomplete.value = true
        break
      case '#':
        autocompleteType.value = 'task'
        showAutocomplete.value = true
        break
      case '~':
        autocompleteType.value = 'component'
        showAutocomplete.value = true
        break
      case '$':
      case '!':
        autocompleteType.value = 'codeFile'
        showAutocomplete.value = true
        break
      case '^':
        autocompleteType.value = 'doc'
        showAutocomplete.value = true
        break
    }
  } else {
    showAutocomplete.value = false
    autocompleteType.value = null
  }
}

// Handle keyboard navigation in autocomplete and input history
function handleKeydown(e: KeyboardEvent) {
  // Escape to stop generation when loading
  if (e.key === 'Escape' && isLoading.value) {
    e.preventDefault()
    stopGeneration()
    return
  }

  // If autocomplete is showing, handle autocomplete navigation
  if (showAutocomplete.value && autocompleteSuggestions.value.length > 0) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        autocompleteIndex.value = (autocompleteIndex.value + 1) % autocompleteSuggestions.value.length
        break
      case 'ArrowUp':
        e.preventDefault()
        autocompleteIndex.value = autocompleteIndex.value <= 0
          ? autocompleteSuggestions.value.length - 1
          : autocompleteIndex.value - 1
        break
      case 'Enter':
      case 'Tab': {
        e.preventDefault()
        const suggestion = autocompleteSuggestions.value[autocompleteIndex.value]
        if (suggestion) selectAutocomplete(suggestion)
        break
      }
      case 'Escape':
        e.preventDefault()
        showAutocomplete.value = false
        break
    }
    return
  }

  // Handle input history navigation with up/down arrows
  if (e.key === 'ArrowUp' && inputHistory.value.length > 0) {
    e.preventDefault()
    if (historyIndex.value === -1) {
      // Save current input before navigating
      tempInput.value = message.value
      historyIndex.value = inputHistory.value.length - 1
    } else if (historyIndex.value > 0) {
      historyIndex.value--
    }
    message.value = inputHistory.value[historyIndex.value] || ''
    return
  }

  if (e.key === 'ArrowDown' && historyIndex.value !== -1) {
    e.preventDefault()
    if (historyIndex.value < inputHistory.value.length - 1) {
      historyIndex.value++
      message.value = inputHistory.value[historyIndex.value] || ''
    } else {
      // Return to original input
      historyIndex.value = -1
      message.value = tempInput.value
    }
    return
  }

  // Handle Enter to send
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Select an autocomplete suggestion
function selectAutocomplete(suggestion: { label: string; sublabel?: string; fullPath?: string; type: string }) {
  if (!suggestion || !autocompleteType.value) return

  // Handle command selection - replace entire input with the command
  if (autocompleteType.value === 'command') {
    message.value = suggestion.label + ' '
    showAutocomplete.value = false
    autocompleteType.value = null
    nextTick(() => {
      inputRef.value?.focus()
    })
    return
  }

  const triggerMap: Record<string, string> = {
    design: '@',
    task: '#',
    component: '~',
    codeFile: '!',
    doc: '^'
  }
  const trigger = triggerMap[autocompleteType.value] || '@'

  // For codeFile, use the relative path (fullPath) if available, otherwise use label
  const insertValue = autocompleteType.value === 'codeFile' && suggestion.fullPath
    ? suggestion.fullPath
    : suggestion.label

  const before = message.value.substring(0, autocompleteStartPos.value)
  const after = message.value.substring(autocompleteStartPos.value + autocompleteQuery.value.length + 1)

  message.value = `${before}${trigger}${insertValue} ${after}`
  showAutocomplete.value = false
  autocompleteType.value = null

  // Focus back on input
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// Project designs from IndexedDB (for @ autocomplete)
const projectDesigns = ref<UIDesign[]>([])

// Designs from sync-api (team cloud)
const syncApiDesigns = ref<UIDesign[]>([])

// Project documents for ^ autocomplete (merged: DB + local .md files)
const projectDocs = ref<DocumentListItem[]>([])
const localDocs = ref<{ title: string; path: string; type: string }[]>([])
// Project members for AI context (so AI knows who's on the team)
interface ProjectMemberInfo {
  id: number
  name: string
  email: string
  position?: string
  role?: string
}
const projectMembers = ref<ProjectMemberInfo[]>([])

// Guess doc type from filename
function guessDocType(filename: string): string {
  const nameLower = filename.toLowerCase()
  if (nameLower.includes('prd')) return 'prd'
  if (nameLower.includes('readme')) return 'readme'
  if (nameLower.includes('architect')) return 'architecture'
  if (nameLower.includes('roadmap')) return 'roadmap'
  if (nameLower.includes('setup')) return 'setup'
  return 'custom'
}

// Convert title to filename: "My PRD" -> "my-prd.md"
function docTitleToFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md'
}

// Convert filename to title: "my-prd.md" -> "My Prd"
function docFilenameToTitle(filename: string): string {
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Tauri FS for doc sync (lazy loaded)
let docsTauriFs: typeof import('@tauri-apps/plugin-fs') | null = null
const initDocsTauri = async () => {
  if (docsTauriFs) return true
  try {
    docsTauriFs = await import('@tauri-apps/plugin-fs')
    return true
  } catch {
    return false
  }
}

// Bidirectional doc sync: DB <-> local docs/ folder
// 1. Fetch DB docs (from API - includes docs created by other team members)
// 2. Scan local docs/ folder for .md files
// 3. Local -> DB: create DB entries for local .md files not in DB
// 4. DB -> Local: write .md files for DB docs not on disk
async function syncProjectDocs(projectId: string | number, projectPath: string | undefined) {
  // Step 1: Load DB docs via context bus (space-docs handler)
  try {
    const docs = await requestSpaceData('docs', { type: 'documents.fetchProject', params: { projectId } })
    if (Array.isArray(docs)) projectDocs.value = docs as DocumentListItem[]
  } catch (e) {
    console.warn('[AssistantFloat] Failed to load docs from context bus:', e)
  }

  if (!projectPath) return

  // Initialize Tauri FS for local file operations
  const hasTauri = await initDocsTauri()
  if (!hasTauri || !docsTauriFs) {
    console.debug('[AssistantFloat] Tauri FS not available for doc sync')
    return
  }

  const docsPath = `${projectPath}/docs`

  // Step 2: Ensure docs/ directory exists
  try {
    const exists = await docsTauriFs.exists(docsPath)
    if (!exists) {
      await docsTauriFs.mkdir(docsPath, { recursive: true })
    }
  } catch (e) {
    console.debug('[AssistantFloat] Could not create docs directory:', e)
    return
  }

  // Step 3: Scan local docs/ folder for .md files
  const scannedLocal: { title: string; path: string; type: string; filename: string }[] = []
  try {
    const entries = await docsTauriFs.readDir(docsPath)
    for (const entry of entries) {
      if (entry.name && entry.name.endsWith('.md')) {
        const filePath = `${docsPath}/${entry.name}`
        scannedLocal.push({
          title: docFilenameToTitle(entry.name),
          path: filePath,
          type: guessDocType(entry.name),
          filename: entry.name
        })
      }
    }
  } catch (e) {
    console.debug('[AssistantFloat] Could not read docs directory:', e)
  }

  localDocs.value = scannedLocal.map(f => ({ title: f.title, path: f.path, type: f.type }))

  // Step 4: Sync local -> DB (new local .md files that aren't in DB)
  const dbTitles = new Set(projectDocs.value.map(d => d.title.toLowerCase()))
  for (const local of scannedLocal) {
    if (!dbTitles.has(local.title.toLowerCase())) {
      try {
        const content = await docsTauriFs.readTextFile(local.path)
        await requestSpaceData('docs', {
          type: 'documents.create',
          params: {
            projectId: Number(projectId),
            data: {
              title: local.title,
              content,
              type: guessDocType(local.filename),
              project_id: Number(projectId),
            },
          },
        })
        console.log('[AssistantFloat] Synced local doc to DB:', local.title)
      } catch (e) {
        console.warn('[AssistantFloat] Failed to sync local doc to DB:', local.title, e)
      }
    }
  }

  // Step 5: Sync DB -> local (DB docs that don't have a local .md file)
  const localTitles = new Set(scannedLocal.map(f => f.title.toLowerCase()))
  for (const dbDoc of projectDocs.value) {
    if (!localTitles.has(dbDoc.title.toLowerCase())) {
      try {
        const fullDoc = await requestSpaceData('docs', { type: 'documents.fetch', params: { id: dbDoc.id } }) as { content?: string } | undefined
        if (fullDoc?.content) {
          const filename = docTitleToFilename(dbDoc.title)
          const filePath = `${docsPath}/${filename}`
          await docsTauriFs.writeTextFile(filePath, fullDoc.content)
          localDocs.value.push({ title: dbDoc.title, path: filePath, type: dbDoc.type })
          console.log('[AssistantFloat] Synced DB doc to local:', dbDoc.title)
        }
      } catch (e) {
        console.warn('[AssistantFloat] Failed to sync DB doc to local:', dbDoc.title, e)
      }
    }
  }

  // Refresh DB docs list after sync
  try {
    const refreshed = await requestSpaceData('docs', { type: 'documents.fetchProject', params: { projectId } })
    if (Array.isArray(refreshed)) projectDocs.value = refreshed as DocumentListItem[]
  } catch {
    // Already loaded above, ignore refresh failure
  }

  console.log('[AssistantFloat] Doc sync complete: DB=', projectDocs.value.length, 'Local=', localDocs.value.length)
}


// Fetch designs from sync-api for team-shared context
// NOTE: Disabled - sync-api service is not available. Designs now loaded via context service.
async function loadDesignsFromSyncApi(_projectId: string | number) {
  // Skip sync-api fetch - designs are loaded via context service (SQLite)
  void _projectId
}

// Load tasks, designs, and files when project changes
watch(
  () => projectStore.currentProject?.id,
  async (projectId) => {
    if (projectId) {
      // Load tasks via context bus (space-kanban handler)
      if (busTasksCache.value.length === 0) {
        try {
          const tasks = await requestSpaceData('kanban', { type: 'tasks.fetchProject', params: { projectId } })
          if (Array.isArray(tasks)) busTasksCache.value = tasks
        } catch (e) {
          console.warn('[AssistantFloat] Failed to load tasks for autocomplete:', e)
        }
      }

      // Load designs from SQLite (via context service)
      try {
        const result = await sendRequest<{ designs: UIDesign[] }>('designs.list', { projectId })
        const designs = result?.designs || []
        projectDesigns.value = designs

        // Also register them in the canvas context for code generation
        for (const design of designs) {
          registerDesign(design.name, design.nodes as DesignNode[])
        }
        console.log('[AssistantFloat] Loaded', designs.length, 'designs from SQLite')
      } catch (e) {
        console.warn('[AssistantFloat] Failed to load designs:', e)
      }

      // Load designs from sync-api (team cloud) in parallel
      loadDesignsFromSyncApi(projectId)

      // Project members not applicable in personal mode
      projectMembers.value = []

      // Sync documents for ^ autocomplete (bidirectional: DB <-> local docs/)
      try {
        const project = projectStore.currentProject
        await syncProjectDocs(projectId, project?.local_path)
      } catch (e) {
        console.warn('[AssistantFloat] Failed to sync docs:', e)
      }

      // Load project files for ! autocomplete (via context service)
      try {
        const project = projectStore.currentProject
        if (connected.value) {
          const candidateRoots = [
            codeEditorState.rootPath,
            project?.local_path,
            project?.local_path ? `${project.local_path}/code` : undefined,
          ].filter((p): p is string => !!p && p.trim().length > 0)

          let bestRoot: string | null = null
          let bestCount = 0
          const bestFiles: ProjectFile[] = []

          for (const root of candidateRoots) {
            const files = await loadProjectFiles(root)
            if (files.length > bestCount) {
              bestCount = files.length
              bestRoot = root
              bestFiles.splice(0, bestFiles.length, ...files)
            }
          }

          projectFiles.value = bestFiles
          if (bestRoot) {
            console.log('[AssistantFloat] Using file root for autocomplete:', bestRoot, 'files:', bestCount)
          }
        }
      } catch (e) {
        console.warn('[AssistantFloat] Failed to load project files:', e)
      }
    } else {
      projectDesigns.value = []
      syncApiDesigns.value = []
      projectDocs.value = []
      localDocs.value = []
      projectFiles.value = []
      projectMembers.value = []
    }
  },
  { immediate: true }
)

// Load project files recursively (limited depth for performance)
async function loadProjectFiles(rootPath: string, maxDepth = 4): Promise<ProjectFile[]> {
  const files: ProjectFile[] = []

  // Use tool-call API directly; parse ToolResult.content JSON
  try {
    const result = await callTool({
      id: `tool-${Date.now()}`,
      type: 'function',
      function: {
        name: 'get_file_tree',
        arguments: JSON.stringify({
          path: rootPath,
          max_depth: maxDepth,
        }),
      },
    })

    if (result?.is_error) {
      console.debug('[AssistantFloat] get_file_tree error for', rootPath, result.content)
      return []
    }

    const parsed = JSON.parse(result?.content || '{}') as { tree?: unknown; success?: boolean }
    if (parsed?.tree && Array.isArray(parsed.tree)) {
      // Flatten the tree into a file list
      flattenFileTree(parsed.tree as ContextFileTreeEntry[], files)
      console.log('[AssistantFloat] Loaded', files.length, 'files for ! autocomplete from', rootPath)
    }
  } catch (e) {
    console.debug('[AssistantFloat] Could not load file tree from', rootPath, e)
  }

  return files
}

// Flatten nested file tree into flat array
interface ContextFileTreeEntry {
  name: string
  type: string
  path?: string
  children?: ContextFileTreeEntry[]
}

function flattenFileTree(tree: ContextFileTreeEntry[], files: ProjectFile[], parentPath = '') {
  for (const entry of tree) {
    const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

    if (entry.type === 'file') {
      // Only include code files
      const ext = entry.name.split('.').pop()?.toLowerCase()
      const codeExtensions = ['vue', 'ts', 'tsx', 'js', 'jsx', 'go', 'py', 'css', 'scss', 'html', 'json', 'md', 'yaml', 'yml']
      if (ext && codeExtensions.includes(ext)) {
        files.push({
          name: entry.name,
          path: entry.path || fullPath,
          type: 'file'
        })
      }
    } else if (entry.type === 'directory' && entry.children) {
      flattenFileTree(entry.children, files, fullPath)
    }
  }
}

// Sync project files from code editor's file tree (already loaded by FileExplorer)
watch(
  () => codeEditorState.fileTree,
  (tree) => {
    if (tree && tree.length > 0) {
      const files: ProjectFile[] = []
      flattenCodeEditorTree(tree, files)
      projectFiles.value = files
      console.log('[AssistantFloat] Synced', files.length, 'files from code editor tree')
    }
  },
  { immediate: true, deep: true }
)

// If code root path changes (e.g. local folder opens after assistant mounted),
// refresh ! autocomplete files from that root immediately.
watch(
  () => codeEditorState.rootPath,
  async (root) => {
    if (!root || !connected.value) return
    if (projectFiles.value.length > 0) return
    const files = await loadProjectFiles(root)
    if (files.length > 0) {
      projectFiles.value = files
      console.log('[AssistantFloat] Loaded files from code rootPath fallback:', root, files.length)
    }
  },
  { immediate: true }
)

// Flatten code editor's FileEntry tree into ProjectFile[]
function flattenCodeEditorTree(entries: FileTreeEntry[], files: ProjectFile[], maxDepth = 5, depth = 0) {
  if (depth > maxDepth) return
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const ext = entry.name.split('.').pop()?.toLowerCase()
      const codeExtensions = ['vue', 'ts', 'tsx', 'js', 'jsx', 'go', 'py', 'rs', 'dart', 'css', 'scss', 'less', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'sql', 'sh', 'bash', 'zsh', 'swift', 'kt', 'java', 'c', 'cpp', 'h', 'rb', 'php', 'xml', 'svg', 'env', 'gitignore', 'dockerfile']
      if (ext && codeExtensions.includes(ext)) {
        files.push({ name: entry.name, path: entry.path, type: 'file' })
      }
    } else if (entry.children && Array.isArray(entry.children)) {
      flattenCodeEditorTree(entry.children as typeof entries, files, maxDepth, depth + 1)
    }
  }
}

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
    const interval = (isTauri.value && lastIncrementalSaveTs > 0)
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
  const path = route.path
  // Project-scoped: /app/projects/:id/:spaceName
  const projectMatch = path.match(/\/app\/projects\/\d+\/(\w+)/)
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
      return AssistantGeneralSpace
  }
})

// Handle slash commands
async function handleSlashCommand(command: string): Promise<boolean> {
  const parts = command.slice(1).split(' ')
  const cmd = parts[0]?.toLowerCase()
  const args = parts.slice(1).join(' ')

  switch (cmd) {
    case 'agents': {
      // List all available agents
      messages.value.push({ role: 'user', content: command })
      isLoading.value = true

      try {
        const result = await sendRequest<{ agents: AgentInfo[] }>('agents.list')
        const agents = result.agents || []

        let response = '## Available Agents\n\n'

        // Group by category
        const categories: Record<string, AgentInfo[]> = {}
        for (const agent of agents) {
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

        messages.value.push({
          role: 'assistant',
          content: response,
          renderedHtml: renderMarkdown(response)
        })
      } catch (error) {
        messages.value.push({
          role: 'assistant',
          content: `Error fetching agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
          renderedHtml: renderMarkdown(`⚠️ Error fetching agents: ${error instanceof Error ? error.message : 'Unknown error'}`)
        })
      } finally {
        isLoading.value = false
      }
      return true
    }

    case 'agent': {
      // Get details about a specific agent
      if (!args) {
        messages.value.push({ role: 'user', content: command })
        messages.value.push({
          role: 'assistant',
          content: 'Usage: `/agent <id>` - Get details about a specific agent\n\nExample: `/agent code`',
          renderedHtml: renderMarkdown('Usage: `/agent <id>` - Get details about a specific agent\n\nExample: `/agent code`')
        })
        return true
      }

      messages.value.push({ role: 'user', content: command })
      isLoading.value = true

      try {
        const result = await sendRequest<{
          id: string
          name: string
          category: string
          description: string
          systemPrompt: string
          allowedTools?: string[]
          blockedTools?: string[]
          canInvokeAgents?: string[]
          maxIterations: number
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

        messages.value.push({
          role: 'assistant',
          content: response,
          renderedHtml: renderMarkdown(response)
        })
      } catch {
        messages.value.push({
          role: 'assistant',
          content: `Agent not found: ${args}`,
          renderedHtml: renderMarkdown(`⚠️ Agent not found: \`${args}\`\n\nUse \`/agents\` to see available agents.`)
        })
      } finally {
        isLoading.value = false
      }
      return true
    }

    case 'analyze': {
      // Analyze which agent would handle a task
      if (!args) {
        messages.value.push({ role: 'user', content: command })
        messages.value.push({
          role: 'assistant',
          content: 'Usage: `/analyze <text>` - Analyze which agent would handle a task\n\nExample: `/analyze create a login form`',
          renderedHtml: renderMarkdown('Usage: `/analyze <text>` - Analyze which agent would handle a task\n\nExample: `/analyze create a login form`')
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

        messages.value.push({
          role: 'assistant',
          content: response,
          renderedHtml: renderMarkdown(response)
        })
      } catch (error) {
        messages.value.push({
          role: 'assistant',
          content: `Error analyzing intent: ${error instanceof Error ? error.message : 'Unknown error'}`,
          renderedHtml: renderMarkdown(`⚠️ Error analyzing intent: ${error instanceof Error ? error.message : 'Unknown error'}`)
        })
      } finally {
        isLoading.value = false
      }
      return true
    }

    case 'dispatch': {
      // Dispatch a task to a specific agent
      const dispatchParts = args.split(' ')
      const agentId = dispatchParts[0]
      const task = dispatchParts.slice(1).join(' ')

      if (!agentId || !task) {
        messages.value.push({ role: 'user', content: command })
        messages.value.push({
          role: 'assistant',
          content: 'Usage: `/dispatch <agent_id> <task>` - Dispatch a task to a specific agent\n\nExample: `/dispatch code create a function to validate emails`',
          renderedHtml: renderMarkdown('Usage: `/dispatch <agent_id> <task>` - Dispatch a task to a specific agent\n\nExample: `/dispatch code create a function to validate emails`')
        })
        return true
      }

      messages.value.push({ role: 'user', content: command })
      isLoading.value = true

      try {
        const result = await sendRequest<{
          session_id: string
          agent_id: string
          result?: {
            content: string
            toolsUsed?: string[]
            tokensUsed?: number
            duration?: number
          }
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

        messages.value.push({
          role: 'assistant',
          content: response,
          renderedHtml: renderMarkdown(response)
        })
      } catch (error) {
        messages.value.push({
          role: 'assistant',
          content: `Error dispatching task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          renderedHtml: renderMarkdown(`⚠️ Error dispatching task: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      messages.value.push({
        role: 'assistant',
        content: response,
        renderedHtml: renderMarkdown(response)
      })
      return true
    }

    default:
      return false
  }
}

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
          ? buildMessageWithToolContext(m)
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

    // Stream chat response with space context and local data for smart routing
    await chatStream({
      model: chatModel,
      messages: chatMessages,
      token: chatToken,
      agent_id: agentId,
      space: spaceContext,
      local_data: { ...buildLocalData(), ...localDataPatch }, // Include project context and route-specific assistant context
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

// Compact messages for LLM context — prune old tool results, keep UI data intact.
// Only prunes assistant toolCall results older than PROTECT_LAST_TURNS.
// User messages and assistant text content are never pruned.
function compactForLLM(msgs: ChatMessage[]): ChatMessage[] {
  const PROTECT_LAST_TURNS = 3

  // Count actual turns (user message = 1 turn) from the end to find the protection boundary
  // A turn = user message + its assistant response. We protect the last N turns.
  let turnCount = 0
  let protectFromIndex = 0 // default: protect everything (if fewer turns than threshold)
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg?.role === 'user') {
      turnCount++
      if (turnCount >= PROTECT_LAST_TURNS) {
        protectFromIndex = i // protect from this user message onward
        break
      }
    }
  }

  return msgs.map((msg, i) => {
    // Protect recent turns, user messages, and messages without tool calls
    if (i >= protectFromIndex) return msg
    if (msg.role !== 'assistant' || !msg.toolCalls?.length) return msg

    return {
      ...msg,
      toolCalls: msg.toolCalls.map(tc => ({
        ...tc,
        result: tc.result
          ? `[Previous ${tc.name} result — call tool again if needed]`
          : tc.result
      }))
    }
  })
}

// Build assistant message content enriched with tool call context for conversation history.
// This ensures follow-up messages know what tools were called and what was created/modified.
function buildMessageWithToolContext(msg: ChatMessage): string {
  let content = msg.content || ''
  if (!msg.toolCalls?.length) return content

  const toolSummaries: string[] = []
  for (const tc of msg.toolCalls) {
    // Parse tool result for key details
    let summary = `- Called ${tc.name}`
    try {
      const args = tc.arguments as Record<string, unknown>
      const result = tc.result ? JSON.parse(tc.result) : null

      if (tc.name === 'create_ui_screen' && result?.screen) {
        const s = result.screen as Record<string, unknown>
        summary = `- Created screen "${s.name}" (${result.elements?.length || 0} elements, ${s.width}x${s.height})`
      } else if (tc.name === 'create_design_element' && result?.element) {
        const el = result.element as Record<string, unknown>
        summary = `- Created element "${el.name || el.type}" (type: ${el.type}, ${el.x},${el.y} ${el.width}x${el.height})`
        if (el.style) summary += ` style: ${JSON.stringify(el.style)}`
      } else if (tc.name === 'update_design_element' && result?.element) {
        const el = result.element as Record<string, unknown>
        summary = `- Updated element "${el.name || el.type}" (id: ${args.element_id || el.id})`
      } else if (tc.name === 'write_file') {
        summary = `- Wrote file: ${args.path}`
      } else if (tc.name === 'create_task' && result?.task) {
        const t = result.task as Record<string, unknown>
        summary = `- Created task: "${t.title}" (id: ${t.id})`
      } else if (tc.name === 'git_commit') {
        summary = `- Committed: "${args.message}"`
      } else if (tc.name === 'git_push') {
        summary = `- Pushed to ${args.remote || 'origin'}${args.branch ? '/' + args.branch : ''}`
      } else if (tc.name === 'git_pull') {
        summary = `- Pulled from ${args.remote || 'origin'}${args.branch ? '/' + args.branch : ''}`
      } else if (tc.name === 'git_checkout') {
        summary = `- Switched to branch: ${args.branch}`
      } else if (tc.name === 'git_create_branch') {
        summary = `- Created branch: ${args.branch_name}`
      } else if (tc.name === 'git_stage') {
        summary = `- Staged files`
      } else if (tc.name === 'git_unstage') {
        summary = `- Unstaged files`
      } else if (tc.name === 'sync_document') {
        summary = `- Created/updated document: "${args.title || 'Untitled'}"`
        // Refresh docs list so sidebar updates
        const syncProjectId = (args.project_id as number) || projectStore.currentProject?.id
        if (syncProjectId) {
          requestSpaceData('docs', { type: 'documents.fetchProject', params: { projectId: syncProjectId } }).then((docs) => {
            if (Array.isArray(docs)) projectDocs.value = docs as DocumentListItem[]
          }).catch(() => { /* ignore refresh failure */ })
        }
      } else if (tc.name === 'list_project_documents' || tc.name === 'list_project_designs' || tc.name === 'list_project_tasks') {
        summary = `- Listed ${tc.name.replace('list_project_', '')}`
      } else {
        // Generic: include args summary
        const argKeys = Object.keys(args)
        if (argKeys.length > 0) {
          summary += `(${argKeys.map(k => `${k}: ${JSON.stringify(args[k])}`).join(', ').substring(0, 200)})`
        }
      }
    } catch {
      // Keep basic summary
    }
    toolSummaries.push(summary)
  }

  if (toolSummaries.length > 0) {
    content += `\n\n[Actions performed:\n${toolSummaries.join('\n')}\n]`
  }

  return content
}

// Build system prompt with context information
function buildSystemPrompt(references?: ParsedReferences, docContents?: string): string {
  // This function provides LIVE CONTEXT only — behavioral rules come from Go agent .md files.
  // Context includes: project info, team members, space state (git/docs), and referenced content.
  const parts: string[] = []

  // Resolve current space once for reuse below
  const space = currentSpace.value?.toLowerCase()

  // Add project context from store
  const project = projectStore.currentProject
  if (project) {
    parts.push(`\n\n## Current Project Context`)
    parts.push(`- Project: "${project.name}"`)
    if (project.description) {
      parts.push(`- Description: ${project.description}`)
    }
    if (project.spaces && project.spaces.length > 0) {
      parts.push(`- Enabled spaces: ${project.spaces.join(', ')}`)
    }
    // Owner not available in personal/local mode (LocalProject has no owner field)

    // Add project team members
    if (projectMembers.value.length > 0) {
      parts.push(`\n## Project Team Members`)
      parts.push(`When user mentions a person by name (e.g. "assign to Gresa"), match against this list and use their member_id.`)
      for (const member of projectMembers.value) {
        let memberLine = `- **${member.name}** (id: ${member.id})`
        if (member.position) memberLine += ` — ${member.position}`
        if (member.role && member.role !== 'read') memberLine += ` [${member.role}]`
        if (member.email) memberLine += ` <${member.email}>`
        parts.push(memberLine)
      }
      parts.push(`\nUse member id as assignee_id when creating/updating tasks. Use list_project_members or search_users tools for fresh data if needed.`)
    }
  }

  // Add route-based context (which space/page the user is in)
  const path = route.path
  const routeContext = getRouteContext(path)
  if (routeContext) {
    parts.push(`\n\n## Current Location`)
    parts.push(routeContext)
  }

  // Extract current space from route
  const spaceMatch = path.match(/\/app\/projects\/\d+\/(\w+)/)
  if (spaceMatch && spaceMatch[1]) {
    const currentSpace = spaceMatch[1]
    parts.push(`\nUser is currently in the "${currentSpace}" space.`)
  }

  // Add component context if available
  if (currentComponent.value) {
    parts.push(`\n\n## Active Component`)
    parts.push(`Currently working on component: ${currentComponent.value.name} (${currentComponent.value.type}).`)
  }

  // Add Git space context — live state not available to Go backend via DB, so inject here
  if (space === 'git') {
    const gitRepo = useGitRepo()
    const repoPath = gitRepo.state.currentRepoPath
    const currentBranch = gitRepo.state.currentBranch
    const staged = gitRepo.state.stagedChanges
    const unstaged = gitRepo.state.unstagedChanges
    const untracked = gitRepo.state.untrackedFiles
    const conflicted = gitRepo.state.conflictedFiles
    const currentRepo = gitRepo.currentRepo.value

    if (repoPath) {
      let gitContext = `\n\n## Current Git Repository

**Repo:** ${currentRepo?.name || repoPath.split('/').pop() || 'unknown'}
**Path:** ${repoPath}
**Branch:** ${currentBranch || '(unknown)'}
**Status:** ${currentRepo?.status || 'unknown'}`

      if (currentRepo?.remoteUrl) {
        gitContext += `\n**Remote:** ${currentRepo.remoteUrl}`
      }
      if (currentRepo?.hasUpstream) {
        if ((currentRepo.ahead ?? 0) > 0 || (currentRepo.behind ?? 0) > 0) {
          gitContext += `\n**Sync:** ${currentRepo.ahead ?? 0} ahead, ${currentRepo.behind ?? 0} behind`
        }
      } else {
        gitContext += `\n**Upstream:** not set (use set_upstream when pushing)`
      }

      // Show working tree summary
      const changesSummary: string[] = []
      if (staged.length > 0) changesSummary.push(`${staged.length} staged`)
      if (unstaged.length > 0) changesSummary.push(`${unstaged.length} modified`)
      if (untracked.length > 0) changesSummary.push(`${untracked.length} untracked`)
      if (conflicted.length > 0) changesSummary.push(`${conflicted.length} conflicted`)

      if (changesSummary.length > 0) {
        gitContext += `\n**Changes:** ${changesSummary.join(', ')}`
      } else {
        gitContext += `\n**Changes:** clean working tree`
      }

      // List changed files (up to 30)
      if (staged.length > 0 || unstaged.length > 0 || untracked.length > 0) {
        gitContext += `\n\n### Changed Files`
        const allFiles: string[] = []
        for (const f of staged) allFiles.push(`  [staged] ${f.path}`)
        for (const f of unstaged) allFiles.push(`  [modified] ${f.path}`)
        for (const f of untracked.slice(0, 15)) allFiles.push(`  [untracked] ${f}`)
        if (untracked.length > 15) allFiles.push(`  ... and ${untracked.length - 15} more untracked`)
        if (conflicted.length > 0) {
          for (const f of conflicted) allFiles.push(`  [CONFLICT] ${f}`)
        }
        gitContext += '\n' + allFiles.slice(0, 30).join('\n')
        if (allFiles.length > 30) gitContext += `\n  ... and ${allFiles.length - 30} more files`
      }

      // Recent commits (from loaded history, up to 5)
      if (gitRepo.state.commits.length > 0) {
        gitContext += `\n\n### Recent Commits`
        for (const c of gitRepo.state.commits.slice(0, 5)) {
          gitContext += `\n- \`${c.shortHash}\` ${c.subject} (${c.author})`
        }
      }

      gitContext += `\n\n### Git Tools
All git tools require \`repo_path\`: use **${repoPath}**

**git_status** - Get current status (staged, unstaged, untracked)
**git_stage** / **git_unstage** - Stage or unstage files
**git_discard** - Discard working directory changes (destructive!)
**git_commit** - Create a commit with staged changes
**git_log** - View commit history
**git_diff** - View diffs (unstaged, staged, or for a specific commit)
**git_branches** - List all branches
**git_checkout** - Switch branches
**git_create_branch** / **git_delete_branch** - Manage branches
**git_fetch** / **git_pull** / **git_push** - Remote operations
**git_ignore** - Add patterns to .gitignore

When the user says "commit", "push", "pull", etc. without specifying a repo path, always use: ${repoPath}`

      parts.push(gitContext)
    } else {
      parts.push(`\n\n## Git Space
No repository is currently selected. The user needs to select a repository first.
Once a repo is selected, you will have access to its status, branches, and change details.`)
    }
  }

  // Add Docs/Notes space context — inject currently open document (live data, not in DB context)
  if (space === 'notes' || space === 'docs') {
    const openDoc = busCurrentDoc.value
    if (openDoc) {
      const contentPreview = openDoc.content && openDoc.content.length > 4000
        ? openDoc.content.substring(0, 4000) + '\n\n... (truncated)'
        : openDoc.content || '(empty)'
      parts.push(`\n\n## Currently Open Document
**Title:** ${openDoc.title}
**Type:** ${openDoc.type}
**ID:** ${openDoc.id}

When the user says "this document", "the doc", or asks to edit/update/improve without specifying a title, they mean this document.
To update it, use \`sync_document\` with the same title and project_id.

### Current Content
\`\`\`markdown
${contentPreview}
\`\`\``)
    }
  }

  // Add available project documents list
  if (projectStore.currentProject) {
    const allDocTitles: string[] = []
    for (const d of projectDocs.value) {
      allDocTitles.push(`${d.title} (${d.type})`)
    }
    for (const d of localDocs.value) {
      if (!projectDocs.value.some(pd => pd.title.toLowerCase() === d.title.toLowerCase())) {
        allDocTitles.push(`${d.title} (${d.type}, local)`)
      }
    }
    if (allDocTitles.length > 0) {
      parts.push(`\n\n## Available Project Documents
${allDocTitles.map(t => `- ${t}`).join('\n')}

To include document content, user can reference with ^DocTitle. To list or fetch via tools, use list_project_documents or get_document.`)
    }
  }

  // Add general cross-space reference syntax
  if (projectStore.currentProject) {
    parts.push(`\n\n## Cross-Space References
Users can reference items from other spaces within the same project:
- **@DesignName** - Reference a UI design screen (includes full design JSON)
- **@DesignName/Page** - Reference a specific page/variant within a design
- **^DocTitle** - Reference a project document (PRD, README, architecture, etc.)
- **#123** - Reference a task by ID (for task operations)
- **~ComponentName** - Reference a code component
- **$path/to/file** - Reference a source file by explicit path
- **!filename** - Fuzzy file search (like VS Code CMD+P) - finds files matching the name

Examples:
- "@LoginScreen" - Include the LoginScreen design data for code generation
- "@Hydrate/Product Page" - Include specific page variant data
- "^PRD" - Include the PRD document content for context
- "^Architecture" - Include the architecture document
- "#42" - Reference task 42 for updates
- "!login.vue" - Find and reference login.vue file in the project
- "!UserService" - Find files containing "UserService" in their name

When you see these references, the referenced content will be included in context.`)
  }

  // Add referenced items from @mentions in user message
  if (references) {
    // Add design references - from both canvas context AND IndexedDB
    if (references.designs.length > 0) {
      // First, add canvas context (for currently open designs)
      const designsContext = getReferencedDesignsContext(references.designs)
      if (designsContext) {
        parts.push(designsContext)
      }

      // Then, add fresh design data from IndexedDB (local cache)
      const indexedDBContext = getDesignDataForAI(references.designs, projectDesigns.value)
      if (indexedDBContext) {
        parts.push(indexedDBContext)
      }

      // Also include designs from sync-api (team cloud - authoritative source)
      const syncApiContext = getDesignDataForAI(references.designs, syncApiDesigns.value)
      if (syncApiContext && syncApiContext !== indexedDBContext) {
        parts.push('\n## Team Shared Design Data (sync-api)')
        parts.push(syncApiContext)
      }

      parts.push(`\nUse this design data to generate Vue/React/HTML components that match the visual layout.
The JSON data above contains the exact positions, sizes, colors, and properties of each element.
Generate code that recreates this layout using appropriate frontend components.`)
    }

    // Add doc references (content pre-fetched and passed via docContents param)
    if (references.docs.length > 0 && docContents) {
      parts.push(docContents)
    }

    // Add component references
    if (references.components.length > 0) {
      parts.push(getReferencedComponentsContext(references.components))
    }

    // Add explicit file path references ($path)
    if (references.files.length > 0) {
      parts.push(getReferencedFilesContext(references.files))
    }

    // Add code file references (!filename) with fuzzy matching
    if (references.codeFiles.length > 0) {
      parts.push(getReferencedCodeFilesContext(references.codeFiles, projectFiles.value))
    }
  }

  return parts.join('\n')
}

// Get context description based on current route
function getRouteContext(path: string): string | null {
  // Project-specific pages
  if (path.match(/\/app\/projects\/(\d+)\/code/)) {
    return 'The user is in the Code Editor for a project. Help with coding, debugging, file management, and implementation questions.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/design/)) {
    return 'The user is in the Design Studio for a project. Help with UI/UX design, styling, component layouts, and visual design questions.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/git/)) {
    return 'The user is viewing Git/version control for a project. Help with commits, branches, merging, pull requests, and version control workflows.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/ai/)) {
    return 'The user is in the AI Space for a project. Help with AI features, prompts, model configuration, and AI-assisted development.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/notes/)) {
    return 'The user is in the Notes/Documentation section for a project. Help with documentation, markdown, README files, and technical writing.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/kanban/)) {
    return 'The user is viewing the Kanban board for a project. Help with task management, sprint planning, workflow organization, and project tracking.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/deploy/)) {
    return 'The user is in the Deployment section for a project. Help with deployment configuration, CI/CD, hosting, and production releases.'
  }
  if (path.match(/\/app\/projects\/(\d+)\/settings/)) {
    return 'The user is in Project Settings. Help with project configuration, environment variables, integrations, and project management.'
  }
  if (path.match(/\/app\/projects\/(\d+)/)) {
    return 'The user is viewing a Project overview. Help with project information, recent activity, and project navigation.'
  }

  // Settings pages
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

  // User management
  if (path.includes('/app/users')) {
    return 'The user is in User Management. Help with user accounts, permissions, roles, and team management.'
  }

  // Media library
  if (path.includes('/app/media')) {
    return 'The user is in the Media Library. Help with file uploads, asset management, and media organization.'
  }

  // Reports
  if (path.includes('/app/reports')) {
    return 'The user is viewing Reports. Help with analytics, metrics, data visualization, and report generation.'
  }

  // Company settings
  if (path.includes('/app/company')) {
    return 'The user is viewing Company Settings. Help with organization configuration, branding, and company-wide settings.'
  }

  // Dashboard
  if (path === '/app' || path === '/app/') {
    return 'The user is on the Dashboard. Help with project overview, navigation, and getting started with Construct.'
  }

  return null
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
    // localStorage fallback - remove from stored cache
    const obj: Record<string, ChatMessage[]> = {}
    conversationCache.forEach((v, k) => { obj[k] = v })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (e) {
      console.warn('[AssistantFloat] Failed to update conversation cache:', e)
    }
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
          ? buildMessageWithToolContext(m)
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
  <Teleport :to="dockTargetEl || 'body'" :disabled="!isDocked">
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    :enter-from-class="isDocked ? 'opacity-0' : 'opacity-0 scale-95'"
    :enter-to-class="isDocked ? 'opacity-100' : 'opacity-100 scale-100'"
    leave-active-class="transition-all duration-200 ease-in"
    :leave-from-class="isDocked ? 'opacity-100' : 'opacity-100 scale-100'"
    :leave-to-class="isDocked ? 'opacity-0' : 'opacity-0 scale-95'">
    <div
      v-if="isOpen"
      ref="panelRef"
      :class="[
        panelPositionClasses,
        isDocked ? 'bg-app flex flex-col' : 'z-50 bg-app rounded-2xl shadow-2xl border flex flex-col',
        isDraggingPanel || isResizing ? 'select-none' : 'transition-colors',
        !isDocked && isDragging ? 'border-2 border-dashed border-(--app-accent)' : !isDocked ? 'border-gray-200/50 dark:border-gray-800/50' : ''
      ]"
      :style="panelStyle"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop">
      <!-- Header (drag handle) -->
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 shrink-0 cursor-grab active:cursor-grabbing"
        @mousedown="startPanelDrag"
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
          <!-- Project | Space context -->
          <span v-if="projectStore.currentProject" class="text-xs text-app-muted">
            {{ projectStore.currentProject.name }}<template v-if="currentSpace"> | {{ currentSpace }}</template>
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
          <!-- Dock menu (three dots) -->
          <div class="relative">
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
              </div>
            </Transition>
          </div>
          <button
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
        v-if="!isDocked"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
        @mousedown="startResize($event, 'corner')"
      >
        <svg class="w-3 h-3 text-app-muted/40 absolute bottom-1 right-1" viewBox="0 0 6 6"><circle cx="5" cy="1" r="0.8" fill="currentColor" /><circle cx="1" cy="5" r="0.8" fill="currentColor" /><circle cx="5" cy="5" r="0.8" fill="currentColor" /><circle cx="3" cy="5" r="0.8" fill="currentColor" /><circle cx="5" cy="3" r="0.8" fill="currentColor" /></svg>
      </div>
      <div
        v-if="!isDocked"
        class="absolute bottom-0 left-4 right-4 h-1.5 cursor-s-resize"
        @mousedown="startResize($event, 'bottom')"
      />
      <div
        v-if="!isDocked"
        class="absolute top-4 bottom-4 right-0 w-1.5 cursor-e-resize"
        @mousedown="startResize($event, 'right')"
      />
    </div>
  </Transition>
  </Teleport>
</template>
