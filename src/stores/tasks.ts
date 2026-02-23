import { defineStore } from 'pinia'

export interface Task {
  id: number
  title: string
  description: string
  status: string
  priority: string
  space: string
  due_date: string
  sort: number
  project_id: number
  assignee_id?: number
  assignee?: {
    id: number
    first_name: string
    last_name: string
    email: string
  }
  created_at: string
  updated_at: string
}

export interface CreateTaskData {
  title: string
  description?: string
  status?: string
  priority?: string
  space?: string
  due_date?: string
  sort?: number
  project_id: number
  assignee_id?: number
}

export interface UpdateTaskData {
  title?: string
  description?: string
  status?: string
  priority?: string
  space?: string
  due_date?: string
  sort?: number
  assignee_id?: number | null
}

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const STORAGE_KEY = 'cp_tasks'

let nextId = 1

function loadFromStorage(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const tasks = JSON.parse(raw) as Task[]
    // Update nextId to be higher than any existing id
    for (const t of tasks) {
      if (t.id >= nextId) nextId = t.id + 1
    }
    return tasks
  } catch {
    return []
  }
}

function saveToStorage(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: loadFromStorage(),
    currentTask: null as Task | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    tasksByStatus: (state) => {
      const grouped: Record<string, Task[]> = {}
      for (const status of TASK_STATUSES) {
        grouped[status] = state.tasks
          .filter(t => t.status === status)
          .sort((a, b) => a.sort - b.sort)
      }
      return grouped
    },

    tasksBySpace: (state) => (spaceName: string) => {
      return state.tasks.filter(t => t.space === spaceName)
    },

    tasksByAssignee: (state) => (assigneeId: number) => {
      return state.tasks.filter(t => t.assignee_id === assigneeId)
    }
  },

  actions: {
    async fetchProjectTasks(projectId: string | number) {
      this.loading = true
      this.error = null
      try {
        // Local-only: filter tasks by project_id
        const pid = typeof projectId === 'string' ? Number(projectId) || 0 : projectId
        this.tasks = loadFromStorage().filter(t => t.project_id === pid)
        return this.tasks
      } finally {
        this.loading = false
      }
    },

    async createTask(data: CreateTaskData) {
      this.error = null
      const task: Task = {
        id: nextId++,
        title: data.title,
        description: data.description || '',
        status: data.status || 'backlog',
        priority: data.priority || 'medium',
        space: data.space || '',
        due_date: data.due_date || '',
        sort: data.sort || 0,
        project_id: data.project_id,
        assignee_id: data.assignee_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      // Load all tasks (not just filtered), add, save
      const all = loadFromStorage()
      all.push(task)
      saveToStorage(all)
      this.tasks.push(task)
      return { success: true as const, data: task }
    },

    async updateTask(taskId: number, data: UpdateTaskData) {
      this.error = null
      const all = loadFromStorage()
      const index = all.findIndex(t => t.id === taskId)
      if (index === -1) {
        return { success: false as const, error: 'Task not found' }
      }
      Object.assign(all[index], data, { updated_at: new Date().toISOString() })
      saveToStorage(all)

      const localIdx = this.tasks.findIndex(t => t.id === taskId)
      if (localIdx !== -1) {
        this.tasks[localIdx] = { ...all[index] }
      }
      return { success: true as const, data: all[index] }
    },

    async deleteTask(taskId: number) {
      this.error = null
      const all = loadFromStorage().filter(t => t.id !== taskId)
      saveToStorage(all)
      this.tasks = this.tasks.filter(t => t.id !== taskId)
      return { success: true as const }
    },

    async moveTask(taskId: number, newStatus: string, newSort: number) {
      return this.updateTask(taskId, { status: newStatus, sort: newSort })
    },

    async assignTask(taskId: number, assigneeId: number | null) {
      return this.updateTask(taskId, { assignee_id: assigneeId })
    },

    clearTasks() {
      this.tasks = []
      this.currentTask = null
    },

    async fetchMyTasks(limit = 10) {
      this.loading = true
      this.error = null
      try {
        const all = loadFromStorage()
        return all.slice(0, limit)
      } finally {
        this.loading = false
      }
    }
  }
})
