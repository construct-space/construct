<script setup lang="ts">
/**
 * Docs Space - Main page
 * Left sidebar with document list + main editor area
 * Supports both API (cloud) docs and local .md files with per-doc sync
 */
import type { DocumentType, Document } from '~/stores/documents'
import type { Project } from '~/stores/project'
import type { UnifiedDoc } from '../composables/useLocalDocs'
import { useLocalDocs, docTitleToFilename } from '../composables/useLocalDocs'
import SplitPane from '@/components/panels/SplitPane.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const projectStore = useProjectStore()
const documentsStore = useDocumentsStore()
const { setPageItems, clearToolbar } = useToolbar()
const {
  localDocs,
  syncing,
  loadLocalDocs,
  buildUnifiedList,
  syncLocalDocToApi,
  writeDocToLocal,
  deleteLocalDoc,
  renameLocalDoc,
  readLocalDoc,
  getDocsPath,
} = useLocalDocs()

// Get project ID from route
const projectId = computed(() => {
  const id = route.params.id
  if (typeof id !== 'string') return null
  const parsed = Number.parseInt(id, 10)
  return Number.isNaN(parsed) ? null : parsed
})
const isProjectScope = computed(() => projectId.value !== null)
const companyProjects = ref<Project[]>([])

// State
const loading = ref(true)
const showNewDocModal = ref(false)
const newDocTitle = ref('')
const newDocType = ref<DocumentType>('custom')
const sidebarCollapsed = ref(false)

// Currently selected doc (could be API or local)
const selectedDoc = ref<UnifiedDoc | null>(null)
// For local docs, we load content into this ref
const localDocContent = ref<string | null>(null)

// Selected key for sidebar highlighting
const selectedKey = computed(() => {
  if (!selectedDoc.value) return undefined
  if (selectedDoc.value.source === 'local') return `local-${selectedDoc.value.filename}`
  return `${selectedDoc.value.source}-${selectedDoc.value.id}`
})

// Unified document list
const unifiedDocuments = computed(() => {
  return buildUnifiedList(documentsStore.sortedDocuments)
})

const docsProjects = computed(() =>
  companyProjects.value.filter(project => !project.spaces || project.spaces.includes('docs'))
)

async function loadCompanyProjects() {
  try {
    if (projectStore.projects.length === 0) {
      await projectStore.fetchProjects()
    }
    companyProjects.value = projectStore.projects
  } catch (error) {
    console.error('[Docs] Failed to load projects:', error)
    companyProjects.value = []
  }
}

function openProjectDocs(id: number) {
  router.push(`/app/projects/${id}/docs`)
}

