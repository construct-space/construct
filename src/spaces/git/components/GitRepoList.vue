<script setup lang="ts">
/**
 * GitRepoList - Grid view of repositories with empty states
 */
interface RepoInfo {
  name: string
  path: string
  isRepo: boolean
  status?: 'clean' | 'dirty' | 'unknown'
  branch?: string
}

defineProps<{
  repos: RepoInfo[]
  loading: boolean
  hasLocalPath: boolean
  projectId: string
}>()

const emit = defineEmits<{
  open: [repo: RepoInfo]
  terminal: [repo: RepoInfo]
  pull: [repo: RepoInfo]
  push: [repo: RepoInfo]
  clone: []
  import: []
  configureFolder: []
}>()
</script>

<template>
  <div class="flex-1 overflow-y-auto p-4">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
    </div>

    <!-- No local path configured -->
    <div v-else-if="!hasLocalPath" class="flex flex-col items-center justify-center h-64 text-center">
      <Icon name="i-lucide-folder-x" class="size-16 text-app-muted mb-4" />
      <h2 class="text-lg font-medium text-app mb-2">No Local Folder</h2>
      <p class="text-app-muted text-sm mb-4 max-w-md">
        This project doesn't have a local folder configured. Set up a local folder to manage repositories.
      </p>
      <Button
        icon="i-lucide-folder-plus"
        label="Configure Local Folder"
        @click="emit('configureFolder')"
      />
    </div>

    <!-- Empty state -->
    <div v-else-if="repos.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
      <Icon name="i-lucide-git-branch" class="size-16 text-app-muted mb-4" />
      <h2 class="text-lg font-medium text-app mb-2">No Repositories</h2>
      <p class="text-app-muted text-sm mb-4 max-w-md">
        Clone a repository or import an existing folder to get started.
      </p>
      <div class="flex gap-2">
        <Button
          icon="i-lucide-git-branch"
          label="Clone Repository"
          @click="emit('clone')"
        />
        <Button
          icon="i-lucide-folder-input"
          label="Import Folder"
          variant="soft"
          @click="emit('import')"
        />
      </div>
    </div>

    <!-- Repository grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <GitRepoCard
        v-for="repo in repos"
        :key="repo.path"
        :repo="repo"
        @open="emit('open', $event)"
        @terminal="emit('terminal', $event)"
        @pull="emit('pull', $event)"
        @push="emit('push', $event)"
      />
    </div>
  </div>
</template>
