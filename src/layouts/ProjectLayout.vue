<script setup lang="ts">
/**
 * ProjectLayout - Wrapper layout for project-scoped pages
 *
 * On mount:
 * - Opens the project by route path param
 * - Sets sidebar to main panel with project nav
 * - Builds project nav items from enabled spaces
 * - Watches route to rotate sidebar to space panel when inside a space
 *
 * Contains <RouterView /> for children (overview, settings, space pages).
 */
import type { SpaceConfig } from '@/composables/useSpaces'

const route = useRoute()
const projectStore = useProjectStore()
const { setPanel, setMainItems, enterSpace, exitSpace } = useSidebar()
const { spaces, loadSpaces, getSpace } = useSpaces()

const projectId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? id : null
})

/** Filter all spaces to those enabled for the current project */
function getProjectSpaces(enabledSpaces: string[]): SpaceConfig[] {
  return spaces.value.filter((s: SpaceConfig) => enabledSpaces.includes(s.name))
}

// Load project and configure sidebar
onMounted(async () => {
  if (!projectId.value) return

  // Fetch project if not loaded or different
  if (!projectStore.currentProject || projectStore.currentProject.id !== projectId.value) {
    await projectStore.fetchProject(projectId.value)
  }

  // Load spaces if not yet loaded
  if (spaces.value.length === 0) {
    await loadSpaces()
  }

  updateSidebar()
})

// Watch for route changes to detect space navigation
watch(() => route.path, () => {
  updateSidebar()
})

// Watch for project changes
watch(() => projectStore.currentProject, () => {
  updateSidebar()
})

const updateSidebar = () => {
  const project = projectStore.currentProject
  if (!project || !projectId.value) return

  // Build project nav items from enabled spaces
  const projectSpaces = getProjectSpaces(project.spaces || [])
  const navItems = projectSpaces.map((space: SpaceConfig) => ({
    label: space.displayName || space.name,
    icon: space.icon,
    to: `/app/projects/${projectId.value}/${space.name}`,
    spaceName: space.name,
    pages: space.pages.map((page) => ({
      ...page,
      route: `/app/projects/${projectId.value}/${space.name}${page.path ? '/' + page.path : ''}`,
    })),
  }))

  const bottomItems = [{
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: `/app/projects/${projectId.value}/settings`,
  }]

  setMainItems(navItems, bottomItems)

  // Detect current space from route
  const path = route.path
  const spaceMatch = path.match(/\/app\/projects\/[^/]+\/([^/]+)/)
  const currentSpaceName = spaceMatch?.[1]

  if (currentSpaceName && currentSpaceName !== 'settings') {
    // Find space config
    const spaceConfig = projectSpaces.find((s: SpaceConfig) => s.name === currentSpaceName)
    if (spaceConfig && spaceConfig.pages.length > 1) {
      // Multi-page space — rotate to space panel
      const pageItems = spaceConfig.pages.map((page) => ({
        ...page,
        route: `/app/projects/${projectId.value}/${currentSpaceName}${page.path ? '/' + page.path : ''}`,
      }))
      enterSpace(currentSpaceName, pageItems, `/app/projects/${projectId.value}`)
    } else {
      // Single-page space — stay on main panel
      setPanel('main')
    }
  } else {
    // On overview or settings — show main panel
    setPanel('main')
  }
}

// Cleanup: reset sidebar when leaving project
onUnmounted(() => {
  projectStore.clearCurrentProject()
  setPanel('main')
})
</script>

<template>
  <RouterView />
</template>