// Load documents (both API + local)
async function loadDocuments() {
  if (!isProjectScope.value || !projectId.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    // Load both in parallel
    await Promise.all([
      documentsStore.fetchProjectDocuments(projectId.value),
      loadLocalDocs(),
    ])
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to load documents',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

// Select a document (API, synced, or local)
async function selectDocument(doc: UnifiedDoc) {
  selectedDoc.value = doc
  localDocContent.value = null

  if (doc.source === 'local') {
    // Load local file content
    if (doc.localPath) {
      const content = await readLocalDoc(doc.localPath)
      localDocContent.value = content || ''
    }
  } else if (doc.id) {
    // Load from API
    try {
      await documentsStore.fetchDocument(doc.id)
    } catch {
      toast.add({
        title: 'Error',
        description: 'Failed to load document',
        color: 'error'
      })
    }
  }
}

// Create new document (API + local file)
async function createDocument() {
  if (!projectId.value || !newDocTitle.value.trim()) return

  const result = await documentsStore.createProjectDocument(projectId.value, {
    title: newDocTitle.value.trim(),
    type: newDocType.value,
    content: ''
  })

  if (result.success && result.data) {
    showNewDocModal.value = false

    // Also write to local docs folder
    await writeDocToLocal(newDocTitle.value.trim(), '')

    const title = newDocTitle.value.trim()
    newDocTitle.value = ''
    newDocType.value = 'custom'

    documentsStore.setCurrentDocument(result.data)

    // Select the new doc
    selectedDoc.value = {
      id: result.data.id,
      title: result.data.title,
      type: result.data.type,
      updated_at: result.data.updated_at,
      created_at: result.data.created_at,
      source: 'synced',
      filename: docTitleToFilename(title),
      localPath: `${getDocsPath()}/${docTitleToFilename(title)}`,
    }
    localDocContent.value = null

    // Refresh local docs list
    await loadLocalDocs()
  } else {
    toast.add({
      title: 'Error',
      description: result.error || 'Failed to create document',
      color: 'error'
    })
  }
}

// Create document from template
async function createFromTemplate(type: DocumentType, title: string, content: string) {
  if (!projectId.value) return

  const result = await documentsStore.createProjectDocument(projectId.value, {
    title,
    type,
    content
  })

  if (result.success && result.data) {
    documentsStore.setCurrentDocument(result.data)

    // Also write to local
    await writeDocToLocal(title, content)

    selectedDoc.value = {
      id: result.data.id,
      title: result.data.title,
      type: result.data.type,
      updated_at: result.data.updated_at,
      created_at: result.data.created_at,
      source: 'synced',
      filename: docTitleToFilename(title),
      localPath: `${getDocsPath()}/${docTitleToFilename(title)}`,
    }
    localDocContent.value = null

    // Refresh local docs list
    await loadLocalDocs()

    toast.add({
      title: 'Created',
      description: `"${title}" created from template`,
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Error',
      description: result.error || 'Failed to create document',
      color: 'error'
    })
  }
}

// Sync a local doc to API
async function handleSync(doc: UnifiedDoc) {
  const success = await syncLocalDocToApi(doc)
  if (success) {
    // Reload both lists to update the unified view
    await loadDocuments()

    // Re-select if it was the selected doc
    if (selectedDoc.value?.filename === doc.filename) {
      // Find the newly synced doc in the unified list
      const synced = unifiedDocuments.value.find(
        d => d.title.toLowerCase() === doc.title.toLowerCase() && d.source === 'synced'
      )
      if (synced) {
        await selectDocument(synced)
      }
    }
  }
}

// Delete document
async function handleDelete(doc: UnifiedDoc) {
  if (doc.source === 'local') {
    // Delete local file only
    if (doc.localPath) {
      await deleteLocalDoc(doc.localPath)
      await loadLocalDocs()

      if (selectedDoc.value?.filename === doc.filename) {
        selectedDoc.value = null
        localDocContent.value = null
      }

      toast.add({
        title: 'Deleted',
        description: 'Local file deleted',
        color: 'success'
      })
    }
  } else if (doc.id) {
    // Delete from API
    const result = await documentsStore.deleteDocument(doc.id)

    if (result.success) {
      // Also delete local file if synced
      if (doc.source === 'synced' && doc.localPath) {
        await deleteLocalDoc(doc.localPath)
        await loadLocalDocs()
      }

      if (selectedDoc.value?.id === doc.id) {
        selectedDoc.value = null
        localDocContent.value = null
      }

      toast.add({
        title: 'Deleted',
        description: 'Document deleted',
        color: 'success'
      })
    } else {
      toast.add({
        title: 'Error',
        description: result.error || 'Failed to delete document',
        color: 'error'
      })
    }
  }
}

// Rename document
async function handleRename(doc: UnifiedDoc, title: string) {
  if (doc.source === 'local') {
    // Rename local file only
    if (doc.localPath) {
      const newPath = await renameLocalDoc(doc.localPath, title)
      if (newPath) {
        await loadLocalDocs()
        // Update selection if this was selected
        if (selectedDoc.value?.filename === doc.filename) {
          const updated = localDocs.value.find(d => d.localPath === newPath)
          if (updated) selectedDoc.value = updated
        }
      }
    }
  } else if (doc.id) {
    // Rename in API
    const result = await documentsStore.updateDocument(doc.id, { title })

    if (result.success) {
      if (documentsStore.currentDocument?.id === doc.id && result.data) {
        documentsStore.setCurrentDocument(result.data)
      }

      // Also rename local file if synced
      if (doc.source === 'synced' && doc.localPath) {
        await renameLocalDoc(doc.localPath, title)
        await loadLocalDocs()
      }

      // Update selected doc title
      if (selectedDoc.value?.id === doc.id) {
        selectedDoc.value = { ...selectedDoc.value, title }
      }
    } else {
      toast.add({
        title: 'Error',
        description: result.error || 'Failed to rename document',
        color: 'error'
      })
    }
  }
}

// Open create modal
function openCreateModal() {
  showNewDocModal.value = true
}

// Document types for dropdown
const documentTypes: { value: DocumentType; label: string }[] = [
  { value: 'custom', label: 'Document' },
  { value: 'prd', label: 'PRD' },
  { value: 'readme', label: 'README' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'setup', label: 'Setup Guide' }
]

// The document to show in editor (API doc or local doc as pseudo-Document)
const editorDocument = computed<Document | null>(() => {
  if (!selectedDoc.value) return null

  if (selectedDoc.value.source === 'local') {
    // Build a pseudo-Document from local file
    return {
      id: -1, // sentinel for local doc
      created_at: selectedDoc.value.created_at,
      updated_at: selectedDoc.value.updated_at,
      title: selectedDoc.value.title,
      content: localDocContent.value || '',
      type: selectedDoc.value.type,
    }
  }

  return documentsStore.currentDocument
})

// Whether the current doc is local-only
const isLocalDoc = computed(() => selectedDoc.value?.source === 'local')

const syncToolbar = () => {
  if (isProjectScope.value) {
    setPageItems([
      {
        id: 'docs-new',
        icon: 'i-lucide-plus',
        label: 'New Document',
        type: 'action',
        category: 'space',
        onClick: openCreateModal
      },
      {
        id: 'docs-toggle-sidebar',
        icon: 'i-lucide-panel-left',
        label: 'Toggle Sidebar',
        type: 'action',
        category: 'space',
        onClick: () => { sidebarCollapsed.value = !sidebarCollapsed.value }
      }
    ])
    return
  }

  setPageItems([
    {
      id: 'docs-open-projects',
      icon: 'i-lucide-folder-open',
      label: 'Projects',
      type: 'action',
      category: 'space',
      onClick: () => router.push('/app/projects')
    },
    {
      id: 'docs-refresh-projects',
      icon: 'i-lucide-refresh-cw',
      label: 'Refresh',
      type: 'action',
      category: 'space',
      onClick: loadCompanyProjects
    }
  ])
}

const loadScopeData = async () => {
  if (isProjectScope.value) {
    await loadDocuments()
    return
  }
  await loadCompanyProjects()
}

// Setup
onMounted(async () => {
  syncToolbar()
  await loadScopeData()
})

watch(isProjectScope, async (scope, previousScope) => {
  if (scope === previousScope) return
  selectedDoc.value = null
  localDocContent.value = null
  syncToolbar()
  await loadScopeData()
})

onUnmounted(() => {
  clearToolbar()
  documentsStore.clearCurrent()
})
</script>

<template>
  <div class="h-full overflow-hidden">
    <!-- Company scope: no project selected -->
    <div v-if="!isProjectScope" class="h-full flex items-center justify-center p-6 bg-app">
      <div class="max-w-3xl w-full rounded-2xl border border-app p-6">
        <div class="flex items-center gap-3 mb-3">
          <Icon name="i-lucide-buildings-2" class="size-6 text-app-accent" />
          <h2 class="text-xl font-semibold text-app">Company Docs Scope</h2>
        </div>
        <p class="text-sm text-app-muted mb-6">
          Documentation is organized per project. Select a project to work on its docs.
        </p>

        <div v-if="docsProjects.length === 0" class="text-center py-10 border border-app rounded-xl">
          <Icon name="i-lucide-book-open" class="size-12 mx-auto text-app-muted mb-3" />
          <p class="text-app-muted mb-4">No docs-enabled projects found.</p>
          <Button
            icon="i-lucide-folder-open"
            label="Open Projects"
            @click="router.push('/app/projects')"
          />
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
          <button
            v-for="project in docsProjects"
            :key="project.id"
            class="text-left rounded-xl border border-app bg-white/[0.02] hover:bg-white/[0.05] px-4 py-3 transition-colors"
            @click="openProjectDocs(project.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-medium text-app truncate">{{ project.name }}</p>
              <Icon name="i-lucide-arrow-up-right" class="size-4 text-app-muted" />
            </div>
            <p class="text-xs text-app-muted mt-1 line-clamp-2">
              {{ project.description || 'Open project documentation' }}
            </p>
          </button>
        </div>
      </div>
    </div>

    <!-- Project scope: sidebar + editor -->
    <template v-else>
      <SplitPane
        v-if="!sidebarCollapsed"
        direction="horizontal"
        :initial-size="20"
        :min-size="12"
        :max-size="40"
      >
        <template #first>
          <div class="h-full border-r border-app">
            <DocsList
              :documents="unifiedDocuments"
              :selected-key="selectedKey"
              :syncing-file="syncing"
              @select="selectDocument"
              @create="openCreateModal"
              @delete="handleDelete"
              @rename="handleRename"
              @sync="handleSync"
            />
          </div>
        </template>

        <template #second>
          <div class="h-full">
            <div v-if="loading" class="flex items-center justify-center h-full">
              <div class="text-center">
                <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-app-muted mb-2" />
                <p class="text-sm text-app-muted">Loading documents...</p>
              </div>
            </div>

            <!-- Local doc banner -->
            <div v-else-if="isLocalDoc && editorDocument" class="flex flex-col h-full">
              <div class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm text-amber-400">
                  <Icon name="i-lucide-hard-drive" class="size-4" />
                  <span>Local file — not synced to cloud</span>
                </div>
                <Button
                  size="xs"
                  variant="soft"
                  color="primary"
                  icon="i-lucide-cloud-upload"
                  label="Sync to Cloud"
                  :loading="syncing === selectedDoc?.filename"
                  @click="selectedDoc && handleSync(selectedDoc)"
                />
              </div>
              <DocsEditor
                :document="editorDocument"
                :is-local="true"
                :local-path="selectedDoc?.localPath"
                @delete="selectedDoc && handleDelete(selectedDoc)"
              />
            </div>

            <DocsEditor
              v-else-if="editorDocument"
              :document="editorDocument"
              :local-path="selectedDoc?.localPath"
              @delete="selectedDoc && handleDelete(selectedDoc)"
            />
            <DocsEmptyState
              v-else
              @create="openCreateModal"
              @create-from-template="createFromTemplate"
            />
          </div>
        </template>
      </SplitPane>

      <!-- Collapsed sidebar mode -->
      <div v-else class="h-full flex">
        <button
          class="w-8 flex-shrink-0 border-r border-app flex items-center justify-center hover:bg-white/[0.05] transition-colors"
          title="Show sidebar"
          @click="sidebarCollapsed = false"
        >
          <Icon name="i-lucide-panel-left" class="size-4 text-app-muted" />
        </button>

        <div class="flex-1 h-full">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <div class="text-center">
              <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-app-muted mb-2" />
              <p class="text-sm text-app-muted">Loading documents...</p>
            </div>
          </div>

          <div v-else-if="isLocalDoc && editorDocument" class="flex flex-col h-full">
            <div class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm text-amber-400">
                <Icon name="i-lucide-hard-drive" class="size-4" />
                <span>Local file — not synced to cloud</span>
              </div>
              <Button
                size="xs"
                variant="soft"
                color="primary"
                icon="i-lucide-cloud-upload"
                label="Sync to Cloud"
                :loading="syncing === selectedDoc?.filename"
                @click="selectedDoc && handleSync(selectedDoc)"
              />
            </div>
            <DocsEditor
              :document="editorDocument"
              :is-local="true"
              :local-path="selectedDoc?.localPath"
              @delete="selectedDoc && handleDelete(selectedDoc)"
            />
          </div>

          <DocsEditor
            v-else-if="editorDocument"
            :document="editorDocument"
            :local-path="selectedDoc?.localPath"
            @delete="selectedDoc && handleDelete(selectedDoc)"
          />
          <DocsEmptyState
            v-else
            @create="openCreateModal"
            @create-from-template="createFromTemplate"
          />
        </div>
      </div>
    </template>

    <!-- New Document Modal -->
    <Modal v-model:open="showNewDocModal">
      <div class="p-6">
        <h2 class="text-lg font-bold text-app mb-4">New Document</h2>
        <div class="space-y-4">
          <FormField label="Title">
            <Input
              v-model="newDocTitle"
              placeholder="Document title"
              autofocus
              @keydown.enter="createDocument"
            />
          </FormField>
          <FormField label="Type">
            <Select
              v-model="newDocType"
              :items="documentTypes"
            />
          </FormField>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <Button variant="ghost" color="neutral" @click="showNewDocModal = false">
            Cancel
          </Button>
          <Button :disabled="!newDocTitle.trim()" @click="createDocument">
            Create
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
