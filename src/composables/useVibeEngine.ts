import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useAIModel } from '@/composables/useAIModel'
import { useContextService, type ChatMessage } from '@/composables/useContextService'
import { deriveVibeGoal, loadVibeHandoff, summarizeVibeHandoff, type VibeHandoff } from '@/utils/vibeHandoff'

interface VibeUiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface VibeRouteInfo {
  model?: string
  tier?: string
  reason?: string
}

interface VibeSessionMeta {
  session_id: string
  goal?: string
  source?: string
  space?: string
  project_name?: string
  project_path?: string
}

interface VibePhase {
  id: string
  kind: string
  domain?: string
  goal?: string
  task?: string
  executor?: {
    mode?: string
    phase?: string
    agent_id?: string
    space?: string
  }
}

interface VibeTimelineEntry {
  id: string
  kind: string
  status: string
  title: string
  detail?: string
}

interface VibePhaseResult {
  phase_id: string
  kind: string
  domain?: string
  content?: string
  error?: string
  executor?: {
    agent_id?: string
    phase?: string
    mode?: string
    space?: string
  }
}

interface VibeStreamChunk {
  content: string
  done: boolean
  error?: string
  message_type?: string
  route?: VibeRouteInfo
  data?: Record<string, unknown>
}

const MAX_TIMELINE_ENTRIES = 80

