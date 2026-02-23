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

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as Task[],
    currentTask: null as Task | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    // Get tasks grouped by status for Kanban board
    tasksByStatus: (state) => {
      const grouped: Record<string, Task[]> = {}
      for (const status of TASK_STATUSES) {
        grouped[status] = state.tasks
          .filter(t => t.status === status)
          .sort((a, b) => a.sort - b.sort)
      }
      return grouped
    },

    // Get tasks by space
    tasksBySpace: (state) => (spaceName: string) => {
      return state.tasks.filter(t => t.space === spaceName)
    },

    // Get tasks assigned to a specific user
    tasksByAssignee: (state) => (assigneeId: number) => {
      return state.tasks.filter(t => t.assignee_id === assigneeId)
    }
  },

  actions: {
    async fetchProjectTasks(projectId: string | number) {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<{ data: Task[] }>(`/projects/${projectId}/tasks`)
        this.tasks = response.data || []
        return this.tasks
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch tasks'
        throw error
      } finally {
        this.loading = false
      }
    },

    async createTask(data: CreateTaskData) {
      this.error = null

      try {
        const api = useApi()
        const task = await api.post<Task>('/tasks', {
          ...data,
          status: data.status || 'backlog',
          priority: data.priority || 'medium'
        })
        this.tasks.push(task)
        return { success: true, data: task }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create task'
        return { success: false, error: this.error }
      }
    },

    async updateTask(taskId: number, data: UpdateTaskData) {
      this.error = null

      try {
        const api = useApi()
        const updated = await api.put<Task>(`/tasks/${taskId}`, data)
        const index = this.tasks.findIndex(t => t.id === taskId)
        if (index !== -1) {
          this.tasks[index] = updated
        }
        return { success: true, data: updated }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to update task'
        return { success: false, error: this.error }
      }
    },

    async deleteTask(taskId: number) {
      this.error = null

      try {
        const api = useApi()
        await api.delete(`/tasks/${taskId}`)
        this.tasks = this.tasks.filter(t => t.id !== taskId)
        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to delete task'
        return { success: false, error: this.error }
      }
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
        const api = useApi()
        const response = await api.get<{ data: Task[] }>(`/tasks/my?limit=${limit}`)
        return response.data || []
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch my tasks'
        return []
      } finally {
        this.loading = false
      }
    }
  }
})
