<script setup lang="ts">
/**
 * ProjectsGrid - Card grid view matching construct-mono style
 *
 * Large folder icon top-left, name + description below,
 * space chips + count + date along the bottom.
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
    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div v-for="i in 8" :key="i" class="h-48 rounded-lg bg-[var(--app-muted)]/5 animate-pulse" />
    </div>

    <!-- Empty state -->
    <div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-20">
      <Icon name="i-lucide-folder-open" class="size-10 text-[var(--app-muted)]/30 mb-4" />
      <p class="text-sm text-[var(--app-muted)]">No projects found</p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div
        v-for="project in projects"
        :key="project.id"
        class="group relative flex flex-col rounded-lg border border-[var(--app-border)] bg-white/[0.02] p-5 cursor-pointer hover:border-[var(--app-muted)]/40 transition-colors"
        @click="emit('view', project)"
      >
        <!-- Folder icon — large, top -->
        <Icon name="i-lucide-folder" class="size-7 text-app-accent mb-4" />

        <!-- Name -->
        <h3 class="text-sm font-semibold text-[var(--app-foreground)] truncate mb-1">{{ project.name }}</h3>

        <!-- Description -->
        <p v-if="project.description" class="text-xs text-[var(--app-muted)] line-clamp-3 leading-relaxed flex-1 mb-4">
          {{ project.description }}
        </p>
        <div v-else class="flex-1 mb-4" />

        <!-- Bottom row: space chips + count + date -->
        <div class="flex items-center gap-1">
          <div
            v-for="space in (project.spaces || []).slice(0, 3)"
            :key="space"
            class="size-6 flex items-center justify-center rounded border border-[var(--app-border)]"
            :class="getSpace(space).bg"
            :title="getSpace(space).label"
          >
            <Icon :name="getSpace(space).icon" class="size-3" :class="getSpace(space).color" />
          </div>
          <span
            v-if="(project.spaces || []).length > 3"
            class="text-[11px] text-[var(--app-muted)] ml-0.5"
          >+{{ project.spaces.length - 3 }}</span>
          <span class="text-[11px] text-[var(--app-muted)] ml-auto whitespace-nowrap">
            {{ formatDate(project.updated_at || project.created_at) }}
          </span>
        </div>

        <!-- Hover actions (top-right) -->
        <div class="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
