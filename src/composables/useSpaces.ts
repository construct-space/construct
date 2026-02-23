/**
 * Composable for loading and managing spaces
 * Personal local-first version — all spaces always available
 */

// Direct imports of space configs
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

  scope?: 'company' | 'project' | 'both'
  permission?: string
}

/**
 * Dynamically load all space configurations
 */
export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])
  const loading = ref(false)

  /**
   * Load all available spaces
   */
  const loadSpaces = async () => {
    loading.value = true
    try {
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
        calendarSpace,
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
    hasSpace,
    getSpace
  }
}
