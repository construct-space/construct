/**
 * Composable for UI design storage using SQLite (via context service)
 * Single source of truth: SQLite database (context.db)
 */
import type { DesignNode, DesignPage } from '@construct/sdk'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

// Re-export UIDesign type for consumers
export interface UIDesign {
  id?: number
  localId: string
  projectId: string | null
  name: string
  nodes: DesignNode[]
  pages?: DesignPage[]
  currentPageId?: string
  viewport: { x: number, y: number, scale: number }
  history?: string[]
  historyIndex?: number
  createdAt: Date
  updatedAt: Date
}

// Generate unique local ID
export function generateLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Context service request helper with connection waiting
async function sendDesignRequest<T>(requestType: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  let retries = 0
  const maxRetries = 20
  while (retries < maxRetries) {
    try {
      const result = await tauriInvoke<T>('send_context_request', { requestType, payload })
      return result
    }
    catch (e) {
      const errorMsg = String(e)
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

export function useLocalDesigns() {
  const designs = ref<UIDesign[]>([])
  const currentDesign = ref<UIDesign | null>(null)
  const loading = ref(false)
  const saving = ref(false)

  // Load all designs from SQLite
  const loadDesigns = async (projectId: string | null) => {
    loading.value = true
    try {
      const result = await sendDesignRequest<{ designs: UIDesign[] }>('designs.list', {
        projectId: projectId ?? undefined,
      })

      if (result?.designs) {
        designs.value = result.designs
          .map(d => ({
            ...d,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt),
          }))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      }
      else {
        designs.value = []
      }

      return designs.value
    }
    catch (error) {
      console.error('Failed to load designs:', error)
      return []
    }
    finally {
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

        const existingIndex = designs.value.findIndex(d => d.localId === localId)
        if (existingIndex === -1) {
          designs.value.push(design)
        }
        else {
          designs.value[existingIndex] = design
        }

        return design
      }
      return null
    }
    catch (error) {
      console.error('[useLocalDesigns] Failed to load design:', error)
      return null
    }
  }

  // Create new design in SQLite
  const createDesign = async (projectId: string | null, name?: string): Promise<UIDesign> => {
    const localId = generateLocalId()
    const designName = name || `Design ${designs.value.length + 1}`

    const result = await sendDesignRequest<{ id: number, localId: string }>('designs.save', {
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

    return design
  }

  // Update nodes in SQLite
  const updateNodes = async (localId: string, nodes: DesignNode[], pages?: DesignPage[], currentPageId?: string) => {
    if (!localId)
      return
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
      }
    }
    catch (error) {
      console.error('Failed to update nodes:', error)
    }
    finally {
      saving.value = false
    }
  }

  // Update viewport in SQLite
  const updateViewport = async (localId: string, viewport: { x: number, y: number, scale: number }) => {
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
    }
    catch (error) {
      console.error('Failed to update viewport:', error)
    }
  }

  // Update history in SQLite
  const updateHistory = async (localId: string, history: string[], historyIndex: number) => {
    if (!localId)
      return
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
    }
    catch (error) {
      console.error('Failed to update history:', error)
    }
  }

  // Rename design in SQLite
  const renameDesign = async (localId: string, name: string) => {
    try {
      const design = designs.value.find(d => d.localId === localId)
      if (!design)
        return

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

      design.name = name
      design.updatedAt = new Date()

      if (currentDesign.value?.localId === localId) {
        currentDesign.value.name = name
      }
    }
    catch (error) {
      console.error('Failed to rename design:', error)
    }
  }

  // Delete design from SQLite
  const deleteDesign = async (localId: string) => {
    try {
      await sendDesignRequest('designs.delete', { localId })
      designs.value = designs.value.filter(d => d.localId !== localId)

      if (currentDesign.value?.localId === localId) {
        currentDesign.value = null
      }
    }
    catch (error) {
      console.error('Failed to delete design:', error)
    }
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
  }
}
