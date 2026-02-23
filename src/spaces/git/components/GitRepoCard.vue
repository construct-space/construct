<script setup lang="ts">
/**
 * GitRepoCard - Card component for repository display
 */
interface RepoInfo {
  name: string
  path: string
  isRepo: boolean
  status?: 'clean' | 'dirty' | 'unknown'
  branch?: string
}

const props = defineProps<{
  repo: RepoInfo
}>()

const emit = defineEmits<{
  open: [repo: RepoInfo]
  terminal: [repo: RepoInfo]
  pull: [repo: RepoInfo]
  push: [repo: RepoInfo]
}>()

// Status color
const statusColor = computed(() => {
  switch (props.repo.status) {
    case 'clean': return 'bg-green-400'
    case 'dirty': return 'bg-yellow-400'
    default: return 'bg-gray-400'
  }
})

// Status text
const statusText = computed(() => {
  switch (props.repo.status) {
    case 'clean': return 'Clean'
    case 'dirty': return 'Uncommitted changes'
    default: return 'Unknown'
  }
})
</script>

<template>
  <div
    class="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all group"
    @click="emit('open', repo)"
  >
    <div class="flex items-start justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-(--app-accent)/10">
          <Icon
            :name="repo.isRepo ? 'i-lucide-git-branch' : 'i-lucide-folder'"
            class="size-5 text-app-accent"
          />
        </div>
        <div>
          <h3 class="font-medium text-app group-hover:text-app-accent transition-colors">
            {{ repo.name }}
          </h3>
          <p class="text-xs text-app-muted">
            {{ repo.isRepo ? 'Git Repository' : 'Folder' }}
          </p>
        </div>
      </div>

      <!-- Status indicator -->
      <div v-if="repo.isRepo" class="flex items-center gap-2">
        <span
          class="size-2 rounded-full"
          :class="statusColor"
          :title="statusText"
        />
      </div>
    </div>

    <!-- Branch info -->
    <div v-if="repo.branch" class="flex items-center gap-2 mb-2 text-xs text-app-muted">
      <Icon name="i-lucide-git-branch" class="size-3" />
      <span>{{ repo.branch }}</span>
    </div>

    <p class="text-xs text-app-muted truncate">
      {{ repo.path }}
    </p>

    <!-- Quick actions -->
    <div class="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        icon="i-lucide-code"
        size="xs"
        variant="soft"
        label="Open"
        @click.stop="emit('open', repo)"
      />
      <Button
        v-if="repo.isRepo"
        icon="i-lucide-terminal"
        size="xs"
        variant="ghost"
        title="Terminal"
        @click.stop="emit('terminal', repo)"
      />
      <Button
        v-if="repo.isRepo"
        icon="i-lucide-download"
        size="xs"
        variant="ghost"
        title="Pull"
        @click.stop="emit('pull', repo)"
      />
      <Button
        v-if="repo.isRepo"
        icon="i-lucide-upload"
        size="xs"
        variant="ghost"
        title="Push"
        @click.stop="emit('push', repo)"
      />
    </div>
  </div>
</template>
