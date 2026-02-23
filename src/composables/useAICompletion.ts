/**
 * useAICompletion - AI-powered inline code completions (Copilot-style)
 *
 * Pre-loads monacopilot on app start to avoid timing issues with Monaco.
 * Provides registration function for Code.vue to call when editor is ready.
 */
import type * as Monaco from 'monaco-editor'
import type { CompletionRegistration, RegisterCompletionOptions } from 'monacopilot'
import { invoke } from '@tauri-apps/api/core'

// Module-level state (singleton)
let monacopilotModule: typeof import('monacopilot') | null = null
let isLoading = false
let loadError: Error | null = null

// Pre-load monacopilot module
const preloadMonacopilot = async () => {
  if (monacopilotModule || isLoading) return
  if (typeof window === 'undefined') return

  isLoading = true
  try {
    monacopilotModule = await import('monacopilot')
    console.log('[AI Completion] Monacopilot pre-loaded successfully')
  } catch (e) {
    loadError = e instanceof Error ? e : new Error(String(e))
    console.error('[AI Completion] Failed to pre-load monacopilot:', e)
  } finally {
    isLoading = false
  }
}

// Start preloading immediately when this module is imported
if (typeof window !== 'undefined') {
  preloadMonacopilot()
}

export function useAICompletion() {
  const registration = ref<CompletionRegistration | null>(null)
  const isEnabled = ref(false)
  const isReady = ref(false)

  // Wait for monacopilot to be loaded
  const waitForModule = async (): Promise<typeof import('monacopilot') | null> => {
    if (monacopilotModule) return monacopilotModule
    if (loadError) return null

    // Wait for loading to complete
    let attempts = 0
    while (isLoading && attempts < 50) {
      await new Promise(r => setTimeout(r, 100))
      attempts++
    }

    return monacopilotModule
  }

  // Register completion provider with Monaco editor
  const register = async (
    monaco: typeof Monaco,
    editor: Monaco.editor.IStandaloneCodeEditor,
    options: {
      language: string
      filename?: string
      technologies?: string[]
      trigger?: 'onIdle' | 'onTyping' | 'onDemand'
    }
  ) => {
    if (typeof window === 'undefined') return

    const module = await waitForModule()
    if (!module) {
      console.error('[AI Completion] Monacopilot not available')
      return
    }

    // Deregister previous if exists
    if (registration.value) {
      registration.value.deregister()
      registration.value = null
    }

    try {
      const registerOptions: RegisterCompletionOptions = {
        language: options.language,
        trigger: options.trigger || 'onIdle',
        filename: options.filename,
        technologies: options.technologies,
        maxContextLines: 30, // Keep small for fast responses
        enableCaching: true,

        // Custom request handler - calls our context service with timeout
        requestHandler: async ({ body }) => {
          try {
            // Add timeout to prevent blocking (2 second max for fast feedback)
            const timeoutPromise = new Promise<{ completion: null }>((resolve) => {
              setTimeout(() => resolve({ completion: null }), 2000)
            })

            const requestPromise = invoke<{ completion: string | null; error?: string }>('send_context_request', {
              requestType: 'code.complete',
              payload: body,
            })

            const result = await Promise.race([requestPromise, timeoutPromise])
            return {
              completion: result?.completion || null,
              error: (result as { error?: string })?.error,
            }
          } catch (e: unknown) {
            // Ignore cancellation (normal when typing fast)
            const err = e as Error
            if (err?.message === 'Canceled' || err?.name === 'AbortError') {
              return { completion: null }
            }
            // Don't log errors to avoid console spam
            return { completion: null }
          }
        },

        onError: (error) => {
          // Ignore cancellation errors (normal when typing fast)
          if (error?.message === 'Canceled' || error?.name === 'AbortError') {
            return
          }
          console.error('[AI Completion] Provider error:', error)
        },
      }

      registration.value = module.registerCompletion(monaco, editor, registerOptions)
      isEnabled.value = true
      isReady.value = true
      console.log('[AI Completion] Registered for', options.language)
    } catch (e) {
      console.error('[AI Completion] Registration failed:', e)
    }
  }

  // Deregister and cleanup
  const deregister = () => {
    if (registration.value) {
      registration.value.deregister()
      registration.value = null
    }
    isEnabled.value = false
  }

  // Trigger completion manually
  const trigger = () => {
    registration.value?.trigger()
  }

  // Update options dynamically
  const updateOptions = (updater: (opts: RegisterCompletionOptions) => Partial<RegisterCompletionOptions>) => {
    registration.value?.updateOptions(updater)
  }

  return {
    isEnabled: readonly(isEnabled),
    isReady: readonly(isReady),
    register,
    deregister,
    trigger,
    updateOptions,
  }
}
