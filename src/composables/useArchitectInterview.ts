import {
  type InterviewQuestion,
  INTERVIEW_PHASES,
  buildSystemPrompt,
  parseInterviewContent,
  getLabelForValue,
  getRecommendation
} from '~/data/architect-knowledge'

export interface InterviewAnswer {
  phaseId: string
  value: string | string[]
  label: string | string[]
  timestamp: Date
}

export interface InterviewState {
  appDescription: string
  answers: Record<string, string | string[]>
  currentPhaseIndex: number
  isComplete: boolean
  plan: Record<string, unknown> | null
}

export interface ParsedMessage {
  id: string
  type: 'text' | 'question' | 'selection' | 'plan'
  content: string
  question?: InterviewQuestion
  selection?: {
    phaseId: string
    value: string | string[]
    label: string | string[]
  }
  plan?: Record<string, unknown>
  role: 'user' | 'assistant'
}

/**
 * Map AI-generated question IDs to INTERVIEW_PHASES IDs
 * This ensures progress tracking works correctly
 */
function mapToPhaseId(questionId: string, question?: string): string {
  const id = questionId.toLowerCase()
  const q = (question || '').toLowerCase()

  // Direct matches
  if (id.includes('platform') || q.includes('platform') || q.includes('web app') || q.includes('mobile app') || q.includes('desktop app')) {
    return 'platform'
  }
  if (id.includes('frontend') || id.includes('framework') || q.includes('frontend') || q.includes('react') || q.includes('vue') || q.includes('next') || q.includes('nuxt')) {
    return 'frontend'
  }
  if (id.includes('backend') || id.includes('server') || id.includes('api') || q.includes('backend') || q.includes('server') || q.includes('api')) {
    return 'backend'
  }
  if (id.includes('database') || id.includes('db') || id.includes('storage') || q.includes('database') || q.includes('data storage')) {
    return 'database'
  }
  if (id.includes('auth') || id.includes('login') || id.includes('user') || q.includes('authentication') || q.includes('login') || q.includes('sign')) {
    return 'auth'
  }
  if (id.includes('design') || id.includes('style') || id.includes('ui') || q.includes('design') || q.includes('style') || q.includes('look')) {
    return 'designStyle'
  }
  if (id.includes('feature') || id.includes('functionality') || q.includes('feature') || q.includes('functionality')) {
    return 'features'
  }
  if (id.includes('deploy') || id.includes('host') || id.includes('cloud') || q.includes('deploy') || q.includes('host')) {
    return 'deployment'
  }

  // If no match found, use the original ID
  return questionId
}

