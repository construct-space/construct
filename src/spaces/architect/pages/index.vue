<script setup lang="ts">
/**
 * Architect Space - Fast project planning
 *
 * Flow:
 * 1. User describes project
 * 2. ONE AI call → generates all contextual interview questions
 * 3. User clicks through questions instantly (local, no waiting)
 * 4. ONE AI call → generates project plan from all answers
 * 5. Summary → Create Project
 *
 * Two AI round trips total. Clicking is instant.
 * Uses direct chat for deterministic JSON (no agent/tool debug chunks).
 */
import type { InterviewQuestion } from '~/data/architect-knowledge'
import type { ArchitectPlan } from '../utils/documentsGenerator'

const router = useRouter()
const projectStore = useProjectStore()
const { setPageItems, clearToolbar } = useToolbar()
const toast = useToast()

// Abort controller for cancelling in-flight AI requests
let abortController: AbortController | null = null

async function architectChat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, model: string, signal?: AbortSignal): Promise<string> {
  const { chatStream, isTauri } = useContextService()
  console.log('[Architect] architectChat via chatStream (non-blocking), model:', model, 'tauri:', isTauri.value)

  if (!isTauri.value) {
    throw new Error('AI requires the Construct desktop app. Run the app in Tauri to use the Architect.')
  }

  // Use streaming to keep the UI responsive (chat_direct is synchronous Tauri IPC
  // which blocks the main thread). Only accumulate 'stream' type chunks — skip
  // progress, tool_call, tool_result, debug etc. from the agent loop.
  let accumulated = ''
  const TIMEOUT_MS = 120_000
  let timer: ReturnType<typeof setTimeout> | null = null

  const streamPromise = new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out. Check your AI provider settings.')), TIMEOUT_MS)

    chatStream(
      { model, messages },
      (chunk) => {
        // Only accumulate actual LLM output (stream/content), not agent loop noise
        if (chunk.content && (!chunk.type || chunk.type === 'stream' || chunk.type === 'content')) {
          accumulated += chunk.content
        }
        // Update loading status from progress chunks
        if (chunk.type === 'progress' && chunk.content) {
          loadingMessage.value = chunk.content
        }
        // Check error BEFORE done — a failing provider sends both in one chunk
        if (chunk.error) {
          if (timer) clearTimeout(timer)
          reject(new Error(chunk.error))
        } else if (chunk.done) {
          if (timer) clearTimeout(timer)
          resolve(accumulated)
        }
      },
      { signal },
    ).catch((err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    signal?.addEventListener('abort', () => {
      if (timer) clearTimeout(timer)
      reject(new Error('Cancelled'))
    }, { once: true })
  })

  return streamPromise
}

// Project context awareness — detect by route, not just store (store persists after navigation)
const route = useRoute()
const routeProjectId = computed(() => route.params.id as string | undefined)
const currentProject = computed(() => routeProjectId.value ? projectStore.currentProject : null)
const isInsideProject = computed(() => !!routeProjectId.value && !!currentProject.value)

// Core state
const step = ref(0) // 0=describe, 1..N=questions
const description = ref('')
const questions = ref<InterviewQuestion[]>([])
const answers = ref<Record<string, string | string[]>>({})
const plan = ref<ArchitectPlan | null>(null)
const showKickoff = ref(false)
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

