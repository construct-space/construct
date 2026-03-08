<script setup lang="ts">
/**
 * Architect Space - AI-powered project planning
 *
 * Flow:
 * 1. User describes project
 * 2. AI generates only relevant contextual questions (skips obvious ones)
 * 3. User clicks through questions instantly (local, no waiting)
 * 4. AI generates project plan from all answers
 * 5. Summary → Create Project
 *
 * Uses the 'architect' agent (agent_id) for model tier routing.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useToolbar } from '@/composables/useToolbar'
import { useToast } from '@/composables/useToast'
import { useContextService } from '@/composables/useContextService'
import { useAIModel } from '@/composables/useAIModel'
import type { InterviewQuestion } from '@/utils/architect-knowledge'
import type { ArchitectPlan, DocumentType } from '@/utils/documentsGenerator'
import type { SpaceType } from '@/types/project'
import { useArchitectKickoff, mapFrontendToTemplate, mapBackendToTemplate } from '@/composables/useArchitectKickoff'
import ArchitectDescribeStep from '@/components/architect/ArchitectDescribeStep.vue'
import ArchitectLoadingStep from '@/components/architect/ArchitectLoadingStep.vue'
import ArchitectInterviewStep from '@/components/architect/ArchitectInterviewStep.vue'
import ArchitectPlanSummary from '@/components/architect/ArchitectPlanSummary.vue'
import ArchitectProjectConfig from '@/components/architect/ArchitectProjectConfig.vue'

const router = useRouter()
const projectStore = useProjectStore()
const { setPageItems, clearToolbar } = useToolbar()

const toast = useToast()
const { kickoff, generateSuggestedTasks, isKicking, progress: kickoffProgress, progressMessage } = useArchitectKickoff()

// Abort controller for cancelling in-flight AI requests
let abortController: AbortController | null = null

/**
 * Architect streaming call:
 * - emits status events quickly (no frozen UI)
 * - returns a deterministic final JSON payload
 * - bypasses conductor/tool orchestration path
 */
async function architectChat(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  signal?: AbortSignal,
  onStatus?: (status: string) => void,
): Promise<string> {
  const { chatStream, isTauri } = useContextService()

  if (!isTauri.value) {
    throw new Error('AI requires the Construct desktop app. Run the app in Tauri to use the Architect.')
  }

  if (signal?.aborted) throw new Error('Cancelled')

  let content = ''
  let streamError: string | null = null

  await chatStream(
    { model, messages, space: 'architect', agent_id: 'architect', max_iterations: 1, include_space_context: false },
    (chunk) => {
      console.log('[Architect] chunk:', chunk.type, chunk.content?.substring(0, 100))
      if (chunk.error) { streamError = chunk.error; return }
      // Only accumulate actual content chunks — skip progress/debug/thinking/tool messages
      if (chunk.type === 'progress' || chunk.type === 'debug' || chunk.type === 'thinking' || chunk.type === 'tool_call' || chunk.type === 'tool_result') {
        if (chunk.content) onStatus?.(chunk.content)
        return
      }
      if (chunk.content) {
        content += chunk.content
        onStatus?.('Working...')
      }
    },
    { signal },
  )

  if (signal?.aborted) throw new Error('Cancelled')
  if (streamError) throw new Error(streamError)
  if (!content.trim()) throw new Error('Empty response from AI. Check your AI provider settings.')
  return content
}

