import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { themeOptions, useEditorSettings } from '../useEditorSettings'

// Override useColorMode for these tests
function setupColorMode(mode: 'dark' | 'light') {
  ;(globalThis as Record<string, unknown>).useColorMode = () => ref(mode)
}

describe('themeOptions', () => {
  it('is an array of {label, value} objects', () => {
    expect(Array.isArray(themeOptions)).toBe(true)
    for (const opt of themeOptions) {
      expect(opt).toHaveProperty('label')
      expect(opt).toHaveProperty('value')
    }
  })

  it('contains auto, vs, vs-dark, and custom themes', () => {
    const values = themeOptions.map(t => t.value)
    expect(values).toContain('auto')
    expect(values).toContain('vs')
    expect(values).toContain('vs-dark')
    expect(values).toContain('dracula')
    expect(values).toContain('monokai')
    expect(values).toContain('nord')
  })

  it('has 15 entries', () => {
    expect(themeOptions).toHaveLength(15)
  })
})

describe('useEditorSettings', () => {
  describe('monacoTheme computed', () => {
    it('auto + dark mode → vs-dark', () => {
      setupColorMode('dark')
      const { editorSettings, monacoTheme } = useEditorSettings()
      editorSettings.theme = 'auto'
      expect(monacoTheme.value).toBe('vs-dark')
    })

    it('auto + light mode → vs', () => {
      setupColorMode('light')
      const { editorSettings, monacoTheme } = useEditorSettings()
      editorSettings.theme = 'auto'
      expect(monacoTheme.value).toBe('vs')
    })

    it('explicit theme → that theme', () => {
      setupColorMode('dark')
      const { editorSettings, monacoTheme } = useEditorSettings()
      editorSettings.theme = 'dracula'
      expect(monacoTheme.value).toBe('dracula')
    })

    it('explicit vs theme in dark mode → vs (not overridden)', () => {
      setupColorMode('dark')
      const { editorSettings, monacoTheme } = useEditorSettings()
      editorSettings.theme = 'vs'
      expect(monacoTheme.value).toBe('vs')
    })
  })

  describe('editorOptions computed', () => {
    it('maps fontSize correctly', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()
      editorSettings.fontSize = 16
      expect(editorOptions.value.fontSize).toBe(16)
    })

    it('maps fontFamily with fallbacks', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()
      editorSettings.fontFamily = 'Fira Code'
      expect(editorOptions.value.fontFamily).toBe('Fira Code, Menlo, Monaco, Consolas, monospace')
    })

    it('maps minimap enabled', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()
      editorSettings.minimap = false
      expect(editorOptions.value.minimap).toEqual({ enabled: false })
    })

    it('maps wordWrap', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()
      editorSettings.wordWrap = 'off'
      expect(editorOptions.value.wordWrap).toBe('off')
    })

    it('AI completion toggles inline suggest', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()

      editorSettings.aiCompletion = true
      expect(editorOptions.value.inlineSuggest?.enabled).toBe(true)

      editorSettings.aiCompletion = false
      expect(editorOptions.value.inlineSuggest?.enabled).toBe(false)
    })

    it('AI completion toggles quick suggestions inversely', () => {
      setupColorMode('dark')
      const { editorSettings, editorOptions } = useEditorSettings()

      editorSettings.aiCompletion = true
      expect(editorOptions.value.quickSuggestions).toBe(false)

      editorSettings.aiCompletion = false
      expect(editorOptions.value.quickSuggestions).toBe(true)
    })

    it('includes fixed options', () => {
      setupColorMode('dark')
      const { editorOptions } = useEditorSettings()
      expect(editorOptions.value.scrollBeyondLastLine).toBe(false)
      expect(editorOptions.value.automaticLayout).toBe(true)
      expect(editorOptions.value.contextmenu).toBe(true)
    })
  })
})
