<script setup lang="ts">
/**
 * DocsToolbar - Markdown formatting toolbar
 * Provides buttons to insert markdown syntax into the editor
 */

interface ToolbarAction {
  id: string
  icon: string
  label: string
  action: string
  separator?: false
}

interface ToolbarSeparator {
  separator: true
  id: string
}

type ToolbarItem = ToolbarAction | ToolbarSeparator

const emit = defineEmits<{
  (e: 'action', action: string): void
}>()

interface Props {
  viewMode: 'edit' | 'split' | 'preview'
  zenMode: boolean
}

defineProps<Props>()

const toolbarItems: ToolbarItem[] = [
  { id: 'bold', icon: 'i-lucide-bold', label: 'Bold (Ctrl+B)', action: 'bold' },
  { id: 'italic', icon: 'i-lucide-italic', label: 'Italic (Ctrl+I)', action: 'italic' },
  { id: 'strikethrough', icon: 'i-lucide-strikethrough', label: 'Strikethrough', action: 'strikethrough' },
  { id: 'code-inline', icon: 'i-lucide-code', label: 'Inline Code', action: 'code' },
  { id: 'sep-1', separator: true },
  { id: 'h1', icon: 'i-lucide-heading-1', label: 'Heading 1', action: 'heading1' },
  { id: 'h2', icon: 'i-lucide-heading-2', label: 'Heading 2', action: 'heading2' },
  { id: 'h3', icon: 'i-lucide-heading-3', label: 'Heading 3', action: 'heading3' },
  { id: 'sep-2', separator: true },
  { id: 'bullet-list', icon: 'i-lucide-list', label: 'Bullet List', action: 'bulletList' },
  { id: 'numbered-list', icon: 'i-lucide-list-ordered', label: 'Numbered List', action: 'numberedList' },
  { id: 'task-list', icon: 'i-lucide-list-checks', label: 'Task List', action: 'taskList' },
  { id: 'sep-3', separator: true },
  { id: 'quote', icon: 'i-lucide-text-quote', label: 'Quote', action: 'quote' },
  { id: 'code-block', icon: 'i-lucide-square-code', label: 'Code Block', action: 'codeBlock' },
  { id: 'link', icon: 'i-lucide-link', label: 'Link', action: 'link' },
  { id: 'image', icon: 'i-lucide-image', label: 'Image', action: 'image' },
  { id: 'sep-4', separator: true },
  { id: 'table', icon: 'i-lucide-table', label: 'Table', action: 'table' },
  { id: 'hr', icon: 'i-lucide-minus', label: 'Horizontal Rule', action: 'horizontalRule' },
]

function isSeparator(item: ToolbarItem): item is ToolbarSeparator {
  return 'separator' in item && item.separator === true
}
</script>

<template>
  <div class="flex items-center gap-0.5 px-3 py-1.5 border-b border-app bg-white/[0.05] overflow-x-auto">
    <template v-for="item in toolbarItems" :key="item.id">
      <div v-if="isSeparator(item)" class="w-px h-5 bg-[var(--app-border)] mx-1" />
      <button
        v-else
        class="p-1.5 rounded-md hover:bg-white/10 transition-colors text-app-muted hover:text-app shrink-0"
        :title="item.label"
        @click="emit('action', item.action)"
      >
        <Icon :name="item.icon" class="size-4" />
      </button>
    </template>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- View mode toggles -->
    <div class="flex items-center gap-0.5 ml-2">
      <button
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="viewMode === 'edit' ? 'bg-white/15 text-app' : 'text-app-muted hover:text-app hover:bg-white/10'"
        title="Edit mode"
        @click="emit('action', 'viewEdit')"
      >
        <Icon name="i-lucide-pencil" class="size-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="viewMode === 'split' ? 'bg-white/15 text-app' : 'text-app-muted hover:text-app hover:bg-white/10'"
        title="Split view"
        @click="emit('action', 'viewSplit')"
      >
        <Icon name="i-lucide-columns-2" class="size-4" />
      </button>
      <button
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="viewMode === 'preview' ? 'bg-white/15 text-app' : 'text-app-muted hover:text-app hover:bg-white/10'"
        title="Preview mode"
        @click="emit('action', 'viewPreview')"
      >
        <Icon name="i-lucide-eye" class="size-4" />
      </button>

      <div class="w-px h-5 bg-[var(--app-border)] mx-1" />

      <button
        class="p-1.5 rounded-md transition-colors shrink-0"
        :class="zenMode ? 'bg-white/15 text-app' : 'text-app-muted hover:text-app hover:bg-white/10'"
        title="Zen mode (distraction-free)"
        @click="emit('action', 'toggleZen')"
      >
        <Icon name="i-lucide-maximize-2" class="size-4" />
      </button>
    </div>
  </div>
</template>
