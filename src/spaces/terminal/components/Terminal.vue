<script setup lang="ts">
/**
 * Terminal - xterm.js based terminal emulator
 * Connects to Tauri PTY backend for real shell access
 * Uses app theme system for consistent styling
 */
import { useXterm } from '../composables/useXterm'

export interface TerminalProps {
  cwd?: string
  shell?: string
  fontSize?: number
  closeAction?: 'clear' | 'close'
}

const props = withDefaults(defineProps<TerminalProps>(), {
  cwd: undefined,
  shell: undefined,
  fontSize: 14,
  closeAction: 'clear',
})

const emit = defineEmits<{
  (e: 'title-change', title: string): void
  (e: 'close' | 'connected' | 'disconnected'): void
}>()

const terminalTitle = ref('Terminal')
const showSearch = ref(false)
const searchQuery = ref('')

const {
  containerRef,
  isConnected,
  clear,
  focus,
  blur,
  fit,
  search,
  searchNext,
  searchPrevious,
  setFontSize,
  reconnect,
} = useXterm({
  get fontSize() { return props.fontSize },
  get cwd() { return props.cwd },
  get shell() { return props.shell },
  onTitleChange: (title) => {
    terminalTitle.value = title
    emit('title-change', title)
  },
})

// Watch for font size changes
watch(() => props.fontSize, (size) => {
  setFontSize(size)
})

// Watch connection state
watch(isConnected, (connected) => {
  if (connected) {
    emit('connected')
  } else {
    emit('disconnected')
  }
})

// Handle search
const handleSearch = () => {
  if (searchQuery.value) {
    search(searchQuery.value)
  }
}

const toggleSearch = () => {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    searchQuery.value = ''
  }
}

const handlePrimaryAction = () => {
  if (props.closeAction === 'close') {
    emit('close')
    return
  }
  clear()
}

// Keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + F for search
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    toggleSearch()
  }
  // Cmd/Ctrl + K for clear
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    clear()
  }
  // Escape to close search
  if (e.key === 'Escape' && showSearch.value) {
    showSearch.value = false
    searchQuery.value = ''
    focus()
  }
  // Enter/Shift+Enter for search navigation
  if (showSearch.value && e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      searchPrevious()
    } else {
      searchNext()
    }
  }
}

// Focus terminal on mount
onMounted(() => {
  nextTick(() => {
    focus()
  })
})

// Handle resize
const handleResize = () => {
  fit()
}

// Expose methods for parent components
defineExpose({
  clear,
  focus,
  blur,
  fit,
  reconnect,
})
</script>

<template>
  <div
    class="h-full flex flex-col overflow-hidden"
    style="background: var(--app-background)"
    @keydown="handleKeydown"
  >
    <!-- Header -->
    <div
      class="h-9 px-3 flex items-center justify-between shrink-0"
      style="background: var(--app-background); border-bottom: 1px solid var(--app-border)"
    >
      <div class="flex items-center gap-2">
        <Icon name="i-lucide-terminal" class="size-4" style="color: var(--app-muted)" />
        <span class="text-sm font-medium truncate max-w-48" style="color: var(--app-foreground)">
          {{ terminalTitle }}
        </span>
        <span
          class="size-2 rounded-full"
          :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
          :title="isConnected ? 'Connected' : 'Disconnected'"
        />
      </div>
      <div class="flex items-center gap-1">
        <Button
          icon="i-lucide-search"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Search (⌘F)"
          :class="showSearch ? 'bg-white/10' : ''"
          @click="toggleSearch"
        />
        <Button
          :icon="props.closeAction === 'close' ? 'i-lucide-x' : 'i-lucide-trash-2'"
          variant="ghost"
          color="neutral"
          size="xs"
          :title="props.closeAction === 'close' ? 'Close Terminal' : 'Clear (⌘K)'"
          @click="handlePrimaryAction"
        />
        <Button
          v-if="!isConnected"
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Reconnect"
          @click="reconnect"
        />
      </div>
    </div>

    <!-- Search Bar -->
    <div
      v-if="showSearch"
      class="h-10 px-3 flex items-center gap-2 shrink-0"
      style="background: var(--app-canvas-bg); border-bottom: 1px solid var(--app-border)"
    >
      <Icon name="i-lucide-search" class="size-4" style="color: var(--app-muted)" />
      <input
        v-model="searchQuery"
        type="text"
        class="flex-1 bg-transparent border-none outline-none text-sm"
        style="color: var(--app-foreground)"
        placeholder="Search..."
        @input="handleSearch"
        @keydown.enter.exact.prevent="searchNext"
        @keydown.shift.enter.exact.prevent="searchPrevious"
      >
      <div class="flex items-center gap-1">
        <Button
          icon="i-lucide-chevron-up"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Previous (Shift+Enter)"
          @click="searchPrevious"
        />
        <Button
          icon="i-lucide-chevron-down"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Next (Enter)"
          @click="searchNext"
        />
        <Button
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Close (Esc)"
          @click="toggleSearch"
        />
      </div>
    </div>

    <!-- Terminal Container -->
    <div
      ref="containerRef"
      class="flex-1 overflow-hidden"
      style="background: var(--app-background)"
      @resize="handleResize"
    />
  </div>
</template>

<style>
/* Override xterm.js styles for better integration */
.xterm {
  padding: 8px;
  height: 100%;
}

.xterm-viewport {
  background-color: inherit !important;
  overflow-y: auto !important;
}

.xterm-screen {
  background-color: inherit !important;
}

.xterm-viewport::-webkit-scrollbar {
  width: 8px;
}

.xterm-viewport::-webkit-scrollbar-track {
  background: transparent;
}

.xterm-viewport::-webkit-scrollbar-thumb {
  background: var(--app-muted);
  border-radius: 4px;
  opacity: 0.5;
}

.xterm-viewport::-webkit-scrollbar-thumb:hover {
  opacity: 0.8;
}
</style>
