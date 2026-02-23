/**
 * Shared Monaco editor theme definitions and theme management
 * Used by Code editor and Git diff viewer to share the same theme
 */
import { computed } from 'vue'
import type * as Monaco from 'monaco-editor'

// ============================================================================
// Custom Theme Definitions
// ============================================================================

export const customThemes: Record<string, Monaco.editor.IStandaloneThemeData> = {
  'synthwave-84': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '848bbd', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7edb' },
      { token: 'string', foreground: 'ff8b39' },
      { token: 'number', foreground: 'f97e72' },
      { token: 'type', foreground: '36f9f6' },
      { token: 'function', foreground: '36f9f6' },
      { token: 'variable', foreground: 'ff7edb' },
      { token: 'constant', foreground: 'f97e72' },
      { token: 'operator', foreground: 'fede5d' },
      { token: 'tag', foreground: '72f1b8' },
      { token: 'attribute.name', foreground: 'fede5d' },
      { token: 'attribute.value', foreground: 'ff8b39' },
    ],
    colors: {
      'editor.background': '#262335',
      'editor.foreground': '#ffffff',
      'editor.lineHighlightBackground': '#34294f50',
      'editor.selectionBackground': '#463465',
      'editorCursor.foreground': '#ff7edb',
      'editorLineNumber.foreground': '#495495',
      'editorLineNumber.activeForeground': '#ff7edb',
    }
  },
  'dracula': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd', fontStyle: 'italic' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'variable', foreground: 'f8f8f2' },
      { token: 'constant', foreground: 'bd93f9' },
      { token: 'operator', foreground: 'ff79c6' },
      { token: 'tag', foreground: 'ff79c6' },
      { token: 'attribute.name', foreground: '50fa7b' },
      { token: 'attribute.value', foreground: 'f1fa8c' },
    ],
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#44475a75',
      'editor.selectionBackground': '#44475a',
      'editorCursor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#6272a4',
      'editorLineNumber.activeForeground': '#f8f8f2',
    }
  },
  'one-dark': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'function', foreground: '61afef' },
      { token: 'variable', foreground: 'e06c75' },
      { token: 'constant', foreground: 'd19a66' },
      { token: 'operator', foreground: '56b6c2' },
      { token: 'tag', foreground: 'e06c75' },
      { token: 'attribute.name', foreground: 'd19a66' },
      { token: 'attribute.value', foreground: '98c379' },
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#2c313c',
      'editor.selectionBackground': '#3e4451',
      'editorCursor.foreground': '#528bff',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#abb2bf',
    }
  },
  'night-owl': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '637777', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'string', foreground: 'ecc48d' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'type', foreground: 'ffcb8b' },
      { token: 'function', foreground: '82aaff' },
      { token: 'variable', foreground: 'd6deeb' },
      { token: 'constant', foreground: 'f78c6c' },
      { token: 'operator', foreground: 'c792ea' },
      { token: 'tag', foreground: '7fdbca' },
      { token: 'attribute.name', foreground: 'addb67' },
      { token: 'attribute.value', foreground: 'ecc48d' },
    ],
    colors: {
      'editor.background': '#011627',
      'editor.foreground': '#d6deeb',
      'editor.lineHighlightBackground': '#0b2942',
      'editor.selectionBackground': '#1d3b53',
      'editorCursor.foreground': '#80a4c2',
      'editorLineNumber.foreground': '#4b6479',
      'editorLineNumber.activeForeground': '#c5e4fd',
    }
  },
  'github-dark': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'function', foreground: 'd2a8ff' },
      { token: 'variable', foreground: 'ffa657' },
      { token: 'constant', foreground: '79c0ff' },
      { token: 'operator', foreground: 'ff7b72' },
      { token: 'tag', foreground: '7ee787' },
      { token: 'attribute.name', foreground: '79c0ff' },
      { token: 'attribute.value', foreground: 'a5d6ff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#c9d1d9',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#c9d1d9',
    }
  },
  'monokai': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f92672' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'type', foreground: '66d9ef', fontStyle: 'italic' },
      { token: 'function', foreground: 'a6e22e' },
      { token: 'variable', foreground: 'f8f8f2' },
      { token: 'constant', foreground: 'ae81ff' },
      { token: 'operator', foreground: 'f92672' },
      { token: 'tag', foreground: 'f92672' },
      { token: 'attribute.name', foreground: 'a6e22e' },
      { token: 'attribute.value', foreground: 'e6db74' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#3e3d32',
      'editor.selectionBackground': '#49483e',
      'editorCursor.foreground': '#f8f8f0',
      'editorLineNumber.foreground': '#90908a',
      'editorLineNumber.activeForeground': '#f8f8f2',
    }
  },
  'nord': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
      { token: 'keyword', foreground: '81a1c1' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'b48ead' },
      { token: 'type', foreground: '8fbcbb' },
      { token: 'function', foreground: '88c0d0' },
      { token: 'variable', foreground: 'd8dee9' },
      { token: 'constant', foreground: 'b48ead' },
      { token: 'operator', foreground: '81a1c1' },
      { token: 'tag', foreground: '81a1c1' },
      { token: 'attribute.name', foreground: '8fbcbb' },
      { token: 'attribute.value', foreground: 'a3be8c' },
    ],
    colors: {
      'editor.background': '#2e3440',
      'editor.foreground': '#d8dee9',
      'editor.lineHighlightBackground': '#3b4252',
      'editor.selectionBackground': '#434c5e',
      'editorCursor.foreground': '#d8dee9',
      'editorLineNumber.foreground': '#4c566a',
      'editorLineNumber.activeForeground': '#d8dee9',
    }
  },
  'cobalt2': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '0088ff', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff9d00' },
      { token: 'string', foreground: 'a5ff90' },
      { token: 'number', foreground: 'ff628c' },
      { token: 'type', foreground: '80ffbb' },
      { token: 'function', foreground: 'ffc600' },
      { token: 'variable', foreground: 'ffffff' },
      { token: 'constant', foreground: 'ff628c' },
      { token: 'operator', foreground: 'ff9d00' },
      { token: 'tag', foreground: '9effff' },
      { token: 'attribute.name', foreground: 'ffc600' },
      { token: 'attribute.value', foreground: 'a5ff90' },
    ],
    colors: {
      'editor.background': '#193549',
      'editor.foreground': '#ffffff',
      'editor.lineHighlightBackground': '#0d3a58',
      'editor.selectionBackground': '#0050a4',
      'editorCursor.foreground': '#ffc600',
      'editorLineNumber.foreground': '#aaaaaa',
      'editorLineNumber.activeForeground': '#ffffff',
    }
  },
  'material': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'string', foreground: 'c3e88d' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'type', foreground: 'ffcb6b' },
      { token: 'function', foreground: '82aaff' },
      { token: 'variable', foreground: 'eeffff' },
      { token: 'constant', foreground: 'f78c6c' },
      { token: 'operator', foreground: '89ddff' },
      { token: 'tag', foreground: 'f07178' },
      { token: 'attribute.name', foreground: 'ffcb6b' },
      { token: 'attribute.value', foreground: 'c3e88d' },
    ],
    colors: {
      'editor.background': '#263238',
      'editor.foreground': '#eeffff',
      'editor.lineHighlightBackground': '#00000050',
      'editor.selectionBackground': '#80cbc420',
      'editorCursor.foreground': '#ffcc00',
      'editorLineNumber.foreground': '#37474f',
      'editorLineNumber.activeForeground': '#eeffff',
    }
  },
  'tokyo-night': {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'bb9af7' },
      { token: 'string', foreground: '9ece6a' },
      { token: 'number', foreground: 'ff9e64' },
      { token: 'type', foreground: '2ac3de' },
      { token: 'function', foreground: '7aa2f7' },
      { token: 'variable', foreground: 'c0caf5' },
      { token: 'constant', foreground: 'ff9e64' },
      { token: 'operator', foreground: '89ddff' },
      { token: 'tag', foreground: 'f7768e' },
      { token: 'attribute.name', foreground: '73daca' },
      { token: 'attribute.value', foreground: '9ece6a' },
    ],
    colors: {
      'editor.background': '#1a1b26',
      'editor.foreground': '#c0caf5',
      'editor.lineHighlightBackground': '#292e42',
      'editor.selectionBackground': '#33467c',
      'editorCursor.foreground': '#c0caf5',
      'editorLineNumber.foreground': '#3b4261',
      'editorLineNumber.activeForeground': '#737aa2',
    }
  },
}

// ============================================================================
// Theme Registration
// ============================================================================

let themesRegistered = false

/**
 * Register all custom themes with a Monaco instance.
 * Safe to call multiple times — only registers once.
 */
export function registerMonacoThemes(monaco: typeof Monaco) {
  if (themesRegistered) return
  Object.entries(customThemes).forEach(([name, theme]) => {
    monaco.editor.defineTheme(name, theme)
  })
  themesRegistered = true
}

// ============================================================================
// Composable
// ============================================================================

/**
 * Get the resolved Monaco theme name based on user's editor settings.
 * Reads from the preferences store and follows color mode when set to 'auto'.
 */
export function useMonacoTheme() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')
  const preferencesStore = usePreferencesStore()

  const monacoTheme = computed(() => {
    const themeSetting = preferencesStore.editorSettings?.theme || 'auto'
    if (themeSetting === 'auto') {
      return isDark.value ? 'vs-dark' : 'vs'
    }
    return themeSetting
  })

  return {
    monacoTheme,
    isDark,
  }
}
