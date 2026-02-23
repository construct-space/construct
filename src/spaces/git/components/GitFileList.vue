<script setup lang="ts">
/**
 * GitFileList - Displays staged and unstaged file changes
 * Allows staging/unstaging individual files or all at once
 */
import type { GitFileChange } from '../composables/useGitRepo'
import { showContextMenu } from '~/composables/useNativeContextMenu'

interface Props {
  stagedChanges: readonly GitFileChange[]
  unstagedChanges: readonly GitFileChange[]
  untrackedFiles: readonly string[]
  conflictedFiles: readonly string[]
  isLoading?: boolean
  repoPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  repoPath: '',
})

const emit = defineEmits<{
  (e: 'stage' | 'unstage' | 'discard', paths: readonly string[]): void
  (e: 'stageAll' | 'unstageAll' | 'discardAll' | 'deselect' | 'resolveAllMine' | 'resolveAllTheirs' | 'abortOperation'): void
  (e: 'select', file: GitFileChange | { path: string; status: string }): void
  (e: 'resolveMine' | 'resolveTheirs' | 'ignoreFile' | 'ignoreFolder' | 'ignoreExtension' | 'openInEditor' | 'revealInFinder', path: string): void
}>()

// Selected file for showing diff
const selectedPath = ref<string | null>(null)

// Collapsed sections
const stagedCollapsed = ref(false)
const unstagedCollapsed = ref(false)
const untrackedCollapsed = ref(false)
const conflictedCollapsed = ref(false)

// Helper to get file extension
const getFileExtension = (path: string): string | null => {
  const ext = path.split('.').pop()
  return ext && ext !== path ? ext : null
}

// Helper to get folder path
const getFolderPath = (path: string): string | null => {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null
}

// Context menu items for staged files
const getStagedContextMenu = (file: GitFileChange) => {
  const ext = getFileExtension(file.path)
  const folder = getFolderPath(file.path)

  return [
    [
      {
        label: 'Unstage',
        icon: 'i-lucide-minus',
        onSelect: () => emit('unstage', [file.path]),
      },
    ],
    [
      {
        label: 'Ignore File',
        icon: 'i-lucide-eye-off',
        onSelect: () => emit('ignoreFile', file.path),
      },
      ...(folder ? [{
        label: 'Ignore Folder',
        icon: 'i-lucide-folder-x',
        onSelect: () => emit('ignoreFolder', folder),
      }] : []),
      ...(ext ? [{
        label: `Ignore All .${ext} Files`,
        icon: 'i-lucide-file-x',
        onSelect: () => emit('ignoreExtension', ext),
      }] : []),
    ],
    [
      {
        label: 'Copy Path',
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => navigator.clipboard.writeText(`${props.repoPath}/${file.path}`),
      },
      {
        label: 'Copy Relative Path',
        icon: 'i-lucide-clipboard',
        onSelect: () => navigator.clipboard.writeText(file.path),
      },
    ],
    [
      {
        label: 'Reveal in Finder',
        icon: 'i-lucide-folder-open',
        onSelect: () => emit('revealInFinder', file.path),
      },
      {
        label: 'Open in Code Space',
        icon: 'i-lucide-external-link',
        onSelect: () => emit('openInEditor', file.path),
      },
    ],
  ]
}

