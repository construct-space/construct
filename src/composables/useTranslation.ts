import { ref, computed, watch, onMounted } from 'vue'
import { useTranslationsStore } from '~/stores/translations'

// Type definitions for translation API
export interface BulkTranslationData {
  model: string
  modelId: number
  language: string
  translations: Record<string, string>
}

// Type definitions
export type TranslationField = {
  original?: string
  [language: string]: string | undefined
}

export interface BackendTranslationField {
  original: string
  [language: string]: string
}

export const SUPPORTED_LANGUAGES = {
  de: 'Deutsch',
  fr: 'Français', 
  it: 'Italiano',
  en: 'English'
} as const

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES

/**
 * Main translation composable - wraps the translations store
 */
export const useTranslation = () => {
  const translationsStore = useTranslationsStore()

  return {
    SUPPORTED_LANGUAGES,
    saveFieldTranslations: translationsStore.saveFieldTranslations,
    fetchModelTranslations: translationsStore.fetchModelTranslations,
    getFieldTranslations: translationsStore.getFieldTranslations,
    hasTranslation: translationsStore.hasTranslation,
    getModelTranslations: translationsStore.getModelTranslations,
    clearModelTranslations: translationsStore.clearModelTranslations,
    clearAllTranslations: translationsStore.clearAllTranslations,
    loading: computed(() => translationsStore.loading),
    error: computed(() => translationsStore.error)
  }
}

/**
 * Translation state management composable
 */
export const useTranslationState = () => {
  // Initialize with fallback to 'de' (no vue-i18n dependency)
  const initialLanguage: SupportedLanguage = 'de'
  
  // Global state
  const currentLanguage = ref<SupportedLanguage>(initialLanguage)
  const defaultLanguage = ref<SupportedLanguage>('de')
  const availableLanguages = ref<SupportedLanguage[]>(['de', 'en', 'fr', 'it'])
  
  // UI state
  const showTranslationIndicators = ref(true)
  const showOriginalValues = ref(false)
  const autoSaveTranslations = ref(true)
  
  // Preferences persistence
  const STORAGE_KEY = 'admin-translation-preferences'
  
  const loadPreferences = () => {
    // Only run on client side to avoid SSR hydration issues
    if (typeof window === 'undefined') return
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const prefs = JSON.parse(stored)
        // Only update if different from current value to avoid hydration mismatches
        if (prefs.currentLanguage && prefs.currentLanguage !== currentLanguage.value) {
          currentLanguage.value = prefs.currentLanguage
        }
        defaultLanguage.value = prefs.defaultLanguage || 'de'
        showTranslationIndicators.value = prefs.showTranslationIndicators ?? true
        showOriginalValues.value = prefs.showOriginalValues ?? false
        autoSaveTranslations.value = prefs.autoSaveTranslations ?? true
      }
    } catch (error) {
      console.warn('Failed to load translation preferences:', error)
    }
  }
  
  const savePreferences = () => {
    // Only run on client side
    if (typeof window === 'undefined') return
    
    try {
      const prefs = {
        currentLanguage: currentLanguage.value,
        defaultLanguage: defaultLanguage.value,
        showTranslationIndicators: showTranslationIndicators.value,
        showOriginalValues: showOriginalValues.value,
        autoSaveTranslations: autoSaveTranslations.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (error) {
      console.warn('Failed to save translation preferences:', error)
    }
  }
  
  // Watch for changes and auto-save
  watch([
    currentLanguage,
    defaultLanguage,
    showTranslationIndicators,
    showOriginalValues,
    autoSaveTranslations
  ], savePreferences)

  // State management functions
  const setCurrentLanguage = (language: SupportedLanguage) => {
    if (availableLanguages.value.includes(language)) {
      currentLanguage.value = language
    }
  }
  
  const toggleLanguage = () => {
    const current = currentLanguage.value
    const currentIndex = availableLanguages.value.indexOf(current)
    const nextIndex = (currentIndex + 1) % availableLanguages.value.length
    const nextLang = availableLanguages.value[nextIndex]
    if (nextLang) {
      currentLanguage.value = nextLang
    }
  }
  
  const getLanguageName = (language: SupportedLanguage) => {
    return SUPPORTED_LANGUAGES[language]
  }
  
  const getCurrentLanguageName = computed(() => {
    return getLanguageName(currentLanguage.value)
  })
  
  // Load preferences on client-side only (after hydration)
  onMounted(() => {
    loadPreferences()
  })

  return {
    // State
    currentLanguage: computed(() => currentLanguage.value),
    defaultLanguage: computed(() => defaultLanguage.value),
    availableLanguages: computed(() => availableLanguages.value),
    showTranslationIndicators: computed(() => showTranslationIndicators.value),
    showOriginalValues: computed(() => showOriginalValues.value),
    autoSaveTranslations: computed(() => autoSaveTranslations.value),
    getCurrentLanguageName,
    
    // State management
    setCurrentLanguage,
    toggleLanguage,
    getLanguageName,
    setShowTranslationIndicators: (show: boolean) => { showTranslationIndicators.value = show },
    setShowOriginalValues: (show: boolean) => { showOriginalValues.value = show },
    setAutoSaveTranslations: (autoSave: boolean) => { autoSaveTranslations.value = autoSave },
    savePreferences,
    loadPreferences
  }
}