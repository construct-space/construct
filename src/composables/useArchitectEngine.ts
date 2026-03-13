/**
 * useArchitectEngine - Core logic for the Architect split-view UI
 *
 * Manages: AI calls, question flow, selection, navigation, and keyboard shortcuts.
 * Project creation logic lives in useArchitectProject.
 * JSON parsing lives in utils/json-parse.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useToolbar } from '@/composables/useToolbar'
import { useContextService } from '@/composables/useContextService'
import { useAIModel } from '@/composables/useAIModel'
import { useSpaces } from '@/composables/useSpaces'
import { isLikelyClarificationQuestion } from '@/composables/architectClarification'
import { buildArchitectPlanInput } from '@/composables/architectPlanInput'
import { useArchitectProject } from '@/composables/useArchitectProject'
import { parseJsonArray, parseJsonObject } from '@/utils/json-parse'
import type { InterviewQuestion } from '~/data/architect-knowledge'
import type { ArchitectPlan } from '@/utils/documentsGenerator'

// ─── Types ───

export interface ArchitectDecision {
  id: string
  label: string
  value: string | string[]
  icon?: string
  status: 'done' | 'active' | 'pending'
}

export function useArchitectEngine() {
  const projectStore = useProjectStore()
  const { setPageItems, clearToolbar } = useToolbar()
  const { spaces: installedSpaces, loadSpaces } = useSpaces()
  const { defaultModelId, init: initAIModel } = useAIModel()

  let abortController: AbortController | null = null

  // ─── State ───

  const currentProject = computed(() => projectStore.currentProject ?? null)
  const isInsideProject = computed(() => !!currentProject.value)
  const selectedModel = computed(() => (defaultModelId.value || 'auto').trim() || 'auto')

  // Core flow state
  const description = ref('')
  const questions = ref<InterviewQuestion[]>([])
  const answers = ref<Record<string, string | string[]>>({})
  const plan = ref<ArchitectPlan | null>(null)

  // Loading
  const isGeneratingQuestions = ref(false)
  const isGeneratingPlan = ref(false)
  const isClarifying = ref(false)
  const isThinking = ref(false)
  const thinkingMessage = ref('')
  const errorMessage = ref('')
  const clarificationMessage = ref('')
  const isReviewing = ref(false)
  const reviewReport = ref<{ issues: Array<{ severity: string; area: string; problem: string; suggestion: string }> } | null>(null)

  // Selection state for the active question
  const activeQuestionIndex = ref(-1) // -1 = describe step
  const selectedSingle = ref<string | null>(null)
  const selectedMulti = ref<string[]>([])
  const showOtherInput = ref(false)
  const otherInputValue = ref('')

  // ─── Project (delegated) ───

  const project = useArchitectProject({
    plan,
    answers,
    currentProject: currentProject as any,
    isInsideProject,
    onReset: handleReset,
  })

  // ─── AI Chat ───
  // Uses the dedicated architect_stream Tauri command → brain's ai.architect_stream handler.
  // Bypasses conductor/agent orchestration for direct JSON output + lower latency.

  async function architectCall(
    mode: 'questions' | 'plan' | 'clarify' | 'review',
    model: string,
    signal?: AbortSignal,
    onStatus?: (status: string) => void,
    options?: {
      clarification?: string
      currentQuestion?: InterviewQuestion | null
      planJson?: string
    },
  ): Promise<string> {
    const { isTauri } = useContextService()

    if (!isTauri.value) {
      throw new Error('AI requires the Construct desktop app.')
    }
    if (signal?.aborted) throw new Error('Cancelled')

    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')

    // Build installed spaces for the brain
    const spaces = installedSpaces.value
      .filter(s => s.scope === 'project' || s.scope === 'both')
      .map(s => ({ name: s.name, displayName: s.displayName, description: s.description || '', scope: s.scope }))

    let content = ''
    let streamError: string | null = null
    let isDone = false

    const streamComplete = new Promise<void>((resolve, reject) => {
      const finish = (error?: string) => {
        if (isDone) return
        isDone = true
        if (unlisten) { unlisten(); unlisten = null }
        if (error) reject(new Error(error))
        else resolve()
      }

      if (signal) {
        if (signal.aborted) { finish(); return }
        signal.addEventListener('abort', () => finish(), { once: true })
      }

      let unlisten: (() => void) | null = null
      listen<{ content: string; done: boolean; error?: string; message_type?: string }>('architect-stream-chunk', (event) => {
        if (isDone) return
        if (signal?.aborted) { finish(); return }

        const chunk = event.payload
        if (chunk.error) { finish(chunk.error); return }

        const t = chunk.message_type || ''
        if (t === 'architect.status') {
          if (chunk.content) onStatus?.(chunk.content)
          return
        }

        if (t === 'architect.final_json' && chunk.content) {
          content = chunk.content
          onStatus?.('Done')
          return
        }

        if (t === 'architect.error') {
          finish(chunk.content || 'Architect error')
          return
        }

        if (chunk.done || t === 'architect.done') {
          finish()
          return
        }

        if (chunk.content) {
          content += chunk.content
        }
      }).then((fn) => {
        unlisten = fn
        if (isDone) { fn(); unlisten = null }
      })
    })

    const planInput = mode === 'plan'
      ? buildArchitectPlanInput(description.value, questions.value, answers.value)
      : null

    await invoke('architect_stream', {
      model,
      mode,
      description: planInput?.description || description.value,
      answers: mode === 'plan' ? planInput?.answers : null,
      currentQuestion: mode === 'clarify' ? options?.currentQuestion : null,
      clarification: mode === 'clarify' ? options?.clarification : null,
      planJson: mode === 'review' ? options?.planJson : null,
      installedSpaces: spaces.length > 0 ? spaces : null,
    })

    await streamComplete

    if (signal?.aborted) throw new Error('Cancelled')
    if (streamError) throw new Error(streamError)
    if (!content.trim()) throw new Error('Empty response from AI. Check your AI provider settings.')
    return content
  }

  // ─── Computed ───

  const isDone = computed(() => plan.value !== null)
  const isLoading = computed(() => isGeneratingQuestions.value || isGeneratingPlan.value || isClarifying.value)

  const currentQuestion = computed(() => {
    if (activeQuestionIndex.value < 0 || activeQuestionIndex.value >= questions.value.length) return null
    return questions.value[activeQuestionIndex.value] || null
  })

  const questionFlow = computed(() => {
    return questions.value.map((q, i) => {
      const isAnswered = !!answers.value[q.id]
      const isCurrent = i === activeQuestionIndex.value && !isDone.value
      return {
        ...q,
        index: i,
        answered: isAnswered,
        active: isCurrent,
        upcoming: !isAnswered && !isCurrent,
        answerLabel: isAnswered ? getAnswerLabel(q.id) : null,
      }
    })
  })

  const decisions = computed((): ArchitectDecision[] => {
    return questions.value.map((q, i) => {
      const val = answers.value[q.id]
      const isAnswered = !!val
      const isCurrent = i === activeQuestionIndex.value && !isDone.value

      return {
        id: q.id,
        label: q.id.toUpperCase().replace(/([A-Z])/g, ' $1').trim(),
        value: val || '',
        icon: q.options[0]?.icon,
        status: isAnswered ? 'done' : isCurrent ? 'active' : 'pending',
      }
    })
  })

  const answeredCount = computed(() => Object.keys(answers.value).length)
  const totalQuestions = computed(() => questions.value.length)

  // ─── Selection ───

  watch(activeQuestionIndex, () => {
    selectedSingle.value = null
    selectedMulti.value = []
    showOtherInput.value = false
    otherInputValue.value = ''
    clarificationMessage.value = ''
  })

  function selectOption(value: string) {
    if (!currentQuestion.value) return

    if (value === '__other__') {
      showOtherInput.value = true
      selectedSingle.value = null
      return
    }

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
      setTimeout(confirmSelection, 200)
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
    clarificationMessage.value = ''
    advanceToNext()
  }

  function confirmOther() {
    if (!currentQuestion.value || !otherInputValue.value.trim()) return

    const qId = currentQuestion.value.id
    const customValue = otherInputValue.value.trim()

    if (currentQuestion.value.type === 'multi') {
      selectedMulti.value = [...selectedMulti.value.filter(v => v !== 'none'), customValue]
      showOtherInput.value = false
      otherInputValue.value = ''
    } else {
      answers.value[qId] = customValue
      clarificationMessage.value = ''
      showOtherInput.value = false
      otherInputValue.value = ''
      advanceToNext()
    }
  }

  function advanceToNext() {
    if (activeQuestionIndex.value < questions.value.length - 1) {
      activeQuestionIndex.value++
    } else {
      void generatePlan()
    }
  }

  // ─── Navigation ───

  function goToQuestion(index: number) {
    if (index < 0 || index >= questions.value.length) return

    for (let i = index; i < questions.value.length; i++) {
      const q = questions.value[i]
      if (q) {
        const { [q.id]: _removed, ...rest } = answers.value
        answers.value = rest
      }
    }
    plan.value = null
    activeQuestionIndex.value = index

    const q = questions.value[index]
    if (q) {
      const prev = answers.value[q.id]
      if (Array.isArray(prev)) {
        selectedMulti.value = [...prev]
        selectedSingle.value = null
      } else if (prev) {
        selectedSingle.value = prev as string
        selectedMulti.value = []
      }
    }
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

  // ─── Thinking Message Rotation ───

  function rotateMessages(messages: string[], intervalMs: number): () => void {
    let i = 0
    thinkingMessage.value = messages[0]
    const timer = setInterval(() => {
      i = (i + 1) % messages.length
      thinkingMessage.value = messages[i]
    }, intervalMs)
    return () => clearInterval(timer)
  }

  // ─── AI Call 1: Generate Questions ───

  async function submitDescription(desc?: string) {
    const text = desc || description.value.trim()
    if (!text) return
    description.value = text

    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller

    isGeneratingQuestions.value = true
    isThinking.value = true
    errorMessage.value = ''
    clarificationMessage.value = ''

    const stopRotation = rotateMessages([
      'Reading your description...',
      'Understanding the scope...',
      'Thinking about what to ask...',
      'Identifying key decisions...',
      'Preparing your interview...',
    ], 2200)

    await nextTick()

    try {
      if (isInsideProject.value && currentProject.value) {
        const proj = currentProject.value
        description.value = `Project: "${proj.name}" — ${proj.description || 'No description'}\nSpaces enabled: ${proj.spaces?.join(', ') || 'none'}\n\nFeature request: ${text}`
      }

      const content = await architectCall(
        'questions',
        selectedModel.value,
        controller.signal,
        (status) => { thinkingMessage.value = status },
      )

      const parsed = parseJsonArray<InterviewQuestion>(content)
      if (parsed.length > 0) {
        questions.value = parsed
        activeQuestionIndex.value = 0
      } else {
        errorMessage.value = 'Failed to generate questions. The AI response was not in the expected format.'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect to AI'
      if (msg !== 'Cancelled') errorMessage.value = msg
    } finally {
      stopRotation()
      isGeneratingQuestions.value = false
      isThinking.value = false
      if (abortController === controller) abortController = null
    }
  }

  // ─── AI Call 2: Generate Plan ───

  async function generatePlan() {
    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller

    isGeneratingPlan.value = true
    isThinking.value = true
    errorMessage.value = ''
    clarificationMessage.value = ''

    const stopRotation = rotateMessages([
      'Analyzing your choices...',
      'Designing the architecture...',
      'Planning the implementation...',
      'Writing the blueprint...',
      'Finalizing the plan...',
    ], 2500)

    await nextTick()

    try {
      const content = await architectCall(
        'plan',
        selectedModel.value,
        controller.signal,
        (status) => { thinkingMessage.value = status },
      )

      const parsed = parseJsonObject(content)
      if (parsed) {
        plan.value = parsed as unknown as ArchitectPlan
        // Fire off a background review using a different model
        void reviewPlan(content)
      } else {
        errorMessage.value = 'Failed to generate plan. The AI response was not in the expected format.'
        activeQuestionIndex.value = questions.value.length - 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect to AI'
      if (msg !== 'Cancelled') errorMessage.value = msg
    } finally {
      stopRotation()
      isGeneratingPlan.value = false
      isThinking.value = false
      if (abortController === controller) abortController = null
    }
  }

  /**
   * Review the generated plan using a different (budget) model.
   * Runs in the background — doesn't block the UI.
   */
  async function reviewPlan(planJson: string) {
    isReviewing.value = true
    reviewReport.value = null

    try {
      const content = await architectCall(
        'review',
        'auto:budget',
        undefined,
        undefined,
        { planJson },
      )

      const parsed = parseJsonObject(content)
      if (parsed && Array.isArray((parsed as Record<string, unknown>).issues)) {
        reviewReport.value = parsed as {
          issues: Array<{ severity: string; area: string; problem: string; suggestion: string }>
        }
      }
    } catch (e) {
      console.warn('[Architect] Plan review failed (non-critical):', e)
    } finally {
      isReviewing.value = false
    }
  }

  // ─── Reset ───

  function handleReset() {
    description.value = ''
    questions.value = []
    answers.value = {}
    plan.value = null
    activeQuestionIndex.value = -1
    selectedSingle.value = null
    selectedMulti.value = []
    showOtherInput.value = false
    otherInputValue.value = ''
    errorMessage.value = ''
    clarificationMessage.value = ''
    reviewReport.value = null
    isReviewing.value = false
    project.resetProjectState()
  }

  function cancelRequest() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function requestClarification(text: string) {
    if (!currentQuestion.value) return
    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller

    isClarifying.value = true
    isThinking.value = true
    errorMessage.value = ''
    thinkingMessage.value = 'Clarifying the current question...'

    try {
      const content = await architectCall(
        'clarify',
        selectedModel.value,
        controller.signal,
        (status) => { thinkingMessage.value = status },
        {
          clarification: text,
          currentQuestion: currentQuestion.value,
        },
      )

      const parsed = parseJsonObject(content) as { answer?: string, keepQuestion?: boolean } | null
      clarificationMessage.value = typeof parsed?.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim()
        : content.trim()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to clarify the current question'
      if (msg !== 'Cancelled') errorMessage.value = msg
    } finally {
      isClarifying.value = false
      isThinking.value = false
      if (abortController === controller) abortController = null
    }
  }

  // ─── Input handling (bottom bar) ───

  function handleInput(text: string) {
    if (activeQuestionIndex.value < 0) {
      submitDescription(text)
    } else {
      if (!currentQuestion.value) return
      if (isLikelyClarificationQuestion(text, currentQuestion.value)) {
        void requestClarification(text)
        return
      }
      const qId = currentQuestion.value.id
      answers.value[qId] = text.trim()
      clarificationMessage.value = ''
      advanceToNext()
    }
  }

  // ─── Keyboard Shortcuts ───

  function handleKeydown(e: KeyboardEvent) {
    if (activeQuestionIndex.value < 0 || !currentQuestion.value) return
    if (isDone.value || isLoading.value) return

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

    const num = parseInt(e.key)
    if (num >= 1 && num <= currentQuestion.value.options.length) {
      e.preventDefault()
      selectOption(currentQuestion.value.options[num - 1]!.value)
    }

    if (e.key === 'Enter' && currentQuestion.value.type === 'multi' && selectedMulti.value.length > 0) {
      e.preventDefault()
      confirmSelection()
    }

    if (e.key === 'Escape' || (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))) {
      e.preventDefault()
      if (activeQuestionIndex.value > 0) {
        goToQuestion(activeQuestionIndex.value - 1)
      } else {
        handleReset()
      }
    }
  }

  // ─── Lifecycle ───

  function setup() {
    initAIModel()
    loadSpaces()
    window.addEventListener('keydown', handleKeydown)
    setPageItems([{
      id: 'architect-reset',
      icon: 'i-lucide-refresh-cw',
      label: 'Start Over',
      type: 'action',
      category: 'space',
      onClick: handleReset,
    }])
  }

  function cleanup() {
    window.removeEventListener('keydown', handleKeydown)
    clearToolbar()
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return {
    // State
    description,
    questions,
    answers,
    plan,
    activeQuestionIndex,
    selectedSingle,
    selectedMulti,
    showOtherInput,
    otherInputValue,
    errorMessage,
    isGeneratingQuestions,
    isGeneratingPlan,
    isClarifying,
    isThinking,
    thinkingMessage,
    clarificationMessage,
    isReviewing,
    reviewReport,
    isLoading,
    isDone,
    currentQuestion,
    isInsideProject,
    currentProject,

    // Flow
    questionFlow,
    decisions,
    answeredCount,
    totalQuestions,

    // Project (re-exported from useArchitectProject)
    showProjectConfig: project.showProjectConfig,
    projectPath: project.projectPath,
    initGit: project.initGit,
    isKicking: project.isKicking,
    kickoffProgress: project.kickoffProgress,
    progressMessage: project.progressMessage,
    isConstructSpace: project.isConstructSpace,
    detectedTemplate: project.detectedTemplate,
    detectedBackendTemplate: project.detectedBackendTemplate,
    rawFrontendName: project.rawFrontendName,
    rawBackendName: project.rawBackendName,

    // Actions
    submitDescription,
    selectOption,
    confirmSelection,
    confirmOther,
    goToQuestion,
    getAnswerLabel,
    handleReset,
    cancelRequest,
    handleInput,
    showConfigStep: project.showConfigStep,
    browseProjectDir: project.browseProjectDir,
    createProject: project.createProject,
    saveFeaturePlan: project.saveFeaturePlan,

    // Lifecycle
    setup,
    cleanup,
  }
}
