import type { ChatMessage } from './useChat'
import type { ChatMessage as AIChatMessage, ContextStreamChunk } from '~/composables/useContextService'
import type { SpaceContext } from '~/types/context'
import type { DocumentListItem } from '~/stores/documents'

const HISTORY_LIMIT = 24

function stripAIMentions(content: string): string {
  const withoutSlashCommand = content.replace(/^\/ai\s+/i, '')
  const withoutMentions = withoutSlashCommand.replace(/\B@ai\b/gi, '')
  const normalized = withoutMentions.replace(/\s{2,}/g, ' ').trim()
  return normalized || content
}

function toAgentMessage(msg: ChatMessage): AIChatMessage {
  if (msg.sender.type === 'ai') {
    return {
      role: 'assistant',
      content: msg.content,
    }
  }

  const senderName = `${msg.sender.first_name || ''} ${msg.sender.last_name || ''}`.trim() || 'User'
  return {
    role: 'user',
    content: `${senderName}: ${stripAIMentions(msg.content)}`,
  }
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
}

interface ParsedReferences {
  designs: DesignReference[]
  docs: DocReference[]
  tasks: string[]
  components: string[]
  files: string[]
  codeFiles: FileReference[]
}

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

  const docs = [...text.matchAll(/\^([\w][\w\s-]*?)(?=\s*[,.|!?]|\s+[^\w]|$)/g)]
    .map(match => ({ title: (match[1] || '').trim() }))
    .filter(ref => !!ref.title)

  const tasks = [...text.matchAll(/#(\d+)/g)].map(m => m[1]).filter((v): v is string => !!v)
  const components = [...text.matchAll(/~([\w-]+)/g)].map(m => m[1]).filter((v): v is string => !!v)
  const files = [...text.matchAll(/\$([\w./-]+)/g)].map(m => m[1]).filter((v): v is string => !!v)
  const codeFiles = [...text.matchAll(/!([\w.-]+(?:\/[\w.-]+)*)/g)].map(m => ({
    filename: m[1] || '',
    raw: m[0] || '',
  }))

  return { designs, docs, tasks, components, files, codeFiles }
}

export function useChatRoomAgent() {
  const { chatStream, isTauri, connected } = useContextService()
  const { defaultModelId, init: initAIModel, resolveModelId } = useAIModel()
  const { spaceContext } = useSpaceContext()
  const projectStore = useProjectStore()
  const authStore = useAuthStore()
  const documentsStore = useDocumentsStore()

  const isRunning = ref(false)
  const canRun = computed(() => isTauri.value && connected.value)
  const projectDocs = ref<DocumentListItem[]>([])
  const loadedDocsProjectId = ref<string | number | null>(null)

  async function ensureProjectDocsLoaded(): Promise<void> {
    const projectId = projectStore.currentProject?.id
    if (!projectId || loadedDocsProjectId.value === projectId) return

    try {
      await documentsStore.fetchProjectDocuments(projectId)
      projectDocs.value = documentsStore.documents
      loadedDocsProjectId.value = projectId
    } catch (error) {
      console.warn('[ChatRoomAgent] Failed to load project docs:', error)
      projectDocs.value = []
      loadedDocsProjectId.value = projectId
    }
  }

  watch(() => projectStore.currentProject?.id, async (projectId) => {
    projectDocs.value = []
    loadedDocsProjectId.value = null
    if (projectId) {
      await ensureProjectDocsLoaded()
    }
  }, { immediate: true })

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
    const consumed = new Set<number>()

    for (const ref of refs) {
      const query = ref.title.toLowerCase()
      const doc = projectDocs.value.find(item => {
        if (consumed.has(item.id)) return false
        return item.title.toLowerCase().includes(query)
      })

      if (!doc) {
        sections.push(`### ${ref.title}\nNo matching document found in this project.`)
        continue
      }

      consumed.add(doc.id)
      try {
        const fullDoc = await documentsStore.fetchDocument(doc.id)
        const rawContent = fullDoc?.content || ''
        const content = rawContent.length > 3000
          ? `${rawContent.slice(0, 3000)}\n\n... [truncated]`
          : rawContent
        sections.push(`### ${doc.title} (${doc.type})\n${content || '[Document content is empty]'}`)
      } catch {
        sections.push(`### ${doc.title} (${doc.type})\n[Failed to fetch content. Use get_document with document_id=${doc.id}]`)
      }
    }

    return sections.join('\n\n')
  }

  function buildReferenceContextPrompt(references: ParsedReferences, docContents?: string): string {
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
      parts.push(`## Referenced Components\nComponents referenced: ${references.components.map(c => `~${c}`).join(', ')}`)
    }
    if (references.files.length > 0) {
      parts.push(`## Referenced Files\nExplicit file paths: ${references.files.map(f => `$${f}`).join(', ')}`)
    }
    if (references.codeFiles.length > 0) {
      parts.push(`## Referenced Code Files\nFuzzy file queries: ${references.codeFiles.map(ref => `!${ref.filename}`).join(', ')}`)
    }

    parts.push('When references are provided, prioritize those artifacts over generic assumptions.')
    return parts.join('\n\n')
  }

  function buildScopedContext(full: SpaceContext): Partial<SpaceContext> {
    const allowedSpaces = new Set(projectStore.projectSpaces)
    const scoped: Partial<SpaceContext> = {
      activeSpace: 'chat',
      chat: full.chat,
    }

    if (full.project) {
      scoped.project = {
        id: full.project.id,
        name: full.project.name,
        description: full.project.description,
        spaces: Array.from(allowedSpaces),
      }
    }

    if (allowedSpaces.has('code')) scoped.code = full.code
    if (allowedSpaces.has('design')) scoped.ui = full.ui
    if (allowedSpaces.has('kanban')) scoped.tasks = full.tasks
    if (allowedSpaces.has('notes')) scoped.notes = full.notes
    if (allowedSpaces.has('git')) scoped.git = full.git
    if (allowedSpaces.has('docs')) scoped.docs = full.docs

    return scoped
  }

  function buildScopedContextSummary(scoped: Partial<SpaceContext>): string {
    const lines: string[] = []
    const project = scoped.project
    if (project) {
      lines.push(`Project: ${project.name} (ID ${project.id})`)
      if (project.description) lines.push(`Project summary: ${project.description}`)
    }

    if (scoped.code?.currentFile) {
      lines.push(`Code focus: ${scoped.code.currentFile}`)
    }

    if (scoped.ui?.canvasNodeCount) {
      lines.push(`UI canvas nodes: ${scoped.ui.canvasNodeCount}`)
    }

    if (scoped.tasks?.total) {
      lines.push(`Tasks: ${scoped.tasks.total}`)
    }

    if (scoped.git?.currentBranch) {
      lines.push(`Git branch: ${scoped.git.currentBranch}`)
    }

    if (scoped.docs?.activeDocument?.title) {
      lines.push(`Doc in focus: ${scoped.docs.activeDocument.title}`)
    }

    if (scoped.chat?.activeConversation) {
      lines.push(`Chat in focus: ${scoped.chat.activeConversation}`)
    }

    return lines.join('\n')
  }

  function resolveChatModel(): string {
    return resolveModelId(defaultModelId.value, {
      allowAuto: true,
      fallbackModelId: 'zai:glm-4.7',
      persist: true,
    })
  }

  async function generateReply(params: {
    roomName: string
    roomId: number
    history: ChatMessage[]
    onChunk: (chunk: ContextStreamChunk) => void
  }): Promise<void> {
    if (!canRun.value) {
      throw new Error('Local chat agent is unavailable')
    }

    isRunning.value = true
    try {
      await initAIModel()

      const history = params.history
        .slice(-HISTORY_LIMIT)
        .map(toAgentMessage)

      const systemPrompt = [
        'You are the AI assistant in a team chat room inside Construct.',
        `Room: ${params.roomName}`,
        'Reply naturally as a teammate: concise, practical, and directly actionable.',
        'Use available workspace context from all spaces when it improves the answer.',
      ].join('\n')

      const scopedContext = buildScopedContext(spaceContext.value)
      const contextPrompt = buildScopedContextSummary(scopedContext)
      const lastHumanMessage = [...params.history].reverse().find(msg => msg.sender.type !== 'ai')
      const references = parseReferences(lastHumanMessage?.content || '')
      const docContents = references.docs.length > 0
        ? await getReferencedDocsContext(references.docs)
        : ''
      const referencePrompt = buildReferenceContextPrompt(references, docContents)

      const messages: AIChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(contextPrompt ? [{ role: 'system', content: contextPrompt } as AIChatMessage] : []),
        ...(referencePrompt ? [{ role: 'system', content: referencePrompt } as AIChatMessage] : []),
        ...history,
      ]

      await chatStream({
        model: resolveChatModel(),
        agent_id: 'chat',
        space: 'chat',
        include_space_context: false,
        messages,
        local_data: {
          security_scope: {
            policy: 'owner',
            allowed_spaces: projectStore.projectSpaces,
          },
          space_context: scopedContext,
          chat_room: {
            id: params.roomId,
            name: params.roomName,
          },
          references: {
            designs: references.designs.map(ref => ref.raw),
            docs: references.docs.map(ref => ref.title),
            tasks: references.tasks,
            components: references.components,
            files: references.files,
            code_files: references.codeFiles.map(ref => ref.filename),
          },
        },
      }, params.onChunk)
    } finally {
      isRunning.value = false
    }
  }

  return {
    canRun,
    isRunning,
    generateReply,
  }
}
