/**
 * Reference parsing utilities for the AI Assistant.
 *
 * Parses @design, #task, ~component, $file, !file, and ^doc references
 * from user messages. Pure functions — no Vue reactivity or side effects.
 */
import type { DesignNode } from '~/types/design'
import type { ProjectFile, UIDesign } from '~/types/assistant'
import { getDesignForCodeGeneration } from '~/composables/useCanvasContext'

// Reference types for cross-space linking
export interface DesignReference {
  design: string        // Design/screen name
  variant?: string      // Optional variant/page (after /)
  raw: string           // Original matched text
}

export interface FileReference {
  filename: string      // File name or partial path
  raw: string           // Original matched text
}

export interface DocReference {
  title: string         // Document title or partial match
  raw: string           // Original matched text
}

export interface ParsedReferences {
  designs: DesignReference[]
  docs: DocReference[]        // ^DocTitle references
  tasks: string[]
  components: string[]        // ~ComponentName
  files: string[]             // $path/to/file (explicit paths)
  codeFiles: FileReference[]  // !filename (fuzzy file search like CMD+P)
}

/**
 * Parse @design, #task, ~component, $file, and !file references from message text.
 * Supports: @DesignName, @DesignName/VariantPage, #123, ~ComponentName, $src/file.ts, !login.vue
 */
