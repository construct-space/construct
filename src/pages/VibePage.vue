<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useVibeEngine } from '@/composables/useVibeEngine'
import { buildProjectRoutePath } from '@/utils/projectRoutes'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const vibe = useVibeEngine()

// ─── Resizable split ───
const splitPercent = ref(50)
const isDragging = ref(false)
const containerRef = ref<HTMLElement>()

function onDividerMouseDown(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const pct = (x / rect.width) * 100
  splitPercent.value = Math.min(75, Math.max(25, pct))
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

function onDividerDblClick() {
  splitPercent.value = 50
}

// ─── Right panel tabs ───
type ArtifactTab = 'timeline' | 'files' | 'designs' | 'tasks' | 'docs'
const activeTab = ref<ArtifactTab>('timeline')

const tabs: { id: ArtifactTab; label: string; icon: string }[] = [
  { id: 'timeline', label: 'Timeline', icon: 'i-lucide-activity' },
  { id: 'files', label: 'Files', icon: 'i-lucide-file-code' },
  { id: 'designs', label: 'Designs', icon: 'i-lucide-palette' },
  { id: 'tasks', label: 'Tasks', icon: 'i-lucide-check-square' },
  { id: 'docs', label: 'Docs', icon: 'i-lucide-file-text' },
]

// ─── Artifact filtering ───
const fileArtifacts = computed(() =>
  vibe.artifacts.value.filter(a => a.domain === 'code' || (a.kind === 'implement' && !a.domain))
)
const designArtifacts = computed(() =>
  vibe.artifacts.value.filter(a => a.domain === 'design')
)
const taskArtifacts = computed(() =>
  vibe.artifacts.value.filter(a => a.domain === 'kanban' || a.domain === 'tasks')
)
const docArtifacts = computed(() =>
  vibe.artifacts.value.filter(a => a.domain === 'docs' || a.kind === 'review' || a.kind === 'verify')
)

// ─── Artifact content parsing ───
type ContentPart = { type: 'text'; text: string } | { type: 'file'; text: string; path: string; name: string }

function parseArtifactContent(text: string): ContentPart[] {
  // Match file paths like `/Users/.../something.ext` or backtick-wrapped paths
  const pathRegex = /`?(\/[\w./-]+\.\w+)`?/g
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const fullPath = match[1]
    const fileName = fullPath.split('/').pop() || fullPath
    parts.push({ type: 'file', text: fileName, path: fullPath, name: fileName })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', text }]
}

function openFile(filePath: string) {
  const raw = route.params.projectId
  const projectId = typeof raw === 'string' && raw ? raw : ''
  const base = projectId ? `/app/projects/${projectId}` : '/app'

  // Route to the correct space based on file path
  const parts = filePath.split('/')
  let space = 'code'
  for (const part of parts) {
    if (part === 'docs' || part === 'notes') { space = 'docs'; break }
    if (part === 'design') { space = 'design'; break }
    if (part === 'kanban') { space = 'kanban'; break }
  }

  router.push(`${base}/${space}?file=${encodeURIComponent(filePath)}`)
}

function artifactSpaceLabel(domain: string) {
  switch (domain) {
    case 'code':
      return 'Open Code'
    case 'design':
      return 'Open Design'
    case 'docs':
      return 'Open Docs'
    case 'kanban':
    case 'tasks':
      return 'Open Tasks'
    default:
      return 'Open Space'
  }
}

function artifactSpaceTarget(domain: string) {
  switch (domain) {
    case 'code':
      return 'code'
    case 'design':
      return 'design'
    case 'docs':
      return 'docs'
    case 'kanban':
    case 'tasks':
      return 'kanban'
    default:
      return ''
  }
}

function openArtifactSpace(domain: string) {
  openArtifactSpaceForArtifact({ domain, preview: '' })
}

function openArtifactSpaceForArtifact(artifact: { domain: string; preview: string; localId?: string; title?: string }) {
  const targetSpace = artifactSpaceTarget(artifact.domain)
  if (!targetSpace) return

  const projectPath = vibe.session.value?.project_path?.trim()
    || vibe.currentProject.value?.path
    || vibe.currentProject.value?.local_path
    || ''
  if (!projectPath) return

  const project = projectStore.openProject(projectPath)
  const base = buildProjectRoutePath(project)
  if (artifact.domain === 'design' && artifact.localId) {
    router.push({
      path: `${base}/design/editor`,
      query: {
        localId: artifact.localId,
        name: artifact.title || undefined,
      },
    })
    return
  }

  router.push(`${base}/${targetSpace}`)
}

function artifactOpenPath(artifact: { domain: string; preview: string }) {
  const firstFilePart = parseArtifactContent(artifact.preview).find(part => part.type === 'file')
  if (firstFilePart?.type === 'file') {
    return firstFilePart.path
  }

  const projectPath = vibe.session.value?.project_path?.trim()
  if (!projectPath) return ''

  switch (artifact.domain) {
    case 'code':
      return `${projectPath}/code`
    case 'design':
      return `${projectPath}/design`
    case 'docs':
      return `${projectPath}/docs`
    case 'kanban':
    case 'tasks':
      return `${projectPath}/kanban`
    default:
      return ''
  }
}

const projectRoute = computed(() => {
  const raw = route.params.projectId
  return typeof raw === 'string' && raw ? `/app/projects/${raw}` : ''
})

const architectRoute = computed(() => {
  return projectRoute.value ? `${projectRoute.value}/architect` : '/app/architect'
})

const sourceLabel = computed(() => {
  const source = vibe.session.value?.source || vibe.handoff.value?.source || route.query.source
  if (typeof source !== 'string' || !source) return 'manual'
  return source.replace(/[-_]/g, ' ')
})

const hasSession = computed(() => vibe.session.value || vibe.messages.value.length > 0 || vibe.timeline.value.length > 0)

// Filter out the first user message if it duplicates the goal shown in the header
const displayMessages = computed(() => {
  const msgs = vibe.messages.value
  if (msgs.length > 0 && msgs[0].role === 'user') {
    const goal = (vibe.session.value?.goal || vibe.submittedGoal.value || '').trim()
    if (goal && msgs[0].content.trim() === goal) {
      return msgs.slice(1)
    }
  }
  return msgs
})

function submitDraft() {
  vibe.submitPrompt()
}

function formatSessionTime(value?: string) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function sessionStatusClass(status?: string) {
  switch ((status || '').toLowerCase()) {
    case 'complete':
      return 'bg-emerald-500/10 text-emerald-200'
    case 'blocked':
      return 'bg-amber-500/10 text-amber-200'
    case 'failed':
      return 'bg-red-500/10 text-red-200'
    default:
      return 'bg-white/8 text-app-muted'
  }
}

function openSavedSession(sessionId: string) {
  void vibe.openSession(sessionId)
}

function deleteSavedSession(sessionId: string) {
  void vibe.deleteSession(sessionId)
}

function refreshHistory() {
  void vibe.refreshSavedSessions()
}
</script>

<template>
  <DashboardPanel :grow="true" :ui="{ body: '!p-0 !overflow-hidden' }">
    <template #body>
      <div class="flex flex-col overflow-hidden" style="height: calc(100vh - 72px)">
        <!-- Initial state: split view with prompt on the left and session history on the right -->
        <div v-if="!hasSession && !vibe.isRunning.value" class="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div class="flex min-h-0 flex-1 items-center justify-center px-6 py-8 lg:px-10 xl:px-14">
            <div class="w-full max-w-2xl space-y-6">
              <div class="space-y-4">
                <div class="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-400/10">
                  <Icon name="i-lucide-zap" class="size-7 text-amber-400" />
                </div>
                <div class="space-y-2">
                  <h1 class="text-3xl font-bold tracking-tight text-app-foreground">
                    {{ vibe.currentProject.value?.name ? `Vibe on ${vibe.currentProject.value.name}` : 'What should Vibe build?' }}
                  </h1>
                  <p class="max-w-xl text-sm leading-7 text-app-muted">
                    Describe a goal and Vibe will research, plan, implement, verify, and summarize in one execution flow.
                  </p>
                </div>
              </div>

              <div class="rounded-3xl border border-app bg-white/[0.04] p-4 sm:p-5">
                <p class="text-[11px] uppercase tracking-[0.18em] text-app-muted/70">Goal</p>
                <div class="mt-3 relative">
                  <textarea
                    v-model="vibe.draft.value"
                    class="w-full rounded-2xl bg-[color-mix(in_srgb,var(--app-background),white_6%)] px-4 py-3 text-sm text-app-foreground placeholder-app-muted/40 outline-none focus:ring-1 focus:ring-amber-400/30 resize-none transition-colors"
                    placeholder="e.g. Build the onboarding flow with auth, design the screens, and verify the build..."
                    rows="5"
                    @keydown.enter.meta.prevent="submitDraft()"
                    @keydown.enter.ctrl.prevent="submitDraft()"
                  />
                </div>

                <div v-if="vibe.error.value" class="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                  <div class="flex items-start gap-2">
                    <Icon name="i-lucide-alert-circle" class="size-4 text-red-400 mt-0.5 shrink-0" />
                    <p class="text-sm text-red-300 flex-1">{{ vibe.error.value }}</p>
                  </div>
                </div>

                <div class="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    class="flex-1 rounded-2xl py-3 text-sm font-semibold transition-all duration-200"
                    :class="vibe.draft.value.trim()
                      ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                      : 'bg-[color-mix(in_srgb,var(--app-background),white_6%)] text-app-muted/40 cursor-not-allowed'"
                    :disabled="!vibe.draft.value.trim()"
                    @click="submitDraft()"
                  >
                    Start Vibing
                  </button>
                  <button
                    class="rounded-2xl border border-app bg-white/5 px-5 py-3 text-sm font-medium text-app transition hover:bg-white/8"
                    @click="router.push(architectRoute)"
                  >
                    <Icon name="i-lucide-compass" class="size-4 inline mr-1.5" />
                    Architect
                  </button>
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  class="rounded-2xl border border-app bg-white/[0.03] px-4 py-3 text-left text-sm text-app transition hover:bg-white/[0.06]"
                  @click="vibe.draft.value = 'Build the first vertical slice from the current handoff and verify it end to end.'"
                >
                  Build first vertical slice
                </button>
                <button
                  class="rounded-2xl border border-app bg-white/[0.03] px-4 py-3 text-left text-sm text-app transition hover:bg-white/[0.06]"
                  @click="vibe.draft.value = 'Research the current project, plan the next milestone, implement it, and review the result.'"
                >
                  Plan and implement next milestone
                </button>
              </div>

              <div v-if="vibe.handoff.value" class="rounded-2xl border border-amber-400/20 bg-amber-400/6 px-4 py-3">
                <p class="text-[11px] uppercase tracking-[0.16em] text-amber-200/80">Architect handoff attached</p>
                <p class="mt-1 text-sm leading-6 text-app-muted">{{ vibe.handoff.value.description?.slice(0, 160) }}</p>
              </div>
            </div>
          </div>

          <aside class="flex min-h-0 w-full flex-col border-t border-app bg-black/10 lg:w-[420px] lg:border-l lg:border-t-0 xl:w-[460px]">
            <div class="shrink-0 border-b border-app px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Recent Sessions</p>
                  <p class="mt-1 text-sm text-app-muted">Resume previous Vibe runs instead of starting cold.</p>
                </div>
                <button
                  class="rounded-lg border border-app bg-white/5 px-3 py-1.5 text-[12px] font-medium text-app transition hover:bg-white/8"
                  :disabled="vibe.isLoadingHistory.value"
                  @click="refreshHistory()"
                >
                  <Icon name="i-lucide-refresh-cw" class="size-3 inline mr-1" />
                  Refresh
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div v-if="vibe.isLoadingHistory.value" class="rounded-2xl border border-dashed border-app bg-black/10 px-4 py-3 text-sm text-app-muted">
                Loading Vibe history...
              </div>

              <div v-else-if="vibe.savedSessions.value.length === 0" class="rounded-2xl border border-dashed border-app bg-black/10 px-4 py-3 text-sm text-app-muted">
                No saved sessions yet. Your next Vibe run will appear here.
              </div>

              <div v-else class="space-y-2">
                <article
                  v-for="saved in vibe.savedSessions.value"
                  :key="saved.id"
                  class="rounded-2xl border border-app bg-black/10 px-4 py-3 transition hover:bg-white/[0.06]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <button
                      class="min-w-0 flex-1 text-left"
                      @click="openSavedSession(saved.id)"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium text-app">{{ saved.goal || 'Untitled Vibe session' }}</p>
                          <p class="mt-1 text-[12px] text-app-muted">
                            {{ saved.project_name || 'Global session' }} · {{ formatSessionTime(saved.updated_at) }}
                          </p>
                        </div>
                        <span
                          class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
                          :class="sessionStatusClass(saved.status)"
                        >
                          {{ saved.status || 'saved' }}
                        </span>
                      </div>
                      <p v-if="saved.current_phase" class="mt-2 text-[12px] text-app-muted/75">
                        Current phase: {{ saved.current_phase }}
                      </p>
                    </button>

                    <button
                      class="shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200 transition hover:bg-red-500/15"
                      title="Delete session from history"
                      @click.stop="deleteSavedSession(saved.id)"
                    >
                      <Icon name="i-lucide-trash-2" class="size-3.5" />
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </aside>
        </div>

        <!-- Active session: split-panel layout like Architect -->
        <template v-else>
          <div ref="containerRef" class="flex-1 flex min-h-0" :class="isDragging && 'select-none'">
            <!-- LEFT PANEL: Conversation -->
            <div
              class="flex flex-col min-w-0 min-h-0 overflow-hidden"
              :style="{ width: splitPercent + '%' }"
            >
              <div class="flex-1 flex flex-col min-h-0 p-4">
                <!-- Header bar -->
                <div class="flex items-center justify-between gap-3 mb-4">
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">
                      <Icon name="i-lucide-zap" class="size-3" />
                      Vibe
                    </div>
                    <span v-if="vibe.currentProject.value?.name" class="text-sm font-medium text-app">{{ vibe.currentProject.value.name }}</span>
                    <span class="rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">{{ vibe.status.value }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="rounded-lg border border-app bg-white/5 px-3 py-1.5 text-[12px] font-medium text-app transition hover:bg-white/8"
                      :disabled="vibe.isRunning.value"
                      @click="vibe.resetSession()"
                    >
                      <Icon name="i-lucide-rotate-ccw" class="size-3 inline mr-1" />
                      New
                    </button>
                    <button
                      class="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                      :class="vibe.isRunning.value
                        ? 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                        : 'bg-amber-400 text-black hover:bg-amber-300'"
                      @click="vibe.isRunning.value ? vibe.stopListening() : submitDraft()"
                    >
                      <Icon :name="vibe.isRunning.value ? 'i-lucide-square' : 'i-lucide-play'" class="size-3 inline mr-1" />
                      {{ vibe.isRunning.value ? 'Stop' : 'Run' }}
                    </button>
                  </div>
                </div>

                <!-- Goal banner -->
                <div class="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/6 px-4 py-3">
                  <p class="text-[11px] uppercase tracking-[0.16em] text-amber-200/80">Goal</p>
                  <p class="mt-1 text-sm leading-6 text-app">
                    {{ vibe.session.value?.goal || vibe.submittedGoal.value || vibe.draft.value || 'Waiting for goal...' }}
                  </p>
                </div>

                <!-- Messages -->
                <div class="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div v-if="displayMessages.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">Session started. Waiting for execution events...</p>
                  </div>
                  <div v-else class="space-y-3">
                    <article
                      v-for="message in displayMessages"
                      :key="message.id"
                      class="rounded-2xl border px-4 py-3"
                      :class="message.role === 'user'
                        ? 'ml-4 border-app bg-[var(--app-accent)]/10'
                        : 'mr-4 border-app bg-white/[0.03]'"
                    >
                      <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">
                        {{ message.role === 'user' ? 'You' : 'Vibe' }}
                      </p>
                      <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-app">{{ message.content }}</p>
                    </article>
                  </div>
                </div>

                <!-- Input -->
                <div class="mt-4 border-t border-app pt-4">
                  <div class="flex gap-2">
                    <textarea
                      v-model="vibe.draft.value"
                      rows="2"
                      class="flex-1 rounded-xl border border-app bg-black/10 px-4 py-2.5 text-sm text-app outline-none transition placeholder:text-app-muted/45 focus:border-amber-400/30 focus:ring-1 focus:ring-amber-400/20 resize-none"
                      placeholder="Follow up or change direction..."
                      @keydown.meta.enter.prevent="submitDraft()"
                      @keydown.ctrl.enter.prevent="submitDraft()"
                    />
                    <button
                      class="self-end rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
                      :disabled="!vibe.draft.value.trim() || vibe.isRunning.value"
                      @click="submitDraft()"
                    >
                      <Icon name="i-lucide-arrow-up" class="size-4" />
                    </button>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <p class="text-[11px] uppercase tracking-[0.15em] text-app-muted/65">
                      {{ vibe.handoff.value ? 'Handoff attached' : sourceLabel }}
                    </p>
                    <p class="text-[11px] text-app-muted/50">
                      {{ vibe.routeInfo.value?.model || 'auto' }}
                    </p>
                  </div>
                  <p v-if="vibe.error.value" class="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                    {{ vibe.error.value }}
                  </p>
                </div>
              </div>
            </div>

            <!-- RESIZE DIVIDER -->
            <div
              class="w-1 shrink-0 cursor-col-resize group relative flex items-center justify-center hover:bg-amber-400/10 transition-colors"
              :class="isDragging && 'bg-amber-400/10'"
              @mousedown="onDividerMouseDown"
              @dblclick="onDividerDblClick"
            >
              <div
                class="w-px h-full group-hover:w-0.5 rounded-full transition-all"
                :class="isDragging ? 'w-0.5 bg-amber-400/40' : 'bg-[var(--app-border)]/20 group-hover:bg-amber-400/30'"
              />
            </div>

            <!-- RIGHT PANEL: Tabbed artifacts -->
            <div class="min-h-0 overflow-hidden flex-1 flex flex-col">
              <!-- Tab bar -->
              <div class="shrink-0 flex items-center gap-1 border-b border-app px-3 py-2">
                <button
                  v-for="tab in tabs"
                  :key="tab.id"
                  class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                  :class="activeTab === tab.id
                    ? 'bg-amber-400/15 text-amber-200'
                    : 'text-app-muted hover:text-app hover:bg-white/5'"
                  @click="activeTab = tab.id"
                >
                  <Icon :name="tab.icon" class="size-3.5" />
                  {{ tab.label }}
                </button>
              </div>

              <!-- Tab content -->
              <div class="flex-1 overflow-y-auto p-4">
                <!-- Timeline tab -->
                <div v-if="activeTab === 'timeline'" class="space-y-3">
                  <!-- Phase plan summary -->
                  <div v-if="vibe.plan.value" class="rounded-2xl border border-app bg-black/10 px-4 py-3">
                    <p class="text-[11px] uppercase tracking-[0.16em] text-app-muted/70">Execution Plan</p>
                    <p class="mt-1 text-[12px] text-app-muted">{{ vibe.plan.value.reason }}</p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <span
                        v-for="phase in vibe.plan.value.phases"
                        :key="phase.id"
                        class="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-app-muted"
                      >
                        {{ phase.kind }}<span v-if="phase.domain" class="text-amber-200/60">:{{ phase.domain }}</span>
                      </span>
                    </div>
                  </div>

                  <!-- Status cards -->
                  <div class="grid gap-2 grid-cols-3">
                    <div class="rounded-xl border border-app bg-black/10 px-3 py-2">
                      <p class="text-[10px] uppercase tracking-[0.14em] text-app-muted/70">Spaces</p>
                      <p class="mt-1 text-[12px] text-app">{{ vibe.activeSpaces.value.length ? vibe.activeSpaces.value.join(', ') : '—' }}</p>
                    </div>
                    <div class="rounded-xl border border-app bg-black/10 px-3 py-2">
                      <p class="text-[10px] uppercase tracking-[0.14em] text-app-muted/70">Verify</p>
                      <p class="mt-1 text-[12px] font-medium" :class="vibe.verifyStatus.value === 'PASS' ? 'text-emerald-300' : vibe.verifyStatus.value === 'FAIL' ? 'text-red-300' : 'text-app'">{{ vibe.verifyStatus.value || '—' }}</p>
                    </div>
                    <div class="rounded-xl border border-app bg-black/10 px-3 py-2">
                      <p class="text-[10px] uppercase tracking-[0.14em] text-app-muted/70">Review</p>
                      <p class="mt-1 text-[12px] font-medium text-app">{{ vibe.reviewStatus.value || '—' }}</p>
                    </div>
                  </div>

                  <!-- Timeline entries -->
                  <div v-if="vibe.timeline.value.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">Execution events will appear here in real time.</p>
                  </div>
                  <div v-else class="space-y-2">
                    <article
                      v-for="entry in vibe.timeline.value"
                      :key="entry.id"
                      class="rounded-xl border border-app bg-white/[0.03] px-3 py-2.5"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-[10px] uppercase tracking-[0.16em] text-app-muted/65">{{ entry.kind }}</p>
                          <p class="mt-0.5 text-[13px] font-medium text-app truncate">{{ entry.title }}</p>
                        </div>
                        <span
                          class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
                          :class="entry.status === 'failed' || entry.status === 'blocked'
                            ? 'bg-red-500/10 text-red-200'
                            : entry.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-200'
                              : 'bg-white/8 text-app-muted'"
                        >
                          {{ entry.status }}
                        </span>
                      </div>
                      <p v-if="entry.detail" class="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-app-muted">{{ entry.detail }}</p>
                    </article>
                  </div>
                </div>

                <!-- Files tab -->
                <div v-else-if="activeTab === 'files'" class="space-y-3">
                  <div v-if="fileArtifacts.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">No file artifacts yet. Files created during implementation will appear here.</p>
                  </div>
                  <article
                    v-for="artifact in fileArtifacts"
                    :key="artifact.id"
                    class="rounded-xl border border-app bg-white/[0.03] px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-[13px] font-medium text-app">{{ artifact.title }}</p>
                      <div class="flex items-center gap-2">
                        <button
                          class="rounded-lg border border-app bg-white/5 px-2.5 py-1 text-[11px] font-medium text-app transition hover:bg-white/8"
                          @click="openArtifactSpaceForArtifact(artifact)"
                        >
                          {{ artifactSpaceLabel(artifact.domain || 'code') }}
                        </button>
                        <span class="text-[10px] uppercase tracking-[0.16em] text-app-muted">{{ artifact.executor }}</span>
                      </div>
                    </div>
                    <p v-if="artifactOpenPath(artifact)" class="mt-1 text-[11px] text-app-muted/70">
                      {{ artifactOpenPath(artifact) }}
                    </p>
                    <div class="mt-1.5 text-[12px] leading-5 text-app-muted">
                      <template v-for="(part, pi) in parseArtifactContent(artifact.preview)" :key="pi">
                        <button v-if="part.type === 'file'" class="inline-flex items-center gap-1 rounded bg-[var(--app-accent)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent)]/20 transition-colors cursor-pointer" @click="openFile(part.path!)">
                          <span class="i-lucide-file-code h-3 w-3 opacity-60" />{{ part.name }}
                        </button>
                        <span v-else class="whitespace-pre-wrap">{{ part.text }}</span>
                      </template>
                    </div>
                  </article>
                </div>

                <!-- Designs tab -->
                <div v-else-if="activeTab === 'designs'" class="space-y-3">
                  <div v-if="designArtifacts.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">No design artifacts yet. Screens and components created during design phases will appear here.</p>
                  </div>
                  <article
                    v-for="artifact in designArtifacts"
                    :key="artifact.id"
                    class="rounded-xl border border-app bg-white/[0.03] px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-[13px] font-medium text-app">{{ artifact.title }}</p>
                      <div class="flex items-center gap-2">
                        <button
                          class="rounded-lg border border-app bg-white/5 px-2.5 py-1 text-[11px] font-medium text-app transition hover:bg-white/8"
                          @click="openArtifactSpaceForArtifact(artifact)"
                        >
                          {{ artifactSpaceLabel(artifact.domain || 'design') }}
                        </button>
                        <span class="text-[10px] uppercase tracking-[0.16em] text-app-muted">{{ artifact.executor }}</span>
                      </div>
                    </div>
                    <p v-if="artifactOpenPath(artifact)" class="mt-1 text-[11px] text-app-muted/70">
                      {{ artifactOpenPath(artifact) }}
                    </p>
                    <div class="mt-1.5 text-[12px] leading-5 text-app-muted">
                      <template v-for="(part, pi) in parseArtifactContent(artifact.preview)" :key="pi">
                        <button v-if="part.type === 'file'" class="inline-flex items-center gap-1 rounded bg-[var(--app-accent)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent)]/20 transition-colors cursor-pointer" @click="openFile(part.path!)">
                          <span class="i-lucide-palette h-3 w-3 opacity-60" />{{ part.name }}
                        </button>
                        <span v-else class="whitespace-pre-wrap">{{ part.text }}</span>
                      </template>
                    </div>
                  </article>
                </div>

                <!-- Tasks tab -->
                <div v-else-if="activeTab === 'tasks'" class="space-y-3">
                  <div v-if="taskArtifacts.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">No task artifacts yet. Tasks created during execution will appear here.</p>
                  </div>
                  <article
                    v-for="artifact in taskArtifacts"
                    :key="artifact.id"
                    class="rounded-xl border border-app bg-white/[0.03] px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-[13px] font-medium text-app">{{ artifact.title }}</p>
                      <div class="flex items-center gap-2">
                        <button
                          class="rounded-lg border border-app bg-white/5 px-2.5 py-1 text-[11px] font-medium text-app transition hover:bg-white/8"
                          @click="openArtifactSpaceForArtifact(artifact)"
                        >
                          {{ artifactSpaceLabel(artifact.domain || 'tasks') }}
                        </button>
                        <span class="text-[10px] uppercase tracking-[0.16em] text-app-muted">{{ artifact.executor }}</span>
                      </div>
                    </div>
                    <p v-if="artifactOpenPath(artifact)" class="mt-1 text-[11px] text-app-muted/70">
                      {{ artifactOpenPath(artifact) }}
                    </p>
                    <div class="mt-1.5 text-[12px] leading-5 text-app-muted">
                      <template v-for="(part, pi) in parseArtifactContent(artifact.preview)" :key="pi">
                        <button v-if="part.type === 'file'" class="inline-flex items-center gap-1 rounded bg-[var(--app-accent)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent)]/20 transition-colors cursor-pointer" @click="openFile(part.path!)">
                          <span class="i-lucide-check-square h-3 w-3 opacity-60" />{{ part.name }}
                        </button>
                        <span v-else class="whitespace-pre-wrap">{{ part.text }}</span>
                      </template>
                    </div>
                  </article>
                </div>

                <!-- Docs tab -->
                <div v-else-if="activeTab === 'docs'" class="space-y-3">
                  <div v-if="docArtifacts.length === 0" class="rounded-2xl border border-dashed border-app bg-white/[0.03] p-5">
                    <p class="text-sm text-app-muted">No doc artifacts yet. Documentation created during execution will appear here.</p>
                  </div>
                  <article
                    v-for="artifact in docArtifacts"
                    :key="artifact.id"
                    class="rounded-xl border border-app bg-white/[0.03] px-3 py-2.5"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-[13px] font-medium text-app">{{ artifact.title }}</p>
                      <div class="flex items-center gap-2">
                        <button
                          class="rounded-lg border border-app bg-white/5 px-2.5 py-1 text-[11px] font-medium text-app transition hover:bg-white/8"
                          @click="openArtifactSpaceForArtifact(artifact)"
                        >
                          {{ artifactSpaceLabel(artifact.domain || 'docs') }}
                        </button>
                        <span class="text-[10px] uppercase tracking-[0.16em] text-app-muted">{{ artifact.executor }}</span>
                      </div>
                    </div>
                    <p v-if="artifactOpenPath(artifact)" class="mt-1 text-[11px] text-app-muted/70">
                      {{ artifactOpenPath(artifact) }}
                    </p>
                    <div class="mt-1.5 text-[12px] leading-5 text-app-muted">
                      <template v-for="(part, pi) in parseArtifactContent(artifact.preview)" :key="pi">
                        <button
                          v-if="part.type === 'file'"
                          class="inline-flex items-center gap-1 rounded bg-[var(--app-accent)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[var(--app-accent)] hover:bg-[var(--app-accent)]/20 transition-colors cursor-pointer"
                          @click="openFile(part.path!)"
                        >
                          <span class="i-lucide-file-text h-3 w-3 opacity-60" />
                          {{ part.name }}
                        </button>
                        <span v-else class="whitespace-pre-wrap">{{ part.text }}</span>
                      </template>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </DashboardPanel>
</template>
