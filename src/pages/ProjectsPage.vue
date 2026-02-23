<script setup lang="ts">
/**
 * ProjectsPage - construct-mono style
 *
 * Two-column layout:
 *   Left  (1/3): empty space + "BASECODE:PROJECTS" at bottom
 *   Right (2/3): project list or grid
 *
 * View toggle (list / grid / wheel) lives in the global toolbar via Teleport.
 */
import type { Project } from '@/stores/project'
import ProjectFormModal from '@/components/projects/ProjectFormModal.vue'
import ProjectsList from '@/components/projects/ProjectsList.vue'
import ProjectsGrid from '@/components/projects/ProjectsGrid.vue'

const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()
const { viewMode, setViewMode } = useProjectsView()

// State
const showFormModal = ref(false)
const editingProject = ref<Project | null>(null)

const companyName = computed(() => {
  const name = (authStore.user as any)?.company?.name || 'BASECODE'
  return name.toUpperCase()
})

// Fetch projects on mount
onMounted(async () => {
  await projectStore.fetchProjects()
})

// Sorted projects (no in-page search — use global toolbar search)
const sortedProjects = computed(() => {
  return [...projectStore.projects].sort((a, b) => {
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  })
})

// Actions
const openCreate = () => {
  editingProject.value = null
  showFormModal.value = true
}

const openEdit = (project: Project) => {
  editingProject.value = project
  showFormModal.value = true
}

const viewProject = (project: Project) => {
  router.push(`/app/projects/${project.id}`)
}

const deleteProject = async (project: Project) => {
  if (!confirm(`Delete "${project.name}"? This action cannot be undone.`)) return
  await projectStore.updateProject(project.id, { deleted_at: new Date().toISOString() } as any)
  await projectStore.fetchProjects()
}

// Keyboard shortcut: Cmd+N to create
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault()
    openCreate()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="h-full flex">
    <!-- LEFT COLUMN (1/3) — branding + new project, vertically centered -->
    <div class="w-1/3 flex flex-col items-start justify-center shrink-0 px-6">
      <div class="flex items-center gap-3">
        <button
          class="w-7 h-7 flex items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-muted)] hover:text-[var(--app-foreground)] hover:border-[var(--app-foreground)] transition-colors shrink-0"
          title="New Project (⌘N)"
          @click="openCreate"
        >
          <Icon name="i-lucide-plus" class="size-3.5" />
        </button>
        <p class="text-lg tracking-wide select-none">
          <span class="text-[var(--app-muted)] font-normal">{{ companyName }}:</span><span class="font-bold text-[var(--app-foreground)]">PROJECTS</span>
        </p>
      </div>
    </div>

    <!-- RIGHT COLUMN (2/3) — project list or grid -->
    <div class="w-2/3 flex-1 overflow-auto">
      <!-- List view -->
      <ProjectsList
        v-if="viewMode === 'list'"
        :projects="sortedProjects"
        :loading="projectStore.loading"
        @view="viewProject"
        @edit="openEdit"
        @delete="deleteProject"
      />

      <!-- Grid view -->
      <div v-else class="p-6">
        <ProjectsGrid
          :projects="sortedProjects"
          :loading="projectStore.loading"
          @view="viewProject"
          @edit="openEdit"
          @delete="deleteProject"
        />
      </div>
    </div>

    <!-- View toggle in global toolbar (Teleport to center slot) -->
    <Teleport to="#toolbar-bun-slot">
      <div class="flex items-center h-7 border border-[var(--app-border)] rounded overflow-hidden">
        <button
          class="h-full px-1.5 transition-colors"
          :class="viewMode === 'list' ? 'bg-[var(--app-muted)]/20 text-[var(--app-foreground)]' : 'text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
          title="List view"
          @click="setViewMode('list')"
        >
          <Icon name="i-lucide-list" class="size-3.5" />
        </button>
        <button
          class="h-full px-1.5 transition-colors"
          :class="viewMode === 'grid' ? 'bg-[var(--app-muted)]/20 text-[var(--app-foreground)]' : 'text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
          title="Grid view"
          @click="setViewMode('grid')"
        >
          <Icon name="i-lucide-layout-grid" class="size-3.5" />
        </button>
        <button
          class="h-full px-1.5 transition-colors"
          :class="viewMode === 'wheel' ? 'bg-[var(--app-muted)]/20 text-[var(--app-foreground)]' : 'text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
          title="Timeline view"
          @click="setViewMode('wheel')"
        >
          <Icon name="i-lucide-clock" class="size-3.5" />
        </button>
      </div>
    </Teleport>

    <!-- Create/Edit Modal -->
    <ProjectFormModal
      :open="showFormModal"
      :project="editingProject"
      @update:open="showFormModal = $event"
      @created="projectStore.fetchProjects()"
      @updated="projectStore.fetchProjects()"
    />
  </div>
</template>
