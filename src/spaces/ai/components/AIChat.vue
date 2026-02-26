<script setup lang="ts">
/**
 * AIChat - Main AI workspace chat with streaming, tool-call visibility,
 * multimodal input (text + images), and persisted conversations.
 */
import type { ChatMessage, ChatMessageContent, ContextStreamChunk, RichChatMessage, ToolCall } from '~/composables/useContextService'
import type { InvitedModel } from '~/composables/useRoundRobin'
import { useRoundRobin } from '~/composables/useRoundRobin'
import type { DocumentListItem } from '~/stores/documents'

export interface AIChatProps {
  scope?: 'company' | 'project'
  projectId?: string
  conversationId?: string | null
}

const props = withDefaults(defineProps<AIChatProps>(), {
  scope: 'project',
  projectId: undefined,
  conversationId: null,
})

const emit = defineEmits<{
  (e: 'message-sent' | 'conversation-created' | 'title-updated', value: string): void
}>()

// Services
const contextService = useContextService()
const contextDB = useContextDB()
const authStore = useAuthStore()
const projectStore = useProjectStore()
const documentsStore = useDocumentsStore()
const toast = useToast()
const { renderStreamingMarkdown } = useMarkdown()
const { defaultModelId, currentModel, resolveModelId, isVisionModel } = useAIModel()

// Chat state
interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  contentParts?: ChatMessageContent
  attachments?: ImageAttachment[]
  renderedHtml?: string
  timestamp: Date
  toolCalls?: ToolCall[]
  toolCallsExpanded?: boolean
  route?: { tier?: string; model?: string; reason?: string }
  error?: string
  // Roundtable model metadata
  modelId?: string
  modelLabel?: string
  providerId?: string
  providerLabel?: string
}

const messages = ref<DisplayMessage[]>([])
const inputMessage = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingAttachments = ref<ImageAttachment[]>([])
const isDragOver = ref(false)
const isStreaming = ref(false)
let streamAbortController: AbortController | null = null
const streamingContent = ref('')
const streamingHtml = ref('')
const chatContainerRef = ref<HTMLElement | null>(null)
const inputRef = ref<{ textarea?: HTMLTextAreaElement } | null>(null)
const currentConversationId = ref<string | null>(null)
const conversationTitle = ref('New Conversation')
const showSystemPrompt = ref(false)
const systemPrompt = ref('')
const errorMessage = ref<string | null>(null)
const conversationModel = ref<string>(resolveModelId(defaultModelId.value, {
  allowAuto: true,
  fallbackModelId: 'auto',
  persist: true,
}))
const MAX_ATTACHMENTS = 6
const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024

// Round-robin state
const chatMode = ref<'single' | 'roundrobin'>('single')
const roundRobin = useRoundRobin()
const streamingModelLabel = ref('')
const isRoundtable = computed(() => chatMode.value === 'roundrobin')

