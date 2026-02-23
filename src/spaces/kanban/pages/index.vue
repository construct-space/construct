<script setup lang="ts">
/**
 * Tasks Space - Kanban board page
 * Wires together KanbanBoard, TaskDetailPanel, TaskFilters, and AddTaskModal
 */
import { useTasksStore, type Task } from '~/stores/tasks'
import type { Project } from '~/stores/project'
import KanbanBoard from '../components/KanbanBoard.vue'
import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import TaskFilters from '../components/TaskFilters.vue'
import AddTaskModal from '../components/AddTaskModal.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const tasksStore = useTasksStore()
const { setPageItems, setSearch, clearToolbar } = useToolbar()
const isProjectScope = computed(() => typeof route.params.id === 'string')

// Load tasks for current project
const loading = ref(true)
const companyTasks = ref<Task[]>([])
const companyProjects = ref<Project[]>([])
const companyProjectList = computed(() =>
  projectStore.projects.filter(project => !project.spaces || project.spaces.includes('kanban'))
)

async function loadProjectTasks() {
  const projectId = projectStore.currentProject?.id
  if (projectId) {
    loading.value = true
    try {
      await tasksStore.fetchProjectTasks(projectId)
    } catch (e) {
      console.error('[Kanban] Failed to load tasks:', e)
    } finally {
      loading.value = false
    }
  } else {
    loading.value = false
  }
}

async function loadCompanyTasks() {
  loading.value = true
  try {
    if (projectStore.projects.length === 0) {
      await projectStore.fetchProjects()
    }
    companyProjects.value = companyProjectList.value.length > 0 ? companyProjectList.value : projectStore.projects
    companyTasks.value = await tasksStore.fetchMyTasks(200)
  } catch (e) {
    console.error('[Kanban] Failed to load company tasks:', e)
    companyTasks.value = []
  } finally {
    loading.value = false
  }
}

function openProjectKanban(projectId: number) {
  router.push(`/app/projects/${projectId}/kanban`)
}

const projectNameById = computed(() => {
  const map = new Map<number, string>()
  for (const project of companyProjects.value) {
    map.set(project.id, project.name)
  }
  return map
})

const filteredCompanyTasks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return companyTasks.value
  return companyTasks.value.filter(task => {
    const projectName = projectNameById.value.get(task.project_id) || ''
    return task.title.toLowerCase().includes(query)
      || projectName.toLowerCase().includes(query)
      || task.status.toLowerCase().includes(query)
  })
})

const syncToolbar = () => {
  if (isProjectScope.value) {
    setPageItems([
      {
        id: 'kanban-new-task',
        icon: 'i-lucide-plus',
        label: 'New Task',
        type: 'action',
        category: 'space',
        onClick: () => showAddModal.value = true
      },
      {
        id: 'kanban-filter',
        icon: 'i-lucide-filter',
        label: 'Filter',
        type: 'action',
        category: 'space',
        onClick: () => filtersRef.value?.toggleFilters()
      }
    ])

    setSearch('Search tasks...', (query) => {
      searchQuery.value = query
    })
    return
  }

  setPageItems([
    {
      id: 'kanban-open-projects',
      icon: 'i-lucide-folder-open',
      label: 'Projects',
      type: 'action',
      category: 'space',
      onClick: () => router.push('/app/projects')
    },
    {
      id: 'kanban-refresh',
      icon: 'i-lucide-refresh-cw',
      label: 'Refresh',
      type: 'action',
      category: 'space',
      onClick: loadCompanyTasks
    }
  ])

  setSearch('Search my tasks...', (query) => {
    searchQuery.value = query
  })
}

const loadScopeTasks = async () => {
  if (isProjectScope.value) {
    await loadProjectTasks()
    return
  }
  await loadCompanyTasks()
}

onMounted(async () => {
  syncToolbar()
  await loadScopeTasks()
})

watch(isProjectScope, async (scope, previousScope) => {
  if (scope === previousScope) return
  syncToolbar()
  await loadScopeTasks()
})

onUnmounted(() => {
  clearToolbar()
})

// Search
const searchQuery = ref('')

// Filters
const filtersRef = ref<InstanceType<typeof TaskFilters> | null>(null)
const filterPriority = ref('')
const filterAssignee = ref<number | null>(null)
const filterDueDateFrom = ref('')
const filterDueDateTo = ref('')

// Add task modal
const showAddModal = ref(false)

// Task detail panel
const selectedTask = ref<Task | null>(null)
const showDetailPanel = ref(false)

const onTaskCreated = () => {
  showAddModal.value = false
}

// Task click handler - open detail panel
const onTaskClick = (task: Task) => {
  selectedTask.value = task
  showDetailPanel.value = true
}

