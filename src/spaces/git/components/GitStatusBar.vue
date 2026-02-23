<script setup lang="ts">
/**
 * GitStatusBar - Bottom status bar showing sync status
 * Contextual sync button, branch selector, stash indicator
 */
import type { SyncStatus, GitRepository, GitBranch } from '../composables/useGitRepo'

interface Props {
  currentRepo: GitRepository | null
  currentBranch: string
  branches: GitBranch[]
  uxLevel?: 'beginner' | 'pro'
  syncStatus: SyncStatus
  isOperationInProgress?: boolean
  currentOperation?: string | null
  lastError?: { message: string; stderr?: string } | null
  stashCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  uxLevel: 'beginner',
  isOperationInProgress: false,
  currentOperation: null,
  lastError: null,
  stashCount: 0,
})

const emit = defineEmits<{
  (e: 'fetch' | 'pull' | 'push' | 'publish' | 'stash'): void
  (e: 'checkout', branch: string): void
}>()

// Branch dropdown open state
const branchDropdownOpen = ref(false)

// More actions dropdown
const moreActionsOpen = ref(false)

// Whether this repo has no remote configured at all
const hasNoRemote = computed(() => !props.currentRepo?.remoteUrl)

// Contextual sync button state
const syncButtonIcon = computed(() => {
  if (props.syncStatus !== 'idle') return 'i-lucide-loader-2'
  if (hasNoRemote.value) return 'i-lucide-cloud-upload'
  if (!props.currentRepo?.hasUpstream) return 'i-lucide-cloud-upload'
  if (props.currentRepo.ahead > 0) return 'i-lucide-arrow-up'
  if (props.currentRepo.behind > 0) return 'i-lucide-arrow-down'
  return 'i-lucide-refresh-cw'
})

const syncButtonLabel = computed(() => {
  if (props.syncStatus === 'fetching') return 'Fetching...'
  if (props.syncStatus === 'pulling') return 'Pulling...'
  if (props.syncStatus === 'pushing') return 'Pushing...'
  if (hasNoRemote.value) return 'Publish Repository'
  if (!props.currentRepo?.hasUpstream) {
    return props.uxLevel === 'beginner'
      ? 'Publish Branch (set upstream)'
      : 'Publish Branch'
  }
  if (props.currentRepo.ahead > 0) return `Push ${props.currentRepo.ahead}`
  if (props.currentRepo.behind > 0) return `Pull ${props.currentRepo.behind}`
  return 'Fetch'
})

const syncButtonAction = computed((): 'fetch' | 'pull' | 'push' | 'publish' => {
  if (hasNoRemote.value) return 'publish'
  if (!props.currentRepo?.hasUpstream) return 'push'
  if (props.currentRepo.ahead > 0) return 'push'
  if (props.currentRepo.behind > 0) return 'pull'
  return 'fetch'
})

const handleSyncClick = () => {
  emit(syncButtonAction.value)
}

// Handle branch selection
const handleBranchSelect = (branch: GitBranch) => {
  if (branch.name === props.currentBranch) return
  emit('checkout', branch.name)
  branchDropdownOpen.value = false
}

const friendlyErrorMessage = computed(() => {
  const error = props.lastError
  if (!error) return ''

  const raw = `${error.message}\n${error.stderr || ''}`.toLowerCase()

  if (
    raw.includes('would be overwritten by merge') ||
    raw.includes('your local changes to the following files') ||
    raw.includes('please commit your changes or stash them')
  ) {
    return 'Cannot continue because local edits would be overwritten. Commit, stash, or discard first.'
  }
  if (raw.includes('resolve your current index first')) {
    return 'Git is waiting for conflict resolution. Open Conflicts and choose Mine/Theirs for each file.'
  }
  if (raw.includes('not a git repository')) {
    return 'This folder is not a Git repository.'
  }
  if (raw.includes('authentication') || raw.includes('permission denied') || raw.includes('could not read username')) {
    return 'Authentication failed. Check your Git account or credentials.'
  }
  if (raw.includes('could not resolve') || raw.includes('network') || raw.includes('unable to access')) {
    return 'Network issue while talking to remote. Check connection and remote URL.'
  }

  return error.message
})
</script>