const loadingSteps = computed(() => {
  if (isGeneratingQuestions.value) {
    return ['Reading your description', 'Understanding requirements', 'Crafting questions', 'Almost ready']
  }
  return ['Analyzing your choices', 'Building tech stack', 'Writing project plan', 'Finalizing']
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
    }
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

function isSelected(value: string): boolean {
  if (currentQuestion.value?.type === 'multi') {
    return selectedMulti.value.includes(value)
  }
  return selectedSingle.value === value
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
      generatePlan()
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

  // Next question or generate plan
  if (step.value < questions.value.length) {
    step.value++
  } else {
    generatePlan()
  }
}

// ─── AI Call 1: Generate all questions at once ───

async function submitDescription() {
  if (!description.value.trim()) return

  // Cancel any previous request
  if (abortController) abortController.abort()
  abortController = new AbortController()

  isGeneratingQuestions.value = true
  errorMessage.value = ''
  startLoadingAnimation()

  // Flush DOM so loading UI paints before the async call
  await nextTick()

  try {
    console.log('[Architect] Generating questions with model:', selectedModel.value, 'project:', currentProject.value?.name || 'none')

    // Build context-aware user message
    let userMessage = description.value.trim()
    if (isInsideProject.value && currentProject.value) {
      const proj = currentProject.value
      userMessage = `Project: "${proj.name}" — ${proj.description || 'No description'}\nSpaces enabled: ${proj.spaces?.join(', ') || 'none'}\n\nFeature request: ${description.value.trim()}`
    }

    const prompt = isInsideProject.value ? FEATURE_QUESTIONS_PROMPT : QUESTIONS_PROMPT

    const content = await architectChat(
      [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
      selectedModel.value,
      abortController.signal,
    )

    console.log('[Architect] Response received, length:', content.length)

    const parsed = parseJsonArray(content)
    if (parsed.length > 0) {
      questions.value = parsed
      step.value = 1
    } else {
      errorMessage.value = 'Failed to generate questions. The AI response was not in the expected format.'
    }
  } catch (e) {
    console.error('[Architect] Chat error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to connect to AI'
    if (msg !== 'Cancelled') {
      errorMessage.value = msg
    }
  } finally {
    stopLoadingAnimation()
    isGeneratingQuestions.value = false
    abortController = null
  }
}

// ─── AI Call 2: Generate plan from all answers ───

async function generatePlan() {
  // Cancel any previous request
  if (abortController) abortController.abort()
  abortController = new AbortController()

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
    const prompt = isInsideProject.value ? FEATURE_PLAN_PROMPT : PLAN_PROMPT
    const askedIds = questions.value.map(q => q.id).join(', ')
    let userContent = `Project description: ${description.value}\n\nQuestions asked (ONLY use these as decision keys): ${askedIds}\n\nInterview answers:\n${questionsContext}\n\nRaw values:\n${answersText}`
    if (isInsideProject.value && currentProject.value) {
      userContent = `Existing project: "${currentProject.value.name}" — ${currentProject.value.description || ''}\n\n${userContent}`
    }

    const content = await architectChat(
      [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
      selectedModel.value,
      abortController?.signal,
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
    abortController = null
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
  showKickoff.value = false
  selectedSingle.value = null
  selectedMulti.value = []
  showOtherInput.value = false
  otherInputValue.value = ''
}

function onProjectCreated(project: { id: number; name: string }) {
  showKickoff.value = false
  router.push(`/app/projects/${project.id}`)
}

// ─── Save Feature Plan (when inside existing project) ───

async function saveFeaturePlan() {
  if (!plan.value || !currentProject.value) return

  const documentsStore = useDocumentsStore()
  const tasksStore = useTasksStore()
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

    // Save document to existing project
    const docResult = await documentsStore.createProjectDocument(currentProject.value.id, {
      title: `Feature: ${plan.value.name}`,
      content: featureDoc,
      type: 'prd',
      plan_json: JSON.stringify(plan.value),
    })

    if (!docResult.success) {
      toast.add({ title: 'Error', description: 'Failed to save feature plan', color: 'error' })
      return
    }

    // Create tasks for the feature in the existing project
    const prd = plan.value.prd
    if (prd?.mvpScope?.length) {
      for (const scope of prd.mvpScope) {
        await tasksStore.createTask({
          project_id: currentProject.value.id,
          title: scope,
          description: `Feature "${plan.value.name}": ${scope}`,
          status: 'backlog',
          priority: 'medium',
        })
      }
    }

    toast.add({
      title: 'Feature Plan Saved',
      description: `"${plan.value.name}" added to ${currentProject.value.name} with ${prd?.mvpScope?.length || 0} tasks`,
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
  let cleaned = content.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '')
  cleaned = cleaned.trim()
  return cleaned
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
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) {
      const result = JSON.parse(match[0])
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

    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])

    console.error('[Architect] No JSON object found in response')
  } catch (e) {
    console.error('[Architect] Failed to parse plan JSON:', e)
    console.error('[Architect] Content was:', content.substring(0, 1000))
  }
  return null
}

// ─── Prompts ───

const QUESTIONS_PROMPT = `You are a project architect for Construct, a project planning tool.

Given the user's app description, generate 5-7 contextual interview questions to understand their needs and make technology decisions.

RULES:
- Only ask questions RELEVANT to this specific project
- Skip questions that don't apply (don't ask about payments for a personal blog, don't ask about mobile if they clearly want web)
- Each question: 3-5 options with icon and description
- Icons: use "i-lucide-*" (e.g. i-lucide-globe, i-lucide-server, i-lucide-database) or "i-simple-icons-*" for brands (e.g. i-simple-icons-vuedotjs, i-simple-icons-react)
- Question types: "single" for pick-one, "multi" for pick-many
- Use these IDs when applicable: platform, frontend, backend, database, auth, designStyle, features, deployment
- Be conversational in question text - "Since you're building a blog, what platform?" not just "Select platform"
- Options should be real technologies, not generic placeholders
- Do NOT include an "other" option — the UI provides one automatically

Return ONLY a raw JSON array. No markdown fences. No explanation text. Just the JSON:
[{"type":"single","id":"platform","question":"What platform fits best?","options":[{"value":"web","label":"Web App","icon":"i-lucide-globe","description":"Accessible from any browser"}]}]`

const PLAN_PROMPT = `You are a project architect. Generate a project plan from the user's description and interview answers.

CRITICAL RULES:
- The "decisions" object must ONLY contain keys that were actually asked in the interview
- Do NOT invent or assume decisions that were not part of the interview (e.g. if "frontend" was never asked, do NOT include a "frontend" key)
- Use the exact question IDs as decision keys
- For array values (multi-select answers), use arrays. For single answers, use strings.

The plan should include:
- A concise project name (2-4 words)
- Clear description (one sentence)
- Decisions: ONLY from the interview answers provided (no extras)
- A PRD with overview, target users, core features, tech rationale, MVP scope, and future considerations

Return ONLY raw JSON. No markdown fences. No explanation. Just JSON:
{"name":"Project Name","description":"One-line description","decisions":{"platform":"web","backend":"go","database":"postgresql"},"prd":{"overview":"Detailed overview paragraph","targetUsers":"Who will use this and why","coreFeatures":["Feature 1 - description","Feature 2 - description"],"techRationale":"Why these specific technologies were chosen for this project","mvpScope":["MVP deliverable 1","MVP deliverable 2"],"futureConsiderations":["Future enhancement 1","Future enhancement 2"]}}`

// ─── Feature-mode prompts (inside existing project) ───

const FEATURE_QUESTIONS_PROMPT = `You are a project architect for Construct, a project planning tool.

The user is inside an EXISTING project and wants to add a new feature. You'll receive the project name, description, and enabled spaces.

Generate 3-5 contextual interview questions to plan this feature within the existing project context. Don't ask about tech stack that's already decided — focus on feature-specific decisions.

RULES:
- Ask about the feature's scope, UX approach, data requirements, integrations, etc.
- Keep questions specific to this feature, not the whole project
- Each question: 3-5 options with icon and description
- Icons: use "i-lucide-*" (e.g. i-lucide-layers, i-lucide-shield, i-lucide-zap) or "i-simple-icons-*" for brands
- Question types: "single" for pick-one, "multi" for pick-many
- Use relevant IDs: scope, approach, data, integration, priority, etc.
- Be conversational — reference the project name and feature naturally
- Do NOT include an "other" option — the UI provides one automatically

Return ONLY a raw JSON array. No markdown fences. No explanation text. Just the JSON:
[{"type":"single","id":"scope","question":"How big should this feature be for the first version?","options":[{"value":"minimal","label":"Minimal MVP","icon":"i-lucide-minimize","description":"Just the core functionality"}]}]`

const FEATURE_PLAN_PROMPT = `You are a project architect. The user is adding a FEATURE to an existing project.

Generate a feature plan (not a full project plan). Include:
- Feature name (2-4 words)
- Clear description of what it does
- Implementation decisions specific to this feature
- A mini-PRD: overview, affected users, core components, rationale, MVP scope, future enhancements

Return ONLY raw JSON. No markdown fences. No explanation. Just JSON:
{"name":"Feature Name","description":"One-line description of the feature","decisions":{"scope":"mvp","approach":"component-based","data":"new-table","integration":"api"},"prd":{"overview":"What this feature does and why it matters","targetUsers":"Who benefits from this feature","coreFeatures":["Component 1 - what it does","Component 2 - what it does"],"techRationale":"Why these implementation choices for this feature","mvpScope":["MVP deliverable 1","MVP deliverable 2"],"futureConsiderations":["Enhancement 1","Enhancement 2"]}}`

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
      <div class="h-screen overflow-y-auto flex items-start lg:items-center justify-center px-6 py-8">
        <div class="w-full max-w-4xl">
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            <!-- LEFT: Progress (2 cols) -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Header -->
              <div class="text-right">
                <p class="text-2xl">
                  <span class="text-app-muted">{{ isInsideProject ? 'FEATURE:' : 'PROJECT:' }}</span>
                  <span class="font-bold text-app">ARCHITECT</span>
                </p>
                <p v-if="isInsideProject" class="text-xs text-app-muted mt-1">
                  {{ currentProject?.name }}
                </p>
              </div>

              <!-- Progress -->
              <div v-if="questions.length > 0" class="text-right space-y-2">
                <div class="flex items-center justify-end gap-3">
                  <span class="text-sm text-app-muted uppercase tracking-wider">Progress</span>
                  <span class="text-3xl font-bold text-app">{{ completedCount }}/{{ questions.length }}</span>
                </div>
                <div class="h-1 bg-white/10 rounded-full overflow-hidden ml-auto w-48">
                  <div
                    class="h-full bg-app-accent rounded-full transition-all duration-500 ease-out"
                    :style="{ width: `${questions.length ? (completedCount / questions.length) * 100 : 0}%` }"
                  />
                </div>
              </div>

              <!-- Answered questions (decisions) -->
              <div v-if="answeredQuestions.length > 0" class="text-right space-y-2">
                <div class="flex items-center justify-end gap-1 mb-3">
                  <span class="font-bold text-app">{{ isInsideProject ? 'FEATURE' : 'TECH' }}</span>
                  <span class="text-app-muted">{{ isInsideProject ? 'PLAN' : 'STACK' }}</span>
                </div>

                <button
                  v-for="q in answeredQuestions"
                  :key="q.id"
                  class="w-full flex items-center justify-end gap-3 group"
                  @click="goToStep(questions.indexOf(q) + 1)"
                >
                  <div class="text-right">
                    <p class="text-xs text-app-muted uppercase tracking-wider">{{ q.id }}</p>
                    <p class="font-medium text-app text-sm">{{ getAnswerLabel(q.id) }}</p>
                  </div>
                  <div class="w-8 h-8 rounded-md bg-white/50 dark:bg-white/10 flex items-center justify-center">
                    <Icon :name="q.options[0]?.icon || 'i-lucide-box'" class="size-4 text-app-muted group-hover:text-app-accent transition-colors" />
                  </div>
                </button>
              </div>

              <!-- Action button (left side) -->
              <div v-if="isDone" class="text-right pt-4">
                <button
                  v-if="!isInsideProject"
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/50 dark:bg-white/10 text-app hover:bg-app-accent hover:text-white transition-colors"
                  @click="showKickoff = true"
                >
                  <Icon name="i-lucide-rocket" class="size-4" />
                  <span class="font-medium">CREATE PROJECT</span>
                </button>
                <button
                  v-else
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/50 dark:bg-white/10 text-app hover:bg-app-accent hover:text-white transition-colors"
                  @click="saveFeaturePlan"
                >
                  <Icon name="i-lucide-save" class="size-4" />
                  <span class="font-medium">SAVE FEATURE</span>
                </button>
              </div>
            </div>

            <!-- RIGHT: Current Step (3 cols) -->
            <div class="lg:col-span-3">
              <Transition name="step" mode="out-in">
                <div :key="`${step}-${isDone}`" class="space-y-6">
                  <!-- ── Step 0: Describe ── -->
                  <template v-if="step === 0 && !isLoading">
                    <div>
                      <p class="text-sm text-app-muted tracking-wider">
                        {{ isInsideProject ? 'DESCRIBE YOUR' : 'DESCRIBE YOUR' }}
                      </p>
                      <h1 class="text-4xl font-bold text-app mt-1">
                        {{ isInsideProject ? 'Feature' : 'Project' }}
                      </h1>
                      <p v-if="isInsideProject" class="text-sm text-app-muted mt-2">
                        Adding to <span class="font-medium text-app">{{ currentProject?.name }}</span>
                      </p>
                    </div>

                    <!-- Inline error -->
                    <div v-if="errorMessage" class="flex items-start gap-3 p-3 rounded-md bg-red-500/10 border border-red-500/20">
                      <Icon name="i-lucide-alert-circle" class="size-4 text-red-400 shrink-0 mt-0.5" />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm text-red-400">{{ errorMessage }}</p>
                        <button
                          class="text-xs text-red-400/60 hover:text-red-400 mt-1 transition-colors"
                          @click="errorMessage = ''"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>

                    <div class="space-y-4">
                      <Textarea
                        v-model="description"
                        :placeholder="isInsideProject ? 'I want to add...' : 'I want to build...'"
                        :rows="4"
                        autofocus
                        @keydown.meta.enter="submitDescription"
                        @keydown.ctrl.enter="submitDescription"
                      />

                      <Button :disabled="!description.trim()" @click="submitDescription">
                        <template #leading>
                          <Icon name="i-lucide-arrow-right" class="size-4" />
                        </template>
                        Continue
                      </Button>
                    </div>

                    <div class="space-y-2">
                      <p class="text-xs text-app-muted uppercase tracking-wider">Quick Start</p>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="text in isInsideProject
                            ? ['Authentication', 'Dashboard', 'API Endpoints', 'File Upload', 'Notifications', 'Search']
                            : ['Dashboard', 'E-commerce', 'Chat App', 'Blog', 'Todo App', 'SaaS']"
                          :key="text"
                          class="px-3 py-1.5 text-xs text-app-muted hover:text-app rounded-md bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors"
                          @click="quickStart(text)"
                        >
                          {{ text }}
                        </button>
                      </div>
                    </div>
                  </template>

                  <!-- ── Loading: Generating questions or plan ── -->
                  <template v-else-if="isLoading">
                    <div class="flex flex-col items-start py-12 space-y-6">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
                          <div class="architect-spinner" />
                        </div>
                        <div>
                          <p class="text-sm font-medium text-app">
                            {{ isGeneratingQuestions ? 'Preparing interview' : 'Building your plan' }}
                          </p>
                          <p class="text-xs text-app-muted">
                            {{ elapsedSeconds < 5 ? 'This takes a few seconds' : `${elapsedSeconds}s elapsed` }}
                          </p>
                        </div>
                      </div>

                      <!-- Animated steps -->
                      <div class="space-y-3 w-full">
                        <div
                          v-for="(stepText, idx) in loadingSteps"
                          :key="idx"
                          class="flex items-center gap-3 transition-all duration-700 ease-out"
                          :class="idx <= loadingPhase ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'"
                        >
                          <div
                            class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500"
                            :class="idx < loadingPhase
                              ? 'bg-app-accent/20'
                              : idx === loadingPhase
                                ? 'bg-app-accent/10 ring-2 ring-app-accent/30'
                                : 'bg-white/5'"
                          >
                            <Icon
                              v-if="idx < loadingPhase"
                              name="i-lucide-check"
                              class="size-3 text-app-accent"
                            />
                            <div
                              v-else-if="idx === loadingPhase"
                              class="w-2 h-2 rounded-full bg-app-accent architect-dot-pulse"
                            />
                            <div
                              v-else
                              class="w-1.5 h-1.5 rounded-full bg-white/20"
                            />
                          </div>
                          <span
                            class="text-sm transition-colors duration-500"
                            :class="idx === loadingPhase ? 'text-app' : idx < loadingPhase ? 'text-app-muted' : 'text-app-muted/40'"
                          >
                            {{ stepText }}
                          </span>
                        </div>
                      </div>

                      <!-- Cancel button -->
                      <button
                        class="text-xs text-app-muted hover:text-app transition-colors flex items-center gap-1.5 pt-2"
                        @click="cancelRequest"
                      >
                        <Icon name="i-lucide-x" class="size-3" />
                        Cancel
                      </button>
                    </div>
                  </template>

                  <!-- ── Interview Questions ── -->
                  <template v-else-if="isInInterview && currentQuestion">
                    <div>
                      <div class="flex items-center gap-3 mb-1">
                        <p class="text-sm text-app-muted tracking-wider uppercase">
                          {{ currentQuestion.id }}
                        </p>
                        <span class="text-[10px] text-app-muted bg-white/10 px-1.5 py-0.5 rounded font-mono">
                          {{ step }}/{{ questions.length }}
                        </span>
                      </div>
                      <h2 class="text-2xl font-bold text-app mt-1">{{ currentQuestion.question }}</h2>
                      <p v-if="currentQuestion.type === 'multi'" class="text-xs text-app-muted mt-1">
                        Select multiple, then press Continue
                      </p>
                    </div>

                    <!-- Options -->
                    <div class="space-y-2">
                      <button
                        v-for="(opt, idx) in currentQuestion.options"
                        :key="opt.value"
                        class="w-full flex items-center gap-3 p-3 rounded-md transition-all duration-150 text-left group"
                        :class="isSelected(opt.value)
                          ? 'bg-app-accent/10 ring-1 ring-app-accent/30'
                          : 'bg-white/50 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/15'"
                        @click="selectOption(opt.value)"
                      >
                        <!-- Number key hint -->
                        <span class="text-[10px] text-app-muted/40 w-4 text-center font-mono shrink-0">{{ idx + 1 }}</span>

                        <div
                          class="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                          :class="isSelected(opt.value) ? 'bg-app-accent/20' : 'bg-white dark:bg-white/10'"
                        >
                          <Icon :name="opt.icon || 'i-lucide-box'" class="size-4" />
                        </div>

                        <div class="flex-1 min-w-0">
                          <p class="font-medium text-sm text-app">{{ opt.label }}</p>
                          <p class="text-xs text-app-muted">{{ opt.description }}</p>
                        </div>

                        <div
                          v-if="isSelected(opt.value)"
                          class="w-5 h-5 rounded-full bg-app-accent flex items-center justify-center shrink-0"
                        >
                          <Icon name="i-lucide-check" class="size-3 text-white" />
                        </div>
                      </button>

                      <!-- "Other" option -->
                      <button
                        v-if="!showOtherInput"
                        class="w-full flex items-center gap-3 p-3 rounded-md transition-all duration-150 text-left group bg-white/50 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/15 border border-dashed border-white/20"
                        @click="selectOption('__other__')"
                      >
                        <span class="text-[10px] text-app-muted/40 w-4 text-center font-mono shrink-0">{{ currentQuestion.options.length + 1 }}</span>
                        <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-white dark:bg-white/10">
                          <Icon name="i-lucide-pencil" class="size-4 text-app-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="font-medium text-sm text-app-muted">Other</p>
                          <p class="text-xs text-app-muted/60">Type your own answer</p>
                        </div>
                      </button>

                      <!-- "Other" text input -->
                      <div v-if="showOtherInput" class="p-3 rounded-md bg-app-accent/5 ring-1 ring-app-accent/30 space-y-3">
                        <div class="flex items-center gap-2">
                          <Icon name="i-lucide-pencil" class="size-4 text-app-accent shrink-0" />
                          <p class="text-sm font-medium text-app">Your answer</p>
                        </div>
                        <Input
                          v-model="otherInputValue"
                          placeholder="Type your choice..."
                          autofocus
                          @keydown.enter.prevent="confirmOther"
                          @keydown.escape.prevent="showOtherInput = false; otherInputValue = ''"
                        />
                        <div class="flex items-center justify-end gap-2">
                          <button
                            class="text-xs text-app-muted hover:text-app transition-colors"
                            @click="showOtherInput = false; otherInputValue = ''"
                          >
                            Cancel
                          </button>
                          <Button size="xs" :disabled="!otherInputValue.trim()" @click="confirmOther">
                            Confirm
                          </Button>
                        </div>
                      </div>
                    </div>

                    <!-- Bottom bar -->
                    <div class="flex items-center justify-between pt-2">
                      <button
                        class="text-xs text-app-muted hover:text-app transition-colors flex items-center gap-1"
                        @click="goBack"
                      >
                        <Icon name="i-lucide-arrow-left" class="size-3" />
                        Back
                      </button>

                      <Button
                        v-if="currentQuestion.type === 'multi'"
                        size="sm"
                        :disabled="selectedMulti.length === 0"
                        @click="confirmSelection"
                      >
                        Continue
                      </Button>
                    </div>
                  </template>

                  <!-- ── Done: Plan Summary ── -->
                  <template v-else-if="isDone && plan">
                    <div>
                      <p class="text-sm text-app-muted tracking-wider">
                        {{ isInsideProject ? 'YOUR FEATURE' : 'YOUR PROJECT' }}
                      </p>
                      <h2 class="text-3xl font-bold text-app mt-1">{{ plan.name }}</h2>
                    </div>

                    <p class="text-app-muted text-sm">{{ plan.description }}</p>

                    <!-- Decisions grid -->
                    <div class="space-y-2">
                      <div
                        v-for="(value, key) in plan.decisions"
                        v-show="value && (Array.isArray(value) ? value.length > 0 : true)"
                        :key="key"
                        class="flex items-center gap-3 p-2.5 rounded-md bg-white/50 dark:bg-white/5"
                      >
                        <span class="text-xs text-app-muted capitalize w-20 shrink-0">{{ key }}</span>
                        <span class="text-sm font-medium text-app">
                          {{ Array.isArray(value) ? value.join(', ') : value }}
                        </span>
                      </div>
                    </div>

                    <!-- Core features / components -->
                    <div v-if="plan.prd?.coreFeatures?.length" class="space-y-2">
                      <p class="text-xs text-app-muted uppercase tracking-wider">
                        {{ isInsideProject ? 'Components' : 'Core Features' }}
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        <span
                          v-for="feature in plan.prd.coreFeatures"
                          :key="feature"
                          class="text-xs px-2 py-1 rounded-md bg-white/50 dark:bg-white/5 text-app"
                        >
                          {{ feature }}
                        </span>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-3 pt-4">
                      <Button v-if="!isInsideProject" @click="showKickoff = true">
                        <template #leading>
                          <Icon name="i-lucide-rocket" class="size-4" />
                        </template>
                        Create Project
                      </Button>
                      <Button v-else @click="saveFeaturePlan">
                        <template #leading>
                          <Icon name="i-lucide-save" class="size-4" />
                        </template>
                        Save Feature Plan
                      </Button>
                      <button
                        class="text-sm text-app-muted hover:text-app transition-colors"
                        @click="goToStep(1)"
                      >
                        Edit choices
                      </button>
                    </div>
                  </template>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>

      <!-- Kickoff Modal -->
      <ArchitectKickoffModal
        v-model:open="showKickoff"
        :plan="plan"
        @created="onProjectCreated"
      />
    </template>
  </DashboardPanel>
</template>

<style scoped>
.step-enter-active,
.step-leave-active {
  transition: all 0.2s ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}

/* Spinner: rotating ring */
.architect-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top-color: var(--app-accent);
  border-right-color: var(--app-accent);
  border-radius: 50%;
  animation: architect-spin 0.8s linear infinite;
}

@keyframes architect-spin {
  to { transform: rotate(360deg); }
}

/* Pulsing dot */
.architect-dot-pulse {
  animation: architect-pulse 1.5s ease-in-out infinite;
}

@keyframes architect-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
</style>
