/**
 * Composable for UI design storage using SQLite (via context service)
 * Primary storage: SQLite database (context.db)
 * Secondary: Filesystem sync (.ui files) for backup/portability
 */
import type { DesignNode, DesignPage } from '~/types/design'

// Re-export UIDesign type for consumers
export interface UIDesign {
  id?: number
  localId: string
  projectId: number | null
  name: string
  nodes: DesignNode[]
  pages?: DesignPage[]
  currentPageId?: string
  viewport: { x: number; y: number; scale: number }
  history?: string[]
  historyIndex?: number
  createdAt: Date
  updatedAt: Date
}

// Generate unique local ID
export const generateLocalId = () =>
  `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Tauri filesystem API (lazy loaded for file sync)
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null
let tauriInvoke: typeof import('@tauri-apps/api/core').invoke | null = null

const initTauri = async () => {
  if (typeof window === 'undefined') return false
  try {
    if (!tauriFs) {
      tauriFs = await import('@tauri-apps/plugin-fs')
    }
    if (!tauriInvoke) {
      const { invoke } = await import('@tauri-apps/api/core')
      tauriInvoke = invoke
    }
    return true
  } catch (e) {
    console.warn('[useLocalDesigns] Tauri not available:', e)
    return false
  }
}

// Shell command helper for directory creation
const runShellCommand = async (cmd: string, args: string[], cwd: string): Promise<{ success: boolean; output: string }> => {
  if (!tauriInvoke) {
    await initTauri()
    if (!tauriInvoke) return { success: false, output: 'Tauri not available' }
  }
  try {
    const result = await tauriInvoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
      command: cmd,
      args,
      cwd
    })
    return { success: result.success, output: result.success ? result.stdout : result.stderr }
  } catch (e) {
    return { success: false, output: String(e) }
  }
}

// Context service request helper with connection waiting
const sendDesignRequest = async <T>(requestType: string, payload: Record<string, unknown> = {}): Promise<T | null> => {
  if (!tauriInvoke) {
    const initialized = await initTauri()
    if (!initialized || !tauriInvoke) {
      console.error('[useLocalDesigns] Tauri not initialized')
      return null
    }
  }

  // Wait for context service to be ready (up to 2 seconds)
  let retries = 0
  const maxRetries = 20
  while (retries < maxRetries) {
    try {
      const result = await tauriInvoke<T>('send_context_request', { requestType, payload })
      return result
    } catch (e) {
      const errorMsg = String(e)
      // If not connected, wait and retry
      if (errorMsg.includes('Not connected') && retries < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100))
        retries++
        continue
      }
      console.error(`[useLocalDesigns] ${requestType} failed:`, e)
      return null
    }
  }
  console.error(`[useLocalDesigns] ${requestType} timed out after ${maxRetries} retries`)
  return null
}

export const useLocalDesigns = () => {
  const designs = ref<UIDesign[]>([])
  const currentDesign = ref<UIDesign | null>(null)
  const loading = ref(false)
  const saving = ref(false)

  // Get project path for filesystem operations
  const getProjectPath = (): string => {
    const projectStore = useProjectStore()
    return projectStore.currentProject?.local_path || ''
  }

  // Get design directory path
  const getUIPath = (): string => {
    const projectPath = getProjectPath()
    return projectPath ? `${projectPath}/design` : ''
  }

  // Ensure UI directory exists
  const ensureUIDirectory = async (): Promise<boolean> => {
    const uiPath = getUIPath()
    if (!uiPath) return false

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      const exists = await tauriFs.exists(uiPath)
      if (!exists) {
        await runShellCommand('mkdir', ['-p', uiPath], '/')
      }
      return true
    } catch (e) {
      console.error('[useLocalDesigns] Failed to ensure UI directory:', e)
      return false
    }
  }

  // Convert design name to filename
  const toFilename = (name: string): string => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ui'
  }

  // Save design to filesystem (.ui file) - for backup/export
  const saveToFilesystem = async (design: UIDesign): Promise<boolean> => {
    const uiPath = getUIPath()
    if (!uiPath) return false

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      await ensureUIDirectory()

      const filename = toFilename(design.name)
      const filePath = `${uiPath}/${filename}`

      const fileContent = {
        version: 1,
        type: 'design',
        localId: design.localId,
        name: design.name,
        created: design.createdAt instanceof Date ? design.createdAt.toISOString() : design.createdAt,
        updated: design.updatedAt instanceof Date ? design.updatedAt.toISOString() : design.updatedAt,
        viewport: design.viewport,
        nodes: design.nodes,
        pages: design.pages,
        currentPageId: design.currentPageId,
      }

      await tauriFs.writeTextFile(filePath, JSON.stringify(fileContent, null, 2))
      return true
    } catch (e) {
      console.error('[useLocalDesigns] Failed to save to filesystem:', e)
      return false
    }
  }

  // Delete from filesystem
  const deleteFromFilesystem = async (design: UIDesign): Promise<boolean> => {
    const uiPath = getUIPath()
    if (!uiPath) return false

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      const filename = toFilename(design.name)
      const filePath = `${uiPath}/${filename}`

      const exists = await tauriFs.exists(filePath)
      if (exists) {
        await tauriFs.remove(filePath)
      }
      return true
    } catch (e) {
      console.error('[useLocalDesigns] Failed to delete from filesystem:', e)
      return false
    }
  }

  // Import designs from filesystem to SQLite (migration helper)
  const importFromFilesystem = async (projectId: number | null): Promise<number> => {
    const uiPath = getUIPath()
    if (!uiPath) return 0

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return 0

    let imported = 0
    try {
      const exists = await tauriFs.exists(uiPath)
      if (!exists) return 0

      const entries = await tauriFs.readDir(uiPath)

      for (const entry of entries) {
        if (!entry.name.endsWith('.ui')) continue

        const filePath = `${uiPath}/${entry.name}`
        const content = await tauriFs.readTextFile(filePath)
        const data = JSON.parse(content)

        // Check if already exists in SQLite
        const existing = await sendDesignRequest<{ design: UIDesign | null }>('designs.get', { localId: data.localId })
        if (existing?.design) continue

        // Import to SQLite
        await sendDesignRequest('designs.save', {
          localId: data.localId || generateLocalId(),
          projectId,
          name: data.name,
          nodes: data.nodes || [],
          pages: data.pages || undefined,
          currentPageId: data.currentPageId || undefined,
          viewport: data.viewport || { x: 0, y: 0, scale: 1 },
          historyIndex: 0,
        })
        imported++
      }
    } catch (e) {
      console.error('[useLocalDesigns] Failed to import from filesystem:', e)
    }

    return imported
  }

  // Load all designs from SQLite
  const loadDesigns = async (projectId: number | null) => {
    loading.value = true
    try {
      await initTauri()

      // First import any filesystem designs not yet in SQLite
      await importFromFilesystem(projectId)

      // Load from SQLite
      const result = await sendDesignRequest<{ designs: UIDesign[] }>('designs.list', {
        projectId: projectId ?? undefined
      })

      if (result?.designs) {
        // Parse dates and sort by updatedAt descending
        designs.value = result.designs
          .map(d => ({
            ...d,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt),
          }))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

        // Sync all to filesystem for backup
        for (const design of designs.value) {
          saveToFilesystem(design)
        }
      } else {
        designs.value = []
      }

      return designs.value
    } catch (error) {
      console.error('Failed to load designs:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  // Load single design from SQLite
  const loadDesign = async (localId: string): Promise<UIDesign | null> => {
    try {
      const result = await sendDesignRequest<{ design: UIDesign }>('designs.get', { localId })
      if (result?.design) {
        const design = {
          ...result.design,
          createdAt: new Date(result.design.createdAt),
          updatedAt: new Date(result.design.updatedAt),
        }
        currentDesign.value = design

        // Also add to designs array if not present (needed for updateNodes to find it)
        const existingIndex = designs.value.findIndex(d => d.localId === localId)
        if (existingIndex === -1) {
          designs.value.push(design)
        } else {
          // Update existing entry
          designs.value[existingIndex] = design
        }

        return design
      }
      return null
    } catch (error) {
      console.error('[useLocalDesigns] Failed to load design:', error)
      return null
    }
  }

  // Create new design in SQLite
  const createDesign = async (projectId: number | null, name?: string): Promise<UIDesign> => {
    const localId = generateLocalId()
    const designName = name || `Design ${designs.value.length + 1}`

    const result = await sendDesignRequest<{ id: number; localId: string }>('designs.save', {
      localId,
      projectId,
      name: designName,
      nodes: [],
      pages: [],
      viewport: { x: 0, y: 0, scale: 1 },
      historyIndex: 0,
    })

    if (!result) {
      throw new Error('Failed to create design')
    }

    const now = new Date()
    const design: UIDesign = {
      id: result.id,
      localId: result.localId,
      projectId,
      name: designName,
      nodes: [],
      pages: [],
      viewport: { x: 0, y: 0, scale: 1 },
      createdAt: now,
      updatedAt: now,
    }

    designs.value.unshift(design)
    currentDesign.value = design

    // Save to filesystem
    await saveToFilesystem(design)

    return design
  }

  // Update nodes in SQLite
  const updateNodes = async (localId: string, nodes: DesignNode[], pages?: DesignPage[], currentPageId?: string) => {
    if (!localId) return
    saving.value = true
    try {
      const plainNodes = JSON.parse(JSON.stringify(nodes)) as DesignNode[]
      const design = designs.value.find(d => d.localId === localId)

      if (design) {
        const plainPages = pages !== undefined
          ? JSON.parse(JSON.stringify(pages)) as DesignPage[]
          : design.pages
            ? JSON.parse(JSON.stringify(design.pages)) as DesignPage[]
            : undefined
        const nextCurrentPageId = currentPageId ?? design.currentPageId

        // Save to SQLite
        await sendDesignRequest('designs.save', {
          localId,
          projectId: design.projectId,
          name: design.name,
          nodes: plainNodes,
          pages: plainPages,
          currentPageId: nextCurrentPageId,
          viewport: design.viewport,
          history: design.history,
          historyIndex: design.historyIndex || 0,
        })

        // Update local state
        design.nodes = nodes
        if (plainPages !== undefined) {
          design.pages = plainPages
        }
        if (nextCurrentPageId !== undefined) {
          design.currentPageId = nextCurrentPageId
        }
        design.updatedAt = new Date()

        if (currentDesign.value?.localId === localId) {
          currentDesign.value.nodes = nodes
          if (plainPages !== undefined) {
            currentDesign.value.pages = plainPages
          }
          if (nextCurrentPageId !== undefined) {
            currentDesign.value.currentPageId = nextCurrentPageId
          }
          currentDesign.value.updatedAt = design.updatedAt
        }

        // Sync to filesystem
        saveToFilesystem(design)
      }
    } catch (error) {
      console.error('Failed to update nodes:', error)
    } finally {
      saving.value = false
    }
  }

  // Update viewport in SQLite
  const updateViewport = async (localId: string, viewport: { x: number; y: number; scale: number }) => {
    try {
      const plainViewport = JSON.parse(JSON.stringify(viewport))
      const design = designs.value.find(d => d.localId === localId)

      if (design) {
        await sendDesignRequest('designs.save', {
          localId,
          projectId: design.projectId,
          name: design.name,
          nodes: design.nodes,
          pages: design.pages,
          currentPageId: design.currentPageId,
          viewport: plainViewport,
          history: design.history,
          historyIndex: design.historyIndex || 0,
        })

        design.viewport = plainViewport
        design.updatedAt = new Date()

        if (currentDesign.value?.localId === localId) {
          currentDesign.value.viewport = plainViewport
        }
      }
    } catch (error) {
      console.error('Failed to update viewport:', error)
    }
  }

  // Update history in SQLite
  const updateHistory = async (localId: string, history: string[], historyIndex: number) => {
    if (!localId) return
    try {
      const plainHistory = JSON.parse(JSON.stringify(history))
      const design = designs.value.find(d => d.localId === localId)

      if (design) {
        await sendDesignRequest('designs.save', {
          localId,
          projectId: design.projectId,
          name: design.name,
          nodes: design.nodes,
          pages: design.pages,
          currentPageId: design.currentPageId,
          viewport: design.viewport,
          history: plainHistory,
          historyIndex,
        })

        design.history = plainHistory
        design.historyIndex = historyIndex
        design.updatedAt = new Date()

        if (currentDesign.value?.localId === localId) {
          currentDesign.value.history = plainHistory
          currentDesign.value.historyIndex = historyIndex
        }
      }
    } catch (error) {
      console.error('Failed to update history:', error)
    }
  }

  // Rename design in SQLite
  const renameDesign = async (localId: string, name: string) => {
    try {
      const design = designs.value.find(d => d.localId === localId)
      if (!design) return

      const oldName = design.name

      // Save with new name to SQLite
      await sendDesignRequest('designs.save', {
        localId,
        projectId: design.projectId,
        name,
        nodes: design.nodes,
        pages: design.pages,
        currentPageId: design.currentPageId,
        viewport: design.viewport,
        history: design.history,
        historyIndex: design.historyIndex || 0,
      })

      // Delete old filesystem file if name changed
      if (oldName !== name) {
        await deleteFromFilesystem({ ...design, name: oldName } as UIDesign)
      }

      // Update local state
      design.name = name
      design.updatedAt = new Date()

      if (currentDesign.value?.localId === localId) {
        currentDesign.value.name = name
      }

      // Save to filesystem with new name
      await saveToFilesystem(design)
    } catch (error) {
      console.error('Failed to rename design:', error)
    }
  }

  // Delete design from SQLite
  const deleteDesign = async (localId: string) => {
    try {
      const design = designs.value.find(d => d.localId === localId)

      // Delete from SQLite
      await sendDesignRequest('designs.delete', { localId })

      // Update local state
      designs.value = designs.value.filter(d => d.localId !== localId)

      // Delete from filesystem
      if (design) {
        await deleteFromFilesystem(design)
      }

      if (currentDesign.value?.localId === localId) {
        currentDesign.value = null
      }
    } catch (error) {
      console.error('Failed to delete design:', error)
    }
  }

  // Force save current design to filesystem
  const saveDesignToFile = async (localId?: string): Promise<boolean> => {
    const id = localId || currentDesign.value?.localId
    if (!id) return false

    const design = designs.value.find(d => d.localId === id) || currentDesign.value
    if (!design) return false

    return await saveToFilesystem(design)
  }

  return {
    designs,
    currentDesign,
    loading,
    saving,
    loadDesigns,
    loadDesign,
    createDesign,
    updateNodes,
    updateViewport,
    updateHistory,
    renameDesign,
    deleteDesign,
    saveDesignToFile,
    // Helpers for external access
    getUIPath,
    ensureUIDirectory,
  }
}
