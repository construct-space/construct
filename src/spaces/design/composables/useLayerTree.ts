/**
 * useLayerTree - Hierarchical layer management for UI canvas
 *
 * Manages:
 * - Tree structure from flat node array (using parentId)
 * - Reparenting nodes (drag into frames/groups)
 * - Reordering within parent
 * - Absolute position calculation for nested elements
 * - Expand/collapse state
 */

import { useUIState } from './useUIState'
import type { DesignNode } from '~/types/design'

export interface LayerTreeNode {
  node: DesignNode
  depth: number
  isExpanded: boolean
  absoluteX: number
  absoluteY: number
  children: LayerTreeNode[]
}

// Expand/collapse state (persists across rebuilds)
const expandedIds = ref<Set<string>>(new Set())
// Track expanded state changes for reactivity
const expandedVersion = ref(0)

export function useLayerTree(nodesRef?: Ref<DesignNode[]>) {
  const state = useUIState()
  // Use passed nodes ref or fall back to state
  const nodesSource = nodesRef ?? computed(() => [...state.nodes.value] as DesignNode[])

  // ============================================
  // TREE BUILDING
  // ============================================

  // Track which parents we've already auto-expanded (to avoid re-expanding after user collapses)
  const autoExpandedIds = new Set<string>()

  /**
   * Build tree structure from flat nodes array
   * Uses parentId to establish hierarchy
   */
  const buildTree = computed((): LayerTreeNode[] => {
    // Trigger reactivity on expanded changes
    void expandedVersion.value
    const nodes = nodesSource.value
    const nodeMap = new Map<string, DesignNode>()

    // Auto-expand NEW parents only (not ones user has already seen/collapsed)
    for (const node of nodes) {
      if (node.parentId && !autoExpandedIds.has(node.parentId)) {
        expandedIds.value.add(node.parentId)
        autoExpandedIds.add(node.parentId)
      }
    }

    // Index all nodes
    for (const node of nodes) {
      nodeMap.set(node.id, node)
    }

    // Build children map with original indices for tiebreaking
    const childrenMap = new Map<string | null, Array<{ node: DesignNode; index: number }>>()
    childrenMap.set(null, []) // Root level

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!
      const parentId = node.parentId ?? null
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, [])
      }
      childrenMap.get(parentId)!.push({ node, index: i })
    }

    // Sort children by array index (reversed for layer panel)
    // Last in array = front of canvas = top of layer panel
    // This matches Figma behavior where topmost visual layer is at top of list
    const sortedChildrenMap = new Map<string | null, DesignNode[]>()
    for (const [parentId, children] of childrenMap) {
      const sorted = children
        .sort((a, b) => b.index - a.index) // Higher index = front = top of layer panel
        .map(item => item.node)
      sortedChildrenMap.set(parentId, sorted)
    }

    // Recursive tree builder
    const buildNode = (
      node: DesignNode,
      depth: number,
      parentAbsX: number,
      parentAbsY: number
    ): LayerTreeNode => {
      const absoluteX = parentAbsX + node.x
      const absoluteY = parentAbsY + node.y
      const children = sortedChildrenMap.get(node.id) ?? []

      return {
        node,
        depth,
        isExpanded: expandedIds.value.has(node.id),
        absoluteX,
        absoluteY,
        children: children.map(child =>
          buildNode(child, depth + 1, absoluteX, absoluteY)
        )
      }
    }

    // Build root level nodes
    const rootNodes = sortedChildrenMap.get(null) ?? []
    return rootNodes.map(node => buildNode(node, 0, 0, 0))
  })

  /**
   * Flatten tree to list (for layer panel display)
   * Returns nodes in visual order with depth info
   */
  const flattenedTree = computed((): LayerTreeNode[] => {
    const result: LayerTreeNode[] = []

    const flatten = (nodes: LayerTreeNode[]) => {
      for (const treeNode of nodes) {
        result.push(treeNode)
        if (treeNode.isExpanded && treeNode.children.length > 0) {
          flatten(treeNode.children)
        }
      }
    }

    flatten(buildTree.value)
    return result
  })

  // ============================================
  // EXPAND/COLLAPSE
  // ============================================

  const toggleExpanded = (id: string): void => {
    if (expandedIds.value.has(id)) {
      expandedIds.value.delete(id)
    } else {
      expandedIds.value.add(id)
    }
    // Trigger reactivity
    expandedVersion.value++
  }

  const expandNode = (id: string): void => {
    expandedIds.value.add(id)
    expandedVersion.value++
  }

  const collapseNode = (id: string): void => {
    expandedIds.value.delete(id)
    expandedVersion.value++
  }

  const expandAll = (): void => {
    for (const node of nodesSource.value) {
      if (canHaveChildren(node)) {
        expandedIds.value.add(node.id)
      }
    }
    expandedVersion.value++
  }

  const collapseAll = (): void => {
    expandedIds.value.clear()
    expandedVersion.value++
  }

  const isExpanded = (id: string): boolean => {
    return expandedIds.value.has(id)
  }

  // ============================================
  // HIERARCHY OPERATIONS
  // ============================================

  /**
   * Check if a node type can contain children
   */
  const canHaveChildren = (node: DesignNode): boolean => {
    return node.type === 'screen' || node.type === 'group'
  }

  /**
   * Get all ancestor IDs for a node
   */
  const getAncestorIds = (nodeId: string): string[] => {
    const ancestors: string[] = []
    let current = state.getNode(nodeId)

    while (current?.parentId) {
      ancestors.push(current.parentId)
      current = state.getNode(current.parentId)
    }

    return ancestors
  }

  /**
   * Get all descendant IDs for a node (recursive)
   */
  const getDescendantIds = (nodeId: string): string[] => {
    const descendants: string[] = []

    const collect = (id: string) => {
      const children = state.nodes.value.filter(n => n.parentId === id)
      for (const child of children) {
        descendants.push(child.id)
        collect(child.id)
      }
    }

    collect(nodeId)
    return descendants
  }

  /**
   * Move a node to a new index within its current parent
   * Index is based on display order (last in array = front = top of layer panel)
   */
  const reorderNode = (nodeId: string, newIndex: number): boolean => {
    const node = state.getNode(nodeId)
    if (!node) return false

    const parentId = node.parentId ?? null

    // Find all sibling slots in global canvas order (back -> front).
    const allNodes = [...state.nodes.value]
    const siblingIndices: number[] = []

    for (let i = 0; i < allNodes.length; i++) {
      if ((allNodes[i]!.parentId ?? null) === parentId) {
        siblingIndices.push(i)
      }
    }

    if (siblingIndices.length < 2) return false

    // Layer panel order is reverse of canvas order for siblings: front -> back.
    const siblingIdsInCanvasOrder = siblingIndices.map(index => allNodes[index]!.id)
    const siblingIdsInDisplayOrder = [...siblingIdsInCanvasOrder].reverse()

    const currentDisplayIndex = siblingIdsInDisplayOrder.indexOf(nodeId)
    if (currentDisplayIndex === -1) return false

    const clampedIndex = Math.max(0, Math.min(newIndex, siblingIdsInDisplayOrder.length - 1))
    if (currentDisplayIndex === clampedIndex) return false

    siblingIdsInDisplayOrder.splice(currentDisplayIndex, 1)
    siblingIdsInDisplayOrder.splice(clampedIndex, 0, nodeId)

    // Convert back to canvas order (back -> front) and remap sibling IDs into original slots.
    const nextSiblingIdsInCanvasOrder = [...siblingIdsInDisplayOrder].reverse()
    const nextOrderIds = allNodes.map(n => n.id)
    siblingIndices.forEach((arrayIndex, siblingSlotIndex) => {
      const siblingId = nextSiblingIdsInCanvasOrder[siblingSlotIndex]
      if (siblingId) {
        nextOrderIds[arrayIndex] = siblingId
      }
    })

    state.reorderNodes(nextOrderIds)

    return true
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Find a tree node by ID
   */
  const findTreeNode = (id: string): LayerTreeNode | null => {
    const search = (nodes: LayerTreeNode[]): LayerTreeNode | null => {
      for (const treeNode of nodes) {
        if (treeNode.node.id === id) return treeNode
        const found = search(treeNode.children)
        if (found) return found
      }
      return null
    }

    return search(buildTree.value)
  }

  /**
   * Get the depth of a node in the tree
   */
  const getNodeDepth = (nodeId: string): number => {
    const treeNode = findTreeNode(nodeId)
    return treeNode?.depth ?? 0
  }

  /**
   * Get absolute position of a node
   */
  const getAbsolutePosition = (nodeId: string): { x: number; y: number } | null => {
    const treeNode = findTreeNode(nodeId)
    if (!treeNode) return null

    return {
      x: treeNode.absoluteX,
      y: treeNode.absoluteY
    }
  }

  /**
   * Get children of a node
   */
  const getChildren = (nodeId: string): DesignNode[] => {
    return state.nodes.value.filter(n => n.parentId === nodeId) as DesignNode[]
  }

  /**
   * Check if a node has children
   */
  const hasChildren = (nodeId: string): boolean => {
    return state.nodes.value.some(n => n.parentId === nodeId)
  }

  /**
   * Get the root-level nodes (no parent)
   */
  const getRootNodes = (): DesignNode[] => {
    return state.nodes.value.filter(n => !n.parentId) as DesignNode[]
  }

  return {
    // Tree data
    tree: buildTree,
    flattenedTree,

    // Expand/collapse
    toggleExpanded,
    expandNode,
    collapseNode,
    expandAll,
    collapseAll,
    isExpanded,

    // Hierarchy operations
    canHaveChildren,
    getAncestorIds,
    getDescendantIds,
    reorderNode,

    // Helpers
    findTreeNode,
    getNodeDepth,
    getAbsolutePosition,
    getChildren,
    hasChildren,
    getRootNodes
  }
}