// Filter agent/tool debug noise from streamed content.
// Backend sends internal status lines as regular content chunks.
const AGENT_DEBUG_PATTERNS = [
  /^\s*\[.+?\]\s/,                    // [Chat Agent] ..., [Design Agent] ..., [Explorer Agent] ...
  /^\s*Running:\s/,                    // Running: Web Search
  /^\s*🔧/,                            // 🔧 Calling tool:
  /^\s*🎨/,                            // 🎨 Design request detected
  /^\s*Dispatch/,                      // Dispatch To Agent
  /^\s*\{"name":/,                     // {"name":"web_search","arguments":...}
  /^\s*\{"tool":/,                     // {"tool":"web_search","error":...}
  /^\s*No provider supports/,         // No provider supports web search
  /^\s*→\s*(using|routing)/i,          // → using Design Agent
  /^\s*\d+ tools?,\s*\d+ max/,        // 17 tools, 25 max iterations
]

function filterAgentDebug(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return true // keep blank lines
      return !AGENT_DEBUG_PATTERNS.some(re => re.test(line))
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildLocalData(references?: ParsedReferences): Record<string, unknown> {
  const localData: Record<string, unknown> = {}
  const projectIdNum = Number(props.projectId)
  if (Number.isFinite(projectIdNum) && projectIdNum > 0) {
    localData.project_id = projectIdNum
  }
  if (projectStore.currentProject?.name) {
    localData.project_name = projectStore.currentProject.name
  }
  if (references) {
    localData.references = {
      designs: references.designs.map(ref => ref.raw),
      docs: references.docs.map(ref => ref.title),
      tasks: references.tasks,
      components: references.components,
      files: references.files,
      code_files: references.codeFiles.map(ref => ref.filename),
    }
  }
  return localData
}

interface DesignReference {
  design: string
  variant?: string
  raw: string
}

interface FileReference {
  filename: string
  raw: string
}

interface DocReference {
  title: string
  raw: string
}

interface ParsedReferences {
  designs: DesignReference[]
  docs: DocReference[]
  tasks: string[]
  components: string[]
  files: string[]
  codeFiles: FileReference[]
}

const projectDocs = ref<DocumentListItem[]>([])
const loadedDocsProjectId = ref<number | null>(null)

function getActiveProjectId(): number | null {
  const storeProjectId = projectStore.currentProject?.id
  if (storeProjectId) return Number(storeProjectId)
  const propProjectId = Number(props.projectId)
  return Number.isFinite(propProjectId) && propProjectId > 0 ? propProjectId : null
}

async function ensureProjectDocsLoaded(): Promise<void> {
  const projectId = getActiveProjectId()
  if (!projectId || loadedDocsProjectId.value === projectId) return

  try {
    await documentsStore.fetchProjectDocuments(projectId)
    projectDocs.value = documentsStore.documents
    loadedDocsProjectId.value = projectId
  } catch (error) {
    console.warn('[AIChat] Failed to load project docs for references:', error)
    projectDocs.value = []
    loadedDocsProjectId.value = projectId
  }
}

watch(() => [projectStore.currentProject?.id, props.projectId], async () => {
  projectDocs.value = []
  loadedDocsProjectId.value = null
  if (getActiveProjectId()) {
    await ensureProjectDocsLoaded()
  }
}, { immediate: true })

function parseReferences(text: string): ParsedReferences {
  const designMatches = [...text.matchAll(/@([\w][\w\s-]*(?:\/[\w\s-]+)?)(?=\s+(?:make|create|build|convert|redesign|update|change|adapt|plus)\b|\s*[,.|!?]|\s+[^/\w]|$)/gi)]
  const designs: DesignReference[] = designMatches.map(m => {
    const raw = m[1]?.trim() || ''
    const parts = raw.split('/')
    return {
      design: parts[0]?.trim() || '',
      variant: parts[1]?.trim(),
      raw,
    }
  })

  const tasks = [...text.matchAll(/#(\d+)/g)].map(m => m[1]).filter((v): v is string => !!v)
  const components = [...text.matchAll(/~([\w-]+)/g)].map(m => m[1]).filter((v): v is string => !!v)
  const files = [...text.matchAll(/\$([\w./-]+)/g)].map(m => m[1]).filter((v): v is string => !!v)

  const codeFileMatches = [...text.matchAll(/!([\w.-]+(?:\/[\w.-]+)*)/g)]
  const codeFiles: FileReference[] = codeFileMatches.map(m => ({
    filename: m[1] || '',
    raw: m[0] || '',
  }))

  const docMatches = [...text.matchAll(/\^([\w][\w\s-]*?)(?=\s*[,.|!?]|\s+[^\w]|$)/g)]
  const docs: DocReference[] = docMatches.map(m => ({
    title: m[1]?.trim() || '',
    raw: m[1]?.trim() || '',
  }))

  return { designs, docs, tasks, components, files, codeFiles }
}

function getReferencedDesignsContext(refs: DesignReference[]): string {
  if (refs.length === 0) return ''

  const sections: string[] = ['## Referenced Designs']
  for (const ref of refs) {
    const context = getDesignForCodeGeneration(ref.raw)
    const header = ref.variant ? `${ref.design} / ${ref.variant}` : ref.design
    sections.push(`### ${header}\n${context}`)
  }

  return sections.join('\n\n')
}

async function getReferencedDocsContext(refs: DocReference[]): Promise<string> {
  if (refs.length === 0) return ''

  await ensureProjectDocsLoaded()
  if (projectDocs.value.length === 0) {
    return '## Referenced Documents\nNo project documents are currently available.'
  }

  const sections: string[] = ['## Referenced Documents']
  const consumedDocIds = new Set<number>()

  for (const ref of refs) {
    const query = ref.title.trim().toLowerCase()
    if (!query) continue

    const doc = projectDocs.value.find(item => {
      if (consumedDocIds.has(item.id)) return false
      return item.title.toLowerCase().includes(query)
    })

    if (!doc) {
      sections.push(`### ${ref.title}\nNo matching document found in this project.`)
      continue
    }

    consumedDocIds.add(doc.id)
    try {
      const fullDoc = await documentsStore.fetchDocument(doc.id)
      const rawContent = fullDoc?.content || ''
      const content = rawContent.length > 4000
        ? `${rawContent.slice(0, 4000)}\n\n... [truncated]`
        : rawContent
      sections.push(`### ${doc.title} (${doc.type})\n${content || '[Document content is empty]'}`)
    } catch {
      sections.push(`### ${doc.title} (${doc.type})\n[Failed to fetch content. Use get_document with document_id=${doc.id}]`)
    }
  }

  return sections.join('\n\n')
}

function getReferencedComponentsContext(components: string[]): string {
  if (components.length === 0) return ''
  return `## Referenced Components\nComponents referenced: ${components.map(c => `~${c}`).join(', ')}`
}

function getReferencedFilesContext(files: string[]): string {
  if (files.length === 0) return ''
  return `## Referenced Files\nExplicit file paths: ${files.map(f => `$${f}`).join(', ')}`
}

function getReferencedCodeFilesContext(refs: FileReference[]): string {
  if (refs.length === 0) return ''
  return `## Referenced Code Files\nFuzzy file queries: ${refs.map(ref => `!${ref.filename}`).join(', ')}`
}

function buildReferenceSystemPrompt(references: ParsedReferences, docContents?: string): string {
  const hasReferences = references.designs.length > 0
    || references.docs.length > 0
    || references.tasks.length > 0
    || references.components.length > 0
    || references.files.length > 0
    || references.codeFiles.length > 0

  if (!hasReferences) return ''

  const parts: string[] = ['## Cross-Space Reference Context']
  const project = projectStore.currentProject
  if (project) {
    parts.push(`Project: ${project.name} (ID: ${project.id})`)
  }

  const availableDesigns = listAvailableDesigns()
  if (availableDesigns.length > 0) {
    parts.push(`Available design references: ${availableDesigns.map(d => `@${d}`).join(', ')}`)
  }

  if (references.designs.length > 0) {
    parts.push(getReferencedDesignsContext(references.designs))
  }
  if (references.docs.length > 0) {
    parts.push(docContents || '## Referenced Documents\nNo document content could be resolved.')
  }
  if (references.tasks.length > 0) {
    parts.push(`## Referenced Tasks\nTask IDs: ${references.tasks.map(id => `#${id}`).join(', ')}`)
  }
  if (references.components.length > 0) {
    parts.push(getReferencedComponentsContext(references.components))
  }
  if (references.files.length > 0) {
    parts.push(getReferencedFilesContext(references.files))
  }
  if (references.codeFiles.length > 0) {
    parts.push(getReferencedCodeFilesContext(references.codeFiles))
  }

  parts.push('When references are provided, prioritize those artifacts over generic assumptions.')
  return parts.join('\n\n')
}

interface ImageAttachment {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
}

const canSend = computed(() => {
  if (isStreaming.value) return true
  const hasContent = inputMessage.value.trim().length > 0 || pendingAttachments.value.length > 0
  if (chatMode.value === 'roundrobin') {
    return hasContent && roundRobin.invitedModels.value.length >= 2
  }
  return hasContent
})

function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function hasContentPayload(content: ChatMessageContent): boolean {
  if (typeof content === 'string') return content.trim().length > 0
  return content.some((part) => {
    if (part.type === 'text') return !!part.text?.trim()
    if (part.type === 'image_url') return !!part.image_url?.url
    return false
  })
}

function extractTextFromContent(content: ChatMessageContent): string {
  if (typeof content === 'string') return content
  return content
    .filter(part => part.type === 'text')
    .map(part => part.text || '')
    .join('\n')
    .trim()
}

function extractAttachmentsFromContent(content: ChatMessageContent): ImageAttachment[] {
  if (typeof content === 'string') return []

  let counter = 0
  return content
    .filter(part => part.type === 'image_url' && !!part.image_url?.url)
    .map((part) => {
      counter += 1
      const url = part.image_url?.url || ''
      const mimeType = url.match(/^data:([^;]+);base64,/)?.[1] || 'image/*'
      return {
        id: createAttachmentId(),
        name: `Image ${counter}`,
        url,
        mimeType,
        size: 0,
      }
    })
}

function buildUserPayload(text: string, attachments: ImageAttachment[]): ChatMessageContent {
  if (attachments.length === 0) return text.trim()

  const parts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = []
  for (const attachment of attachments) {
    parts.push({ type: 'image_url', image_url: { url: attachment.url } })
  }
  if (text.trim()) {
    parts.push({ type: 'text', text: text.trim() })
  }
  return parts
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function addImageFiles(files: File[]) {
  if (files.length === 0) return

  const slotsLeft = Math.max(0, MAX_ATTACHMENTS - pendingAttachments.value.length)
  if (slotsLeft === 0) {
    toast.add({ title: 'Limit reached', description: `Maximum ${MAX_ATTACHMENTS} images per message`, color: 'warning' })
    return
  }

  const accepted = files
    .filter(file => file.type.startsWith('image/'))
    .slice(0, slotsLeft)

  if (accepted.length === 0) {
    toast.add({ title: 'No images found', description: 'Only image files are supported', color: 'warning' })
    return
  }

  for (const file of accepted) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.add({
        title: 'Image too large',
        description: `${file.name} is larger than 12MB`,
        color: 'warning',
      })
      continue
    }

    try {
      const url = await readFileAsDataUrl(file)
      pendingAttachments.value.push({
        id: createAttachmentId(),
        name: file.name,
        url,
        mimeType: file.type,
        size: file.size,
      })
    } catch (error) {
      toast.add({
        title: 'Failed to attach image',
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'error',
      })
    }
  }
}

function removePendingAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== id)
}

function clearPendingAttachments() {
  pendingAttachments.value = []
}

function openImagePicker() {
  fileInputRef.value?.click()
}

async function handleFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  await addImageFiles(files)
  target.value = ''
}

async function handlePaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items || [])
  const imageFiles = items
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => !!file)

  if (imageFiles.length > 0) {
    event.preventDefault()
    await addImageFiles(imageFiles)
  }
}

