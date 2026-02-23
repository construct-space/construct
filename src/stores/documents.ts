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
  project?: {
    id: number
    name: string
  }
  user?: {
    id: number
    name: string
  }
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
    error: null as string | null
  }),

  getters: {
    // Get documents sorted by date (newest first)
    sortedDocuments: (state) => {
      return [...state.documents].sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
    },

    // Get documents by type
    getByType: (state) => (type: DocumentType) => {
      return state.documents.filter(d => d.type === type)
    },

    // Get PRDs
    prds: (state) => {
      return state.documents.filter(d => d.type === 'prd')
    }
  },

  actions: {
    async fetchProjectDocuments(_projectId: string | number) {
      // Local-only: documents are managed via local filesystem (docs/ folder)
      this.loading = false
      return this.documents
    },

    async fetchDocument(_id: number) {
      this.loading = false
      return this.currentDocument
    },

    async createDocument(data: CreateDocumentRequest) {
      const doc: Document = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        title: data.title,
        content: data.content || '',
        type: data.type || 'custom',
        plan_json: data.plan_json,
        project_id: data.project_id,
      }
      this.documents.unshift({
        id: doc.id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        title: doc.title,
        type: doc.type,
        project_id: doc.project_id,
      })
      this.currentDocument = doc
      return { success: true as const, data: doc }
    },

    async createProjectDocument(_projectId: number, data: CreateDocumentRequest) {
      return this.createDocument({ ...data, project_id: _projectId })
    },

    async updateDocument(id: number, data: UpdateDocumentRequest) {
      this.saving = true
      const index = this.documents.findIndex(d => d.id === id)
      const existing = this.documents[index]
      if (index !== -1 && existing) {
        existing.updated_at = new Date().toISOString()
        if (data.title) existing.title = data.title
      }
      if (this.currentDocument?.id === id) {
        if (data.title) this.currentDocument.title = data.title
        if (data.content) this.currentDocument.content = data.content
        if (data.plan_json) this.currentDocument.plan_json = data.plan_json
        this.currentDocument.updated_at = new Date().toISOString()
      }
      this.saving = false
      return { success: true as const, data: this.currentDocument as Document }
    },

    async deleteDocument(id: number) {
      this.documents = this.documents.filter(d => d.id !== id)
      if (this.currentDocument?.id === id) {
        this.currentDocument = null
      }
      return { success: true as const }
    },

    async linkToProject(docId: number, projectId: number) {
      const index = this.documents.findIndex(d => d.id === docId)
      const docItem = this.documents[index]
      if (index !== -1 && docItem) {
        docItem.project_id = projectId
      }
      return { success: true as const, data: this.currentDocument as Document }
    },

    setCurrentDocument(doc: Document | null) {
      this.currentDocument = doc
    },

    clearCurrent() {
      this.currentDocument = null
    }
  }
})
