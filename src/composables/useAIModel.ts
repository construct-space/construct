/**
 * AI Model composable
 * Manages default AI model selection with persistence
 *
 * All providers and models come from the context service (Go backend).
 * To add a new provider, add it in context/providers/ - no frontend changes needed.
 */

import { ref, computed } from 'vue'
import type { AIProvider } from './useContextService'

// Storage key for default model (stores "providerId:modelId")
const MODEL_STORAGE_KEY = 'app-default-ai-model'
const DEFAULT_MODEL = 'zai:glm-4.7' // Z.AI default
const AUTO_MODEL_SENTINELS = new Set(['', 'auto', 'conductor'])

export type AuthType = 'oauth' | 'api' | 'local'

export interface AIModelOption {
  id: string
  label: string
  providerId: string
  providerLabel: string
  authType: AuthType
}

// Shared state across all instances
const providers = ref<AIProvider[]>([])
const loading = ref(false)
const initialized = ref(false)
const defaultModelId = ref<string>(DEFAULT_MODEL)
const providerDefaultModelId = ref<string>(DEFAULT_MODEL)
let initPromise: Promise<void> | null = null

const isAutoModelId = (modelId?: string | null): boolean => {
  const normalized = (modelId || '').trim().toLowerCase()
  return AUTO_MODEL_SENTINELS.has(normalized)
}

const toCompositeModelId = (providerId: string, modelId: string): string => `${providerId}:${modelId}`
const isNotConnectedError = (error: unknown): boolean =>
  String(error).toLowerCase().includes('not connected')

// Load from localStorage on init
const loadFromStorage = () => {
  if (import.meta.client) {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)?.trim() || ''
    if (stored) {
      defaultModelId.value = isAutoModelId(stored) ? 'auto' : stored
    }
  }
}

// Check if model supports vision
// Handles both plain model IDs and composite IDs (provider:model)
export const isVisionModel = (modelId: string): boolean => {
  // Extract model part from composite ID if present
  const model = modelId.includes(':') ? modelId.split(':')[1] || modelId : modelId

  return model.includes('vision') ||
         model.includes('4.6v') ||
         model.startsWith('claude-') ||
         model.includes('claude') ||
         model.startsWith('grok-4') || // Grok 4+ has vision
         model.startsWith('kimi-k2') || // Kimi K2+ has vision
         model.startsWith('gemini-') || // Gemini has vision
         modelId.includes('anthropic') // Provider-based check for Claude
}

// Load on first import (client-side only)
if (import.meta.client && !initialized.value) {
  loadFromStorage()
}