// Architect system prompt — embedded here because ai.chat_direct bypasses the agent pipeline
const ARCHITECT_SYSTEM_PROMPT = `You are a project architect for Construct, a project planning tool. You produce ONLY raw JSON — no markdown fences, no explanation text, no preamble. The user message starts with a mode tag: [GENERATE_QUESTIONS], [GENERATE_SPACE_QUESTIONS], or [GENERATE_PLAN].

## [GENERATE_QUESTIONS] mode
Generate 3-6 contextual questions. SKIP obvious answers:
- Landing page / website / blog / SEO → platform is obviously web, don't ask
- "mobile app" → obviously mobile, don't ask
- "static site" / "landing page" → no backend needed, don't ask
- No mention of users/login/auth → skip auth question
Use IDs: platform, frontend, backend, database, auth, designStyle, features, deployment, spaces.
Always include a "spaces" question (type: "multi") for which Construct workspaces to enable:
- code (Code editor), design (Visual design canvas), docs (Documentation), notes (Scratchpad), kanban (Task board), git (Version control), terminal (Terminal), chat (AI chat)
Icons: i-lucide-code, i-lucide-palette, i-lucide-file-text, i-lucide-sticky-note, i-lucide-kanban, i-lucide-git-branch, i-lucide-terminal, i-lucide-message-circle.
Rules: 3-6 options per question with icon + description. Icons: "i-lucide-*" or "i-simple-icons-*" for brands. Types: "single" or "multi". Be conversational. No "other" option.
Return ONLY: [{"type":"single","id":"frontend","question":"...","options":[{"value":"nuxt","label":"Nuxt.js","icon":"i-simple-icons-nuxtdotjs","description":"Vue SSR with great SEO"}]}]

## [GENERATE_SPACE_QUESTIONS] mode
Given selected spaces and current answers, generate 1-3 focused follow-up questions that are directly relevant to selected spaces.
Examples:
- design space selected -> ask mood/style direction or visual references
- docs space selected -> ask docs depth/type preference
- git space selected -> ask branching/release strategy
- code space selected -> ask code quality/workflow preference
Rules: concise, actionable, no duplicates with existing question IDs. Use IDs prefixed with the space when possible (e.g., design_styleDirection, docs_docDepth, git_workflow). Return ONLY a JSON array of questions using the same schema.

## [GENERATE_PLAN] mode
Generate a project plan from description + interview answers.
The "decisions" object must ONLY use keys from the interview (exact question IDs). Use the exact option "value" field (not the label) for each answer. Arrays for multi-select, strings for single.
Include: project name (2-4 words), description (1 sentence), decisions, PRD (overview, targetUsers, coreFeatures, techRationale, mvpScope, futureConsiderations).
Return ONLY: {"name":"...","description":"...","decisions":{"frontend":"nuxt","spaces":["code","design"]},"prd":{"overview":"...","targetUsers":"...","coreFeatures":["..."],"techRationale":"...","mvpScope":["..."],"futureConsiderations":["..."]}}`

const currentProject = computed(() => projectStore.currentProject ?? null)
const isInsideProject = computed(() => !!currentProject.value)

// Core state
const step = ref(0) // 0=describe, 1..N=questions
const description = ref('')
const questions = ref<InterviewQuestion[]>([])
const answers = ref<Record<string, string | string[]>>({})
const plan = ref<ArchitectPlan | null>(null)
const { defaultModelId, init: initAIModel } = useAIModel()
const selectedModel = computed(() => (defaultModelId.value || 'auto').trim() || 'auto')

// Loading states
const isGeneratingQuestions = ref(false)
const isGeneratingPlan = ref(false)
const loadingMessage = ref('')
const loadingPhase = ref(0)
const elapsedSeconds = ref(0)
const errorMessage = ref('')
let loadingInterval: ReturnType<typeof setInterval> | null = null
let elapsedInterval: ReturnType<typeof setInterval> | null = null

// ─── Project Config Step (pre-creation) ───
const showProjectConfig = ref(false)
const projectPath = ref('')
const initGit = ref(true)

// Detect if plan is a Construct space
const isConstructSpace = computed(() => {
  return plan.value?.type === 'construct-space' && !!plan.value?.spaceId
})

// Detect framework from plan decisions
const detectedTemplate = computed(() => {
  if (!plan.value || isConstructSpace.value) return null
  const frontend = plan.value.decisions?.frontend
  return typeof frontend === 'string' ? mapFrontendToTemplate(frontend) : null
})

const detectedBackendTemplate = computed(() => {
  if (!plan.value || isConstructSpace.value) return null
  const backend = plan.value.decisions?.backend
  return typeof backend === 'string' ? mapBackendToTemplate(backend) : null
})

// Check if git is in selected spaces
const gitInSpaces = computed(() => {
  if (!plan.value) return false
  const spaces = plan.value.decisions?.spaces
  if (!Array.isArray(spaces)) return false
  return spaces.some(s => String(s).toLowerCase() === 'git')
})

// Slugify a project name for directory use
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const loadingSteps = computed(() => {
  if (isGeneratingQuestions.value) {
    return ['Reading your description', 'Understanding requirements', 'Crafting questions', 'Almost ready']
  }
  return ['Analyzing your choices', 'Building tech stack', 'Writing project plan', 'Finalizing']
})

const prolongedLoadingSteps = computed(() => {
  if (isGeneratingQuestions.value) {
    return [
      'Still generating questions',
      'Model is taking longer than usual',
      'Finalizing response format',
    ]
  }
  return [
    'Still building your plan',
    'Model is taking longer than usual',
    'Finalizing response format',
  ]
})

