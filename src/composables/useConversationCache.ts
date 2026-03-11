/**
 * useConversationCache — Conversation persistence for the AI Assistant.
 *
 * Handles loading/saving conversations via SQLite (Tauri) or localStorage (web).
 * Includes compaction to keep payloads small.
 *
 * Extracted from AssistantFloat.vue.
 */
import type { Ref } from 'vue'
import type { ChatMessage, ToolCallDisplay, AIConversationResponse } from '~/types/assistant'

const STORAGE_KEY = 'construct_ai_conversations'

const isContextNotConnectedError = (error: unknown): boolean =>
  String(error).toLowerCase().includes('not connected')

/** Compact messages for storage — strip heavy fields that bloat the payload */
function compactMessagesForStorage(msgs: ChatMessage[]): ChatMessage[] {
  const MAX_RESULT_LEN = 300
  const MAX_ARG_LEN = 200

  return msgs.map((msg) => {
    const compact: ChatMessage = {
      role: msg.role,
      content: msg.content,
    }

    if (msg.conductorQuestion) compact.conductorQuestion = msg.conductorQuestion
    if (msg.selectedOptions) compact.selectedOptions = msg.selectedOptions
    if (msg.imageUrl) compact.imageUrl = msg.imageUrl
    if (msg.searchImages?.length) compact.searchImages = msg.searchImages

    if (msg.toolCalls?.length) {
      compact.toolCalls = msg.toolCalls.map((tc) => {
        const compactTc: ToolCallDisplay = {
          id: tc.id,
          name: tc.name,
          arguments: {},
          status: tc.status,
          expanded: false,
          startTime: 0,
        }

        if (tc.arguments) {
          const args: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(tc.arguments)) {
            if (k === 'raw' && typeof v === 'object' && v !== null) {
              const rawArgs: Record<string, unknown> = {}
              for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) {
                if (typeof rv === 'string' && rv.length > MAX_ARG_LEN) {
                  rawArgs[rk] = rv.slice(0, MAX_ARG_LEN) + '…'
                } else {
                  rawArgs[rk] = rv
                }
              }
              args[k] = rawArgs
            } else if (typeof v === 'string' && v.length > MAX_ARG_LEN) {
              args[k] = v.slice(0, MAX_ARG_LEN) + '…'
            } else {
              args[k] = v
            }
          }
          compactTc.arguments = args
        }

        if (tc.result) {
          if (tc.result.length > MAX_RESULT_LEN) {
            compactTc.result = tc.result.slice(0, MAX_RESULT_LEN) + '… [truncated]'
          } else {
            compactTc.result = tc.result
          }
        }

        return compactTc
      })
    }

    return compact
  })
}

const RECENT_TURNS_FOR_SAVE = 6

/** Select the most recent N user turns (plus their assistant replies) */
function selectRecentTurns(msgs: ChatMessage[], turns = RECENT_TURNS_FOR_SAVE): ChatMessage[] {
  const selected: ChatMessage[] = []
  let capturedTurns = 0
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const msg = msgs[i]
    if (!msg) continue
    selected.unshift(msg)
    if (msg.role === 'user') {
      capturedTurns += 1
      if (capturedTurns >= turns) break
    }
  }
  return selected
}

interface ConversationCacheDeps {
  isTauri: Ref<boolean>
  sendRequest: (method: string, params: Record<string, unknown>) => Promise<unknown>
  messages: Ref<ChatMessage[]>
}

