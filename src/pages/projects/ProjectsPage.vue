<script setup lang="ts">
/**
 * ProjectsPage - Local project management
 * Thin orchestrator — delegates UI to components.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import type { LocalProject } from '@/types/project'
import { usePinnedStore, createProjectPin } from '@/stores/pinned'
import { useToolbar } from '@/composables/useToolbar'
import { getProjectRouteKey } from '@/utils/projectRoutes'
import ProjectCard from '@/components/projects/ProjectCard.vue'
import ProjectCreateModal from '@/components/projects/ProjectCreateModal.vue'
import ProjectEditModal from '@/components/projects/ProjectEditModal.vue'
import ProjectRemoveModal from '@/components/projects/ProjectRemoveModal.vue'

const router = useRouter()
const projectStore = useProjectStore()
const pinnedStore = usePinnedStore()
const { setPageItems, setSearch, clearToolbar } = useToolbar()

const searchQuery = ref('')
const showCreateModal = ref(false)
const creating = ref(false)
const initialized = ref(false)

// Edit / remove state
const editingProject = ref<LocalProject | null>(null)
const confirmRemove = ref<LocalProject | null>(null)

// Computed
const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return projectStore.projects
  return projectStore.projects.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description?.toLowerCase().includes(q)
  )
})

const sortedProjects = computed(() => {
  return [...filteredProjects.value].sort((a, b) => {
    const aTime = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0
    const bTime = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0
    return bTime - aTime
  })
})

const needsSetup = computed(() => initialized.value && !projectStore.projectsRoot)

// Actions
function openProject(project: LocalProject) {
  projectStore.trackRecentOpen(project)
  router.push(`/app/projects/${encodeURIComponent(getProjectRouteKey(project))}`)
}

function isProjectPinned(project: LocalProject): boolean {
  return pinnedStore.isPinned(`project-${getProjectRouteKey(project)}`)
}

function togglePin(project: LocalProject) {
  const routeKey = getProjectRouteKey(project)
  const pinId = `project-${routeKey}`
  if (pinnedStore.isPinned(pinId)) {
    pinnedStore.removePin(pinId)
  } else {
    pinnedStore.addPin(createProjectPin({ id: routeKey, name: project.name, description: project.description }))
  }
}

async function handleCreate(name: string, description?: string) {
  creating.value = true
  try {
    const result = await projectStore.createProject({ name, description })
    if (result.success && result.data) {
      showCreateModal.value = false
      openProject(result.data)
    }
  } finally {
    creating.value = false
  }
}

async function handleEdit(name: string, description?: string) {
  if (!editingProject.value) return
  await projectStore.updateProjectConfig(editingProject.value.path, { name, description })
  editingProject.value = null
}

function handleRemove(deleteFromDisk: boolean) {
  if (!confirmRemove.value) return
  if (deleteFromDisk) {
    projectStore.deleteProjectFromDisk(confirmRemove.value.path)
  } else {
    projectStore.removeProject(confirmRemove.value.path)
  }
  confirmRemove.value = null
}

// Init
async function initializeProjects() {
  if (!projectStore.projectsRoot) {
    const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
    const projectDir = useProjectDirectory()
    const savedRoot = localStorage.getItem('construct_projects_root')
    if (savedRoot) {
      const tauriFs = await import('@tauri-apps/plugin-fs')
      if (await tauriFs.exists(savedRoot)) {
        projectStore.setProjectsRoot(savedRoot)
        await projectDir.setProjectsRoot(savedRoot)
      }
    }
  }
  if (projectStore.projectsRoot) {
    await projectStore.loadProjects()
  }
  initialized.value = true
}

async function chooseProjectsRoot() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { homeDir } = await import('@tauri-apps/api/path')
  const home = await homeDir()
  const selected = await open({ directory: true, multiple: false, defaultPath: home, title: 'Choose Projects Folder' })
  if (selected && typeof selected === 'string') {
    const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
    const projectDir = useProjectDirectory()
    await projectDir.setProjectsRoot(selected)
    projectStore.setProjectsRoot(selected)
    await projectStore.loadProjects()
  }
}

async function handleAddFolder() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: 'Open Project Folder' })
  if (selected && typeof selected === 'string') {
    const project = await projectStore.addExternalFolderByPath(selected)
    if (project) openProject(project)
  }
}

// Drag-and-drop
const isDragging = ref(false)
let unlistenDragDrop: (() => void) | null = null

async function setupDragDrop() {
  try {
    const tauriWebview = (window as any).__TAURI__?.webview
    if (!tauriWebview?.getCurrentWebview) return
    const webview = tauriWebview.getCurrentWebview()
    unlistenDragDrop = await webview.onDragDropEvent(async (event: any) => {
      if (event.payload.type === 'over') {
        isDragging.value = true
      } else if (event.payload.type === 'drop') {
        isDragging.value = false
        const { stat } = await import('@tauri-apps/plugin-fs')
        for (const path of event.payload.paths) {
          try {
            const meta = await stat(path)
            if (meta.isDirectory) {
              const project = await projectStore.addExternalFolderByPath(path)
              if (project) openProject(project)
              break
            }
          } catch { /* skip */ }
        }
      } else if (event.payload.type === 'cancel') {
        isDragging.value = false
      }
    })
  } catch { /* not in Tauri */ }
}

