/**
 * Tasks Store
 *
 * Manages kanban tasks for the current project.
 * Persists tasks via KV storage in context DB.
 */
import { defineStore } from 'pinia'
import { useContextDB } from '@/composables/useContextDB'

export interface Task {
  id: number
  title: string
  description: string
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  project_id?: number | string
  assignee_id?: number
  created_at: string
  updated_at: string
}

export interface CreateTaskData {
  title: string
  description: string
  priority: string
  status: string
  project_id?: number | string
}

const TASKS_KV_KEY = 'tasks'

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const db = useContextDB()

  async function loadFromKV() {
    const raw = await db.kvGet(TASKS_KV_KEY)
    if (raw) {
      try {
        tasks.value = JSON.parse(raw)
      } catch {
        tasks.value = []
      }
    }
  }

  async function saveToKV() {
    await db.kvSet(TASKS_KV_KEY, JSON.stringify(tasks.value), 'tasks')
  }

  async function fetchTasks(_projectId?: number | string) {
    try {
      await loadFromKV()
      return { success: true }
    } catch (e) {
      console.error('[TasksStore] fetchTasks failed:', e)
      return { success: false, error: e }
    }
  }

  async function createTask(data: CreateTaskData) {
    try {
      const task: Task = {
        id: Date.now(),
        title: data.title,
        description: data.description,
        status: (data.status || 'backlog') as Task['status'],
        priority: (data.priority || 'medium') as Task['priority'],
        project_id: data.project_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      tasks.value.push(task)
      await saveToKV()
      return { success: true, task }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async function updateTask(id: number, updates: Partial<Task>) {
    try {
      const idx = tasks.value.findIndex(t => t.id === id)
      if (idx >= 0) {
        tasks.value[idx] = { ...tasks.value[idx], ...updates, updated_at: new Date().toISOString() }
        await saveToKV()
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  async function deleteTask(id: number) {
    try {
      tasks.value = tasks.value.filter(t => t.id !== id)
      await saveToKV()
      return { success: true }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  return {
    tasks,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
  }
})
