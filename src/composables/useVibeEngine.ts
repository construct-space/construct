import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  project_id?: string
  goal?: string
  source?: string
  space?: string
  status?: string
  current_phase?: string
  session_type?: string
  autonomy_level?: string
  project_name?: string
  project_path?: string
}

interface VibeStoredSession {
  id: string
  project_id?: string
  project_name?: string
  project_path?: string
  goal: string
  source?: string
  session_type?: string
  autonomy_level?: string
  status?: string
  current_phase?: string
  next_step?: string
  verification?: Record<string, string>
  created_at?: string
  updated_at?: string
}

interface VibeStoredEvent {
  id: number
  event_type: string
  phase?: string
  data?: Record<string, unknown>
  created_at?: string
}

interface VibeStoredCheckpoint {
  id: number
  branch: string
  commit_hash?: string
  description?: string
  created_at?: string
}

interface VibeStoredDesign {
  id: number
  localId: string
  projectId?: string
  name: string
  updatedAt?: string
  nodes?: unknown[]
  pages?: unknown[]
}

interface VibeSessionDetails {
  session?: VibeStoredSession
  events?: VibeStoredEvent[]
  checkpoints?: VibeStoredCheckpoint[]
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
  metadata?: Record<string, unknown>
  executor?: {
    agent_id?: string
    phase?: string
    mode?: string
    space?: string
  }
}

interface VibeArtifact {
  id: string
  kind: string
  domain: string
  title: string
  executor: string
  preview: string
  localId?: string
}

interface VibeStreamChunk {
  content: string
  done: boolean
  error?: string
  type?: string
  route?: VibeRouteInfo
  data?: Record<string, unknown>
}

const MAX_TIMELINE_ENTRIES = 80

// ─── Multi-session state (keyed by project ID, survives navigation) ───
interface VibeSessionState {
  draft: string
  submittedGoal: string
  messages: VibeUiMessage[]
  timeline: VibeTimelineEntry[]
  plan: { phases: VibePhase[]; spaces: string[]; reason?: string } | null
  phaseResults: VibePhaseResult[]
  session: VibeSessionMeta | null
  routeInfo: VibeRouteInfo | null
  status: string
  error: string
  isRunning: boolean
  checkpoints: VibeStoredCheckpoint[]
  abortController: AbortController | null
  autoRunKey: string
  generation: number
}

function createEmptySessionState(): VibeSessionState {
  return {
    draft: '',
    submittedGoal: '',
    messages: [],
    timeline: [],
    plan: null,
    phaseResults: [],
    session: null,
    routeInfo: null,
    status: 'Ready',
    error: '',
    isRunning: false,
    checkpoints: [],
    abortController: null,
    autoRunKey: '',
    generation: 0,
  }
}

const _sessions = new Map<string, VibeSessionState>()

function getSessionState(key: string): VibeSessionState {
  if (!_sessions.has(key)) {
    _sessions.set(key, createEmptySessionState())
  }
  return _sessions.get(key)!
}

// Reactive ref that points to the current session's state
const _activeKey = ref('__global__')
const _state = ref<VibeSessionState>(getSessionState('__global__'))

