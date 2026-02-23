<script setup lang="ts">
/**
 * NotesEditor - Rich text editor for documentation
 * Can be used at company level or project level
 */

export interface NotesEditorProps {
  scope?: 'company' | 'project'
  projectId?: string
}

const props = withDefaults(defineProps<NotesEditorProps>(), {
  scope: 'project',
  projectId: undefined
})

const emit = defineEmits<{
  (e: 'save' | 'delete', value: string): void
}>()

// Notes state
const notes = ref([
  { id: '1', title: 'Getting Started', content: 'Welcome to your project documentation...', updatedAt: '2 hours ago' },
  { id: '2', title: 'API Reference', content: 'API endpoints and usage...', updatedAt: '1 day ago' },
  { id: '3', title: 'Architecture', content: 'System architecture overview...', updatedAt: '3 days ago' },
])

const selectedNote = ref<string | null>('1')
const searchQuery = ref('')
const editorContent = ref('')

// Filtered notes
const filteredNotes = computed(() => {
  if (!searchQuery.value) return notes.value
  const query = searchQuery.value.toLowerCase()
  return notes.value.filter(note =>
    note.title.toLowerCase().includes(query) ||
    note.content.toLowerCase().includes(query)
  )
})

// Current note
const currentNote = computed(() => {
  return notes.value.find(n => n.id === selectedNote.value)
})

// Watch for note selection
watch(selectedNote, (noteId) => {
  const note = notes.value.find(n => n.id === noteId)
  if (note) {
    editorContent.value = note.content
  }
})

// Initialize editor content
onMounted(() => {
  if (currentNote.value) {
    editorContent.value = currentNote.value.content
  }
})

// Actions
const createNote = () => {
  const newNote = {
    id: Date.now().toString(),
    title: 'Untitled',
    content: '',
    updatedAt: 'Just now'
  }
  notes.value.unshift(newNote)
  selectedNote.value = newNote.id
}

const saveNote = () => {
  if (currentNote.value) {
    currentNote.value.content = editorContent.value
    currentNote.value.updatedAt = 'Just now'
    emit('save', editorContent.value)
  }
}

const deleteNote = (noteId: string) => {
  const index = notes.value.findIndex(n => n.id === noteId)
  if (index > -1) {
    notes.value.splice(index, 1)
    if (selectedNote.value === noteId) {
      selectedNote.value = notes.value[0]?.id || null
    }
    emit('delete', noteId)
  }
}

// Use props for scope display
const scopeLabel = computed(() => props.scope === 'company' ? 'Company' : `Project`)
</script>

<template>
  <div class="h-full flex bg-app">
    <!-- Notes Sidebar -->
    <div class="w-72 border-r border-gray-200/50 dark:border-gray-700/50 flex flex-col bg-white/50 dark:bg-black/20">
      <!-- Header -->
      <div class="h-12 px-4 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="i-lucide-file-text" class="size-4 text-app-accent" />
          <span class="text-sm font-medium text-app">Notes</span>
          <span class="text-xs text-app-muted">{{ scopeLabel }}</span>
        </div>
        <Button
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="createNote"
        />
      </div>

      <!-- Search -->
      <div class="p-3 border-b border-gray-200/50 dark:border-gray-700/50">
        <Input
          v-model="searchQuery"
          placeholder="Search notes..."
          icon="i-lucide-search"
          size="sm"
        />
      </div>

      <!-- Notes List -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="note in filteredNotes"
          :key="note.id"
          class="px-4 py-3 border-b border-gray-100/50 dark:border-gray-700/50 cursor-pointer hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
          :class="selectedNote === note.id ? 'bg-white/50 dark:bg-white/10 border-l-2 border-l-[var(--app-accent)]' : ''"
          @click="selectedNote = note.id"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-app truncate">{{ note.title }}</p>
              <p class="text-xs text-app-muted truncate mt-1">{{ note.content.substring(0, 50) }}...</p>
              <p class="text-xs text-app-muted/70 mt-1">{{ note.updatedAt }}</p>
            </div>
            <Button
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="deleteNote(note.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Editor Area -->
    <div class="flex-1 flex flex-col bg-app">
      <!-- Editor Header -->
      <div v-if="currentNote" class="h-12 px-6 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between bg-white/50 dark:bg-black/20">
        <input
          v-model="currentNote.title"
          type="text"
          class="text-lg font-medium text-app bg-transparent border-none outline-none"
          placeholder="Note title..."
        >
        <div class="flex items-center gap-2">
          <Button
            icon="i-lucide-save"
            label="Save"
            size="sm"
            @click="saveNote"
          />
        </div>
      </div>

      <!-- Editor Content -->
      <div v-if="currentNote" class="flex-1 p-6 overflow-y-auto">
        <textarea
          v-model="editorContent"
          class="w-full h-full bg-transparent text-app text-base leading-relaxed resize-none outline-none"
          placeholder="Start writing..."
        />
      </div>

      <!-- Empty State -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <Icon name="i-lucide-file-text" class="size-16 text-app-muted/30 mx-auto mb-4" />
          <p class="text-app text-lg font-medium mb-2">No note selected</p>
          <p class="text-app-muted text-sm">Select a note or create a new one</p>
        </div>
      </div>
    </div>
  </div>
</template>
