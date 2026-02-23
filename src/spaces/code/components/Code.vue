<script setup lang="ts">
/**
 * Code - Monaco-based code editor component (orchestrator)
 * Delegates logic to composables; owns instance refs, lifecycle, and template.
 */

import type * as Monaco from 'monaco-editor'
import { useMonaco } from '~/composables/useMonaco'
import { createFolderPin } from '~/stores/pinned'
import { registerMonacoThemes } from '~/composables/useMonacoThemes'
import { registerCustomLanguages } from '../composables/useCustomLanguages'
import { useEditorSettings, themeOptions } from '../composables/useEditorSettings'
import { useEditorTabs } from '../composables/useEditorTabs'
import { useLanguageDetection } from '../composables/useLanguageDetection'
import { useInlineAiEdit } from '../composables/useInlineAiEdit'
import { useLspProviders } from '../composables/useLspProviders'
import { useCodeEditor } from '../composables/useCodeEditor'

// ── Code editor shared state ────────────────────────────────────────
const {
  state,
  selection: editorSelection,
  saveFile,
  updateContent,
  getRelativePath,
  initTauri,
  openFile,
  closeFile,
  copyPath,
  copyRelativePath,
  revealInFinder,
  getFileIcon,
} = useCodeEditor()

const { setPageItems, setSearch, clearToolbar } = useToolbar()
const toast = useToast()
const pinnedStore = usePinnedStore()
const route = useRoute()

// ── Monaco instance refs ────────────────────────────────────────────
const editorRef = ref<Monaco.editor.IStandaloneCodeEditor | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const monacoInstance = ref<any>(null)

// Mount guard + timeout tracking
const isMounted = ref(true)
const pendingTimeouts: ReturnType<typeof setTimeout>[] = []
const trackTimeout = (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
  const id = setTimeout(() => {
    const idx = pendingTimeouts.indexOf(id)
    if (idx !== -1) pendingTimeouts.splice(idx, 1)
    fn()
  }, delay)
  pendingTimeouts.push(id)
  return id
}

// ── Folder pinning ──────────────────────────────────────────────────
const projectId = computed(() => {
  const id = route.params.id
  return id ? Number(id) : undefined
})

const isFolderPinned = computed(() => {
  if (!state.rootPath) return false
  return pinnedStore.isPinned(`folder-${state.rootPath}`)
})

const toggleFolderPin = async () => {
  if (!state.rootPath) return
  const folderName = state.rootPath.split('/').pop() || 'Folder'
  const pinItem = createFolderPin({ name: folderName, localPath: state.rootPath, projectId: projectId.value })
  const isPinned = await pinnedStore.togglePin(pinItem)
  toast.add({ title: isPinned ? 'Pinned to dock' : 'Unpinned from dock', description: folderName, color: isPinned ? 'success' : 'info' })
}

// ── Composables ─────────────────────────────────────────────────────
const {
  editorSettings, monacoTheme, isDark, editorOptions,
  showSettings, initSettings, disposeSettings,
} = useEditorSettings()

const {
  openTabs, activeTabPath, getTabIcon, switchTab, closeTab,
  getTabContextMenuItems,
} = useEditorTabs(state, openFile, closeFile, copyPath, copyRelativePath, revealInFinder, getFileIcon)

const {
  filteredLanguages, languageSearch, currentLanguageLabel,
  showLanguageSelector, setLanguage,
  getLanguageForCurrentFile, getTechnologiesForCurrentFile,
} = useLanguageDetection(state)

const {
  showInlineEdit, inlineEditInstruction, inlineEditLoading,
  inlineEditRange, showDiffReview, diffEditorRef,
  submitInlineEdit, acceptDiff, rejectDiff,
  dispose: disposeInlineEdit,
} = useInlineAiEdit(editorRef, monacoInstance, state, monacoTheme, editorSettings, isMounted)

