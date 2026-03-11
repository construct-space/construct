/**
 * useAssistantPrompt — System prompt building and context assembly for the AI Assistant.
 *
 * Handles buildSystemPrompt, buildLocalData, getReferencedDocsContext,
 * compactForLLM, and buildMessageWithToolContext.
 *
 * Extracted from AssistantFloat.vue.
 */
import type { Ref, ComputedRef, DeepReadonly } from 'vue'
import type {
  DocumentListItem,
  UIDesign,
  GitChange,
  GitCommit,
  GitRepoInfo,
  ChatMessage,
  ProjectFile,
} from '~/types/assistant'
import type { ParsedReferences, DocReference } from '~/utils/parseReferences'
import {
  getReferencedDesignsContext,
  getReferencedComponentsContext,
  getReferencedFilesContext,
  getReferencedCodeFilesContext,
  getDesignDataForAI,
} from '~/utils/parseReferences'
import { getRouteContext } from '~/composables/useAssistantCommands'
import { requestSpaceData } from '~/lib/spaceContextBus'

interface PromptDeps {
  currentSpace: ComputedRef<string | null>
  projectStore: {
    currentProject: {
      id: string | number
      name: string
      path: string
      description?: string
      spaces?: string[]
    } | null
  }
  route: { path: string; query?: Record<string, unknown> }
  currentComponent: Ref<{ name: string; type: string } | null>
  useGitRepo: () => {
    state: {
      currentRepoPath: string
      currentBranch: string
      stagedChanges: GitChange[]
      unstagedChanges: GitChange[]
      untrackedFiles: GitChange[]
      conflictedFiles: GitChange[]
      commits: GitCommit[]
    }
    currentRepo: Ref<GitRepoInfo | null>
  }
  busCurrentDoc: Ref<{ title: string; type: string; id: string | number; content?: string } | null>
  projectDocs: Ref<DocumentListItem[]>
  localDocs: Ref<{ title: string; path: string; type: string }[]>
  projectDesigns: Ref<UIDesign[]>
  syncApiDesigns: Ref<UIDesign[]>
  projectFiles: Ref<ProjectFile[]>
  codeEditorState: {
    rootPath: string
    currentFile: string
    fileContent: string
    currentLanguage: string
  }
  codeEditorSelection: Ref<{ text: string; startLine: number; endLine: number } | null>
  currentNodes: Ref<readonly any[]>
  currentDesignName: Ref<string> | DeepReadonly<Ref<string>>
  designsCache: Ref<ReadonlyMap<string, { readonly name: string; readonly nodes: readonly any[] }>> | DeepReadonly<Ref<ReadonlyMap<string, any>>>
  getDocsTauriFs: () => { readTextFile: (path: string) => Promise<string> } | null
}

