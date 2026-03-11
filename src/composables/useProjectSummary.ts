/**
 * useProjectSummary - Loads summary counts for a project's spaces
 *
 * Fetches docs, designs, files, and git status directly from the brain
 * so the project detail page can show what's inside without navigating
 * into each space.
 */
import { ref, watch, type Ref } from 'vue'
import { useContextService } from './useContextService'
import type { ToolResult } from './useContextService'
import { useStorage } from './useStorage'

export interface ProjectSummary {
  docs: { count: number; items: { title: string; type?: string }[] }
  designs: { count: number; items: { name: string }[] }
  files: { count: number; languages: { ext: string; count: number }[] }
  git: { hasRepo: boolean; branch?: string }
  loading: boolean
}

function emptyStats(): ProjectSummary {
  return {
    docs: { count: 0, items: [] },
    designs: { count: 0, items: [] },
    files: { count: 0, languages: [] },
    git: { hasRepo: false },
    loading: false,
  }
}

export function useProjectSummary(projectPath: Ref<string | undefined>, projectId: Ref<string | number | undefined>) {
  const summary = ref<ProjectSummary>(emptyStats())
  const { sendRequest, callTool } = useContextService()
  const storage = useStorage()

  async function callBrainTool(name: string, args: Record<string, unknown>): Promise<string | null> {
    try {
      const result = await callTool({
        id: `summary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      })
      if (result?.is_error) return null
      return result?.content ?? null
    } catch {
      return null
    }
  }

  async function loadDocs(path: string) {
    const content = await callBrainTool('list_directory', { path: `${path}/docs` })
    if (!content) {
      // Try .construct/docs as fallback
      const fallback = await callBrainTool('list_directory', { path: `${path}/.construct/docs` })
      if (!fallback) return
      parseDocs(fallback)
      return
    }
    parseDocs(content)
  }

  function parseDocs(content: string) {
    try {
      const parsed = JSON.parse(content)
      const entries = parsed?.entries || parsed || []
      if (!Array.isArray(entries)) return
      const docs = entries.filter((e: { name?: string; type?: string }) =>
        e.name?.endsWith('.md') && e.type !== 'directory'
      )
      summary.value.docs = {
        count: docs.length,
        items: docs.slice(0, 8).map((d: { name: string }) => ({
          title: d.name.replace(/\.md$/, '').replace(/[-_]/g, ' '),
          type: 'markdown',
        })),
      }
    } catch { /* ignore */ }
  }

  async function loadDesigns() {
    try {
      const designs = await storage.designs.list()
      summary.value.designs = {
        count: designs.length,
        items: designs.slice(0, 8).map(d => ({ name: d.name })),
      }
    } catch { /* ignore */ }
  }

  async function loadFiles(path: string) {
    const content = await callBrainTool('get_file_tree', { path, max_depth: 2 })
    if (!content) return
    try {
      const parsed = JSON.parse(content)
      const tree = parsed?.tree || parsed?.entries || []
      if (!Array.isArray(tree)) return

      // Count files and track extensions
      const extCounts: Record<string, number> = {}
      let totalFiles = 0

      function walk(nodes: { name?: string; type?: string; children?: unknown[] }[]) {
        for (const node of nodes) {
          if (node.type === 'file' || (!node.children && node.name)) {
            totalFiles++
            const ext = (node.name || '').split('.').pop()?.toLowerCase() || ''
            if (ext && ext !== node.name) {
              extCounts[ext] = (extCounts[ext] || 0) + 1
            }
          }
          if (node.children && Array.isArray(node.children)) {
            walk(node.children as typeof nodes)
          }
        }
      }
      walk(tree)

      const languages = Object.entries(extCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([ext, count]) => ({ ext, count }))

      summary.value.files = { count: totalFiles, languages }
    } catch { /* ignore */ }
  }

  async function loadGit(path: string) {
    // Check if .git exists
    const content = await callBrainTool('path_exists', { path: `${path}/.git` })
    if (!content) return
    try {
      const parsed = JSON.parse(content)
      if (parsed?.exists) {
        summary.value.git = { hasRepo: true }
        // Try to get current branch
        const branchContent = await callBrainTool('run_command', {
          command: 'git rev-parse --abbrev-ref HEAD',
          working_directory: path,
        })
        if (branchContent) {
          try {
            const branchParsed = JSON.parse(branchContent)
            const branch = (branchParsed?.output || branchParsed?.stdout || '').trim()
            if (branch) {
              summary.value.git = { hasRepo: true, branch }
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  async function loadAll() {
    const path = projectPath.value
    if (!path) return

    summary.value = { ...emptyStats(), loading: true }

    // Run all fetches in parallel
    await Promise.allSettled([
      loadDocs(path),
      loadDesigns(),
      loadFiles(path),
      loadGit(path),
    ])

    summary.value.loading = false
  }

  // Reload when project changes
  watch(projectPath, (newPath) => {
    if (newPath) loadAll()
    else summary.value = emptyStats()
  }, { immediate: true })

  return { summary, refresh: loadAll }
}