function startLoadingAnimation() {
  loadingPhase.value = 0
  elapsedSeconds.value = 0
  errorMessage.value = ''
  loadingMessage.value = loadingSteps.value[0] || ''
  loadingInterval = setInterval(() => {
    if (loadingPhase.value < loadingSteps.value.length - 1) {
      loadingPhase.value++
      loadingMessage.value = loadingSteps.value[loadingPhase.value] || ''
      return
    }

    // Keep status moving on slow responses so the UI doesn't look frozen.
    const idx = Math.floor((elapsedSeconds.value - 8) / 4)
    const fallback = prolongedLoadingSteps.value
    const safeIdx = fallback.length > 0 ? ((idx % fallback.length) + fallback.length) % fallback.length : 0
    loadingMessage.value = fallback[safeIdx] || loadingMessage.value
  }, 2500)
  elapsedInterval = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)
}

function stopLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval)
    loadingInterval = null
  }
  if (elapsedInterval) {
    clearInterval(elapsedInterval)
    elapsedInterval = null
  }
}

function cancelRequest() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

function removeAnswer(questionId: string) {
  const { [questionId]: _removed, ...rest } = answers.value
  answers.value = rest
}

// Selection state for current question
const selectedSingle = ref<string | null>(null)
const selectedMulti = ref<string[]>([])

// "Other" custom input state
const showOtherInput = ref(false)
const otherInputValue = ref('')
const hasSpaceFollowups = ref(false)
const spaceFollowupIds = ref<string[]>([])

// Computed
const currentQuestion = computed(() => {
  if (step.value < 1 || step.value > questions.value.length) return null
  return questions.value[step.value - 1] || null
})

const isDone = computed(() => plan.value !== null)
const isInInterview = computed(() => step.value >= 1 && step.value <= questions.value.length && !isGeneratingPlan.value && !plan.value)
const isLoading = computed(() => isGeneratingQuestions.value || isGeneratingPlan.value)

// Progress: answered questions
const answeredQuestions = computed(() => {
  return questions.value.filter(q => answers.value[q.id])
})

const completedCount = computed(() => answeredQuestions.value.length)

// Current phase for stepper: 0=describe, 1=interview, 2=plan, 3=configure
const currentPhase = computed(() => {
  if (showProjectConfig.value) return 3
  if (isDone.value) return 2
  if (step.value > 0 || isLoading.value) return 1
  return 0
})

const showSidebar = computed(() => isInInterview.value && answeredQuestions.value.length > 0)

// Reset selection when step changes
watch(step, () => {
  selectedSingle.value = null
  selectedMulti.value = []
  showOtherInput.value = false
  otherInputValue.value = ''
})

// ─── Selection ───

function selectOption(value: string) {
  if (!currentQuestion.value) return

  // Handle "other" option
  if (value === '__other__') {
    showOtherInput.value = true
    selectedSingle.value = null
    return
  }

  // Clear "other" input when selecting a regular option
  showOtherInput.value = false
  otherInputValue.value = ''

  if (currentQuestion.value.type === 'multi') {
    if (value === 'none') {
      selectedMulti.value = ['none']
    } else {
      const idx = selectedMulti.value.indexOf(value)
      if (idx === -1) {
        selectedMulti.value = [...selectedMulti.value.filter(v => v !== 'none'), value]
      } else {
        selectedMulti.value = selectedMulti.value.filter(v => v !== value)
      }
    }
  } else {
    selectedSingle.value = value
    // Auto-advance for single select after brief highlight
    setTimeout(confirmSelection, 200)
  }
}

function confirmOther() {
  if (!currentQuestion.value || !otherInputValue.value.trim()) return

  const qId = currentQuestion.value.id
  const customValue = otherInputValue.value.trim()

  if (currentQuestion.value.type === 'multi') {
    // Add custom value to multi-select
    selectedMulti.value = [...selectedMulti.value.filter(v => v !== 'none'), customValue]
    showOtherInput.value = false
    otherInputValue.value = ''
  } else {
    answers.value[qId] = customValue
    showOtherInput.value = false
    otherInputValue.value = ''

    // Next question or generate plan
    if (step.value < questions.value.length) {
      step.value++
    } else {
      void generatePlan()
    }
  }
}

function confirmSelection() {
  if (!currentQuestion.value) return

  const qId = currentQuestion.value.id
  const value = currentQuestion.value.type === 'multi'
    ? [...selectedMulti.value]
    : selectedSingle.value!

  if (!value || (Array.isArray(value) && value.length === 0)) return

  answers.value[qId] = value

  // Space follow-ups disabled — they confused the AI about what Construct spaces are
  if (qId === 'spaces') {
    hasSpaceFollowups.value = true
  }

  // Next question or generate plan
  if (step.value < questions.value.length) {
    step.value++
  } else {
    void generatePlan()
  }
}

// ─── AI Call 1: Generate contextual questions ───

