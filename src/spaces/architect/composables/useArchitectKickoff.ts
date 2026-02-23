/**
 * Architect Kickoff Composable
 * Handles the full project kickoff flow from PRD to project creation
 */

import type { ArchitectPlan, DocumentType } from '../utils/documentsGenerator'
import { generateDocument, getDocumentFilename, DOCUMENT_OPTIONS } from '../utils/documentsGenerator'

export interface SuggestedTask {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  enabled: boolean
}

export interface KickoffOptions {
  name: string
  description: string
  spaces: string[]
  tasks: SuggestedTask[]
  documents: DocumentType[]
  localPath?: string
}

export function useArchitectKickoff() {
  const projectStore = useProjectStore()
  const tasksStore = useTasksStore()
  const documentsStore = useDocumentsStore()
  const toast = useToast()

  const isKicking = ref(false)
  const progress = ref(0)
  const progressMessage = ref('')

  /**
   * Generate suggested tasks from the plan
   */
  function generateSuggestedTasks(plan: ArchitectPlan): SuggestedTask[] {
    const tasks: SuggestedTask[] = []
    const decisions = plan.decisions || {}
    const prd = plan.prd || {}

    // Project setup task
    tasks.push({
      title: 'Project Setup',
      description: `Initialize ${decisions.frontend || 'frontend'} project with ${decisions.backend || 'backend'} backend`,
      priority: 'high',
      enabled: true
    })

    // Database setup
    if (decisions.database) {
      tasks.push({
        title: 'Database Setup',
        description: `Configure ${decisions.database} database and schema`,
        priority: 'high',
        enabled: true
      })
    }

    // Auth setup
    if (decisions.auth?.length) {
      tasks.push({
        title: 'Authentication Setup',
        description: `Implement ${Array.isArray(decisions.auth) ? decisions.auth.join(', ') : decisions.auth} authentication`,
        priority: 'high',
        enabled: true
      })
    }

    // Core features from PRD
    if (prd.coreFeatures?.length) {
      for (const feature of prd.coreFeatures) {
        tasks.push({
          title: feature,
          description: `Implement: ${feature}`,
          priority: 'medium',
          enabled: true
        })
      }
    }

    // MVP scope items
    if (prd.mvpScope?.length) {
      for (const scope of prd.mvpScope) {
        // Avoid duplicates with core features
        if (!tasks.some(t => t.title.toLowerCase() === scope.toLowerCase())) {
          tasks.push({
            title: scope,
            description: `MVP: ${scope}`,
            priority: 'medium',
            enabled: true
          })
        }
      }
    }

    return tasks
  }

  /**
   * Get default document options based on plan
   */
  function getDefaultDocuments(): DocumentType[] {
    return DOCUMENT_OPTIONS.filter(opt => opt.default).map(opt => opt.type)
  }

  /**
   * Execute the full kickoff flow
   */
  async function kickoff(plan: ArchitectPlan, options: KickoffOptions) {
    isKicking.value = true
    progress.value = 0
    progressMessage.value = 'Starting kickoff...'

    try {
      // Step 1: Create project first
      progress.value = 20
      progressMessage.value = 'Creating project...'

      const projectResult = await projectStore.createProject({
        name: options.name,
        description: options.description,
        spaces: options.spaces
      })

      if (!projectResult.success || !projectResult.data) {
        throw new Error('Failed to create project')
      }

      const project = projectResult.data

      // Step 3: Save all selected documents to project
      progress.value = 30
      progressMessage.value = 'Saving documentation...'

      let firstDocId: number | undefined
      for (let i = 0; i < options.documents.length; i++) {
        const docType = options.documents[i]!
        const docContent = generateDocument(docType, plan)
        const docTitle = docType === 'prd' ? options.name
          : docType === 'readme' ? `${options.name} - README`
          : docType === 'architecture' ? `${options.name} - Architecture`
          : docType === 'roadmap' ? `${options.name} - Roadmap`
          : `${options.name} - Setup`

        const docResult = await documentsStore.createProjectDocument(project.id, {
          title: docTitle,
          content: docContent,
          type: docType,
          ...(docType === 'prd' ? { plan_json: JSON.stringify(plan) } : {})
        })

        if (!docResult.success) {
          console.warn(`Failed to save ${docType} document:`, docResult.error)
        } else if (!firstDocId) {
          firstDocId = docResult.data?.id
        }

        progress.value = 30 + Math.floor(((i + 1) / options.documents.length) * 20)
        progressMessage.value = `Saving ${docType.toUpperCase()}...`
      }

      const _docId = firstDocId

      // Step 4: Create tasks
      progress.value = 55
      progressMessage.value = 'Creating tasks...'

      const enabledTasks = options.tasks.filter(t => t.enabled)
      for (let i = 0; i < enabledTasks.length; i++) {
        const task = enabledTasks[i]
        if (!task) continue
        await tasksStore.createTask({
          project_id: project.id,
          title: task.title,
          description: task.description,
          status: 'backlog',
          priority: task.priority
        })
        progress.value = 55 + Math.floor(((i + 1) / enabledTasks.length) * 35)
        progressMessage.value = `Creating task: ${task.title}`
      }

      // Step 5: Save documents to local filesystem (if local path exists)
      if (options.localPath) {
        progress.value = 90
        progressMessage.value = 'Saving documentation files...'

        try {
          await saveDocumentsToProject(plan, options.documents, options.localPath)
        } catch (docError) {
          // Don't fail the whole kickoff if docs fail to save
          console.warn('Failed to save documentation files:', docError)
          toast.add({
            title: 'Warning',
            description: 'Project created but some docs could not be saved locally',
            color: 'warning'
          })
        }
      }

      progress.value = 100
      progressMessage.value = 'Complete!'

      toast.add({
        title: 'Project Created!',
        description: `${options.name} is ready with ${enabledTasks.length} tasks`,
        color: 'success'
      })

      return { success: true, project, docId: _docId }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kickoff failed'
      toast.add({
        title: 'Error',
        description: message,
        color: 'error'
      })
      return { success: false, error: message }
    } finally {
      isKicking.value = false
    }
  }

  /**
   * Save generated documents to project folder
   * Note: This is a placeholder - actual file saving would need Tauri integration
   */
  async function saveDocumentsToProject(
    plan: ArchitectPlan,
    documents: DocumentType[],
    _projectPath: string
  ) {
    // File saving is deferred - would require Tauri file system access
    // For now, just log the documents that would be created
    for (const docType of documents) {
      const _content = generateDocument(docType, plan)
      const _filename = getDocumentFilename(docType)
      // console.log(`Would save ${filename} to ${projectPath}`)
    }
  }

  return {
    // State
    isKicking,
    progress,
    progressMessage,

    // Methods
    generateSuggestedTasks,
    getDefaultDocuments,
    kickoff,

    // Constants
    DOCUMENT_OPTIONS
  }
}
