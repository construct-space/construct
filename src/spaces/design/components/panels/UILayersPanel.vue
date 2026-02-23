<script setup lang="ts">
/**
 * UILayersPanel - Hierarchical layer list with pointer-event drag-to-reorder
 *
 * Uses pointer events instead of HTML5 drag events because WKWebView (Tauri on
 * macOS) doesn't reliably fire dragstart/dragover/drop.
 */
import type { DesignNode } from '~/types/design'
import { useLayerTree } from '../../composables/useLayerTree'
import { useLayerDrag, type DropPosition } from '../../composables/useLayerDrag'
import { showContextMenu } from '~/composables/useNativeContextMenu'

interface Props {
  nodes: DesignNode[]
  selectedNodeIds: string[]
  pages: readonly { id: string; name: string }[]
  currentPageId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'select': [nodeId: string, addToSelection: boolean]
  'toggle-visibility': [nodeId: string]
  'toggle-lock': [nodeId: string]
  'rename': [nodeId: string, name: string]
  'reparent': [
    nodeId: string,
    newParentId: string | null,
    placement?: { targetId?: string; position?: Exclude<DropPosition, null> }
  ]
  'delete': [nodeIds: string[]]
  'bring-to-front': [nodeId: string]
  'send-to-back': [nodeId: string]
  'bring-forward': [nodeId: string]
  'send-backward': [nodeId: string]
  'reorder': []
  'move-to-page': [nodeIds: string[], targetPageId: string]
}>()

// Get context menu items for a specific node
const getContextMenuItems = (nodeId: string) => [
  [
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: () => {
        const node = props.nodes.find(n => n.id === nodeId)
        if (node) startRename(node.id, node.name)
      },
    },
    {
      label: 'Duplicate',
      icon: 'i-lucide-copy',
      disabled: true,
    },
  ],
  [
    {
      label: 'Bring to Front',
      icon: 'i-lucide-arrow-up-to-line',
      onSelect: () => emit('bring-to-front', nodeId),
    },
    {
      label: 'Bring Forward',
      icon: 'i-lucide-chevron-up',
      onSelect: () => emit('bring-forward', nodeId),
    },
    {
      label: 'Send Backward',
      icon: 'i-lucide-chevron-down',
      onSelect: () => emit('send-backward', nodeId),
    },
    {
      label: 'Send to Back',
      icon: 'i-lucide-arrow-down-to-line',
      onSelect: () => emit('send-to-back', nodeId),
    },
  ],
  // Move to Page (only show when multiple pages exist)
  ...(props.pages.length > 1
    ? [[
        {
          label: 'Move to Page',
          icon: 'i-lucide-arrow-right-from-line',
          children: props.pages
            .filter(p => p.id !== props.currentPageId)
            .map(p => ({
              label: p.name,
              icon: 'i-lucide-file',
              onSelect: () => {
                const ids = props.selectedNodeIds.length > 0 && props.selectedNodeIds.includes(nodeId)
                  ? [...props.selectedNodeIds]
                  : [nodeId]
                emit('move-to-page', ids, p.id)
              },
            })),
        },
      ]]
    : []),
  [
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => {
        if (props.selectedNodeIds.length > 0 && props.selectedNodeIds.includes(nodeId)) {
          emit('delete', [...props.selectedNodeIds])
        } else {
          emit('delete', [nodeId])
        }
      },
    },
  ],
]

// Create a ref from props for reactivity
const nodesRef = computed(() => props.nodes)
const layerTree = useLayerTree(nodesRef)
const drag = useLayerDrag()
const _scrollContainerRef = ref<HTMLElement | null>(null)
const layersRootRef = ref<HTMLElement | null>(null)
const invalidDropTargetId = ref<string | null>(null)
let autoExpandTimer: ReturnType<typeof setTimeout> | null = null

const isSelected = (nodeId: string) => props.selectedNodeIds.includes(nodeId)

// ── Drag ghost (cursor preview) ───────────────────────────────────

const cursorX = ref(0)
const cursorY = ref(0)

