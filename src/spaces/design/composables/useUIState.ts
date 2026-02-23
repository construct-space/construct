/**
 * useUIState - Global state for UI Designer
 *
 * Uses DesignNode type for compatibility with design space components.
 * Manages: Node tree, Selection, Undo/redo history
 *
 * History system:
 * - history[] stores snapshots of nodes at each point in time
 * - historyIndex points to the current state in history
 * - Undo: restore history[historyIndex - 1]
 * - Redo: restore history[historyIndex + 1]
 * - withHistoryTransaction(): coalesces many node mutations into one history entry
 */
import type { DesignNode } from '~/types/design'

const nodes = ref<DesignNode[]>([])
const selectedIds = ref<string[]>([])
const history = ref<DesignNode[][]>([[]])  // Start with empty state
const historyIndex = ref(0)
const historyTransactionDepth = ref(0)
const historyTransactionDirty = ref(false)

export function useUIState() {
  function markHistoryDirty() {
    if (historyTransactionDepth.value > 0) {
      historyTransactionDirty.value = true
    }
  }

  function saveToHistoryInternal() {
    const currentState = JSON.parse(JSON.stringify(nodes.value))

    // Don't save if state hasn't changed from current history position
    if (history.value[historyIndex.value] &&
        JSON.stringify(currentState) === JSON.stringify(history.value[historyIndex.value])) {
      return
    }

    // Truncate any redo states (we're creating a new branch)
    history.value = history.value.slice(0, historyIndex.value + 1)

    // Add new state
    history.value.push(currentState)
    historyIndex.value = history.value.length - 1

    // Limit history size to 50 entries
    if (history.value.length > 50) {
      history.value.shift()
      historyIndex.value--
    }
  }

  // ===================== SELECTION =====================

  function selectNodes(ids: string[]) {
    selectedIds.value = ids
  }

  function clearSelection() {
    selectedIds.value = []
  }

  // ===================== NODE CRUD =====================

  function addNode(node: DesignNode) {
    nodes.value = [...nodes.value, node]
    saveToHistory()
  }

  /** Add node without saving to history — use for batch operations, call saveToHistory() when done */
  function addNodeRaw(node: DesignNode) {
    nodes.value = [...nodes.value, node]
    markHistoryDirty()
  }

  /**
   * Update node without saving to history.
   * Use this for continuous updates (drag operations).
   * Call saveToHistory() manually when the operation completes.
   */
  function updateNode(id: string, updates: Partial<DesignNode>) {
    const idx = nodes.value.findIndex(n => n.id === id)
    if (idx === -1) return

    const updated = { ...nodes.value[idx], ...updates } as DesignNode
    const newNodes = [...nodes.value]
    newNodes[idx] = updated
    nodes.value = newNodes
    markHistoryDirty()
  }

  /**
   * Update node AND save to history.
   * Use this for discrete property changes (from properties panel).
   */
  function updateNodeWithHistory(id: string, updates: Partial<DesignNode>) {
    updateNode(id, updates)
    saveToHistory()
  }

  function deleteNode(id: string) {
    nodes.value = nodes.value.filter(n => n.id !== id)
    selectedIds.value = selectedIds.value.filter(s => s !== id)
    saveToHistory()
  }

  function deleteNodes(ids: string[]) {
    if (!ids.length) return
    nodes.value = nodes.value.filter(n => !ids.includes(n.id))
    selectedIds.value = selectedIds.value.filter(s => !ids.includes(s))
    saveToHistory()
  }

  /** Delete nodes without saving to history — use for batch operations, call saveToHistory() when done */
  function deleteNodesRaw(ids: string[]) {
    if (!ids.length) return
    nodes.value = nodes.value.filter(n => !ids.includes(n.id))
    selectedIds.value = selectedIds.value.filter(s => !ids.includes(s))
    markHistoryDirty()
  }

  function reorderNodes(orderedIds: string[]) {
    // Reorder nodes based on the provided ID order (from canvas z-index)
    const nodeMap = new Map(nodes.value.map(n => [n.id, n]))
    const reordered: DesignNode[] = []

    // Add nodes in the new order
    for (const id of orderedIds) {
      const node = nodeMap.get(id)
      if (node) {
        reordered.push(node)
        nodeMap.delete(id)
      }
    }

    // Add any remaining nodes not in orderedIds (shouldn't happen, but safety)
    for (const node of nodeMap.values()) {
      reordered.push(node)
    }

    nodes.value = reordered
    markHistoryDirty()
  }

  // ===================== QUERIES =====================

  function getNode(id: string): DesignNode | undefined {
    return nodes.value.find(n => n.id === id)
  }

  function getSelectedNodes(): DesignNode[] {
    return selectedIds.value.map(id => getNode(id)).filter(Boolean) as DesignNode[]
  }

  // ===================== VISIBILITY & LOCK =====================

  function toggleVisibility(id: string) {
    const node = getNode(id)
    if (node) {
      updateNode(id, { visible: node.visible === false ? true : false })
    }
  }

  function toggleLock(id: string) {
    const node = getNode(id)
    if (node) {
      updateNode(id, { locked: !node.locked })
    }
  }

  // ===================== HISTORY =====================

  function beginHistoryTransaction() {
    historyTransactionDepth.value++
  }

  function endHistoryTransaction() {
    if (historyTransactionDepth.value <= 0) return
    historyTransactionDepth.value--

    if (historyTransactionDepth.value === 0) {
      const shouldSave = historyTransactionDirty.value
      historyTransactionDirty.value = false
      if (shouldSave) {
        saveToHistoryInternal()
      }
    }
  }

  function withHistoryTransaction<T>(operation: () => T): T {
    beginHistoryTransaction()
    try {
      return operation()
    } finally {
      endHistoryTransaction()
    }
  }

  async function withHistoryTransactionAsync<T>(operation: () => Promise<T>): Promise<T> {
    beginHistoryTransaction()
    try {
      const result = await operation()
      return result
    } finally {
      endHistoryTransaction()
    }
  }

  /**
   * Save current state to history.
   * Called AFTER making changes to nodes.
   */
  function saveToHistory() {
    if (historyTransactionDepth.value > 0) {
      historyTransactionDirty.value = true
      return
    }

    saveToHistoryInternal()
  }

  /**
   * Undo to previous state
   */
  function undo() {
    if (historyIndex.value <= 0) return

    historyIndex.value--
    nodes.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]))
    clearSelection()
  }

  /**
   * Redo to next state
   */
  function redo() {
    if (historyIndex.value >= history.value.length - 1) return

    historyIndex.value++
    nodes.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]))
    clearSelection()
  }

  /**
   * Reset history (call when loading a new design)
   */
  function resetHistory() {
    history.value = [JSON.parse(JSON.stringify(nodes.value))]
    historyIndex.value = 0
    historyTransactionDepth.value = 0
    historyTransactionDirty.value = false
  }

  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  // ===================== IMPORT/EXPORT =====================

  function loadFromJSON(data: DesignNode[]) {
    nodes.value = data
    selectedIds.value = []
    resetHistory()  // Reset history with loaded state as initial
  }

  function exportToJSON(): DesignNode[] {
    return JSON.parse(JSON.stringify(nodes.value))
  }

  function clear() {
    nodes.value = []
    selectedIds.value = []
    saveToHistory()
  }

  return {
    // State
    nodes: readonly(nodes),
    selectedIds: readonly(selectedIds),

    // Selection
    selectNodes,
    clearSelection,
    getSelectedNodes,

    // CRUD
    addNode,
    addNodeRaw,
    updateNode,
    updateNodeWithHistory,
    deleteNode,
    deleteNodes,
    deleteNodesRaw,
    reorderNodes,
    getNode,

    // Visibility & Lock
    toggleVisibility,
    toggleLock,

    // History
    beginHistoryTransaction,
    endHistoryTransaction,
    withHistoryTransaction,
    withHistoryTransactionAsync,
    saveToHistory,
    resetHistory,
    undo,
    redo,
    canUndo,
    canRedo,

    // Import/Export
    loadFromJSON,
    exportToJSON,
    clear,
  }
}
