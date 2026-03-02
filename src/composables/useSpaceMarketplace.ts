/**
 * Space Marketplace composable
 *
 * Fetches the space catalog from the registry (GitHub index or portal API).
 *
 * Install state is determined by what's on disk:
 *   - Dev mode: all spaces in src/spaces/ are "installed"
 *   - Production: spaces with manifest.json in ~/.construct/spaces/ are "installed"
 *
 * Does NOT use the Go backend (contextService) — that's for AI/auth/storage only.
 */

import { ref, computed } from 'vue'
import { appConfig } from '@/utils/config'

export interface RemoteSpace {
  id: string
  name: string
  display_name: string
  description: string
  icon: string
  version: string
  author: string
  category: string
  stars: number
  downloads: number
  updated_at: string
  recommended?: boolean
  permissions?: string[]
}

/** Shape returned by the spaces registry API or GitHub index */
interface RegistrySpace {
  id: string
  name: string
  description: string
  icon: string
  version: string
  scope: string
  author?: string
  recommended?: boolean
  downloads?: number
  hostApiVersion?: string
  repo?: string
  tarball?: string
  released_at?: string
  [key: string]: unknown
}

interface RegistryResponse {
  version: number
  updated?: string
  updated_at?: string
  spaces: RegistrySpace[]
}

function registryToRemote(s: RegistrySpace): RemoteSpace {
  return {
    id: s.id,
    name: s.id,
    display_name: s.name,
    description: s.description,
    icon: s.icon,
    version: s.version,
    author: s.author ?? 'Construct Team',
    category: s.scope,
    stars: 0,
    downloads: s.downloads ?? 0,
    updated_at: s.released_at ?? '',
    recommended: s.recommended,
  }
}

export interface InstalledSpace {
  id: string
  name: string
  display_name: string
  version: string
  enabled: boolean
  installed_at: string
  has_update: boolean
  latest_version?: string
}

const INSTALLED_STORAGE_KEY = 'construct:installed_spaces'

