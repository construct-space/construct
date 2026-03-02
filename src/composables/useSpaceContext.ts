/**
 * Space Context Aggregator
 *
 * Gathers context from all active spaces (code, UI, tasks, notes, git, docs, chat)
 * and provides it in a format suitable for the AI assistant. This bridges the
 * siloed space stores into a unified context view.
 *
 * Design principles:
 * - Lightweight: references and summaries only, no large data copies
 * - Graceful degradation: handles uninitialized/empty stores
 * - Reactive: uses computed() so context updates automatically
 * - Token-conscious: summaries are concise for AI prompt budgets
 */

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type {
  SpaceContext,
  SpaceContextProject,
  SpaceContextCode,
  SpaceContextUI,
  SpaceContextTasks,
  SpaceContextNotes,
  SpaceContextGit,
  SpaceContextDocs,
} from '~/types/context'
// Space composables are provided at runtime by IIFE bundles.
// These defaults are used when a space is not installed.
const useGitRepo: () => any = () => ({ state: {}, hasChanges: ref(false) })
const useCodeEditor: () => any = () => ({ state: {} })
const useUIState: () => any = () => ({ nodes: ref([]), selectedIds: ref([]) })

/**
 * Maximum number of recent items to include in context summaries.
 * Keeps AI token usage reasonable while providing useful context.
 */
const MAX_RECENT_TASKS = 5
const MAX_RECENT_NOTES = 3
const MAX_RECENT_COMMITS = 5
const MAX_FILE_PREVIEW_CHARS = 500
const MAX_NOTE_CONTENT_CHARS = 150
const MAX_DOC_CONTENT_CHARS = 300

