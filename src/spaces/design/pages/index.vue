<script setup lang="ts">
/**
 * Design Space - Blueprint browser
 *
 * Lists designs from SQLite (shared with UI space),
 * but opens them in the PixiJS-based editor.
 */
import { useLocalDesigns, type UIDesign } from '../composables/useLocalDesigns'

const route = useRoute()
const router = useRouter()
const localDesigns = useLocalDesigns()
const toast = useToast()

const projectId = computed(() => {
  const p = route.query.project
  return typeof p === 'string' ? p : null
})
const isProjectScope = computed(() => projectId.value !== null)

const { setPageItems, setSearch, clearToolbar } = useToolbar()

const isLoading = ref(true)
const showCreateModal = ref(false)

// Delete confirmation
const showDeleteConfirm = ref(false)
const designToDelete = ref<UIDesign | null>(null)

// Display files
interface DisplayFile {
  localId: string
  name: string
  type: 'ui'
  created: string
  updated: string
  projectId?: number | null
}

const allDesignFiles = computed((): DisplayFile[] => {
  return localDesigns.designs.value.map(d => ({
    localId: d.localId,
    name: d.name,
    type: 'ui' as const,
    created: d.createdAt.toISOString(),
    updated: d.updatedAt.toISOString(),
    projectId: d.projectId ?? null,
  }))
})

// Load designs
const loadDesigns = async () => {
  isLoading.value = true
  try {
    await localDesigns.loadDesigns(projectId.value ? Number(projectId.value) : null)
  } catch (e) {
    console.error('Failed to load designs:', e)
  } finally {
    isLoading.value = false
  }
}

// Create
const newDesignName = ref('')
const handleCreate = async () => {
  const name = newDesignName.value.trim()
  if (!name) return
  const design = await localDesigns.createDesign(projectId.value ? Number(projectId.value) : null, name)
  showCreateModal.value = false
  newDesignName.value = ''

  const editorQuery: Record<string, string> = { localId: design.localId, name: design.name }
  if (projectId.value) editorQuery.project = String(projectId.value)
  router.push({ path: '/app/design/editor', query: editorQuery })
}

// Open design → PixiJS editor
const openDesign = (file: DisplayFile) => {
  const query: Record<string, string> = { localId: file.localId, name: file.name }
  const proj = file.projectId || projectId.value
  if (proj) query.project = String(proj)
  router.push({ path: '/app/design/editor', query })
}

// Delete
const handleDelete = (file: DisplayFile) => {
  const design = localDesigns.designs.value.find(d => d.localId === file.localId)
  if (design) {
    designToDelete.value = design
    showDeleteConfirm.value = true
  }
}

const confirmDelete = async () => {
  if (!designToDelete.value) return
  await localDesigns.deleteDesign(designToDelete.value.localId)
  showDeleteConfirm.value = false
  designToDelete.value = null
}

const openCreateModal = () => {
  newDesignName.value = ''
  showCreateModal.value = true
}

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault()
    openCreateModal()
  }
}

const syncToolbar = () => {
  setPageItems([
    { id: 'design-new', icon: 'i-lucide-plus', label: 'New Design', type: 'action', category: 'space', onClick: openCreateModal },
    { id: 'design-refresh', icon: 'i-lucide-refresh-cw', label: 'Refresh', type: 'action', category: 'space', onClick: loadDesigns },
  ])
}

onMounted(async () => {
  syncToolbar()
  setSearch('Search designs...', () => {})
  window.addEventListener('keydown', handleKeyDown)
  await loadDesigns()
})

watch(isProjectScope, (scope, prev) => {
  if (scope === prev) return
  syncToolbar()
})

onBeforeUnmount(() => {
  clearToolbar()
  window.removeEventListener('keydown', handleKeyDown)
})

watch(projectId, () => { loadDesigns() })
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-app">
      <h1 class="text-lg font-medium text-app">{{ isProjectScope ? 'Designs' : 'All Designs' }}</h1>
      <Button
        icon="i-lucide-plus"
        label="New Design"
        @click="openCreateModal()"
      />
    </div>

    <!-- Design list -->
    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="isLoading" class="flex items-center justify-center h-32">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
      </div>
      <div v-else-if="allDesignFiles.length === 0" class="text-center py-12">
        <p class="text-app-muted mb-4">No designs yet</p>
        <Button
          icon="i-lucide-plus"
          label="Create your first design"
          @click="openCreateModal()"
        />
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div
          v-for="file in allDesignFiles"
          :key="file.localId"
          class="group relative rounded-lg border border-app bg-app hover:border-primary/50 transition-all cursor-pointer"
          @click="openDesign(file)"
        >
          <!-- Preview placeholder -->
          <div class="aspect-video bg-app-muted/10 rounded-t-lg flex items-center justify-center">
            <span class="text-4xl text-app-muted/30">
              <svg class="size-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </span>
          </div>
          <!-- Info -->
          <div class="p-3">
            <p class="font-medium text-app truncate">{{ file.name }}</p>
            <p class="text-xs text-app-muted mt-1">{{ new Date(file.updated).toLocaleDateString() }}</p>
          </div>
          <!-- Delete button -->
          <button
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-red-500/80 text-white transition-opacity"
            title="Delete"
            @click.stop="handleDelete(file)"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Create Design Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showCreateModal = false" />
        <div class="relative bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl p-6 w-full max-w-sm shadow-xl">
          <h2 class="text-lg font-semibold text-[var(--app-foreground)] mb-4">New Design</h2>
          <input
            v-model="newDesignName"
            type="text"
            placeholder="Design name"
            class="w-full px-3 py-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-background)] text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]"
            autofocus
            @keydown.enter="handleCreate"
            @keydown.escape="showCreateModal = false"
          />
          <div class="flex justify-end gap-2 mt-4">
            <button
              class="px-4 py-2 rounded-lg text-sm text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
              @click="showCreateModal = false"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 rounded-lg text-sm bg-[var(--app-accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="!newDesignName.trim()"
              @click="handleCreate"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Modal -->
    <ConfirmationModal
      v-model="showDeleteConfirm"
      title="Delete Design"
      :message="`Are you sure you want to delete '${designToDelete?.name}'?`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="confirmDelete"
    />
  </div>
</template>
