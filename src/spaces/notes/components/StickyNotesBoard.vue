<script setup lang="ts">
/**
 * StickyNotesBoard - Sticky notes for quick reminders and sharing
 * Like real-life sticky notes - quick to create, easy to share passwords/API keys
 */
import { useNotesStore } from '~/stores/notes'
import type { Note, NoteColor } from '~/types/note'
import { useNotesBoard } from '../composables/useNotesBoard'

export interface StickyNotesBoardProps {
  scope?: 'company' | 'project'
  projectId?: string | number
}

const props = withDefaults(defineProps<StickyNotesBoardProps>(), {
  scope: 'project',
  projectId: undefined,
})

const emit = defineEmits<{
  (e: 'note-created', note: Note): void
  (e: 'note-deleted', noteId: number): void
}>()

// Note colors
const noteColors = [
  { name: 'yellow' as NoteColor, bg: 'bg-yellow-300', text: 'text-yellow-950', border: 'border-yellow-400' },
  { name: 'pink' as NoteColor,   bg: 'bg-pink-300',   text: 'text-pink-950',   border: 'border-pink-400' },
  { name: 'blue' as NoteColor,   bg: 'bg-blue-300',   text: 'text-blue-950',   border: 'border-blue-400' },
  { name: 'green' as NoteColor,  bg: 'bg-green-300',  text: 'text-green-950',  border: 'border-green-400' },
  { name: 'purple' as NoteColor, bg: 'bg-purple-300', text: 'text-purple-950', border: 'border-purple-400' },
  { name: 'orange' as NoteColor, bg: 'bg-orange-300', text: 'text-orange-950', border: 'border-orange-400' },
]

const notesStore = useNotesStore()
const route = useRoute()
const { showNewNote, searchQuery, openNewNote, closeNewNote } = useNotesBoard()

const newNoteContent = ref('')
const newNoteColor = ref<NoteColor>('yellow')
const editingNoteId = ref<number | null>(null)
const draggedNote = ref<number | null>(null)
const boardRef = ref<HTMLElement | null>(null)
const savingNote = ref(false)

const currentProjectId = computed(() => {
  const id = props.projectId || route.params.id
  return id ? Number(id) : null
})

watch(currentProjectId, async (newId) => {
  if (newId) await notesStore.fetchProjectNotes(newId)
}, { immediate: true })

const notes = computed(() => notesStore.notes)
const loading = computed(() => notesStore.loading)

const getColorClasses = (colorName: string) =>
  noteColors.find(c => c.name === colorName) ?? noteColors[0]!

const filteredNotes = computed(() => {
  if (!searchQuery.value) return notes.value
  const q = searchQuery.value.toLowerCase()
  return notes.value.filter(n => n.content.toLowerCase().includes(q))
})

async function createNote() {
  if (!newNoteContent.value.trim()) return
  savingNote.value = true
  const result = await notesStore.createNote({
    content: newNoteContent.value,
    color: newNoteColor.value,
    position_x: Math.floor(Math.random() * 400 + 50),
    position_y: Math.floor(Math.random() * 200 + 50),
    width: 200,
    height: 200,
    is_pinned: false,
    is_shared: false,
  })
  savingNote.value = false
  if (result.success && result.data) {
    emit('note-created', result.data)
    newNoteContent.value = ''
    newNoteColor.value = 'yellow'
    closeNewNote()
  }
}

async function deleteNote(noteId: number) {
  const result = await notesStore.deleteNote(noteId)
  if (result.success) emit('note-deleted', noteId)
}

const togglePin   = (noteId: number) => notesStore.togglePin(noteId)
const toggleShare = (noteId: number) => notesStore.toggleShare(noteId)
const copyToClipboard = (content: string) => navigator.clipboard.writeText(content)
const startEditing = (noteId: number) => { editingNoteId.value = noteId }

async function saveEdit(noteId: number, content: string) {
  await notesStore.updateContent(noteId, content)
  editingNoteId.value = null
}

// Pointer-based drag (works in Tauri)
let dragOffset = { x: 0, y: 0 }
let dragStartPosition = { x: 0, y: 0 }

function onPointerDown(noteId: number, event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button') || editingNoteId.value === noteId) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  draggedNote.value = noteId
  const note = notes.value.find(n => n.id === noteId)
  if (note) {
    dragOffset = { x: event.clientX - note.position_x, y: event.clientY - note.position_y }
    dragStartPosition = { x: note.position_x, y: note.position_y }
  }
}

function onPointerMove(event: PointerEvent) {
  if (!draggedNote.value || !boardRef.value) return
  const note = notes.value.find(n => n.id === draggedNote.value)
  if (note) {
    const rect = boardRef.value.getBoundingClientRect()
    note.position_x = Math.max(0, Math.min(event.clientX - dragOffset.x, rect.width - 220))
    note.position_y = Math.max(0, Math.min(event.clientY - dragOffset.y, rect.height - 150))
  }
}

async function onPointerUp() {
  if (!draggedNote.value) return
  const noteId = draggedNote.value
  const note = notes.value.find(n => n.id === noteId)
  if (note && (note.position_x !== dragStartPosition.x || note.position_y !== dragStartPosition.y)) {
    await notesStore.moveNote(noteId, note.position_x, note.position_y)
  }
  draggedNote.value = null
}
</script>

