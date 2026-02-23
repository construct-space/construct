/**
 * usePages - Multi-page management for UI Designer
 * Handles page CRUD, switching, and persistence
 */
import type { DesignPage, DesignNode, Comment } from '~/types/design'

export function usePages() {
  const pages = ref<DesignPage[]>([])
  const currentPageId = ref<string | null>(null)

  // Get current page
  const currentPage = computed(() =>
    pages.value.find(p => p.id === currentPageId.value) ?? null
  )

  // Get current page index
  const currentPageIndex = computed(() =>
    pages.value.findIndex(p => p.id === currentPageId.value)
  )

  // Initialize with a default page if none exist
  function initializePages(existingPages?: DesignPage[], existingNodes?: DesignNode[]) {
    if (existingPages?.length) {
      pages.value = existingPages
      currentPageId.value = existingPages[0]!.id
    } else if (existingNodes?.length) {
      // Migrate legacy single-page design
      const defaultPage: DesignPage = {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: 'Page 1',
        nodes: existingNodes,
      }
      pages.value = [defaultPage]
      currentPageId.value = defaultPage.id
    } else {
      // Create empty first page
      const defaultPage: DesignPage = {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: 'Page 1',
        nodes: [],
      }
      pages.value = [defaultPage]
      currentPageId.value = defaultPage.id
    }
  }

  // Add a new page
  function addPage(name?: string): DesignPage {
    const pageNumber = pages.value.length + 1
    const page: DesignPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name || `Page ${pageNumber}`,
      nodes: [],
    }
    pages.value.push(page)
    currentPageId.value = page.id
    return page
  }

  // Duplicate a page with fresh IDs for all nodes and comments
  function duplicatePage(pageId: string): DesignPage | null {
    const source = pages.value.find(p => p.id === pageId)
    if (!source) return null

    // Build old->new ID mapping for nodes
    const idMap = new Map<string, string>()
    for (const node of source.nodes) {
      idMap.set(node.id, `${node.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
    }

    // Deep-clone nodes with new IDs, updating parentId references
    const clonedNodes: DesignNode[] = source.nodes.map((node) => {
      const cloned = JSON.parse(JSON.stringify(node)) as DesignNode
      cloned.id = idMap.get(node.id) || cloned.id
      if (cloned.parentId && idMap.has(cloned.parentId)) {
        cloned.parentId = idMap.get(cloned.parentId)
      }
      // Update prototype interaction targets that reference nodes on this page
      if (cloned.prototypeInteractions) {
        for (const interaction of cloned.prototypeInteractions) {
          if (interaction.target && idMap.has(interaction.target)) {
            interaction.target = idMap.get(interaction.target)!
          }
        }
      }
      return cloned
    })

    // Clone comments with fresh IDs
    let clonedComments: Comment[] | undefined
    if (source.comments?.length) {
      clonedComments = source.comments.map((c) => {
        const cloned = JSON.parse(JSON.stringify(c)) as Comment
        cloned.id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        if (cloned.replies) {
          for (const reply of cloned.replies) {
            reply.id = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
          }
        }
        return cloned
      })
    }

    const page: DesignPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${source.name} (Copy)`,
      nodes: clonedNodes,
      comments: clonedComments,
      width: source.width,
      height: source.height,
    }

    // Insert after source page
    const sourceIndex = pages.value.findIndex(p => p.id === pageId)
    pages.value.splice(sourceIndex + 1, 0, page)
    currentPageId.value = page.id
    return page
  }

  // Delete a page
  function deletePage(pageId: string): boolean {
    if (pages.value.length <= 1) {
      // Can't delete the last page
      return false
    }

    const index = pages.value.findIndex(p => p.id === pageId)
    if (index === -1) return false

    pages.value.splice(index, 1)

    // If deleted current page, switch to another
    if (currentPageId.value === pageId) {
      currentPageId.value = pages.value[Math.max(0, index - 1)]!.id
    }

    return true
  }

  // Rename a page
  function renamePage(pageId: string, name: string) {
    const page = pages.value.find(p => p.id === pageId)
    if (page) {
      page.name = name
    }
  }

  // Switch to a page
  function switchToPage(pageId: string) {
    if (pages.value.some(p => p.id === pageId)) {
      currentPageId.value = pageId
    }
  }

  // Navigate to next/previous page
  function nextPage() {
    const idx = currentPageIndex.value
    if (idx < pages.value.length - 1) {
      currentPageId.value = pages.value[idx + 1]!.id
    }
  }

  function previousPage() {
    const idx = currentPageIndex.value
    if (idx > 0) {
      currentPageId.value = pages.value[idx - 1]!.id
    }
  }

  // Reorder pages
  function reorderPages(orderedIds: string[]) {
    const reordered: DesignPage[] = []
    for (const id of orderedIds) {
      const page = pages.value.find(p => p.id === id)
      if (page) reordered.push(page)
    }
    pages.value = reordered
  }

  // Update current page nodes
  function updateCurrentPageNodes(nodes: DesignNode[]) {
    const page = currentPage.value
    if (page) {
      page.nodes = nodes
    }
  }

  // Update current page comments
  function updateCurrentPageComments(comments: Comment[]) {
    const page = currentPage.value
    if (page) {
      page.comments = comments
    }
  }

  // Add nodes to a specific page (used by move-to-page)
  function addNodesToPage(pageId: string, nodes: DesignNode[]) {
    const page = pages.value.find(p => p.id === pageId)
    if (page) {
      page.nodes.push(...nodes)
    }
  }

  // Export pages for saving
  function exportPages(): DesignPage[] {
    return JSON.parse(JSON.stringify(pages.value))
  }

  return {
    // State
    pages: readonly(pages),
    currentPageId: readonly(currentPageId),
    currentPage,
    currentPageIndex,

    // Methods
    initializePages,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    switchToPage,
    nextPage,
    previousPage,
    reorderPages,
    updateCurrentPageNodes,
    updateCurrentPageComments,
    addNodesToPage,
    exportPages,
  }
}

// Singleton instance for global state
let instance: ReturnType<typeof usePages> | null = null

export function usePagesState() {
  if (!instance) {
    instance = usePages()
  }
  return instance
}
