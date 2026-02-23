/**
 * Commit Graph Layout Algorithm
 * Computes lane assignments and connections for a GitKraken-style DAG visualization.
 */
import { computed, type Ref } from 'vue'
import type { GitCommit } from './useGitRepo'

// ============================================================================
// Types
// ============================================================================

export interface GraphNode {
  hash: string
  column: number
  color: string
}

export interface GraphEdge {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  color: string
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxColumns: number
}

// ============================================================================
// Color Palette
// ============================================================================

const GRAPH_COLORS = [
  '#4fc3f7', // cyan
  '#81c784', // green
  '#ff8a65', // orange
  '#ba68c8', // purple
  '#4dd0e1', // teal
  '#ffb74d', // amber
  '#f06292', // pink
  '#aed581', // light green
  '#7986cb', // indigo
  '#e57373', // red
  '#64b5f6', // blue
  '#dce775', // lime
]

function getColor(index: number): string {
  return GRAPH_COLORS[index % GRAPH_COLORS.length] || GRAPH_COLORS[0]!
}

// ============================================================================
// Layout Algorithm
// ============================================================================

/**
 * Compute graph layout from a list of commits.
 * Uses a column-tracking approach: each active branch line occupies a column.
 * As we iterate top-to-bottom (newest first), we track which hash is expected
 * in each column next.
 */
export function computeGraphLayout(commits: readonly GitCommit[]): GraphLayout {
  if (commits.length === 0) return { nodes: [], edges: [], maxColumns: 0 }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Active columns: each entry is the hash expected next in that lane, or null if free
  const columns: (string | null)[] = []

  // Map from hash to its row index (for drawing edges)
  const hashToRow = new Map<string, number>()

  // Pre-build hash-to-row for all known commits
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    if (commit) hashToRow.set(commit.hash, i)
  }

  // Column color assignment (by column index)
  const columnColors = new Map<number, string>()
  let nextColorIndex = 0

  function getColumnColor(col: number): string {
    let color = columnColors.get(col)
    if (!color) {
      color = getColor(nextColorIndex++)
      columnColors.set(col, color)
    }
    return color
  }

  function findColumn(hash: string): number {
    return columns.indexOf(hash)
  }

  function findFreeColumn(): number {
    const idx = columns.indexOf(null)
    return idx === -1 ? columns.length : idx
  }

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]
    if (!commit) continue

    // Find which column this commit occupies
    let col = findColumn(commit.hash)

    if (col === -1) {
      // Not expected in any column — new branch head, allocate a column
      col = findFreeColumn()
      if (col >= columns.length) {
        columns.push(commit.hash)
      } else {
        columns[col] = commit.hash
      }
    }

    const color = getColumnColor(col)
    nodes.push({ hash: commit.hash, column: col, color })

    // Now handle parents
    const parents = commit.parents

    if (parents.length === 0) {
      // Root commit — free this column
      columns[col] = null
    } else {
      // First parent continues in the same column
      const firstParent = parents[0]!
      columns[col] = firstParent

      // Draw edge to first parent
      const firstParentRow = hashToRow.get(firstParent)
      if (firstParentRow !== undefined) {
        edges.push({
          fromRow: row,
          fromCol: col,
          toRow: firstParentRow,
          toCol: col, // Will be corrected below if parent lands in different column
          color,
        })
      }

      // Additional parents (merge commits) — find or allocate columns
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p]!
        let parentCol = findColumn(parentHash)

        if (parentCol === -1) {
          // Parent not yet tracked — allocate a new column
          parentCol = findFreeColumn()
          if (parentCol >= columns.length) {
            columns.push(parentHash)
          } else {
            columns[parentCol] = parentHash
          }
        }

        const parentRow = hashToRow.get(parentHash)
        if (parentRow !== undefined) {
          edges.push({
            fromRow: row,
            fromCol: col,
            toRow: parentRow,
            toCol: parentCol,
            color: getColumnColor(parentCol),
          })
        }
      }
    }

    // Compact: remove trailing null columns
    while (columns.length > 0 && columns[columns.length - 1] === null) {
      columns.pop()
    }
  }

  // Fix edge target columns: the first-parent edge's toCol should match
  // where that parent actually ended up being placed
  for (const edge of edges) {
    const parentNode = nodes.find(n => n.hash === commits[edge.toRow]?.hash)
    if (parentNode) {
      edge.toCol = parentNode.column
    }
  }

  const maxColumns = Math.max(1, ...nodes.map(n => n.column + 1))

  return { nodes, edges, maxColumns }
}

// ============================================================================
// Composable
// ============================================================================

export function useCommitGraph(commits: Ref<readonly GitCommit[]>) {
  const layout = computed(() => computeGraphLayout(commits.value))

  return {
    layout,
    GRAPH_COLORS,
  }
}
