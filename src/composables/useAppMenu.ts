/**
 * useAppMenu - Manages the native application menu based on active space
 * Updates the Tauri menu when navigating between spaces
 * Handles menu events from native menus
 */
import type { UnlistenFn } from '@tauri-apps/api/event'

// Track current space to avoid unnecessary updates
const currentMenuSpace = ref<string | null>(null)

// Check if running in Tauri
const isTauri = () => !!(window as unknown as { __TAURI__?: unknown }).__TAURI__

// Store unlisteners for cleanup
const unlisteners: UnlistenFn[] = []

export function useAppMenu() {
  const route = useRoute()
  const router = useRouter()

  // Determine space from route
  const activeSpace = computed(() => {
    const path = route.path
    if (path.includes('/code')) return 'code'
    if (path.includes('/ui')) return 'ui'
    if (path.includes('/kanban')) return 'kanban'
    if (path.includes('/git')) return 'git'
    if (path.includes('/browser')) return 'browser'
    if (path.includes('/terminal')) return 'terminal'
    return 'default'
  })

  // Update native menu when space changes
  const updateMenu = async (space: string) => {
    if (!isTauri()) return
    if (currentMenuSpace.value === space) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_app_menu', { space })
      currentMenuSpace.value = space
    } catch {
      // Silently fail if not in Tauri or command not available
    }
  }

  // Setup menu event listeners
  const setupMenuListeners = async () => {
    if (!isTauri()) return

    const { listen } = await import('@tauri-apps/api/event')

    unlisteners.push(await listen('menu:check-updates', () => {
      router.push('/app/settings/updates')
    }))

    unlisteners.push(await listen('menu:settings', () => {
      router.push('/app/settings')
    }))

    unlisteners.push(await listen('menu:projects', () => {
      router.push('/app')
    }))

    unlisteners.push(await listen('menu:new-project', () => {
      router.push('/app/code')
    }))

    unlisteners.push(await listen('menu:about', () => {
      router.push('/app/settings/about')
    }))

    unlisteners.push(await listen('menu:keyboard-shortcuts', () => {
      router.push('/app/settings/shortcuts')
    }))

    unlisteners.push(await listen('menu:toggle-sidebar', () => {
      const sidebar = useSidebar()
      sidebar.setPanel(sidebar.state.panel === 'main' ? 'space' : 'main')
    }))

    unlisteners.push(await listen('menu:toggle-assistant', () => {
      const assistant = useAssistant()
      assistant.toggle()
    }))
  }

  // Cleanup listeners
  const cleanup = () => {
    unlisteners.forEach((unlisten) => unlisten())
    unlisteners.length = 0
  }

  // Watch for space changes (only on client)
  onMounted(() => {
    updateMenu(activeSpace.value)
    setupMenuListeners()

    watch(activeSpace, (space) => {
      updateMenu(space)
    })
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    activeSpace,
    updateMenu
  }
}
