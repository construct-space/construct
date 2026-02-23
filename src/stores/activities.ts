import { defineStore } from 'pinia'
import type { Activity } from '~/types/activity'

interface ActivitiesState {
  activities: Activity[]
  loading: boolean
  fetchingByUser: boolean
  fetchingByEntity: boolean
  error: string | null
}

export const useActivitiesStore = defineStore('activities', {
  state: (): ActivitiesState => ({
    activities: [],
    loading: false,
    fetchingByUser: false,
    fetchingByEntity: false,
    error: null,
  }),

  getters: {
    recentActivities: (state) => state.activities.slice(0, 10),
  },

  actions: {
    async fetchRecentActivities(limit = 10) {
      if (this.loading) return
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<Activity[]>(`/api/activities/recent?limit=${limit}`)
        this.activities = response
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch recent activities'
        console.error('Failed to fetch activities:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchActivitiesByUser(userId: number, limit = 10) {
      if (this.fetchingByUser) return
      this.fetchingByUser = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<Activity[]>(`/api/activities?user_id=${userId}&limit=${limit}`)
        return response
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch user activities'
        throw error
      } finally {
        this.fetchingByUser = false
      }
    },

    async fetchActivitiesByEntity(entityType: string, entityId: number, limit = 10) {
      if (this.fetchingByEntity) return
      this.fetchingByEntity = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<Activity[]>(
          `/api/activities?entity_type=${entityType}&entity_id=${entityId}&limit=${limit}`
        )
        return response
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch entity activities'
        throw error
      } finally {
        this.fetchingByEntity = false
      }
    },

    clearError() {
      this.error = null
    },
  },
})