export function useAssistantPrompt(deps: PromptDeps) {
  const {
    currentSpace, projectStore, route, currentComponent, useGitRepo,
    busCurrentDoc, projectDocs, localDocs, projectDesigns, syncApiDesigns,
    projectFiles, codeEditorState, codeEditorSelection,
    currentNodes, currentDesignName, designsCache, getDocsTauriFs,
  } = deps

  function hasExplicitProjectContext(): boolean {
    if (/\/app\/projects\/[^/]+/.test(route.path)) return true
    if (route.path === '/assistant') return !!projectStore.currentProject
    const queryProject = route.query?.project
    return typeof queryProject === 'string' && queryProject.trim().length > 0
  }

  function getActiveProjectContext() {
    return hasExplicitProjectContext() ? projectStore.currentProject : null
  }

  /** Build local_data with project and design context for code tools */
  function buildLocalData(references?: ParsedReferences): Record<string, unknown> {
    const localData: Record<string, unknown> = {}

    const project = getActiveProjectContext()
    if (project) {
      localData.project_id = project.id
      localData.project_name = project.name
      localData.project_path = project.path
      if (project.description) localData.project_description = project.description
    }

    if (codeEditorState.rootPath) {
      localData.current_folder = codeEditorState.rootPath
      const folderName = codeEditorState.rootPath.split('/').pop()
      localData.current_folder_name = folderName
    }

    if (codeEditorState.currentFile) {
      localData.current_file = {
        path: codeEditorState.currentFile,
        language: codeEditorState.currentLanguage,
        content: codeEditorState.fileContent?.split('\n').slice(0, 300).join('\n') || '',
      }
    }

    if (codeEditorSelection.value) {
      localData.selection = codeEditorSelection.value
    }

    if (currentNodes.value.length > 0) {
      localData.current_design = currentDesignName.value
      localData.canvas_summary = {
        total_elements: currentNodes.value.length,
        screens: currentNodes.value
          .filter((n: { type: string; parentId?: string | null }) => n.type === 'screen' && !n.parentId)
          .map((n: { id: string; name: string; x: number; y: number; width: number; height: number }) => ({
            id: n.id, name: n.name, x: n.x, y: n.y, w: n.width, h: n.height,
          })),
        hint: 'Call get_canvas_state for full element details including fills, text, and styles.',
      }
      localData.canvas_data = currentNodes.value.map((n: { id: string; type: string; name: string; x: number; y: number; width: number; height: number; parentId?: string | null; fill?: unknown }) => ({
        id: n.id, type: n.type, name: n.name, x: n.x, y: n.y, width: n.width, height: n.height,
        ...(n.parentId ? { parentId: n.parentId } : {}),
        ...(typeof n.fill === 'string' ? { fill: n.fill } : n.fill ? { fill: 'gradient' } : {}),
      }))
    }

    if (designsCache.value.size > 0) {
      const designs: Array<{ name: string; screen_count: number; element_count: number }> = []
      for (const [, design] of designsCache.value) {
        const nodes = design.nodes as readonly { type: string; parentId?: string | null }[]
        designs.push({
          name: design.name,
          screen_count: nodes.filter(n => n.type === 'screen' && !n.parentId).length,
          element_count: nodes.length,
        })
      }
      localData.designs = designs
    }

    if (references) {
      localData.references = {
        designs: references.designs.map(ref => ref.raw),
        docs: references.docs.map(ref => ref.title),
        tasks: references.tasks,
        components: references.components,
        files: references.files,
        code_files: references.codeFiles.map(ref => ref.filename),
      }
    }

    return localData
  }

  /** Get referenced documents context (for ^DocTitle references) */
  async function getReferencedDocsContext(refs: DocReference[]): Promise<string> {
    if (refs.length === 0) return ''

    const contexts: string[] = ['\n\n## Referenced Documents']
    for (const ref of refs) {
      const query = ref.title.toLowerCase()

      const localDoc = localDocs.value.find(d =>
        d.title.toLowerCase().includes(query),
      )
      if (localDoc) {
        try {
          if (getDocsTauriFs()) {
            const content = await getDocsTauriFs()!.readTextFile(localDoc.path)
            const trimmed = content.length > 4000
              ? content.substring(0, 4000) + '\n\n... [truncated]'
              : content
            contexts.push(`### ${localDoc.title} (${localDoc.type})\n${trimmed}`)
          } else {
            contexts.push(`### ${localDoc.title} (${localDoc.type})\nFile: ${localDoc.path}\n[Use read_file tool to access: ${localDoc.path}]`)
          }
        } catch {
          contexts.push(`### ${localDoc.title} (${localDoc.type})\nFile: ${localDoc.path}\n[Use read_file tool to access: ${localDoc.path}]`)
        }
      }
    }
    return contexts.join('\n')
  }

  /** Build system prompt with context information */
  function buildSystemPrompt(references?: ParsedReferences, docContents?: string): string {
    const parts: string[] = []
    const space = currentSpace.value?.toLowerCase()

    const project = getActiveProjectContext()
    if (project) {
      parts.push(`\n\n## Current Project Context (Local)`)
      parts.push(`- Project: "${project.name}"`)
      parts.push(`- Local path: ${project.path}`)
      if (project.description) {
        parts.push(`- Description: ${project.description}`)
      }
      if (project.spaces && project.spaces.length > 0) {
        parts.push(`- Enabled spaces: ${project.spaces.join(', ')}`)
      }
      parts.push(`- IMPORTANT: Projects are LOCAL (on-disk). The following tools do NOT work without cloud auth and must be AVOIDED:
  - resolve_project_name, search_project_knowledge, index_project (no cloud DB)
  - Instead, use: read_file, list_files, file_search, write_file for file operations
  - Use run_command for commands (supports pipes and && chaining). Use working_directory param instead of cd.
  - The project path above is the root directory — use it directly with file tools.`)
    }

    const path = route.path
    const routeContext = getRouteContext(path)
    if (routeContext) {
      parts.push(`\n\n## Current Location`)
      parts.push(routeContext)
    }

    const spaceMatch = path.match(/\/app\/projects\/[^/]+\/(\w+)/)
    if (spaceMatch && spaceMatch[1]) {
      const currentSpaceName = spaceMatch[1]
      parts.push(`\nUser is currently in the "${currentSpaceName}" space.`)
    }

    if (currentComponent.value) {
      parts.push(`\n\n## Active Component`)
      parts.push(`Currently working on component: ${currentComponent.value.name} (${currentComponent.value.type}).`)
    }

    if (space === 'git') {
      const gitRepo = useGitRepo()
      const repoPath = gitRepo.state.currentRepoPath
      const currentBranch = gitRepo.state.currentBranch
      const staged = gitRepo.state.stagedChanges
      const unstaged = gitRepo.state.unstagedChanges
      const untracked = gitRepo.state.untrackedFiles
      const conflicted = gitRepo.state.conflictedFiles
      const currentRepo = gitRepo.currentRepo.value

      if (repoPath) {
        let gitContext = `\n\n## Current Git Repository

**Repo:** ${currentRepo?.name || repoPath.split('/').pop() || 'unknown'}
**Path:** ${repoPath}
**Branch:** ${currentBranch || '(unknown)'}
**Status:** ${currentRepo?.status || 'unknown'}`

        if (currentRepo?.remoteUrl) {
          gitContext += `\n**Remote:** ${currentRepo.remoteUrl}`
        }
        if (currentRepo?.hasUpstream) {
          if ((currentRepo.ahead ?? 0) > 0 || (currentRepo.behind ?? 0) > 0) {
            gitContext += `\n**Sync:** ${currentRepo.ahead ?? 0} ahead, ${currentRepo.behind ?? 0} behind`
          }
        } else {
          gitContext += `\n**Upstream:** not set (use set_upstream when pushing)`
        }

        const changesSummary: string[] = []
        if (staged.length > 0) changesSummary.push(`${staged.length} staged`)
        if (unstaged.length > 0) changesSummary.push(`${unstaged.length} modified`)
        if (untracked.length > 0) changesSummary.push(`${untracked.length} untracked`)
        if (conflicted.length > 0) changesSummary.push(`${conflicted.length} conflicted`)

        if (changesSummary.length > 0) {
          gitContext += `\n**Changes:** ${changesSummary.join(', ')}`
        } else {
          gitContext += `\n**Changes:** clean working tree`
        }

        if (staged.length > 0 || unstaged.length > 0 || untracked.length > 0) {
          gitContext += `\n\n### Changed Files`
          const allFiles: string[] = []
          for (const f of staged) allFiles.push(`  [staged] ${f.path}`)
          for (const f of unstaged) allFiles.push(`  [modified] ${f.path}`)
          for (const f of untracked.slice(0, 15)) allFiles.push(`  [untracked] ${f}`)
          if (untracked.length > 15) allFiles.push(`  ... and ${untracked.length - 15} more untracked`)
          if (conflicted.length > 0) {
            for (const f of conflicted) allFiles.push(`  [CONFLICT] ${f}`)
          }
          gitContext += '\n' + allFiles.slice(0, 30).join('\n')
          if (allFiles.length > 30) gitContext += `\n  ... and ${allFiles.length - 30} more files`
        }

        if (gitRepo.state.commits.length > 0) {
          gitContext += `\n\n### Recent Commits`
          for (const c of gitRepo.state.commits.slice(0, 5)) {
            gitContext += `\n- \`${c.shortHash}\` ${c.subject} (${c.author})`
          }
        }

        gitContext += `\n\n### Git Tools
All git tools require \`repo_path\`: use **${repoPath}**

**git_status** - Get current status (staged, unstaged, untracked)
**git_stage** / **git_unstage** - Stage or unstage files
**git_discard** - Discard working directory changes (destructive!)
**git_commit** - Create a commit with staged changes
**git_log** - View commit history
**git_diff** - View diffs (unstaged, staged, or for a specific commit)
**git_branches** - List all branches
**git_checkout** - Switch branches
**git_create_branch** / **git_delete_branch** - Manage branches
**git_fetch** / **git_pull** / **git_push** - Remote operations
**git_ignore** - Add patterns to .gitignore

When the user says "commit", "push", "pull", etc. without specifying a repo path, always use: ${repoPath}`

        parts.push(gitContext)
      } else {
        parts.push(`\n\n## Git Space
No repository is currently selected. The user needs to select a repository first.
Once a repo is selected, you will have access to its status, branches, and change details.`)
      }
    }

    if (space === 'notes' || space === 'docs') {
      const openDoc = busCurrentDoc.value
      if (openDoc) {
        const contentPreview = openDoc.content && openDoc.content.length > 4000
          ? openDoc.content.substring(0, 4000) + '\n\n... (truncated)'
          : openDoc.content || '(empty)'
        parts.push(`\n\n## Currently Open Document
**Title:** ${openDoc.title}
**Type:** ${openDoc.type}
**ID:** ${openDoc.id}

When the user says "this document", "the doc", or asks to edit/update/improve without specifying a title, they mean this document.
To update it, use \`sync_document\` with the same title and project_id.

### Current Content
\`\`\`markdown
${contentPreview}
\`\`\``)
      }
    }

    if (project) {
      const allDocTitles: string[] = []
      for (const d of projectDocs.value) {
        allDocTitles.push(`${d.title} (${d.type})`)
      }
      for (const d of localDocs.value) {
        if (!projectDocs.value.some(pd => pd.title.toLowerCase() === d.title.toLowerCase())) {
          allDocTitles.push(`${d.title} (${d.type}, local)`)
        }
      }
      if (allDocTitles.length > 0) {
        parts.push(`\n\n## Available Project Documents
${allDocTitles.map(t => `- ${t}`).join('\n')}

To include document content, user can reference with ^DocTitle. To list or fetch via tools, use list_project_documents or get_document.`)
      }
    }

    if (project) {
      parts.push(`\n\n## Cross-Space References
Users can reference items from other spaces within the same project:
- **@DesignName** - Reference a UI design screen (includes full design JSON)
- **@DesignName/Page** - Reference a specific page/variant within a design
- **^DocTitle** - Reference a project document (PRD, README, architecture, etc.)
- **#123** - Reference a task by ID (for task operations)
- **~ComponentName** - Reference a code component
- **$path/to/file** - Reference a source file by explicit path
- **!filename** - Fuzzy file search (like VS Code CMD+P) - finds files matching the name

Examples:
- "@LoginScreen" - Include the LoginScreen design data for code generation
- "@Hydrate/Product Page" - Include specific page variant data
- "^PRD" - Include the PRD document content for context
- "^Architecture" - Include the architecture document
- "#42" - Reference task 42 for updates
- "!login.vue" - Find and reference login.vue file in the project
- "!UserService" - Find files containing "UserService" in their name

When you see these references, the referenced content will be included in context.`)
    }

    if (references) {
      if (references.designs.length > 0) {
        const designsContext = getReferencedDesignsContext(references.designs)
        if (designsContext) {
          parts.push(designsContext)
        }

        const indexedDBContext = getDesignDataForAI(references.designs, projectDesigns.value)
        if (indexedDBContext) {
          parts.push(indexedDBContext)
        }

        const syncApiContext = getDesignDataForAI(references.designs, syncApiDesigns.value)
        if (syncApiContext && syncApiContext !== indexedDBContext) {
          parts.push('\n## Team Shared Design Data (sync-api)')
          parts.push(syncApiContext)
        }

        parts.push(`\nUse this design data to generate Vue/React/HTML components that match the visual layout.
The JSON data above contains the exact positions, sizes, colors, and properties of each element.
Generate code that recreates this layout using appropriate frontend components.`)
      }

      if (references.docs.length > 0 && docContents) {
        parts.push(docContents)
      }

      if (references.components.length > 0) {
        parts.push(getReferencedComponentsContext(references.components))
      }

      if (references.files.length > 0) {
        parts.push(getReferencedFilesContext(references.files))
      }

      if (references.codeFiles.length > 0) {
        parts.push(getReferencedCodeFilesContext(references.codeFiles, projectFiles.value))
      }
    }

    return parts.join('\n')
  }

  return {
    buildLocalData,
    getReferencedDocsContext,
    buildSystemPrompt,
  }
}