async function submitDescription() {
  if (!description.value.trim()) return

  // Cancel any previous request
  if (abortController) abortController.abort()
  const controller = new AbortController()
  abortController = controller

  isGeneratingQuestions.value = true
  errorMessage.value = ''
  startLoadingAnimation()

  // Flush DOM so loading UI paints before the async call
  await nextTick()

  try {
    // Build context-aware user message
    let userMessage = description.value.trim()
    if (isInsideProject.value && currentProject.value) {
      const proj = currentProject.value
      userMessage = `Project: "${proj.name}" — ${proj.description || 'No description'}\nSpaces enabled: ${proj.spaces?.join(', ') || 'none'}\n\nFeature request: ${description.value.trim()}`
    }

    const content = await architectChat(
      [
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'user', content: `[GENERATE_QUESTIONS]\n${userMessage}` },
      ],
      selectedModel.value,
      controller.signal,
      (status) => {
        loadingMessage.value = status
      },
    )

    console.log('[Architect] AI response length:', content.length, 'content:', content.substring(0, 2000))
    const parsed = parseJsonArray(content)
    if (parsed.length > 0) {
      questions.value = parsed
      step.value = 1
    } else {
      console.error('[Architect] Failed to parse response. Full content:', content)
      errorMessage.value = 'Failed to generate questions. The AI response was not in the expected format.'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to connect to AI'
    if (msg !== 'Cancelled') {
      errorMessage.value = msg
    }
  } finally {
    stopLoadingAnimation()
    isGeneratingQuestions.value = false
    if (abortController === controller) {
      abortController = null
    }
  }
}

// ─── AI Call 2: Generate plan from all answers ───

async function generatePlan() {
  // Cancel any previous request
  if (abortController) abortController.abort()
  const controller = new AbortController()
  abortController = controller

  isGeneratingPlan.value = true
  errorMessage.value = ''
  startLoadingAnimation()

  // Flush DOM so loading UI paints before the async call
  await nextTick()

  const answersText = Object.entries(answers.value)
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n')

  // Include the question context so AI knows what options meant
  const questionsContext = questions.value
    .map(q => {
      const answer = answers.value[q.id]
      const answerLabels = Array.isArray(answer)
        ? answer.map(v => q.options.find(o => o.value === v)?.label || v).join(', ')
        : q.options.find(o => o.value === answer)?.label || answer
      return `${q.question} → ${answerLabels}`
    })
    .join('\n')

  try {
    const askedIds = questions.value.map(q => q.id).join(', ')
    let userContent = `Project description: ${description.value}\n\nQuestions asked (ONLY use these as decision keys): ${askedIds}\n\nInterview answers:\n${questionsContext}\n\nRaw values:\n${answersText}`
    if (isInsideProject.value && currentProject.value) {
      userContent = `Existing project: "${currentProject.value.name}" — ${currentProject.value.description || ''}\n\n${userContent}`
    }

    const content = await architectChat(
      [
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'user', content: `[GENERATE_PLAN]\n${userContent}` },
      ],
      selectedModel.value,
      controller.signal,
      (status) => {
        loadingMessage.value = status
      },
    )

    const parsed = parseJsonObject(content)
    if (parsed) {
      plan.value = parsed as unknown as ArchitectPlan
    } else {
      errorMessage.value = 'Failed to generate plan. The AI response was not in the expected format.'
      step.value = questions.value.length
    }
  } catch (e) {
    console.error('[Architect] Plan error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to connect to AI'
    if (msg !== 'Cancelled') {
      errorMessage.value = msg
    }
  } finally {
    stopLoadingAnimation()
    isGeneratingPlan.value = false
    if (abortController === controller) {
      abortController = null
    }
  }
}

// ─── Navigation ───

function goBack() {
  if (showOtherInput.value) {
    showOtherInput.value = false
    otherInputValue.value = ''
    return
  }

  if (step.value > 1) {
    step.value--
    // Restore previous answer into selection state
    const q = questions.value[step.value - 1]
    if (q) {
      const prev = answers.value[q.id]
      if (Array.isArray(prev)) {
        selectedMulti.value = [...prev]
        selectedSingle.value = null
      } else if (prev) {
        selectedSingle.value = prev as string
        selectedMulti.value = []
      }
      removeAnswer(q.id)
    }
  } else if (step.value === 1) {
    step.value = 0
    questions.value = []
    answers.value = {}
  }
}

