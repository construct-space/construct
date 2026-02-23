<script setup lang="ts">
/**
 * DocsEditor - Rich markdown editor with split view preview
 * Features: markdown toolbar, split/edit/preview modes, auto-save, zen mode
 * Supports both API docs and local .md files with write-through
 */
import type { Document } from '~/stores/documents'
import { useDocsEditor } from '../composables/useDocsEditor'
import { useLocalDocs } from '../composables/useLocalDocs'
import { useMarkdown } from '~/composables/useMarkdown'
import { useDebounceFn } from '@vueuse/core'

interface Props {
  document: Document
  isLocal?: boolean      // true if this is a local-only doc
  localPath?: string     // path to local .md file (for local or synced docs)
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'delete'): void
}>()

const { saving, handleContentChange, saveTitle, getWordCount, getCharCount, insertMarkdown } = useDocsEditor()
const { writeDocToLocal, renameLocalDoc } = useLocalDocs()
const { renderMarkdown, initModules } = useMarkdown()

// View mode: edit, split, preview
const viewMode = ref<'edit' | 'split' | 'preview'>('split')
const zenMode = ref(false)
const savingLocal = ref(false)

// Local state for editing (initial copy from props, kept in sync via watcher below)
const propsDoc = toRef(props, 'document')
const title = ref(propsDoc.value.title)
const content = ref(propsDoc.value.content || '')

// Debounced local file save
const debouncedLocalSave = useDebounceFn(async (docTitle: string, docContent: string) => {
  savingLocal.value = true
  try {
    await writeDocToLocal(docTitle, docContent)
  } finally {
    savingLocal.value = false
  }
}, 1000)

