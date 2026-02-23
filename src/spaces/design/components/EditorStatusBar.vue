<script setup lang="ts">
/**
 * EditorStatusBar - Bottom bar with page tabs, zoom controls, grid/snap/rulers
 */
import { showContextMenu } from '~/composables/useNativeContextMenu'
import type { NativeMenuOption } from '~/composables/useNativeContextMenu'

const props = defineProps<{
  pages: readonly { id: string; name: string }[]
  currentPageId: string | null
  zoomPercent: number
  gridEnabled: boolean
  snapEnabled: boolean
  rulersEnabled: boolean
  pageContextItems: (page: { id: string; name: string }, index: number) => NativeMenuOption[][]
}>()

const emit = defineEmits<{
  switchPage: [pageId: string]
  addPage: []
  renamePage: [pageId: string, name: string]
  zoomIn: []
  zoomOut: []
  zoomReset: []
  fitToScreen: []
  toggleGrid: []
  toggleSnap: []
  toggleRulers: []
}>()

// Inline rename state
const editingPageId = ref<string | null>(null)
const editingName = ref('')

function startRename(pageId: string, currentName: string) {
  editingPageId.value = pageId
  editingName.value = currentName
  nextTick(() => {
    const input = document.querySelector('.page-name-input') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function finishRename() {
  if (editingPageId.value && editingName.value.trim()) {
    emit('renamePage', editingPageId.value, editingName.value.trim())
  }
  editingPageId.value = null
  editingName.value = ''
}

function cancelRename() {
  editingPageId.value = null
  editingName.value = ''
}

async function onPageContextMenu(_e: MouseEvent, page: { id: string; name: string }, index: number) {
  await showContextMenu(props.pageContextItems(page, index))
}

defineExpose({ startRename })
</script>

<template>
  <div class="h-9 flex items-center bg-app-status shrink-0">
    <!-- Page tabs -->
    <div class="flex items-center gap-0.5 px-2 overflow-x-auto">
      <button
        v-for="(page, index) in pages"
        :key="page.id"
        class="group flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors min-w-0"
        :class="currentPageId === page.id
          ? 'bg-app-muted/20 text-app'
          : 'text-app-muted hover:text-app hover:bg-app-muted/10'"
        @click="$emit('switchPage', page.id)"
        @dblclick.stop="startRename(page.id, page.name)"
        @contextmenu.prevent="(e) => onPageContextMenu(e, page, index)"
      >
        <Icon name="i-lucide-file" class="size-3 shrink-0" />
        <input
          v-if="editingPageId === page.id"
          v-model="editingName"
          class="page-name-input bg-transparent border border-primary rounded px-1 text-xs outline-none max-w-24"
          @blur="finishRename"
          @keydown.enter="finishRename"
          @keydown.escape="cancelRename"
          @click.stop
          @dblclick.stop
        >
        <span v-else class="truncate max-w-24">{{ page.name }}</span>
      </button>

      <!-- Add page button -->
      <button
        class="flex items-center justify-center size-6 rounded text-app-muted hover:text-app hover:bg-app-muted/10 transition-colors"
        title="Add page"
        @click="$emit('addPage')"
      >
        <Icon name="i-lucide-plus" class="size-4" />
      </button>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Status controls (right) -->
    <div class="flex items-center gap-1 px-3">
      <!-- Grid/Snap/Rulers -->
      <Tooltip text="Toggle Grid (Cmd+')">
        <Button
          icon="i-lucide-grid-3x3"
          size="xs"
          :variant="gridEnabled ? 'soft' : 'ghost'"
          :color="gridEnabled ? 'primary' : 'neutral'"
          @click="$emit('toggleGrid')"
        />
      </Tooltip>
      <Tooltip text="Snap to Grid (Cmd+Shift+S)">
        <Button
          icon="i-lucide-magnet"
          size="xs"
          :variant="snapEnabled ? 'soft' : 'ghost'"
          :color="snapEnabled ? 'primary' : 'neutral'"
          @click="$emit('toggleSnap')"
        />
      </Tooltip>
      <Tooltip text="Toggle Rulers (Cmd+Shift+R)">
        <Button
          icon="i-lucide-ruler"
          size="xs"
          :variant="rulersEnabled ? 'soft' : 'ghost'"
          :color="rulersEnabled ? 'primary' : 'neutral'"
          @click="$emit('toggleRulers')"
        />
      </Tooltip>

      <div class="h-5 w-px bg-app-muted/30 mx-1" />

      <!-- Zoom controls -->
      <Button
        icon="i-lucide-minus"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="$emit('zoomOut')"
      />
      <Button
        variant="ghost"
        color="neutral"
        size="xs"
        class="min-w-12 tabular-nums"
        @click="$emit('zoomReset')"
      >
        {{ zoomPercent }}%
      </Button>
      <Button
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="$emit('zoomIn')"
      />
      <Tooltip text="Fit to screen (Cmd+1)">
        <Button
          icon="i-lucide-maximize-2"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="$emit('fitToScreen')"
        />
      </Tooltip>
    </div>
  </div>
</template>