// Task update handler
const handleTaskUpdate = async (taskId: number, updates: Partial<Task>) => {
  await tasksStore.updateTask(taskId, updates)
  // Keep the selected task synced with the store
  if (selectedTask.value?.id === taskId) {
    const updated = tasksStore.tasks.find(t => t.id === taskId)
    if (updated) {
      selectedTask.value = { ...updated }
    }
  }
}

// Task move handler (drag-drop)
const handleTaskMove = async (taskId: number, newStatus: string, newSort: number) => {
  await tasksStore.moveTask(taskId, newStatus, newSort)
  // Keep the selected task synced
  if (selectedTask.value?.id === taskId) {
    const updated = tasksStore.tasks.find(t => t.id === taskId)
    if (updated) {
      selectedTask.value = { ...updated }
    }
  }
}

// Task delete handler
const handleTaskDelete = async (taskId: number) => {
  await tasksStore.deleteTask(taskId)
  showDetailPanel.value = false
  selectedTask.value = null
}

// Close detail panel
const closeDetailPanel = () => {
  showDetailPanel.value = false
  selectedTask.value = null
}
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <!-- Loading state -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <Icon name="i-lucide-loader" class="size-8 text-app-accent animate-spin mb-2" />
        <p class="text-app-muted text-sm">Loading tasks...</p>
      </div>
    </div>

    <template v-else-if="!isProjectScope">
      <div class="px-6 py-5 border-b border-default">
        <h2 class="text-lg font-semibold text-app">My Tasks Across Projects</h2>
        <p class="text-sm text-app-muted">Switch to a project to use the full Kanban board.</p>
      </div>

      <div v-if="filteredCompanyTasks.length === 0" class="flex-1 flex items-center justify-center px-6">
        <div class="text-center max-w-md">
          <Icon name="i-lucide-check-square" class="size-16 text-app-muted/30 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-app mb-2">No assigned tasks</h2>
          <p class="text-app-muted mb-4">
            Open a project board to create tasks and organize work.
          </p>
          <Button
            icon="i-lucide-folder-open"
            label="Open Projects"
            @click="router.push('/app/projects')"
          />
        </div>
      </div>

      <div v-else class="flex-1 overflow-y-auto p-4 space-y-3">
        <div
          v-for="task in filteredCompanyTasks"
          :key="task.id"
          class="rounded-xl border border-default bg-white/5 px-4 py-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium text-app truncate">{{ task.title }}</p>
              <p class="text-xs text-app-muted mt-1">
                {{ projectNameById.get(task.project_id) || `Project #${task.project_id}` }} · {{ task.status }} · {{ task.priority }}
              </p>
            </div>
            <Button
              icon="i-lucide-arrow-up-right"
              size="xs"
              variant="ghost"
              @click="openProjectKanban(task.project_id)"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- Empty state -->
      <div v-if="tasksStore.tasks.length === 0" class="flex-1 flex items-center justify-center px-6">
        <div class="text-center max-w-md">
          <Icon name="i-lucide-kanban" class="size-16 text-app-muted/30 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-app mb-2">No tasks yet</h2>
          <p class="text-app-muted mb-4">
            Create your first task to start organizing your project with the Kanban board.
          </p>
          <Button
            icon="i-lucide-plus"
            label="Create Task"
            @click="showAddModal = true"
          />
        </div>
      </div>

      <!-- Board with tasks -->
      <template v-else>
        <!-- Filters -->
        <TaskFilters
          ref="filtersRef"
          v-model:filter-priority="filterPriority"
          v-model:filter-assignee="filterAssignee"
          v-model:filter-due-date-from="filterDueDateFrom"
          v-model:filter-due-date-to="filterDueDateTo"
          :tasks="tasksStore.tasks"
        />

        <!-- Kanban Board -->
        <KanbanBoard
          :tasks="tasksStore.tasks"
          :search-query="searchQuery"
          :filter-priority="filterPriority"
          :filter-assignee="filterAssignee"
          :filter-due-date-from="filterDueDateFrom"
          :filter-due-date-to="filterDueDateTo"
          @task-update="handleTaskUpdate"
          @task-move="handleTaskMove"
          @task-click="onTaskClick"
        />
      </template>

      <!-- Add Task Modal -->
      <AddTaskModal
        :open="showAddModal"
        @close="showAddModal = false"
        @created="onTaskCreated"
      />

      <!-- Task Detail Panel -->
      <TaskDetailPanel
        :task="selectedTask"
        :open="showDetailPanel"
        @close="closeDetailPanel"
        @update="handleTaskUpdate"
        @delete="handleTaskDelete"
      />
    </template>
  </div>
</template>
