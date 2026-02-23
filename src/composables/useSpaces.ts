/**
 * Composable for loading and managing spaces
 *
 * Hybrid loading: built-in spaces + marketplace-installed spaces (from Go backend).
 * Graceful fallback: if Go backend not ready, just uses built-ins.
 */

import { builtinSpaces } from '~/spaces/builtin'

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

  // Marketplace metadata (only set for installed spaces)
  isInstalled?: boolean
  version?: string
  author?: string
}

/** Convert a marketplace manifest to SpaceConfig */
function manifestToSpaceConfig(manifest: Record<string, unknown>): SpaceConfig {
  return {
    name: manifest.name as string,
    displayName: (manifest.display_name as string) || (manifest.name as string),
    description: (manifest.description as string) || '',
    icon: (manifest.icon as string) || 'i-lucide-box',
    pages: [{ path: '', label: 'Overview', default: true }],
    navigation: {
      label: (manifest.display_name as string) || (manifest.name as string),
      icon: (manifest.icon as string) || 'i-lucide-box',
      to: manifest.name as string,
      order: (manifest.order as number) || 100,
    },
    isInstalled: true,
    version: manifest.version as string,
    author: manifest.author as string,
  }
}

/**
 * Dynamically load all space configurations
 */
export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])
  const loading = ref(false)

  /**
   * Load all available spaces — built-in + installed from marketplace
   */
  const loadSpaces = async () => {
    loading.value = true
    try {
      // Start with built-in spaces
      const allSpaces: SpaceConfig[] = [...builtinSpaces]

      // Try to load marketplace-installed spaces from Go backend
      try {
        const { useContextService } = await import('@/composables/useContextService')
        const contextService = useContextService()
        if (contextService.connected.value) {
          const result = await contextService.sendRequest<{ spaces: Record<string, unknown>[] }>('spaces.list_installed')
          if (result?.spaces?.length) {
            const installedSpaces = result.spaces
              .map(manifestToSpaceConfig)
              .filter(s => !allSpaces.some(b => b.name === s.name)) // Skip duplicates
            allSpaces.push(...installedSpaces)
          }
        }
      } catch {
        // Go backend not ready — use built-ins only
      }

      // Sort by order
      spaces.value = allSpaces.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    } catch (error) {
      console.error('Failed to load spaces:', error)
      spaces.value = [...builtinSpaces].sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
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
