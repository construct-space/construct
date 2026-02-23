/**
 * Composable for Notes Board state
 * Shared between toolbar and StickyNotesBoard component
 */
import { ref } from 'vue'

const showNewNote = ref(false)
const searchQuery = ref('')

export function useNotesBoard() {
  const openNewNote = () => {
    showNewNote.value = true
  }

  const closeNewNote = () => {
    showNewNote.value = false
  }

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
  }

  return {
    showNewNote,
    searchQuery,
    openNewNote,
    closeNewNote,
    setSearchQuery
  }
}