const {
  lspEnabled, registerLspProviders, handleContentChange,
  initLsp, disposeLsp,
} = useLspProviders(state, editorRef, openFile, updateContent, isMounted, trackTimeout)

const aiCompletion = useAICompletion()

// ── Cursor / Go-to-line ─────────────────────────────────────────────
const cursorPosition = ref({ line: 1, column: 1 })
const showGoToLine = ref(false)
const goToLineNumber = ref('')

const goToLine = () => {
  const lineNum = parseInt(goToLineNumber.value, 10)
  if (editorRef.value && !isNaN(lineNum) && lineNum > 0) {
    editorRef.value.setPosition({ lineNumber: lineNum, column: 1 })
    editorRef.value.revealLineInCenter(lineNum)
    editorRef.value.focus()
  }
  showGoToLine.value = false
  goToLineNumber.value = ''
}

// ── Editor mounted handler ──────────────────────────────────────────
const handleEditorMounted = async (editor: Monaco.editor.IStandaloneCodeEditor) => {
  editorRef.value = editor

  const monaco = await useMonaco()
  monacoInstance.value = monaco || null

  if (monaco) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerMonacoThemes(monaco as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCustomLanguages(monaco as any)
    monaco.editor.setTheme(monacoTheme.value)
  }

  // Track cursor position
  editor.onDidChangeCursorPosition((e) => {
    cursorPosition.value = { line: e.position.lineNumber, column: e.position.column }
  })

  // Track selection → shared state for AI assistant context
  editor.onDidChangeCursorSelection((e) => {
    const sel = e.selection
    if (sel && !sel.isEmpty()) {
      const model = editor.getModel()
      if (model) {
        editorSelection.value = { text: model.getValueInRange(sel), startLine: sel.startLineNumber, endLine: sel.endLineNumber }
      }
    } else {
      editorSelection.value = null
    }
  })

  // Custom keybindings
  if (monaco) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const sel = editor.getSelection()
      if (sel && !sel.isEmpty()) {
        inlineEditInstruction.value = ''
        showInlineEdit.value = true
        nextTick(() => { document.getElementById('inline-edit-input')?.focus() })
      }
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => { useAssistant().toggle() })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => { showGoToLine.value = true })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
      editor.trigger('keyboard', 'editor.action.quickCommand', null)
    })

    // Context menu actions
    editor.addAction({ id: 'copy-file-path', label: 'Copy File Path', contextMenuGroupId: 'navigation', contextMenuOrder: 1.5, run: () => { if (state.currentFile) copyPath(state.currentFile) } })
    editor.addAction({ id: 'copy-relative-path', label: 'Copy Relative Path', contextMenuGroupId: 'navigation', contextMenuOrder: 1.6, run: () => { if (state.currentFile) copyRelativePath(state.currentFile) } })
    editor.addAction({ id: 'reveal-in-finder', label: 'Reveal in Finder', contextMenuGroupId: 'navigation', contextMenuOrder: 1.7, run: () => { if (state.currentFile) revealInFinder(state.currentFile) } })
    editor.addAction({ id: 'format-selection', label: 'Format Selection', contextMenuGroupId: 'modification', contextMenuOrder: 1.5, precondition: 'editorHasSelection', run: (ed) => { ed.trigger('keyboard', 'editor.action.formatSelection', null) } })
    editor.addAction({
      id: 'save-file', label: 'Save File', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      contextMenuGroupId: '9_cutcopypaste', contextMenuOrder: 0,
      run: async () => {
        const success = await saveFile()
        toast.add(success ? { title: 'File saved', description: state.currentFile.split('/').pop(), color: 'success' } : { title: 'Failed to save', color: 'error' })
      },
    })
    editor.addAction({ id: 'close-file', label: 'Close File', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW], contextMenuGroupId: 'navigation', contextMenuOrder: 1.8, run: () => { if (state.currentFile) closeTab(state.currentFile) } })

    // Register LSP providers
    if (lspEnabled.value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerLspProviders(monaco as any, editor)
    }

    // Register AI completions (Copilot-style)
    if (editorSettings.aiCompletion) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aiCompletion.register(monaco as any, editor, {
        language: getLanguageForCurrentFile(),
        filename: state.currentFile?.split('/').pop(),
        technologies: getTechnologiesForCurrentFile(),
        trigger: editorSettings.aiCompletionTrigger,
      })
    }
  }
}

