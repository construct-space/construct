<script setup lang="ts">
/**
 * SpaceLayout — Wraps all space pages (company and project-scoped).
 *
 * 1. Reads route.params.projectId (new project-scoped routes)
 * 2. Falls back to ?project= query param (backward compat)
 * 3. After opening a project, enters sidebar project mode
 * 4. Triggers auto-install for missing spaces
 *
 * NOTE: Does NOT clear project on unmount — the project persists
 * when switching between spaces via sidebar. This is intentional.
 */
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useSidebar } from '@/composables/useSidebar'
import { useSpaces, getProjectSpaces } from '@/composables/useSpaces'
import { useSpaceAutoInstall } from '@/composables/useSpaceAutoInstall'
import { getSpace as getSpaceConfig } from '@/config/spaces'
import { watch, onMounted } from 'vue'

const route = useRoute()
const projectStore = useProjectStore()
const { enterProject } = useSidebar()
const { spaces, loadSpaces } = useSpaces()
const { installMissing } = useSpaceAutoInstall()

async function openProjectFromRoute() {
  // 1. Try new project-scoped route params
  const projectId = route.params.projectId as string | undefined
  if (projectId) {
    // Ensure projects are loaded
    if (projectStore.projects.length === 0) {
      await projectStore.loadProjects()
    }
    const project = projectStore.openProjectById(projectId)
    if (project) {
      await activateProjectMode(project)
      return
    }
  }

  // 2. Fall back to ?project= query param (backward compat)
  const projectPath = route.query.project
  if (typeof projectPath === 'string' && projectPath) {
    if (!projectStore.currentProject || projectStore.currentProject.path !== projectPath) {
      const project = projectStore.openProject(projectPath)
      if (project) {
        await activateProjectMode(project)
      }
    }
  }
}

async function activateProjectMode(project: { id: string | number; name: string; spaces: string[] }) {
  // Ensure spaces are loaded
  if (spaces.value.length === 0) {
    await loadSpaces()
  }

  // Build project space nav items for sidebar
  const projectSpaces = getProjectSpaces(spaces.value, project.spaces)
  const items = projectSpaces.map(s => ({
    id: s.name,
    label: s.displayName || s.name,
    icon: getSpaceConfig(s.name).icon || s.icon || 'i-lucide-circle',
    route: `/app/projects/${project.id}/${s.name}`,
  }))

  enterProject(
    { id: String(project.id), name: project.name },
    items,
    '/app/projects'
  )

  // Check for missing spaces and auto-install
  const installedSpaceIds = new Set(spaces.value.map(s => s.name))
  const missingIds = (project.spaces || []).filter(id => !installedSpaceIds.has(id))
  if (missingIds.length > 0) {
    await installMissing(missingIds)
    // Refresh spaces after install
    await loadSpaces()
  }
}

onMounted(() => {
  openProjectFromRoute()
})

// Watch for route changes (project switch or query param changes)
watch(
  () => [route.params.projectId, route.query.project],
  () => { openProjectFromRoute() },
)
</script>

<template>
  <RouterView />
</template>
