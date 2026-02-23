<script setup lang="ts">
/**
 * DesignCanvas — PixiJS canvas mount point
 *
 * Handles:
 * - Canvas element creation and engine initialization
 * - Node sync from props → engine
 * - Selection sync from props → engine
 * - Event emission back to parent
 */
import { useDesignEngine } from '../composables/useDesignEngine'
import type { DesignTool } from '../composables/useDesignEngine'
import type { DesignNode } from '~/types/design'

const props = defineProps<{
  nodes: DesignNode[]
  selectedIds: string[]
  skipSelectionSync?: boolean
}>()

const emit = defineEmits<{
  'selection-change': [ids: string[]]
  'node-update': [id: string, updates: Partial<DesignNode>]
  'node-create': [node: DesignNode]
  'node-create-raw': [node: DesignNode]
  'batch-complete': []
  'node-delete': [id: string]
  'transform-end': []
  'layer-order-change': [orderedIds: string[]]
  'tool-change': [tool: DesignTool]
  'context-menu': [x: number, y: number]
}>()

const canvasRef = ref<HTMLCanvasElement>()
let isUpdatingFromProps = false

const designEngine = useDesignEngine({
  onSelectionChange: (ids) => {
    if (!isUpdatingFromProps) {
      emit('selection-change', ids)
    }
  },
  onNodeUpdate: (id, updates) => {
    emit('node-update', id, updates)
  },
  onNodeCreate: (node) => {
    emit('node-create', node)
  },
  onNodeCreateRaw: (node) => {
    emit('node-create-raw', node)
  },
  onBatchComplete: () => {
    emit('batch-complete')
  },
  onNodeDelete: (id) => {
    emit('node-delete', id)
  },
  onTransformEnd: () => {
    emit('transform-end')
  },
  onLayerOrderChange: (ids) => {
    emit('layer-order-change', ids)
  },
  onToolChange: (tool) => {
    emit('tool-change', tool as DesignTool)
  },
})

// Initialize engine when canvas is mounted
onMounted(async () => {
  if (!canvasRef.value) return
  await designEngine.init(canvasRef.value)

  // Initial sync
  if (props.nodes.length > 0) {
    designEngine.setNodes(props.nodes)
  }
})

// Sync nodes from props to engine
watch(() => props.nodes, (newNodes) => {
  if (!designEngine.isReady.value) return
  designEngine.setNodes(newNodes)
}, { deep: true })

// Sync selection from props to engine (external selection changes)
watch(() => props.selectedIds, (newIds) => {
  if (!designEngine.isReady.value || props.skipSelectionSync) return
  isUpdatingFromProps = true
  designEngine.engine.value?.selection.setSelection(newIds)
  nextTick(() => { isUpdatingFromProps = false })
})

// Cleanup
onUnmounted(() => {
  designEngine.destroy()
})

// Expose for parent component
defineExpose({
  engine: designEngine,
  setTool: designEngine.setTool,
  setZoom: designEngine.setZoom,
  fitToScreen: designEngine.fitToScreen,
  toggleGrid: designEngine.toggleGrid,
  toggleSnap: designEngine.toggleSnap,
  toggleRulers: designEngine.toggleRulers,
  loadNodes: designEngine.loadNodes,
  addNodeToCanvas: designEngine.addNodeToCanvas,
  updateNodeOnCanvas: designEngine.updateNodeOnCanvas,
  removeNodeFromCanvas: designEngine.removeNodeFromCanvas,
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="w-full h-full block"
    @contextmenu.prevent="(e) => emit('context-menu', e.clientX, e.clientY)"
  />
</template>
