<script setup lang="ts">
/**
 * AddTaskModal - Quick-add modal for creating new tasks
 * Supports title, description, status, priority, and due date
 */
import { TASK_STATUSES, TASK_PRIORITIES, useTasksStore } from '~/stores/tasks'

interface Props {
  open: boolean
  defaultStatus?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultStatus: 'backlog'
})

const emit = defineEmits<{
  (e: 'close' | 'created'): void
  (e: 'update:open', value: boolean): void
}>()

// Computed wrapper for Modal's v-model:open
const isOpen = computed({
  get: () => props.open,
  set: (value) => {
    if (!value) emit('close')
    emit('update:open', value)
  }
})

const projectStore = useProjectStore()
const tasksStore = useTasksStore()

// Form state
const title = ref('')
const description = ref('')
const defaultStatusRef = toRef(props, 'defaultStatus')
const status = ref<string>(defaultStatusRef.value)
const priority = ref<string>('medium')
const dueDate = ref('')
const creating = ref(false)
const error = ref('')

// Reset form when opened
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    title.value = ''
    description.value = ''
    status.value = props.defaultStatus
    priority.value = 'medium'
    dueDate.value = ''
    error.value = ''
    creating.value = false

    // Focus title input
    nextTick(() => {
      titleInputRef.value?.focus()
    })
  }
})

// Update default status when prop changes
watch(() => props.defaultStatus, (newDefault) => {
  if (props.open) {
    status.value = newDefault
  }
})

const titleInputRef = ref<HTMLInputElement | null>(null)

// Status options
const statusOptions = TASK_STATUSES.map(s => ({
  label: s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
  value: s
}))

// Priority options with color indicators
const priorityOptions = TASK_PRIORITIES.map(p => ({
  label: p.charAt(0).toUpperCase() + p.slice(1),
  value: p
}))

// Validation
const isValid = computed(() => title.value.trim().length > 0)

// Create task
const handleCreate = async () => {
  if (!isValid.value) return

  const projectId = projectStore.currentProject?.id
  if (!projectId) {
    error.value = 'No active project'
    return
  }

  creating.value = true
  error.value = ''

  try {
    const result = await tasksStore.createTask({
      project_id: Number(projectId),
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      status: status.value,
      priority: priority.value,
      due_date: dueDate.value || undefined
    })

    if (result.success) {
      emit('created')
      emit('close')
    } else {
      error.value = result.error || 'Failed to create task'
    }
  } catch (e) {
    error.value = (e as Error).message || 'An unexpected error occurred'
  } finally {
    creating.value = false
  }
}

// Close modal
const handleClose = () => {
  emit('close')
}

// Keyboard shortcut: Cmd/Ctrl+Enter to create
const onKeydown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    handleCreate()
  }
}
</script>

<template>
  <Modal v-model:open="isOpen" @keydown="onKeydown">
    <template #content>
      <div class="p-5">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-5">
          <div class="size-8 rounded-lg bg-app-accent/10 flex items-center justify-center">
            <Icon name="i-lucide-plus" class="size-4 text-app-accent" />
          </div>
          <h2 class="text-lg font-semibold text-app">New Task</h2>
        </div>

        <!-- Error message -->
        <div
          v-if="error"
          class="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2"
        >
          <Icon name="i-lucide-alert-circle" class="size-4 flex-shrink-0" />
          {{ error }}
        </div>

        <!-- Form -->
        <div class="space-y-4">
          <!-- Title -->
          <FormField label="Title" required>
            <Input
              ref="titleInputRef"
              v-model="title"
              placeholder="What needs to be done?"
              icon="i-lucide-type"
              size="lg"
            />
          </FormField>

          <!-- Description -->
          <FormField label="Description">
            <Textarea
              v-model="description"
              placeholder="Add details, context, or notes (supports markdown)..."
              :rows="3"
            />
          </FormField>

          <!-- Status & Priority -->
          <div class="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <SelectMenu
                :model-value="(status as any)"
                :items="statusOptions"
                value-key="value"
                @update:model-value="(v: any) => status = v"
              />
            </FormField>

            <FormField label="Priority">
              <SelectMenu
                :model-value="(priority as any)"
                :items="priorityOptions"
                value-key="value"
                @update:model-value="(v: any) => priority = v"
              />
            </FormField>
          </div>

          <!-- Due Date -->
          <FormField label="Due Date">
            <Input
              v-model="dueDate"
              type="date"
              icon="i-lucide-calendar"
            />
          </FormField>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between mt-6 pt-4 border-t border-app">
          <span class="text-[10px] text-app-muted">
            <span class="px-1 py-0.5 rounded bg-white/[0.06] font-mono">Cmd+Enter</span> to create
          </span>
          <div class="flex gap-2">
            <Button
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="handleClose"
            />
            <Button
              label="Create Task"
              icon="i-lucide-plus"
              :disabled="!isValid || creating"
              :loading="creating"
              @click="handleCreate"
            />
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>