function handleDragOver() {
  if (isStreaming.value) return
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  await addImageFiles(files)
}

// Scroll to bottom
function scrollToBottom() {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })
watch(streamingContent, scrollToBottom)

// Load conversation
async function loadConversation(id: string) {
  try {
    const conv = await contextDB.conversationGet(id)
    if (!conv) return

    currentConversationId.value = id
    conversationTitle.value = conv.name
    conversationModel.value = resolveModelId(conv.model || defaultModelId.value, {
      allowAuto: true,
      fallbackModelId: 'auto',
      persist: false,
    })
    messages.value = []
    inputMessage.value = ''
    clearPendingAttachments()
    errorMessage.value = null

    // Restore roundtable mode
    chatMode.value = conv.mode === 'roundrobin' ? 'roundrobin' : 'single'
    if (conv.mode === 'roundrobin' && conv.invited_models) {
      try {
        const models = JSON.parse(conv.invited_models) as InvitedModel[]
        roundRobin.reset()
        for (const m of models) roundRobin.inviteModel(m)
      } catch { /* invalid JSON, keep empty */ }
    }

    if (conv.messages_json) {
      try {
        const parsed = JSON.parse(conv.messages_json) as RichChatMessage[]
        messages.value = parsed.map((msg, i) => ({
          id: `loaded-${i}`,
          role: msg.role,
          content: extractTextFromContent(msg.content),
          contentParts: msg.content,
          attachments: extractAttachmentsFromContent(msg.content),
          renderedHtml: extractTextFromContent(msg.content)
            ? renderStreamingMarkdown(extractTextFromContent(msg.content))
            : '',
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          modelId: msg.model_id,
          modelLabel: msg.model_label,
          providerId: msg.provider_id,
          providerLabel: msg.provider_label,
        }))
      } catch {
        // Invalid JSON, start fresh
      }
    }
  } catch (err) {
    console.error('[AIChat] Failed to load conversation:', err)
  }
}

// Watch for conversation prop changes
watch(() => props.conversationId, (id) => {
  if (id) {
    loadConversation(id)
    return
  }
  clearMessages()
}, { immediate: true })

