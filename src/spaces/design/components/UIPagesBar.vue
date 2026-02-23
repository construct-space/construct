<script setup lang="ts">
/**
 * UIPagesBar - Page tabs bar for multi-page designs
 * Shows at the bottom of the canvas, allows switching/adding/managing pages
 */
import type { DesignPage } from '~/types/design'

interface Props {
  pages: DesignPage[]
  currentPageId: string | null
}

defineProps<Props>()

const emit = defineEmits<{
  switchPage: [pageId: string]
  addPage: []
  deletePage: [pageId: string]
  duplicatePage: [pageId: string]
  renamePage: [pageId: string, name: string]
}>()

const editingPageId = ref<string | null>(null)
const editingName = ref('')

function startRename(page: DesignPage, e: MouseEvent) {
  e.stopPropagation()
  editingPageId.value = page.id
  editingName.value = page.name
  nextTick(() => {
    const input = document.querySelector(`input[data-page-id="${page.id}"]`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function finishRename(pageId: string) {
  if (editingName.value.trim()) {
    emit('renamePage', pageId, editingName.value.trim())
  }
  editingPageId.value = null
}

function handleKeyDown(e: KeyboardEvent, pageId: string) {
  if (e.key === 'Enter') {
    finishRename(pageId)
  } else if (e.key === 'Escape') {
    editingPageId.value = null
  }
}

// Context menu items for a page
function getContextItems(page: DesignPage, index: number, total: number) {
  return [
    [
      {
        label: 'Rename',
        icon: 'i-lucide-pencil',
        onSelect: () => {
          editingPageId.value = page.id
          editingName.value = page.name
        },
      },
      {
        label: 'Duplicate',
        icon: 'i-lucide-copy',
        onSelect: () => emit('duplicatePage', page.id),
      },
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        disabled: total <= 1,
        onSelect: () => emit('deletePage', page.id),
      },
    ],
  ]
}
</script>

<template>
  <div class="flex items-center gap-1 h-9 px-2 bg-[#252525] border-t border-app">
    <!-- Page tabs -->
    <div class="flex items-center gap-0.5 overflow-x-auto">
      <ContextMenu
        v-for="(page, index) in pages"
        :key="page.id"
        :items="getContextItems(page, index, pages.length)"
      >
        <button
          class="group flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors min-w-0"
          :class="currentPageId === page.id
            ? 'bg-app-muted/20 text-app'
            : 'text-app-muted hover:text-app hover:bg-app-muted/10'"
          @click="emit('switchPage', page.id)"
          @dblclick="startRename(page, $event)"
        >
          <Icon name="i-lucide-file" class="size-3 shrink-0" />
          <template v-if="editingPageId === page.id">
            <input
              v-model="editingName"
              :data-page-id="page.id"
              class="w-20 bg-transparent border-none outline-none text-app"
              @blur="finishRename(page.id)"
              @keydown="handleKeyDown($event, page.id)"
              @click.stop
            >
          </template>
          <template v-else>
            <span class="truncate max-w-24">{{ page.name }}</span>
          </template>
        </button>
      </ContextMenu>
    </div>

    <!-- Add page button -->
    <button
      class="flex items-center justify-center size-6 rounded text-app-muted hover:text-app hover:bg-app-muted/10 transition-colors"
      title="Add page"
      @click="emit('addPage')"
    >
      <Icon name="i-lucide-plus" class="size-4" />
    </button>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Page indicator -->
    <span class="text-[10px] text-app-muted">
      {{ pages.findIndex(p => p.id === currentPageId) + 1 }} / {{ pages.length }}
    </span>
  </div>
</template>
