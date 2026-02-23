<script setup lang="ts">
/**
 * KanbanBoard - Production-ready Kanban board with SortableJS drag-drop
 * Supports drag between columns, task detail panel, and filtering
 */
import Sortable from 'sortablejs'
import type { Task } from '~/stores/tasks'
import { createTaskPin } from '~/stores/pinned'

const route = useRoute()
const pinnedStore = usePinnedStore()
const projectId = computed(() => route.query.project as string || '')
const { formatDateShort } = useDateFormat()

interface Props {
  tasks: Task[]
  searchQuery?: string
  filterPriority?: string
  filterAssignee?: number | null
  filterDueDateFrom?: string
  filterDueDateTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  searchQuery: '',
  filterPriority: '',
  filterAssignee: null,
  filterDueDateFrom: '',
  filterDueDateTo: ''
})

const emit = defineEmits<{
  (e: 'task-update', taskId: number, updates: Partial<Task>): void
  (e: 'task-move', taskId: number, newStatus: string, newSort: number): void
  (e: 'task-click', task: Task): void
}>()

// Column definitions
const columnDefs = [
  { id: 'backlog', title: 'Backlog', color: 'gray', icon: 'i-lucide-inbox' },
  { id: 'todo', title: 'To Do', color: 'blue', icon: 'i-lucide-circle' },
  { id: 'in_progress', title: 'In Progress', color: 'yellow', icon: 'i-lucide-loader' },
  { id: 'review', title: 'Review', color: 'purple', icon: 'i-lucide-eye' },
  { id: 'done', title: 'Done', color: 'green', icon: 'i-lucide-check-circle' },
]

// Filtered tasks based on search and filters
const filteredTasks = computed(() => {
  let tasks = props.tasks

  // Search filter
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase()
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
    )
  }

  // Priority filter
  if (props.filterPriority) {
    tasks = tasks.filter(t => t.priority === props.filterPriority)
  }

  // Assignee filter
  if (props.filterAssignee) {
    tasks = tasks.filter(t => t.assignee_id === props.filterAssignee)
  }

  // Due date range filter
  if (props.filterDueDateFrom) {
    const from = new Date(props.filterDueDateFrom)
    tasks = tasks.filter(t => {
      if (!t.due_date) return false
      return new Date(t.due_date) >= from
    })
  }
  if (props.filterDueDateTo) {
    const to = new Date(props.filterDueDateTo)
    tasks = tasks.filter(t => {
      if (!t.due_date) return false
      return new Date(t.due_date) <= to
    })
  }

  return tasks
})

// Group tasks by status
const columns = computed(() => {
  return columnDefs.map(col => ({
    ...col,
    tasks: filteredTasks.value
      .filter(t => t.status === col.id)
      .sort((a, b) => a.sort - b.sort)
  }))
})

// Priority colors and labels
const priorityConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  low: { color: 'text-gray-400', bgColor: 'bg-gray-500/20 text-gray-400', label: 'Low' },
  medium: { color: 'text-blue-400', bgColor: 'bg-blue-500/20 text-blue-400', label: 'Medium' },
  high: { color: 'text-orange-400', bgColor: 'bg-orange-500/20 text-orange-400', label: 'High' },
  urgent: { color: 'text-red-400', bgColor: 'bg-red-500/20 text-red-400', label: 'Urgent' },
}

const defaultPriority = { color: 'text-blue-400', bgColor: 'bg-blue-500/20 text-blue-400', label: 'Medium' }
const getPriorityConfig = (priority: string): { color: string; bgColor: string; label: string } => {
  return priorityConfig[priority] ?? defaultPriority
}

// Column header colors
const columnHeaderColors: Record<string, string> = {
  gray: 'border-t-gray-500',
  blue: 'border-t-blue-500',
  yellow: 'border-t-yellow-500',
  purple: 'border-t-purple-500',
  green: 'border-t-green-500',
}

const columnCountColors: Record<string, string> = {
  gray: 'bg-gray-500/20 text-gray-400',
  blue: 'bg-blue-500/20 text-blue-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  purple: 'bg-purple-500/20 text-purple-400',
  green: 'bg-green-500/20 text-green-400',
}

// Due date proximity styling
const getDueDateClass = (dueDate: string) => {
  if (!dueDate) return ''
  const now = new Date()
  const due = new Date(dueDate)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'text-red-400'
  if (diffDays <= 2) return 'text-orange-400'
  if (diffDays <= 7) return 'text-yellow-400'
  return 'text-app-muted'
}

// Format assignee initials
const getAssigneeInitials = (task: Task) => {
  if (!task.assignee) return null
  const first = task.assignee.first_name?.[0] || ''
  const last = task.assignee.last_name?.[0] || ''
  return (first + last).toUpperCase() || null
}

const getAssigneeName = (task: Task) => {
  if (!task.assignee) return null
  return `${task.assignee.first_name} ${task.assignee.last_name}`.trim()
}

// SortableJS integration
const columnRefs = ref<Record<string, HTMLElement | null>>({})
const sortableInstances = ref<Sortable[]>([])

const setColumnRef = (el: HTMLElement | null, columnId: string) => {
  if (el) {
    columnRefs.value[columnId] = el
  }
}

