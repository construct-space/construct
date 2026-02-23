<script setup lang="ts">
/**
 * GitDiffViewer - Monaco DiffEditor wrapper for viewing file changes
 * Shows side-by-side or unified diff view
 * Uses the same theme as the main Code editor
 */
import type * as Monaco from 'monaco-editor'
import { useMonaco } from '~/composables/useMonaco'
import { registerMonacoThemes, useMonacoTheme } from '~/composables/useMonacoThemes'

interface Props {
  filePath: string
  originalContent: string
  modifiedContent: string
  isBinary?: boolean
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isBinary: false,
  isLoading: false,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Theme — shared with Code editor
const { monacoTheme } = useMonacoTheme()

// Register custom themes when Monaco is available
onMounted(async () => {
  const monaco = await useMonaco()
  if (monaco) {
    registerMonacoThemes(monaco as unknown as typeof Monaco)
  }
})

// View mode state
const viewMode = ref<'split' | 'unified'>('split')

// Diff stats
const additions = ref(0)
const deletions = ref(0)

// Editor instance reference
const editorRef = ref<Monaco.editor.IStandaloneDiffEditor | null>(null)

// Get language from file extension
const getLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    // TypeScript/JavaScript
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    // Data
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    // Markdown
    md: 'markdown',
    mdx: 'mdx',
    // Programming languages
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    // Config
    toml: 'ini',
    ini: 'ini',
    env: 'ini',
    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    // Vue/Svelte/React
    vue: 'vue',
    svelte: 'svelte',
    // Other
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    makefile: 'shell',
  }
  return langMap[ext || ''] || 'plaintext'
}

const language = computed(() => getLanguage(props.filePath))

// Compute diff stats from content
const computeStats = () => {
  if (!props.originalContent && !props.modifiedContent) {
    additions.value = 0
    deletions.value = 0
    return
  }

  const originalLines = props.originalContent.split('\n')
  const modifiedLines = props.modifiedContent.split('\n')

  // Simple line-based diff counting
  // This is a rough estimate - Monaco's diff editor handles the actual diff
  const originalSet = new Set(originalLines)
  const modifiedSet = new Set(modifiedLines)

  let added = 0
  let deleted = 0

  for (const line of modifiedLines) {
    if (!originalSet.has(line)) added++
  }
  for (const line of originalLines) {
    if (!modifiedSet.has(line)) deleted++
  }

  additions.value = added
  deletions.value = deleted
}

// Watch content changes
watch([() => props.originalContent, () => props.modifiedContent], () => {
  computeStats()
}, { immediate: true })

// Editor options — includes theme from shared composable
const diffEditorOptions = computed(() => ({
  readOnly: true,
  theme: monacoTheme.value,
  renderSideBySide: viewMode.value === 'split',
  enableSplitViewResizing: true,
  renderIndicators: true,
  ignoreTrimWhitespace: false,
  // Display options
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', Monaco, 'Courier New', monospace",
  lineNumbers: 'on' as const,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  // Diff-specific
  renderOverviewRuler: true,
  diffWordWrap: 'off' as const,
}))

// Handle editor mount
const handleEditorMount = (editor: Monaco.editor.IStandaloneDiffEditor) => {
  editorRef.value = editor
}

// Navigate to next/prev change
const goToNextChange = () => {
  if (editorRef.value) {
    const changes = editorRef.value.getLineChanges()
    if (!changes || changes.length === 0) return

    const modifiedEditor = editorRef.value.getModifiedEditor()
    const currentLine = modifiedEditor.getPosition()?.lineNumber || 1

    // Find next change after current line
    for (const change of changes) {
      const changeLine = change.modifiedStartLineNumber
      if (changeLine > currentLine) {
        modifiedEditor.revealLineInCenter(changeLine)
        modifiedEditor.setPosition({ lineNumber: changeLine, column: 1 })
        return
      }
    }

    // Wrap to first change
    if (changes[0]) {
      const firstLine = changes[0].modifiedStartLineNumber
      modifiedEditor.revealLineInCenter(firstLine)
      modifiedEditor.setPosition({ lineNumber: firstLine, column: 1 })
    }
  }
}

const goToPrevChange = () => {
  if (editorRef.value) {
    const changes = editorRef.value.getLineChanges()
    if (!changes || changes.length === 0) return

    const modifiedEditor = editorRef.value.getModifiedEditor()
    const currentLine = modifiedEditor.getPosition()?.lineNumber || 1

    // Find previous change before current line
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i]
      if (!change) continue
      const changeLine = change.modifiedStartLineNumber
      if (changeLine < currentLine) {
        modifiedEditor.revealLineInCenter(changeLine)
        modifiedEditor.setPosition({ lineNumber: changeLine, column: 1 })
        return
      }
    }

    // Wrap to last change
    const lastChange = changes[changes.length - 1]
    if (lastChange) {
      const lastLine = lastChange.modifiedStartLineNumber
      modifiedEditor.revealLineInCenter(lastLine)
      modifiedEditor.setPosition({ lineNumber: lastLine, column: 1 })
    }
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <!-- Header -->
    <GitDiffHeader
      v-model:view-mode="viewMode"
      :file-path="filePath"
      :additions="additions"
      :deletions="deletions"
      :is-binary="isBinary"
      :is-loading="isLoading"
      @close="emit('close')"
      @prev-change="goToPrevChange"
      @next-change="goToNextChange"
    />

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Loading -->
      <div v-if="isLoading" class="h-full flex items-center justify-center">
        <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
      </div>

      <!-- Binary file -->
      <div v-else-if="isBinary" class="h-full flex flex-col items-center justify-center text-center">
        <Icon name="i-lucide-file-x" class="size-16 text-app-muted mb-4" />
        <p class="text-app-muted">Binary file cannot be displayed</p>
        <p class="text-xs text-app-muted mt-1">{{ filePath }}</p>
      </div>

      <!-- Empty / New file -->
      <div v-else-if="!originalContent && !modifiedContent" class="h-full flex flex-col items-center justify-center text-center">
        <Icon name="i-lucide-file-question" class="size-16 text-app-muted mb-4" />
        <p class="text-app-muted">No content to display</p>
      </div>

      <!-- New file (no original) -->
      <div v-else-if="!originalContent && modifiedContent" class="h-full flex flex-col">
        <div class="px-3 py-2 bg-green-500/10 border-b border-green-500/30 text-green-600 dark:text-green-400 text-sm">
          <Icon name="i-lucide-file-plus" class="size-4 inline mr-2" />
          New file
        </div>
        <MonacoEditor
          :model-value="modifiedContent"
          :lang="language"
          :options="{ readOnly: true, theme: monacoTheme, minimap: { enabled: false }, automaticLayout: true }"
          class="flex-1"
        />
      </div>

      <!-- Deleted file (no modified) -->
      <div v-else-if="originalContent && !modifiedContent" class="h-full flex flex-col">
        <div class="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-600 dark:text-red-400 text-sm">
          <Icon name="i-lucide-file-minus" class="size-4 inline mr-2" />
          Deleted file
        </div>
        <MonacoEditor
          :model-value="originalContent"
          :lang="language"
          :options="{ readOnly: true, theme: monacoTheme, minimap: { enabled: false }, automaticLayout: true }"
          class="flex-1"
        />
      </div>

      <!-- Diff view -->
      <MonacoDiffEditor
        v-else
        :original="originalContent"
        :modified="modifiedContent"
        :lang="language"
        :options="diffEditorOptions"
        class="h-full"
        @load="handleEditorMount"
      />
    </div>
  </div>
</template>