function goToStep(targetStep: number) {
  if (targetStep < 1 || targetStep > questions.value.length) return
  // Re-open follow-up generation if user goes back to or before spaces.
  const spacesIdx = questions.value.findIndex(q => q.id === 'spaces')
  if (spacesIdx !== -1 && targetStep <= spacesIdx + 1) {
    hasSpaceFollowups.value = false
    if (spaceFollowupIds.value.length > 0) {
      questions.value = questions.value.filter(q => !spaceFollowupIds.value.includes(q.id))
      spaceFollowupIds.value = []
    }
  }
  // Clear answers from target step onward
  for (let i = targetStep - 1; i < questions.value.length; i++) {
    const q = questions.value[i]
    if (q) removeAnswer(q.id)
  }
  plan.value = null
  step.value = targetStep
}

function getAnswerLabel(questionId: string): string {
  const val = answers.value[questionId]
  if (!val) return ''
  const q = questions.value.find(q => q.id === questionId)
  if (!q) return Array.isArray(val) ? val.join(', ') : String(val)

  if (Array.isArray(val)) {
    return val.map(v => q.options.find(o => o.value === v)?.label || v).join(', ')
  }
  return q.options.find(o => o.value === val)?.label || String(val)
}

// ─── Quick Start ───

function quickStart(type: string) {
  description.value = isInsideProject.value
    ? `I want to add ${type.toLowerCase()} to the project`
    : `I want to build a ${type.toLowerCase()}`
  submitDescription()
}

// ─── Reset ───

function handleReset() {
  step.value = 0
  description.value = ''
  questions.value = []
  answers.value = {}
  plan.value = null
  selectedSingle.value = null
  selectedMulti.value = []
  showOtherInput.value = false
  otherInputValue.value = ''
  hasSpaceFollowups.value = false
  spaceFollowupIds.value = []
  showProjectConfig.value = false
  projectPath.value = ''
  initGit.value = true
}

function normalizeSpaceForKickoff(space: string): string {
  const key = (space || '').trim().toLowerCase()
  if (key === 'tasks') return 'kanban'
  if (key === 'ui') return 'design'
  return key
}

function getSelectedSpacesForKickoff(currentPlan: ArchitectPlan): SpaceType[] {
  const raw = currentPlan.decisions?.spaces
  const values = Array.isArray(raw)
    ? raw.map(v => normalizeSpaceForKickoff(String(v))).filter(Boolean) as SpaceType[]
    : []
  return values.length > 0 ? Array.from(new Set(values)) as SpaceType[] : ['code']
}

function getSelectedDocsForKickoff(_currentPlan: ArchitectPlan): DocumentType[] {
  // Find any docs-related answer from the interview
  const decisionEntries = Object.entries(answers.value)
  const docsEntry = decisionEntries.find(([id]) => /docs?[_-]?(depth|type|level|scope|detail)/i.test(id))
  const docsDepthRaw = docsEntry?.[1]
  const docsDepth = typeof docsDepthRaw === 'string'
    ? docsDepthRaw.toLowerCase()
    : Array.isArray(docsDepthRaw)
      ? docsDepthRaw.join(' ').toLowerCase()
      : ''

  if (docsEntry) console.log('[Architect] Docs depth answer:', docsEntry[0], '=', docsDepthRaw)

  let selected: DocumentType[]

  if (docsDepth.includes('full') || docsDepth.includes('comprehensive') || docsDepth.includes('complete') || docsDepth.includes('everything')) {
    selected = ['prd', 'readme', 'architecture', 'roadmap', 'setup']
  } else if (docsDepth.includes('readme') && !docsDepth.includes('prd') && !docsDepth.includes('standard')) {
    selected = ['readme']
  } else if (docsDepth) {
    // Any docs answer that isn't "full/comprehensive" defaults to standard: readme + prd
    // This covers: "standard", "basic", "essential", "normal", "default", "minimal", "simple", etc.
    selected = ['readme', 'prd']
  } else {
    // No docs-related answer found — use smart defaults but cap at readme + prd
    selected = ['readme', 'prd']
  }

  return selected
}

/**
 * Show the pre-creation config step (local path, git, framework)
 */
async function showConfigStep() {
  if (!plan.value || isInsideProject.value || isKicking.value) return

  // Pre-fill defaults
  initGit.value = gitInSpaces.value

  // Get default projects root
  const { getDefaultProjectsRoot } = useProjectDirectory()
  const defaultRoot = await getDefaultProjectsRoot()
  const name = plan.value.name || 'New Project'

  // Project always lives in ConstructProjects — space source code is scaffolded separately
  projectPath.value = defaultRoot ? `${defaultRoot}/${slugify(name)}` : ''

  showProjectConfig.value = true
}

/**
 * Browse for project directory
 */
async function browseProjectDir() {
  const { openFolderDialog } = useProjectDirectory()
  const selected = await openFolderDialog('Select Project Location')
  if (selected) {
    projectPath.value = selected
  }
}

/**
 * Execute project creation with local scaffolding
 */
