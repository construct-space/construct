<script setup lang="ts">
/**
 * GitBranchList - Branch and tag management view
 * Switch branches, create, delete, merge; manage tags
 */
import type { GitBranch, GitTag } from '../composables/useGitRepo'

interface Props {
  localBranches: readonly GitBranch[]
  remoteBranches: readonly GitBranch[]
  currentBranch: string
  isLoading?: boolean
  isOperationInProgress?: boolean
  tags?: GitTag[]
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  isOperationInProgress: false,
  tags: () => [],
})

const emit = defineEmits<{
  (e: 'checkout' | 'create' | 'merge' | 'deleteTag' | 'pushTag', branch: string): void
  (e: 'delete', branch: string, force?: boolean): void
  (e: 'refresh'): void
  (e: 'createTag', name: string, message?: string): void
}>()

// Collapsed sections
const localCollapsed = ref(false)
const remoteCollapsed = ref(false)
const tagsCollapsed = ref(true)

// Create branch modal
const showCreateModal = ref(false)
const newBranchName = ref('')

// Create tag modal
const showCreateTagModal = ref(false)
const newTagName = ref('')
const newTagMessage = ref('')

// Delete confirmation
const branchToDelete = ref<string | null>(null)
const showDeleteConfirm = ref(false)

// Filter
const searchQuery = ref('')

// Filtered branches
const filteredLocalBranches = computed(() => {
  if (!searchQuery.value) return props.localBranches
  const query = searchQuery.value.toLowerCase()
  return props.localBranches.filter(b => b.name.toLowerCase().includes(query))
})

const filteredRemoteBranches = computed(() => {
  if (!searchQuery.value) return props.remoteBranches
  const query = searchQuery.value.toLowerCase()
  return props.remoteBranches.filter(b => b.name.toLowerCase().includes(query))
})

const filteredTags = computed(() => {
  if (!searchQuery.value) return props.tags
  const query = searchQuery.value.toLowerCase()
  return props.tags.filter(t => t.name.toLowerCase().includes(query))
})

// Branch name validation
const isValidBranchName = computed(() => {
  const name = newBranchName.value.trim()
  if (!name) return false
  if (name.startsWith('-')) return false
  if (name.includes('..')) return false
  if (name.includes('~') || name.includes('^') || name.includes(':')) return false
  if (name.includes(' ')) return false
  return true
})

// Tag name validation
const isValidTagName = computed(() => {
  const name = newTagName.value.trim()
  if (!name) return false
  if (name.startsWith('-')) return false
  if (name.includes(' ')) return false
  if (name.includes('..')) return false
  return true
})

// Handle create branch
const handleCreate = () => {
  if (!isValidBranchName.value) return
  emit('create', newBranchName.value.trim())
  newBranchName.value = ''
  showCreateModal.value = false
}

// Handle create tag
const handleCreateTag = () => {
  if (!isValidTagName.value) return
  emit('createTag', newTagName.value.trim(), newTagMessage.value.trim() || undefined)
  newTagName.value = ''
  newTagMessage.value = ''
  showCreateTagModal.value = false
}

// Handle checkout
const handleCheckout = (branch: GitBranch) => {
  if (branch.isCurrent || props.isOperationInProgress) return
  emit('checkout', branch.name)
}

// Handle delete
const confirmDelete = (branch: string) => {
  branchToDelete.value = branch
  showDeleteConfirm.value = true
}

const handleDelete = (force: boolean = false) => {
  if (!branchToDelete.value) return
  emit('delete', branchToDelete.value, force)
  branchToDelete.value = null
  showDeleteConfirm.value = false
}

// Handle merge
const handleMerge = (branch: string) => {
  if (props.isOperationInProgress) return
  emit('merge', branch)
}

