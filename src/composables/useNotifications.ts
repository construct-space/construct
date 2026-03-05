/**
 * useNotifications - Manages notification WebSocket connection and real-time updates
 * Connects to user-specific notification room for real-time delivery
 */

import { appConfig } from '@/utils/config'
import type { Notification, NotificationWSMessage } from '~/types/notification'

let notificationsInstance: ReturnType<typeof createNotificationsComposable> | null = null

function createNotificationsComposable() {
  const authStore = useAuthStore()
  const store = useNotificationsStore()

  const API_BASE = appConfig.apiBase

  // WebSocket state
  const connected = ref(false)
  const serverAvailable = ref(true)
  const wsEndpointAvailable = ref(true)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let healthCheckTimer: ReturnType<typeof setTimeout> | null = null
  let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let initialized = false
  const RECONNECT_DELAY = 3000
  const MAX_RECONNECT_DELAY = 30000
  const HEALTH_CHECK_INTERVAL = 60000
  const CONNECT_TIMEOUT = 5000

  // Build WebSocket URL
  function getWebSocketUrl(): string | null {
    const user = authStore.user
    const token = authStore.token
    if (!user || !token) return null

    const wsUrl = API_BASE.replace(/\/api\/?$/, '').replace('http', 'ws')
    const room = `notifications:${user.id}`
    const params = new URLSearchParams({
      room,
      id: String(user.id),
      user_id: String(user.id),
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      nickname: user.first_name || user.email || 'User',
      token: token,
    })

    return `${wsUrl}/api/ws?${params}`
  }

  // Check if API server is reachable using the /health endpoint
  async function checkServerHealth(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const baseUrl = API_BASE.replace(/\/api$/, '')
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timeoutId)
      return response?.ok ?? false
    } catch {
      return false
    }
  }

  // Schedule health check when server is unavailable
  function scheduleHealthCheck() {
    if (healthCheckTimer) return

    healthCheckTimer = setTimeout(async () => {
      healthCheckTimer = null
      const isHealthy = await checkServerHealth()

      if (isHealthy) {
        serverAvailable.value = true
        connect()
      } else {
        scheduleHealthCheck()
      }
    }, HEALTH_CHECK_INTERVAL)
  }

  // Connect to WebSocket
  async function connect() {
    // DEV MODE: Skip WebSocket — requires remote server with JWT auth
    if (import.meta.env.DEV) {
      return
    }

    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    const url = getWebSocketUrl()
    if (!url) {
      return
    }

    if (!serverAvailable.value) {
      scheduleHealthCheck()
      return
    }

    if (reconnectAttempts === 0) {
      const isHealthy = await checkServerHealth()
      if (!isHealthy) {
        serverAvailable.value = false
        scheduleHealthCheck()
        return
      }
    }

    try {
      ws = new WebSocket(url)
      const socket = ws

      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer)
        connectTimeoutTimer = null
      }
      connectTimeoutTimer = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      }, CONNECT_TIMEOUT)

      ws.onopen = () => {
        if (connectTimeoutTimer) {
          clearTimeout(connectTimeoutTimer)
          connectTimeoutTimer = null
        }
        connected.value = true
        serverAvailable.value = true
        wsEndpointAvailable.value = true
        reconnectAttempts = 0
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as NotificationWSMessage
          handleMessage(msg)
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = (event) => {
        if (connectTimeoutTimer) {
          clearTimeout(connectTimeoutTimer)
          connectTimeoutTimer = null
        }
        ws = null
        connected.value = false
        if (!event.wasClean) wsEndpointAvailable.value = true
        attemptReconnect()
      }

      ws.onerror = () => {
        if (ws?.readyState !== WebSocket.CLOSED) {
          ws?.close()
        }
      }
    } catch {
      serverAvailable.value = false
      scheduleHealthCheck()
    }
  }

  // Handle incoming WebSocket messages
  function handleMessage(msg: NotificationWSMessage) {
    switch (msg.type) {
      case 'notification.new':
        store.handleNewNotification(msg.content as Notification)
        showNotificationToast(msg.content as Notification)
        break

      case 'notification.updated':
        store.handleNotificationUpdated(msg.content as Notification)
        break

      case 'notification.deleted': {
        const { id } = msg.content as { id: number }
        store.handleNotificationDeleted(id)
        break
      }

      default:
        break
    }
  }

  // Show toast notification for new notifications
  function showNotificationToast(notification: Notification) {
    // Use our custom toast composable (replaces Nuxt UI useToast)
    try {
      const toast = useToast()
      toast.add({
        title: notification.title,
        description: notification.body,
      })
    } catch {
      console.log(`[Notification] ${notification.title}: ${notification.body}`)
    }

    // Fire native OS notification when app is not focused
    if (document.visibilityState === 'hidden') {
      fireNativeNotification(notification.title, notification.body)
    }
  }

  async function fireNativeNotification(title: string, body: string) {
    try {
      const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
      let permitted = await isPermissionGranted()
      if (!permitted) {
        const result = await requestPermission()
        permitted = result === 'granted'
      }
      if (permitted) {
        sendNotification({ title, body })
      }
    } catch {
      // Not in Tauri or plugin unavailable
    }
  }

  // Attempt to reconnect
  function attemptReconnect() {
    if (reconnectTimer) return

    if (!authStore.isAuthenticated) return

    if (!serverAvailable.value) {
      scheduleHealthCheck()
      return
    }

    reconnectAttempts++
    const delay = Math.min(RECONNECT_DELAY * reconnectAttempts, MAX_RECONNECT_DELAY)

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  // Disconnect WebSocket
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (healthCheckTimer) {
      clearTimeout(healthCheckTimer)
      healthCheckTimer = null
    }

    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer)
      connectTimeoutTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    connected.value = false
    serverAvailable.value = true
    wsEndpointAvailable.value = true
    reconnectAttempts = 0
  }

  // Initialize - connect and fetch initial notifications
  async function init() {
    if (!authStore.isAuthenticated) return

    if (!initialized) {
      await store.fetchNotifications(true)
      initialized = true
    }

    connect()
  }

  // Cleanup
  function cleanup() {
    disconnect()
    initialized = false
    store.reset()
  }

  // Watch for auth changes
  watch(() => authStore.isAuthenticated, (isAuth) => {
    if (isAuth) {
      init()
    } else {
      cleanup()
    }
  }, { immediate: true })

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  // Manual retry
  function retry() {
    serverAvailable.value = true
    wsEndpointAvailable.value = true
    reconnectAttempts = 0
    connect()
  }

  // Connection status for UI
  const connectionStatus = computed(() => {
    if (connected.value) return 'connected'
    if (!serverAvailable.value) return 'server-offline'
    if (!wsEndpointAvailable.value) return 'ws-unavailable'
    return 'disconnected'
  })

  return {
    // State
    connected,
    serverAvailable,
    wsEndpointAvailable,
    connectionStatus,
    notifications: computed(() => store.notifications),
    unreadCount: computed(() => store.unreadCount),
    hasUnread: computed(() => store.hasUnread),
    loading: computed(() => store.loading),
    error: computed(() => store.error),

    // Actions
    init,
    connect,
    disconnect,
    cleanup,
    retry,
    fetchNotifications: store.fetchNotifications,
    markAsRead: store.markAsRead,
    markAllAsRead: store.markAllAsRead,
    deleteNotification: store.deleteNotification,
  }
}

export function useNotifications() {
  if (!notificationsInstance) {
    notificationsInstance = createNotificationsComposable()
  }
  return notificationsInstance
}