async function createProjectDirectly() {
  if (!plan.value || isInsideProject.value || isKicking.value) return

  const currentPlan = plan.value
  const spaces = getSelectedSpacesForKickoff(currentPlan)
  const documents = getSelectedDocsForKickoff(currentPlan)
  const tasks = generateSuggestedTasks(currentPlan)

  const isSpace = isConstructSpace.value
  console.log('[Architect] createProjectDirectly:', {
    name: currentPlan.name,
    frontend: currentPlan.decisions?.frontend,
    detectedTemplate: detectedTemplate.value?.id || null,
    isConstructSpace: isSpace,
    spaceId: currentPlan.spaceId,
    localPath: projectPath.value,
    initGit: initGit.value,
    spaces,
  })

  const result = await kickoff(currentPlan, {
    name: currentPlan.name || 'New Project',
    description: currentPlan.description || currentPlan.prd?.overview || '',
    spaces,
    tasks,
    documents,
    localPath: projectPath.value || undefined,
    initGit: initGit.value,
    templateId: isSpace ? null : (detectedTemplate.value?.id || null),
    backendTemplateId: isSpace ? null : (detectedBackendTemplate.value?.id || null),
    isConstructSpace: isSpace,
    spaceId: currentPlan.spaceId,
  })

  if (result.success && result.project) {
    showProjectConfig.value = false
    router.push(`/app/projects/${result.project.id}`)
  }
}

// ─── Save Feature Plan (when inside existing project) ───

async function saveFeaturePlan() {
  if (!plan.value || !currentProject.value) return

  try {
    // Generate a feature PRD document
    const featureDoc = `# Feature: ${plan.value.name}

## Overview
${plan.value.prd?.overview || plan.value.description}

## Decisions
${Object.entries(plan.value.decisions || {}).map(([k, v]) => `- **${k}**: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}

## Components
${(plan.value.prd?.coreFeatures || []).map(f => `- ${f}`).join('\n')}

## Rationale
${plan.value.prd?.techRationale || 'See interview answers.'}

## MVP Scope
${(plan.value.prd?.mvpScope || []).map(s => `- [ ] ${s}`).join('\n')}

## Future Enhancements
${(plan.value.prd?.futureConsiderations || []).map(f => `- ${f}`).join('\n')}

---
*Generated by Construct Architect*
`

    // Save document to local docs/ directory
    const projectPath = currentProject.value.local_path
    if (projectPath) {
      try {
        const tauriFs = await import('@tauri-apps/plugin-fs')
        const docsPath = `${projectPath}/docs`
        const exists = await tauriFs.exists(docsPath)
        if (!exists) {
          await tauriFs.mkdir(docsPath, { recursive: true })
        }
        const filename = `feature-${plan.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.md`
        await tauriFs.writeTextFile(`${docsPath}/${filename}`, featureDoc)
      } catch (e) {
        console.warn('[Architect] Failed to save feature doc locally:', e)
      }
    }

    // TODO: Create tasks via API when available
    const taskCount = plan.value.prd?.mvpScope?.length || 0

    toast.add({
      title: 'Feature Plan Saved',
      description: `"${plan.value.name}" doc saved to ${currentProject.value.name}${taskCount ? ` (${taskCount} tasks pending API)` : ''}`,
      color: 'success',
    })

    // Reset for next feature
    handleReset()
  } catch (e) {
    console.error('[Architect] Save feature error:', e)
    toast.add({ title: 'Error', description: 'Failed to save feature plan', color: 'error' })
  }
}

// ─── Keyboard shortcuts ───

function handleKeydown(e: KeyboardEvent) {
  if (!isInInterview.value || !currentQuestion.value) return

  // Don't capture keys when typing in "other" input
  if (showOtherInput.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      showOtherInput.value = false
      otherInputValue.value = ''
    }
    if (e.key === 'Enter' && otherInputValue.value.trim()) {
      e.preventDefault()
      confirmOther()
    }
    return
  }

  // Number keys to select (including +1 for "other")
  const num = parseInt(e.key)
  if (num >= 1 && num <= currentQuestion.value.options.length) {
    e.preventDefault()
    selectOption(currentQuestion.value.options[num - 1]!.value)
  }
  // Last number triggers "other"
  if (num === currentQuestion.value.options.length + 1) {
    e.preventDefault()
    selectOption('__other__')
  }

  // Enter to confirm multi-select
  if (e.key === 'Enter' && currentQuestion.value.type === 'multi' && selectedMulti.value.length > 0) {
    e.preventDefault()
    confirmSelection()
  }

  // Backspace/Escape to go back
  if (e.key === 'Escape' || (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))) {
    e.preventDefault()
    goBack()
  }
}

// ─── JSON Parsing ───

function extractJson(content: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  let cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*\n?/g, '')
    .replace(/\n?\s*```/g, '')
  cleaned = cleaned.trim()
  return cleaned
}

