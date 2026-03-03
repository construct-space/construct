/**
 * Composable for loading and managing spaces.
 *
 * All modes scan ~/.construct/spaces/ for installed manifests via Tauri FS.
 * The Go backend (contextService) is NOT used for spaces.
 */

import { registerSpaceTheme } from '@/config/spaces'

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
  requiresContext?: boolean // Only show when an item is selected
  toolbar?: SpaceToolbarItem[] // Page-specific toolbar items
}

export interface SpaceConfig {
  name: string
  displayName: string
  description: string
  icon: string

  // Pages this space provides
  pages: SpacePage[]

  // Toolbar items for this space
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

  // Marketplace metadata
  isInstalled?: boolean
  version?: string
  author?: string
  recommended?: boolean

  // Theme identity
  theme?: {
    color: string
    bg: string
  }
}

/**
 * Dynamically load all space configurations.
 *
 * Scans ~/.construct/spaces/ for manifest.json files.
 */
export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])
  const loading = ref(false)

  const loadSpaces = async () => {
    loading.value = true
    try {
      await loadFromDisk()
    } catch (err) {
      console.error('[useSpaces] Failed to load spaces:', err)
      spaces.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Scan ~/.construct/spaces/ for installed manifests.
   * Filters out spaces disabled in marketplace settings.
   */
  const loadFromDisk = async () => {
    try {
      const { readTextFile, readDir, exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')

      const home = await homeDir()
      const spacesDir = `${home}/.construct/spaces`

      if (!(await exists(spacesDir))) {
        spaces.value = []
        return
      }

      // Read disabled spaces from marketplace state
      const disabledIds = getDisabledSpaceIds()

      const entries = await readDir(spacesDir)
      const diskSpaces: SpaceConfig[] = []

      for (const entry of entries) {
        if (!entry.isDirectory) continue
        const manifestPath = `${spacesDir}/${entry.name}/manifest.json`
        if (!(await exists(manifestPath))) continue

        try {
          const manifestJson = await readTextFile(manifestPath)
          const manifest = JSON.parse(manifestJson)
          const id = (manifest.id as string) || entry.name
          if (disabledIds.has(id)) continue
          diskSpaces.push(manifestToSpaceConfig(manifest))
        } catch {
          // Skip spaces with broken manifests
        }
      }

      spaces.value = diskSpaces.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    } catch {
      spaces.value = []
    }
  }

  const hasSpace = (spaceName: string) => {
    return spaces.value.some(space => space.name === spaceName)
  }

  const getSpace = (spaceName: string) => {
    return spaces.value.find(space => space.name === spaceName)
  }

  return {
    spaces,
    loading,
    loadSpaces,
    hasSpace,
    getSpace,
  }
}

/** Read disabled space IDs from marketplace localStorage state */
function getDisabledSpaceIds(): Set<string> {
  try {
    const raw = localStorage.getItem('construct:installed_spaces')
    if (!raw) return new Set()
    const items = JSON.parse(raw) as { id: string; enabled: boolean }[]
    return new Set(items.filter(s => s.enabled === false).map(s => s.id))
  } catch {
    return new Set()
  }
}

/** Convert a manifest from disk to SpaceConfig and register its theme */
function manifestToSpaceConfig(manifest: Record<string, unknown>): SpaceConfig {
  const id = (manifest.id as string) || (manifest.name as string)
  const nav = manifest.navigation as Record<string, unknown> | undefined
  const theme = manifest.theme as { color?: string; bg?: string } | undefined

  // Register theme for config/spaces.ts consumers (getSpace(), getRegisteredSpaceIds())
  registerSpaceTheme(id, {
    icon: (manifest.icon as string) || 'i-lucide-box',
    label: (manifest.name as string) || id,
    description: (manifest.description as string) || '',
    color: theme?.color || undefined,
    bg: theme?.bg || undefined,
  })

  return {
    name: id,
    displayName: (manifest.name as string) || id,
    description: (manifest.description as string) || '',
    icon: (manifest.icon as string) || 'i-lucide-box',
    pages: ((manifest.pages as SpacePage[]) || [{ path: '', label: 'Overview', default: true }]),
    toolbar: manifest.toolbar as SpaceToolbarItem[] | undefined,
    navigation: {
      label: (nav?.label as string) || (manifest.name as string) || id,
      icon: (nav?.icon as string) || (manifest.icon as string) || 'i-lucide-box',
      to: (nav?.to as string) || id,
      order: (nav?.order as number) || 100,
    },
    scope: (manifest.scope as SpaceConfig['scope']) || 'both',
    isInstalled: true,
    version: manifest.version as string,
    author: typeof manifest.author === 'object'
      ? (manifest.author as Record<string, string>)?.name
      : manifest.author as string,
    recommended: manifest.recommended as boolean,
    theme: manifest.theme as SpaceConfig['theme'],
  }
}