const initSortable = () => {
  // Destroy existing instances
  sortableInstances.value.forEach(s => s.destroy())
  sortableInstances.value = []

  nextTick(() => {
    columnDefs.forEach(col => {
      const el = columnRefs.value[col.id]
      if (!el) return

      const sortable = Sortable.create(el, {
        group: 'kanban-tasks',
        animation: 200,
        ghostClass: 'kanban-ghost',
        chosenClass: 'kanban-chosen',
        dragClass: 'kanban-drag',
        handle: '.task-card',
        onEnd: (evt) => {
          const taskId = Number(evt.item.dataset.taskId)
          const toColumnId = evt.to.dataset.columnId
          const newIndex = evt.newIndex ?? 0

          if (!taskId || !toColumnId) return

          // Calculate new sort value based on position
          const targetColumnTasks = columns.value.find(c => c.id === toColumnId)?.tasks || []
          let newSort: number

          if (targetColumnTasks.length === 0) {
            newSort = 0
          } else if (newIndex === 0) {
            const firstTask = targetColumnTasks[0]
            newSort = firstTask ? firstTask.sort - 1 : 0
          } else if (newIndex >= targetColumnTasks.length) {
            const lastTask = targetColumnTasks[targetColumnTasks.length - 1]
            newSort = lastTask ? lastTask.sort + 1 : newIndex
          } else {
            const prevTask = targetColumnTasks[newIndex - 1]
            const nextTask = targetColumnTasks[newIndex]
            if (prevTask && nextTask) {
              newSort = (prevTask.sort + nextTask.sort) / 2
            } else {
              newSort = newIndex
            }
          }

          emit('task-move', taskId, toColumnId, newSort)
        }
      })

      sortableInstances.value.push(sortable)
    })
  })
}

onMounted(() => {
  initSortable()
})

onBeforeUnmount(() => {
  sortableInstances.value.forEach(s => s.destroy())
})

// Re-initialize sortable when tasks change (columns re-render)
watch(() => props.tasks.length, () => {
  nextTick(() => {
    initSortable()
  })
})

// Handle task click
const onTaskClick = (task: Task) => {
  emit('task-click', task)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Board -->
    <div class="flex-1 overflow-x-auto p-4">
      <div class="flex gap-4 h-full min-w-max">
        <!-- Columns -->
        <div
          v-for="column in columns"
          :key="column.id"
          class="w-72 flex flex-col rounded-xl bg-white/[0.03] border border-white/[0.06]"
        >
          <!-- Column Header -->
          <div
            class="px-3 py-2.5 border-t-2 rounded-t-xl"
            :class="columnHeaderColors[column.color]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon :name="column.icon" class="size-4 text-app-muted" />
                <h3 class="font-medium text-app text-sm">{{ column.title }}</h3>
              </div>
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :class="columnCountColors[column.color]"
              >
                {{ column.tasks.length }}
              </span>
            </div>
          </div>

          <!-- Task List (SortableJS container) -->
          <div
            :ref="(el: any) => setColumnRef(el as HTMLElement, column.id)"
            :data-column-id="column.id"
            class="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]"
          >
            <div
              v-for="task in column.tasks"
              :key="task.id"
              :data-task-id="task.id"
              class="task-card group bg-white/[0.05] hover:bg-white/[0.08] rounded-lg p-3 border border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-all duration-150"
              @click="onTaskClick(task)"
            >
              <!-- Priority Badge + Pin -->
              <div class="flex items-center justify-between mb-2">
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  :class="getPriorityConfig(task.priority).bgColor"
                >
                  {{ getPriorityConfig(task.priority).label }}
                </span>
                <button
                  class="p-0.5 rounded hover:bg-white/10 transition-colors"
                  :class="pinnedStore.isPinned(`task-${projectId}-${task.id}`) ? 'text-app-accent' : 'text-app-muted opacity-0 group-hover:opacity-100'"
                  :title="pinnedStore.isPinned(`task-${projectId}-${task.id}`) ? 'Unpin' : 'Pin'"
                  @click.stop="pinnedStore.togglePin(createTaskPin({ id: task.id, title: task.title, projectId, priority: task.priority, status: task.status, description: task.description }))"
                >
                  <Icon
                    :name="pinnedStore.isPinned(`task-${projectId}-${task.id}`) ? 'i-lucide-pin-off' : 'i-lucide-pin'"
                    class="size-3"
                  />
                </button>
              </div>

              <!-- Title -->
              <h4 class="text-sm text-app font-medium mb-1.5 line-clamp-2">{{ task.title }}</h4>

              <!-- Description preview -->
              <p v-if="task.description" class="text-xs text-app-muted mb-2.5 line-clamp-2">
                {{ task.description }}
              </p>

              <!-- Footer: Assignee + Due Date -->
              <div class="flex items-center justify-between mt-auto">
                <!-- Assignee -->
                <div v-if="getAssigneeInitials(task)" class="flex items-center gap-1.5">
                  <div
                    class="size-5 rounded-full bg-app-accent/20 text-app-accent flex items-center justify-center text-[9px] font-bold"
                    :title="getAssigneeName(task) || ''"
                  >
                    {{ getAssigneeInitials(task) }}
                  </div>
                  <span class="text-[11px] text-app-muted truncate max-w-[100px]">
                    {{ getAssigneeName(task) }}
                  </span>
                </div>
                <div v-else />

                <!-- Due Date -->
                <span
                  v-if="task.due_date"
                  class="flex items-center gap-1 text-[11px]"
                  :class="getDueDateClass(task.due_date)"
                >
                  <Icon name="i-lucide-calendar" class="size-3" />
                  {{ formatDateShort(task.due_date) }}
                </span>
              </div>
            </div>

            <!-- Empty column state -->
            <div
              v-if="column.tasks.length === 0"
              class="flex flex-col items-center justify-center py-8 text-app-muted"
            >
              <Icon name="i-lucide-inbox" class="size-8 mb-2 opacity-30" />
              <span class="text-xs">No tasks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* SortableJS ghost/drag classes */
:deep(.kanban-ghost) {
  opacity: 0.3;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
}

:deep(.kanban-chosen) {
  opacity: 0.8;
}

:deep(.kanban-drag) {
  opacity: 0.9;
  transform: rotate(2deg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}
</style>
