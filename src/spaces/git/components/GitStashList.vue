<script setup lang="ts">
/**
 * GitStashList - Collapsible list of stash entries
 * Shown above staged files in the Changes view
 */
import type { GitStash } from '../composables/useGitRepo'

interface Props {
  stashes: GitStash[]
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'pop' | 'apply' | 'drop', index: number): void
}>()

const collapsed = ref(false)

const formatDate = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const getStashLabel = (stash: GitStash): string => {
  // Clean up the stash message
  const msg = stash.message
    .replace(/^WIP on .+?:\s*/, '')
    .replace(/^On .+?:\s*/, '')
  return msg || `stash@{${stash.index}}`
}
</script>

<template>
  <div class="border-b border-gray-200/50 dark:border-gray-700/50">
    <button
      class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2">
        <Icon
          :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          class="size-4 text-app-muted"
        />
        <Icon name="i-lucide-archive" class="size-4 text-purple-500" />
        <span class="text-xs font-medium text-app-muted uppercase">
          Stashes ({{ stashes.length }})
        </span>
      </div>
    </button>

    <div v-if="!collapsed" class="px-2 pb-2 space-y-1">
      <div
        v-for="stash in stashes"
        :key="stash.index"
        class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 group"
      >
        <Icon name="i-lucide-archive" class="size-4 text-purple-400 shrink-0" />
        <div class="flex-1 min-w-0">
          <span class="text-sm text-app truncate block">{{ getStashLabel(stash) }}</span>
          <div class="flex items-center gap-2 text-xs text-app-muted">
            <span v-if="stash.branch">{{ stash.branch }}</span>
            <span>{{ formatDate(stash.date) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
          <Button
            icon="i-lucide-archive-restore"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Apply this stash (keep a copy)"
            @click.stop="emit('apply', stash.index)"
          />
          <Button
            icon="i-lucide-check"
            variant="ghost"
            color="primary"
            size="xs"
            title="Restore and remove from stash list"
            @click.stop="emit('pop', stash.index)"
          />
          <Button
            icon="i-lucide-trash-2"
            variant="ghost"
            color="error"
            size="xs"
            title="Delete stash"
            @click.stop="emit('drop', stash.index)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
