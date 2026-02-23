import { defineStore } from 'pinia'
import type { BulkTranslationData } from '~/composables/useTranslation'

interface TranslationState {
  translations: Record<string, Record<string, Record<string, Record<string, string>>>> // model -> modelId -> field -> lang -> value
  loading: boolean
  error: string | null
}

export const useTranslationsStore = defineStore('translations', {
  state: (): TranslationState => ({
    translations: {},
    loading: false,
    error: null
  }),

  getters: {
    /**
     * Get translations for a specific model and field
     */
    getFieldTranslations: (state) => (model: string, modelId: number, field: string): Record<string, string> => {
      const modelTranslations = state.translations[model]
      if (!modelTranslations) return {}
      const instanceTranslations = modelTranslations[String(modelId)]
      if (!instanceTranslations) return {}
      return instanceTranslations[field] || {}
    },

    /**
     * Check if a specific translation exists
     */
    hasTranslation: (state) => (model: string, modelId: number, field: string, lang: string): boolean => {
      const modelTranslations = state.translations[model]
      if (!modelTranslations) return false
      const instanceTranslations = modelTranslations[String(modelId)]
      if (!instanceTranslations) return false
      const fieldTranslations = instanceTranslations[field]
      if (!fieldTranslations) return false
      return !!fieldTranslations[lang]
    },

    /**
     * Get all translations for a model instance
     */
    getModelTranslations: (state) => (model: string, modelId: number): Record<string, Record<string, string>> => {
      const modelTranslations = state.translations[model]
      if (!modelTranslations) return {}
      return modelTranslations[String(modelId)] || {}
    }
  },

  actions: {
    /**
     * Save translations for a specific field across multiple languages
     */
    async saveFieldTranslations(
      modelType: string,
      modelId: number,
      fieldName: string,
      translations: Record<string, string>
    ) {
      this.loading = true
      this.error = null

      const api = useApi()
      const results = []
      const errors = []

      try {
        // Save each language separately
        for (const [langCode, value] of Object.entries(translations)) {
          if (value && value.trim()) {
            try {
              const data: BulkTranslationData = {
                model: modelType,
                modelId,
                language: langCode,
                translations: { [fieldName]: value.trim() }
              }

              const result = await api.post<unknown>('/translations/bulk', data)

              results.push({ language: langCode, success: true, result })

              // Update local state
              this.setFieldTranslation(modelType, modelId, fieldName, langCode, value.trim())
            } catch (error) {
              console.error(`Failed to save ${fieldName} for ${langCode}:`, error)
              errors.push({ language: langCode, error })
            }
          }
        }

        if (errors.length > 0) {
          const errorLangs = errors.map(e => e.language).join(', ')
          throw new Error(`Failed to save translations for languages: ${errorLangs}`)
        }

        return results
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to save translations'
        this.error = errorMessage
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Fetch translations for a specific model instance
     */
    async fetchModelTranslations(model: string, modelId: number) {
      this.loading = true
      this.error = null

      const api = useApi()

      try {
        const data = await api.get<Record<string, Record<string, string>>>(`/translations/${model}/${modelId}`)

        // Store translations in state
        if (!this.translations[model]) {
          this.translations[model] = {}
        }
        this.translations[model][String(modelId)] = data

        return data
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch translations'
        this.error = errorMessage
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Set a single field translation in local state
     */
    setFieldTranslation(
      model: string,
      modelId: number,
      field: string,
      lang: string,
      value: string
    ) {
      const modelIdKey = String(modelId)
      if (!this.translations[model]) {
        this.translations[model] = {}
      }
      if (!this.translations[model][modelIdKey]) {
        this.translations[model][modelIdKey] = {}
      }
      if (!this.translations[model][modelIdKey][field]) {
        this.translations[model][modelIdKey][field] = {}
      }
      this.translations[model][modelIdKey][field][lang] = value
    },

    /**
     * Clear translations for a specific model instance
     */
    clearModelTranslations(model: string, modelId: number) {
      if (this.translations[model]) {
        const modelIdKey = String(modelId)
        const { [modelIdKey]: _, ...rest } = this.translations[model]
        this.translations[model] = rest
      }
    },

    /**
     * Clear all translations
     */
    clearAllTranslations() {
      this.translations = {}
    }
  }
})