export function useArchitectInterview() {
  // Core state
  const appDescription = ref('')
  const answers = ref<Record<string, string | string[]>>({})
  const plan = ref<Record<string, unknown> | null>(null)
  const isComplete = ref(false)

  // UI state
  const pendingQuestion = ref<InterviewQuestion | null>(null)
  const editingPhaseId = ref<string | null>(null)

  // Computed
  const currentPhaseIndex = computed(() => {
    const answeredPhases = Object.keys(answers.value).filter(k => {
      const val = answers.value[k]
      return val && (Array.isArray(val) ? val.length > 0 : true)
    })
    return answeredPhases.length
  })

  const currentPhase = computed(() => {
    return INTERVIEW_PHASES[currentPhaseIndex.value] || null
  })

  const completedPhases = computed(() => {
    return INTERVIEW_PHASES.filter(phase => {
      const val = answers.value[phase.id]
      return val && (Array.isArray(val) ? val.length > 0 : true)
    })
  })

  const systemPrompt = computed(() => {
    return buildSystemPrompt(answers.value, appDescription.value)
  })

  const progress = computed(() => {
    const total = INTERVIEW_PHASES.length
    const completed = completedPhases.value.length
    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100)
    }
  })

  // Get recommendation based on app description
  const recommendation = computed(() => {
    if (!appDescription.value) return null
    return getRecommendation(appDescription.value)
  })

  // Parse AI message content for structured data
  function parseAIMessage(content: string): {
    textBefore: string
    question: InterviewQuestion | null
    plan: Record<string, unknown> | null
    textAfter: string
  } {
    const result = parseInterviewContent(content)

    // Update pending question if found
    if (result.question) {
      pendingQuestion.value = result.question
    }

    // Update plan if found
    if (result.plan) {
      plan.value = result.plan
      isComplete.value = true
    }

    return result
  }

  // Record an answer - maps question ID to phase ID for progress tracking
  function recordAnswer(questionId: string, value: string | string[], question?: string) {
    // Map AI-generated question ID to a known phase ID for progress tracking
    const normalizedPhaseId = mapToPhaseId(questionId, question)
    answers.value[normalizedPhaseId] = value
    pendingQuestion.value = null

    // If editing a previous answer, clear all subsequent answers
    if (editingPhaseId.value) {
      const editIndex = INTERVIEW_PHASES.findIndex(p => p.id === editingPhaseId.value)
      const phaseIdsToRemove = new Set(INTERVIEW_PHASES.slice(editIndex + 1).map(p => p.id))
      const newAnswers: Record<string, string | string[]> = {}
      for (const [key, val] of Object.entries(answers.value)) {
        if (!phaseIdsToRemove.has(key)) {
          newAnswers[key] = val
        }
      }
      answers.value = newAnswers
      editingPhaseId.value = null
      isComplete.value = false
      plan.value = null
    }
  }

  // Format answer for sending to AI
  function formatAnswerMessage(phaseId: string, value: string | string[]): string {
    const labels = Array.isArray(value)
      ? value.map(v => getLabelForValue(phaseId, v))
      : getLabelForValue(phaseId, value)

    const labelStr = Array.isArray(labels) ? labels.join(', ') : labels

    return `I choose: ${labelStr}`
  }

  // Get answer display info
  function getAnswerDisplay(phaseId: string): { value: string | string[]; label: string | string[] } | null {
    const value = answers.value[phaseId]
    if (!value) return null

    const label = Array.isArray(value)
      ? value.map(v => getLabelForValue(phaseId, v))
      : getLabelForValue(phaseId, value)

    return { value, label }
  }

  // Start editing a previous phase
  function startEditPhase(phaseId: string) {
    editingPhaseId.value = phaseId
    // The actual re-asking will happen when the user confirms
  }

  // Get "not sure" response
  function getNotSureMessage(phaseId: string): string {
    return `I'm not sure what to choose for ${phaseId}. What do you recommend for my app?`
  }

  // Reset interview
  function reset() {
    appDescription.value = ''
    answers.value = {}
    plan.value = null
    isComplete.value = false
    pendingQuestion.value = null
    editingPhaseId.value = null
  }

  // Set app description (from first user message)
  function setAppDescription(description: string) {
    appDescription.value = description
  }

  // Check if a phase can be edited (all phases except current can be edited)
  function canEditPhase(phaseId: string): boolean {
    return !!answers.value[phaseId]
  }

  // Get phase info
  function getPhaseInfo(phaseId: string) {
    return INTERVIEW_PHASES.find(p => p.id === phaseId)
  }

  return {
    // State
    appDescription: readonly(appDescription),
    answers: readonly(answers),
    plan: readonly(plan),
    isComplete: readonly(isComplete),
    pendingQuestion: readonly(pendingQuestion),
    editingPhaseId: readonly(editingPhaseId),

    // Computed
    currentPhaseIndex,
    currentPhase,
    completedPhases,
    systemPrompt,
    progress,
    recommendation,
    phases: INTERVIEW_PHASES,

    // Methods
    parseAIMessage,
    recordAnswer,
    formatAnswerMessage,
    getAnswerDisplay,
    startEditPhase,
    getNotSureMessage,
    reset,
    setAppDescription,
    canEditPhase,
    getPhaseInfo
  }
}