function findFirstJsonArray(text: string): string | null {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[') continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === '[') {
        depth++
      } else if (ch === ']') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          // Validate it's actually JSON, not e.g. [GENERATE_SPACE_QUESTIONS]
          try {
            JSON.parse(candidate)
            return candidate
          } catch {
            break // skip this bracket pair, continue searching
          }
        }
      }
    }
  }
  return null
}

function findFirstJsonObject(text: string): string | null {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0) {
          return text.slice(start, i + 1)
        }
      }
    }
  }
  return null
}

function parseJsonArray(content: string): InterviewQuestion[] {
  console.log('[Architect] Raw AI response:', content.substring(0, 500))

  try {
    const cleaned = extractJson(content)

    // Try direct parse
    if (cleaned.startsWith('[')) {
      const result = JSON.parse(cleaned)
      console.log('[Architect] Parsed questions:', result.length)
      return result
    }

    // Try object wrapper like { "questions": [...] }
    if (cleaned.startsWith('{')) {
      const obj = JSON.parse(cleaned) as { questions?: unknown; data?: unknown; message?: unknown }
      const candidate = obj.questions || obj.data || obj.message
      if (Array.isArray(candidate)) return candidate as InterviewQuestion[]
      if (candidate && typeof candidate === 'object' && 'content' in candidate) {
        const nested = (candidate as { content?: unknown }).content
        if (typeof nested === 'string') return parseJsonArray(nested)
      }
    }

    // Try to find JSON array within text
    const match = findFirstJsonArray(cleaned)
    if (match) {
      const result = JSON.parse(match)
      console.log('[Architect] Extracted questions from text:', result.length)
      return result
    }

    console.error('[Architect] No JSON array found in response, length:', cleaned.length, 'preview:', cleaned.substring(0, 200))
  } catch (e) {
    console.error('[Architect] Failed to parse questions JSON:', e)
    console.error('[Architect] Content was:', content.substring(0, 1000))
  }
  return []
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  console.log('[Architect] Raw plan response:', content.substring(0, 500))

  try {
    const cleaned = extractJson(content)

    if (cleaned.startsWith('{')) {
      return JSON.parse(cleaned)
    }

    const match = findFirstJsonObject(cleaned)
    if (match) return JSON.parse(match)

    console.error('[Architect] No JSON object found in response')
  } catch (e) {
    console.error('[Architect] Failed to parse plan JSON:', e)
    console.error('[Architect] Content was:', content.substring(0, 1000))
  }
  return null
}

// ─── Setup ───

