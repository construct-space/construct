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
    sortedPRDs: (state) => {
      return [...state.prds].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    },

    linkedPRDs: (state) => {
      return state.prds.filter(p => p.project_id)
    },

    draftPRDs: (state) => {
      return state.prds.filter(p => !p.project_id)
    }
  },

  actions: {
    // Local-only: no API calls
    async fetchMyPRDs() {
      this.loading = false
      return this.prds
    },

    async fetchPRD(_id: number) {
      this.loading = false
      return this.currentPRD
    },

    async fetchProjectPRD(_projectId: number) {
      this.loading = false
      return this.currentPRD
    },

    async createPRD(data: CreatePRDRequest) {
      const prd: PRD = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        name: data.name,
        description: data.description,
        plan_json: data.plan_json,
        markdown: data.markdown,
        project_id: data.project_id,
      }
      this.prds.unshift({
        id: prd.id,
        created_at: prd.created_at,
        updated_at: prd.updated_at,
        name: prd.name,
        description: prd.description,
        project_id: prd.project_id,
      })
      this.currentPRD = prd
      return { success: true as const, data: prd }
    },

    async updatePRD(id: number, data: UpdatePRDRequest) {
      const index = this.prds.findIndex(p => p.id === id)
      const existing = this.prds[index]
      if (index !== -1 && existing) {
        existing.updated_at = new Date().toISOString()
        if (data.name) existing.name = data.name
        if (data.description) existing.description = data.description
      }
      if (this.currentPRD?.id === id) {
        Object.assign(this.currentPRD, data, { updated_at: new Date().toISOString() })
      }
      return { success: true as const, data: this.currentPRD as PRD }
    },

    async deletePRD(id: number) {
      this.prds = this.prds.filter(p => p.id !== id)
      if (this.currentPRD?.id === id) {
        this.currentPRD = null
      }
      return { success: true as const }
    },

    async linkToProject(prdId: number, projectId: number) {
      const index = this.prds.findIndex(p => p.id === prdId)
      const prdItem = this.prds[index]
      if (index !== -1 && prdItem) {
        prdItem.project_id = projectId
      }
      return { success: true as const, data: this.currentPRD as PRD }
    },

    clearCurrent() {
      this.currentPRD = null
    }
  }
})
