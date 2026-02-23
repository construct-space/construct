<script setup lang="ts">
/**
 * ProjectsList - Flat list view matching construct-mono style
 */
import type { Project } from '@/stores/project'
import { createProjectPin } from '@/stores/pinned'
import { getSpace } from '@/config/spaces'

defineProps<{
  projects: Project[]
  loading?: boolean
}>()

const emit = defineEmits<{
  view: [project: Project]
  edit: [project: Project]
  delete: [project: Project]
}>()

const pinnedStore = usePinnedStore()
const authStore = useAuthStore()

const togglePin = (project: Project) => {
  pinnedStore.togglePin(createProjectPin(project))
}

const isPinned = (project: Project) => {
  return pinnedStore.isPinned(`project-${project.id}`)
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const isOwner = (project: Project) => {
  return project.owner_id === authStore.user?.id
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-40">
      <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-[var(--app-muted)]" />
    </div>

    <!-- Empty -->
    <div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-20">
      <Icon name="i-lucide-folder-open" class="size-10 text-[var(--app-muted)]/30 mb-4" />
      <p class="text-sm text-[var(--app-muted)]">No projects found</p>
    </div>

    <!-- Rows -->
    <div v-else class="divide-y divide-[var(--app-border)]">
      <div
        v-for="project in projects"
        :key="project.id"
        class="flex items-center gap-3 px-6 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors"
        @click="emit('view', project)"
      >
        <!-- Folder icon (plain, no container) -->
        <Icon name="i-lucide-folder" class="size-4 text-app-accent shrink-0" />

        <!-- Name + description -->
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-medium text-[var(--app-foreground)] truncate leading-snug">{{ project.name }}</h3>
          <p v-if="project.description" class="text-xs text-[var(--app-muted)] truncate hidden sm:block leading-snug">
            {{ project.description }}
          </p>
        </div>

        <!-- Space icon chips -->
        <div class="flex items-center gap-1 shrink-0 hidden sm:flex">
          <div
            v-for="space in (project.spaces || []).slice(0, 4)"
            :key="space"
            class="size-6 flex items-center justify-center rounded border border-[var(--app-border)]"
            :class="getSpace(space).bg"
            :title="getSpace(space).label"
          >
            <Icon :name="getSpace(space).icon" class="size-3" :class="getSpace(space).color" />
          </div>
          <span
            v-if="(project.spaces || []).length > 4"
            class="text-[11px] text-[var(--app-muted)] ml-0.5"
          >+{{ project.spaces.length - 4 }}</span>
        </div>

        <!-- Date -->
        <span class="hidden md:block text-xs text-[var(--app-muted)] whitespace-nowrap shrink-0 w-24 text-right">
          {{ formatDate(project.updated_at || project.created_at) }}
        </span>

        <!-- Actions — always visible -->
        <div class="flex items-center shrink-0 gap-0.5">
          <button
            class="p-1 rounded transition-colors"
            :class="isPinned(project) ? 'text-app-accent' : 'text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
            title="Pin"
            @click.stop="togglePin(project)"
          >
            <Icon :name="isPinned(project) ? 'i-lucide-pin-off' : 'i-lucide-pin'" class="size-3.5" />
          </button>
          <button
            class="p-1 rounded text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
            title="Open"
            @click.stop="emit('view', project)"
          >
            <Icon name="i-lucide-external-link" class="size-3.5" />
          </button>
          <template v-if="isOwner(project)">
            <button
              class="p-1 rounded text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
              title="Edit"
              @click.stop="emit('edit', project)"
            >
              <Icon name="i-lucide-pencil" class="size-3.5" />
            </button>
            <button
              class="p-1 rounded text-[var(--app-muted)] hover:text-red-500 transition-colors"
              title="Delete"
              @click.stop="emit('delete', project)"
            >
              <Icon name="i-lucide-trash-2" class="size-3.5" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