const draggedNode = computed(() => {
  if (!drag.draggedId.value) return null
  const tree = layerTree.findTreeNode(drag.draggedId.value)
  if (!tree) return null
  return tree.node
})

const draggedNodeIcon = computed(() => {
  if (!draggedNode.value) return ''
  return getNodeIcon(draggedNode.value, false)
})

// ── Pointer-event based drag helpers ──────────────────────────────

function getLayerItemFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const root = layersRootRef.value
  if (!root) return null

  const fromPoint = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const pointLayer = fromPoint?.closest('[data-node-id]') as HTMLElement | null
  if (pointLayer) return pointLayer

  // Pointer may be in tiny gaps between rows; snap to nearest row.
  const layerItems = Array.from(root.querySelectorAll('[data-node-id]')) as HTMLElement[]
  if (layerItems.length === 0) return null

  let nearest: HTMLElement | null = null
  let minDistance = Infinity
  for (const item of layerItems) {
    const rect = item.getBoundingClientRect()
    if (clientY >= rect.top && clientY <= rect.bottom) return item
    const distance = clientY < rect.top ? (rect.top - clientY) : (clientY - rect.bottom)
    if (distance < minDistance) {
      minDistance = distance
      nearest = item
    }
  }
  return nearest
}

function computeDropPositionForItem(clientY: number, layerItem: HTMLElement, canHaveChildren: boolean) {
  const rect = layerItem.getBoundingClientRect()
  const height = rect.height
  const relativeY = clientY - rect.top

  if (canHaveChildren) {
    const topZone = height * 0.25
    const bottomZone = height * 0.75
    if (relativeY < topZone) return 'before' as const
    if (relativeY > bottomZone) return 'after' as const
    return 'inside' as const
  }

  return relativeY < height / 2 ? 'before' as const : 'after' as const
}

function clearDropTargetState() {
  drag.dropTargetId.value = null
  drag.dropPosition.value = null
  invalidDropTargetId.value = null
}

function resolveDropTarget(clientX: number, clientY: number) {
  const draggedId = drag.draggedId.value
  if (!draggedId) return null

  const layerItem = getLayerItemFromPoint(clientX, clientY)
  if (!layerItem) {
    clearDropTargetState()
    return null
  }

  const nodeId = layerItem.dataset.nodeId
  if (!nodeId || nodeId === draggedId) {
    clearDropTargetState()
    return null
  }

  const targetNode = layerTree.findTreeNode(nodeId)
  if (!targetNode) {
    clearDropTargetState()
    return null
  }

  const canHaveChildren = layerTree.canHaveChildren(targetNode.node)
  const position = computeDropPositionForItem(clientY, layerItem, canHaveChildren)

  // Prevent cycles and self-drops.
  let isInvalid = nodeId === draggedId || isDescendantOf(nodeId, draggedId)
  if (!isInvalid && position !== 'inside') {
    const newParentId = targetNode.node.parentId ?? null
    if (newParentId === draggedId) {
      isInvalid = true
    } else if (newParentId) {
      isInvalid = isDescendantOf(newParentId, draggedId)
    }
  }

  drag.dropTargetId.value = nodeId
  invalidDropTargetId.value = isInvalid ? nodeId : null

  if (isInvalid) {
    drag.dropPosition.value = null
    return null
  }

  drag.dropPosition.value = position

  // Auto-expand collapsed containers when hovering "inside".
  if (position === 'inside' && canHaveChildren && !targetNode.isExpanded) {
    if (autoExpandTimer) clearTimeout(autoExpandTimer)
    autoExpandTimer = setTimeout(() => {
      layerTree.expandNode(nodeId)
      autoExpandTimer = null
    }, 450)
  } else if (autoExpandTimer) {
    clearTimeout(autoExpandTimer)
    autoExpandTimer = null
  }

  return { nodeId, targetNode, canHaveChildren, position }
}

// Listen for custom events dispatched by the drag composable.
function onDragMove(e: Event) {
  const { clientX, clientY } = (e as CustomEvent).detail
  cursorX.value = clientX
  cursorY.value = clientY
  resolveDropTarget(clientX, clientY)
}

