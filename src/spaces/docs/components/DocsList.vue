<script setup lang="ts">
/**
 * DocsList - Document sidebar list
 * Supports search, sort, inline rename, delete with confirmation
 * Shows both API docs and local .md files with sync buttons
 */
import type { DocumentType } from '~/stores/documents'
import type { UnifiedDoc } from '../composables/useLocalDocs'

interface Props {
  documents: UnifiedDoc[]
  selectedKey?: string  // "api-{id}" or "local-{filename}" or "synced-{id}"
  syncingFile?: string | null  // filename currently being synced
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [doc: UnifiedDoc]
  delete: [doc: UnifiedDoc]
  create: []
  rename: [doc: UnifiedDoc, title: string]
  sync: [doc: UnifiedDoc]
}>()

// Search
const searchQuery = ref('')

// Sort
type SortMode = 'date' | 'name'
const sortMode = ref<SortMode>('date')

// Inline rename state
const renamingKey = ref<string | null>(null)
const renameValue = ref('')

// Delete confirmation
const deleteDoc = ref<UnifiedDoc | null>(null)
const showDeleteModal = computed({
  get: () => deleteDoc.value !== null,
  set: (val: boolean) => { if (!val) deleteDoc.value = null }
})

// Generate unique key for a doc
function getDocKey(doc: UnifiedDoc): string {
  if (doc.source === 'local') return `local-${doc.filename}`
  return `${doc.source}-${doc.id}`
}

// Filtered and sorted documents
const filteredDocuments = computed(() => {
  let docs = [...props.documents]

  // Filter by search
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    docs = docs.filter(doc =>
      doc.title.toLowerCase().includes(query) ||
      getTypeLabel(doc.type).toLowerCase().includes(query) ||
      doc.source.toLowerCase().includes(query)
    )
  }

  // Sort
  if (sortMode.value === 'name') {
    docs.sort((a, b) => a.title.localeCompare(b.title))
  } else {
    docs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  return docs
})

function getTypeIcon(type: DocumentType): string {
  switch (type) {
    case 'prd': return 'i-lucide-file-text'
    case 'readme': return 'i-lucide-book-open'
    case 'architecture': return 'i-lucide-git-branch'
    case 'roadmap': return 'i-lucide-map'
    case 'setup': return 'i-lucide-settings'
    default: return 'i-lucide-file'
  }
}

function getTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'prd': return 'PRD'
    case 'readme': return 'README'
    case 'architecture': return 'Architecture'
    case 'roadmap': return 'Roadmap'
    case 'setup': return 'Setup'
    default: return 'Document'
  }
}

function getSourceIcon(source: UnifiedDoc['source']): string {
  switch (source) {
    case 'api': return 'i-lucide-cloud'
    case 'local': return 'i-lucide-hard-drive'
    case 'synced': return 'i-lucide-cloud-check'
  }
}

