import { defineStore } from 'pinia'

export interface PRD {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  plan_json: string
  markdown: string
  project_id?: number
  company_id?: number
  project?: {
    id: number
    name: string
  }
  user?: {
    id: number
    name: string
  }
}

export interface PRDListItem {
  id: number
  created_at: string
  updated_at: string
  name: string
  description: string
  project_id?: number
  company_id?: number
}

export interface CreatePRDRequest {
  name: string
  description: string
  plan_json: string
  markdown: string
  project_id?: number
}

export interface UpdatePRDRequest {
  name?: string
  description?: string
  plan_json?: string
  markdown?: string
  project_id?: number
}

export const usePRDsStore = defineStore('prds', {
  state: () => ({
    prds: [] as PRDListItem[],
    currentPRD: null as PRD | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    // Get PRDs sorted by date (newest first)
    sortedPRDs: (state) => {
      return [...state.prds].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    },

    // Get PRDs linked to projects
    linkedPRDs: (state) => {
      return state.prds.filter(p => p.project_id)
    },

    // Get unlinked PRDs (drafts)
    draftPRDs: (state) => {
      return state.prds.filter(p => !p.project_id)
    }
  },

  actions: {
    async fetchMyPRDs() {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<PRD[]>('/prds/my')
        this.prds = response || []
        return this.prds
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch PRDs'
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchPRD(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<PRD>(`/prds/${id}`)
        this.currentPRD = response
        return response
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch PRD'
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchProjectPRD(projectId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<PRD>(`/projects/${projectId}/prd`)
        this.currentPRD = response
        return response
      } catch (error) {
        // No PRD for this project is not an error
        if ((error as Error).message?.includes('404')) {
          this.currentPRD = null
          return null
        }
        this.error = (error as Error).message || 'Failed to fetch PRD'
        throw error
      } finally {
        this.loading = false
      }
    },

    async createPRD(data: CreatePRDRequest) {
      this.error = null

      try {
        const api = useApi()
        const response = await api.post<PRD>('/prds', data)

        // Add to list
        this.prds.unshift({
          id: response.id,
          created_at: response.created_at,
          updated_at: response.updated_at,
          name: response.name,
          description: response.description,
          project_id: response.project_id,
          company_id: response.company_id
        })

        this.currentPRD = response
        return { success: true, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create PRD'
        return { success: false, error: this.error }
      }
    },

    async updatePRD(id: number, data: UpdatePRDRequest) {
      this.error = null

      try {
        const api = useApi()
        const response = await api.put<PRD>(`/prds/${id}`, data)

        // Update in list
        const index = this.prds.findIndex(p => p.id === id)
        const existing = this.prds[index]
        if (index !== -1 && existing) {
          this.prds[index] = {
            id: existing.id,
            created_at: existing.created_at,
            updated_at: response.updated_at,
            name: response.name,
            description: response.description,
            project_id: response.project_id,
            company_id: existing.company_id
          }
        }

        if (this.currentPRD?.id === id) {
          this.currentPRD = response
        }

        return { success: true, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to update PRD'
        return { success: false, error: this.error }
      }
    },

    async deletePRD(id: number) {
      this.error = null

      try {
        const api = useApi()
        await api.delete(`/prds/${id}`)

        // Remove from list
        this.prds = this.prds.filter(p => p.id !== id)

        if (this.currentPRD?.id === id) {
          this.currentPRD = null
        }

        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to delete PRD'
        return { success: false, error: this.error }
      }
    },

    async linkToProject(prdId: number, projectId: number) {
      this.error = null

      try {
        const api = useApi()
        const response = await api.patch<PRD>(`/prds/${prdId}/link/${projectId}`)

        // Update in list
        const index = this.prds.findIndex(p => p.id === prdId)
        const prdItem = this.prds[index]
        if (index !== -1 && prdItem) {
          prdItem.project_id = projectId
        }

        if (this.currentPRD?.id === prdId) {
          this.currentPRD = response
        }

        return { success: true, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to link PRD to project'
        return { success: false, error: this.error }
      }
    },

    clearCurrent() {
      this.currentPRD = null
    }
  }
})