const conversationContextKey = computed(() => {
  if (props.scope === 'company') return 'company'
  if (props.projectId && props.projectId.trim()) return `project:${props.projectId.trim()}`
  return 'project:global'
})

// Save conversation to DB
async function saveConversation() {
  const chatMessages: RichChatMessage[] = messages.value.map(m => ({
    role: m.role,
    content: m.contentParts ?? m.content,
    model_id: m.modelId,
    model_label: m.modelLabel,
    provider_id: m.providerId,
    provider_label: m.providerLabel,
    timestamp: m.timestamp.toISOString(),
  }))

  const data = {
    id: currentConversationId.value || undefined,
    context_key: conversationContextKey.value,
    name: conversationTitle.value,
    model: resolveModelId(conversationModel.value || defaultModelId.value, {
      allowAuto: true,
      fallbackModelId: 'auto',
      persist: false,
    }),
    messages_json: JSON.stringify(chatMessages),
    mode: chatMode.value,
    invited_models: chatMode.value === 'roundrobin'
      ? JSON.stringify(roundRobin.invitedModels.value)
      : '[]',
  }

  const id = await contextDB.conversationSave(data)
  if (id && !currentConversationId.value) {
    currentConversationId.value = id
    emit('conversation-created', id)
  }
}

// Auto-generate title from first message
function generateTitle(userMessage: string, attachmentCount = 0): string {
  const cleaned = userMessage.trim()
  if (!cleaned && attachmentCount > 0) {
    return attachmentCount === 1 ? 'Image Request' : `Image Request (${attachmentCount})`
  }
  if (cleaned.length <= 50) return cleaned
  return cleaned.substring(0, 47) + '...'
}