function onDragDrop() {
  executeDrop()
}

onMounted(() => {
  document.addEventListener('layer-drag-move', onDragMove)
  document.addEventListener('layer-drag-drop', onDragDrop)
})

onUnmounted(() => {
  document.removeEventListener('layer-drag-move', onDragMove)
  document.removeEventListener('layer-drag-drop', onDragDrop)
})

// ── Drop execution (same logic as before) ─────────────────────────

function executeDrop() {
  if (!drag.draggedId.value || !drag.dropTargetId.value || !drag.dropPosition.value || invalidDropTargetId.value) {
    handleDragEnd()
    return
  }

  const draggedNode = layerTree.findTreeNode(drag.draggedId.value)
  const targetNode = layerTree.findTreeNode(drag.dropTargetId.value)

  if (!draggedNode || !targetNode) {
    handleDragEnd()
    return
  }

  // Handle reparenting (drop inside a screen/group)
  if (drag.dropPosition.value === 'inside') {
    emit('reparent', drag.draggedId.value, drag.dropTargetId.value, {
      targetId: drag.dropTargetId.value,
      position: 'inside',
    })
    handleDragEnd()
    return
  }

  // Handle reordering within same parent
  const draggedParent = draggedNode.node.parentId ?? null
  const targetParent = targetNode.node.parentId ?? null

  if (draggedParent === targetParent) {
    const siblings = layerTree.flattenedTree.value.filter(
      item => (item.node.parentId ?? null) === draggedParent
    )

    const draggedIdx = siblings.findIndex(s => s.node.id === drag.draggedId.value)
    let targetIdx = siblings.findIndex(s => s.node.id === drag.dropTargetId.value)

    if (drag.dropPosition.value === 'after') {
      targetIdx += 1
    }

    if (draggedIdx < targetIdx) {
      targetIdx -= 1
    }

    if (draggedIdx !== targetIdx && targetIdx >= 0) {
      const didReorder = layerTree.reorderNode(drag.draggedId.value, targetIdx)
      if (didReorder) {
        emit('reorder')
      }
    }
  } else {
    // Moving across parents.
    emit('reparent', drag.draggedId.value, targetParent, {
      targetId: drag.dropTargetId.value,
      position: drag.dropPosition.value,
    })
  }

  handleDragEnd()
}

// Check if nodeId is a descendant of potentialAncestorId
const isDescendantOf = (nodeId: string, potentialAncestorId: string): boolean => {
  const node = layerTree.findTreeNode(nodeId)
  if (!node) return false
  if (node.node.parentId === potentialAncestorId) return true
  if (node.node.parentId) {
    return isDescendantOf(node.node.parentId, potentialAncestorId)
  }
  return false
}

const handleDragEnd = () => {
  drag.reset()
  invalidDropTargetId.value = null
  if (autoExpandTimer) {
    clearTimeout(autoExpandTimer)
    autoExpandTimer = null
  }
}