// ── Keyboard shortcuts ──────────────────────────────────────────────
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveFile() }
  if ((e.metaKey || e.ctrlKey) && e.key === 'g') { e.preventDefault(); showGoToLine.value = true }
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') { e.preventDefault(); if (state.currentFile) closeTab(state.currentFile) }
}

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  await initTauri()
  await initSettings()
  initLsp()

  setPageItems([])
  setSearch('Search in file...', (query) => {
    if (editorRef.value && query) {
      editorRef.value.trigger('keyboard', 'actions.find', null)
    }
  })
})

onUnmounted(async () => {
  isMounted.value = false
  window.removeEventListener('keydown', handleKeydown)
  clearToolbar()

  for (const id of pendingTimeouts) clearTimeout(id)
  pendingTimeouts.length = 0

  disposeSettings()
  aiCompletion.deregister()
  disposeInlineEdit()
  await disposeLsp()
})

// Sync Monaco theme with color mode changes
watch(monacoTheme, (newTheme) => {
  if (monacoInstance.value && editorRef.value) {
    monacoInstance.value.editor.setTheme(newTheme)
  }
})
</script>

<template>
  <!-- Teleport Settings and Pin buttons to end of toolbar -->
  <Teleport to="#toolbar-package-slot">
    <!-- Pin folder button -->
    <Tooltip v-if="state.rootPath" :text="isFolderPinned ? 'Unpin folder from dock' : 'Pin folder to dock'"
      :content="{ align: 'center', side: 'bottom', sideOffset: 8 }">
      <Button :icon="isFolderPinned ? 'i-lucide-pin-off' : 'i-lucide-pin'" variant="ghost" color="neutral" size="xs"
        :class="isFolderPinned ? 'text-app-accent' : 'text-app-muted hover:text-app'" @click="toggleFolderPin" />
    </Tooltip>

    <Tooltip text="Editor Settings" :content="{ align: 'center', side: 'bottom', sideOffset: 8 }">
      <Button icon="i-lucide-sliders-horizontal" variant="ghost" color="neutral" size="xs"
        class="text-app-muted hover:text-app" @click="showSettings = true" />
    </Tooltip>
  </Teleport>

  <div class="h-full flex flex-col bg-app">
    <!-- Tabs Bar -->
    <div class="h-[35px] bg-app flex items-center overflow-x-scroll overflow-y-hidden scrollbar-hide">
      <ContextMenu v-for="tab in openTabs" :key="tab.path" :items="getTabContextMenuItems(tab.path)">
        <div class="flex items-center gap-1.5 px-2.5 h-[35px] cursor-pointer group shrink-0" :class="tab.path === activeTabPath
          ? 'bg-(--app-accent)/10 text-app-accent'
          : 'text-app-muted hover:bg-white/10 dark:hover:bg-white/5 hover:text-app-accent'"
          @click="switchTab(tab.path)">
          <Icon :name="getTabIcon(tab)" class="size-4 shrink-0" />
          <span class="text-[13px] truncate max-w-40">{{ tab.name }}</span>
          <span v-if="tab.isDirty" class="text-yellow-500 dark:text-yellow-400 text-[11px]">●</span>
          <button
            class="size-4 flex items-center justify-center rounded hover:bg-white/20 opacity-0 group-hover:opacity-100"
            @click.stop="closeTab(tab.path, $event)">
            <Icon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </ContextMenu>

      <!-- File info -->
      <div v-if="state.currentFile" class="ml-auto px-2 flex items-center gap-2 text-[11px] text-gray-500 shrink-0">
        <span>{{ getRelativePath(state.currentFile) }}</span>
      </div>
    </div>

    <!-- Editor Area -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Monaco Editor -->
      <div class="flex-1 overflow-hidden">
        <!-- Loading state -->
        <div v-if="state.isLoading" class="h-full flex items-center justify-center bg-app">
          <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
        </div>

        <!-- Empty state -->
        <div v-else-if="!state.currentFile" class="h-full flex items-center justify-center bg-app">
          <div class="text-center">
            <Icon name="i-lucide-code-2" class="size-16 text-app-muted mx-auto mb-4" />
            <p class="text-app text-lg font-medium mb-2">No file open</p>
            <p class="text-app-muted text-sm mb-4">
              {{ state.rootPath ? 'Select a file from the explorer' : 'Open a folder to start editing' }}
            </p>
            <div class="text-xs text-app-muted space-y-1">
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘S</kbd> Save</p>
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘F</kbd> Find</p>
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘G</kbd> Go to Line</p>
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘⇧P</kbd> Command Palette</p>
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘K</kbd> AI Edit Selection</p>
              <p><kbd class="px-1 py-0.5 bg-(--app-accent)/10 rounded">⌘L</kbd> AI Assistant</p>
            </div>
          </div>
        </div>

        <!-- Monaco Editor -->
        <MonacoEditor v-else v-model="state.fileContent" :lang="state.currentLanguage" :options="editorOptions"
          class="h-full" @update:model-value="handleContentChange" @load="handleEditorMounted" />

        <!-- Cmd+K Inline Edit Input (floating over editor) -->
        <Transition enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-2" enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-100 ease-in" leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2">
          <div v-if="showInlineEdit" class="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 w-[500px]">
            <div class="bg-app border border-app-muted/20 rounded-lg shadow-2xl shadow-black/40 p-3">
              <div class="flex items-center gap-2 mb-2">
                <Icon name="i-lucide-sparkles" class="size-4 text-purple-400" />
                <span class="text-xs font-medium text-app">AI Edit</span>
                <span class="text-[10px] text-app-muted ml-auto">⌘K</span>
              </div>
              <div class="flex gap-2">
                <input id="inline-edit-input" v-model="inlineEditInstruction" :disabled="inlineEditLoading"
                  class="flex-1 bg-white/5 rounded-md px-3 py-2 text-sm text-app placeholder-app-muted/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50"
                  placeholder="Describe the change..." @keydown.enter.prevent="submitInlineEdit"
                  @keydown.escape="showInlineEdit = false">
                <button :disabled="!inlineEditInstruction.trim() || inlineEditLoading"
                  class="px-3 py-2 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-30 transition-colors flex items-center gap-1.5"
                  @click="submitInlineEdit">
                  <Icon v-if="inlineEditLoading" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                  <Icon v-else name="i-lucide-sparkles" class="size-3.5" />
                  {{ inlineEditLoading ? 'Generating...' : 'Apply' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Diff Review (replaces editor when active) -->
      <div v-if="showDiffReview" class="absolute inset-0 z-40 flex flex-col bg-app">
        <div class="flex items-center justify-between px-4 py-2 border-b border-app-muted/20 bg-white/3">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-git-compare" class="size-4 text-purple-400" />
            <span class="text-sm font-medium text-app">Review AI Changes</span>
            <span v-if="inlineEditRange" class="text-[10px] text-app-muted">
              Lines {{ inlineEditRange.startLine }}-{{ inlineEditRange.endLine }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-sm text-app-muted transition-colors"
              @click="rejectDiff">
              Reject
            </button>
            <button
              class="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-sm text-white font-medium transition-colors flex items-center gap-1.5"
              @click="acceptDiff">
              <Icon name="i-lucide-check" class="size-3.5" />
              Accept
            </button>
          </div>
        </div>
        <div ref="diffEditorRef" class="flex-1" />
      </div>
    </div>

    <!-- Status Bar -->
    <div class="h-5 px-3 bg-(--app-accent)/10 flex items-center justify-between text-[11px] text-app-muted">
      <div class="flex items-center gap-3">
        <button v-if="state.currentFile" class="hover:bg-white/20 px-1 rounded cursor-pointer"
          @click="showLanguageSelector = true">
          {{ currentLanguageLabel }}
        </button>
        <span v-else>No file</span>
        <span>UTF-8</span>
        <span v-if="state.isDirty" class="text-yellow-300">Modified</span>
      </div>
      <div class="flex items-center gap-3">
        <span>Ln {{ cursorPosition.line }}, Col {{ cursorPosition.column }}</span>
        <span>Spaces: {{ editorSettings.tabSize }}</span>
        <span>{{ themeOptions.find(t => t.value === monacoTheme)?.label || monacoTheme }}</span>
      </div>
    </div>

    <!-- Go to Line Modal -->
    <Modal v-model:open="showGoToLine">
      <template #content>
        <div class="p-4 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Go to Line</h3>
          <Input v-model="goToLineNumber" placeholder="Enter line number..." type="number" autofocus
            @keydown.enter="goToLine" />
          <div class="flex justify-end gap-2">
            <Button label="Cancel" variant="ghost" @click="showGoToLine = false" />
            <Button label="Go" @click="goToLine" />
          </div>
        </div>
      </template>
    </Modal>

    <!-- Language Selector Modal -->
    <Modal v-model:open="showLanguageSelector">
      <template #content>
        <div class="p-4 space-y-3">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Select Language Mode</h3>
          <Input v-model="languageSearch" placeholder="Search languages..." autofocus icon="i-lucide-search"
            @keydown.enter="filteredLanguages.length > 0 && setLanguage(filteredLanguages[0]!.value)"
            @keydown.escape="showLanguageSelector = false" />
          <div class="max-h-64 overflow-y-auto space-y-0.5">
            <button v-for="lang in filteredLanguages" :key="lang.value"
              class="w-full text-left px-3 py-1.5 rounded text-sm hover:bg-white/10 dark:hover:bg-white/5 flex items-center justify-between"
              :class="state.currentLanguage === lang.value ? 'bg-(--app-accent)/10 text-app-accent' : 'text-app-muted hover:text-app-accent'"
              @click="setLanguage(lang.value)">
              <span>{{ lang.label }}</span>
              <span v-if="state.currentLanguage === lang.value">
                <Icon name="i-lucide-check" class="size-4" />
              </span>
            </button>
            <p v-if="filteredLanguages.length === 0" class="text-center text-app-muted py-4">
              No languages found
            </p>
          </div>
        </div>
      </template>
    </Modal>

    <!-- Editor Settings Modal -->
    <Modal v-model:open="showSettings">
      <template #content>
        <div class="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Editor Settings</h3>

          <!-- Theme Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Theme</h4>
            <div>
              <SelectMenu v-model="editorSettings.theme" :items="themeOptions" value-key="value" size="sm"
                class="w-full" />
              <p class="text-xs text-gray-500 mt-1">
                {{ editorSettings.theme === 'auto' ? `Currently: ${isDark ? 'Dark' : 'Light'}` : '' }}
              </p>
            </div>
          </div>

          <!-- Font Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Font</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Family</label>
                <SelectMenu v-model="editorSettings.fontFamily" :items="[
                  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
                  { label: 'Fira Code', value: 'Fira Code' },
                  { label: 'Source Code Pro', value: 'Source Code Pro' },
                  { label: 'Menlo', value: 'Menlo' },
                  { label: 'Monaco', value: 'Monaco' }
                ]" value-key="value" size="sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Size</label>
                <Input v-model.number="editorSettings.fontSize" type="number" :min="10" :max="32" size="sm" />
              </div>
              <div class="col-span-2 flex items-center gap-2">
                <Checkbox v-model="editorSettings.fontLigatures" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Enable ligatures</label>
              </div>
            </div>
          </div>

          <!-- Layout Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Layout</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Line Numbers</label>
                <SelectMenu v-model="editorSettings.lineNumbers"
                  :items="[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }, { label: 'Relative', value: 'relative' }]"
                  value-key="value" size="sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Word Wrap</label>
                <SelectMenu v-model="editorSettings.wordWrap"
                  :items="[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }, { label: 'Bounded', value: 'bounded' }]"
                  value-key="value" size="sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Whitespace</label>
                <SelectMenu v-model="editorSettings.renderWhitespace"
                  :items="[{ label: 'None', value: 'none' }, { label: 'Selection', value: 'selection' }, { label: 'All', value: 'all' }]"
                  value-key="value" size="sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Line Highlight</label>
                <SelectMenu v-model="editorSettings.renderLineHighlight"
                  :items="[{ label: 'None', value: 'none' }, { label: 'Gutter', value: 'gutter' }, { label: 'Line', value: 'line' }, { label: 'All', value: 'all' }]"
                  value-key="value" size="sm" />
              </div>
              <div class="col-span-2 flex items-center gap-2">
                <Checkbox v-model="editorSettings.minimap" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Show minimap</label>
              </div>
            </div>
          </div>

          <!-- Indentation Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Indentation</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Tab Size</label>
                <Input v-model.number="editorSettings.tabSize" type="number" :min="1" :max="8" size="sm" />
              </div>
              <div class="flex items-center gap-2 pt-5">
                <Checkbox v-model="editorSettings.insertSpaces" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Insert spaces</label>
              </div>
            </div>
          </div>

          <!-- Cursor Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cursor</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Style</label>
                <SelectMenu v-model="editorSettings.cursorStyle"
                  :items="[{ label: 'Line', value: 'line' }, { label: 'Line Thin', value: 'line-thin' }, { label: 'Block', value: 'block' }, { label: 'Block Outline', value: 'block-outline' }, { label: 'Underline', value: 'underline' }, { label: 'Underline Thin', value: 'underline-thin' }]"
                  value-key="value" size="sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Animation</label>
                <SelectMenu v-model="editorSettings.cursorBlinking"
                  :items="[{ label: 'Blink', value: 'blink' }, { label: 'Smooth', value: 'smooth' }, { label: 'Phase', value: 'phase' }, { label: 'Expand', value: 'expand' }, { label: 'Solid', value: 'solid' }]"
                  value-key="value" size="sm" />
              </div>
              <div class="col-span-2 flex items-center gap-2">
                <Checkbox v-model="editorSettings.cursorSmoothCaretAnimation" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Smooth caret animation</label>
              </div>
            </div>
          </div>

          <!-- Behavior Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Behavior</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 block mb-1">Auto Close Brackets</label>
                <SelectMenu v-model="editorSettings.autoClosingBrackets"
                  :items="[{ label: 'Always', value: 'always' }, { label: 'Language Defined', value: 'languageDefined' }, { label: 'Before Whitespace', value: 'beforeWhitespace' }, { label: 'Never', value: 'never' }]"
                  value-key="value" size="sm" />
              </div>
              <div class="flex flex-col gap-2 pt-5">
                <div class="flex items-center gap-2">
                  <Checkbox v-model="editorSettings.formatOnPaste" />
                  <label class="text-sm text-gray-700 dark:text-gray-300">Format on paste</label>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.smoothScrolling" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Smooth scrolling</label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.mouseWheelZoom" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Mouse wheel zoom</label>
              </div>
            </div>
          </div>

          <!-- Features Section -->
          <div class="space-y-3">
            <h4 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Features</h4>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.bracketPairColorization" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Bracket colorization</label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.folding" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Code folding</label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.links" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Clickable links</label>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="editorSettings.colorDecorators" />
                <label class="text-sm text-gray-700 dark:text-gray-300">Color decorators</label>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <Button label="Done" @click="showSettings = false" />
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
/* Hide scrollbar but keep scroll functionality */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