export const useAIModel = () => {
  // All models flattened with provider info
  // id is "providerId:modelId" for uniqueness
  const allModels = computed<AIModelOption[]>(() => {
    const models: AIModelOption[] = []
    for (const provider of providers.value) {
      for (const model of provider.models) {
        models.push({
          id: `${provider.id}:${model.id}`, // Composite ID for uniqueness
          label: model.label,
          providerId: provider.id,
          providerLabel: provider.label,
          authType: (provider.authType || 'api') as AuthType,
        })
      }
    }
    return models
  })

  // Models grouped by provider for UI (with composite IDs)
  const modelsByProvider = computed(() => {
    return providers.value.map(provider => ({
      provider,
      models: provider.models.map(m => ({ ...m, compositeId: `${provider.id}:${m.id}` })),
      icon: provider.icon || 'i-lucide-cpu',
      authType: (provider.authType || 'api') as AuthType,
    }))
  })

  // Get current default model details
  const currentModel = computed(() => {
    return allModels.value.find(m => m.id === defaultModelId.value)
  })

  // Get provider for current model
  const currentProvider = computed(() => {
    if (!currentModel.value) return null
    return providers.value.find(p => p.id === currentModel.value?.providerId)
  })

  // Get the raw model ID (without provider prefix) for API calls
  const getModelId = (compositeId: string): string => {
    if (isAutoModelId(compositeId)) return 'auto'
    const parts = compositeId.split(':')
    return parts.length > 1 ? (parts[1] ?? compositeId) : compositeId
  }

  // Get the provider ID from composite ID
  const getProviderId = (compositeId: string): string => {
    if (isAutoModelId(compositeId)) return 'auto'
    const parts = compositeId.split(':')
    return parts.length > 1 ? (parts[0] ?? 'zai') : 'zai'
  }

  // Set default model (accepts composite ID "providerId:modelId")
  const setDefaultModel = (compositeId: string) => {
    const candidate = compositeId.trim()
    if (!candidate) return
    const normalized = isAutoModelId(candidate) ? 'auto' : candidate
    defaultModelId.value = normalized
    if (import.meta.client) {
      localStorage.setItem(MODEL_STORAGE_KEY, normalized)
    }
  }

  const normalizeToAvailableModel = (candidate: string): string | null => {
    const trimmed = candidate.trim()
    if (!trimmed) return null
    if (isAutoModelId(trimmed)) return 'auto'
    if (allModels.value.some(m => m.id === trimmed)) return trimmed

    // Backward compatibility for old storage format that only kept raw model ID.
    if (!trimmed.includes(':')) {
      const legacyMatch = allModels.value.find(m => m.id.endsWith(`:${trimmed}`))
      if (legacyMatch) return legacyMatch.id
    }
    return null
  }

  const resolveModelId = (
    preferredModelId?: string | null,
    options?: {
      allowAuto?: boolean
      fallbackModelId?: string
      persist?: boolean
    },
  ): string => {
    const allowAuto = options?.allowAuto ?? true
    const fallbackModelId = options?.fallbackModelId ?? DEFAULT_MODEL
    const preferred = (preferredModelId ?? defaultModelId.value).trim()

    if (isAutoModelId(preferred)) {
      const resolved = allowAuto ? 'auto' : (normalizeToAvailableModel(fallbackModelId) || allModels.value[0]?.id || DEFAULT_MODEL)
      if (options?.persist && resolved !== defaultModelId.value) {
        setDefaultModel(resolved)
      }
      return resolved
    }

    // If providers are not loaded yet, keep current selection as-is.
    // Do not eagerly persist raw legacy IDs before we can validate against provider catalog.
    if (allModels.value.length === 0) {
      const unresolved = preferred || fallbackModelId
      const shouldPersist = options?.persist
        && unresolved !== defaultModelId.value
        && (unresolved.includes(':') || isAutoModelId(unresolved))
      if (shouldPersist) {
        setDefaultModel(unresolved)
      }
      return unresolved
    }

    const exact = normalizeToAvailableModel(preferred)
    if (exact && exact !== 'auto') {
      if (options?.persist && exact !== defaultModelId.value) {
        setDefaultModel(exact)
      }
      return exact
    }

    const fromServerDefault = normalizeToAvailableModel(providerDefaultModelId.value)
    const fromConfiguredFallback = normalizeToAvailableModel(fallbackModelId)
    const firstAvailable = allModels.value[0]?.id
    const resolved = fromServerDefault || fromConfiguredFallback || firstAvailable || DEFAULT_MODEL

    if (options?.persist && resolved !== defaultModelId.value) {
      setDefaultModel(resolved)
    }
    return resolved
  }

  // Load providers from context service (single source of truth)
  const loadProviders = async (retries = 5) => {
    if (loading.value) return
    loading.value = true
    try {
      const { listProviders, isTauri, connected, connect } = useContextService()

      // In Tauri, ensure context service is connected before requesting providers.
      if (isTauri.value && !connected.value) {
        try {
          await connect()
        } catch (error) {
          if (retries > 0) {
            loading.value = false
            await new Promise(resolve => setTimeout(resolve, 500))
            return loadProviders(retries - 1)
          }
          throw error
        }
      }

      const response = await listProviders()
      providers.value = response.providers || []
      const defaultProviderId = (response.defaultProvider || response.default || '').trim()
      const defaultModelFromServer = (response.defaultModel || '').trim()
        || (() => {
          if (!defaultProviderId) return ''
          const provider = providers.value.find(p => p.id === defaultProviderId)
          const modelId = provider?.models?.[0]?.id
          return provider && modelId ? toCompositeModelId(provider.id, modelId) : ''
        })()
      if (defaultModelFromServer) {
        providerDefaultModelId.value = defaultModelFromServer
      }

      // If model is not explicitly set on this device yet, use backend default model.
      if (defaultModelFromServer && import.meta.client && !localStorage.getItem(MODEL_STORAGE_KEY)) {
        defaultModelId.value = defaultModelFromServer
      }

      // Heal stale/invalid selections — but do NOT overwrite an explicit user
      // selection when the provider catalog is incomplete (e.g. OAuth providers
      // not yet loaded).  Only persist if the model was truly resolved to a
      // different available model, not when it fell through to a generic fallback.
      const stored = import.meta.client ? localStorage.getItem(MODEL_STORAGE_KEY) : null
      const resolved = resolveModelId(defaultModelId.value, {
        allowAuto: true,
        fallbackModelId: providerDefaultModelId.value || DEFAULT_MODEL,
        persist: false,
      })
      // Only persist the healed value if the stored selection doesn't look like
      // a valid composite ID (provider:model).  This prevents overwriting e.g.
      // "anthropic-oauth:claude-opus-4-6" with "deepseek:deepseek-chat" when
      // the OAuth provider hasn't loaded yet.
      if (stored && stored.includes(':') && resolved !== stored && !normalizeToAvailableModel(stored)) {
        // Keep the user's stored value — provider may appear after OAuth check
        defaultModelId.value = stored
      } else {
        defaultModelId.value = resolved
        if (import.meta.client && resolved !== stored) {
          localStorage.setItem(MODEL_STORAGE_KEY, resolved)
        }
      }
    } catch (err) {
      // Retry on transient startup race (context service not connected yet)
      if (retries > 0 && isNotConnectedError(err)) {
        loading.value = false
        await new Promise(resolve => setTimeout(resolve, 500))
        return loadProviders(retries - 1)
      }
      if (isNotConnectedError(err)) {
        return
      }
      console.error('[useAIModel] Failed to load providers:', err)
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  // Initialize - call once on first component mount
  const init = async () => {
    if (initialized.value) return
    loadFromStorage()
    await loadProviders()
  }

  // Auto-init if not initialized. Guard with a shared promise so multiple
  // simultaneous imports don't trigger parallel init() calls.
  if (import.meta.client && !initialized.value && !loading.value) {
    if (!initPromise) {
      initPromise = init().finally(() => { initPromise = null })
    }
  }

  return {
    // State
    providers,
    allModels,
    modelsByProvider,
    defaultModelId,
    currentModel,
    currentProvider,
    loading,
    initialized,

    // Actions
    setDefaultModel,
    resolveModelId,
    isAutoModelId,
    isVisionModel,
    loadProviders,
    init,

    // Helpers
    getModelId,
    getProviderId,
  }
}
