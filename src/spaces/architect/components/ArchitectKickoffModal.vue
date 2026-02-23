<script setup lang="ts">
/**
 * Architect Kickoff Modal
 * Full project creation flow with PRD, tasks, and documents
 */
import type { ArchitectPlan, DocumentType } from '../utils/documentsGenerator'
import { useArchitectKickoff } from '../composables/useArchitectKickoff'

interface Props {
  plan: ArchitectPlan | null
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (e: 'created', project: { id: string | number; name: string }): void
}>()

const {
  isKicking,
  progress,
  progressMessage,
  generateSuggestedTasks,
  getDefaultDocuments,
  kickoff,
  DOCUMENT_OPTIONS: docOptions
} = useArchitectKickoff()

// Form state
const form = reactive({
  name: '',
  description: '',
  spaces: ['code', 'kanban', 'architect'] as string[],
  localPath: ''
})

const suggestedTasks = ref<Array<{
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  enabled: boolean
}>>([])

const selectedDocs = ref<DocumentType[]>([])

// Available spaces
const availableSpaces = [
  { value: 'code', label: 'Code', icon: 'i-lucide-code' },
  { value: 'kanban', label: 'Tasks', icon: 'i-lucide-check-square' },
  { value: 'docs', label: 'Docs', icon: 'i-lucide-file-text' },
  { value: 'ui', label: 'Design', icon: 'i-lucide-palette' },
  { value: 'architect', label: 'Architect', icon: 'i-lucide-compass' },
  { value: 'notes', label: 'Notes', icon: 'i-lucide-sticky-note' },
  { value: 'terminal', label: 'Terminal', icon: 'i-lucide-terminal' }
]

// Initialize form when plan changes
watch(() => props.plan, (plan) => {
  if (plan) {
    form.name = plan.name || ''
    form.description = plan.description || plan.prd?.overview || ''
    suggestedTasks.value = generateSuggestedTasks(plan)
    selectedDocs.value = getDefaultDocuments()
    // Auto-enable docs space when documents are selected
    if (selectedDocs.value.length > 0 && !form.spaces.includes('docs')) {
      form.spaces.push('docs')
    }
  }
}, { immediate: true })

// Auto-enable/disable docs space based on document selection
watch(selectedDocs, (docs) => {
  if (docs.length > 0 && !form.spaces.includes('docs')) {
    form.spaces.push('docs')
  }
}, { deep: true })

// Format decision value for display
function formatDecision(value: string | string[] | undefined): string {
  if (!value) return 'Not specified'
  if (Array.isArray(value)) return value.join(', ')
  return value
}

// Get priority color
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return 'text-red-500'
    case 'medium': return 'text-yellow-500'
    case 'low': return 'text-green-500'
    default: return 'text-app-muted'
  }
}

// Toggle task enabled state
function toggleTask(index: number) {
  const task = suggestedTasks.value[index]
  if (task) {
    task.enabled = !task.enabled
  }
}

// Toggle document selection
function toggleDoc(docType: DocumentType) {
  const index = selectedDocs.value.indexOf(docType)
  if (index === -1) {
    selectedDocs.value.push(docType)
  } else {
    selectedDocs.value.splice(index, 1)
  }
}

// Check if document is selected
function isDocSelected(docType: DocumentType): boolean {
  return selectedDocs.value.includes(docType)
}

// Toggle space selection
function toggleSpace(space: string) {
  const index = form.spaces.indexOf(space)
  if (index === -1) {
    form.spaces.push(space)
  } else {
    form.spaces.splice(index, 1)
  }
}

// Handle create
async function handleCreate() {
  if (!props.plan || !form.name.trim()) return

  const result = await kickoff(props.plan, {
    name: form.name.trim(),
    description: form.description.trim(),
    spaces: form.spaces,
    tasks: suggestedTasks.value,
    documents: selectedDocs.value,
    localPath: form.localPath || undefined
  })

  if (result.success && result.project) {
    emit('created', result.project)
    open.value = false
  }
}

// Count enabled tasks
const enabledTaskCount = computed(() => {
  return suggestedTasks.value.filter(t => t.enabled).length
})

// Can submit
const canSubmit = computed(() => {
  return form.name.trim() && !isKicking.value
})
</script>