<template>
  <div class="h-full relative bg-app-canvas overflow-hidden">
    <!-- Loading -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-[var(--app-background)]/60 backdrop-blur-sm z-50"
    >
      <div class="flex items-center gap-2 text-app-muted">
        <Icon name="i-lucide-loader-2" class="size-5 animate-spin" />
        <span class="text-sm">Loading notes…</span>
      </div>
    </div>

    <!-- Board -->
    <div
      ref="boardRef"
      class="notes-board h-full relative overflow-auto p-6"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <!-- Notes -->
      <div
        v-for="note in filteredNotes"
        :key="note.id"
        class="absolute w-52 min-h-32 rounded shadow-lg cursor-move select-none touch-none flex flex-col"
        :class="[
          getColorClasses(note.color).bg,
          getColorClasses(note.color).text,
          draggedNote === note.id
            ? 'z-50 scale-105 shadow-2xl rotate-1'
            : 'hover:scale-[1.02] hover:z-10 transition-transform duration-150',
        ]"
        :style="{ left: `${note.position_x}px`, top: `${note.position_y}px` }"
        @pointerdown="onPointerDown(note.id, $event)"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-2 py-1 border-b border-black/10">
          <div class="flex items-center gap-1 opacity-60">
            <Icon v-if="note.is_pinned" name="i-lucide-pin" class="size-3" />
            <Icon v-if="note.is_shared" name="i-lucide-share-2" class="size-3" />
          </div>
          <div class="flex items-center gap-0.5">
            <button class="p-0.5 rounded hover:bg-black/10 transition-colors" title="Copy" @click.stop="copyToClipboard(note.content)">
              <Icon name="i-lucide-copy" class="size-3" />
            </button>
            <button class="p-0.5 rounded hover:bg-black/10 transition-colors" :title="note.is_pinned ? 'Unpin' : 'Pin'" @click.stop="togglePin(note.id)">
              <Icon :name="note.is_pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'" class="size-3" />
            </button>
            <button class="p-0.5 rounded hover:bg-black/10 transition-colors" :title="note.is_shared ? 'Unshare' : 'Share'" @click.stop="toggleShare(note.id)">
              <Icon :name="note.is_shared ? 'i-lucide-lock' : 'i-lucide-share-2'" class="size-3" />
            </button>
            <button class="p-0.5 rounded hover:bg-black/10 hover:text-red-700 transition-colors" title="Delete" @click.stop="deleteNote(note.id)">
              <Icon name="i-lucide-x" class="size-3" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 p-3" @dblclick.stop="startEditing(note.id)">
          <textarea
            v-if="editingNoteId === note.id"
            :value="note.content"
            class="w-full h-full bg-transparent resize-none outline-none text-sm font-mono"
            rows="4"
            @blur="saveEdit(note.id, ($event.target as HTMLTextAreaElement).value)"
            @keydown.ctrl.enter="saveEdit(note.id, ($event.target as HTMLTextAreaElement).value)"
            @keydown.stop
          />
          <p v-else class="text-sm whitespace-pre-wrap font-mono break-words leading-relaxed">
            {{ note.content }}
          </p>
        </div>

        <!-- Footer -->
        <div class="px-2 pb-1.5 text-[10px] opacity-40 text-right">
          {{ note.owner?.first_name || 'Me' }}
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="notes.length === 0 && !loading"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div class="text-center pointer-events-auto">
          <Icon name="i-lucide-sticky-note" class="size-14 text-app-muted mx-auto mb-3 opacity-40" />
          <p class="text-app font-medium mb-1">No sticky notes yet</p>
          <p class="text-app-muted text-sm mb-4">Create a note to share passwords, API keys, or quick reminders</p>
          <Button icon="i-lucide-plus" label="Create First Note" @click="openNewNote" />
        </div>
      </div>
    </div>

    <!-- New Note Modal -->
    <Modal
      :open="showNewNote"
      @update:open="(v) => { if (!v) closeNewNote() }"
    >
      <div class="space-y-4">
        <h3 class="text-base font-semibold text-[var(--app-foreground)]">New Sticky Note</h3>

        <!-- Color picker -->
        <div class="flex gap-2">
          <button
            v-for="color in noteColors"
            :key="color.name"
            class="size-7 rounded-full border-2 transition-all hover:scale-110"
            :class="[color.bg, newNoteColor === color.name ? 'border-white shadow-md scale-110' : 'border-transparent']"
            :title="color.name"
            @click="newNoteColor = color.name"
          />
        </div>

        <!-- Content -->
        <Textarea
          v-model="newNoteContent"
          placeholder="Type your note… (API keys, passwords, reminders)"
          :rows="5"
          @keydown.ctrl.enter="createNote"
        />

        <p class="text-xs text-app-muted">Tip: Ctrl+Enter to create quickly</p>
      </div>

      <template #footer>
        <Button variant="ghost" color="neutral" label="Cancel" @click="closeNewNote" />
        <Button
          label="Create Note"
          :disabled="!newNoteContent.trim() || savingNote"
          :loading="savingNote"
          @click="createNote"
        />
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.notes-board {
  background-image:
    repeating-linear-gradient(0deg,  transparent, transparent 19px, color-mix(in srgb, var(--app-muted) 15%, transparent) 20px),
    repeating-linear-gradient(90deg, transparent, transparent 19px, color-mix(in srgb, var(--app-muted) 15%, transparent) 20px);
}
</style>
