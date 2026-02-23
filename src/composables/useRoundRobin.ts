/**
 * Round-Robin orchestration composable
 * Manages sequential multi-model chat where each model sees previous responses.
 */

import { ref, computed } from 'vue'
import type { ChatMessage, ContextStreamChunk } from './useContextService'

export interface InvitedModel {
  compositeId: string   // "anthropic:claude-opus-4-6"
  label: string         // "Claude Opus 4.6"
  providerId: string    // "anthropic"
  providerLabel: string // "Anthropic"
}

export interface RoundCallbacks {
  onModelStart: (model: InvitedModel, index: number) => void
  onChunk: (chunk: ContextStreamChunk, model: InvitedModel, index: number) => void
  onModelComplete: (content: string, model: InvitedModel, index: number) => void
  onModelError: (error: string, model: InvitedModel, index: number) => void
  onSequenceComplete: () => void
}

const MIN_MODELS = 2
const MAX_MODELS = 5

export function useRoundRobin() {
  const contextService = useContextService()

  const invitedModels = ref<InvitedModel[]>([])
  const isRunning = ref(false)
  const activeModelIndex = ref(-1)
  const completedIndices = ref<number[]>([])
  const errorIndices = ref<number[]>([])
  const cancelled = ref(false)
  let abortController: AbortController | null = null

  const canStart = computed(() => invitedModels.value.length >= MIN_MODELS && !isRunning.value)
  const canInvite = computed(() => invitedModels.value.length < MAX_MODELS)

  function inviteModel(model: InvitedModel) {
    if (invitedModels.value.length >= MAX_MODELS) return
    if (invitedModels.value.some(m => m.compositeId === model.compositeId)) return
    invitedModels.value.push({ ...model })
  }

  function removeModel(compositeId: string) {
    invitedModels.value = invitedModels.value.filter(m => m.compositeId !== compositeId)
  }

  function reorderModels(models: InvitedModel[]) {
    invitedModels.value = [...models]
  }

  function isInvited(compositeId: string): boolean {
    return invitedModels.value.some(m => m.compositeId === compositeId)
  }

  function buildRoundRobinSystemPrompt(model: InvitedModel, allModels: InvitedModel[], index: number): string {
    const participantList = allModels
      .map((m, i) => `${i + 1}. ${m.label} (${m.providerLabel})`)
      .join(', ')

    return [
      'You\'re in a roundtable discussion with other AI models.',
      `Participants: ${participantList}`,
      `You are #${index + 1} (${model.label}).`,
      index > 0
        ? 'Others have already answered — their responses are in the conversation. Give your own take. Agree, disagree, or build on what\'s been said.'
        : 'You\'re first up. Share your perspective.',
      'Keep it concise and conversational — like a panel discussion, not a documentation page. Skip anything already covered.',
    ].join('\n')
  }

  function buildMessagesForModel(
    userMsg: string,
    history: ChatMessage[],
    modelIndex: number,
    currentRoundResponses: { model: InvitedModel; content: string }[],
    systemPromptExtra?: string,
  ): ChatMessage[] {
    const models = invitedModels.value
    const model = models[modelIndex]
    if (!model) return []

    const messages: ChatMessage[] = []

    // System prompt: roundtable context + optional extra
    const systemParts = [buildRoundRobinSystemPrompt(model, models, modelIndex)]
    if (systemPromptExtra) systemParts.push(systemPromptExtra)
    messages.push({ role: 'system', content: systemParts.join('\n\n') })

    // Conversation history (prior rounds)
    for (const msg of history) {
      if (msg.role === 'system') continue
      messages.push({ role: msg.role, content: msg.content })
    }

    // Current user message
    messages.push({ role: 'user', content: userMsg })

    // Previous models' responses from this round
    for (const resp of currentRoundResponses.slice(0, modelIndex)) {
      messages.push({
        role: 'assistant',
        content: `[Response from ${resp.model.label} (${resp.model.providerLabel})]:\n${resp.content}`,
      })
    }

    return messages
  }

  async function executeRound(
    userMessage: string,
    history: ChatMessage[],
    callbacks: RoundCallbacks,
    options?: { token?: string; systemPrompt?: string; localData?: Record<string, unknown> },
  ): Promise<void> {
    if (isRunning.value) return
    if (invitedModels.value.length < MIN_MODELS) return

    isRunning.value = true
    cancelled.value = false
    abortController = new AbortController()
    activeModelIndex.value = -1
    completedIndices.value = []
    errorIndices.value = []

    const currentRoundResponses: { model: InvitedModel; content: string }[] = []

    for (let i = 0; i < invitedModels.value.length; i++) {
      if (cancelled.value) break

      const model = invitedModels.value[i]
      if (!model) continue

      activeModelIndex.value = i
      callbacks.onModelStart(model, i)

      const messages = buildMessagesForModel(
        userMessage,
        history,
        i,
        currentRoundResponses,
        options?.systemPrompt,
      )

      let accumulated = ''
      let hasError = false

      try {
        await new Promise<void>((resolve, reject) => {
          if (cancelled.value) {
            resolve()
            return
          }

          contextService.chatStream(
            {
              model: model.compositeId,
              messages,
              stream: true,
              token: options?.token,
              include_space_context: false,
              max_iterations: 1,
            },
            (chunk: ContextStreamChunk) => {
              if (cancelled.value) {
                resolve()
                return
              }

              if (chunk.error) {
                hasError = true
                errorIndices.value = [...errorIndices.value, i]
                callbacks.onModelError(chunk.error, model, i)
                resolve()
                return
              }

              if (chunk.content) {
                accumulated += chunk.content
                callbacks.onChunk(chunk, model, i)
              }

              if (chunk.done) {
                resolve()
              }
            },
            { signal: abortController?.signal },
          ).catch(reject)
        })
      } catch (err) {
        hasError = true
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        errorIndices.value = [...errorIndices.value, i]
        callbacks.onModelError(errorMsg, model, i)
      }

      if (!hasError && accumulated) {
        currentRoundResponses.push({ model, content: accumulated })
        completedIndices.value = [...completedIndices.value, i]
        callbacks.onModelComplete(accumulated, model, i)
      } else if (!hasError && !accumulated) {
        // Empty response but no error
        completedIndices.value = [...completedIndices.value, i]
        callbacks.onModelComplete('', model, i)
      }
    }

    isRunning.value = false
    activeModelIndex.value = -1
    callbacks.onSequenceComplete()
  }

  function cancelSequence() {
    cancelled.value = true
    isRunning.value = false
    activeModelIndex.value = -1
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  function reset() {
    invitedModels.value = []
    isRunning.value = false
    activeModelIndex.value = -1
    completedIndices.value = []
    errorIndices.value = []
    cancelled.value = false
  }

  return {
    // State
    invitedModels,
    isRunning,
    activeModelIndex,
    completedIndices,
    errorIndices,
    canStart,
    canInvite,

    // Actions
    inviteModel,
    removeModel,
    reorderModels,
    isInvited,
    executeRound,
    cancelSequence,
    reset,
  }
}