/** Read installed state from localStorage */
function readInstalledFromStorage(): InstalledSpace[] {
  try {
    const raw = localStorage.getItem(INSTALLED_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

/** Save installed state to localStorage */
function saveInstalledToStorage(spaces: InstalledSpace[]): void {
  try {
    localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify(spaces))
  } catch { /* ignore */ }
}

export function useSpaceMarketplace() {
  const installed = ref<InstalledSpace[]>([])
  const remote = ref<RemoteSpace[]>([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const activeCategory = ref('all')
  const error = ref<string | null>(null)

  // Filtered remote spaces based on search + category
  const filteredRemote = computed(() => {
    let results = remote.value
    if (activeCategory.value !== 'all') {
      results = results.filter(s => s.category === activeCategory.value)
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      results = results.filter(s =>
        s.display_name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q)
      )
    }
    return results
  })

  // Check if a remote space is already installed
  const isInstalled = (spaceId: string): boolean => {
    return installed.value.some(s => s.id === spaceId || s.name === spaceId)
  }

  // Check if an installed space has an update
  const hasUpdate = (spaceId: string): boolean => {
    return installed.value.some(s => (s.id === spaceId || s.name === spaceId) && s.has_update)
  }

  async function fetchRemote(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      // Try GitHub-hosted index first (always available, public)
      const indexRes = await fetch(appConfig.spacesIndexUrl)
      if (indexRes.ok) {
        const data: RegistryResponse = await indexRes.json()
        remote.value = (data.spaces || []).map(registryToRemote)
        return
      }
      // Fall back to portal API
      const res = await fetch(`${appConfig.spacesRegistryUrl}/api/registry`)
      const data: RegistryResponse = await res.json()
      remote.value = (data.spaces || []).map(registryToRemote)
    } catch {
      remote.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function searchRemote(query: string, category?: string): Promise<void> {
    if (remote.value.length === 0) {
      await fetchRemote()
    }
    if (query) searchQuery.value = query
    if (category) activeCategory.value = category
  }

  /**
   * Load installed spaces.
   * Dev mode: discovers all spaces in src/spaces/ via Vite glob.
   * Production: reads from localStorage + validates against disk.
   */
  async function fetchInstalled(): Promise<void> {
    if (import.meta.env.DEV) {
      // In dev, all local spaces are "installed"
      const configModules = import.meta.glob<{ default: Record<string, unknown> }>(
        '../spaces/*/space.config.ts',
        { eager: true }
      )

      const devInstalled: InstalledSpace[] = []
      for (const [, mod] of Object.entries(configModules)) {
        const config = mod.default
        if (config?.name) {
          devInstalled.push({
            id: config.name as string,
            name: config.name as string,
            display_name: (config.displayName as string) || (config.name as string),
            version: '0.0.0-dev',
            enabled: true,
            installed_at: new Date().toISOString(),
            has_update: false,
          })
        }
      }
      installed.value = devInstalled
      return
    }

    // Production: read from localStorage (fast) then validate
    installed.value = readInstalledFromStorage()
  }

  /**
   * Install a space.
   * Dev mode: no-op (spaces are already in src/spaces/).
   * Production: downloads tarball from registry and extracts to ~/.construct/spaces/.
   */
  async function install(spaceId: string): Promise<boolean> {
    error.value = null

    if (import.meta.env.DEV) {
      console.log(`[Marketplace] Dev mode — "${spaceId}" is already available in src/spaces/`)
      return true
    }

    try {
      console.log(`[Marketplace] Installing space: ${spaceId}`)

      // Find the space in the registry to get the tarball URL
      const registrySpace = await findRegistrySpace(spaceId)
      if (!registrySpace?.tarball) {
        error.value = `Space "${spaceId}" not found in registry`
        return false
      }

      // Download and extract via Tauri FS
      const tarballUrl = `https://raw.githubusercontent.com/construct-base/space-releases/main/${registrySpace.tarball}`
      await downloadAndExtract(spaceId, tarballUrl)

      // Add to installed list
      const now = new Date().toISOString()
      const newSpace: InstalledSpace = {
        id: spaceId,
        name: spaceId,
        display_name: registrySpace.name,
        version: registrySpace.version,
        enabled: true,
        installed_at: now,
        has_update: false,
      }

      const current = installed.value.filter(s => s.id !== spaceId)
      current.push(newSpace)
      installed.value = current
      saveInstalledToStorage(current)

      console.log(`[Marketplace] Installed ${spaceId} v${registrySpace.version}`)
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[Marketplace] Install failed for ${spaceId}:`, e)
      error.value = `Failed to install ${spaceId}: ${msg}`
      return false
    }
  }

  async function uninstall(spaceId: string): Promise<boolean> {
    error.value = null

    if (import.meta.env.DEV) {
      console.log(`[Marketplace] Dev mode — cannot uninstall bundled space "${spaceId}"`)
      return false
    }

    try {
      // Remove from disk
      const { remove, exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')
      const home = await homeDir()
      const spaceDir = `${home}/.construct/spaces/${spaceId}`

      if (await exists(spaceDir)) {
        await remove(spaceDir, { recursive: true })
      }

      // Remove from installed list
      const current = installed.value.filter(s => s.id !== spaceId)
      installed.value = current
      saveInstalledToStorage(current)

      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to uninstall space'
      return false
    }
  }

  async function update(spaceId: string): Promise<boolean> {
    // Uninstall then re-install to get latest version
    await uninstall(spaceId)
    return install(spaceId)
  }

  async function enable(spaceId: string): Promise<boolean> {
    const space = installed.value.find(s => s.id === spaceId)
    if (space) {
      space.enabled = true
      saveInstalledToStorage(installed.value)
    }
    return true
  }

  async function disable(spaceId: string): Promise<boolean> {
    const space = installed.value.find(s => s.id === spaceId)
    if (space) {
      space.enabled = false
      saveInstalledToStorage(installed.value)
    }
    return true
  }

  async function checkUpdates(): Promise<void> {
    if (remote.value.length === 0) await fetchRemote()

    let updates = 0
    for (const space of installed.value) {
      const remoteVer = remote.value.find(r => r.id === space.id)
      if (remoteVer && remoteVer.version !== space.version) {
        space.has_update = true
        space.latest_version = remoteVer.version
        updates++
      }
    }
    if (updates > 0) {
      saveInstalledToStorage(installed.value)
    }
  }

  return {
    // State
    installed,
    remote,
    isLoading,
    searchQuery,
    activeCategory,
    error,

    // Computed
    filteredRemote,

    // Methods
    fetchRemote,
    searchRemote,
    fetchInstalled,
    install,
    uninstall,
    update,
    enable,
    disable,
    checkUpdates,
    isInstalled,
    hasUpdate,
  }
}

/** Find a space entry in the registry index */
async function findRegistrySpace(spaceId: string): Promise<RegistrySpace | null> {
  try {
    const res = await fetch(appConfig.spacesIndexUrl)
    if (!res.ok) return null
    const data: RegistryResponse = await res.json()
    return data.spaces?.find(s => s.id === spaceId) ?? null
  } catch {
    return null
  }
}

/** Download a tarball and extract it to ~/.construct/spaces/{id}/ */
async function downloadAndExtract(spaceId: string, tarballUrl: string): Promise<void> {
  const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')
  const { homeDir } = await import('@tauri-apps/api/path')
  const { Command } = await import('@tauri-apps/plugin-shell')

  const home = await homeDir()
  const spacesDir = `${home}/.construct/spaces`
  const spaceDir = `${spacesDir}/${spaceId}`

  // Ensure directory exists
  if (!(await exists(spacesDir))) {
    await mkdir(spacesDir, { recursive: true })
  }
  if (!(await exists(spaceDir))) {
    await mkdir(spaceDir, { recursive: true })
  }

  // Download tarball
  const response = await fetch(tarballUrl)
  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`)
  }
  const data = new Uint8Array(await response.arrayBuffer())
  const tarballPath = `${spaceDir}/space.tar.gz`
  await writeFile(tarballPath, data)

  // Extract using tar command
  const cmd = Command.create('tar', ['-xzf', tarballPath, '-C', spaceDir])
  const output = await cmd.execute()
  if (output.code !== 0) {
    throw new Error(`tar extract failed: ${output.stderr}`)
  }
}
