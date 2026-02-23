import { defineStore } from 'pinia'
import type { Notification, UpdateNotificationRequest } from '~/types/notification'
import type { PaginatedResponse } from '~/types/common'

interface NotificationsState {
  notifications: Notification[]
  loading: boolean
  markingAllRead: boolean
  error: string | null
  hasMore: boolean
  page: number
  limit: number
}

export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    notifications: [],
    loading: false,
    markingAllRead: false,
    error: null,
    hasMore: true,
    page: 1,
    limit: 20,
  }),

  getters: {
    unreadCount: (state) => state.notifications.filter(n => !n.read).length,
    unreadNotifications: (state) => state.notifications.filter(n => !n.read),
    recentNotifications: (state) => state.notifications.slice(0, 10),
    hasUnread: (state) => state.notifications.some(n => !n.read),
  },

  actions: {
    // Fetch notifications from API
    async fetchNotifications(reset = false) {
      if (reset) {
        this.page = 1
        this.hasMore = true
        this.notifications = []
      }

      if (!this.hasMore || this.loading) return

      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<PaginatedResponse<Notification>>(
          `/notifications?page=${this.page}&limit=${this.limit}&sort=created_at&order=desc`
        )

        if (reset) {
          this.notifications = response.data
        } else {
          this.notifications.push(...response.data)
        }

        this.hasMore = this.page < response.pagination.total_pages
        this.page++
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch notifications'
        console.error('Failed to fetch notifications:', error)
      } finally {
        this.loading = false
      }
    },

    // Mark a single notification as read
    async markAsRead(id: number) {
      const notification = this.notifications.find(n => n.id === id)
      if (!notification || notification.read) return

      // Optimistic update
      notification.read = true
      notification.read_at = new Date().toISOString()

      try {
        const api = useApi()
        const update: UpdateNotificationRequest = {
          read: true,
          read_at: notification.read_at,
        }
        await api.put(`/notifications/${id}`, update)
      } catch (error) {
        // Rollback on error
        notification.read = false
        notification.read_at = null
        this.error = error instanceof Error ? error.message : 'Failed to mark notification as read'
        console.error('Failed to mark notification as read:', error)
      }
    },

    // Mark all notifications as read
    async markAllAsRead() {
      if (this.markingAllRead) return

      const unread = this.notifications.filter(n => !n.read)
      if (unread.length === 0) return

      this.markingAllRead = true

      // Optimistic update
      const readAt = new Date().toISOString()
      const previousStates = unread.map(n => ({ id: n.id, read: n.read, read_at: n.read_at }))
      unread.forEach(n => {
        n.read = true
        n.read_at = readAt
      })

      try {
        const api = useApi()
        // Mark each notification as read (batch endpoint could be added to backend)
        await Promise.all(
          previousStates.map(({ id }) =>
            api.put(`/notifications/${id}`, { read: true, read_at: readAt })
          )
        )
      } catch (error) {
        // Rollback on error
        previousStates.forEach(({ id, read, read_at }) => {
          const n = this.notifications.find(n => n.id === id)
          if (n) {
            n.read = read
            n.read_at = read_at
          }
        })
        this.error = error instanceof Error ? error.message : 'Failed to mark all as read'
        console.error('Failed to mark all as read:', error)
      } finally {
        this.markingAllRead = false
      }
    },

    // Delete a notification
    async deleteNotification(id: number) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index === -1) return

      // Optimistic delete — clone the item and use filter to avoid index-shift bugs
      // when multiple rapid deletes are in flight concurrently.
      const removed: Notification = { ...this.notifications[index] } as Notification
      this.notifications = this.notifications.filter(n => n.id !== id)

      try {
        const api = useApi()
        await api.delete(`/notifications/${id}`)
      } catch (error) {
        // Rollback on error — re-insert only if not already present (another call may have added it back)
        if (!this.notifications.find(n => n.id === id)) {
          this.notifications.push(removed)
        }
        this.error = error instanceof Error ? error.message : 'Failed to delete notification'
        console.error('Failed to delete notification:', error)
      }
    },

    // Handle new notification from WebSocket
    handleNewNotification(notification: Notification) {
      // Add to front of list, avoid duplicates
      if (!this.notifications.find(n => n.id === notification.id)) {
        this.notifications.unshift(notification)
      }
    },

    // Handle notification update from WebSocket
    handleNotificationUpdated(notification: Notification) {
      const index = this.notifications.findIndex(n => n.id === notification.id)
      if (index !== -1) {
        this.notifications[index] = notification
      }
    },

    // Handle notification deletion from WebSocket
    handleNotificationDeleted(id: number) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index !== -1) {
        this.notifications.splice(index, 1)
      }
    },

    clearError() {
      this.error = null
    },

    reset() {
      this.notifications = []
      this.loading = false
      this.markingAllRead = false
      this.error = null
      this.hasMore = true
      this.page = 1
    },
  },
})