// Format tag date
const formatTagDate = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header with search and actions -->
    <div class="px-3 py-2 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-black/10">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex-1 relative">
          <Icon name="i-lucide-search" class="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter branches & tags..."
            class="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
          >
        </div>
        <Button
          icon="i-lucide-plus"
          size="sm"
          @click="showCreateModal = true"
        >
          New
        </Button>
        <Button
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="isLoading"
          @click="emit('refresh')"
        />
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && localBranches.length === 0" class="flex items-center justify-center h-32">
      <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-app-muted" />
    </div>

    <!-- Branch and Tag lists -->
    <div v-else class="flex-1 overflow-y-auto">
      <!-- Local Branches -->
      <div class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="localCollapsed = !localCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="localCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-git-branch" class="size-4 text-app-accent" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Local ({{ filteredLocalBranches.length }})
            </span>
          </div>
        </button>

        <div v-if="!localCollapsed" class="px-2 pb-2">
          <div v-if="filteredLocalBranches.length === 0" class="text-xs text-app-muted italic px-2 py-1">
            No branches found
          </div>
          <div
            v-for="branch in filteredLocalBranches"
            :key="branch.name"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            :class="{ 'bg-white/30 dark:bg-white/10': branch.isCurrent }"
            @click="handleCheckout(branch)"
          >
            <Icon
              :name="branch.isCurrent ? 'i-lucide-check-circle' : 'i-lucide-git-branch'"
              :class="branch.isCurrent ? 'text-green-500' : 'text-app-muted'"
              class="size-4 shrink-0"
            />
            <span
              class="flex-1 text-sm truncate"
              :class="branch.isCurrent ? 'text-app font-medium' : 'text-app-muted'"
            >
              {{ branch.name }}
            </span>

            <!-- Ahead/behind indicators -->
            <div v-if="branch.ahead > 0 || branch.behind > 0" class="flex items-center gap-1 text-xs">
              <span v-if="branch.ahead > 0" class="text-green-500">
                <Icon name="i-lucide-arrow-up" class="size-3 inline" />{{ branch.ahead }}
              </span>
              <span v-if="branch.behind > 0" class="text-red-500">
                <Icon name="i-lucide-arrow-down" class="size-3 inline" />{{ branch.behind }}
              </span>
            </div>

            <!-- Actions -->
            <div
              v-if="!branch.isCurrent"
              class="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0"
            >
              <Button
                icon="i-lucide-git-merge"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Merge into current branch"
                @click.stop="handleMerge(branch.name)"
              />
              <Button
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                title="Delete branch"
                @click.stop="confirmDelete(branch.name)"
              />
            </div>
            <span v-else class="text-xs text-green-500">current</span>
          </div>
        </div>
      </div>

      <!-- Remote Branches -->
      <div v-if="remoteBranches.length > 0" class="border-b border-gray-200/50 dark:border-gray-700/50">
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="remoteCollapsed = !remoteCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="remoteCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-cloud" class="size-4 text-blue-500" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Remote ({{ filteredRemoteBranches.length }})
            </span>
          </div>
        </button>

        <div v-if="!remoteCollapsed" class="px-2 pb-2">
          <div v-if="filteredRemoteBranches.length === 0" class="text-xs text-app-muted italic px-2 py-1">
            No remote branches found
          </div>
          <div
            v-for="branch in filteredRemoteBranches"
            :key="`remote-${branch.name}`"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 cursor-pointer group"
            @click="handleCheckout(branch)"
          >
            <Icon name="i-lucide-cloud" class="size-4 text-blue-400 shrink-0" />
            <span class="flex-1 text-sm text-app-muted truncate">
              {{ branch.name }}
            </span>
            <Button
              label="Checkout"
              size="xs"
              variant="ghost"
              color="neutral"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="handleCheckout(branch)"
            />
          </div>
        </div>
      </div>

      <!-- Tags -->
      <div>
        <button
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-white/20 dark:hover:bg-white/5"
          @click="tagsCollapsed = !tagsCollapsed"
        >
          <div class="flex items-center gap-2">
            <Icon
              :name="tagsCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-4 text-app-muted"
            />
            <Icon name="i-lucide-tag" class="size-4 text-amber-500" />
            <span class="text-xs font-medium text-app-muted uppercase">
              Tags ({{ filteredTags.length }})
            </span>
          </div>
          <Button
            icon="i-lucide-plus"
            size="xs"
            variant="ghost"
            color="neutral"
            title="Create tag"
            @click.stop="showCreateTagModal = true"
          />
        </button>

        <div v-if="!tagsCollapsed" class="px-2 pb-2">
          <div v-if="filteredTags.length === 0" class="text-xs text-app-muted italic px-2 py-1">
            No tags found
          </div>
          <div
            v-for="tag in filteredTags"
            :key="tag.name"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/20 dark:hover:bg-white/10 group"
          >
            <Icon
              :name="tag.isAnnotated ? 'i-lucide-bookmark' : 'i-lucide-tag'"
              class="size-4 text-amber-400 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <span class="text-sm text-app truncate block">{{ tag.name }}</span>
              <div class="flex items-center gap-2 text-xs text-app-muted">
                <code class="font-mono">{{ tag.hash.slice(0, 7) }}</code>
                <span v-if="tag.date">{{ formatTagDate(tag.date) }}</span>
              </div>
              <span v-if="tag.message" class="text-xs text-app-muted truncate block">
                {{ tag.message }}
              </span>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
              <Button
                icon="i-lucide-upload"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Push tag to remote"
                @click.stop="emit('pushTag', tag.name)"
              />
              <Button
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                title="Delete tag"
                @click.stop="emit('deleteTag', tag.name)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Branch Modal -->
    <Modal v-model:open="showCreateModal">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-git-branch-plus" class="size-5 text-app-accent" />
            <h3 class="text-lg font-semibold text-app">Create Branch</h3>
          </div>
          <p class="text-sm text-app-muted">
            Create a new branch from <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{{ currentBranch }}</code>
          </p>
          <div>
            <label class="text-xs font-medium text-app-muted mb-1 block">Branch name</label>
            <input
              v-model="newBranchName"
              type="text"
              placeholder="feature/my-feature"
              class="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
              @keydown.enter="handleCreate"
            >
            <p v-if="newBranchName && !isValidBranchName" class="text-xs text-red-500 mt-1">
              Invalid branch name
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              @click="showCreateModal = false; newBranchName = ''"
            />
            <Button
              label="Create"
              :disabled="!isValidBranchName"
              @click="handleCreate"
            />
          </div>
        </div>
      </template>
    </Modal>

    <!-- Create Tag Modal -->
    <Modal v-model:open="showCreateTagModal">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-tag" class="size-5 text-amber-500" />
            <h3 class="text-lg font-semibold text-app">Create Tag</h3>
          </div>
          <p class="text-sm text-app-muted">
            Create a tag at the current HEAD
          </p>
          <div>
            <label class="text-xs font-medium text-app-muted mb-1 block">Tag name</label>
            <input
              v-model="newTagName"
              type="text"
              placeholder="v1.0.0"
              class="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
              @keydown.enter="handleCreateTag"
            >
            <p v-if="newTagName && !isValidTagName" class="text-xs text-red-500 mt-1">
              Invalid tag name
            </p>
          </div>
          <div>
            <label class="text-xs font-medium text-app-muted mb-1 block">Message (optional, creates annotated tag)</label>
            <input
              v-model="newTagMessage"
              type="text"
              placeholder="Release v1.0.0"
              class="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-app placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
              @keydown.enter="handleCreateTag"
            >
          </div>
          <div class="flex justify-end gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              @click="showCreateTagModal = false; newTagName = ''; newTagMessage = ''"
            />
            <Button
              label="Create"
              :disabled="!isValidTagName"
              @click="handleCreateTag"
            />
          </div>
        </div>
      </template>
    </Modal>

    <!-- Delete Confirmation Modal -->
    <Modal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-alert-triangle" class="size-5 text-red-500" />
            <h3 class="text-lg font-semibold text-app">Delete Branch</h3>
          </div>
          <p class="text-sm text-app-muted">
            Are you sure you want to delete <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{{ branchToDelete }}</code>?
          </p>
          <p class="text-xs text-app-muted">
            This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              @click="showDeleteConfirm = false; branchToDelete = null"
            />
            <Button
              label="Delete"
              color="error"
              @click="handleDelete(false)"
            />
            <Button
              label="Force Delete"
              color="error"
              variant="outline"
              @click="handleDelete(true)"
            />
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>