// Context menu items for unstaged files
const getUnstagedContextMenu = (file: GitFileChange) => {
  const ext = getFileExtension(file.path)
  const folder = getFolderPath(file.path)

  return [
    [
      {
        label: 'Discard Changes',
        icon: 'i-lucide-undo-2',
        color: 'error' as const,
        onSelect: () => emit('discard', [file.path]),
      },
    ],
    [
      {
        label: 'Stage',
        icon: 'i-lucide-plus',
        onSelect: () => emit('stage', [file.path]),
      },
    ],
    [
      {
        label: 'Ignore File',
        icon: 'i-lucide-eye-off',
        onSelect: () => emit('ignoreFile', file.path),
      },
      ...(folder ? [{
        label: 'Ignore Folder',
        icon: 'i-lucide-folder-x',
        onSelect: () => emit('ignoreFolder', folder),
      }] : []),
      ...(ext ? [{
        label: `Ignore All .${ext} Files`,
        icon: 'i-lucide-file-x',
        onSelect: () => emit('ignoreExtension', ext),
      }] : []),
    ],
    [
      {
        label: 'Copy Path',
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => navigator.clipboard.writeText(`${props.repoPath}/${file.path}`),
      },
      {
        label: 'Copy Relative Path',
        icon: 'i-lucide-clipboard',
        onSelect: () => navigator.clipboard.writeText(file.path),
      },
    ],
    [
      {
        label: 'Reveal in Finder',
        icon: 'i-lucide-folder-open',
        onSelect: () => emit('revealInFinder', file.path),
      },
      {
        label: 'Open in Code Space',
        icon: 'i-lucide-external-link',
        onSelect: () => emit('openInEditor', file.path),
      },
    ],
  ]
}

// Context menu items for untracked files
const getUntrackedContextMenu = (path: string) => {
  const ext = getFileExtension(path)
  const folder = getFolderPath(path)

  return [
    [
      {
        label: 'Stage',
        icon: 'i-lucide-plus',
        onSelect: () => emit('stage', [path]),
      },
    ],
    [
      {
        label: 'Ignore File',
        icon: 'i-lucide-eye-off',
        onSelect: () => emit('ignoreFile', path),
      },
      ...(folder ? [{
        label: 'Ignore Folder',
        icon: 'i-lucide-folder-x',
        onSelect: () => emit('ignoreFolder', folder),
      }] : []),
      ...(ext ? [{
        label: `Ignore All .${ext} Files`,
        icon: 'i-lucide-file-x',
        onSelect: () => emit('ignoreExtension', ext),
      }] : []),
    ],
    [
      {
        label: 'Copy Path',
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => navigator.clipboard.writeText(`${props.repoPath}/${path}`),
      },
      {
        label: 'Copy Relative Path',
        icon: 'i-lucide-clipboard',
        onSelect: () => navigator.clipboard.writeText(path),
      },
    ],
    [
      {
        label: 'Reveal in Finder',
        icon: 'i-lucide-folder-open',
        onSelect: () => emit('revealInFinder', path),
      },
      {
        label: 'Open in Code Space',
        icon: 'i-lucide-external-link',
        onSelect: () => emit('openInEditor', path),
      },
    ],
  ]
}

// Context menu items for conflicted files
const getConflictedContextMenu = (path: string) => {
  return [
    [
      {
        label: 'Use Mine (ours)',
        icon: 'i-lucide-arrow-left-right',
        onSelect: () => emit('resolveMine', path),
      },
      {
        label: 'Use Theirs',
        icon: 'i-lucide-arrow-right-left',
        onSelect: () => emit('resolveTheirs', path),
      },
    ],
    [
      {
        label: 'Stage (Mark Resolved)',
        icon: 'i-lucide-check',
        onSelect: () => emit('stage', [path]),
      },
    ],
    [
      {
        label: 'Copy Path',
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => navigator.clipboard.writeText(`${props.repoPath}/${path}`),
      },
      {
        label: 'Copy Relative Path',
        icon: 'i-lucide-clipboard',
        onSelect: () => navigator.clipboard.writeText(path),
      },
    ],
    [
      {
        label: 'Reveal in Finder',
        icon: 'i-lucide-folder-open',
        onSelect: () => emit('revealInFinder', path),
      },
      {
        label: 'Open in Code Space',
        icon: 'i-lucide-external-link',
        onSelect: () => emit('openInEditor', path),
      },
    ],
  ]
}