// Send message
async function sendMessage(contentOverride?: ChatMessageContent, attachmentOverride?: ImageAttachment[]) {
  if (isStreaming.value) return

  const currentText = inputMessage.value.trim()
  const attachments = attachmentOverride ? [...attachmentOverride] : [...pendingAttachments.value]
  const isMultimodalPrompt = attachments.length > 0
  const userPayload = contentOverride ?? buildUserPayload(currentText, attachments)
  if (!hasContentPayload(userPayload)) return

  const userContent = extractTextFromContent(userPayload)
  errorMessage.value = null

  // Create user message
  const userMsg: DisplayMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: userContent,
    contentParts: userPayload,
    attachments,
    renderedHtml: userContent ? renderStreamingMarkdown(userContent) : '',
    timestamp: new Date(),
  }
  messages.value.push(userMsg)

  // Auto-title on first user message
  if (messages.value.filter(m => m.role === 'user').length === 1) {
    conversationTitle.value = generateTitle(userContent, attachments.length)
    emit('title-updated', conversationTitle.value)
  }

  emit('message-sent', userContent || `[${attachments.length} image${attachments.length > 1 ? 's' : ''}]`)

  inputMessage.value = ''
  clearPendingAttachments()
  isStreaming.value = true
  streamingContent.value = ''
  streamingHtml.value = ''

  const references = parseReferences(userContent)
  const docContents = references.docs.length > 0
    ? await getReferencedDocsContext(references.docs)
    : ''
  const referencePrompt = buildReferenceSystemPrompt(references, docContents)

  // Build conversation history (without system messages)
  const history: ChatMessage[] = []
  for (const msg of messages.value.slice(0, -1)) { // exclude current user msg
    if (msg.role === 'system') continue
    history.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.contentParts ?? msg.content,
    })
  }

  // Persist user message immediately so it's not lost if response fails.
  await saveConversation().catch(() => null)

  // ── Roundtable mode ──
  if (chatMode.value === 'roundrobin' && roundRobin.canStart.value) {
    const token = authStore.token || undefined
    const combinedSystemPrompt = [systemPrompt.value.trim(), referencePrompt]
      .filter(Boolean)
      .join('\n\n')

    await roundRobin.executeRound(userContent, history, {
      onModelStart: (model, _index) => {
        streamingContent.value = ''
        streamingHtml.value = ''
        streamingModelLabel.value = model.label
      },
      onChunk: (chunk, _model, _index) => {
        if (chunk.content) {
          streamingContent.value += chunk.content
          const filtered = filterAgentDebug(streamingContent.value)
          streamingHtml.value = renderStreamingMarkdown(filtered)
        }
      },
      onModelComplete: (content, model, _index) => {
        const cleanContent = filterAgentDebug(content)
        messages.value.push({
          id: `assistant-${Date.now()}-${model.compositeId}`,
          role: 'assistant',
          content: cleanContent,
          renderedHtml: cleanContent ? renderStreamingMarkdown(cleanContent) : '',
          timestamp: new Date(),
          modelId: model.compositeId,
          modelLabel: model.label,
          providerId: model.providerId,
          providerLabel: model.providerLabel,
        })
        streamingContent.value = ''
        streamingHtml.value = ''
        saveConversation().catch(() => {})
      },
      onModelError: (error, model, _index) => {
        messages.value.push({
          id: `error-${Date.now()}-${model.compositeId}`,
          role: 'assistant',
          content: '',
          error: `${model.label}: ${error}`,
          timestamp: new Date(),
          modelId: model.compositeId,
          modelLabel: model.label,
          providerId: model.providerId,
          providerLabel: model.providerLabel,
        })
        streamingContent.value = ''
        streamingHtml.value = ''
      },
      onSequenceComplete: () => {
        isStreaming.value = false
        streamingModelLabel.value = ''
        saveConversation().catch(() => {})
      },
    }, {
      token,
      systemPrompt: combinedSystemPrompt || undefined,
      localData: buildLocalData(references),
    })
    return
  }

  // ── Single model mode ──
  // Build message history for API
  const chatMessages: ChatMessage[] = []

  // Add system prompts (manual + auto reference context)
  const defaultSystemPrompt = 'You are a helpful AI assistant inside Construct, a project management tool. Be concise and direct. Answer questions in a conversational tone — no lengthy preambles. When writing code, keep it focused. Do not attempt to use tools or web search unless explicitly asked.'
  const combinedSystemPrompt = [defaultSystemPrompt, systemPrompt.value.trim(), referencePrompt]
    .filter(Boolean)
    .join('\n\n')
  chatMessages.push({ role: 'system', content: combinedSystemPrompt })

  if (isMultimodalPrompt) {
    chatMessages.push({
      role: 'system',
      content: 'This request includes attached images. Analyze images directly and answer without calling any workspace tools.',
    })
  }

  // Add conversation history
  for (const msg of messages.value) {
    if (msg.role === 'system') continue
    chatMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.contentParts ?? msg.content,
    })
  }

  let modelId = resolveModelId(defaultModelId.value, {
    allowAuto: true,
    fallbackModelId: 'auto',
    persist: true,
  })
  if (isMultimodalPrompt && modelId !== 'auto' && !isVisionModel(modelId)) {
    toast.add({
      title: 'Switched to vision routing',
      description: `${currentModel.value?.label || 'Selected model'} does not support image input. Using auto routing for this message.`,
      color: 'info',
    })
    modelId = 'auto'
  }
  conversationModel.value = modelId
  let accumulatedToolCalls: ToolCall[] = []
  let routeInfo: ContextStreamChunk['route'] | undefined

  try {
    const token = authStore.token || undefined
    streamAbortController = new AbortController()

    await contextService.chatStream(
      {
        model: modelId,
        messages: chatMessages,
        stream: true,
        token,
        include_space_context: false,
        max_iterations: 1,
      },
      (chunk: ContextStreamChunk) => {
        if (chunk.error) {
          errorMessage.value = chunk.error
          isStreaming.value = false
          return
        }

        // Capture route info from first chunk
        if (chunk.route && !routeInfo) {
          routeInfo = chunk.route
          if (chunk.route.model) {
            conversationModel.value = resolveModelId(chunk.route.model, {
              allowAuto: true,
              fallbackModelId: 'auto',
              persist: false,
            })
          }
        }

        // Accumulate tool calls
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          accumulatedToolCalls = [...accumulatedToolCalls, ...chunk.tool_calls]
        }

        // Internal tool/debug chunks should not pollute visible assistant content.
        if (chunk.type === 'tool_status' || chunk.type === 'tool_result' || chunk.type === 'debug' || chunk.type === 'progress' || chunk.type === 'tool_error') {
          return
        }

        // Accumulate content
        if (chunk.content) {
          streamingContent.value += chunk.content
          const filtered = filterAgentDebug(streamingContent.value)
          streamingHtml.value = renderStreamingMarkdown(filtered)
        }

        // Stream complete
        if (chunk.done) {
          const cleanContent = filterAgentDebug(streamingContent.value)
          const assistantMsg: DisplayMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: cleanContent,
            renderedHtml: renderStreamingMarkdown(cleanContent),
            timestamp: new Date(),
            toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
            toolCallsExpanded: false,
            route: routeInfo,
          }
          messages.value.push(assistantMsg)
          streamingContent.value = ''
          streamingHtml.value = ''
          isStreaming.value = false
          accumulatedToolCalls = []
          routeInfo = undefined

          // Save conversation
          saveConversation().catch(() => {})
        }
      },
      { signal: streamAbortController?.signal },
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return // user cancelled
    errorMessage.value = err instanceof Error ? err.message : 'Failed to get response'
    isStreaming.value = false

    // Add error as assistant message
    messages.value.push({
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: '',
      error: errorMessage.value || 'Unknown error',
      timestamp: new Date(),
    })

    // Persist error state and latest user message.
    await saveConversation().catch(() => null)
  }
}

// Stop streaming (if supported)
function stopStreaming() {
  // Abort the in-flight stream
  if (streamAbortController) {
    streamAbortController.abort()
    streamAbortController = null
  }

  // Cancel round-robin sequence if active
  if (roundRobin.isRunning.value) {
    roundRobin.cancelSequence()
  }

  isStreaming.value = false
  if (streamingContent.value) {
    const cleanContent = filterAgentDebug(streamingContent.value)
    const interruptedContent = cleanContent ? cleanContent + '\n\n*[Response interrupted]*' : ''
    if (interruptedContent) {
      messages.value.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: interruptedContent,
        renderedHtml: renderStreamingMarkdown(interruptedContent),
        timestamp: new Date(),
        modelLabel: streamingModelLabel.value || undefined,
      })
    }
    streamingContent.value = ''
    streamingHtml.value = ''
    streamingModelLabel.value = ''
    saveConversation().catch(() => {})
  }
}

// Clear conversation
function clearMessages() {
  messages.value = []
  inputMessage.value = ''
  clearPendingAttachments()
  isDragOver.value = false
  isStreaming.value = false
  streamingContent.value = ''
  streamingHtml.value = ''
  streamingModelLabel.value = ''
  currentConversationId.value = null
  conversationTitle.value = 'New Conversation'
  errorMessage.value = null
  // Keep chatMode and invited models — user preference persists across conversations
}

// Toggle tool call expansion
function toggleToolCalls(msg: DisplayMessage) {
  msg.toolCallsExpanded = !msg.toolCallsExpanded
}

