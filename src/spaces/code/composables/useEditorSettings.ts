/**
 * Editor settings composable — theme, font, layout, cursor, behavior, features.
 * Persists settings via preferencesStore (synced with user account).
 */
import type * as Monaco from 'monaco-editor'

export type ThemeValue = 'auto' | 'vs' | 'vs-dark' | 'synthwave-84' | 'dracula' | 'one-dark'
  | 'night-owl' | 'github-dark' | 'monokai' | 'nord' | 'cobalt2' | 'material'
  | 'tokyo-night' | 'hc-black' | 'hc-light'

export interface EditorSettings {
  theme: ThemeValue
  fontSize: number
  fontFamily: 'JetBrains Mono' | 'Fira Code' | 'Source Code Pro' | 'Menlo' | 'Monaco'
  fontLigatures: boolean
  minimap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  wordWrap: 'on' | 'off' | 'bounded'
  renderWhitespace: 'none' | 'selection' | 'all'
  renderLineHighlight: 'none' | 'gutter' | 'line' | 'all'
  tabSize: number
  insertSpaces: boolean
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  cursorSmoothCaretAnimation: boolean
  smoothScrolling: boolean
  mouseWheelZoom: boolean
  formatOnPaste: boolean
  autoClosingBrackets: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never'
  bracketPairColorization: boolean
  folding: boolean
  links: boolean
  colorDecorators: boolean
  aiCompletion: boolean
  aiCompletionTrigger: 'onIdle' | 'onTyping' | 'onDemand'
}

export const themeOptions = [
  { label: 'Auto (Follow System)', value: 'auto' },
  { label: 'Light', value: 'vs' },
  { label: 'Dark', value: 'vs-dark' },
  { label: 'Synthwave \'84', value: 'synthwave-84' },
  { label: 'Dracula', value: 'dracula' },
  { label: 'One Dark', value: 'one-dark' },
  { label: 'Night Owl', value: 'night-owl' },
  { label: 'GitHub Dark', value: 'github-dark' },
  { label: 'Monokai', value: 'monokai' },
  { label: 'Nord', value: 'nord' },
  { label: 'Cobalt2', value: 'cobalt2' },
  { label: 'Material', value: 'material' },
  { label: 'Tokyo Night', value: 'tokyo-night' },
  { label: 'High Contrast Dark', value: 'hc-black' },
  { label: 'High Contrast Light', value: 'hc-light' },
]

export function useEditorSettings() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')
  const preferencesStore = usePreferencesStore()

  const editorSettings = reactive<EditorSettings>({
    theme: 'auto',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    fontLigatures: true,
    minimap: true,
    lineNumbers: 'on',
    wordWrap: 'on',
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    tabSize: 2,
    insertSpaces: true,
    cursorStyle: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: true,
    smoothScrolling: true,
    mouseWheelZoom: true,
    formatOnPaste: true,
    autoClosingBrackets: 'languageDefined',
    bracketPairColorization: true,
    folding: true,
    links: true,
    colorDecorators: true,
    aiCompletion: true,
    aiCompletionTrigger: 'onIdle',
  })

  const monacoTheme = computed(() => {
    if (editorSettings.theme === 'auto') {
      return isDark.value ? 'vs-dark' : 'vs'
    }
    return editorSettings.theme
  })

  const showSettings = ref(false)
  const settingsInitialized = ref(false)

  const editorOptions = computed<Monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    theme: monacoTheme.value,
    fontSize: editorSettings.fontSize,
    fontFamily: `${editorSettings.fontFamily}, Menlo, Monaco, Consolas, monospace`,
    fontLigatures: editorSettings.fontLigatures,
    minimap: { enabled: editorSettings.minimap },
    lineNumbers: editorSettings.lineNumbers,
    wordWrap: editorSettings.wordWrap,
    renderWhitespace: editorSettings.renderWhitespace,
    renderLineHighlight: editorSettings.renderLineHighlight,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: editorSettings.tabSize,
    insertSpaces: editorSettings.insertSpaces,
    cursorStyle: editorSettings.cursorStyle,
    cursorBlinking: editorSettings.cursorBlinking,
    cursorSmoothCaretAnimation: (editorSettings.cursorSmoothCaretAnimation ? 'on' : 'off') as 'on' | 'off',
    smoothScrolling: editorSettings.smoothScrolling,
    mouseWheelZoom: editorSettings.mouseWheelZoom,
    formatOnPaste: editorSettings.formatOnPaste,
    formatOnType: false,
    autoClosingBrackets: editorSettings.autoClosingBrackets,
    suggestOnTriggerCharacters: !editorSettings.aiCompletion,
    quickSuggestions: !editorSettings.aiCompletion,
    bracketPairColorization: { enabled: editorSettings.bracketPairColorization },
    folding: editorSettings.folding,
    foldingHighlight: true,
    showFoldingControls: 'always' as const,
    matchBrackets: 'always' as const,
    links: editorSettings.links,
    colorDecorators: editorSettings.colorDecorators,
    inlineSuggest: {
      enabled: editorSettings.aiCompletion,
      mode: 'subwordSmart' as const,
      showToolbar: 'onHover' as const,
      suppressSuggestions: false,
    },
    selectOnLineNumbers: true,
    roundedSelection: true,
    contextmenu: true,
    dragAndDrop: true,
    accessibilitySupport: 'auto' as const,
  }))

  // Debounced persistence
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  watch(editorSettings, (settings) => {
    if (!settingsInitialized.value) return
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      preferencesStore.setEditorSettings({ ...settings })
    }, 1000)
  }, { deep: true })

  /** Call once during onMounted to load persisted settings */
  async function initSettings() {
    await preferencesStore.init()
    const saved = preferencesStore.editorSettings
    if (saved) {
      Object.assign(editorSettings, saved)
    }
    nextTick(() => { settingsInitialized.value = true })
  }

  /** Call during onUnmounted to clean up debounce timer */
  function disposeSettings() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
  }

  return {
    editorSettings,
    themeOptions,
    monacoTheme,
    isDark,
    editorOptions,
    showSettings,
    settingsInitialized,
    initSettings,
    disposeSettings,
  }
}
