<script setup lang="ts">
/**
 * GitCommitForm - Commit message input with summary and description
 * Follows conventional commit style with character limits
 */

interface Props {
  stagedCount: number
  disabled?: boolean
  isCommitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  isCommitting: false,
})

const emit = defineEmits<{
  (e: 'commit', message: string): void
  (e: 'amend'): void
}>()

// Commit message parts
const summary = ref('')
const description = ref('')

// Platform detection for keyboard shortcuts
const isMac = computed(() => typeof window !== 'undefined' && navigator?.platform?.includes('Mac'))

// Character limits
const SUMMARY_LIMIT = 72
const SUMMARY_WARNING = 50

// Computed
const summaryLength = computed(() => summary.value.length)
const summaryOverLimit = computed(() => summaryLength.value > SUMMARY_LIMIT)
const summaryWarning = computed(() => summaryLength.value > SUMMARY_WARNING && !summaryOverLimit.value)

const fullMessage = computed(() => {
  if (!description.value.trim()) {
    return summary.value.trim()
  }
  return `${summary.value.trim()}\n\n${description.value.trim()}`
})

const canCommit = computed(() => {
  return (
    props.stagedCount > 0 &&
    summary.value.trim().length > 0 &&
    !summaryOverLimit.value &&
    !props.disabled &&
    !props.isCommitting
  )
})

// Handle commit
const handleCommit = () => {
  if (!canCommit.value) return
  emit('commit', fullMessage.value)
  // Clear form after commit
  summary.value = ''
  description.value = ''
}

// Handle key shortcuts
const handleSummaryKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + Enter to commit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleCommit()
  }
}

const handleDescriptionKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + Enter to commit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleCommit()
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3 border-t border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-black/10">
    <!-- Summary input -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-xs font-medium text-app-muted">Summary (required)</label>
        <span
          class="text-xs"
          :class="{
            'text-app-muted': !summaryWarning && !summaryOverLimit,
            'text-yellow-500': summaryWarning,
            'text-red-500': summaryOverLimit,
          }"
        >
          {{ summaryLength }}/{{ SUMMARY_LIMIT }}
        </span>
      </div>
      <input
        v-model="summary"
        type="text"
        placeholder="Write a brief summary of your changes"
        class="w-full px-3 py-2 text-sm rounded-md border bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
        :class="{
          'border-gray-200 dark:border-gray-700': !summaryOverLimit,
          'border-red-500': summaryOverLimit,
        }"
        :disabled="disabled || isCommitting"
        @keydown="handleSummaryKeydown"
      >
      <p v-if="summaryOverLimit" class="text-xs text-red-500 mt-1">
        Summary too long. Keep it under {{ SUMMARY_LIMIT }} characters.
      </p>
    </div>

    <!-- Description input -->
    <div>
      <label class="text-xs font-medium text-app-muted mb-1 block">Description (optional)</label>
      <textarea
        v-model="description"
        placeholder="Add a more detailed description..."
        rows="3"
        class="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] resize-none"
        :disabled="disabled || isCommitting"
        @keydown="handleDescriptionKeydown"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <Button
        :label="isCommitting ? 'Committing...' : `Commit (${stagedCount})`"
        icon="i-lucide-check"
        :disabled="!canCommit"
        :loading="isCommitting"
        class="flex-1"
        @click="handleCommit"
      />
      <Button
        icon="i-lucide-edit-3"
        variant="ghost"
        color="neutral"
        title="Amend last commit"
        :disabled="disabled || isCommitting"
        @click="emit('amend')"
      />
    </div>

    <!-- Keyboard shortcut hint -->
    <p class="text-xs text-app-muted text-center">
      Press <kbd class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">{{ isMac ? '⌘' : 'Ctrl' }}+Enter</kbd> to commit
    </p>
  </div>
</template>
