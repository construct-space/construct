/**
 * Composable for loading and managing spaces.
 *
 * Dev mode:  loads space configs from src/spaces/{name}/space.config.ts via Vite glob
 * Prod mode: scans ~/.construct/spaces/ for installed manifests via Tauri FS
 *
 * The Go backend (contextService) is NOT used for spaces.
 */

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
 * Dev mode: loads from src/spaces/{name}/space.config.ts via Vite glob.
 * Production: scans ~/.construct/spaces/ for manifest.json files.
 */
export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])
  const loading = ref(false)

  const loadSpaces = async () => {
    loading.value = true
    try {
      if (import.meta.env.DEV) {
        // In dev, try Vite glob first, then also scan disk for installed spaces
        await loadFromDevConfigs()
        // Merge in disk-installed spaces not found via Vite
        await mergeFromDisk()
      } else {
        await loadFromDisk()
      }
    } catch (err) {
      console.error('[useSpaces] Failed to load spaces:', err)
      spaces.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Dev mode: load space configs from src/spaces/{name}/space.config.ts
   */
  const loadFromDevConfigs = async () => {
    const configModules = import.meta.glob<{ default: SpaceConfig }>(
      '../spaces/*/space.config.ts',
      { eager: true }
    )

    const devSpaces: SpaceConfig[] = []
    for (const [, mod] of Object.entries(configModules)) {
      const config = mod.default
      if (config?.name) {
        devSpaces.push({
          ...config,
          isInstalled: true,
          version: '0.0.0-dev',
        })
      }
    }

    spaces.value = devSpaces.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
  }

  /**
   * Production mode: scan ~/.construct/spaces/ for installed manifests.
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

      const entries = await readDir(spacesDir)
      const prodSpaces: SpaceConfig[] = []

      for (const entry of entries) {
        if (!entry.isDirectory) continue
        const manifestPath = `${spacesDir}/${entry.name}/manifest.json`
        if (!(await exists(manifestPath))) continue

        try {
          const manifestJson = await readTextFile(manifestPath)
          const manifest = JSON.parse(manifestJson)
          prodSpaces.push(manifestToSpaceConfig(manifest))
        } catch {
          // Skip spaces with broken manifests
        }
      }

      spaces.value = prodSpaces.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    } catch {
      spaces.value = []
    }
  }

  /**
   * Dev mode: merge in spaces installed to disk that weren't found via Vite glob.
   */
  const mergeFromDisk = async () => {
    try {
      const { readTextFile, readDir, exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')

      const home = await homeDir()
      const spacesDir = `${home}/.construct/spaces`

      if (!(await exists(spacesDir))) return

      const entries = await readDir(spacesDir)
      const existingNames = new Set(spaces.value.map(s => s.name))

      for (const entry of entries) {
        if (!entry.isDirectory || !entry.name) continue
        if (existingNames.has(entry.name)) continue

        const manifestPath = `${spacesDir}/${entry.name}/manifest.json`
        if (!(await exists(manifestPath))) continue

        try {
          const manifestJson = await readTextFile(manifestPath)
          const manifest = JSON.parse(manifestJson)
          spaces.value.push(manifestToSpaceConfig(manifest))
        } catch { /* skip broken manifests */ }
      }

      spaces.value = spaces.value.sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    } catch { /* Tauri FS not available in browser dev */ }
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

/** Convert a manifest from disk to SpaceConfig */
function manifestToSpaceConfig(manifest: Record<string, unknown>): SpaceConfig {
  const id = (manifest.id as string) || (manifest.name as string)
  const nav = manifest.navigation as Record<string, unknown> | undefined

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
