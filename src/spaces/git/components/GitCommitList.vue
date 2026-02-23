<script setup lang="ts">
/**
 * GitCommitList - GitKraken-style commit history with DAG graph
 * Compact row layout with inline SVG branch graph, ref labels, and lazy loading
 */
import type { GitCommit } from '../composables/useGitRepo'
import { useCommitGraph } from '../composables/useCommitGraph'

interface Props {
  commits: readonly GitCommit[]
  selectedHash?: string | null
  hasMore?: boolean
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectedHash: null,
  hasMore: false,
  isLoading: false,
})

const emit = defineEmits<{
  (e: 'select', commit: GitCommit): void
  (e: 'loadMore'): void
}>()

// Graph layout
const commitsRef = computed(() => props.commits)
const { layout } = useCommitGraph(commitsRef)

// Infinite scroll container ref
const containerRef = ref<HTMLElement | null>(null)

// Graph dimensions
const ROW_HEIGHT = 36
const COL_WIDTH = 16
const NODE_RADIUS = 4
const GRAPH_PAD_LEFT = 12

// Computed graph SVG width
const graphWidth = computed(() => {
  return GRAPH_PAD_LEFT + layout.value.maxColumns * COL_WIDTH + 8
})

// Get x position for a column
const colX = (col: number) => GRAPH_PAD_LEFT + col * COL_WIDTH

// Get y position for a row (center of the row)
const rowY = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2

// Format relative date
const formatRelativeDate = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffWeeks < 4) return `${diffWeeks}w`
  if (diffMonths < 12) return `${diffMonths}mo`
  return `${diffYears}y`
}

// Parse ref labels (strip HEAD -> prefix, categorize)
const parseRefs = (refs: readonly string[]): { branches: string[]; tags: string[]; isHead: boolean } => {
  const branches: string[] = []
  const tags: string[] = []
  let isHead = false

  for (const ref of refs) {
    if (ref.includes('HEAD')) isHead = true
    // "HEAD -> main" → extract "main"
    const headMatch = ref.match(/HEAD -> (.+)/)
    if (headMatch && headMatch[1]) {
      branches.push(headMatch[1])
      continue
    }
    // "tag: v1.0.0" → extract "v1.0.0"
    const tagMatch = ref.match(/tag: (.+)/)
    if (tagMatch && tagMatch[1]) {
      tags.push(tagMatch[1])
      continue
    }
    // "origin/main" → show as remote ref
    if (ref.startsWith('origin/')) {
      // Skip remote refs that match a local branch (to avoid duplication)
      const localName = ref.replace('origin/', '')
      if (!branches.includes(localName)) {
        branches.push(ref)
      }
      continue
    }
    // Plain branch name
    if (ref !== 'HEAD') {
      branches.push(ref)
    }
  }

  return { branches, tags, isHead }
}