// Scroll selected layer into view when selection changes
watch(() => props.selectedNodeIds, (newIds) => {
  if (newIds.length > 0) {
    nextTick(() => {
      const firstSelectedId = newIds[0]
      const element = document.querySelector(`[data-node-id="${firstSelectedId}"]`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    })
  }
}, { immediate: false })

// Rename state
const editingNodeId = ref<string | null>(null)
const editingName = ref('')

const startRename = (nodeId: string, currentName: string) => {
  editingNodeId.value = nodeId
  editingName.value = currentName
  nextTick(() => {
    const input = document.querySelector('.layer-name-input') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

const finishRename = () => {
  if (editingNodeId.value && editingName.value.trim()) {
    emit('rename', editingNodeId.value, editingName.value.trim())
  }
  editingNodeId.value = null
  editingName.value = ''
}

const cancelRename = () => {
  editingNodeId.value = null
  editingName.value = ''
}

const getNodeIcon = (node: DesignNode, isExpanded: boolean) => {
  // Common boolean-operation naming from imported designs.
  if (node.type === 'path' && /^(union|subtract|intersect|exclude)\b/i.test(node.name)) {
    return 'i-lucide-merge'
  }

  switch (node.type) {
    case 'screen':
      return node.width >= node.height ? 'i-lucide-monitor' : 'i-lucide-smartphone'
    case 'rectangle': return 'i-lucide-square'
    case 'ellipse': return 'i-lucide-circle'
    case 'text': return 'i-lucide-type'
    case 'line': return 'i-lucide-minus'
    case 'arrow': return 'i-lucide-arrow-right'
    case 'polygon': return 'i-lucide-hexagon'
    case 'star': return 'i-lucide-star'
    case 'heart': return 'i-lucide-heart'
    case 'path': return 'i-lucide-pen-tool'
    case 'image': return 'i-lucide-image'
    case 'group': return isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder'
    case 'component-instance': return 'i-lucide-component'
    default: return 'i-lucide-square'
  }
}

const handleClick = (nodeId: string, event: MouseEvent) => {
  // If a drag just ended, the pointerup already handled cleanup.
  // Only fire select if we're not mid-drag.
  if (!drag.draggedId.value) {
    emit('select', nodeId, event.shiftKey)
  }
}

async function onLayerContextMenu(_e: MouseEvent, nodeId: string) {
  await showContextMenu(getContextMenuItems(nodeId))
}

const handleToggleExpand = (nodeId: string) => {
  layerTree.toggleExpanded(nodeId)
}

const isDropBefore = (nodeId: string) => drag.isDropTarget(nodeId, 'before')
const isDropAfter = (nodeId: string) => drag.isDropTarget(nodeId, 'after')
const isDropInside = (nodeId: string) => drag.isDropTarget(nodeId, 'inside')
</script>

<template>
  <div ref="layersRootRef" class="h-full flex flex-col bg-app">
    <div class="h-10 px-3 flex items-center justify-between shrink-0">
      <span class="text-xs font-medium text-app">Layers</span>
      <div class="flex gap-0.5">
        <Button
icon="i-lucide-unfold-vertical" size="xs" variant="ghost" color="neutral" title="Expand All"
          @click="layerTree.expandAll" />
        <Button
icon="i-lucide-fold-vertical" size="xs" variant="ghost" color="neutral" title="Collapse All"
          @click="layerTree.collapseAll" />
      </div>
    </div>
    <ScrollArea class="flex-1 min-h-0">
      <div class="p-1">
        <div
v-for="treeNode in layerTree.flattenedTree.value" :key="treeNode.node.id" data-tauri-drag-region
          class="layer-item group relative">
            <div
:data-node-id="treeNode.node.id"
              class="layer-row flex items-center gap-1 px-1.5 py-1 rounded-md text-xs select-none transition-all duration-150"
              :class="[
                isSelected(treeNode.node.id)
                  ? 'bg-primary/12 text-primary'
                  : 'text-app-muted hover:bg-white/5',
                drag.isDragging(treeNode.node.id) ? 'opacity-40 scale-95' : 'cursor-grab',
                isDropBefore(treeNode.node.id) ? 'drop-before' : '',
                isDropAfter(treeNode.node.id) ? 'drop-after' : '',
                isDropInside(treeNode.node.id) ? 'drop-inside' : '',
                invalidDropTargetId === treeNode.node.id ? 'drop-invalid' : '',
              ]" :style="{ paddingLeft: `${6 + treeNode.depth * 12}px` }"
              @pointerdown="drag.onPointerDown($event, treeNode.node.id)"
              @click="handleClick(treeNode.node.id, $event)"
              @contextmenu.prevent="(e) => onLayerContextMenu(e, treeNode.node.id)">
              <!-- Drag handle -->
              <Icon
name="i-lucide-grip-vertical"
                class="size-3 text-app-muted/45 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

              <!-- Expand/collapse toggle for containers -->
              <button
v-if="layerTree.canHaveChildren(treeNode.node)" class="p-0.5 rounded hover:bg-white/10"
                data-no-drag @click.stop="handleToggleExpand(treeNode.node.id)">
                <Icon
:name="treeNode.isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-2.5 text-app-muted" />
              </button>
              <span v-else class="w-3" />

              <!-- Node icon -->
              <Icon
:name="getNodeIcon(treeNode.node, treeNode.isExpanded)" class="size-3 shrink-0" :class="[
                treeNode.node.type === 'group' ? 'text-amber-300/90' : '',
                treeNode.node.isComponent ? 'text-primary' : '',
                treeNode.node.type === 'component-instance' ? 'text-primary/80' : '',
              ]" />

              <!-- Node name -->
              <input
v-if="editingNodeId === treeNode.node.id" v-model="editingName"
                class="layer-name-input flex-1 bg-transparent border border-primary rounded px-1 text-xs outline-none"
                @blur="finishRename" @keydown.enter="finishRename" @keydown.escape="cancelRename" @click.stop>
              <span
v-else class="truncate flex-1" :class="{ 'opacity-40': treeNode.node.visible === false }"
                @dblclick.stop="startRename(treeNode.node.id, treeNode.node.name)">
                {{ treeNode.node.name }}
              </span>

              <span
v-if="layerTree.canHaveChildren(treeNode.node) && treeNode.children.length > 0"
                class="text-[10px] px-1 py-0 rounded bg-white/8 text-app-muted shrink-0">
                {{ treeNode.children.length }}
              </span>

              <!-- Visibility toggle -->
              <Icon
:name="treeNode.node.visible === false ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                class="size-3 cursor-pointer shrink-0" data-no-drag :class="[
                  treeNode.node.visible === false
                    ? 'text-app-muted/50'
                    : 'text-app-muted opacity-0 group-hover:opacity-50 hover:opacity-100!'
                ]" @click.stop="emit('toggle-visibility', treeNode.node.id)" />

              <!-- Lock toggle -->
              <Icon
:name="treeNode.node.locked ? 'i-lucide-lock' : 'i-lucide-unlock'"
                class="size-3 cursor-pointer shrink-0" data-no-drag :class="[
                  treeNode.node.locked
                    ? 'text-primary'
                    : 'text-app-muted opacity-0 group-hover:opacity-50 hover:opacity-100!'
                ]" @click.stop="emit('toggle-lock', treeNode.node.id)" />
            </div>
        </div>

        <div v-if="nodes.length === 0" class="text-center py-8 text-app-muted text-xs">
          No layers yet
        </div>
      </div>
    </ScrollArea>

    <!-- Drag ghost: follows cursor while dragging -->
    <Teleport to="body">
      <div
        v-if="draggedNode"
        class="drag-ghost"
        :style="{ left: `${cursorX + 12}px`, top: `${cursorY - 10}px` }"
      >
        <div class="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs bg-primary/12 text-primary">
          <Icon name="i-lucide-grip-vertical" class="size-3 text-app-muted/45 shrink-0" />
          <Icon
:name="draggedNodeIcon" class="size-3 shrink-0" :class="[
            draggedNode.type === 'group' ? 'text-amber-300/90' : '',
            draggedNode.isComponent ? 'text-primary' : '',
            draggedNode.type === 'component-instance' ? 'text-primary/80' : '',
          ]" />
          <span class="truncate">{{ draggedNode.name }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.layer-item {
  transition: background 0.15s;
}

.layer-row.drop-before {
  background: rgba(59, 130, 246, 0.1);
  box-shadow: inset 0 2px 0 0 rgb(59, 130, 246);
}

.layer-row.drop-after {
  background: rgba(59, 130, 246, 0.1);
  box-shadow: inset 0 -2px 0 0 rgb(59, 130, 246);
}

.layer-row.drop-inside {
  background: rgba(59, 130, 246, 0.15);
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.7);
}

.layer-row.drop-invalid {
  background: rgba(239, 68, 68, 0.12);
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.8);
}
</style>

<style>
.drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.5;
}
</style>
