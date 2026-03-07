import { defineStore } from 'pinia'

export type DocumentType = 'prd' | 'readme' | 'architecture' | 'roadmap' | 'setup' | 'custom'

export interface Document {
  id: number
  created_at: string
  updated_at: string
  title: string
  content: string
  type: DocumentType
  plan_json?: string
  project_id?: number
  company_id?: number
  project?: { id: number; name: string }
  user?: { id: number; name: string }
}

export interface DocumentListItem {
  id: number
  created_at: string
  updated_at: string
  title: string
  type: DocumentType
  project_id?: number
  company_id?: number
}

export interface CreateDocumentRequest {
  title: string
  content?: string
  type?: DocumentType
  plan_json?: string
  project_id?: number
}

export interface UpdateDocumentRequest {
  title?: string
  content?: string
  plan_json?: string
}

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    documents: [] as DocumentListItem[],
    currentDocument: null as Document | null,
    loading: false,
    saving: false,
    error: null as string | null,
  }),

  getters: {
    sortedDocuments: (state) => {
      return [...state.documents].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
    },
    getByType: (state) => (type: DocumentType) => {
      return state.documents.filter(d => d.type === type)
    },
    prds: (state) => {
      return state.documents.filter(d => d.type === 'prd')
    },
  },

  actions: {
    async fetchProjectDocuments(projectId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<DocumentListItem[]>(`/project-documents/${projectId}`)
        this.documents = response || []
        return this.documents
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch documents'
        this.documents = []
        return []
      } finally {
        this.loading = false
      }
    },

    async fetchDocument(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<Document>(`/documents/${id}`)
        this.currentDocument = response
        return response
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch document'
        throw error
      } finally {
        this.loading = false
      }
    },

    async createDocument(data: CreateDocumentRequest) {
      this.error = null
      try {
        const api = useApi()
        const response = await api.post<Document>('/documents', data)
        this.documents.unshift({
          id: response.id,
          created_at: response.created_at,
          updated_at: response.updated_at,
          title: response.title,
          type: response.type,
          project_id: response.project_id,
          company_id: response.company_id,
        })
        this.currentDocument = response
        return { success: true as const, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create document'
        return { success: false as const, error: this.error }
      }
    },

    async createProjectDocument(projectId: number, data: CreateDocumentRequest) {
      this.error = null
      try {
        const api = useApi()
        const response = await api.post<Document>(`/project-documents/${projectId}`, data)
        this.documents.unshift({
          id: response.id,
          created_at: response.created_at,
          updated_at: response.updated_at,
          title: response.title,
          type: response.type,
          project_id: response.project_id,
          company_id: response.company_id,
        })
        this.currentDocument = response
        return { success: true as const, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create document'
        return { success: false as const, error: this.error }
      }
    },

    async updateDocument(id: number, data: UpdateDocumentRequest) {
      this.saving = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.put<Document>(`/documents/${id}`, data)
        const index = this.documents.findIndex(d => d.id === id)
        const existing = this.documents[index]
        if (index !== -1 && existing) {
          this.documents[index] = {
            id: existing.id,
            created_at: existing.created_at,
            updated_at: response.updated_at,
            title: response.title,
            type: existing.type,
            project_id: existing.project_id,
            company_id: existing.company_id,
          }
        }
        if (this.currentDocument?.id === id) {
          this.currentDocument = response
        }
        return { success: true as const, data: response }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to update document'
        return { success: false as const, error: this.error }
      } finally {
        this.saving = false
      }
    },

    async deleteDocument(id: number) {
      this.error = null
      try {
        const api = useApi()
        await api.delete(`/documents/${id}`)
        this.documents = this.documents.filter(d => d.id !== id)
        if (this.currentDocument?.id === id) {
          this.currentDocument = null
        }
        return { success: true as const }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to delete document'
        return { success: false as const, error: this.error }
      }
    },

    setCurrentDocument(doc: Document | null) {
      this.currentDocument = doc
    },

    clearCurrent() {
      this.currentDocument = null
    },
  },
})
