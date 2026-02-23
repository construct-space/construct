import { defineStore } from 'pinia'

export interface Message {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
}

export interface Conversation {
  id: number
  name: string
  model: string
  context?: string
  messages?: Message[]
  message_count?: number
  created_at: string
  updated_at: string
}

export interface CreateConversationRequest {
  name: string
  model?: string
  context?: string
  project_id?: number
}

export interface CreateMessageRequest {
  role: string
  content: string
}

interface ConversationsState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  loading: boolean
  error: string | null
}

export const useConversationsStore = defineStore('conversations', {
  state: (): ConversationsState => ({
    conversations: [],
    currentConversation: null,
    loading: false,
    error: null
  }),

  actions: {
    async fetchConversations() {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<{ data: Conversation[] }>('/conversations')
        this.conversations = response.data || []
        return { success: true, data: this.conversations }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to fetch conversations'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async createConversation(request: CreateConversationRequest) {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.post<Conversation>('/conversations', request)
        this.conversations.unshift(response)
        return { success: true, data: response }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to create conversation'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async getConversation(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        const response = await api.get<Conversation>(`/conversations/${id}`)
        this.currentConversation = response
        return { success: true, data: response }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to get conversation'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async deleteConversation(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useApi()
        await api.delete(`/conversations/${id}`)
        this.conversations = this.conversations.filter(c => c.id !== id)
        if (this.currentConversation?.id === id) {
          this.currentConversation = null
        }
        return { success: true }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to delete conversation'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async addMessage(conversationId: number, request: CreateMessageRequest) {
      try {
        const api = useApi()
        const response = await api.post<Message>(`/conversations/${conversationId}/messages`, request)
        // Update current conversation messages if loaded
        if (this.currentConversation?.id === conversationId) {
          if (!this.currentConversation.messages) {
            this.currentConversation.messages = []
          }
          this.currentConversation.messages.push(response)
        }
        return { success: true, data: response }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add message' }
      }
    },

    async getMessages(conversationId: number) {
      try {
        const api = useApi()
        const response = await api.get<Message[]>(`/conversations/${conversationId}/messages`)
        return { success: true, data: response }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to get messages' }
      }
    },

    async updateConversation(id: number, data: Partial<CreateConversationRequest>) {
      try {
        const api = useApi()
        const response = await api.put<Conversation>(`/conversations/${id}`, data)
        // Update in local list
        const idx = this.conversations.findIndex(c => c.id === id)
        if (idx !== -1) {
          this.conversations[idx] = { ...this.conversations[idx], ...response }
        }
        if (this.currentConversation?.id === id) {
          this.currentConversation = { ...this.currentConversation, ...response }
        }
        return { success: true, data: response }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update conversation' }
      }
    },

    clearCurrent() {
      this.currentConversation = null
    }
  }
})
