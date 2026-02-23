/**
 * Composable for loading and managing project spaces
 */

// Direct imports of space configs (fallback for when glob doesn't work)
import codeSpace from '~/spaces/code/space.config'
import kanbanSpace from '~/spaces/kanban/space.config'
import architectSpace from '~/spaces/architect/space.config'
import notesSpace from '~/spaces/notes/space.config'
import aiSpace from '~/spaces/ai/space.config'
import gitSpace from '~/spaces/git/space.config'
import terminalSpace from '~/spaces/terminal/space.config'
import designSpace from '~/spaces/design/space.config'
import chatSpace from '~/spaces/chat/space.config'
import docsSpace from '~/spaces/docs/space.config'
import calendarSpace from '~/spaces/calendar/space.config'
// import browserSpace from '~/spaces/browser/space.config' // Disabled for now - future feature

export interface SpaceToolbarItem {
  id: string
  icon: string
  label: string
  action?: string     // Action name to emit
  to?: string         // Route to navigate to
}

export interface SpacePage {
  path: string        // '' for index, 'editor', 'assets', etc.
  label: string
  icon?: string
  default?: boolean   // Is this the default page for the space?
  requiresContext?: boolean // Only show when an item is selected (e.g., design, file)
  toolbar?: SpaceToolbarItem[] // Page-specific toolbar items (merged on top of space toolbar)
}

export interface SpaceConfig {
  name: string
  displayName: string
  description: string
  icon: string
  scope?: 'company' | 'project' | 'both'

  // Pages this space provides (loaded from spaces/[name]/pages/)
  pages: SpacePage[]

  // Toolbar items for this space (shown when space is active)
  toolbar?: SpaceToolbarItem[]

  // Navigation menu item
  navigation: {
    label: string
    icon: string
    to: string
    order: number
  }

  permission?: string
}

/**
 * Dynamically load all space configurations
 */
export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])
  const loading = ref(false)

  /**
   * Load all available spaces from the spaces directory
   */
  const loadSpaces = async () => {
    loading.value = true
    try {
      // Use direct imports instead of glob (more reliable)
      const allSpaces: SpaceConfig[] = [
        codeSpace,
        designSpace,
        kanbanSpace,
        docsSpace,
        architectSpace,
        notesSpace,
        aiSpace,
        chatSpace,
        gitSpace,
        terminalSpace,
        calendarSpace
        // browserSpace // Disabled for now
      ]

      // Sort by order
      spaces.value = allSpaces.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    } catch (error) {
      console.error('Failed to load spaces:', error)
      spaces.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Get spaces that are enabled for a project
   */
  const getProjectSpaces = (projectSpaces: string[], userCanAccess?: (spaceName: string) => boolean) => {
    if (!projectSpaces || projectSpaces.length === 0) {
      return []
    }

    return spaces.value.filter(space => {
      // Check if space is enabled in project
      const isEnabled = projectSpaces.includes(space.name)

      // Check if user has permission (if callback provided)
      const hasAccess = userCanAccess ? userCanAccess(space.name) : true

      return isEnabled && hasAccess
    })
  }

  /**
   * Check if a specific space is available
   */
  const hasSpace = (spaceName: string) => {
    return spaces.value.some(space => space.name === spaceName)
  }

  /**
   * Get space config by name
   */
  const getSpace = (spaceName: string) => {
    return spaces.value.find(space => space.name === spaceName)
  }

  return {
    spaces,
    loading,
    loadSpaces,
    getProjectSpaces,
    hasSpace,
    getSpace
  }
}