// Handle keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Quick actions
const quickActions = [
  { label: 'Explain code', icon: 'i-lucide-code', prompt: 'Explain this code:\n```\n' },
  { label: 'Write tests', icon: 'i-lucide-test-tube', prompt: 'Write comprehensive tests for: ' },
  { label: 'Refactor', icon: 'i-lucide-wand-2', prompt: 'Refactor this code to improve quality:\n```\n' },
  { label: 'Debug', icon: 'i-lucide-bug', prompt: 'Help me debug this issue: ' },
]

function executeQuickAction(prompt: string) {
  inputMessage.value = prompt
  nextTick(() => {
    const textarea = inputRef.value?.textarea || (inputRef.value as unknown as HTMLTextAreaElement)
    textarea?.focus()
  })
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Copy message content
async function copyContent(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    toast.add({ title: 'Copied', description: 'Message copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to copy', color: 'error' })
  }
}

// Retry last message
function retryLastMessage() {
  const lastUserMsgIndex = [...messages.value].reverse().findIndex(m => m.role === 'user')
  if (lastUserMsgIndex === -1) return

  const actualIndex = messages.value.length - 1 - lastUserMsgIndex
  const lastUserMsg = messages.value[actualIndex]
  if (!lastUserMsg) return

  // Remove all messages from the selected user message onward, then replay it.
  messages.value = messages.value.slice(0, actualIndex + 1)
  errorMessage.value = null

  const payload = lastUserMsg.contentParts ?? lastUserMsg.content
  const attachments = (lastUserMsg.attachments || []).map(att => ({ ...att, id: createAttachmentId() }))
  messages.value.pop() // sendMessage will add this user message again
  sendMessage(payload, attachments)
}

// Handle round-robin model management
function handleInviteModel(model: InvitedModel) {
  roundRobin.inviteModel(model)
}

function handleRemoveModel(compositeId: string) {
  roundRobin.removeModel(compositeId)
}

function handleReorderModels(models: InvitedModel[]) {
  roundRobin.reorderModels(models)
}

