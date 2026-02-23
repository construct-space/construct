<script setup lang="ts">
/**
 * GitCommitDetail - Shows commit info and changed file list
 * Displayed in the right panel when a commit is selected in History view
 */
import type { GitCommit, GitFileDiff } from '../composables/useGitRepo'

interface Props {
  commit: GitCommit
  changedFiles: GitFileDiff[]
  selectedFile?: string
}

const props = withDefaults(defineProps<Props>(), {
  selectedFile: '',
})

const emit = defineEmits<{
  (e: 'selectFile', path: string): void
}>()

const collapsed = ref(false)

const formatDate = (date: Date): string => {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const totalAdditions = computed(() => props.changedFiles.reduce((sum, f) => sum + f.additions, 0))
const totalDeletions = computed(() => props.changedFiles.reduce((sum, f) => sum + f.deletions, 0))

const getFileName = (path: string) => path.split('/').pop() || path
const getFileDir = (path: string) => {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}
</script>

<template>
  <div class="border-b border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-black/10">
    <!-- Commit info header -->
    <div class="px-4 py-3">
      <div class="flex items-center gap-2 mb-2">
        <code class="text-xs text-app-accent bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded font-mono">
          {{ commit.shortHash }}
        </code>
        <span class="text-xs text-app-muted">{{ formatDate(commit.authorDate) }}</span>
      </div>
      <p class="text-sm text-app font-medium mb-1">{{ commit.subject }}</p>
      <p
        v-if="commit.message !== commit.subject && commit.message.split('\n').length > 1"
        class="text-xs text-app-muted whitespace-pre-wrap line-clamp-3 mb-2"
      >
        {{ commit.message.split('\n').slice(2).join('\n').trim() }}
      </p>
      <!-- Ref labels -->
      <div v-if="commit.refs && commit.refs.length > 0" class="flex flex-wrap items-center gap-1 mb-2">
        <template v-for="ref in commit.refs" :key="ref">
          <span
            v-if="ref.includes('tag:')"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-amber-500/15 text-amber-400 border border-amber-500/20"
          >
            <Icon name="i-lucide-tag" class="size-2.5" />
            {{ ref.replace('tag: ', '') }}
          </span>
          <span
            v-else-if="!ref.includes('HEAD')"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
            :class="ref.startsWith('origin/')
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
              : 'bg-green-500/15 text-green-400 border border-green-500/20'"
          >
            <Icon :name="ref.startsWith('origin/') ? 'i-lucide-cloud' : 'i-lucide-git-branch'" class="size-2.5" />
            {{ ref.replace('origin/', '').replace(/HEAD -> /, '') }}
          </span>
        </template>
      </div>
      <div class="flex items-center gap-3 text-xs text-app-muted">
        <span class="flex items-center gap-1">
          <Icon name="i-lucide-user" class="size-3" />
          {{ commit.author }}
        </span>
        <span v-if="commit.parents.length > 1" class="flex items-center gap-1 text-purple-500">
          <Icon name="i-lucide-git-merge" class="size-3" />
          Merge
        </span>
      </div>
    </div>

    <!-- Changed files -->
    <div>
      <button
        class="w-full flex items-center justify-between px-4 py-2 hover:bg-white/20 dark:hover:bg-white/5 border-t border-gray-200/50 dark:border-gray-700/50"
        @click="collapsed = !collapsed"
      >
        <div class="flex items-center gap-2">
          <Icon
            :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
            class="size-4 text-app-muted"
          />
          <span class="text-xs font-medium text-app-muted uppercase">
            Files Changed ({{ changedFiles.length }})
          </span>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-green-500">+{{ totalAdditions }}</span>
          <span class="text-red-500">-{{ totalDeletions }}</span>
        </div>
      </button>

      <div v-if="!collapsed" class="max-h-48 overflow-y-auto px-2 pb-2">
        <div
          v-for="file in changedFiles"
          :key="file.path"
          class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/20 dark:hover:bg-white/10"
          :class="{ 'bg-white/30 dark:bg-white/10': selectedFile === file.path }"
          @click="emit('selectFile', file.path)"
        >
          <Icon
            :name="file.isBinary ? 'i-lucide-file' : 'i-lucide-file-text'"
            class="size-4 text-app-muted shrink-0"
          />
          <div class="flex-1 min-w-0">
            <span class="text-sm text-app truncate block">{{ getFileName(file.path) }}</span>
            <span v-if="getFileDir(file.path)" class="text-xs text-app-muted truncate block">
              {{ getFileDir(file.path) }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-xs shrink-0">
            <span v-if="file.additions > 0" class="text-green-500">+{{ file.additions }}</span>
            <span v-if="file.deletions > 0" class="text-red-500">-{{ file.deletions }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
