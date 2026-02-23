<script setup lang="ts">
/**
 * GitDiffHeader - Header controls for diff viewer
 * Shows file path, stats, and view mode toggle
 */

interface Props {
  filePath: string
  additions?: number
  deletions?: number
  isBinary?: boolean
  viewMode: 'split' | 'unified'
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  additions: 0,
  deletions: 0,
  isBinary: false,
  isLoading: false,
})

const emit = defineEmits<{
  (e: 'update:viewMode', mode: 'split' | 'unified'): void
  (e: 'close' | 'prevChange' | 'nextChange'): void
}>()

// Get filename from path
const fileName = computed(() => props.filePath.split('/').pop() || props.filePath)
const fileDir = computed(() => {
  const parts = props.filePath.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
})

// Toggle view mode
const toggleViewMode = () => {
  emit('update:viewMode', props.viewMode === 'split' ? 'unified' : 'split')
}
</script>

<template>
  <div class="h-10 px-3 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-700/50 bg-white/50 dark:bg-black/20">
    <!-- File info -->
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <Icon name="i-lucide-file-diff" class="size-4 text-app-muted shrink-0" />
      <div class="min-w-0">
        <span class="text-sm font-medium text-app truncate block">{{ fileName }}</span>
        <span v-if="fileDir" class="text-xs text-app-muted truncate block">{{ fileDir }}</span>
      </div>
    </div>

    <!-- Stats and controls -->
    <div class="flex items-center gap-3">
      <!-- Binary indicator -->
      <span v-if="isBinary" class="text-xs text-app-muted">Binary file</span>

      <!-- Stats -->
      <div v-else-if="additions > 0 || deletions > 0" class="flex items-center gap-2 text-xs">
        <span v-if="additions > 0" class="text-green-500">+{{ additions }}</span>
        <span v-if="deletions > 0" class="text-red-500">-{{ deletions }}</span>
      </div>

      <!-- Loading indicator -->
      <Icon v-if="isLoading" name="i-lucide-loader-2" class="size-4 animate-spin text-app-muted" />

      <!-- Navigation -->
      <div class="flex items-center gap-1">
        <Button
          icon="i-lucide-chevron-up"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Previous change"
          @click="emit('prevChange')"
        />
        <Button
          icon="i-lucide-chevron-down"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Next change"
          @click="emit('nextChange')"
        />
      </div>

      <!-- View mode toggle -->
      <Button
        :icon="viewMode === 'split' ? 'i-lucide-columns-2' : 'i-lucide-rows-2'"
        variant="ghost"
        color="neutral"
        size="xs"
        :title="viewMode === 'split' ? 'Switch to unified view' : 'Switch to split view'"
        @click="toggleViewMode"
      />

      <!-- Close button -->
      <Button
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Close diff"
        @click="emit('close')"
      />
    </div>
  </div>
</template>