// Status helpers
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'A':
    case 'added':
      return 'i-lucide-plus'
    case 'M':
    case 'modified':
      return 'i-lucide-edit'
    case 'D':
    case 'deleted':
      return 'i-lucide-trash-2'
    case 'R':
    case 'renamed':
      return 'i-lucide-arrow-right'
    case 'C':
    case 'copied':
      return 'i-lucide-copy'
    case 'U':
    case 'conflict':
      return 'i-lucide-alert-triangle'
    case '?':
    case 'untracked':
      return 'i-lucide-file-plus'
    default:
      return 'i-lucide-file'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'A':
    case 'added':
      return 'text-green-500'
    case 'M':
    case 'modified':
      return 'text-yellow-500'
    case 'D':
    case 'deleted':
      return 'text-red-500'
    case 'R':
    case 'renamed':
      return 'text-blue-500'
    case 'C':
    case 'copied':
      return 'text-purple-500'
    case 'U':
    case 'conflict':
      return 'text-orange-500'
    case '?':
    case 'untracked':
      return 'text-gray-400'
    default:
      return 'text-gray-400'
  }
}

const getStatusLabel = (change: GitFileChange) => {
  const status = change.staged ? change.indexStatus : change.workTreeStatus
  switch (status) {
    case 'A': return 'Added'
    case 'M': return 'Modified'
    case 'D': return 'Deleted'
    case 'R': return 'Renamed'
    case 'C': return 'Copied'
    case 'U': return 'Conflict'
    default: return ''
  }
}

// Get display name for file (handle renames)
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

const getFileDir = (path: string) => {
  const parts = path.split('/')
  if (parts.length > 1) {
    return parts.slice(0, -1).join('/')
  }
  return ''
}

async function onStagedContextMenu(_e: MouseEvent, file: GitFileChange) {
  await showContextMenu(getStagedContextMenu(file))
}

async function onUnstagedContextMenu(_e: MouseEvent, file: GitFileChange) {
  await showContextMenu(getUnstagedContextMenu(file))
}

async function onUntrackedContextMenu(_e: MouseEvent, path: string) {
  await showContextMenu(getUntrackedContextMenu(path))
}

async function onConflictedContextMenu(_e: MouseEvent, path: string) {
  await showContextMenu(getConflictedContextMenu(path))
}

// Handle file selection (toggle — clicking again deselects)
const handleSelect = (file: GitFileChange | { path: string; status: string }) => {
  if (selectedPath.value === file.path) {
    selectedPath.value = null
    emit('deselect')
    return
  }
  selectedPath.value = file.path
  emit('select', file)
}