export function useSpaceContext() {
  // ---------------------------------------------------------------------------
  // Store access (safe: Pinia stores return defaults if not yet hydrated)
  // ---------------------------------------------------------------------------
  const projectStore = useProjectStore()
  const tasksStore = useTasksStore()
  const notesStore = useNotesStore()
  const documentsStore = useDocumentsStore()
  // storeToRefs preserves reactivity for state properties
  const { currentProject } = storeToRefs(projectStore)
  const { tasks, currentTask } = storeToRefs(tasksStore)
  const { notes } = storeToRefs(notesStore)
  const { documents, currentDocument } = storeToRefs(documentsStore)

  // Space composables use module-level reactive state, so calling them is safe
  const { state: codeState } = useCodeEditor()
  const { nodes, selectedIds } = useUIState()
  const { state: gitState, hasChanges: gitHasChanges } = useGitRepo()

  // ---------------------------------------------------------------------------
  // Context for each space (computed for reactivity)
  // ---------------------------------------------------------------------------

  const projectContext = computed((): SpaceContextProject | null => {
    const p = currentProject.value
    if (!p) return null
    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      spaces: Array.isArray(p.spaces) ? p.spaces : [],
      localPath: p.local_path || undefined,
    }
  })

  const codeContext = computed((): SpaceContextCode => {
    const file = codeState.currentFile || null
    const content = codeState.fileContent || ''
    return {
      currentFile: file,
      language: file ? (codeState.currentLanguage || null) : null,
      selectedText: null, // Code editor selection is transient; not stored in state
      openFiles: file ? [file] : [], // Currently single-file; ready for multi-tab
      filePreview: content
        ? content.slice(0, MAX_FILE_PREVIEW_CHARS) + (content.length > MAX_FILE_PREVIEW_CHARS ? '...' : '')
        : null,
    }
  })

  const uiContext = computed((): SpaceContextUI => {
    const allNodes = nodes.value || []
    const selected = selectedIds.value || []
    return {
      selectedNodes: selected.map((id: string) => {
        const node = allNodes.find((n: any) => n.id === id)
        return node?.name || id
      }),
      canvasNodeCount: allNodes.length,
      currentPage: null, // Multi-page state is managed in canvas; not exposed here yet
      hasUnsavedChanges: allNodes.length > 0, // Simplified: if there are nodes, assume potential changes
    }
  })

  const tasksContext = computed((): SpaceContextTasks => {
    const allTasks = tasks.value || []
    const byStatus: Record<string, number> = {}
    for (const t of allTasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1
    }

    const active = currentTask.value
    const recentTasks = allTasks
      .slice(0, MAX_RECENT_TASKS)
      .map(t => ({ id: t.id, title: t.title, status: t.status }))

    return {
      total: allTasks.length,
      byStatus,
      activeTask: active
        ? { id: active.id, title: active.title, description: active.description || '' }
        : null,
      recentTasks,
    }
  })

  const notesContext = computed((): SpaceContextNotes => {
    const allNotes = notes.value || []
    const recentNotes = allNotes
      .slice(0, MAX_RECENT_NOTES)
      .map(n => ({
        id: n.id,
        content: n.content
          ? n.content.slice(0, MAX_NOTE_CONTENT_CHARS) + (n.content.length > MAX_NOTE_CONTENT_CHARS ? '...' : '')
          : '',
        color: n.color,
      }))

    return {
      count: allNotes.length,
      recentNotes,
    }
  })

  const gitContext = computed((): SpaceContextGit => {
    const branch = gitState.currentBranch || null
    const commits = gitState.commits || []
    return {
      currentBranch: branch || null,
      hasUncommittedChanges: gitHasChanges.value,
      recentCommits: commits
        .slice(0, MAX_RECENT_COMMITS)
        .map((c: any) => c.subject || c.message || ''),
    }
  })

  const docsContext = computed((): SpaceContextDocs => {
    const allDocs = documents.value || []
    const active = currentDocument.value
    return {
      count: allDocs.length,
      activeDocument: active
        ? {
          id: active.id,
          title: active.title,
          content: active.content
            ? active.content.slice(0, MAX_DOC_CONTENT_CHARS) + (active.content.length > MAX_DOC_CONTENT_CHARS ? '...' : '')
            : '',
        }
        : null,
    }
  })

  // ---------------------------------------------------------------------------
  // Aggregated space context
  // ---------------------------------------------------------------------------

  /**
   * The active space is inferred from which space has the most recent
   * meaningful state. This is a heuristic; the actual active space tab
   * is managed by the router/layout, but we can approximate it.
   */
  const activeSpace = computed((): string => {
    // Prioritize spaces with active content
    if (codeState.currentFile) return 'code'
    if ((nodes.value || []).length > 0 && (selectedIds.value || []).length > 0) return 'design'
    if (gitState.currentRepoPath) return 'git'
    if (currentDocument.value) return 'docs'
    if (currentTask.value) return 'tasks'
    if ((notes.value || []).length > 0) return 'notes'
    return 'code' // Default fallback
  })

  const spaceContext = computed((): SpaceContext => ({
    activeSpace: activeSpace.value,
    project: projectContext.value,
    code: codeContext.value,
    ui: uiContext.value,
    tasks: tasksContext.value,
    notes: notesContext.value,
    git: gitContext.value,
    docs: docsContext.value,
  }))

  // ---------------------------------------------------------------------------
  // Context summary for AI system prompts
  // ---------------------------------------------------------------------------

  /**
   * Returns a concise text summary of the current context, suitable for
   * inclusion in an AI system prompt. Keeps token usage low by only
   * including non-empty/non-default sections.
   */
  function getContextSummary(): string {
    const ctx = spaceContext.value
    const parts: string[] = []

    // Project
    if (ctx.project) {
      parts.push(`Project: "${ctx.project.name}" (ID: ${ctx.project.id})${ctx.project.description ? ' - ' + ctx.project.description : ''}`)
      if (ctx.project.spaces.length > 0) {
        parts.push(`Enabled spaces: ${ctx.project.spaces.join(', ')}`)
      }
      if (ctx.project.localPath) {
        parts.push(`Local path: ${ctx.project.localPath}`)
      }
    }

    // Active space
    parts.push(`Active space: ${ctx.activeSpace}`)

    // Code
    if (ctx.code.currentFile) {
      parts.push(`Code: editing "${ctx.code.currentFile}" (${ctx.code.language || 'unknown'})`)
      if (ctx.code.filePreview) {
        parts.push(`File preview:\n\`\`\`\n${ctx.code.filePreview}\n\`\`\``)
      }
    }

    // UI/Design
    if (ctx.ui.canvasNodeCount > 0) {
      parts.push(`UI Canvas: ${ctx.ui.canvasNodeCount} nodes${ctx.ui.selectedNodes.length > 0 ? ', selected: ' + ctx.ui.selectedNodes.join(', ') : ''}`)
    }

    // Tasks
    if (ctx.tasks.total > 0) {
      const statusSummary = Object.entries(ctx.tasks.byStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ')
      parts.push(`Tasks: ${ctx.tasks.total} total (${statusSummary})`)
      if (ctx.tasks.activeTask) {
        parts.push(`Active task: "${ctx.tasks.activeTask.title}"${ctx.tasks.activeTask.description ? ' - ' + ctx.tasks.activeTask.description : ''}`)
      }
    }

    // Notes
    if (ctx.notes.count > 0) {
      parts.push(`Notes: ${ctx.notes.count} sticky notes`)
    }

    // Git
    if (ctx.git.currentBranch) {
      parts.push(`Git: branch "${ctx.git.currentBranch}"${ctx.git.hasUncommittedChanges ? ' (uncommitted changes)' : ' (clean)'}`)
      if (ctx.git.recentCommits.length > 0) {
        parts.push(`Recent commits: ${ctx.git.recentCommits.map(m => `"${m}"`).join(', ')}`)
      }
    }

    // Docs
    if (ctx.docs.count > 0) {
      parts.push(`Documents: ${ctx.docs.count} docs`)
      if (ctx.docs.activeDocument) {
        parts.push(`Viewing: "${ctx.docs.activeDocument.title}"`)
      }
    }

    return parts.join('\n')
  }

  // ---------------------------------------------------------------------------
  // Space-relevant context filtering
  // ---------------------------------------------------------------------------

  /**
   * Returns context most relevant to a specific space. This is useful
   * when the AI needs focused context for a particular task domain.
   */
  function getRelevantContext(space: string): Partial<SpaceContext> {
    const ctx = spaceContext.value
    const base: Partial<SpaceContext> = {
      activeSpace: ctx.activeSpace,
      project: ctx.project,
    }

    switch (space) {
      case 'code':
        return {
          ...base,
          code: ctx.code,
          git: ctx.git,
          tasks: ctx.tasks, // Tasks often relate to code work
        }

      case 'ui':
      case 'design':
        return {
          ...base,
          ui: ctx.ui,
          code: ctx.code, // Design references code components
        }

      case 'kanban':
      case 'tasks':
        return {
          ...base,
          tasks: ctx.tasks,
          git: ctx.git, // Commits relate to tasks
          docs: ctx.docs, // Docs may contain requirements
        }

      case 'notes':
        return {
          ...base,
          notes: ctx.notes,
          tasks: ctx.tasks, // Notes often accompany tasks
        }

      case 'git':
        return {
          ...base,
          git: ctx.git,
          code: ctx.code, // Git changes relate to code
          tasks: ctx.tasks, // Commits relate to tasks
        }

      case 'docs':
        return {
          ...base,
          docs: ctx.docs,
          tasks: ctx.tasks, // Docs may reference tasks
          code: ctx.code, // Architecture docs reference code
        }

      default:
        return ctx
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  return {
    /** Reactive aggregated context from all spaces */
    spaceContext,

    /** Text summary for AI system prompts */
    getContextSummary,

    /** Filtered context relevant to a specific space */
    getRelevantContext,

    /** Individual space contexts (for granular access) */
    projectContext,
    codeContext,
    uiContext,
    tasksContext,
    notesContext,
    gitContext,
    docsContext,
    activeSpace,
  }
}
