/**
 * useArchitectTools - AI Tool definitions for Architect space
 *
 * Defines the tools that the AI can call to interact with other spaces:
 * - Kanban: Create tasks, update task status
 * - Code: Initialize repos, create files
 * - Design: Create design files
 * - Project: Create/update projects
 */
import type { Tool, ToolCall, ToolResult } from '@construct/sdk'
import { useArchitectActions } from './useArchitectActions'
import type { TaskItem } from '@/types/architect'
import type { ArchitectPlan, DocumentType } from '@/utils/documentsGenerator'
import { generateDocument, getDocumentFilename } from '@/utils/documentsGenerator'

// Import tasksStore for the executor
import { useTasksStore } from '~/stores/tasks'

/**
 * Architect tool definitions for AI function calling
 */
export const architectTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'create_kanban_tasks',
      description: 'Create tasks in the Kanban board from a list of task items. Use this after generating a PRD to add tasks to the project board.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: 'Array of task objects to create',
          },
          require_approval: {
            type: 'boolean',
            description: 'Whether to require user approval before creating tasks. Default true for >3 tasks.',
          }
        },
        required: ['tasks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'initialize_git_repo',
      description: 'Initialize a git repository for the project. Creates a code directory with git init.',
      parameters: {
        type: 'object',
        properties: {
          repo_name: {
            type: 'string',
            description: 'Name for the repository (optional, defaults to project name)',
          },
          template: {
            type: 'string',
            description: 'Template to use: vue, react, nuxt, next, express, fastapi, etc.',
            enum: ['vue', 'react', 'nuxt', 'next', 'express', 'fastapi', 'go', 'rust', 'blank']
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_design_file',
      description: 'Create a new design file in the UI/Design space for wireframes or mockups.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name for the design file',
          },
          template: {
            type: 'string',
            description: 'Template type: blank, wireframe, or dashboard',
            enum: ['blank', 'wireframe', 'dashboard']
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_full_project',
      description: 'Create a complete project setup including Kanban tasks, git repo, and design file. Use this for comprehensive project initialization.',
      parameters: {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description: 'Name for the project',
          },
          include_kanban: {
            type: 'boolean',
            description: 'Whether to create Kanban tasks from PRD',
          },
          include_repo: {
            type: 'boolean',
            description: 'Whether to initialize a git repository',
          },
          include_design: {
            type: 'boolean',
            description: 'Whether to create a design file',
          },
          repo_template: {
            type: 'string',
            description: 'Template for the repository',
            enum: ['vue', 'react', 'nuxt', 'next', 'express', 'fastapi', 'go', 'rust', 'blank']
          }
        },
        required: ['project_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_project_docs',
      description: 'Generate project documentation files (PRD, README, Architecture, Roadmap, Setup) and save them to the project\'s docs/ directory. Use this when the user wants to create or update project documentation.',
      parameters: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            description: 'Document types to generate. Options: prd, readme, architecture, roadmap, setup',
            items: {
              type: 'string',
              enum: ['prd', 'readme', 'architecture', 'roadmap', 'setup']
            }
          },
          project_name: {
            type: 'string',
            description: 'Project name (defaults to current project name)',
          },
          project_description: {
            type: 'string',
            description: 'Brief project description for document generation',
          },
          tech_stack: {
            type: 'object',
            description: 'Tech stack decisions: frontend, backend, database, auth, styling, hosting',
            properties: {
              platform: { type: 'string' },
              frontend: { type: 'string' },
              backend: { type: 'string' },
              database: { type: 'string' },
              auth: { type: 'string' },
              styling: { type: 'string' },
              hosting: { type: 'string' },
            }
          },
          features: {
            type: 'array',
            description: 'Core features list for PRD generation',
            items: { type: 'string' }
          },
          mvp_scope: {
            type: 'array',
            description: 'MVP scope items',
            items: { type: 'string' }
          }
        },
        required: ['documents']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_status',
      description: 'Get the current project status including tasks, files, and design status.',
      parameters: {
        type: 'object',
        properties: {
          include_tasks: {
            type: 'boolean',
            description: 'Include task statistics',
          },
          include_files: {
            type: 'boolean',
            description: 'Include code file listing',
          }
        }
      }
    }
  }
]

/**
 * Create a tool executor that handles Architect tool calls
 */
