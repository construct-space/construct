import { defineStore } from 'pinia'
import type { Event, CreateEventRequest, UpdateEventRequest } from '~/types/event'

export const useEventsStore = defineStore('events', {
  state: () => ({
    items: [] as Event[],
    currentItem: null as Event | null,
    currentProjectId: null as number | null,
    currentCompanyId: null as number | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    // Get events sorted by start time
    sortedEvents: (state) => {
      return [...state.items].sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    },

    // Get events for a specific date (using local timezone, not UTC)
    eventsByDate: (state) => (date: Date) => {
      // Format date in local timezone for comparison
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      return state.items.filter((event) => {
        const eventStart = event.start_time.split('T')[0] || ''
        const eventEnd = event.end_time.split('T')[0] || ''
        return dateStr >= eventStart && dateStr <= eventEnd
      })
    }
  },

  actions: {
    // Company-level events
    async fetchCompanyEvents(companyId: number) {
      this.loading = true
      this.currentCompanyId = companyId
      this.currentProjectId = null
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<{ data: Event[] }>(`/company-events/${companyId}`)
        this.items = response.data || []
        return this.items
      } catch (error) {
        this.error = (error as Error).message
        return []
      } finally {
        this.loading = false
      }
    },

    async createCompanyEvent(companyId: number, data: CreateEventRequest) {
      try {
        const api = useApi()
        const event = await api.post<Event>(`/company-events/${companyId}`, data)
        this.items.push(event)
        return { success: true, data: event }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    },

    // Project-level events
    async fetchProjectEvents(projectId: number) {
      this.loading = true
      this.currentProjectId = projectId
      this.currentCompanyId = null
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<{ data: Event[] }>(`/project-events/${projectId}`)
        this.items = response.data || []
        return this.items
      } catch (error) {
        this.error = (error as Error).message
        return []
      } finally {
        this.loading = false
      }
    },

    async createProjectEvent(projectId: number, data: CreateEventRequest) {
      try {
        const api = useApi()
        const event = await api.post<Event>(`/project-events/${projectId}`, data)
        this.items.push(event)
        return { success: true, data: event }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    },

    // Legacy method - now uses current context (company or project)
    async createEvent(data: CreateEventRequest) {
      if (this.currentCompanyId) {
        return this.createCompanyEvent(this.currentCompanyId, data)
      }
      if (this.currentProjectId) {
        return this.createProjectEvent(this.currentProjectId, data)
      }
      return { success: false, error: 'No company or project selected' }
    },

    async updateEvent(id: number, data: UpdateEventRequest) {
      const index = this.items.findIndex(i => i.id === id)
      const backup = index !== -1 ? { ...this.items[index] } : null

      // Optimistic update
      if (index !== -1) {
        this.items[index] = { ...this.items[index], ...data } as Event
      }

      try {
        const api = useApi()
        const updated = await api.put<Event>(`/events/${id}`, data)
        if (index !== -1) {
          this.items[index] = updated
        }
        return { success: true, data: updated }
      } catch (error) {
        // Rollback
        if (index !== -1 && backup) {
          this.items[index] = backup as Event
        }
        return { success: false, error: (error as Error).message }
      }
    },

    async deleteEvent(id: number) {
      const index = this.items.findIndex(i => i.id === id)
      if (index === -1) {
        return { success: false, error: 'Event not found' }
      }

      // Snapshot the entire array so rollback restores original order
      const snapshot = [...this.items]

      // Optimistic delete
      this.items.splice(index, 1)

      try {
        const api = useApi()
        await api.delete(`/events/${id}`)
        return { success: true }
      } catch (error) {
        // Rollback — restore the full snapshot to preserve original order
        this.items = snapshot
        return { success: false, error: (error as Error).message }
      }
    },

    clearEvents() {
      this.items = []
      this.currentProjectId = null
      this.currentCompanyId = null
      this.error = null
    }
  }
})
