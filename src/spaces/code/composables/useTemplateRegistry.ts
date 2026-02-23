/**
 * useTemplateRegistry - Merges built-in templates with user-defined custom templates
 *
 * Custom templates are persisted in localStorage under 'construct_custom_templates'.
 * Provides CRUD operations for managing custom templates and a merged view of all templates.
 */
import type { TemplateConfig } from '../templates.config'
import { templates as builtInTemplates } from '../templates.config'

const STORAGE_KEY = 'construct_custom_templates'

function loadCustomTemplates(): TemplateConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Ensure all loaded templates have custom flag
    return parsed.map((t: TemplateConfig) => ({ ...t, custom: true }))
  } catch {
    return []
  }
}

function saveCustomTemplates(templates: TemplateConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

// Shared reactive state
const customTemplatesList = ref<TemplateConfig[]>(loadCustomTemplates())

export function useTemplateRegistry() {
  // All templates: built-in + custom merged
  const allTemplates = computed<TemplateConfig[]>(() => {
    return [...builtInTemplates, ...customTemplatesList.value]
  })

  // Just the user-added ones
  const customTemplates = computed<TemplateConfig[]>(() => {
    return customTemplatesList.value
  })

  // Check if a template is user-defined
  function isCustomTemplate(id: string): boolean {
    return customTemplatesList.value.some(t => t.id === id)
  }

  // Validate a template has required fields
  function validateTemplate(template: Partial<TemplateConfig>): string | null {
    if (!template.id || !template.id.trim()) return 'Template ID is required'
    if (!template.name || !template.name.trim()) return 'Template name is required'
    if (!template.category) return 'Category is required'
    if (!template.create?.cmd) return 'Create command is required'
    // Check for ID collision with built-in templates
    if (builtInTemplates.some(t => t.id === template.id)) {
      return `Template ID "${template.id}" conflicts with a built-in template`
    }
    return null
  }

  // Add a new custom template
  function addCustomTemplate(template: TemplateConfig): { success: boolean; error?: string } {
    const error = validateTemplate(template)
    if (error) return { success: false, error }

    // Check for duplicate ID in custom templates
    if (customTemplatesList.value.some(t => t.id === template.id)) {
      return { success: false, error: `Custom template with ID "${template.id}" already exists` }
    }

    const newTemplate: TemplateConfig = { ...template, custom: true }
    customTemplatesList.value = [...customTemplatesList.value, newTemplate]
    saveCustomTemplates(customTemplatesList.value)
    return { success: true }
  }

  // Remove a custom template by ID (only custom, not built-in)
  function removeCustomTemplate(id: string): boolean {
    if (!isCustomTemplate(id)) return false
    customTemplatesList.value = customTemplatesList.value.filter(t => t.id !== id)
    saveCustomTemplates(customTemplatesList.value)
    return true
  }

  // Update a custom template
  function updateCustomTemplate(id: string, updates: Partial<TemplateConfig>): { success: boolean; error?: string } {
    const index = customTemplatesList.value.findIndex(t => t.id === id)
    if (index === -1) return { success: false, error: 'Template not found' }

    // If ID is being changed, validate the new ID
    if (updates.id && updates.id !== id) {
      if (builtInTemplates.some(t => t.id === updates.id)) {
        return { success: false, error: `Template ID "${updates.id}" conflicts with a built-in template` }
      }
      if (customTemplatesList.value.some(t => t.id === updates.id && t.id !== id)) {
        return { success: false, error: `Custom template with ID "${updates.id}" already exists` }
      }
    }

    const updated = { ...customTemplatesList.value[index], ...updates, custom: true as const }
    const newList = [...customTemplatesList.value]
    newList[index] = updated
    customTemplatesList.value = newList
    saveCustomTemplates(customTemplatesList.value)
    return { success: true }
  }

  // Export custom templates as JSON string (for sharing)
  function exportTemplates(): string {
    return JSON.stringify(customTemplatesList.value, null, 2)
  }

  // Import templates from JSON string
  function importTemplates(json: string): { success: boolean; imported: number; error?: string } {
    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) {
        return { success: false, imported: 0, error: 'Expected a JSON array of templates' }
      }

      let imported = 0
      for (const template of parsed) {
        if (!template.id || !template.name || !template.create?.cmd) continue
        // Skip duplicates
        if (builtInTemplates.some(t => t.id === template.id)) continue
        if (customTemplatesList.value.some(t => t.id === template.id)) continue

        const newTemplate: TemplateConfig = {
          ...template,
          custom: true,
          // Ensure required defaults
          icon: template.icon || 'i-lucide-box',
          category: template.category || 'frontend',
          packageManager: template.packageManager || 'none',
          commands: template.commands || {},
        }
        customTemplatesList.value = [...customTemplatesList.value, newTemplate]
        imported++
      }

      saveCustomTemplates(customTemplatesList.value)
      return { success: true, imported }
    } catch {
      return { success: false, imported: 0, error: 'Invalid JSON' }
    }
  }

  return {
    allTemplates,
    customTemplates,
    addCustomTemplate,
    removeCustomTemplate,
    updateCustomTemplate,
    isCustomTemplate,
    exportTemplates,
    importTemplates,
  }
}