/**
 * Compact messages for LLM context — prune old tool results, keep UI data intact.
 * Only prunes assistant toolCall results older than PROTECT_LAST_TURNS.
 * User messages and assistant text content are never pruned.
 *
 * Pure function — no component dependencies.
 */
export function compactForLLM(msgs: ChatMessage[]): ChatMessage[] {
  const PROTECT_LAST_TURNS = 3

  let turnCount = 0
  let protectFromIndex = 0
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg?.role === 'user') {
      turnCount++
      if (turnCount >= PROTECT_LAST_TURNS) {
        protectFromIndex = i
        break
      }
    }
  }

  return msgs.map((msg, i) => {
    if (i >= protectFromIndex) return msg
    if (msg.role !== 'assistant' || !msg.toolCalls?.length) return msg

    return {
      ...msg,
      toolCalls: msg.toolCalls.map(tc => ({
        ...tc,
        result: tc.result
          ? `[Previous ${tc.name} result — call tool again if needed]`
          : tc.result,
      })),
    }
  })
}

/**
 * Build assistant message content enriched with tool call context for conversation history.
 * This ensures follow-up messages know what tools were called and what was created/modified.
 */
export function buildMessageWithToolContext(
  msg: ChatMessage,
  projectDocs: Ref<DocumentListItem[]>,
  projectStore: { currentProject: { id: string | number } | null },
): string {
  let content = msg.content || ''
  if (!msg.toolCalls?.length) return content

  const toolSummaries: string[] = []
  for (const tc of msg.toolCalls) {
    let summary = `- Called ${tc.name}`
    try {
      const args = tc.arguments as Record<string, unknown>
      const result = tc.result ? JSON.parse(tc.result) : null

      if (tc.name === 'create_ui_screen' && result?.screen) {
        const s = result.screen as Record<string, unknown>
        summary = `- Created screen "${s.name}" (${result.elements?.length || 0} elements, ${s.width}x${s.height})`
      } else if (tc.name === 'create_design_element' && result?.element) {
        const el = result.element as Record<string, unknown>
        summary = `- Created element "${el.name || el.type}" (type: ${el.type}, ${el.x},${el.y} ${el.width}x${el.height})`
        if (el.style) summary += ` style: ${JSON.stringify(el.style)}`
      } else if (tc.name === 'update_design_element' && result?.element) {
        const el = result.element as Record<string, unknown>
        summary = `- Updated element "${el.name || el.type}" (id: ${args.element_id || el.id})`
      } else if (tc.name === 'write_file') {
        summary = `- Wrote file: ${args.path}`
      } else if (tc.name === 'create_task' && result?.task) {
        const t = result.task as Record<string, unknown>
        summary = `- Created task: "${t.title}" (id: ${t.id})`
      } else if (tc.name === 'git_commit') {
        summary = `- Committed: "${args.message}"`
      } else if (tc.name === 'git_push') {
        summary = `- Pushed to ${args.remote || 'origin'}${args.branch ? '/' + args.branch : ''}`
      } else if (tc.name === 'git_pull') {
        summary = `- Pulled from ${args.remote || 'origin'}${args.branch ? '/' + args.branch : ''}`
      } else if (tc.name === 'git_checkout') {
        summary = `- Switched to branch: ${args.branch}`
      } else if (tc.name === 'git_create_branch') {
        summary = `- Created branch: ${args.branch_name}`
      } else if (tc.name === 'git_stage') {
        summary = `- Staged files`
      } else if (tc.name === 'git_unstage') {
        summary = `- Unstaged files`
      } else if (tc.name === 'sync_document') {
        summary = `- Created/updated document: "${args.title || 'Untitled'}"`
        const syncProjectId = (args.project_id as number) || projectStore.currentProject?.id
        if (syncProjectId) {
          requestSpaceData('docs', { type: 'documents.reload' }).then((docs) => {
            if (Array.isArray(docs)) {
              projectDocs.value = (docs as Array<{ title: string; type: string; id?: number }>).map(d => ({
                id: d.id ?? 0, title: d.title, type: d.type || 'custom',
              })) as DocumentListItem[]
            }
          }).catch(() => { /* ignore refresh failure */ })
        }
      } else if (tc.name === 'list_project_documents' || tc.name === 'list_project_designs' || tc.name === 'list_project_tasks') {
        summary = `- Listed ${tc.name.replace('list_project_', '')}`
      } else {
        const argKeys = Object.keys(args)
        if (argKeys.length > 0) {
          summary += `(${argKeys.map(k => `${k}: ${JSON.stringify(args[k])}`).join(', ').substring(0, 200)})`
        }
      }
    } catch {
      // Keep basic summary
    }
    toolSummaries.push(summary)
  }

  if (toolSummaries.length > 0) {
    content += `\n\n[Actions performed:\n${toolSummaries.join('\n')}\n]`
  }

  return content
}
