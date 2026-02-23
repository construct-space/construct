/**
 * Space Marketplace composable
 *
 * All marketplace operations via Tauri invoke (matching the Go backend from Phase 1).
 * Methods gracefully return empty results until the Go backend ships.
 */

import { ref, computed } from 'vue'
import { useContextService } from '@/composables/useContextService'

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
  permissions?: string[]
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

export function useSpaceMarketplace() {
  const installed = ref<InstalledSpace[]>([])
  const remote = ref<RemoteSpace[]>([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const activeCategory = ref('all')
  const error = ref<string | null>(null)

  const contextService = useContextService()

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
      const result = await contextService.sendRequest<{ spaces: RemoteSpace[] }>('spaces.list_remote')
      remote.value = result?.spaces || []
    } catch {
      // Go backend not ready — return empty
      remote.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function searchRemote(query: string, category?: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const result = await contextService.sendRequest<{ spaces: RemoteSpace[] }>('spaces.search', {
        query,
        category: category || activeCategory.value,
      })
      remote.value = result?.spaces || []
    } catch {
      remote.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function fetchInstalled(): Promise<void> {
    try {
      const result = await contextService.sendRequest<{ spaces: InstalledSpace[] }>('spaces.list_installed')
      installed.value = result?.spaces || []
    } catch {
      installed.value = []
    }
  }

  async function install(spaceId: string): Promise<boolean> {
    error.value = null
    try {
      await contextService.sendRequest('spaces.install', { space_id: spaceId })
      await fetchInstalled()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to install space'
      return false
    }
  }

  async function uninstall(spaceId: string): Promise<boolean> {
    error.value = null
    try {
      await contextService.sendRequest('spaces.uninstall', { space_id: spaceId })
      await fetchInstalled()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to uninstall space'
      return false
    }
  }

  async function update(spaceId: string): Promise<boolean> {
    error.value = null
    try {
      await contextService.sendRequest('spaces.update', { space_id: spaceId })
      await fetchInstalled()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update space'
      return false
    }
  }

  async function enable(spaceId: string): Promise<boolean> {
    try {
      await contextService.sendRequest('spaces.enable', { space_id: spaceId })
      await fetchInstalled()
      return true
    } catch {
      return false
    }
  }

  async function disable(spaceId: string): Promise<boolean> {
    try {
      await contextService.sendRequest('spaces.disable', { space_id: spaceId })
      await fetchInstalled()
      return true
    } catch {
      return false
    }
  }

  async function checkUpdates(): Promise<void> {
    try {
      await contextService.sendRequest('spaces.check_updates')
      await fetchInstalled()
    } catch {
      // Silently fail
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
