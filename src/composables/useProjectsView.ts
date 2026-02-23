/**
 * useProjectsView - Manage projects view mode (wheel/list/grid)
 * Persists preference to localStorage
 */

export type ProjectsViewMode = 'wheel' | 'list' | 'grid'

const STORAGE_KEY = 'construct_projects_view_mode'

// Get initial value from localStorage or default to 'list'
const getInitialViewMode = (): ProjectsViewMode => {
  if (import.meta.client) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && ['wheel', 'list', 'grid'].includes(stored)) {
      return stored as ProjectsViewMode
    }
  }
  return 'list'
}

const viewMode = ref<ProjectsViewMode>(getInitialViewMode())

export function useProjectsView() {
  const setViewMode = (mode: ProjectsViewMode) => {
    viewMode.value = mode
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, mode)
    }
  }

  return {
    viewMode: computed(() => viewMode.value),
    setViewMode
  }
}
