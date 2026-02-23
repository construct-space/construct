<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'
import { useSpaces } from '@/composables/useSpaces'
import { getSpace as getSpaceConfig } from '@/config/spaces'
import {
  Calendar, FolderPlus, FolderOpen, Clock, ArrowRight,
} from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const projectStore = useProjectStore()
const { spaces, loadSpaces } = useSpaces()

const userName = computed(() => authStore.user?.first_name || 'User')

const today = new Date()
const dayNumber = today.getDate().toString().padStart(2, '0')
const monthYear = today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

const recentProjects = computed(() => {
  return [...projectStore.recentProjects]
    .sort((a, b) => new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime())
    .slice(0, 8)
})

const truncatePath = (path: string) => {
  if (path.length <= 40) return path
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return `~/${parts.slice(-2).join('/')}`
}

const timeAgo = (dateStr: string) => {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const openProject = (project: { path: string }) => {
  router.push({ path: '/app/code', query: { project: project.path } })
}

const newProject = () => {
  router.push({ path: '/app/code' })
}

const openFolder = async () => {
  try {
    const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
    const projectDir = useProjectDirectory()
    const path = await projectDir.openFolderDialog('Open Project Folder')
    if (path) {
      await projectStore.addExternalProject(path)
      router.push({ path: '/app/code', query: { project: path } })
    }
  } catch (error) {
    console.warn('Failed to open folder:', error)
  }
}

const navigateToSpace = (spaceName: string) => {
  router.push(`/app/${spaceName}`)
}

const spaceShortcuts = computed(() => {
  return spaces.value.slice(0, 8).map(s => ({
    name: s.name,
    label: s.displayName || s.name,
    config: getSpaceConfig(s.name),
  }))
})

onMounted(async () => {
  if (spaces.value.length === 0) {
    await loadSpaces()
  }
  // Initialize project store if needed
  if (projectStore.projects.length === 0 && projectStore.projectsRoot) {
    await projectStore.loadProjects()
  }
})
</script>

<template>
  <div class="h-screen overflow-hidden flex items-center justify-center px-6">
    <div class="w-full max-w-4xl">

      <!-- Welcome header -->
      <div class="mb-10">
        <p class="text-sm text-app-muted tracking-wider">WELCOME BACK,</p>
        <h1 class="text-5xl font-bold text-app mt-1">{{ userName }}</h1>
        <div class="flex items-center gap-4 mt-3">
          <div class="flex items-baseline gap-2">
            <span class="text-4xl font-bold text-app">{{ dayNumber }}</span>
            <span class="text-sm text-app-muted uppercase tracking-wider">{{ monthYear }}</span>
          </div>
          <Calendar class="size-4 text-app-muted" />
        </div>
      </div>

      <!-- Recent Projects -->
      <div class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <Clock class="size-4 text-app-muted" />
            <span class="text-sm text-app-muted uppercase tracking-wider font-medium">Recent Projects</span>
          </div>
          <div class="flex gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-app-accent text-app-accent-foreground hover:opacity-90 transition-opacity"
              @click="newProject"
            >
              <FolderPlus class="size-3.5" />
              New Project
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-app text-app hover:bg-white/5 transition-colors"
              @click="openFolder"
            >
              <FolderOpen class="size-3.5" />
              Open Folder
            </button>
          </div>
        </div>

        <!-- Projects grid -->
        <div v-if="recentProjects.length > 0" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            v-for="project in recentProjects"
            :key="project.path"
            class="group text-left p-3 rounded-lg border border-app hover:border-app-accent/30 hover:bg-[color-mix(in_srgb,var(--app-accent)_3%,transparent)] transition-all"
            @click="openProject(project)"
          >
            <p class="text-sm font-medium text-app truncate">{{ project.name }}</p>
            <p class="text-[10px] text-app-muted truncate mt-0.5">{{ truncatePath(project.path) }}</p>
            <p class="text-[10px] text-app-muted mt-1.5">{{ timeAgo(project.last_opened_at) }}</p>
          </button>
        </div>

        <!-- Empty state -->
        <div v-else class="text-center py-12 border border-dashed border-app rounded-lg">
          <p class="text-sm text-app-muted">No recent projects</p>
          <p class="text-xs text-app-muted mt-1">Create a new project or open an existing folder</p>
        </div>
      </div>

      <!-- Space shortcuts -->
      <div>
        <span class="text-sm text-app-muted uppercase tracking-wider font-medium">Spaces</span>
        <div class="flex flex-wrap gap-2 mt-3">
          <button
            v-for="space in spaceShortcuts"
            :key="space.name"
            class="group flex items-center gap-2 px-3 py-2 rounded-md border border-app hover:border-app-accent/30 hover:bg-[color-mix(in_srgb,var(--app-accent)_3%,transparent)] transition-all text-sm"
            @click="navigateToSpace(space.name)"
          >
            <span :class="space.config.color">{{ space.label }}</span>
            <ArrowRight class="size-3 text-app-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