// Generate SVG path for an edge (curved line between commits)
const getEdgePath = (edge: { fromRow: number; fromCol: number; toRow: number; toCol: number }): string => {
  const x1 = colX(edge.fromCol)
  const y1 = rowY(edge.fromRow)
  const x2 = colX(edge.toCol)
  const y2 = rowY(edge.toRow)

  if (edge.fromCol === edge.toCol) {
    // Straight vertical line
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  // Curved connection for merges/branches
  const midY = y1 + ROW_HEIGHT * 0.6
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
}

// Handle scroll for infinite loading
const handleScroll = () => {
  if (!containerRef.value || !props.hasMore || props.isLoading) return

  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  const threshold = 100

  if (scrollHeight - scrollTop - clientHeight < threshold) {
    emit('loadMore')
  }
}

// Set up scroll listener
onMounted(() => {
  containerRef.value?.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div ref="containerRef" class="h-full overflow-y-auto">
    <!-- Loading initial -->
    <div v-if="isLoading && commits.length === 0" class="flex items-center justify-center h-32">
      <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-app-muted" />
    </div>

    <!-- Empty state -->
    <div v-else-if="commits.length === 0" class="flex flex-col items-center justify-center h-full text-center p-6">
      <Icon name="i-lucide-git-commit-horizontal" class="size-12 text-app-muted/30 mb-3" />
      <p class="text-sm text-app-muted">No commit history</p>
    </div>

    <!-- Commit list with graph -->
    <div v-else class="relative">
      <!-- SVG Graph overlay -->
      <svg
        class="absolute top-0 left-0 pointer-events-none"
        :width="graphWidth"
        :height="commits.length * ROW_HEIGHT + 40"
        :viewBox="`0 0 ${graphWidth} ${commits.length * ROW_HEIGHT + 40}`"
      >
        <!-- Edges (branch lines) -->
        <path
          v-for="(edge, i) in layout.edges"
          :key="`edge-${i}`"
          :d="getEdgePath(edge)"
          :stroke="edge.color"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
        />

        <!-- Nodes (commit dots) -->
        <template v-for="(node, i) in layout.nodes" :key="`node-${i}`">
          <!-- Outer ring for selected -->
          <circle
            v-if="selectedHash === node.hash"
            :cx="colX(node.column)"
            :cy="rowY(i)"
            :r="NODE_RADIUS + 3"
            :fill="node.color"
            fill-opacity="0.2"
          />
          <!-- Merge commit: larger hollow circle -->
          <circle
            v-if="commits[i]?.parents && commits[i].parents.length > 1"
            :cx="colX(node.column)"
            :cy="rowY(i)"
            :r="NODE_RADIUS + 1"
            :stroke="node.color"
            stroke-width="2"
            fill="var(--app-background, #1a1a2e)"
          />
          <!-- Regular commit: filled circle -->
          <circle
            v-else
            :cx="colX(node.column)"
            :cy="rowY(i)"
            :r="NODE_RADIUS"
            :fill="node.color"
          />
        </template>
      </svg>

      <!-- Commit rows -->
      <div
        v-for="commit in commits"
        :key="commit.hash"
        class="flex items-center cursor-pointer transition-colors"
        :class="[
          selectedHash === commit.hash
            ? 'bg-white/40 dark:bg-white/10'
            : 'hover:bg-white/20 dark:hover:bg-white/5'
        ]"
        :style="{ height: ROW_HEIGHT + 'px', paddingLeft: graphWidth + 'px' }"
        @click="emit('select', commit)"
      >
        <!-- Ref labels (branch/tag badges) -->
        <div v-if="commit.refs && commit.refs.length > 0" class="flex items-center gap-1 shrink-0 mr-2">
          <template v-for="branch in parseRefs(commit.refs).branches" :key="branch">
            <span
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
              :class="branch.startsWith('origin/')
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                : 'bg-green-500/15 text-green-400 border border-green-500/20'"
            >
              <svg class="size-2.5 shrink-0" viewBox="0 0 12 12" fill="none">
                <path v-if="branch.startsWith('origin/')" d="M6 1v10M3 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <path v-else d="M6 1v6M6 7c0 2-3 3-3 3M6 7c0 2 3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ branch.replace('origin/', '') }}
            </span>
          </template>
          <template v-for="tag in parseRefs(commit.refs).tags" :key="tag">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <svg class="size-2.5 shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l4-4h4v4l-4 4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                <circle cx="8" cy="4" r="1" fill="currentColor" />
              </svg>
              {{ tag }}
            </span>
          </template>
        </div>

        <!-- Subject (commit message first line) -->
        <span class="flex-1 text-xs text-app truncate min-w-0">
          {{ commit.subject }}
        </span>

        <!-- Hash -->
        <code class="text-[10px] text-app-muted/70 font-mono mx-2 shrink-0">
          {{ commit.shortHash }}
        </code>

        <!-- Author -->
        <span class="text-[10px] text-app-muted w-20 truncate shrink-0 text-right">
          {{ commit.author.split(' ')[0] }}
        </span>

        <!-- Date -->
        <span class="text-[10px] text-app-muted w-8 text-right shrink-0 mr-3">
          {{ formatRelativeDate(commit.authorDate) }}
        </span>
      </div>

      <!-- Load more indicator -->
      <div v-if="isLoading && commits.length > 0" class="flex items-center justify-center py-4">
        <Icon name="i-lucide-loader-2" class="size-4 animate-spin text-app-muted" />
      </div>

      <!-- Load more trigger -->
      <div v-else-if="hasMore" class="flex justify-center py-3">
        <button
          class="text-xs text-app-muted hover:text-app transition-colors"
          @click="emit('loadMore')"
        >
          Load more...
        </button>
      </div>
    </div>
  </div>
</template>
