<script setup lang="ts">
/**
 * Notes Space - Sticky notes board
 */
import { useNotesBoard } from '../composables/useNotesBoard'

const { setPageItems, setSearch, clearToolbar } = useToolbar()
const { openNewNote, setSearchQuery } = useNotesBoard()

onMounted(() => {
  // Page-specific items for Notes space
  setPageItems([
    {
      id: 'notes-new',
      icon: 'i-lucide-plus',
      label: 'New Note',
      type: 'action',
      category: 'space',
      onClick: openNewNote
    }
  ])

  // Search handler for notes
  setSearch('Search notes...', (query) => {
    setSearchQuery(query)
  })
})

onUnmounted(() => {
  clearToolbar()
})
</script>

<template>
  <StickyNotesBoard />
</template>