export function parseReferences(text: string): ParsedReferences {
  // @Design or @Design/Variant Page - supports paths and spaces
  const designMatches = [...text.matchAll(/@([\w][\w\s-]*(?:\/[\w\s-]+)?)(?=\s+(?:make|create|build|convert|redesign|update|change|adapt|plus)\b|\s*[,.|!?]|\s+[^/\w]|$)/gi)]
  const designs: DesignReference[] = designMatches.map(m => {
    const raw = m[1]?.trim() || ''
    const parts = raw.split('/')
    return {
      design: parts[0]?.trim() || '',
      variant: parts[1]?.trim(),
      raw,
    }
  })

  // #123 - Task references
  const tasks = [...text.matchAll(/#(\d+)/g)].map(m => m[1]).filter((t): t is string => !!t)

  // ~ComponentName - Component references
  const components = [...text.matchAll(/~([\w-]+)/g)].map(m => m[1]).filter((c): c is string => !!c)

  // $path/to/file - Explicit file path references
  const files = [...text.matchAll(/\$([\w./-]+)/g)].map(m => m[1]).filter((f): f is string => !!f)

  // !filename - Fuzzy file search (like VS Code CMD+P)
  const codeFileMatches = [...text.matchAll(/!([\w.-]+(?:\/[\w.-]+)*)/g)]
  const codeFiles: FileReference[] = codeFileMatches.map(m => ({
    filename: m[1] || '',
    raw: m[0] || '',
  }))

  // ^DocTitle - Document references
  const docMatches = [...text.matchAll(/\^([\w][\w\s-]*?)(?=\s*[,.|!?]|\s+[^\w]|$)/g)]
  const docs: DocReference[] = docMatches.map(m => ({
    title: m[1]?.trim() || '',
    raw: m[1]?.trim() || '',
  }))

  return { designs, docs, tasks, components, files, codeFiles }
}

/** Build context string from referenced designs */
export function getReferencedDesignsContext(refs: DesignReference[]): string {
  if (refs.length === 0) return ''

  const contexts: string[] = []
  for (const ref of refs) {
    const context = getDesignForCodeGeneration(ref.raw)
    if (ref.variant) {
      contexts.push(`### ${ref.design} / ${ref.variant}\n${context}`)
    } else {
      contexts.push(context)
    }
  }
  return '\n\n## Referenced Designs\n' + contexts.join('\n\n')
}

/** Build context string from referenced components */
export function getReferencedComponentsContext(components: string[]): string {
  if (components.length === 0) return ''
  // TODO: Implement component lookup from code space
  return `\n\n## Referenced Components\nComponents referenced: ${components.map(c => `~${c}`).join(', ')}`
}

/** Build context string from referenced file paths */
export function getReferencedFilesContext(files: string[]): string {
  if (files.length === 0) return ''
  // TODO: Implement file content lookup for $path references
  return `\n\n## Referenced Files\nFiles referenced: ${files.map(f => `$${f}`).join(', ')}`
}

/** Build context string from fuzzy file references (!filename) */
export function getReferencedCodeFilesContext(refs: FileReference[], allFiles: ProjectFile[]): string {
  if (refs.length === 0 || allFiles.length === 0) return ''

  const matchedFiles: string[] = []

  for (const ref of refs) {
    const query = ref.filename.toLowerCase()
    const matches = allFiles.filter(f =>
      f.name.toLowerCase().includes(query)
      || f.path.toLowerCase().includes(query),
    )
    matchedFiles.push(...matches.slice(0, 3).map(f => f.path))
  }

  if (matchedFiles.length === 0) return ''

  return `\n\n## Referenced Code Files (via ! search)\nMatched files: ${matchedFiles.join(', ')}\n\nUse the read_file or file_search tools to access these files if needed.`
}

/** Build context string from design data in IndexedDB */
export function getDesignDataForAI(refs: DesignReference[], designs: UIDesign[]): string {
  if (refs.length === 0 || designs.length === 0) return ''

  const parts: string[] = ['\n\n## Design Data from Project']

  for (const ref of refs) {
    const designName = ref.design.toLowerCase()
    const design = designs.find(d =>
      d.name.toLowerCase() === designName
      || d.name.toLowerCase().includes(designName),
    )

    if (design) {
      parts.push(`\n### ${design.name}`)
      parts.push(`Design ID: ${design.id}`)
      const designNodes = design.nodes as DesignNode[] | undefined
      parts.push(`Elements: ${designNodes?.length || 0}`)

      if (designNodes && designNodes.length > 0) {
        const essentialNodes = designNodes.map((node: DesignNode) => ({
          id: node.id,
          type: node.type,
          name: node.name,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          fill: node.fill,
          text: node.text,
          fontSize: node.fontSize,
          cornerRadius: node.cornerRadius,
          parentId: node.parentId,
        }))
        parts.push(`\n\`\`\`json\n${JSON.stringify(essentialNodes, null, 2)}\n\`\`\``)
      }
    }
  }

  return parts.join('\n')
}

/** Format tool name for display (snake_case -> Title Case with label) */
export function formatToolName(name: string): string {
  const toolLabels: Record<string, string> = {
    'read_file': 'Reading file',
    'write_file': 'Writing file',
    'create_file': 'Creating file',
    'edit_file': 'Editing file',
    'list_files': 'Listing files',
    'file_search': 'Searching files',
    'search_code': 'Searching code',
    'run_command': 'Running command',
    'create_task': 'Creating task',
    'update_task': 'Updating task',
    'list_tasks': 'Listing tasks',
    'create_project': 'Creating project',
    'list_projects': 'Listing projects',
    'list_users': 'Listing users',
    'invite_user': 'Inviting user',
    'search_users': 'Searching users',
    'create_screen': 'Creating screen',
    'create_element': 'Creating element',
    'search_images': 'Searching images',
    'search_icons': 'Searching icons',
    'git_status': 'Git status',
    'git_diff': 'Git diff',
    'git_commit': 'Git commit',
    'get_current_time': 'Getting time',
    'execute_code': 'Executing code',
  }
  return toolLabels[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/** Format tool result for display (truncate if too long) */
export function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    const formatted = JSON.stringify(parsed, null, 2)
    if (formatted.length > 500) {
      return formatted.substring(0, 500) + '\n... (truncated)'
    }
    return formatted
  } catch {
    if (result.length > 500) {
      return result.substring(0, 500) + '\n... (truncated)'
    }
    return result
  }
}