onMounted(async () => {
  setPageItems([
    { id: 'projects-new', icon: 'i-lucide-plus', label: 'New Project', type: 'action', category: 'space', onClick: () => { showCreateModal.value = true } },
    { id: 'projects-open-folder', icon: 'i-lucide-folder-open', label: 'Open Folder', type: 'action', category: 'space', onClick: handleAddFolder },
  ])
  setSearch('Search projects...', (query: string) => { searchQuery.value = query })
  await initializeProjects()
  setupDragDrop()
})

onUnmounted(() => {
  clearToolbar()
  unlistenDragDrop?.()
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden relative">
    <!-- Drop zone overlay -->
    <transition name="fade">
      <div
        v-if="isDragging"
        class="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-3 p-10 rounded-2xl border-2 border-dashed border-[var(--app-accent)]/60 bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)]">
          <i class="i-lucide-folder-plus size-12 text-[var(--app-accent)]" />
          <p class="text-lg font-semibold text-[var(--app-foreground)]">Drop folder to add as project</p>
          <p class="text-sm text-[var(--app-muted)]">Release to add and open</p>
        </div>
      </div>
    </transition>

    <!-- Loading -->
    <div v-if="!initialized" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-[var(--app-muted)]">
        <i class="i-lucide-loader-2 size-5 animate-spin" />
        <span class="text-sm">Loading projects...</span>
      </div>
    </div>

    <!-- Setup needed -->
    <div v-else-if="needsSetup" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-sm">
        <div class="size-16 rounded-2xl bg-[var(--app-muted)]/10 flex items-center justify-center mx-auto mb-4">
          <i class="i-lucide-folder-root size-8 text-[var(--app-muted)]" />
        </div>
        <h2 class="text-lg font-semibold text-[var(--app-foreground)] mb-2">Welcome to Projects</h2>
        <p class="text-sm text-[var(--app-muted)] mb-6">Choose where your projects live on disk.</p>
        <button
          class="px-5 py-2.5 rounded-lg bg-[var(--app-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          @click="chooseProjectsRoot"
        >
          Choose Projects Folder
        </button>
      </div>
    </div>

    <!-- Scanning -->
    <div v-else-if="projectStore.loading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-[var(--app-muted)]">
        <i class="i-lucide-loader-2 size-5 animate-spin" />
        <span class="text-sm">Scanning projects...</span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="sortedProjects.length === 0 && !searchQuery" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-sm">
        <div class="size-16 rounded-2xl bg-[var(--app-muted)]/10 flex items-center justify-center mx-auto mb-4">
          <i class="i-lucide-package size-8 text-[var(--app-muted)]" />
        </div>
        <h2 class="text-lg font-semibold text-[var(--app-foreground)] mb-2">No projects yet</h2>
        <p class="text-sm text-[var(--app-muted)] mb-6">Create your first project or open an existing folder.</p>
        <div class="flex gap-3 justify-center">
          <button class="px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity" @click="showCreateModal = true">
            <i class="i-lucide-plus mr-1.5" /> New Project
          </button>
          <button class="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-foreground)] hover:bg-[var(--app-muted)]/5 transition-colors" @click="handleAddFolder">
            <i class="i-lucide-folder-open mr-1.5" /> Open Folder
          </button>
        </div>
      </div>
    </div>

    <!-- Project grid -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto p-6">
        <div v-if="sortedProjects.length === 0 && searchQuery" class="text-center py-16">
          <p class="text-sm text-[var(--app-muted)]">No projects matching "{{ searchQuery }}"</p>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ProjectCard
            v-for="project in sortedProjects"
            :key="project.path"
            :project="project"
            :pinned="isProjectPinned(project)"
            @open="openProject"
            @remove="confirmRemove = $event"
            @edit="editingProject = $event"
            @toggle-pin="togglePin"
          />
        </div>
      </div>
    </div>

    <!-- Modals -->
    <ProjectCreateModal v-model:open="showCreateModal" @create="handleCreate" />
    <ProjectEditModal :project="editingProject" @close="editingProject = null" @save="handleEdit" />
    <ProjectRemoveModal :project="confirmRemove" @close="confirmRemove = null" @remove="handleRemove" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