// Export markdown file
function exportMarkdown() {
  const blob = new Blob([content.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${title.value || 'document'}.md`
  link.click()
  URL.revokeObjectURL(url)
}

// Textarea ref
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Rendered markdown HTML
const renderedHtml = computed(() => renderMarkdown(content.value))

// Combined saving state
const isSaving = computed(() => saving.value || savingLocal.value)

// Initialize markdown renderer
onMounted(async () => {
  await initModules()
})

// Watch for document changes (when switching documents)
watch(() => props.document.id, () => {
  title.value = props.document.title
  content.value = props.document.content || ''
})

// Also watch content for local docs (content comes via prop)
watch(() => props.document.content, (newContent) => {
  if (props.isLocal && newContent !== undefined) {
    content.value = newContent || ''
  }
})

// Handle title blur - save
function onTitleBlur() {
  if (title.value !== props.document.title && title.value.trim()) {
    if (props.isLocal) {
      // Rename local file
      if (props.localPath) {
        renameLocalDoc(props.localPath, title.value.trim())
      }
    } else {
      // Save to API
      saveTitle(props.document.id, title.value.trim())
      // Also update local file if synced
      if (props.localPath) {
        debouncedLocalSave(title.value.trim(), content.value)
      }
    }
  }
}

// Handle content change - auto-save
function onContentInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  content.value = target.value

  if (props.isLocal) {
    // Save to local file only
    debouncedLocalSave(title.value, content.value)
  } else {
    // Save to API
    handleContentChange(props.document.id, content.value)
    // Also write to local file if synced
    if (props.localPath) {
      debouncedLocalSave(title.value, content.value)
    }
  }
}

// Handle toolbar actions
function onToolbarAction(action: string) {
  switch (action) {
    case 'viewEdit':
      viewMode.value = 'edit'
      break
    case 'viewSplit':
      viewMode.value = 'split'
      break
    case 'viewPreview':
      viewMode.value = 'preview'
      break
    case 'toggleZen':
      zenMode.value = !zenMode.value
      break
    default: {
      // Markdown insertion actions
      if (!textareaRef.value) return
      const result = insertMarkdown(textareaRef.value, content.value, action)
      content.value = result.newContent

      if (props.isLocal) {
        debouncedLocalSave(title.value, content.value)
      } else {
        handleContentChange(props.document.id, content.value)
        if (props.localPath) {
          debouncedLocalSave(title.value, content.value)
        }
      }

      // Restore focus and cursor position
      nextTick(() => {
        if (textareaRef.value) {
          textareaRef.value.focus()
          textareaRef.value.setSelectionRange(result.cursorStart, result.cursorEnd)
        }
      })
    }
  }
}

// Keyboard shortcuts
function onEditorKeydown(event: KeyboardEvent) {
  // Escape exits zen mode
  if (event.key === 'Escape' && zenMode.value) {
    zenMode.value = false
    return
  }

  const isMod = event.metaKey || event.ctrlKey
  if (!isMod) return

  let action: string
  switch (event.key) {
    case 'b': action = 'bold'; break
    case 'i': action = 'italic'; break
    case 'k': action = 'link'; break
    case 'e': action = 'code'; break
    default: return
  }

  event.preventDefault()
  onToolbarAction(action)
}

// Tab key support in textarea
function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  event.preventDefault()

  const textarea = event.target as HTMLTextAreaElement
  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  content.value = content.value.substring(0, start) + '  ' + content.value.substring(end)

  if (props.isLocal) {
    debouncedLocalSave(title.value, content.value)
  } else {
    handleContentChange(props.document.id, content.value)
    if (props.localPath) {
      debouncedLocalSave(title.value, content.value)
    }
  }

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 2
  })
}

// Word and character counts
const wordCount = computed(() => getWordCount(content.value))
const charCount = computed(() => getCharCount(content.value))

// Formatted last modified
const lastModified = computed(() => {
  const date = new Date(props.document.updated_at)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})
</script>

<template>
  <div
    class="flex flex-col h-full"
    :class="zenMode ? 'fixed inset-0 z-50 bg-app' : ''"
  >
    <!-- Title bar -->
    <div class="flex items-center gap-3 px-5 py-3 border-b border-app bg-white/[0.05]">
      <input
        v-model="title"
        class="flex-1 text-xl font-bold bg-transparent border-none outline-none text-app placeholder:text-app-muted"
        placeholder="Untitled"
        @blur="onTitleBlur"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      >

      <div class="flex items-center gap-1 shrink-0">
        <!-- Document type badge -->
        <Badge
          :label="document.type === 'custom' ? 'Doc' : document.type.toUpperCase()"
          variant="subtle"
          color="neutral"
          size="sm"
        />

        <!-- More actions -->
        <DropdownMenu
          :items="[
            { icon: 'i-lucide-download', label: 'Export as Markdown', onSelect: exportMarkdown },
            { icon: 'i-lucide-trash-2', label: 'Delete Document', color: 'error', onSelect: () => emit('delete') },
          ]"
        >
          <Button variant="ghost" color="neutral" size="xs" icon="i-lucide-more-vertical" />
        </DropdownMenu>
      </div>
    </div>

    <!-- Formatting Toolbar -->
    <DocsToolbar
      v-if="viewMode !== 'preview'"
      :view-mode="viewMode"
      :zen-mode="zenMode"
      @action="onToolbarAction"
    />

    <!-- Preview-only toolbar (just view toggles) -->
    <div v-else class="flex items-center justify-end gap-0.5 px-3 py-1.5 border-b border-app bg-white/[0.05]">
      <button
        class="p-1.5 rounded-md transition-colors shrink-0 text-app-muted hover:text-app hover:bg-white/10"
        title="Edit mode"
        @click="viewMode = 'edit'"
      >
        <Icon name="i-lucide-pencil" class="size-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors shrink-0 text-app-muted hover:text-app hover:bg-white/10"
        title="Split view"
        @click="viewMode = 'split'"
      >
        <Icon name="i-lucide-columns-2" class="size-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors shrink-0 bg-white/15 text-app"
        title="Preview mode"
      >
        <Icon name="i-lucide-eye" class="size-4" />
      </button>
      <div class="w-px h-5 bg-[var(--app-border)] mx-1" />
      <button
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="zenMode ? 'bg-white/15 text-app' : 'text-app-muted hover:text-app hover:bg-white/10'"
        title="Zen mode"
        @click="zenMode = !zenMode"
      >
        <Icon name="i-lucide-maximize-2" class="size-4" />
      </button>
    </div>

    <!-- Editor area -->
    <div class="flex-1 overflow-hidden flex min-h-0">
      <!-- Edit pane (textarea handles its own scroll, no overflow-y-auto on wrapper) -->
      <div
        v-if="viewMode === 'edit' || viewMode === 'split'"
        class="flex-1 min-w-0"
        :class="viewMode === 'split' ? 'border-r border-app' : ''"
      >
        <textarea
          ref="textareaRef"
          :value="content"
          class="w-full h-full p-6 bg-transparent text-app text-sm leading-relaxed resize-none outline-none font-mono"
          :class="zenMode && viewMode === 'edit' ? 'max-w-3xl mx-auto' : ''"
          placeholder="Start writing in markdown..."
          spellcheck="true"
          @input="onContentInput"
          @keydown="onEditorKeydown"
          @keydown.tab="onTabKey"
        />
      </div>

      <!-- Preview pane -->
      <div
        v-if="viewMode === 'preview' || viewMode === 'split'"
        class="flex-1 overflow-y-auto min-w-0"
      >
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="p-6 prose prose-sm dark:prose-invert max-w-none prose-headings:text-app prose-p:text-app prose-strong:text-app prose-code:text-pink-500 dark:prose-code:text-pink-400 prose-a:text-app-accent prose-blockquote:border-app-accent/50 prose-pre:bg-black/20 dark:prose-pre:bg-black/40"
          :class="zenMode && viewMode === 'preview' ? 'max-w-3xl mx-auto' : ''"
          v-html="renderedHtml"
        />
        <!-- eslint-enable vue/no-v-html -->
        <div v-if="!content" class="p-6 text-app-muted text-sm italic">
          Nothing to preview. Start writing to see a live preview here.
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="px-5 py-1.5 border-t border-app text-xs text-app-muted flex items-center justify-between bg-white/[0.05] shrink-0">
      <div class="flex items-center gap-3">
        <span v-if="isSaving" class="flex items-center gap-1.5">
          <Icon name="i-lucide-loader-2" class="size-3 animate-spin" />
          Saving...
        </span>
        <span v-else class="flex items-center gap-1.5">
          <Icon name="i-lucide-check-circle" class="size-3 text-green-500" />
          Saved
        </span>
        <span class="text-app-muted/50">|</span>
        <span>{{ lastModified }}</span>
        <template v-if="isLocal">
          <span class="text-app-muted/50">|</span>
          <span class="flex items-center gap-1 text-amber-500">
            <Icon name="i-lucide-hard-drive" class="size-3" />
            Local
          </span>
        </template>
        <template v-else-if="localPath">
          <span class="text-app-muted/50">|</span>
          <span class="flex items-center gap-1 text-green-500">
            <Icon name="i-lucide-cloud-check" class="size-3" />
            Synced
          </span>
        </template>
      </div>
      <div class="flex items-center gap-3">
        <span>{{ wordCount }} word{{ wordCount !== 1 ? 's' : '' }}</span>
        <span class="text-app-muted/50">|</span>
        <span>{{ charCount }} char{{ charCount !== 1 ? 's' : '' }}</span>
        <span v-if="zenMode" class="text-app-muted/50">|</span>
        <button
          v-if="zenMode"
          class="hover:text-app transition-colors"
          @click="zenMode = false"
        >
          Exit Zen Mode (Esc)
        </button>
      </div>
    </div>
  </div>
</template>