onMounted(async () => {
  await initAIModel()
  window.addEventListener('keydown', handleKeydown)
  setPageItems([{
    id: 'architect-reset',
    icon: 'i-lucide-refresh-cw',
    label: 'Start Over',
    type: 'action',
    category: 'space',
    onClick: handleReset,
  }])

  console.log('[Architect] Using model from settings:', selectedModel.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopLoadingAnimation()
  clearToolbar()
  if (abortController) {
    abortController.abort()
    abortController = null
  }
})
</script>

<template>
  <DashboardPanel :ui="{ body: 'p-0 sm:p-0' }">
    <template #body>
      <div class="h-screen flex flex-col">
        <!-- Step indicator bar -->
        <div class="shrink-0 border-b border-app-border/50 px-8 py-3.5">
          <div class="max-w-4xl mx-auto flex items-center gap-1">
            <template v-for="(s, i) in [
              { label: 'Describe', icon: 'i-lucide-pen-line' },
              { label: 'Interview', icon: 'i-lucide-message-circle' },
              { label: 'Plan', icon: 'i-lucide-file-text' },
              { label: 'Create', icon: 'i-lucide-rocket' },
            ]" :key="s.label">
              <div
                class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all duration-300"
                :class="[
                  i === currentPhase ? 'bg-app-accent/10 text-app-accent font-medium' : '',
                  i < currentPhase ? 'text-app-muted' : '',
                  i > currentPhase ? 'text-app-muted/30' : '',
                ]"
              >
                <div
                  class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300"
                  :class="[
                    i < currentPhase ? 'bg-app-accent/15 text-app-accent' : '',
                    i === currentPhase ? 'bg-app-accent text-white' : '',
                    i > currentPhase ? 'bg-white/6 text-app-muted/30' : '',
                  ]"
                >
                  <Icon v-if="i < currentPhase" name="i-lucide-check" class="size-3" />
                  <Icon v-else :name="s.icon" class="size-2.5" />
                </div>
                <span class="hidden sm:inline">{{ s.label }}</span>
              </div>
              <div v-if="i < 3" class="w-8 h-px mx-1 transition-colors duration-300" :class="i < currentPhase ? 'bg-app-accent/20' : 'bg-white/6'" />
            </template>
          </div>
        </div>

        <!-- Content area -->
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-4xl mx-auto px-8 py-10">
            <div class="flex gap-10" :class="showSidebar ? 'items-start' : 'justify-center'">
              <!-- Sidebar: answered questions (only during interview) -->
              <div v-if="showSidebar" class="w-52 shrink-0 sticky top-10 space-y-4">
                <div class="flex items-center justify-between">
                  <p class="text-[11px] text-app-muted/50 uppercase tracking-widest font-medium">Decisions</p>
                  <span class="text-[10px] text-app-muted/40 font-mono">{{ completedCount }}/{{ questions.length }}</span>
                </div>
                <!-- Progress bar -->
                <div class="h-1 bg-white/6 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-app-accent/60 rounded-full transition-all duration-500 ease-out"
                    :style="{ width: `${questions.length ? (completedCount / questions.length) * 100 : 0}%` }"
                  />
                </div>
                <!-- Answered list -->
                <div class="space-y-1">
                  <button
                    v-for="q in answeredQuestions"
                    :key="q.id"
                    class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    @click="goToStep(questions.indexOf(q) + 1)"
                  >
                    <div class="w-6 h-6 rounded-md bg-white/6 flex items-center justify-center shrink-0 group-hover:bg-app-accent/10 transition-colors">
                      <Icon :name="q.options[0]?.icon || 'i-lucide-box'" class="size-3 text-app-muted/60 group-hover:text-app-accent transition-colors" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-[10px] text-app-muted/40 uppercase tracking-wider leading-none">{{ q.id }}</p>
                      <p class="text-xs font-medium text-app truncate mt-0.5">{{ getAnswerLabel(q.id) }}</p>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Main step content -->
              <div class="flex-1 max-w-xl" :class="!showSidebar && 'mx-auto'">
                <Transition name="step" mode="out-in">
                  <div :key="`${step}-${isDone}-${showProjectConfig}`">
                    <ArchitectDescribeStep
                      v-if="step === 0 && !isLoading"
                      v-model:description="description"
                      :is-inside-project="isInsideProject"
                      :project-name="currentProject?.name"
                      :error-message="errorMessage"
                      @submit="submitDescription"
                      @quick-start="quickStart"
                      @dismiss-error="errorMessage = ''"
                    />

                    <ArchitectLoadingStep
                      v-else-if="isLoading"
                      :is-generating-questions="isGeneratingQuestions"
                      :elapsed-seconds="elapsedSeconds"
                      :loading-steps="loadingSteps"
                      :loading-phase="loadingPhase"
                      @cancel="cancelRequest"
                    />

                    <ArchitectInterviewStep
                      v-else-if="isInInterview && currentQuestion"
                      :question="currentQuestion"
                      :step="step"
                      :total-steps="questions.length"
                      :selected-values="currentQuestion.type === 'multi' ? selectedMulti : (answers[currentQuestion.id] ? [answers[currentQuestion.id] as string] : [])"
                      :show-other-input="showOtherInput"
                      :other-input-value="otherInputValue"
                      @select="selectOption"
                      @confirm="confirmSelection"
                      @confirm-other="confirmOther"
                      @back="goBack"
                      @update:show-other-input="showOtherInput = $event"
                      @update:other-input-value="otherInputValue = $event"
                    />

                    <ArchitectPlanSummary
                      v-else-if="isDone && plan && !showProjectConfig"
                      :plan="plan"
                      :is-inside-project="isInsideProject"
                      :is-kicking="isKicking"
                      @create-project="showConfigStep"
                      @save-feature="saveFeaturePlan"
                      @edit-choices="goToStep(1)"
                    />

                    <ArchitectProjectConfig
                      v-else-if="isDone && plan && showProjectConfig"
                      v-model:project-path="projectPath"
                      v-model:init-git="initGit"
                      :plan="plan"
                      :is-kicking="isKicking"
                      :kickoff-progress="kickoffProgress"
                      :progress-message="progressMessage"
                      :is-construct-space="isConstructSpace"
                      :detected-template="detectedTemplate"
                      :detected-backend-template="detectedBackendTemplate"
                      @create="createProjectDirectly"
                      @back="showProjectConfig = false"
                      @browse="browseProjectDir"
                    />
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </DashboardPanel>
</template>

<style scoped>
.step-enter-active,
.step-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.step-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.step-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