<template>
  <div class="h-8 px-3 flex items-center justify-between border-t border-gray-200/50 dark:border-gray-700/50 bg-white/50 dark:bg-black/20">
    <!-- Left side: Branch and status -->
    <div class="flex items-center gap-3">
      <!-- Branch selector -->
      <div class="relative">
        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/30 dark:hover:bg-white/10 text-sm"
          :disabled="isOperationInProgress"
          @click="branchDropdownOpen = !branchDropdownOpen"
        >
          <Icon name="i-lucide-git-branch" class="size-3.5 text-app-accent" />
          <span class="text-app font-medium">{{ currentBranch || 'No branch' }}</span>
          <Icon name="i-lucide-chevron-down" class="size-3 text-app-muted" />
        </button>

        <!-- Branch dropdown -->
        <div
          v-if="branchDropdownOpen"
          class="absolute bottom-full left-0 mb-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50"
        >
          <div class="p-2">
            <p class="text-xs font-medium text-app-muted uppercase px-2 py-1">Switch Branch</p>
            <div
              v-for="branch in branches.filter(b => b.isLocal)"
              :key="branch.name"
              class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer"
              :class="branch.name === currentBranch
                ? 'bg-[var(--app-accent)]/10 text-app'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-app-muted'"
              @click="handleBranchSelect(branch)"
            >
              <Icon
                :name="branch.name === currentBranch ? 'i-lucide-check' : 'i-lucide-git-branch'"
                class="size-3.5"
                :class="branch.name === currentBranch ? 'text-app-accent' : ''"
              />
              <span class="text-sm truncate">{{ branch.name }}</span>
            </div>
          </div>
        </div>

        <!-- Backdrop -->
        <div
          v-if="branchDropdownOpen"
          class="fixed inset-0 z-40"
          @click="branchDropdownOpen = false"
        />
      </div>

      <!-- Upstream status (beginner-friendly explanation) -->
      <div
        v-if="uxLevel === 'beginner' && currentRepo && currentRepo.remoteUrl && !currentRepo.hasUpstream"
        class="flex items-center gap-1 text-xs text-yellow-500"
        title="No upstream: this local branch is not linked to a remote branch yet. Use Publish Branch to create and track one."
      >
        <Icon name="i-lucide-info" class="size-3" />
        <span>No upstream</span>
      </div>

      <!-- Ahead/behind indicators -->
      <div v-if="currentRepo && currentRepo.hasUpstream" class="flex items-center gap-2 text-xs">
        <span
          v-if="currentRepo.ahead > 0"
          class="flex items-center gap-0.5 text-green-500"
          :title="uxLevel === 'beginner'
            ? 'Ahead: local commits not pushed to upstream (tracked remote branch) yet.'
            : 'Commits ahead of upstream'"
        >
          <Icon name="i-lucide-arrow-up" class="size-3" />
          {{ currentRepo.ahead }}
        </span>
        <span
          v-if="currentRepo.behind > 0"
          class="flex items-center gap-0.5 text-red-500"
          :title="uxLevel === 'beginner'
            ? 'Behind: upstream has commits you have not pulled yet.'
            : 'Commits behind upstream'"
        >
          <Icon name="i-lucide-arrow-down" class="size-3" />
          {{ currentRepo.behind }}
        </span>
        <span
          v-if="currentRepo.ahead === 0 && currentRepo.behind === 0"
          class="text-app-muted"
          :title="uxLevel === 'beginner'
            ? 'Upstream is linked and this branch is in sync.'
            : 'In sync with upstream'"
        >
          Up to date
        </span>
      </div>

      <!-- Stash indicator -->
      <button
        v-if="stashCount > 0"
        class="flex items-center gap-1 text-xs text-app-muted hover:text-app px-1.5 py-0.5 rounded hover:bg-white/20 dark:hover:bg-white/10"
        title="Stashed changes"
        @click="emit('stash')"
      >
        <Icon name="i-lucide-archive" class="size-3" />
        {{ stashCount }}
      </button>

      <!-- Operation status -->
      <div v-if="currentOperation" class="flex items-center gap-1.5 text-xs text-app-muted">
        <Icon name="i-lucide-loader-2" class="size-3 animate-spin" />
        <span>{{ currentOperation }}</span>
      </div>

      <!-- Error indicator -->
      <div
        v-if="lastError"
        class="flex items-center gap-1.5 text-xs text-red-500"
        :title="lastError.message"
      >
        <Icon name="i-lucide-alert-circle" class="size-3" />
        <span class="truncate max-w-64">{{ friendlyErrorMessage }}</span>
      </div>
    </div>

    <!-- Right side: Contextual sync button + more menu -->
    <div class="flex items-center gap-1">
      <!-- Main contextual sync button -->
      <Button
        :icon="syncButtonIcon"
        :label="syncButtonLabel"
        variant="ghost"
        color="neutral"
        size="xs"
        :disabled="isOperationInProgress"
        :loading="syncStatus !== 'idle'"
        @click="handleSyncClick"
      />

      <!-- More actions -->
      <div class="relative">
        <Button
          icon="i-lucide-more-horizontal"
          variant="ghost"
          color="neutral"
          size="xs"
          :disabled="isOperationInProgress"
          @click="moreActionsOpen = !moreActionsOpen"
        />

        <div
          v-if="moreActionsOpen"
          class="absolute bottom-full right-0 mb-1 w-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50"
        >
          <div class="p-1">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app-muted hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              @click="emit('fetch'); moreActionsOpen = false"
            >
              <Icon name="i-lucide-refresh-cw" class="size-3.5" />
              Fetch
            </button>
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app-muted hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              @click="emit('pull'); moreActionsOpen = false"
            >
              <Icon name="i-lucide-arrow-down" class="size-3.5" />
              Pull
            </button>
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app-muted hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              @click="emit('push'); moreActionsOpen = false"
            >
              <Icon name="i-lucide-arrow-up" class="size-3.5" />
              Push
            </button>
          </div>
        </div>

        <div
          v-if="moreActionsOpen"
          class="fixed inset-0 z-40"
          @click="moreActionsOpen = false"
        />
      </div>
    </div>
  </div>
</template>