export function useArchitectToolExecutor() {
  const actions = useArchitectActions()
  const projectStore = useProjectStore()
  const tasksStore = useTasksStore()

  /**
   * Execute a tool call and return the result
   */
  async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsString } = toolCall.function
    let args: Record<string, unknown>

    try {
      args = JSON.parse(argsString)
    } catch {
      return {
        tool_call_id: toolCall.id,
        content: 'Failed to parse tool arguments',
        is_error: true
      }
    }

    console.log(`[ArchitectToolExecutor] Executing tool: ${name}`, args)

    try {
      switch (name) {
        case 'create_kanban_tasks': {
          const tasks = args.tasks as TaskItem[]
          const requireApproval = args.require_approval as boolean | undefined
          const result = await actions.createKanbanTasks(tasks, { requireApproval })
          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          }
        }

        case 'initialize_git_repo': {
          const result = await actions.initializeGitRepo({
            repoName: args.repo_name as string | undefined,
            template: args.template as string | undefined
          })
          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          }
        }

        case 'create_design_file': {
          const result = await actions.createDesignFile({
            name: args.name as string,
            template: args.template as 'blank' | 'wireframe' | 'dashboard' | undefined
          })
          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          }
        }

        case 'create_full_project': {
          // This would need PRD and tasks from context
          // For now, return that it needs more context
          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              message: 'Please generate a PRD and tasks first, then use specific tools to create each component.'
            })
          }
        }

        case 'get_project_status': {
          const project = projectStore.currentProject
          const tasks = tasksStore.tasks
          const includeTasks = args.include_tasks !== false
          const includeFiles = args.include_files === true

          const status: Record<string, unknown> = {
            project: project ? {
              id: project.id,
              name: project.name,
              spaces: project.spaces,
              local_path: project.local_path
            } : null
          }

          if (includeTasks) {
            const taskStats = {
              total: tasks.length,
              backlog: tasks.filter(t => t.status === 'backlog').length,
              todo: tasks.filter(t => t.status === 'todo').length,
              in_progress: tasks.filter(t => t.status === 'in_progress').length,
              review: tasks.filter(t => t.status === 'review').length,
              done: tasks.filter(t => t.status === 'done').length,
            }
            status.tasks = taskStats
          }

          if (includeFiles && project?.local_path) {
            // Would need to read directory - for now just indicate path
            status.code_path = `${project.local_path}/code`
            status.design_path = `${project.local_path}/design`
          }

          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true, data: status })
          }
        }

        case 'generate_project_docs': {
          const project = projectStore.currentProject
          if (!project?.local_path) {
            return {
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: false, message: 'No project selected or project has no local path. Please select a project first.' }),
              is_error: true
            }
          }

          const docTypes = (args.documents as string[]).filter(
            (d): d is DocumentType => ['prd', 'readme', 'architecture', 'roadmap', 'setup'].includes(d)
          )

          if (docTypes.length === 0) {
            return {
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: false, message: 'No valid document types specified. Options: prd, readme, architecture, roadmap, setup' }),
              is_error: true
            }
          }

          // Build plan from provided args + project info
          const plan: ArchitectPlan = {
            name: (args.project_name as string) || project.name,
            description: (args.project_description as string) || project.description || '',
            decisions: (args.tech_stack as ArchitectPlan['decisions']) || {},
            prd: {
              coreFeatures: args.features as string[] | undefined,
              mvpScope: args.mvp_scope as string[] | undefined,
            }
          }

          const tauriFs = await import('@tauri-apps/plugin-fs')
          const docsPath = `${project.local_path}/docs`

          // Ensure docs/ directory exists
          const exists = await tauriFs.exists(docsPath)
          if (!exists) {
            await tauriFs.mkdir(docsPath, { recursive: true })
          }

          const savedFiles: string[] = []
          const errors: string[] = []

          for (const docType of docTypes) {
            const content = generateDocument(docType, plan)
            const filename = getDocumentFilename(docType, plan.name)
            const filePath = `${docsPath}/${filename}`

            try {
              await tauriFs.writeTextFile(filePath, content)
              savedFiles.push(filename)
            } catch (e) {
              errors.push(`${filename}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }

          return {
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: errors.length === 0,
              message: `Saved ${savedFiles.length} document(s) to ${docsPath}/`,
              files: savedFiles,
              errors: errors.length > 0 ? errors : undefined
            })
          }
        }

        default:
          return {
            tool_call_id: toolCall.id,
            content: `Unknown tool: ${name}`,
            is_error: true
          }
      }
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true
      }
    }
  }

  return {
    executeTool,
    tools: architectTools
  }
}
