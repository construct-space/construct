import { defineStore } from 'pinia'
import type { Note, CreateNoteRequest, UpdateNoteRequest, NoteColor } from '~/types/note'

export const NOTE_COLORS: NoteColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'] as const

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as Note[],
    currentNote: null as Note | null,
    currentProjectId: null as number | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    // Get notes sorted by position (for rendering on canvas)
    sortedNotes: (state) => {
      return [...state.notes].sort((a, b) => {
        if (a.position_y !== b.position_y) {
          return a.position_y - b.position_y
        }
        return a.position_x - b.position_x
      })
    },

    // Get pinned notes first
    pinnedFirst: (state) => {
      return [...state.notes].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return 0
      })
    },

    // Get notes by color
    notesByColor: (state) => (color: NoteColor) => {
      return state.notes.filter(n => n.color === color)
    },

    // Get pinned notes only
    pinnedNotes: (state) => {
      return state.notes.filter(n => n.is_pinned)
    }
  },

  actions: {
    async fetchProjectNotes(projectId: number) {
      this.loading = true
      this.error = null
      this.currentProjectId = projectId

      try {
        const api = useApi()
        const response = await api.get<{ data: Note[] }>(`/project-notes/${projectId}`)
        this.notes = response.data || []
        return this.notes
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch notes'
        throw error
      } finally {
        this.loading = false
      }
    },

    async createNote(data: Partial<CreateNoteRequest>) {
      if (!this.currentProjectId) {
        return { success: false, error: 'No project selected' }
      }

      this.error = null

      try {
        const api = useApi()
        const noteData: CreateNoteRequest = {
          content: data.content || '',
          color: data.color || 'yellow',
          position_x: data.position_x || 100,
          position_y: data.position_y || 100,
          width: data.width || 200,
          height: data.height || 200,
          is_pinned: data.is_pinned || false,
          is_shared: data.is_shared || false,
          project_id: this.currentProjectId
        }

        const note = await api.post<Note>(`/project-notes/${this.currentProjectId}`, noteData)
        this.notes.push(note)
        return { success: true, data: note }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create note'
        return { success: false, error: this.error }
      }
    },

    async updateNote(noteId: number, data: UpdateNoteRequest) {
      this.error = null

      // Optimistic update
      const index = this.notes.findIndex(n => n.id === noteId)
      const backup = index !== -1 ? { ...this.notes[index] } : null

      if (index !== -1 && this.notes[index]) {
        this.notes[index] = { ...this.notes[index], ...data } as Note
      }

      try {
        const api = useApi()
        const updated = await api.put<Note>(`/notes/${noteId}`, data)
        if (index !== -1 && updated) {
          this.notes[index] = updated as Note
        }
        return { success: true, data: updated }
      } catch (error) {
        // Rollback on error
        if (index !== -1 && backup) {
          this.notes[index] = backup as Note
        }
        this.error = (error as Error).message || 'Failed to update note'
        return { success: false, error: this.error }
      }
    },

    async deleteNote(noteId: number) {
      this.error = null

      // Optimistic delete
      const index = this.notes.findIndex(n => n.id === noteId)
      const backup = index !== -1 ? this.notes[index] : null
      if (index !== -1) {
        this.notes.splice(index, 1)
      }

      try {
        const api = useApi()
        await api.delete(`/notes/${noteId}`)
        return { success: true }
      } catch (error) {
        // Rollback on error
        if (backup) {
          this.notes.push(backup)
        }
        this.error = (error as Error).message || 'Failed to delete note'
        return { success: false, error: this.error }
      }
    },

    async togglePin(noteId: number) {
      this.error = null

      try {
        const api = useApi()
        const updated = await api.patch<Note>(`/notes/${noteId}/pin`)
        const index = this.notes.findIndex(n => n.id === noteId)
        if (index !== -1) {
          this.notes[index] = updated
        }
        return { success: true, data: updated }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to toggle pin'
        return { success: false, error: this.error }
      }
    },

    async toggleShare(noteId: number) {
      this.error = null

      try {
        const api = useApi()
        const updated = await api.patch<Note>(`/notes/${noteId}/share`)
        const index = this.notes.findIndex(n => n.id === noteId)
        if (index !== -1) {
          this.notes[index] = updated
        }
        return { success: true, data: updated }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to toggle share'
        return { success: false, error: this.error }
      }
    },

    // Move note to new position
    async moveNote(noteId: number, position_x: number, position_y: number) {
      return this.updateNote(noteId, { position_x, position_y })
    },

    // Resize note
    async resizeNote(noteId: number, width: number, height: number) {
      return this.updateNote(noteId, { width, height })
    },

    // Change note color
    async changeColor(noteId: number, color: NoteColor) {
      return this.updateNote(noteId, { color })
    },

    // Update note content
    async updateContent(noteId: number, content: string) {
      return this.updateNote(noteId, { content })
    },

    clearNotes() {
      this.notes = []
      this.currentNote = null
      this.currentProjectId = null
    }
  }
})
