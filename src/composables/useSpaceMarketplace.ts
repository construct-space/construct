/**
 * Space Marketplace composable
 *
 * Fetches the space catalog from the registry (portal API primary, GitHub index fallback).
 *
 * Install state is determined by what's on disk:
 *   - Spaces with manifest.json in ~/.construct/spaces/ are "installed"
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
const FIRST_LAUNCH_KEY = 'construct:first_launch_done'

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
      // Try portal API first (primary)
      const portalData = await fetchJson<RegistryResponse>(`${appConfig.spacesRegistryUrl}/registry`)
      if (portalData?.spaces?.length) {
        remote.value = portalData.spaces.map(registryToRemote)
        return
      }

      // Fall back to GitHub-hosted index
      const ghData = await fetchJson<RegistryResponse>(appConfig.spacesIndexUrl)
      if (ghData?.spaces?.length) {
        remote.value = ghData.spaces.map(registryToRemote)
        return
      }
      remote.value = []
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
   * Load installed spaces by scanning ~/.construct/spaces/ on disk,
   * then merging any marketplace metadata from localStorage.
   */
  async function fetchInstalled(): Promise<void> {
    try {
      const { readTextFile, readDir, exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')

      const home = await homeDir()
      const spacesDir = `${home}/.construct/spaces`

      if (!(await exists(spacesDir))) {
        installed.value = []
        return
      }

      const entries = await readDir(spacesDir)
      const storedMeta = readInstalledFromStorage()
      const metaMap = new Map(storedMeta.map(s => [s.id, s]))
      const diskSpaces: InstalledSpace[] = []

      for (const entry of entries) {
        if (!entry.isDirectory || !entry.name) continue
        const manifestPath = `${spacesDir}/${entry.name}/manifest.json`
        if (!(await exists(manifestPath))) continue

        try {
          const raw = await readTextFile(manifestPath)
          const manifest = JSON.parse(raw)
          const id = manifest.id || entry.name
          const existing = metaMap.get(id)

          diskSpaces.push({
            id,
            name: id,
            display_name: manifest.name || id,
            version: manifest.version || '0.0.0',
            enabled: existing?.enabled ?? true,
            installed_at: existing?.installed_at || '',
            has_update: existing?.has_update ?? false,
            latest_version: existing?.latest_version,
          })
        } catch {
          // Skip spaces with broken manifests
        }
      }

      installed.value = diskSpaces
      saveInstalledToStorage(diskSpaces)
    } catch {
      // Fallback to localStorage if disk scan fails
      installed.value = readInstalledFromStorage()
    }
  }

  /**
   * Install a space — downloads tarball from registry and extracts to ~/.construct/spaces/.
   */
  async function install(spaceId: string): Promise<boolean> {
    error.value = null

    try {
      console.log(`[Marketplace] Installing space: ${spaceId}`)

      // Find the space in the registry to get the tarball URL
      const registrySpace = await findRegistrySpace(spaceId)
      if (!registrySpace?.tarball) {
        error.value = `Space "${spaceId}" not found in registry`
        return false
      }

      // Download and extract via Tauri FS
      // tarball field is a full URL (GitHub Release asset)
      const tarballUrl = registrySpace.tarball.startsWith('http')
        ? registrySpace.tarball
        : `https://raw.githubusercontent.com/construct-space/space-releases/main/${registrySpace.tarball}`
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

      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent('construct:spaces-changed'))

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

      // Remove from pinned sidebar
      try {
        const { usePinnedStore } = await import('@/stores/pinned')
        const pinnedStore = usePinnedStore()
        if (pinnedStore.isPinned(spaceId)) {
          await pinnedStore.removePin(spaceId)
        }
      } catch { /* ignore */ }

      // Notify sidebar to refresh
      window.dispatchEvent(new CustomEvent('construct:spaces-changed'))

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
      window.dispatchEvent(new CustomEvent('construct:spaces-changed'))
    }
    return true
  }

  async function disable(spaceId: string): Promise<boolean> {
    const space = installed.value.find(s => s.id === spaceId)
    if (space) {
      space.enabled = false
      saveInstalledToStorage(installed.value)

      // Remove from pinned sidebar when disabled
      try {
        const { usePinnedStore } = await import('@/stores/pinned')
        const pinnedStore = usePinnedStore()
        // Remove all pins for this space (global and project-scoped)
        const spacePins = pinnedStore.items.filter(
          p => p.type === 'space' && p.metadata?.spaceId === spaceId
        )
        for (const pin of spacePins) {
          await pinnedStore.removePin(pin.id)
        }
      } catch { /* ignore */ }

      window.dispatchEvent(new CustomEvent('construct:spaces-changed'))
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

/**
 * Auto-install recommended spaces on first launch.
 *
 * 1. Check if ~/.construct/spaces/ is empty or doesn't exist
 * 2. If empty, fetch registry
 * 3. Filter spaces where recommended === true
 * 4. Install each recommended space
 * 5. Mark first-launch complete in localStorage
 */
export async function autoInstallRecommended(): Promise<void> {
  // Skip if already done
  if (localStorage.getItem(FIRST_LAUNCH_KEY)) {
    return
  }

  try {
    // Check if spaces dir is empty
    const { readDir, exists } = await import('@tauri-apps/plugin-fs')
    const { homeDir } = await import('@tauri-apps/api/path')

    const home = await homeDir()
    const spacesDir = `${home}/.construct/spaces`

    let isEmpty = true
    if (await exists(spacesDir)) {
      const entries = await readDir(spacesDir)
      isEmpty = entries.filter(e => e.isDirectory).length === 0
    }

    if (!isEmpty) {
      // Spaces already exist — mark as done and skip
      localStorage.setItem(FIRST_LAUNCH_KEY, 'true')
      return
    }

    console.log('[Marketplace] First launch detected — auto-installing recommended spaces...')

    // Fetch registry (portal first, GitHub fallback)
    let registrySpaces: RegistrySpace[] = []
    const portalData = await fetchJson<RegistryResponse>(`${appConfig.spacesRegistryUrl}/registry`)
    if (portalData?.spaces?.length) {
      registrySpaces = portalData.spaces
    } else {
      const ghData = await fetchJson<RegistryResponse>(appConfig.spacesIndexUrl)
      registrySpaces = ghData?.spaces || []
    }

    // Filter recommended and install
    const recommended = registrySpaces.filter(s => s.recommended)
    if (recommended.length === 0) {
      console.log('[Marketplace] No recommended spaces found in registry')
      localStorage.setItem(FIRST_LAUNCH_KEY, 'true')
      return
    }

    const marketplace = useSpaceMarketplace()
    for (const space of recommended) {
      try {
        await marketplace.install(space.id)
        console.log(`[Marketplace] Auto-installed: ${space.id}`)
      } catch (err) {
        console.warn(`[Marketplace] Failed to auto-install ${space.id}:`, err)
      }
    }

    localStorage.setItem(FIRST_LAUNCH_KEY, 'true')
    console.log(`[Marketplace] First launch complete — installed ${recommended.length} recommended spaces`)
  } catch (err) {
    console.error('[Marketplace] Auto-install failed:', err)
    // Don't mark as done so it retries next launch
  }
}

/** Fetch JSON via Tauri shell curl (bypasses CORS) with browser fetch fallback */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const { Command } = await import('@tauri-apps/plugin-shell')
    const cmd = Command.create('curl', ['-sfL', '--max-time', '15', url])
    const output = await cmd.execute()
    if (output.code !== 0) return null
    return JSON.parse(output.stdout) as T
  } catch {
    // Fallback to browser fetch (works when CORS allows it)
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.json() as T
    } catch {
      return null
    }
  }
}