// Compute total changes
const totalChanges = computed(() => {
  return props.stagedChanges.length + props.unstagedChanges.length + props.untrackedFiles.length
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center h-32">
      <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-app-muted" />
    </div>

    <!-- File lists -->
    <div v-else class="flex-1 overflow-y-auto">
      <!-- Conflicted Files (always show first if any) -->
      <div v-if="conflictedFiles.length > 0" class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="conflictedCollapsed = !conflictedCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="conflictedCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-alert-triangle" class="size-4 text-orange-500" />
            <span class="text-xs font-medium text-orange-500 uppercase">
              Conflicts ({{ conflictedFiles.length }})
            </span>
          </div>
        </button>

        <div v-if="!conflictedCollapsed" class="px-2 pb-2">
          <div class="px-2 py-1 mb-1 flex items-center justify-between gap-2">
            <p class="text-xs text-app-muted">
              Resolve each file: choose <strong class="text-app">Mine</strong> (current branch) or <strong class="text-app">Theirs</strong> (incoming changes).
            </p>
            <div class="flex items-center gap-1 shrink-0">
              <Button
                v-if="conflictedFiles.length > 1"
                label="Mine All"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Resolve all conflicted files with your current branch version"
                @click.stop="emit('resolveAllMine')"
              />
              <Button
                v-if="conflictedFiles.length > 1"
                label="Theirs All"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Resolve all conflicted files with incoming version"
                @click.stop="emit('resolveAllTheirs')"
              />
              <Button
                label="Abort"
                variant="ghost"
                color="warning"
                size="xs"
                title="Abort current merge/rebase/cherry-pick operation"
                @click.stop="emit('abortOperation')"
              />
            </div>
          </div>
          <div
            v-for="file in conflictedFiles"
            :key="file"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            :class="{ 'bg-white/30 dark:bg-white/10': selectedPath === file }"
            @click="handleSelect({ path: file, status: 'conflict' })"
            @contextmenu.prevent="(e) => onConflictedContextMenu(e, file)"
          >
              <input
                type="checkbox"
                :checked="false"
                class="size-3.5 rounded border-gray-300 dark:border-gray-600 text-app-accent shrink-0 cursor-pointer"
                title="Stage (Mark Resolved)"
                @click.stop="emit('stage', [file])"
              >
              <Icon name="i-lucide-alert-triangle" class="size-4 text-orange-500 shrink-0" />
              <div class="flex-1 min-w-0">
                <span class="text-sm text-app truncate block">{{ getFileName(file) }}</span>
                <span v-if="getFileDir(file)" class="text-xs text-app-muted truncate block">
                  {{ getFileDir(file) }}
                </span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Button
                  label="Mine"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  title="Use my current branch version and mark resolved"
                  @click.stop="emit('resolveMine', file)"
                />
                <Button
                  label="Theirs"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  title="Use incoming version and mark resolved"
                  @click.stop="emit('resolveTheirs', file)"
                />
              </div>
            </div>
        </div>
      </div>

      <!-- Staged Changes -->
      <div class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="stagedCollapsed = !stagedCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="stagedCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-check-circle" class="size-4 text-green-500" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Staged ({{ stagedChanges.length }})
            </span>
          </div>
          <Button
            v-if="stagedChanges.length > 0"
            label="Unstage All"
            size="xs"
            variant="ghost"
            color="neutral"
            @click.stop="emit('unstageAll')"
          />
        </button>

        <div v-if="!stagedCollapsed" class="px-2 pb-2">
          <div v-if="stagedChanges.length === 0" class="text-xs text-app-muted italic px-2 py-1">
            No staged changes
          </div>
          <div
            v-for="file in stagedChanges"
            :key="file.path"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            :class="{ 'bg-white/30 dark:bg-white/10': selectedPath === file.path }"
            @click="handleSelect(file)"
            @contextmenu.prevent="(e) => onStagedContextMenu(e, file)"
          >
              <input
                type="checkbox"
                :checked="true"
                class="size-3.5 rounded border-gray-300 dark:border-gray-600 text-app-accent shrink-0 cursor-pointer"
                title="Unstage"
                @click.stop="emit('unstage', [file.path])"
              >
              <Icon
                :name="getStatusIcon(file.indexStatus)"
                :class="getStatusColor(file.indexStatus)"
                class="size-4 shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-app truncate">{{ getFileName(file.path) }}</span>
                  <span class="text-xs text-app-muted">{{ getStatusLabel(file) }}</span>
                </div>
                <span v-if="getFileDir(file.path)" class="text-xs text-app-muted truncate block">
                  {{ getFileDir(file.path) }}
                </span>
                <span v-if="file.oldPath" class="text-xs text-app-muted truncate block">
                  from: {{ file.oldPath }}
                </span>
              </div>
              <Button
                icon="i-lucide-minus"
                variant="ghost"
                color="neutral"
                size="xs"
                class="opacity-0 group-hover:opacity-100 shrink-0"
                title="Unstage"
                @click.stop="emit('unstage', [file.path])"
              />
            </div>
        </div>
      </div>

      <!-- Unstaged Changes -->
      <div class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="unstagedCollapsed = !unstagedCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="unstagedCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-circle-dot" class="size-4 text-yellow-500" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Changes ({{ unstagedChanges.length }})
            </span>
          </div>
          <div class="flex items-center gap-1">
            <Button
              v-if="unstagedChanges.length > 0"
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="error"
              title="Discard All"
              @click.stop="emit('discardAll')"
            />
            <Button
              v-if="unstagedChanges.length > 0"
              label="Stage All"
              size="xs"
              variant="ghost"
              color="neutral"
              @click.stop="emit('stageAll')"
            />
          </div>
        </button>

        <div v-if="!unstagedCollapsed" class="px-2 pb-2">
          <div v-if="unstagedChanges.length === 0" class="text-xs text-app-muted italic px-2 py-1">
            No changes
          </div>
          <div
            v-for="file in unstagedChanges"
            :key="file.path"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            :class="{ 'bg-white/30 dark:bg-white/10': selectedPath === file.path }"
            @click="handleSelect(file)"
            @contextmenu.prevent="(e) => onUnstagedContextMenu(e, file)"
          >
              <input
                type="checkbox"
                :checked="false"
                class="size-3.5 rounded border-gray-300 dark:border-gray-600 text-app-accent shrink-0 cursor-pointer"
                title="Stage"
                @click.stop="emit('stage', [file.path])"
              >
              <Icon
                :name="getStatusIcon(file.workTreeStatus)"
                :class="getStatusColor(file.workTreeStatus)"
                class="size-4 shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-app truncate">{{ getFileName(file.path) }}</span>
                </div>
                <span v-if="getFileDir(file.path)" class="text-xs text-app-muted truncate block">
                  {{ getFileDir(file.path) }}
                </span>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                <Button
                  icon="i-lucide-x"
                  variant="ghost"
                  color="error"
                  size="xs"
                  title="Discard"
                  @click.stop="emit('discard', [file.path])"
                />
                <Button
                  icon="i-lucide-plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  title="Stage"
                  @click.stop="emit('stage', [file.path])"
                />
              </div>
            </div>
        </div>
      </div>

      <!-- Untracked Files -->
      <div v-if="untrackedFiles.length > 0" class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="untrackedCollapsed = !untrackedCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="untrackedCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-file-plus" class="size-4 text-gray-400" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Untracked ({{ untrackedFiles.length }})
            </span>
          </div>
          <Button
            v-if="untrackedFiles.length > 0"
            label="Stage All"
            size="xs"
            variant="ghost"
            color="neutral"
            @click.stop="emit('stage', untrackedFiles)"
          />
        </button>

        <div v-if="!untrackedCollapsed" class="px-2 pb-2">
          <div
            v-for="file in untrackedFiles"
            :key="file"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            :class="{ 'bg-white/30 dark:bg-white/10': selectedPath === file }"
            @click="handleSelect({ path: file, status: 'untracked' })"
            @contextmenu.prevent="(e) => onUntrackedContextMenu(e, file)"
          >
              <input
                type="checkbox"
                :checked="false"
                class="size-3.5 rounded border-gray-300 dark:border-gray-600 text-app-accent shrink-0 cursor-pointer"
                title="Stage"
                @click.stop="emit('stage', [file])"
              >
              <Icon name="i-lucide-file-plus" class="size-4 text-gray-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <span class="text-sm text-app truncate block">{{ getFileName(file) }}</span>
                <span v-if="getFileDir(file)" class="text-xs text-app-muted truncate block">
                  {{ getFileDir(file) }}
                </span>
              </div>
              <Button
                icon="i-lucide-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                class="opacity-0 group-hover:opacity-100 shrink-0"
                title="Stage"
                @click.stop="emit('stage', [file])"
              />
            </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="totalChanges === 0 && conflictedFiles.length === 0"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <Icon name="i-lucide-check-circle-2" class="size-12 text-green-500 mb-3" />
        <p class="text-sm text-app-muted">No changes</p>
        <p class="text-xs text-app-muted">Working directory is clean</p>
      </div>
    </div>
  </div>
</template>
