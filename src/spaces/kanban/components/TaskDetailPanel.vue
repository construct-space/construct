<script setup lang="ts">
/**
 * TaskDetailPanel - Slide-out panel for viewing and editing a task
 * Shows full task details with inline editing for all fields
 */
import type { Task } from '~/stores/tasks'
import { TASK_STATUSES, TASK_PRIORITIES } from '~/stores/tasks'

const { renderMarkdown, initModules } = useMarkdown()
const { formatDate } = useDateFormat()

// Initialize markdown renderer
onMounted(() => {
  initModules()
})

interface Props {
  task: Task | null
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', taskId: number, updates: Partial<Task>): void
  (e: 'delete', taskId: number): void
}>()

// Local edit state - synced from task prop
const editTitle = ref('')
const editDescription = ref('')
const editStatus = ref('')
const editPriority = ref('')
const editDueDate = ref('')
const editAssigneeId = ref<number | null>(null)

const isEditingTitle = ref(false)
const isEditingDescription = ref(false)
const showDeleteConfirm = ref(false)
const saving = ref(false)

// Sync local state when task changes
watch(() => props.task, (newTask) => {
  if (newTask) {
    editTitle.value = newTask.title
    editDescription.value = newTask.description || ''
    editStatus.value = newTask.status
    editPriority.value = newTask.priority
    editDueDate.value = newTask.due_date || ''
    editAssigneeId.value = newTask.assignee_id || null
    isEditingTitle.value = false
    isEditingDescription.value = false
    showDeleteConfirm.value = false
  }
}, { immediate: true })

// Status options
const statusOptions = TASK_STATUSES.map(s => ({
  label: s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
  value: s
}))

// Priority options
const priorityOptions = TASK_PRIORITIES.map(p => ({
  label: p.charAt(0).toUpperCase() + p.slice(1),
  value: p
}))

// Status icons
const statusIcons: Record<string, string> = {
  backlog: 'i-lucide-inbox',
  todo: 'i-lucide-circle',
  in_progress: 'i-lucide-loader',
  review: 'i-lucide-eye',
  done: 'i-lucide-check-circle',
}

// Rendered markdown description
const renderedDescription = computed(() => {
  if (!editDescription.value) return ''
  return renderMarkdown(editDescription.value)
})

// Save individual field
const saveField = async (field: string, value: unknown) => {
  if (!props.task) return
  saving.value = true
  try {
    emit('update', props.task.id, { [field]: value })
  } finally {
    saving.value = false
  }
}

// Title editing
const titleInputRef = ref<HTMLInputElement | null>(null)

const startEditingTitle = () => {
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
  })
}

const saveTitle = () => {
  if (!editTitle.value.trim()) {
    editTitle.value = props.task?.title || ''
    isEditingTitle.value = false
    return
  }
  if (editTitle.value !== props.task?.title) {
    saveField('title', editTitle.value.trim())
  }
  isEditingTitle.value = false
}

// Description editing
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)

const startEditingDescription = () => {
  isEditingDescription.value = true
  nextTick(() => {
    descriptionTextareaRef.value?.focus()
  })
}

const saveDescription = () => {
  if (editDescription.value !== (props.task?.description || '')) {
    saveField('description', editDescription.value)
  }
  isEditingDescription.value = false
}

// Status change
const onStatusChange = (value: string) => {
  editStatus.value = value
  saveField('status', value)
}

// Priority change
const onPriorityChange = (value: string) => {
  editPriority.value = value
  saveField('priority', value)
}

// Due date change
const onDueDateChange = () => {
  saveField('due_date', editDueDate.value || null)
}

// Clear due date
const clearDueDate = () => {
  editDueDate.value = ''
  saveField('due_date', null)
}

// Delete task
const confirmDelete = () => {
  if (!props.task) return
  emit('delete', props.task.id)
  showDeleteConfirm.value = false
  emit('close')
}

// Close panel
const close = () => {
  isEditingTitle.value = false
  isEditingDescription.value = false
  showDeleteConfirm.value = false
  emit('close')
}