export function useVibeEngine() {
  const route = useRoute()
  const projectStore = useProjectStore()
  const { init: initAIModel, defaultModelId } = useAIModel()
  const { isTauri } = useContextService()

  const draft = ref('')
  const messages = ref<VibeUiMessage[]>([])
  const timeline = ref<VibeTimelineEntry[]>([])
  const plan = ref<{ phases: VibePhase[]; spaces: string[]; reason?: string } | null>(null)
  const phaseResults = ref<VibePhaseResult[]>([])
  const session = ref<VibeSessionMeta | null>(null)
  const routeInfo = ref<VibeRouteInfo | null>(null)
  const status = ref('Ready')
  const error = ref('')
  const isRunning = ref(false)

  const abortController = ref<AbortController | null>(null)
  const autoRunKey = ref('')

  const currentProject = computed(() => projectStore.currentProject)
  const projectPath = computed(() => currentProject.value?.path || currentProject.value?.local_path || '')
  const isProjectScoped = computed(() => /^\/app\/projects\/[^/]+\/vibe/.test(route.path))
  const currentProjectId = computed(() => {
    const raw = route.params.projectId
    return typeof raw === 'string' ? raw : ''
  })

  const handoff = computed<VibeHandoff | null>(() => {
    const handoffId = typeof route.query.handoff === 'string' ? route.query.handoff : ''
    return loadVibeHandoff(handoffId)
  })

  const derivedGoal = computed(() => {
    const queryGoal = typeof route.query.goal === 'string' ? route.query.goal : ''
    return deriveVibeGoal(handoff.value, queryGoal)
  })

  const verifyStatus = computed(() => getPhaseStatus(phaseResults.value, 'verify'))
  const reviewStatus = computed(() => getPhaseStatus(phaseResults.value, 'review'))
  const activeSpaces = computed(() => plan.value?.spaces || [])
  const selectedModel = () => (defaultModelId.value || 'auto').trim() || 'auto'

  const artifacts = computed(() => {
    return phaseResults.value
      .filter(result => !!result.content && ['implement', 'verify', 'review'].includes(result.kind))
      .map((result) => {
        const executor = result.executor?.agent_id || result.executor?.phase || result.executor?.mode || 'runtime'
        return {
          id: result.phase_id,
          title: formatPhaseLabel(result.kind, result.domain),
          executor,
          preview: truncateText(result.content || '', 180),
        }
      })
  })

  function appendTimeline(entry: VibeTimelineEntry) {
    timeline.value = [...timeline.value, entry].slice(-MAX_TIMELINE_ENTRIES)
  }

  function buildLocalData(goal: string) {
    const project = currentProject.value
    const routeContext = {
      isProjectScoped: isProjectScoped.value,
      projectId: currentProjectId.value || undefined,
      spaceName: 'vibe',
    }
    const spaceContext: Record<string, unknown> = {
      activeSpace: 'vibe',
    }

    if (project) {
      spaceContext.project = {
        id: String(project.id),
        name: project.name,
        description: project.description,
        localPath: project.path || project.local_path,
        spaces: project.spaces,
      }
    }

    const localData: Record<string, unknown> = {
      route_context: routeContext,
      space_context: spaceContext,
      project_name: project?.name,
      project_path: projectPath.value,
      project_description: project?.description,
      vibe: {
        goal,
        source: handoff.value?.source || route.query.source || 'vibe',
      },
    }

    if (handoff.value) {
      localData.vibe_handoff = {
        source: handoff.value.source,
        description: handoff.value.description,
        plan_name: handoff.value.plan?.name,
        created_at: handoff.value.createdAt,
      }
    }

    return localData
  }

  function buildRequestMessages(userMessages: VibeUiMessage[]): ChatMessage[] {
    const requestMessages: ChatMessage[] = []
    const handoffSummary = summarizeVibeHandoff(handoff.value)

    if (handoffSummary) {
      requestMessages.push({
        role: 'system',
        content: `You are running inside Construct Vibe.\nUse this handoff as the execution contract unless the user overrides it.\n\n${handoffSummary}`,
      })
    }

    for (const message of userMessages) {
      requestMessages.push({
        role: message.role,
        content: message.content,
      })
    }

    return requestMessages
  }

  async function submitPrompt(rawText?: string) {
    const text = (rawText ?? draft.value).trim()
    if (!text || isRunning.value) return

    error.value = ''
    status.value = 'Starting Vibe session'
    isRunning.value = true
    draft.value = ''

    const userMessage: VibeUiMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    const nextMessages = [...messages.value, userMessage]
    messages.value = nextMessages

    abortController.value?.abort()
    abortController.value = new AbortController()

    if (!isTauri.value) {
      error.value = 'Vibe requires the Construct desktop app.'
      isRunning.value = false
      return
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')

    let assistantContent = ''
    let unlisten: (() => void) | null = null
    const requestMessages = buildRequestMessages(nextMessages)

    try {
      const streamComplete = new Promise<void>((resolve, reject) => {
        let isDone = false

        const finish = (streamError?: string) => {
          if (isDone) return
          isDone = true
          if (unlisten) {
            unlisten()
            unlisten = null
          }
          if (streamError) reject(new Error(streamError))
          else resolve()
        }

        const signal = abortController.value?.signal
        if (signal) {
          if (signal.aborted) {
            finish()
            return
          }
          signal.addEventListener('abort', () => finish(), { once: true })
        }

        listen<VibeStreamChunk>('vibe-stream-chunk', (event) => {
          if (isDone) return
          const chunk = event.payload

          if (chunk.route) {
            routeInfo.value = chunk.route
          }

          if (chunk.error) {
            finish(chunk.error)
            return
          }

          handleChunk(chunk, {
            onAssistantText: (content) => { assistantContent += content },
          })

          if (chunk.done) {
            finish()
          }
        }).then((fn) => {
          unlisten = fn
          if (abortController.value?.signal.aborted) {
            fn()
            unlisten = null
          }
        }).catch((err) => {
          finish(err instanceof Error ? err.message : 'Listener setup failed')
        })
      })

      await invoke('vibe_stream', {
        model: selectedModel(),
        messages: requestMessages,
        source: handoff.value?.source || route.query.source || 'vibe',
        goal: text,
        sessionId: session.value?.session_id || null,
        localData: buildLocalData(text),
        maxIterations: null,
      })

      await streamComplete

      if (assistantContent.trim()) {
        messages.value = [
          ...messages.value,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: assistantContent.trim(),
          },
        ]
      }
      status.value = 'Session complete'
    } catch (streamError) {
      error.value = streamError instanceof Error ? streamError.message : 'Vibe stream failed'
      status.value = 'Session failed'
      appendTimeline({
        id: `error-${Date.now()}`,
        kind: 'error',
        status: 'failed',
        title: 'Vibe stream failed',
        detail: error.value,
      })
    } finally {
      isRunning.value = false
    }
  }

  function handleChunk(
    chunk: VibeStreamChunk,
    hooks: { onAssistantText: (content: string) => void },
  ) {
    const type = chunk.message_type || ''

    switch (type) {
      case 'vibe.session': {
        const payload = (chunk.data || {}) as unknown as VibeSessionMeta
        session.value = payload
        if (payload.goal) status.value = `Planning ${payload.goal}`
        appendTimeline({
          id: `session-${payload.session_id || Date.now()}`,
          kind: 'session',
          status: 'started',
          title: payload.goal ? `Session started: ${payload.goal}` : 'Vibe session started',
          detail: payload.project_name || payload.project_path,
        })
        return
      }
      case 'progress':
        appendTimeline({
          id: `progress-${Date.now()}`,
          kind: 'progress',
          status: 'running',
          title: chunk.content || 'Running',
        })
        return
      case 'orchestration.plan': {
        const data = chunk.data || {}
        const phases = Array.isArray(data.phases) ? data.phases as unknown as VibePhase[] : []
        const spaces = Array.isArray(data.spaces) ? data.spaces.filter((item): item is string => typeof item === 'string') : []
        plan.value = {
          phases,
          spaces,
          reason: typeof data.reason === 'string' ? data.reason : undefined,
        }
        status.value = `Plan ready${phases.length ? ` (${phases.length} phases)` : ''}`
        appendTimeline({
          id: `plan-${Date.now()}`,
          kind: 'plan',
          status: 'completed',
          title: `Execution plan prepared${phases.length ? ` (${phases.length} phases)` : ''}`,
          detail: spaces.length ? `Spaces: ${spaces.join(', ')}` : plan.value.reason,
        })
        return
      }
      case 'orchestration.phase': {
        const data = chunk.data || {}
        const phase = (data.phase || {}) as VibePhase
        const result = (data.result || {}) as VibePhaseResult
        const phaseStatus = typeof data.status === 'string' ? data.status : 'running'
        const detail = result.content || result.error || phase.goal || ''

        if (result.phase_id) {
          phaseResults.value = upsertPhaseResult(phaseResults.value, result)
        }

        status.value = `${capitalize(phaseStatus)} ${formatPhaseLabel(phase.kind, phase.domain)}`
        appendTimeline({
          id: `${phase.id || phase.kind}-${phaseStatus}-${Date.now()}`,
          kind: phase.kind || 'phase',
          status: phaseStatus,
          title: `${capitalize(phaseStatus)} ${formatPhaseLabel(phase.kind, phase.domain)}`,
          detail: truncateText(detail, 180),
        })
        return
      }
      case 'orchestration.complete': {
        const data = chunk.data || {}
        const results = Array.isArray(data.results) ? data.results as unknown as VibePhaseResult[] : []
        phaseResults.value = results
        status.value = typeof data.status === 'string' && data.status === 'blocked'
          ? 'Blocked after verification'
          : 'Execution finished'
        appendTimeline({
          id: `complete-${Date.now()}`,
          kind: 'complete',
          status: typeof data.status === 'string' ? data.status : 'completed',
          title: typeof data.status === 'string' && data.status === 'blocked'
            ? 'Execution blocked'
            : 'Execution completed',
          detail: `${results.length} phase results recorded`,
        })
        return
      }
      case 'stream':
        if (chunk.content) hooks.onAssistantText(chunk.content)
        return
      default:
        if (chunk.content) {
          hooks.onAssistantText(chunk.content)
        }
    }
  }

  function resetSession() {
    abortController.value?.abort()
    abortController.value = null
    draft.value = ''
    messages.value = []
    timeline.value = []
    plan.value = null
    phaseResults.value = []
    session.value = null
    routeInfo.value = null
    status.value = 'Ready'
    error.value = ''
    isRunning.value = false
    autoRunKey.value = ''
  }

  function stopListening() {
    abortController.value?.abort()
    status.value = 'Stopped listening'
    isRunning.value = false
  }

  function maybeHydrateDraft() {
    if (!draft.value.trim()) {
      draft.value = derivedGoal.value
    }
  }

  async function maybeAutoRun() {
    const shouldAutoRun = route.query.autorun === '1' || route.query.autorun === 'true'
    const goal = derivedGoal.value.trim()
    const key = `${route.fullPath}:${goal}`
    if (!shouldAutoRun || !goal || isRunning.value || messages.value.length > 0 || autoRunKey.value === key) {
      return
    }
    autoRunKey.value = key
    await nextTick()
    await submitPrompt(goal)
  }

  onMounted(async () => {
    await initAIModel()
    maybeHydrateDraft()
    await maybeAutoRun()
  })

  watch(
    () => route.fullPath,
    async () => {
      maybeHydrateDraft()
      await maybeAutoRun()
    },
  )

  return {
    draft,
    messages,
    timeline,
    plan,
    phaseResults,
    session,
    routeInfo,
    status,
    error,
    isRunning,
    currentProject,
    projectPath,
    handoff,
    activeSpaces,
    verifyStatus,
    reviewStatus,
    artifacts,
    submitPrompt,
    resetSession,
    stopListening,
  }
}

function capitalize(value: string): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatPhaseLabel(kind: string, domain?: string): string {
  const normalizedKind = kind || 'phase'
  return domain ? `${normalizedKind}:${domain}` : normalizedKind
}

function truncateText(content: string, maxLength: number): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trimEnd()}...`
}

function upsertPhaseResult(existing: VibePhaseResult[], next: VibePhaseResult): VibePhaseResult[] {
  const index = existing.findIndex(result => result.phase_id === next.phase_id)
  if (index === -1) return [...existing, next]
  const clone = [...existing]
  clone[index] = next
  return clone
}

function getPhaseStatus(results: VibePhaseResult[], phaseKind: string): string {
  const result = results.find(item => item.kind === phaseKind)
  if (!result?.content) return ''
  const firstLine = result.content.split('\n').find(line => line.trim()) || ''
  const upper = firstLine.toUpperCase().trim()
  if (upper.startsWith('STATUS:')) {
    return upper.replace('STATUS:', '').trim()
  }
  return ''
}