export function useVibeEngine() {
  const route = useRoute()
  const router = useRouter()
  const projectStore = useProjectStore()
  const { init: initAIModel, defaultModelId } = useAIModel()
  const { isTauri, sendRequest } = useContextService()

  const currentProject = computed(() => projectStore.currentProject)
  const projectPath = computed(() => currentProject.value?.path || currentProject.value?.local_path || '')
  const isProjectScoped = computed(() => /^\/app\/projects\/[^/]+\/vibe/.test(route.path))
  const currentProjectId = computed(() => {
    const raw = route.params.projectId
    return typeof raw === 'string' ? raw : ''
  })
  const scopeKey = computed(() => currentProjectId.value || '__global__')
  const requestedSessionId = computed(() => {
    const raw = route.query.session
    return typeof raw === 'string' ? raw.trim() : ''
  })

  // Switch active session when project changes
  const sessionKey = computed(() => requestedSessionId.value || scopeKey.value)
  const savedSessions = ref<VibeStoredSession[]>([])
  const isLoadingHistory = ref(false)
  const loadingSessionIds = new Set<string>()
  const sessionPollHandle = ref<number | null>(null)
  const filesystemArtifacts = ref<VibeArtifact[]>([])
  const designArtifactsFallback = ref<VibeArtifact[]>([])

  function syncSessionState() {
    const key = sessionKey.value
    if (_activeKey.value !== key) {
      _activeKey.value = key
      _state.value = getSessionState(key)
    }
  }
  syncSessionState()

  // Reactive aliases into active session state
  const draft = computed({
    get: () => _state.value.draft,
    set: (v: string) => { _state.value.draft = v },
  })
  const submittedGoal = computed({
    get: () => _state.value.submittedGoal,
    set: (v: string) => { _state.value.submittedGoal = v },
  })
  const messages = computed({
    get: () => _state.value.messages,
    set: (v: VibeUiMessage[]) => { _state.value.messages = v },
  })
  const timeline = computed({
    get: () => _state.value.timeline,
    set: (v: VibeTimelineEntry[]) => { _state.value.timeline = v },
  })
  const plan = computed({
    get: () => _state.value.plan,
    set: (v: { phases: VibePhase[]; spaces: string[]; reason?: string } | null) => { _state.value.plan = v },
  })
  const phaseResults = computed({
    get: () => _state.value.phaseResults,
    set: (v: VibePhaseResult[]) => { _state.value.phaseResults = v },
  })
  const session = computed({
    get: () => _state.value.session,
    set: (v: VibeSessionMeta | null) => { _state.value.session = v },
  })
  const routeInfo = computed({
    get: () => _state.value.routeInfo,
    set: (v: VibeRouteInfo | null) => { _state.value.routeInfo = v },
  })
  const status = computed({
    get: () => _state.value.status,
    set: (v: string) => { _state.value.status = v },
  })
  const error = computed({
    get: () => _state.value.error,
    set: (v: string) => { _state.value.error = v },
  })
  const isRunning = computed({
    get: () => _state.value.isRunning,
    set: (v: boolean) => { _state.value.isRunning = v },
  })
  const checkpoints = computed({
    get: () => _state.value.checkpoints,
    set: (v: VibeStoredCheckpoint[]) => { _state.value.checkpoints = v },
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
    const phaseArtifacts = phaseResults.value
      .filter(result => !!result.content && ['implement', 'verify', 'review'].includes(result.kind))
      .map((result) => {
        const executor = result.executor?.agent_id || result.executor?.phase || result.executor?.mode || 'runtime'
        const domain = inferArtifactDomain(result)
        return {
          id: result.phase_id,
          kind: result.kind,
          domain,
          title: formatPhaseLabel(result.kind, domain),
          executor,
          preview: truncateText(result.content || '', 180),
        }
      })

    const merged = phaseArtifacts.filter(artifact => !(artifact.domain === 'design' && designArtifactsFallback.value.length > 0))
    const hasDocPhaseArtifact = phaseArtifacts.some(artifact => artifact.domain === 'docs')
    const knownIds = new Set(phaseArtifacts.map(artifact => artifact.id))

    for (const artifact of filesystemArtifacts.value) {
      if (artifact.domain === 'docs' && hasDocPhaseArtifact) continue
      if (knownIds.has(artifact.id)) continue
      merged.push(artifact)
    }

    const hasDesignPhaseArtifact = phaseArtifacts.some(artifact => artifact.domain === 'design')
    for (const artifact of designArtifactsFallback.value) {
      if (artifact.domain === 'design' && hasDesignPhaseArtifact) continue
      if (knownIds.has(artifact.id)) continue
      merged.push(artifact)
    }

    return merged
  })

  function appendTimeline(entry: VibeTimelineEntry) {
    timeline.value = [...timeline.value, entry].slice(-MAX_TIMELINE_ENTRIES)
  }

  function buildLocalData(goal: string) {
    const project = currentProject.value
    const sessionProjectName = session.value?.project_name?.trim() || ''
    const sessionProjectPath = session.value?.project_path?.trim() || ''
    const effectiveProjectName = project?.name || sessionProjectName
    const effectiveProjectPath = projectPath.value || sessionProjectPath
    const phasePlan = plan.value?.phases.map(phase => (
      phase.domain ? `${phase.kind}:${phase.domain}` : phase.kind
    )) || []
    const knownProjectSpaces = Array.isArray(project?.spaces) && project.spaces.length > 0
      ? project.spaces
      : activeSpaces.value
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
    } else if (effectiveProjectName || effectiveProjectPath) {
      spaceContext.project = {
        name: effectiveProjectName || undefined,
        localPath: effectiveProjectPath || undefined,
        spaces: knownProjectSpaces,
      }
    }

    const localData: Record<string, unknown> = {
      project_id: project?.id ? String(project.id) : undefined,
      project_spaces: knownProjectSpaces,
      route_context: routeContext,
      space_context: spaceContext,
      project_name: effectiveProjectName || undefined,
      project_path: effectiveProjectPath || undefined,
      project_description: project?.description,
      projects_root: projectStore.projectsRoot,
      vibe: {
        goal,
        source: handoff.value?.source || route.query.source || 'vibe',
      },
      vibe_session: {
        session_id: session.value?.session_id,
        status: session.value?.status,
        current_phase: session.value?.current_phase,
        phase_plan: phasePlan,
        spaces: activeSpaces.value,
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

  async function replaceRouteSession(sessionId: string | null) {
    const nextQuery = {
      ...route.query,
      session: sessionId || undefined,
      autorun: undefined,
    }
    await router.replace({
      path: route.path,
      query: nextQuery,
    })
  }

  function promoteActiveStateToSession(sessionId: string, payload?: VibeSessionMeta) {
    const nextKey = sessionId.trim()
    if (!nextKey) return

    if (_activeKey.value !== nextKey) {
      const currentState = _state.value
      const currentKey = _activeKey.value
      _sessions.set(nextKey, currentState)
      if (currentKey === scopeKey.value) {
        _sessions.set(scopeKey.value, createEmptySessionState())
      }
      _activeKey.value = nextKey
      _state.value = getSessionState(nextKey)
    }

    if (payload) {
      _state.value.session = {
        ..._state.value.session,
        ...payload,
      }
    }

    if (route.query.session !== nextKey) {
      void replaceRouteSession(nextKey)
    }
  }

  async function refreshSavedSessions() {
    if (!isTauri.value) return
    isLoadingHistory.value = true
    try {
      const response = await sendRequest<{ sessions?: VibeStoredSession[] }>('vibe.session.list', {
        project_id: currentProjectId.value || undefined,
      })
      savedSessions.value = Array.isArray(response.sessions) ? response.sessions : []
    } catch (historyError) {
      if (!error.value) {
        error.value = historyError instanceof Error ? historyError.message : 'Failed to load Vibe sessions'
      }
    } finally {
      isLoadingHistory.value = false
    }
  }

  async function loadSession(sessionId: string, options?: { preserveRuntime?: boolean; silent?: boolean }) {
    const trimmed = sessionId.trim()
    if (!trimmed || !isTauri.value || loadingSessionIds.has(trimmed)) return

    loadingSessionIds.add(trimmed)
    try {
      const response = await sendRequest<VibeSessionDetails>('vibe.session.get', {
        session_id: trimmed,
      })
      const rebuilt = buildStateFromStoredSession(response)
      if (options?.preserveRuntime) {
        const current = getSessionState(trimmed)
        _sessions.set(trimmed, mergeStoredSessionState(current, rebuilt))
      } else {
        _sessions.set(trimmed, rebuilt)
      }
      if (_activeKey.value === trimmed) {
        _state.value = getSessionState(trimmed)
      }
      error.value = ''
    } catch (loadError) {
      if (!options?.silent) {
        error.value = loadError instanceof Error ? loadError.message : 'Failed to load Vibe session'
      }
    } finally {
      loadingSessionIds.delete(trimmed)
    }
  }

  async function openSession(sessionId: string) {
    if (!sessionId.trim()) return
    await replaceRouteSession(sessionId.trim())
  }

  async function deleteSession(sessionId: string) {
    const trimmed = sessionId.trim()
    if (!trimmed || !isTauri.value) return

    try {
      await sendRequest('vibe.session.delete', {
        session_id: trimmed,
      })

      savedSessions.value = savedSessions.value.filter(saved => saved.id !== trimmed)
      loadingSessionIds.delete(trimmed)
      _sessions.delete(trimmed)

      if (requestedSessionId.value === trimmed || session.value?.session_id === trimmed) {
        stopSessionPolling()
        const nextDraftState = createEmptySessionState()
        _sessions.set(scopeKey.value, nextDraftState)
        _activeKey.value = scopeKey.value
        _state.value = nextDraftState
        await replaceRouteSession(null)
        maybeHydrateDraft()
      }

      error.value = ''
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : 'Failed to delete Vibe session'
    }
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
    submittedGoal.value = text
    draft.value = ''

    const userMessage: VibeUiMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    const nextMessages = [...messages.value, userMessage]
    messages.value = nextMessages

    _state.value.abortController?.abort()
    _state.value.abortController = new AbortController()
    const currentGeneration = ++_state.value.generation

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

        const signal = _state.value.abortController?.signal
        if (signal) {
          if (signal.aborted) {
            finish()
            return
          }
          signal.addEventListener('abort', () => finish(), { once: true })
        }

        listen<VibeStreamChunk>('vibe-stream-chunk', (event) => {
          if (isDone || currentGeneration !== _state.value.generation) return
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
          if (_state.value.abortController?.signal.aborted) {
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
      void refreshSavedSessions()
    }
  }

  function handleChunk(
    chunk: VibeStreamChunk,
    hooks: { onAssistantText: (content: string) => void },
  ) {
    if (chunk.type === 'vibe.session') {
      const payload = (chunk.data || {}) as unknown as VibeSessionMeta
      if (payload.session_id) {
        promoteActiveStateToSession(payload.session_id, payload)
      }
      // Set currentProject so AssistantFloat can load designs/docs/tasks/files
      const sessionPath = payload.project_path?.trim()
      if (sessionPath && !projectStore.currentProject) {
        projectStore.openProject(sessionPath)
      }
    }

    applyChunkToState(_state.value, chunk, hooks)

    if (chunk.type === 'vibe.session' || chunk.type === 'orchestration.complete') {
      void refreshSavedSessions()
    }
  }

  async function maybeLoadRequestedSession() {
    if (!requestedSessionId.value) return
    await loadSession(requestedSessionId.value)
  }

  function resetSession() {
    _state.value.abortController?.abort()
    const nextDraftState = createEmptySessionState()
    _sessions.set(scopeKey.value, nextDraftState)
    _activeKey.value = scopeKey.value
    _state.value = nextDraftState
    void replaceRouteSession(null)
    maybeHydrateDraft()
  }

  function stopListening() {
    _state.value.abortController?.abort()
    status.value = 'Stopped listening'
    isRunning.value = false
  }

  function stopSessionPolling() {
    if (sessionPollHandle.value != null) {
      window.clearInterval(sessionPollHandle.value)
      sessionPollHandle.value = null
    }
  }

  async function refreshFilesystemArtifacts() {
    if (!isTauri.value) {
      filesystemArtifacts.value = []
      return
    }

    const projectRoot = session.value?.project_path?.trim()
    if (!projectRoot) {
      filesystemArtifacts.value = []
      return
    }

    const docsPath = `${projectRoot}/docs`

    try {
      const tauriFs = await import('@tauri-apps/plugin-fs')
      const exists = await tauriFs.exists(docsPath)
      if (!exists) {
        filesystemArtifacts.value = []
        return
      }

      const entries = await tauriFs.readDir(docsPath)
      const docEntries = entries
        .filter(entry => Boolean(entry.name) && !entry.isDirectory && entry.name!.toLowerCase().endsWith('.md'))
        .map((entry) => {
          const name = entry.name || 'document.md'
          const path = `${docsPath}/${name}`
          return {
            id: `fs-doc:${path}`,
            kind: 'implement',
            domain: 'docs',
            title: `docs/${name}`,
            executor: 'filesystem',
            preview: path,
          }
        })

      filesystemArtifacts.value = docEntries
    } catch {
      filesystemArtifacts.value = []
    }
  }

  async function refreshDesignArtifacts() {
    if (!isTauri.value) {
      designArtifactsFallback.value = []
      return
    }

    try {
      const response = await sendRequest<{ designs?: VibeStoredDesign[] }>('designs.list', {})
      const rawDesigns = Array.isArray(response.designs) ? response.designs : []
      const hintedNames = extractDesignNamesFromPhaseResults(phaseResults.value)
      let filteredDesigns = rawDesigns.filter(design =>
        hintedNames.some(name => normalizeDesignSearchText(design.name) === normalizeDesignSearchText(name)),
      )
      if (filteredDesigns.length === 0) {
        filteredDesigns = selectRelevantVibeDesigns(rawDesigns, {
          goal: session.value?.goal || submittedGoal.value,
          projectName: session.value?.project_name,
        })
      }

      designArtifactsFallback.value = filteredDesigns.slice(0, 6).map((design) => {
        const screenCount = Array.isArray(design.pages) ? design.pages.length : 0
        const nodeCount = Array.isArray(design.nodes) ? design.nodes.length : 0
        const previewBits = [`Design: ${design.name}`]
        if (screenCount > 0) {
          previewBits.push(`${screenCount} page${screenCount === 1 ? '' : 's'}`)
        }
        if (nodeCount > 0) {
          previewBits.push(`${nodeCount} node${nodeCount === 1 ? '' : 's'}`)
        }

        return {
          id: `design:${design.localId}`,
          kind: 'implement',
          domain: 'design',
          title: design.name,
          executor: 'design-storage',
          preview: previewBits.join(' · '),
          localId: design.localId,
        }
      })
    } catch {
      designArtifactsFallback.value = []
    }
  }

  function syncSessionPolling() {
    const sessionId = session.value?.session_id?.trim()
    const shouldPoll = Boolean(sessionId) && (
      isRunning.value ||
      !isTerminalSessionStatus(session.value?.status)
    )

    if (!shouldPoll || !sessionId) {
      stopSessionPolling()
      return
    }

    if (sessionPollHandle.value != null) {
      return
    }

    sessionPollHandle.value = window.setInterval(() => {
      void loadSession(sessionId, { preserveRuntime: true, silent: true })
      void refreshFilesystemArtifacts()
      void refreshDesignArtifacts()
    }, 2500)
    void loadSession(sessionId, { preserveRuntime: true, silent: true })
    void refreshFilesystemArtifacts()
    void refreshDesignArtifacts()
  }

  function maybeHydrateDraft() {
    if (requestedSessionId.value) return
    if (!draft.value.trim()) {
      draft.value = derivedGoal.value
    }
  }

  async function maybeAutoRun() {
    const shouldAutoRun = route.query.autorun === '1' || route.query.autorun === 'true'
    const goal = derivedGoal.value.trim()
    const key = `${route.fullPath}:${goal}`
    if (requestedSessionId.value || !shouldAutoRun || !goal || isRunning.value || messages.value.length > 0 || _state.value.autoRunKey === key) {
      return
    }
    _state.value.autoRunKey = key
    await nextTick()
    await submitPrompt(goal)
  }

  onMounted(async () => {
    await initAIModel()
    syncSessionState()
    await refreshSavedSessions()
    await maybeLoadRequestedSession()
    maybeHydrateDraft()
    await maybeAutoRun()
  })

  onBeforeUnmount(() => {
    stopSessionPolling()
  })

  watch(
    () => route.fullPath,
    async () => {
      syncSessionState()
      await refreshSavedSessions()
      await maybeLoadRequestedSession()
      maybeHydrateDraft()
      await maybeAutoRun()
    },
  )

  watch(
    () => [isRunning.value, session.value?.session_id, session.value?.status] as const,
    () => {
      syncSessionPolling()
    },
    { immediate: true },
  )

  watch(
    () => [session.value?.project_path, phaseResults.value.length, session.value?.status] as const,
    () => {
      // Sync project store so AssistantFloat can load designs/docs/tasks/files
      const sessionPath = session.value?.project_path?.trim()
      if (sessionPath && !projectStore.currentProject) {
        projectStore.openProject(sessionPath)
      }
      void refreshFilesystemArtifacts()
      void refreshDesignArtifacts()
    },
    { immediate: true },
  )

  // List of all active local session states (useful while iterating on Vibe)
  const activeSessions = computed(() => {
    const sessions: { key: string; goal: string; status: string; isRunning: boolean }[] = []
    for (const [key, state] of _sessions.entries()) {
      if (key === scopeKey.value && !state.messages.length && !state.isRunning && !state.session) {
        continue
      }
      if (state.messages.length > 0 || state.isRunning || state.session) {
        sessions.push({
          key,
          goal: state.session?.goal || state.submittedGoal || '',
          status: state.status,
          isRunning: state.isRunning,
        })
      }
    }
    return sessions
  })

  return {
    draft,
    submittedGoal,
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
    checkpoints,
    handoff,
    activeSpaces,
    verifyStatus,
    reviewStatus,
    artifacts,
    savedSessions,
    isLoadingHistory,
    activeSessions,
    sessionKey,
    openSession,
    deleteSession,
    refreshSavedSessions,
    submitPrompt,
    resetSession,
    stopListening,
  }
}

function buildStateFromStoredSession(details: VibeSessionDetails): VibeSessionState {
  const state = createEmptySessionState()
  const session = details.session

  if (session) {
    state.session = mapStoredSessionToMeta(session)
    state.submittedGoal = session.goal || ''
    state.status = formatStoredStatusLabel(session.status, session.current_phase)
    if (session.goal) {
      state.messages = [{
        id: `stored-user-${session.id}`,
        role: 'user',
        content: session.goal,
      }]
    }
  }

  state.checkpoints = Array.isArray(details.checkpoints) ? details.checkpoints : []

  for (const event of details.events || []) {
    applyChunkToState(state, {
      content: '',
      done: false,
      type: event.event_type,
      data: event.data || {},
    }, {
      onAssistantText: () => {},
    })
  }

  const finalSummary = extractSummaryMessage(state.phaseResults)
  if (finalSummary) {
    state.messages = [
      ...state.messages,
      {
        id: `stored-assistant-${session?.id || Date.now()}`,
        role: 'assistant',
        content: finalSummary,
      },
    ]
  }

  if (state.timeline.length === 0 && session) {
    appendTimelineEntry(state, {
      id: `stored-session-${session.id}`,
      kind: 'session',
      status: normalizeTimelineStatus(session.status),
      title: session.goal ? `Loaded session: ${session.goal}` : 'Loaded session',
      detail: session.current_phase || session.next_step,
    })
  }

  if (session) {
    state.status = formatStoredStatusLabel(session.status, session.current_phase)
  }

  return state
}

function mapStoredSessionToMeta(session: VibeStoredSession): VibeSessionMeta {
  return {
    session_id: session.id,
    project_id: session.project_id,
    goal: session.goal,
    source: session.source,
    status: session.status,
    current_phase: session.current_phase,
    session_type: session.session_type,
    autonomy_level: session.autonomy_level,
    project_name: session.project_name,
    project_path: session.project_path,
  }
}

function applyChunkToState(
  state: VibeSessionState,
  chunk: VibeStreamChunk,
  hooks: { onAssistantText: (content: string) => void },
) {
  const type = chunk.type || ''

  switch (type) {
    case 'vibe.session': {
      const payload = (chunk.data || {}) as unknown as VibeSessionMeta
      state.session = {
        ...state.session,
        ...payload,
      }
      if (payload.goal) state.status = `Planning ${payload.goal}`
      appendTimelineEntry(state, {
        id: `session-${payload.session_id || Date.now()}`,
        kind: 'session',
        status: 'started',
        title: payload.goal ? `Session started: ${payload.goal}` : 'Vibe session started',
        detail: payload.project_name || payload.project_path,
      })
      return
    }
    case 'progress':
      appendTimelineEntry(state, {
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
      state.plan = {
        phases,
        spaces,
        reason: typeof data.reason === 'string' ? data.reason : undefined,
      }
      if (state.session) {
        state.session = {
          ...state.session,
          status: 'planning',
          current_phase: 'plan',
        }
      }
      state.status = `Plan ready${phases.length ? ` (${phases.length} phases)` : ''}`
      appendTimelineEntry(state, {
        id: `plan-${Date.now()}`,
        kind: 'plan',
        status: 'completed',
        title: `Execution plan prepared${phases.length ? ` (${phases.length} phases)` : ''}`,
        detail: spaces.length ? `Spaces: ${spaces.join(', ')}` : state.plan.reason,
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
        state.phaseResults = upsertPhaseResult(state.phaseResults, result)
        applyPhaseResultSessionContext(state, result)
      }

      if (state.session) {
        state.session = {
          ...state.session,
          status: sessionStatusForPhaseEvent(phase.kind, phaseStatus),
          current_phase: formatPhaseLabel(phase.kind, phase.domain),
        }
      }

      state.status = `${capitalize(phaseStatus)} ${formatPhaseLabel(phase.kind, phase.domain)}`
      appendTimelineEntry(state, {
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
      state.phaseResults = results
      for (const result of results) {
        applyPhaseResultSessionContext(state, result)
      }
      if (state.session) {
        state.session = {
          ...state.session,
          status: normalizeSessionStatus(data.status),
          current_phase: 'summarize',
        }
      }
      state.status = typeof data.status === 'string' && data.status === 'blocked'
        ? 'Blocked after verification'
        : 'Execution finished'
      appendTimelineEntry(state, {
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
    case 'debug':
    case 'thinking':
    case 'tool_call':
    case 'tool_result':
    case 'tool_status':
    case 'tool_error':
    case 'session.started':
    case 'session.completed':
    case 'session.failed':
      return
    default:
      if (!type && chunk.content) {
        hooks.onAssistantText(chunk.content)
      }
  }
}

function appendTimelineEntry(state: VibeSessionState, entry: VibeTimelineEntry) {
  state.timeline = [...state.timeline, entry].slice(-MAX_TIMELINE_ENTRIES)
}

function extractSummaryMessage(results: VibePhaseResult[]): string {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index]
    if (result.kind === 'summarize' && result.content?.trim()) {
      return result.content.trim()
    }
  }
  return ''
}

function inferArtifactDomain(result: VibePhaseResult): string {
  const explicitDomain = (result.domain || '').trim().toLowerCase()
  if (explicitDomain) return explicitDomain

  const haystack = [
    result.phase_id,
    result.executor?.space,
    result.executor?.agent_id,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  if (haystack.includes('design')) return 'design'
  if (haystack.includes('docs') || haystack.includes('prd') || haystack.includes('readme') || haystack.includes('architecture')) return 'docs'
  if (haystack.includes('kanban') || haystack.includes('task')) return 'tasks'
  if (haystack.includes('code') || haystack.includes('scaffold') || haystack.includes('app shell')) return 'code'
  if (result.kind !== 'implement') return ''

  const content = (result.content || '').toLowerCase()
  if (content.includes('design')) return 'design'
  if (content.includes('docs') || content.includes('prd') || content.includes('readme') || content.includes('architecture')) return 'docs'
  if (content.includes('kanban') || content.includes('task')) return 'tasks'
  if (content.includes('code') || content.includes('scaffold') || content.includes('app shell')) return 'code'
  return ''
}

function normalizeTimelineStatus(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'complete':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    default:
      return 'running'
  }
}

function formatStoredStatusLabel(status?: string, currentPhase?: string): string {
  const normalized = (status || '').trim().toLowerCase()
  switch (normalized) {
    case 'complete':
      return 'Execution finished'
    case 'blocked':
      return 'Blocked after verification'
    case 'failed':
      return 'Session failed'
    case 'reviewing':
      return 'Reviewing outputs'
    case 'verifying':
      return 'Verifying outputs'
    case 'implementing':
      return 'Implementing changes'
    case 'setting_up':
      return 'Setting up project'
    case 'researching':
      return 'Researching context'
    case 'planning':
      return currentPhase ? `Planning ${currentPhase}` : 'Planning execution'
    default:
      return currentPhase ? capitalize(currentPhase.replace(/_/g, ' ')) : 'Ready'
  }
}

function applyPhaseResultSessionContext(state: VibeSessionState, result: VibePhaseResult) {
  if (!state.session) return
  const metadata = result.metadata || {}

  const projectName = typeof metadata.project_name === 'string' ? metadata.project_name.trim() : ''
  const projectPath = typeof metadata.project_path === 'string' ? metadata.project_path.trim() : ''

  if (!projectName && !projectPath) return

  state.session = {
    ...state.session,
    project_name: projectName || state.session.project_name,
    project_path: projectPath || state.session.project_path,
  }
}

function mergeStoredSessionState(current: VibeSessionState, stored: VibeSessionState): VibeSessionState {
  return {
    ...current,
    submittedGoal: stored.submittedGoal || current.submittedGoal,
    messages: stored.messages.length > current.messages.length ? stored.messages : current.messages,
    timeline: stored.timeline.length > 0 ? stored.timeline : current.timeline,
    plan: stored.plan || current.plan,
    phaseResults: stored.phaseResults.length > 0 ? stored.phaseResults : current.phaseResults,
    session: stored.session ? { ...current.session, ...stored.session } : current.session,
    status: stored.status || current.status,
    checkpoints: stored.checkpoints.length > 0 ? stored.checkpoints : current.checkpoints,
    error: current.error,
    isRunning: current.isRunning,
    abortController: current.abortController,
    autoRunKey: current.autoRunKey,
    generation: current.generation,
  }
}

function sessionStatusForPhaseEvent(kind: string, phaseStatus: string): string {
  switch (phaseStatus) {
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    default:
      break
  }

  switch ((kind || '').toLowerCase()) {
    case 'plan':
      return 'planning'
    case 'setup':
      return 'setting_up'
    case 'implement':
      return 'implementing'
    case 'verify':
      return 'verifying'
    case 'review':
      return 'reviewing'
    case 'summarize':
      return 'summarizing'
    case 'research':
      return 'researching'
    default:
      return 'running'
  }
}

function normalizeSessionStatus(status: unknown): string {
  switch (typeof status === 'string' ? status.toLowerCase() : '') {
    case 'completed':
      return 'complete'
    case 'blocked':
      return 'blocked'
    case 'failed':
      return 'failed'
    default:
      return 'complete'
  }
}

function isTerminalSessionStatus(status?: string): boolean {
  switch ((status || '').trim().toLowerCase()) {
    case 'complete':
    case 'blocked':
    case 'failed':
      return true
    default:
      return false
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

function selectRelevantVibeDesigns(
  designs: VibeStoredDesign[],
  context: { goal?: string; projectName?: string },
): VibeStoredDesign[] {
  if (designs.length === 0) return []

  const scoreDesign = (design: VibeStoredDesign) => {
    let score = 0
    const name = normalizeDesignSearchText(design.name)
    const projectName = normalizeDesignSearchText(context.projectName || '')
    const goalTokens = extractDesignSearchTokens(context.goal || '')

    if (projectName && name.includes(projectName)) score += 6
    for (const token of goalTokens) {
      if (name.includes(token)) score += 2
    }

    const updatedAt = design.updatedAt ? Date.parse(design.updatedAt) : 0
    return { score, updatedAt }
  }

  const scored = designs
    .map((design) => ({ design, ...scoreDesign(design) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score === left.score) return right.updatedAt - left.updatedAt
      return right.score - left.score
    })

  if (scored.length === 0) {
    return []
  }

  const topScore = scored[0].score
  return scored
    .filter((entry) => entry.score === topScore)
    .map((entry) => entry.design)
}

function normalizeDesignSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function extractDesignSearchTokens(value: string): string[] {
  return normalizeDesignSearchText(value)
    .split(/\s+/)
    .filter(token => token.length >= 4)
}

function extractDesignNamesFromPhaseResults(results: VibePhaseResult[]): string[] {
  const names = new Set<string>()
  for (const result of results) {
    if (inferArtifactDomain(result) !== 'design') continue
    const content = result.content || ''
    for (const match of content.matchAll(/\*\*([^*]+)\*\*/g)) {
      const candidate = match[1]?.trim()
      if (candidate) names.add(candidate)
    }
    for (const match of content.matchAll(/design named [`*"]?([^`*"\\n.]+)[`*"]?/gi)) {
      const candidate = match[1]?.trim()
      if (candidate) names.add(candidate)
    }
  }
  return [...names]
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