// Keyboard shortcut to close
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (isEditingTitle.value) {
      isEditingTitle.value = false
    } else if (isEditingDescription.value) {
      isEditingDescription.value = false
    } else {
      close()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- Backdrop -->
  <Transition name="fade">
    <div
      v-if="open && task"
      class="fixed inset-0 bg-black/50 z-40"
      @click="close"
    />
  </Transition>

  <!-- Slide-out Panel -->
  <Transition name="slide">
    <div
      v-if="open && task"
      class="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-app border-l border-app z-50 flex flex-col shadow-2xl"
    >
      <!-- Panel Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-app">
        <div class="flex items-center gap-2">
          <Icon :name="statusIcons[task.status] || 'i-lucide-circle'" class="size-4 text-app-muted" />
          <span class="text-xs text-app-muted uppercase tracking-wider font-medium">
            Task #{{ task.id }}
          </span>
          <span v-if="saving" class="text-xs text-app-accent">Saving...</span>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            @click="close"
          />
        </div>
      </div>

      <!-- Panel Content -->
      <div class="flex-1 overflow-y-auto">
        <div class="p-5 space-y-6">
          <!-- Title -->
          <div>
            <div v-if="isEditingTitle" class="flex items-center gap-2">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                class="flex-1 text-xl font-semibold text-app bg-transparent border-b-2 border-app-accent outline-none pb-1"
                @keydown.enter="saveTitle"
                @blur="saveTitle"
              >
            </div>
            <h2
              v-else
              class="text-xl font-semibold text-app cursor-pointer hover:text-app-accent transition-colors"
              @click="startEditingTitle"
            >
              {{ task.title }}
            </h2>
          </div>

          <!-- Status & Priority Row -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Status -->
            <div>
              <label class="text-xs text-app-muted uppercase tracking-wider font-medium mb-1.5 block">Status</label>
              <SelectMenu
                :model-value="editStatus as any"
                :items="statusOptions"
                value-key="value"
                class="w-full"
                @update:model-value="onStatusChange"
              />
            </div>

            <!-- Priority -->
            <div>
              <label class="text-xs text-app-muted uppercase tracking-wider font-medium mb-1.5 block">Priority</label>
              <SelectMenu
                :model-value="editPriority as any"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
                @update:model-value="onPriorityChange"
              />
            </div>
          </div>

          <!-- Due Date -->
          <div>
            <label class="text-xs text-app-muted uppercase tracking-wider font-medium mb-1.5 block">Due Date</label>
            <div class="flex items-center gap-2">
              <Input
                v-model="editDueDate"
                type="date"
                class="flex-1"
                @change="onDueDateChange"
              />
              <Button
                v-if="editDueDate"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-x"
                title="Clear due date"
                @click="clearDueDate"
              />
            </div>
            <p v-if="task.due_date" class="text-xs text-app-muted mt-1">
              {{ formatDate(task.due_date) }}
            </p>
          </div>

          <!-- Assignee -->
          <div>
            <label class="text-xs text-app-muted uppercase tracking-wider font-medium mb-1.5 block">Assignee</label>
            <div v-if="task.assignee" class="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div class="size-7 rounded-full bg-app-accent/20 text-app-accent flex items-center justify-center text-xs font-bold">
                {{ (task.assignee.first_name?.[0] || '') + (task.assignee.last_name?.[0] || '') }}
              </div>
              <div>
                <p class="text-sm text-app font-medium">{{ task.assignee.first_name }} {{ task.assignee.last_name }}</p>
                <p class="text-xs text-app-muted">{{ task.assignee.email }}</p>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <Icon name="i-lucide-user" class="size-5 text-app-muted" />
              <span class="text-sm text-app-muted">Unassigned</span>
            </div>
          </div>

          <!-- Description -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs text-app-muted uppercase tracking-wider font-medium">Description</label>
              <Button
                v-if="!isEditingDescription"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-pencil"
                label="Edit"
                @click="startEditingDescription"
              />
              <Button
                v-else
                variant="ghost"
                size="xs"
                icon="i-lucide-check"
                label="Done"
                @click="saveDescription"
              />
            </div>

            <!-- Edit mode -->
            <div v-if="isEditingDescription">
              <textarea
                ref="descriptionTextareaRef"
                v-model="editDescription"
                rows="8"
                class="w-full rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-sm text-app placeholder-app-muted focus:outline-none focus:border-app-accent resize-y"
                placeholder="Write a description using markdown..."
                @keydown.meta.enter="saveDescription"
                @keydown.ctrl.enter="saveDescription"
              />
              <p class="text-[10px] text-app-muted mt-1">
                Supports Markdown. Press Cmd/Ctrl+Enter to save.
              </p>
            </div>

            <!-- Preview mode -->
            <div v-else>
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="renderedDescription"
                class="prose prose-sm prose-invert max-w-none p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors"
                @click="startEditingDescription"
                v-html="renderedDescription"
              />
              <!-- eslint-enable vue/no-v-html -->
              <div
                v-else
                class="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors"
                @click="startEditingDescription"
              >
                <span class="text-sm text-app-muted italic">Click to add description...</span>
              </div>
            </div>
          </div>

          <!-- Metadata -->
          <div class="pt-4 border-t border-app">
            <div class="grid grid-cols-2 gap-3 text-xs text-app-muted">
              <div>
                <span class="block uppercase tracking-wider font-medium mb-0.5">Created</span>
                <span class="text-app">{{ formatDate(task.created_at) }}</span>
              </div>
              <div>
                <span class="block uppercase tracking-wider font-medium mb-0.5">Updated</span>
                <span class="text-app">{{ formatDate(task.updated_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel Footer -->
      <div class="px-5 py-3 border-t border-app flex items-center justify-between">
        <div>
          <Button
            v-if="!showDeleteConfirm"
            variant="ghost"
            color="error"
            size="sm"
            icon="i-lucide-trash-2"
            label="Delete"
            @click="showDeleteConfirm = true"
          />
          <div v-else class="flex items-center gap-2">
            <span class="text-xs text-red-400">Delete this task?</span>
            <Button
              variant="solid"
              color="error"
              size="xs"
              label="Yes, delete"
              @click="confirmDelete"
            />
            <Button
              variant="ghost"
              color="neutral"
              size="xs"
              label="Cancel"
              @click="showDeleteConfirm = false"
            />
          </div>
        </div>
        <span class="text-[10px] text-app-muted">
          <span class="px-1 py-0.5 rounded bg-white/[0.06] font-mono">Esc</span> to close
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Slide animation */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* Fade animation for backdrop */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Markdown content styling */
:deep(.prose) {
  color: var(--text-app);
}
:deep(.prose p) {
  margin: 0.5em 0;
}
:deep(.prose code) {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15em 0.3em;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
:deep(.prose pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.75em;
  border-radius: 0.5rem;
  overflow-x: auto;
}
:deep(.prose ul, .prose ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}
:deep(.prose li) {
  margin: 0.25em 0;
}
:deep(.prose a) {
  color: var(--app-accent, #6366f1);
  text-decoration: underline;
}
:deep(.prose blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.1);
  padding-left: 1em;
  margin: 0.5em 0;
  color: rgba(255, 255, 255, 0.6);
}
</style>
