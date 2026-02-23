/**
 * useArchitectActions - Cross-space integrations for Architect
 *
 * Handles creating tasks in Kanban, initializing git repos, and creating design files.
 * Uses approval workflow for initial project setup, autonomous for smaller tasks.
 */
import type { TaskItem, PRDContent, ArchitectAction } from '../types/architect'
import { useTasksStore, type CreateTaskData } from '~/stores/tasks'
import { useLocalDesigns } from '~/spaces/design/composables/useLocalDesigns'

export interface ActionResult {
  success: boolean
  message: string
  data?: unknown
}

export interface PendingAction {
  id: string
  action: ArchitectAction
  timestamp: Date
}

export function useArchitectActions() {
  const projectStore = useProjectStore()
  const tasksStore = useTasksStore()
  const toast = useToast()

  // Pending actions awaiting approval
  const pendingActions = ref<PendingAction[]>([])
  const executingActions = ref<Set<string>>(new Set())

  // Generate unique ID for actions
  const generateActionId = () => `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  /**
   * Create tasks in Kanban from architect task list
   */
  async function createKanbanTasks(tasks: TaskItem[], options?: {
    requireApproval?: boolean
    projectId?: number
  }): Promise<ActionResult> {
    const projectId = options?.projectId || projectStore.currentProject?.id
    if (!projectId) {
      return { success: false, message: 'No project selected' }
    }

    const action: ArchitectAction = {
      id: generateActionId(),
      type: 'kanban',
      action: 'create_tasks',
      description: `Create ${tasks.length} tasks in Kanban`,
      data: { tasks, projectId },
      requiresApproval: options?.requireApproval ?? tasks.length > 3
    }

    if (action.requiresApproval) {
      pendingActions.value.push({ id: action.id, action, timestamp: new Date() })
      return {
        success: true,
        message: `${tasks.length} tasks queued for approval`,
        data: { actionId: action.id, pending: true }
      }
    }

    return executeCreateTasks(tasks, projectId)
  }

  /**
   * Execute task creation
   */
  async function executeCreateTasks(tasks: TaskItem[], projectId: number): Promise<ActionResult> {
    const results: { success: boolean; task?: unknown; error?: string }[] = []

    for (const task of tasks) {
      const taskData: CreateTaskData = {
        title: task.title,
        description: task.description || '',
        priority: mapPriority(task.priority),
        status: 'backlog',
        project_id: projectId
      }

      const result = await tasksStore.createTask(taskData)
      results.push(result)
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    if (failCount === 0) {
      toast.add({ title: 'Tasks Created', description: `${successCount} tasks added to Kanban`, color: 'success' })
      return { success: true, message: `Created ${successCount} tasks`, data: results }
    } else {
      toast.add({ title: 'Partial Success', description: `${successCount} created, ${failCount} failed`, color: 'warning' })
      return { success: false, message: `${successCount} created, ${failCount} failed`, data: results }
    }
  }

  /**
   * Initialize a git repository for the project
   */
  async function initializeGitRepo(options?: {
    requireApproval?: boolean
    repoName?: string
    template?: string
  }): Promise<ActionResult> {
    const projectPath = projectStore.currentProject?.local_path
    if (!projectPath) {
      return { success: false, message: 'No project path configured' }
    }

    const action: ArchitectAction = {
      id: generateActionId(),
      type: 'code',
      action: 'init_repo',
      description: `Initialize git repository at ${projectPath}/code`,
      data: { projectPath, repoName: options?.repoName, template: options?.template },
      requiresApproval: options?.requireApproval ?? true
    }

    if (action.requiresApproval) {
      pendingActions.value.push({ id: action.id, action, timestamp: new Date() })
      return {
        success: true,
        message: 'Git repo initialization queued for approval',
        data: { actionId: action.id, pending: true }
      }
    }

    return executeInitRepo(projectPath, options?.template)
  }

  /**
   * Execute git repo initialization
   */
  async function executeInitRepo(projectPath: string, template?: string): Promise<ActionResult> {
    if (typeof window === 'undefined') {
      return { success: false, message: 'Not in browser context' }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const codePath = `${projectPath}/code`

      // Create directory and init repo
      await invoke('run_shell_command', {
        command: 'mkdir',
        args: ['-p', codePath],
        cwd: projectPath
      })

      await invoke('run_shell_command', {
        command: 'git',
        args: ['init'],
        cwd: codePath
      })

      // If template provided, initialize with it
      if (template) {
        // Could clone from template or run scaffolding
        console.log('[useArchitectActions] Template:', template)
      }

      toast.add({ title: 'Repository Created', description: 'Git repository initialized', color: 'success' })
      return { success: true, message: 'Git repository initialized', data: { path: codePath } }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      toast.add({ title: 'Failed', description: error, color: 'error' })
      return { success: false, message: error }
    }
  }

  /**
   * Create a new design file in UI space
   */
  async function createDesignFile(options?: {
    requireApproval?: boolean
    name?: string
    template?: 'blank' | 'wireframe' | 'dashboard'
  }): Promise<ActionResult> {
    const projectId = projectStore.currentProject?.id
    if (!projectId) {
      return { success: false, message: 'No project selected' }
    }

    const designName = options?.name || 'New Design'

    const action: ArchitectAction = {
      id: generateActionId(),
      type: 'design',
      action: 'create_design',
      description: `Create design file: ${designName}`,
      data: { projectId, name: designName, template: options?.template },
      requiresApproval: options?.requireApproval ?? true
    }

    if (action.requiresApproval) {
      pendingActions.value.push({ id: action.id, action, timestamp: new Date() })
      return {
        success: true,
        message: 'Design creation queued for approval',
        data: { actionId: action.id, pending: true }
      }
    }

    return executeCreateDesign(projectId, designName, options?.template)
  }

  /**
   * Execute design file creation
   */
  async function executeCreateDesign(
    projectId: number,
    name: string,
    template?: 'blank' | 'wireframe' | 'dashboard'
  ): Promise<ActionResult> {
    try {
      const { createDesign } = useLocalDesigns()
      const design = await createDesign(projectId, name)

      // TODO: Apply template if specified
      if (template && template !== 'blank') {
        console.log('[useArchitectActions] Apply template:', template)
      }

      toast.add({ title: 'Design Created', description: `Created "${name}"`, color: 'success' })
      return { success: true, message: `Design "${name}" created`, data: design }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      toast.add({ title: 'Failed', description: error, color: 'error' })
      return { success: false, message: error }
    }
  }

  /**
   * Create a full project from PRD (combines multiple actions)
   */
  async function createProjectFromPRD(prd: PRDContent, tasks: TaskItem[], options?: {
    requireApproval?: boolean
    includeRepo?: boolean
    includeDesign?: boolean
    includeKanban?: boolean
  }): Promise<ActionResult> {
    const actions: ArchitectAction[] = []

    if (options?.includeKanban !== false && tasks.length > 0) {
      actions.push({
        id: generateActionId(),
        type: 'kanban',
        action: 'create_tasks',
        description: `Create ${tasks.length} tasks from PRD`,
        data: { tasks },
        requiresApproval: true
      })
    }

    if (options?.includeRepo !== false) {
      actions.push({
        id: generateActionId(),
        type: 'code',
        action: 'init_repo',
        description: 'Initialize git repository',
        data: { prdName: prd.name },
        requiresApproval: true
      })
    }

    if (options?.includeDesign !== false) {
      actions.push({
        id: generateActionId(),
        type: 'design',
        action: 'create_design',
        description: `Create design file: ${prd.name} UI`,
        data: { name: `${prd.name} UI` },
        requiresApproval: true
      })
    }

    // Always require approval for project creation
    for (const action of actions) {
      pendingActions.value.push({ id: action.id, action, timestamp: new Date() })
    }

    return {
      success: true,
      message: `${actions.length} actions queued for approval`,
      data: { actions: actions.map(a => a.id), pending: true }
    }
  }

  /**
   * Approve and execute a pending action
   */
  async function approveAction(actionId: string): Promise<ActionResult> {
    const pendingIdx = pendingActions.value.findIndex(p => p.id === actionId)
    if (pendingIdx === -1) {
      return { success: false, message: 'Action not found' }
    }

    const { action } = pendingActions.value[pendingIdx]!
    executingActions.value.add(actionId)

    try {
      let result: ActionResult

      switch (action.type) {
        case 'kanban': {
          const projectId = (action.data.projectId as number) || projectStore.currentProject?.id
          if (!projectId) {
            result = { success: false, message: 'No project selected' }
            break
          }
          result = await executeCreateTasks(action.data.tasks as TaskItem[], projectId)
          break
        }
        case 'code': {
          const localPath = projectStore.currentProject?.local_path
          if (!localPath) {
            result = { success: false, message: 'No project path available' }
            break
          }
          result = await executeInitRepo(localPath, action.data.template as string | undefined)
          break
        }
        case 'design': {
          const designProjectId = projectStore.currentProject?.id
          if (!designProjectId) {
            result = { success: false, message: 'No project selected' }
            break
          }
          result = await executeCreateDesign(
            designProjectId,
            action.data.name as string,
            action.data.template as 'blank' | 'wireframe' | 'dashboard' | undefined
          )
          break
        }
        default:
          result = { success: false, message: 'Unknown action type' }
      }

      // Remove from pending on success
      if (result.success) {
        pendingActions.value.splice(pendingIdx, 1)
      }

      return result
    } finally {
      executingActions.value.delete(actionId)
    }
  }

  /**
   * Reject a pending action
   */
  function rejectAction(actionId: string): ActionResult {
    const pendingIdx = pendingActions.value.findIndex(p => p.id === actionId)
    if (pendingIdx === -1) {
      return { success: false, message: 'Action not found' }
    }

    pendingActions.value.splice(pendingIdx, 1)
    return { success: true, message: 'Action rejected' }
  }

  /**
   * Approve all pending actions
   */
  async function approveAllActions(): Promise<ActionResult> {
    const results: ActionResult[] = []
    const actionIds = pendingActions.value.map(p => p.id)

    for (const actionId of actionIds) {
      const result = await approveAction(actionId)
      results.push(result)
    }

    const successCount = results.filter(r => r.success).length
    return {
      success: successCount === results.length,
      message: `${successCount}/${results.length} actions completed`,
      data: results
    }
  }

  /**
   * Map task priority from architect format to kanban format
   */
  function mapPriority(priority?: 'high' | 'medium' | 'low'): 'low' | 'medium' | 'high' | 'urgent' {
    switch (priority) {
      case 'high': return 'high'
      case 'low': return 'low'
      default: return 'medium'
    }
  }

  return {
    // State
    pendingActions: readonly(pendingActions),
    executingActions: readonly(executingActions),
    hasPendingActions: computed(() => pendingActions.value.length > 0),

    // Actions
    createKanbanTasks,
    initializeGitRepo,
    createDesignFile,
    createProjectFromPRD,

    // Approval workflow
    approveAction,
    rejectAction,
    approveAllActions
  }
}