// Expose for parent
defineExpose({ clearMessages, loadConversation, sendMessage, chatMode })
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Thin topbar -->
    <div class="shrink-0 h-11 flex items-center justify-between px-4">
      <div class="flex items-center gap-2 min-w-0">
        <p class="text-[13px] font-medium text-app truncate">{{ conversationTitle }}</p>
        <Icon v-if="isRoundtable" name="i-lucide-users" class="size-3.5 text-app-accent shrink-0" />
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <AIModeToggle v-model="chatMode" />
        <AIModelSelector v-if="chatMode === 'single'" />
        <button
          class="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-white/5 transition-colors"
          :class="systemPrompt ? 'text-app-accent' : ''"
          title="System prompt"
          @click="showSystemPrompt = !showSystemPrompt"
        >
          <Icon name="i-lucide-settings-2" class="size-3.5" />
        </button>
        <button
          class="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-white/5 transition-colors"
          title="Clear conversation"
          @click="clearMessages"
        >
          <Icon name="i-lucide-trash-2" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Roundtable panel: invited models strip -->
    <div v-if="isRoundtable" class="shrink-0 px-4 py-2">
      <AIRoundRobinPanel
        :invited-models="roundRobin.invitedModels.value"
        :can-invite="roundRobin.canInvite.value"
        :is-running="roundRobin.isRunning.value"
        @invite="handleInviteModel"
        @remove="handleRemoveModel"
        @reorder="handleReorderModels"
      />
    </div>

    <!-- Round-robin progress indicator + stop -->
    <div v-if="isRoundtable && roundRobin.isRunning.value" class="shrink-0 px-4 py-2 flex items-center gap-3">
      <AIRoundRobinProgress
        class="flex-1"
        :models="roundRobin.invitedModels.value"
        :active-index="roundRobin.activeModelIndex.value"
        :completed-indices="roundRobin.completedIndices.value"
        :error-indices="roundRobin.errorIndices.value"
      />
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-medium transition-colors shrink-0"
        @click="stopStreaming"
      >
        <Icon name="i-lucide-square" class="size-3" />
        <span>Stop</span>
      </button>
    </div>

    <!-- System Prompt (collapsible) -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-40"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 max-h-40"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="showSystemPrompt" class="overflow-hidden bg-white/[0.02]">
        <div class="max-w-3xl mx-auto px-5 py-3">
          <label class="text-[10px] uppercase tracking-wider text-app-muted font-medium">System Prompt</label>
          <Textarea
            v-model="systemPrompt"
            placeholder="You are a helpful AI assistant..."
            :rows="2"
            autoresize
            size="xs"
            class="mt-1.5"
          />
        </div>
      </div>
    </Transition>

    <!-- ═══ Empty State: centered composer-first layout ═══ -->
    <div v-if="messages.length === 0 && !isStreaming" class="flex-1 flex flex-col items-center justify-center px-4 pb-8">
      <div class="w-full max-w-2xl">
        <!-- Greeting -->
        <div class="text-center mb-10">
          <div class="size-12 rounded-2xl bg-gradient-to-br from-app-accent/20 to-app-accent/5 mx-auto mb-5 flex items-center justify-center">
            <Icon name="i-lucide-sparkles" class="size-6 text-app-accent" />
          </div>
          <h1 class="text-2xl font-semibold text-app tracking-tight">What can I help you build?</h1>
          <p class="text-sm text-app-muted mt-2">Code, design, debug, or explore ideas with AI.</p>
        </div>

        <!-- Quick starters -->
        <div class="grid grid-cols-2 gap-2 mb-8">
          <button
            v-for="action in quickActions"
            :key="action.label"
            class="group/qa px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left"
            @click="executeQuickAction(action.prompt)"
          >
            <div class="flex items-center gap-2.5">
              <div class="size-7 rounded-lg bg-white/[0.06] group-hover/qa:bg-app-accent/10 flex items-center justify-center transition-colors">
                <Icon :name="action.icon" class="size-3.5 text-app-muted group-hover/qa:text-app-accent transition-colors" />
              </div>
              <span class="text-[13px] text-app-muted group-hover/qa:text-app transition-colors">{{ action.label }}</span>
            </div>
          </button>
        </div>

        <!-- Centered composer (empty state) -->
        <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileInputChange">
        <div
          class="rounded-2xl bg-white/[0.03] transition-colors"
          :class="isDragOver ? 'bg-app-accent/5' : ''"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <!-- Pending attachments -->
          <div v-if="pendingAttachments.length > 0" class="px-3 pt-3">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] text-app-muted">{{ pendingAttachments.length }}/{{ MAX_ATTACHMENTS }} images</p>
              <button class="text-[11px] text-app-muted hover:text-app transition-colors" @click="clearPendingAttachments">Clear</button>
            </div>
            <div class="flex gap-2 flex-wrap">
              <div
                v-for="attachment in pendingAttachments"
                :key="attachment.id"
                class="relative size-14 rounded-lg overflow-hidden bg-black/20"
              >
                <img :src="attachment.url" :alt="attachment.name" class="w-full h-full object-cover">
                <button
                  class="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
                  @click="removePendingAttachment(attachment.id)"
                >
                  <Icon name="i-lucide-x" class="size-2.5" />
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-end gap-2 p-3">
            <button
              class="p-2 rounded-lg text-app-muted hover:text-app hover:bg-white/5 transition-colors shrink-0"
              title="Attach images"
              :disabled="isStreaming"
              @click="openImagePicker"
            >
              <Icon name="i-lucide-paperclip" class="size-4" />
            </button>
            <Textarea
              ref="inputRef"
              v-model="inputMessage"
              placeholder="Ask anything..."
              :rows="1"
              autoresize
              class="flex-1"
              :disabled="isStreaming"
              @keydown="handleKeydown"
              @paste="handlePaste"
            />
            <button
              class="p-2 rounded-lg transition-colors shrink-0"
              :class="canSend ? 'bg-app-accent text-white hover:bg-app-accent/80' : 'bg-white/5 text-app-muted cursor-not-allowed'"
              :disabled="!canSend"
              @click="sendMessage()"
            >
              <Icon :name="isRoundtable ? 'i-lucide-users' : 'i-lucide-arrow-up'" class="size-4" />
            </button>
          </div>
        </div>

        <p class="text-[10px] text-app-muted text-center mt-3">
          Use @ ^ # ~ $ ! for references &middot; Paste or drop images &middot; {{ conversationModel || 'auto' }}
        </p>
      </div>
    </div>

    <!-- ═══ Active conversation: messages + bottom composer ═══ -->
    <template v-else>
      <!-- Messages -->
      <div ref="chatContainerRef" class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto px-5 py-6 space-y-6">
          <div v-for="message in messages" :key="message.id" class="group">
            <!-- User message -->
            <div v-if="message.role === 'user'" class="flex justify-end">
              <div class="max-w-[80%]">
                <p v-if="message.content" class="text-sm text-app bg-white/[0.06] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap break-words">{{ message.content }}</p>
                <div v-if="message.attachments?.length" class="mt-1.5 flex gap-1.5 justify-end">
                  <a
                    v-for="attachment in message.attachments"
                    :key="attachment.id"
                    :href="attachment.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-lg overflow-hidden bg-black/20 block"
                  >
                    <img :src="attachment.url" :alt="attachment.name" class="h-20 w-auto object-cover">
                  </a>
                </div>
                <p class="text-[10px] text-app-muted text-right mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{{ formatTime(message.timestamp) }}</p>
              </div>
            </div>

            <!-- Assistant message -->
            <div v-else-if="message.role === 'assistant'" class="flex gap-3">
              <AIModelAvatar
                v-if="message.providerId"
                :provider-id="message.providerId"
                :model-label="message.modelLabel || 'AI'"
                size="sm"
                class="mt-1 shrink-0"
              />
              <div v-else class="shrink-0 size-6 rounded-full bg-app-accent/15 flex items-center justify-center mt-1">
                <Icon name="i-lucide-sparkles" class="size-3 text-app-accent" />
              </div>

              <div class="flex-1 min-w-0">
                <!-- Model label bar -->
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-xs font-medium text-app">{{ message.modelLabel || 'AI' }}</span>
                  <span v-if="message.providerLabel" class="text-[10px] text-app-muted">&middot; {{ message.providerLabel }}</span>
                  <span v-if="message.route?.model" class="text-[10px] text-app-muted">&middot; {{ message.route.model }}</span>
                </div>

                <!-- Error -->
                <div v-if="message.error" class="bg-red-500/8 rounded-xl px-3.5 py-2.5">
                  <div class="flex items-center gap-2 mb-1">
                    <Icon name="i-lucide-alert-circle" class="size-3.5 text-red-400" />
                    <span class="text-xs font-medium text-red-400">Error</span>
                  </div>
                  <p class="text-sm text-red-300/80">{{ message.error }}</p>
                  <button class="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors" @click="retryLastMessage">Retry</button>
                </div>

                <!-- Content -->
                <!-- eslint-disable vue/no-v-html -->
                <div
                  v-else-if="message.renderedHtml"
                  class="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/20 prose-pre:rounded-xl prose-code:text-app-accent prose-a:text-app-accent prose-p:leading-relaxed"
                  v-html="message.renderedHtml"
                />
                <!-- eslint-enable vue/no-v-html -->
                <div v-else-if="message.content" class="text-sm text-app whitespace-pre-wrap break-words leading-relaxed">
                  {{ message.content }}
                </div>

                <!-- Tool calls -->
                <div v-if="message.toolCalls && message.toolCalls.length > 0" class="mt-2">
                  <button
                    class="flex items-center gap-1.5 text-[11px] text-app-muted hover:text-app transition-colors"
                    @click="toggleToolCalls(message)"
                  >
                    <Icon :name="message.toolCallsExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3" />
                    <Icon name="i-lucide-wrench" class="size-3" />
                    <span>{{ message.toolCalls.length }} tool call{{ message.toolCalls.length > 1 ? 's' : '' }}</span>
                  </button>
                  <div v-if="message.toolCallsExpanded" class="mt-2 space-y-1.5">
                    <div
                      v-for="tc in message.toolCalls"
                      :key="tc.id"
                      class="bg-white/[0.03] rounded-lg px-3 py-2"
                    >
                      <span class="text-[11px] font-mono text-app-accent">{{ tc.function.name }}</span>
                      <pre class="text-[10px] text-app-muted font-mono mt-1 whitespace-pre-wrap break-words">{{ tc.function.arguments }}</pre>
                    </div>
                  </div>
                </div>

                <!-- Actions (hover) -->
                <div class="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="p-1 rounded hover:bg-white/5 text-app-muted hover:text-app" title="Copy" @click="copyContent(message.content)">
                    <Icon name="i-lucide-copy" class="size-3" />
                  </button>
                  <button class="p-1 rounded hover:bg-white/5 text-app-muted hover:text-app" title="Retry" @click="retryLastMessage">
                    <Icon name="i-lucide-refresh-cw" class="size-3" />
                  </button>
                  <span class="text-[10px] text-app-muted ml-1">{{ formatTime(message.timestamp) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Streaming -->
          <div v-if="isStreaming" class="flex gap-3">
            <div class="shrink-0 size-6 rounded-full bg-app-accent/15 flex items-center justify-center mt-1">
              <Icon name="i-lucide-sparkles" class="size-3 text-app-accent animate-pulse" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="text-xs font-medium text-app">{{ streamingModelLabel || 'AI' }}</span>
                <span class="text-[10px] text-app-muted animate-pulse">generating...</span>
              </div>

              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="streamingHtml"
                class="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/20 prose-pre:rounded-xl prose-code:text-app-accent prose-a:text-app-accent prose-p:leading-relaxed"
                v-html="streamingHtml"
              />
              <!-- eslint-enable vue/no-v-html -->

              <div v-else class="flex items-center gap-1.5 py-3">
                <span class="size-1.5 bg-app-muted/60 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <span class="size-1.5 bg-app-muted/60 rounded-full animate-bounce" style="animation-delay: 150ms" />
                <span class="size-1.5 bg-app-muted/60 rounded-full animate-bounce" style="animation-delay: 300ms" />
              </div>

              <button
                class="mt-1 text-[11px] text-app-muted hover:text-app flex items-center gap-1 transition-colors"
                @click="stopStreaming"
              >
                <Icon name="i-lucide-square" class="size-3" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          <!-- Global error -->
          <div v-if="errorMessage && !isStreaming" class="flex items-center gap-2 bg-red-500/8 rounded-xl px-4 py-2.5">
            <Icon name="i-lucide-alert-triangle" class="size-3.5 text-red-400 shrink-0" />
            <p class="text-sm text-red-300/80 flex-1">{{ errorMessage }}</p>
            <button class="text-xs text-red-400 hover:text-red-300 transition-colors" @click="retryLastMessage">Retry</button>
            <button class="p-1 text-app-muted hover:text-app" @click="errorMessage = null">
              <Icon name="i-lucide-x" class="size-3" />
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom composer (active conversation) -->
      <div class="shrink-0">
        <div class="max-w-3xl mx-auto px-5 py-3">
          <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileInputChange">
          <div
            class="rounded-2xl bg-white/[0.03] transition-colors"
            :class="isDragOver ? 'bg-app-accent/5' : ''"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <!-- Pending attachments -->
            <div v-if="pendingAttachments.length > 0" class="px-3 pt-3">
              <div class="flex gap-2 flex-wrap">
                <div
                  v-for="attachment in pendingAttachments"
                  :key="attachment.id"
                  class="relative size-12 rounded-lg overflow-hidden bg-black/20"
                >
                  <img :src="attachment.url" :alt="attachment.name" class="w-full h-full object-cover">
                  <button
                    class="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
                    @click="removePendingAttachment(attachment.id)"
                  >
                    <Icon name="i-lucide-x" class="size-2.5" />
                  </button>
                </div>
              </div>
            </div>

            <div class="flex items-end gap-2 p-3">
              <button
                class="p-2 rounded-lg text-app-muted hover:text-app hover:bg-white/5 transition-colors shrink-0"
                :disabled="isStreaming"
                @click="openImagePicker"
              >
                <Icon name="i-lucide-paperclip" class="size-4" />
              </button>
              <Textarea
                ref="inputRef"
                v-model="inputMessage"
                placeholder="Ask anything..."
                :rows="1"
                autoresize
                class="flex-1"
                :disabled="isStreaming"
                @keydown="handleKeydown"
                @paste="handlePaste"
              />
              <button
                class="p-2 rounded-lg transition-colors shrink-0"
                :class="isStreaming
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : canSend
                    ? 'bg-app-accent text-white hover:bg-app-accent/80'
                    : 'bg-white/5 text-app-muted cursor-not-allowed'"
                :disabled="!isStreaming && !canSend"
                @click="isStreaming ? stopStreaming() : sendMessage()"
              >
                <Icon :name="isStreaming ? 'i-lucide-square' : (isRoundtable ? 'i-lucide-users' : 'i-lucide-arrow-up')" class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