/** Find a space entry in the registry index (must include tarball for install) */
async function findRegistrySpace(spaceId: string): Promise<RegistrySpace | null> {
  // Try portal API first
  const portalData = await fetchJson<RegistryResponse>(`${appConfig.spacesRegistryUrl}/registry`)
  if (portalData) {
    const found = portalData.spaces?.find(s => s.id === spaceId)
    if (found?.tarball) return found
  }

  // Fallback to GitHub index (has tarball paths)
  const ghData = await fetchJson<RegistryResponse>(appConfig.spacesIndexUrl)
  return ghData?.spaces?.find(s => s.id === spaceId) ?? null
}

/** Download a tarball and extract it to ~/.construct/spaces/{id}/ */
async function downloadAndExtract(spaceId: string, tarballUrl: string): Promise<void> {
  const { mkdir, exists } = await import('@tauri-apps/plugin-fs')
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

  // Download tarball via curl (bypasses CORS for GitHub release redirects)
  const tarballPath = `${spaceDir}/space.tar.gz`
  const dlCmd = Command.create('curl', ['-sfL', '--max-time', '60', '-o', tarballPath, tarballUrl])
  const dlOutput = await dlCmd.execute()
  if (dlOutput.code !== 0) {
    throw new Error(`Failed to download: curl exit ${dlOutput.code} – ${dlOutput.stderr}`)
  }

  // Extract using tar command
  const cmd = Command.create('tar', ['-xzf', tarballPath, '-C', spaceDir])
  const output = await cmd.execute()
  if (output.code !== 0) {
    throw new Error(`tar extract failed: ${output.stderr}`)
  }

  // Tarballs contain files in dist/ subdirectory — flatten to space root
  const { readDir, rename, remove } = await import('@tauri-apps/plugin-fs')
  const distDir = `${spaceDir}/dist`
  if (await exists(distDir)) {
    const entries = await readDir(distDir)
    for (const entry of entries) {
      if (!entry.name) continue
      await rename(`${distDir}/${entry.name}`, `${spaceDir}/${entry.name}`)
    }
    await remove(distDir, { recursive: true })
  }
}