function getSourceLabel(source: UnifiedDoc['source']): string {
  switch (source) {
    case 'api': return 'Cloud'
    case 'local': return 'Local'
    case 'synced': return 'Synced'
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Inline rename
function startRename(doc: UnifiedDoc) {
  renamingKey.value = getDocKey(doc)
  renameValue.value = doc.title
  nextTick(() => {
    const input = document.querySelector(`[data-rename-key="${getDocKey(doc)}"]`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function confirmRename(doc: UnifiedDoc) {
  if (renameValue.value.trim() && renameValue.value.trim() !== doc.title) {
    emit('rename', doc, renameValue.value.trim())
  }
  cancelRename()
}

function cancelRename() {
  renamingKey.value = null
  renameValue.value = ''
}

// Delete confirmation
function requestDelete(doc: UnifiedDoc) {
  deleteDoc.value = doc
}

function confirmDelete() {
  if (deleteDoc.value) {
    emit('delete', deleteDoc.value)
  }
  deleteDoc.value = null
}

function cancelDelete() {
  deleteDoc.value = null
}

function toggleSort() {
  sortMode.value = sortMode.value === 'date' ? 'name' : 'date'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 pt-3 pb-2">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-app">Documents</h3>
        <div class="flex items-center gap-0.5">
          <button
            class="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            :title="sortMode === 'date' ? 'Sort by name' : 'Sort by date'"
            @click="toggleSort"
          >
            <Icon
              :name="sortMode === 'date' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-down-a-z'"
              class="size-3.5 text-app-muted"
            />
          </button>
          <button
            class="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="New Document"
            @click="emit('create')"
          >
            <Icon name="i-lucide-plus" class="size-3.5 text-app-muted" />
          </button>
        </div>
      </div>

      <!-- Search -->
      <Input
        v-model="searchQuery"
        placeholder="Search documents..."
        icon="i-lucide-search"
        size="sm"
      />
    </div>

    <!-- Document Count + Sort Indicator -->
    <div class="px-3 py-1 text-xs text-app-muted flex items-center justify-between">
      <span>{{ filteredDocuments.length }} document{{ filteredDocuments.length !== 1 ? 's' : '' }}</span>
      <span v-if="sortMode === 'name'" class="text-xs">A-Z</span>
      <span v-else class="text-xs">Recent</span>
    </div>

    <!-- Document List -->
    <div class="flex-1 overflow-y-auto px-2 pb-2">
      <div v-if="filteredDocuments.length === 0" class="px-3 py-8 text-center">
        <Icon name="i-lucide-search-x" class="size-8 text-app-muted/30 mx-auto mb-2" />
        <p v-if="searchQuery" class="text-sm text-app-muted">No documents match "{{ searchQuery }}"</p>
        <p v-else class="text-sm text-app-muted">No documents yet</p>
      </div>

      <div v-else class="space-y-0.5">
        <div
          v-for="doc in filteredDocuments"
          :key="getDocKey(doc)"
          class="group relative rounded-lg transition-colors cursor-pointer"
          :class="selectedKey === getDocKey(doc)
            ? 'bg-white/10 ring-1 ring-white/10'
            : 'hover:bg-white/[0.05]'"
          @click="emit('select', doc)"
        >
          <!-- Normal view -->
          <div v-if="renamingKey !== getDocKey(doc)" class="flex items-start gap-2.5 p-2.5">
            <Icon
              :name="getTypeIcon(doc.type)"
              class="size-4 mt-0.5 shrink-0"
              :class="selectedKey === getDocKey(doc) ? 'text-app-accent' : 'text-app-muted'"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate text-app">{{ doc.title }}</p>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-xs text-app-muted">{{ getTypeLabel(doc.type) }}</span>
                <span class="text-xs text-app-muted/50">&middot;</span>
                <!-- Source indicator -->
                <span
                  class="inline-flex items-center gap-0.5 text-xs"
                  :class="doc.source === 'local' ? 'text-amber-500' : doc.source === 'synced' ? 'text-green-500' : 'text-app-muted'"
                  :title="getSourceLabel(doc.source)"
                >
                  <Icon :name="getSourceIcon(doc.source)" class="size-3" />
                  <span class="text-[10px]">{{ getSourceLabel(doc.source) }}</span>
                </span>
                <span class="text-xs text-app-muted/50">&middot;</span>
                <span class="text-xs text-app-muted">{{ formatDate(doc.updated_at) }}</span>
              </div>
            </div>

            <!-- Action buttons (show on hover) -->
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <!-- Sync button for local-only docs -->
              <button
                v-if="doc.source === 'local'"
                class="p-1 rounded hover:bg-blue-500/10 transition-colors"
                :title="syncingFile === doc.filename ? 'Syncing...' : 'Sync to cloud'"
                :disabled="syncingFile === doc.filename"
                @click.stop="emit('sync', doc)"
              >
                <Icon
                  :name="syncingFile === doc.filename ? 'i-lucide-loader-2' : 'i-lucide-cloud-upload'"
                  class="size-3"
                  :class="syncingFile === doc.filename ? 'text-blue-400 animate-spin' : 'text-blue-400'"
                />
              </button>
              <button
                class="p-1 rounded hover:bg-white/10 transition-colors"
                title="Rename"
                @click.stop="startRename(doc)"
              >
                <Icon name="i-lucide-pencil" class="size-3 text-app-muted" />
              </button>
              <button
                class="p-1 rounded hover:bg-red-500/10 transition-colors"
                title="Delete"
                @click.stop="requestDelete(doc)"
              >
                <Icon name="i-lucide-trash-2" class="size-3 text-red-400" />
              </button>
            </div>
          </div>

          <!-- Rename mode -->
          <div v-else class="p-2.5" @click.stop>
            <input
              v-model="renameValue"
              :data-rename-key="getDocKey(doc)"
              class="w-full px-2 py-1 text-sm bg-[var(--app-background)] border border-[var(--app-border)] rounded-md outline-none focus:ring-2 focus:ring-[var(--app-accent)]/50 text-app"
              @keydown.enter="confirmRename(doc)"
              @keydown.escape="cancelRename"
              @blur="confirmRename(doc)"
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <Modal v-model:open="showDeleteModal">
      <div class="p-5">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <Icon name="i-lucide-trash-2" class="size-5 text-red-500" />
          </div>
          <div>
            <h3 class="text-base font-semibold text-app">Delete Document</h3>
            <p class="text-sm text-app-muted mt-0.5">
              {{ deleteDoc?.source === 'local' ? 'Delete local file?' : 'This action cannot be undone.' }}
            </p>
            <p v-if="deleteDoc" class="text-xs text-app-muted mt-1 truncate">{{ deleteDoc.title }}</p>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" color="neutral" size="sm" @click="cancelDelete">
            Cancel
          </Button>
          <Button color="error" size="sm" @click="confirmDelete">
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