export function useConversationCache(deps: ConversationCacheDeps) {
  const { isTauri, sendRequest, messages } = deps

  let conversationCache = new Map<string, ChatMessage[]>()

  /** Load all conversations from SQLite or localStorage */
  async function loadConversationCache(): Promise<Map<string, ChatMessage[]>> {
    if (typeof window === 'undefined') return new Map()

    if (isTauri.value) {
      try {
        const result = await sendRequest('ai.conversations.list', {}) as AIConversationResponse
        if (result?.conversations) {
          const map = new Map<string, ChatMessage[]>()
          for (const conv of result.conversations) {
            try {
              const parsed = JSON.parse(conv.messages_json) as ChatMessage[]
              map.set(conv.context_key, parsed)
            } catch { /* skip invalid */ }
          }
          return map
        }
      } catch (e) {
        if (!isContextNotConnectedError(e)) {
          console.warn('[ConversationCache] Failed to load from SQLite:', e)
        }
      }
      return new Map()
    }

    // localStorage fallback
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return new Map(Object.entries(parsed))
      }
    } catch (e) {
      console.warn('[ConversationCache] Failed to load from localStorage:', e)
    }
    return new Map()
  }

  /** Save a single conversation by context key */
  async function saveConversation(contextKey: string, msgs: ChatMessage[]) {
    if (typeof window === 'undefined') return

    if (isTauri.value) {
      try {
        const trimmed = selectRecentTurns(msgs)
        const compacted = compactMessagesForStorage(trimmed)
        const payload = JSON.stringify(compacted)
        if (import.meta.env.DEV) {
          console.log(`[save] contextKey=${contextKey} payload=${Math.round(payload.length / 1024)}KB messages=${msgs.length}`)
        }
        await sendRequest('ai.conversations.save', {
          contextKey,
          messages: payload,
        })
      } catch (e) {
        if (String(e).includes('payload_too_large')) {
          console.warn('[ConversationCache] Payload too large, retrying with stripped tool results')
          const compactedForRetry = compactMessagesForStorage(msgs)
          const lastImageIdx = compactedForRetry.reduce((last, m, i) => m.imageUrl ? i : last, -1)
          const stripped = compactedForRetry.map((m, i) => ({
            ...m,
            imageUrl: (m.imageUrl && i !== lastImageIdx) ? undefined : m.imageUrl,
            toolCalls: m.toolCalls?.map(tc => ({
              ...tc,
              result: tc.result ? `[${tc.name} result stripped — payload too large]` : tc.result,
              arguments: {},
            })),
          }))
          try {
            await sendRequest('ai.conversations.save', {
              contextKey,
              messages: JSON.stringify(stripped),
            })
          } catch (retryErr) {
            console.warn('[ConversationCache] Retry save also failed:', retryErr)
          }
        } else if (!isContextNotConnectedError(e)) {
          console.warn('[ConversationCache] Failed to save to SQLite:', e)
        }
      }
      return
    }

    // localStorage fallback
    const obj: Record<string, ChatMessage[]> = {}
    conversationCache.forEach((v, k) => { obj[k] = compactMessagesForStorage(v) })
    obj[contextKey] = compactMessagesForStorage(msgs)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (e) {
      console.warn('[ConversationCache] Failed to save to localStorage:', e)
    }
  }

  // Incremental save — upsert a single message
  const upsertTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let lastIncrementalSaveTs = 0

  function saveMessageIncremental(contextKey: string, messageIndex: number, message: ChatMessage) {
    if (typeof window === 'undefined' || !isTauri.value) return

    const key = `${contextKey}:${messageIndex}`
    const existing = upsertTimers.get(key)
    if (existing) clearTimeout(existing)

    upsertTimers.set(key, setTimeout(async () => {
      upsertTimers.delete(key)
      try {
        const compacted = compactMessagesForStorage([message])[0]
        await sendRequest('ai.conversations.upsert_message', {
          contextKey,
          messageIndex,
          message: JSON.stringify(compacted),
        })
        lastIncrementalSaveTs = Date.now()
      } catch (e) {
        if (!isContextNotConnectedError(e)) {
          console.warn('[ConversationCache] Incremental save failed, falling back to full save:', e)
          saveConversation(contextKey, messages.value)
        }
      }
    }, 200))
  }

  /** Save entire cache (used by clear operations) */
  async function saveConversationCache(cache: Map<string, ChatMessage[]>) {
    if (typeof window === 'undefined') return

    if (isTauri.value) {
      for (const [key, msgs] of cache.entries()) {
        await saveConversation(key, msgs)
      }
      return
    }

    const obj: Record<string, ChatMessage[]> = {}
    cache.forEach((v, k) => { obj[k] = v })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (e) {
      console.warn('[ConversationCache] Failed to save cache:', e)
    }
  }

  return {
    get conversationCache() { return conversationCache },
    set conversationCache(v: Map<string, ChatMessage[]>) { conversationCache = v },
    loadConversationCache,
    saveConversation,
    saveMessageIncremental,
    saveConversationCache,
    compactMessagesForStorage,
    get lastIncrementalSaveTs() { return lastIncrementalSaveTs },
  }
}