<template>
  <Modal v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-app-accent/10 flex items-center justify-center">
          <Icon name="i-lucide-rocket" class="size-5 text-app-accent" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-app">Project Kickoff</h2>
          <p class="text-sm text-app-muted">Review and create your project</p>
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-6 max-h-[60vh] overflow-y-auto">
        <!-- Project Details -->
        <section>
          <h3 class="text-sm font-semibold text-app uppercase tracking-wider mb-3">Project Details</h3>
          <div class="space-y-3">
            <FormField label="Name">
              <Input v-model="form.name" placeholder="My Project" />
            </FormField>
            <FormField label="Description">
              <Textarea v-model="form.description" :rows="2" placeholder="Brief description..." />
            </FormField>
          </div>
        </section>

        <!-- Tech Stack Summary -->
        <section v-if="plan?.decisions">
          <h3 class="text-sm font-semibold text-app uppercase tracking-wider mb-3">Tech Stack</h3>
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="(value, key) in plan.decisions"
              :key="key"
              class="flex items-center gap-2 p-2 rounded-md bg-white/50 dark:bg-white/5"
            >
              <span class="text-xs text-app-muted capitalize">{{ key }}:</span>
              <span class="text-xs font-medium text-app">{{ formatDecision(value) }}</span>
            </div>
          </div>
        </section>

        <!-- Documents to Generate -->
        <section>
          <h3 class="text-sm font-semibold text-app uppercase tracking-wider mb-3">
            Documentation
            <span class="text-app-muted font-normal">({{ selectedDocs.length }} selected)</span>
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="doc in docOptions"
              :key="doc.type"
              class="flex items-center gap-3 p-3 rounded-md transition-colors text-left"
              :class="isDocSelected(doc.type)
                ? 'bg-app-accent/10 border border-app-accent/30'
                : 'bg-white/50 dark:bg-white/5 border border-transparent hover:bg-white/70 dark:hover:bg-white/10'"
              @click="toggleDoc(doc.type)"
            >
              <div
                class="w-8 h-8 rounded-md flex items-center justify-center"
                :class="isDocSelected(doc.type) ? 'bg-app-accent/20' : 'bg-white/50 dark:bg-white/10'"
              >
                <Icon :name="doc.icon" class="size-4" :class="isDocSelected(doc.type) ? 'text-app-accent' : 'text-app-muted'" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium" :class="isDocSelected(doc.type) ? 'text-app' : 'text-app-muted'">
                  {{ doc.label }}
                </p>
                <p class="text-xs text-app-muted truncate">{{ doc.description }}</p>
              </div>
              <Icon
                v-if="isDocSelected(doc.type)"
                name="i-lucide-check"
                class="size-4 text-app-accent shrink-0"
              />
            </button>
          </div>
        </section>

        <!-- Initial Tasks -->
        <section>
          <h3 class="text-sm font-semibold text-app uppercase tracking-wider mb-3">
            Initial Tasks
            <span class="text-app-muted font-normal">({{ enabledTaskCount }} enabled)</span>
          </h3>
          <p class="text-xs text-app-muted mb-3">These will be created in your Kanban board</p>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <button
              v-for="(task, index) in suggestedTasks"
              :key="index"
              class="w-full flex items-center gap-3 p-2 rounded-md transition-colors text-left"
              :class="task.enabled
                ? 'bg-white/70 dark:bg-white/10'
                : 'bg-white/30 dark:bg-white/5 opacity-60'"
              @click="toggleTask(index)"
            >
              <Icon
                :name="task.enabled ? 'i-lucide-check-square' : 'i-lucide-square'"
                class="size-4 shrink-0"
                :class="task.enabled ? 'text-app-accent' : 'text-app-muted'"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm" :class="task.enabled ? 'text-app' : 'text-app-muted'">{{ task.title }}</p>
              </div>
              <span
                class="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded"
                :class="getPriorityColor(task.priority)"
              >
                {{ task.priority }}
              </span>
            </button>
          </div>
        </section>

        <!-- Spaces -->
        <section>
          <h3 class="text-sm font-semibold text-app uppercase tracking-wider mb-3">Enable Spaces</h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="space in availableSpaces"
              :key="space.value"
              class="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors"
              :class="form.spaces.includes(space.value)
                ? 'bg-app-accent/10 text-app-accent border border-app-accent/30'
                : 'bg-white/50 dark:bg-white/5 text-app-muted border border-transparent hover:text-app'"
              @click="toggleSpace(space.value)"
            >
              <Icon :name="space.icon" class="size-4" />
              <span class="text-sm">{{ space.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="w-full">
        <!-- Progress bar when kicking -->
        <div v-if="isKicking" class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-app-muted">{{ progressMessage }}</span>
            <span class="text-sm font-medium text-app">{{ progress }}%</span>
          </div>
          <div class="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              class="h-full bg-app-accent transition-all duration-300"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <button
            class="text-sm text-app-muted hover:text-app transition-colors"
            :disabled="isKicking"
            @click="open = false"
          >
            Cancel
          </button>
          <Button
            :loading="isKicking"
            :disabled="!canSubmit"
            @click="handleCreate"
          >
            <template #leading>
              <Icon name="i-lucide-rocket" class="size-4" />
            </template>
            Create Project
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>
