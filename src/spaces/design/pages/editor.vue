<script setup lang="ts">
/**
 * Design Editor Page — Orchestrator for PixiJS-based design canvas
 *
 * Data flow: useUIState → watch → DesignCanvas → engine.setNodes()
 * All handlers update state only. The canvas syncs automatically.
 */
import DesignCanvas from '../components/DesignCanvas.vue'
import { useUIState } from '../composables/useUIState'
import { useLocalDesigns } from '../composables/useLocalDesigns'
import { useCommentsState } from '../composables/useComments'
import { useSharedStylesState } from '../composables/useSharedStyles'
import { usePagesState } from '../composables/usePages'
import { useComponents } from '../composables/useComponents'
import { useDesignActions } from '~/composables/useDesignActions'
import { setCanvasContext, clearCanvasContext, registerDesign } from '~/composables/useCanvasContext'
import { showContextMenu } from '~/composables/useNativeContextMenu'
import type { NativeMenuOption } from '~/composables/useNativeContextMenu'
import { useGoogleFonts } from '~/composables/useGoogleFonts'
import { useSpaceShortcuts } from '~/composables/useSpaceShortcuts'
import type { DesignNode, DesignPage } from '~/types/design'
import type { UITool, TextPreset } from '../types'

import EditorToolbar from '../components/EditorToolbar.vue'
import EditorStatusBar from '../components/EditorStatusBar.vue'
import UILayersPanel from '../components/panels/UILayersPanel.vue'
import UIPropertiesPanel from '../components/panels/UIPropertiesPanel.vue'
import UIBlueprintPresets from '../components/panels/UIBlueprintPresets.vue'
import UIStylesPanel from '../components/panels/UIStylesPanel.vue'
import UIComponentsPanel from '../components/panels/UIComponentsPanel.vue'
import UIExportModal from '../components/modals/UIExportModal.vue'

// Preload Google Fonts
useGoogleFonts()

// --- Route & core state ---
const route = useRoute()
const router = useRouter()
const projectId = computed(() => {
  const id = route.params.id
  if (typeof id !== 'string') return null
  const parsed = Number.parseInt(id, 10)
  return Number.isNaN(parsed) ? null : parsed
})
const designIndexRoute = computed(() => projectId.value ? `/app/projects/${projectId.value}/design` : '/app/design')
const state = useUIState()
const localDesigns = useLocalDesigns()
const comments = useCommentsState()
const _sharedStyles = useSharedStylesState()
const pagesState = usePagesState()
const { consumeDesignActions, pendingActions } = useDesignActions()

const componentsState = useComponents(
  () => state.nodes.value as DesignNode[],
  (id, updates) => state.updateNode(id, updates),
)

const designLocalId = computed(() => route.query.localId as string | undefined)
const designName = computed(() => localDesigns.currentDesign.value?.name || route.query.name as string || 'Untitled')

// --- Core refs ---
const canvasRef = ref<InstanceType<typeof DesignCanvas>>()
const isUpdatingFromCanvas = ref(false)
const isReplayingHistory = ref(false)
const activeTool = ref<UITool>('select')
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const showBlueprintsPanel = ref(false)
const showStylesPanel = ref(false)
const showComponentsPanel = ref(false)
const showExportModal = ref(false)
const isTeleportReady = ref(false)

// --- Computed refs for template ---
const selectedNodes = computed((): DesignNode[] => {
  return state.getSelectedNodes()
})

const selectedNode = computed(() => {
  const first = selectedNodes.value[0]
  return first !== undefined ? first : null
})

const prototypeTargets = computed(() => {
  const targets: Array<{ value: string; label: string; pageLabel: string; nodeLabel: string }> = []
  for (const page of pagesState.pages.value) {
    const screens = page.nodes.filter(node => node.type === 'screen')
    if (screens.length > 0) {
      for (const screen of screens) {
        targets.push({
          value: `${page.id}:${screen.id}`,
          label: `${page.name}:${screen.name || 'Screen'}`,
          pageLabel: page.name,
          nodeLabel: screen.name || 'Screen',
        })
      }
    } else {
      targets.push({ value: page.id, label: page.name, pageLabel: page.name, nodeLabel: 'Entire page' })
    }
  }
  return targets
})

const zoomPercent = computed(() => Math.round((canvasRef.value?.engine.zoom.value ?? 1) * 100))
const nodes = computed(() => JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[])
const selectedIds = computed(() => [...state.selectedIds.value] as string[])

// --- Canvas event handlers ---

function handleSelectionChange(ids: string[]) {
  isUpdatingFromCanvas.value = true
  state.selectNodes(ids)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

function handleNodeUpdate(id: string, updates: Partial<DesignNode>) {
  if (isReplayingHistory.value) return
  isUpdatingFromCanvas.value = true
  state.updateNode(id, updates)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

function handleNodeCreate(node: DesignNode) {
  if (isReplayingHistory.value) return
  isUpdatingFromCanvas.value = true
  state.addNode(node)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

function handleNodeCreateRaw(node: DesignNode) {
  if (isReplayingHistory.value) return
  isUpdatingFromCanvas.value = true
  state.addNodeRaw(node)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

function handleBatchComplete() {
  if (isReplayingHistory.value) return
  state.saveToHistory()
}

function handleNodeDelete(id: string) {
  if (isReplayingHistory.value) return
  isUpdatingFromCanvas.value = true
  state.deleteNode(id)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

function handleTransformEnd() {
  state.saveToHistory()
}

function handleLayerOrderChange(orderedIds: string[]) {
  isUpdatingFromCanvas.value = true
  state.reorderNodes(orderedIds)
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

// --- Property handlers ---

function handlePropertyUpdate(property: string, value: unknown) {
  const selected = state.getSelectedNodes()
  if (selected.length === 0) return

  state.withHistoryTransaction(() => {
    for (const node of selected) {
      state.updateNode(node.id, { [property]: value })
    }
  })
}

function handlePropertyPreview(_property: string, _value: unknown) {
  // Preview updates go to engine directly (no history)
  // The canvas watches nodes, so this happens automatically
}

function handleAlign(direction: string) {
  const selected = state.getSelectedNodes()
  if (selected.length < 2) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of selected) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }

  state.withHistoryTransaction(() => {
    for (const n of selected) {
      switch (direction) {
        case 'left': state.updateNode(n.id, { x: minX }); break
        case 'right': state.updateNode(n.id, { x: maxX - n.width }); break
        case 'top': state.updateNode(n.id, { y: minY }); break
        case 'bottom': state.updateNode(n.id, { y: maxY - n.height }); break
        case 'centerH': state.updateNode(n.id, { x: minX + (maxX - minX) / 2 - n.width / 2 }); break
        case 'centerV': state.updateNode(n.id, { y: minY + (maxY - minY) / 2 - n.height / 2 }); break
      }
    }
  })
}

function handleDistribute(direction: string) {
  const selected = state.getSelectedNodes()
  if (selected.length < 3) return

  const sorted = [...selected].sort((a, b) =>
    direction === 'horizontal' ? a.x - b.x : a.y - b.y,
  )

  state.withHistoryTransaction(() => {
    if (direction === 'horizontal') {
      const totalWidth = sorted.reduce((sum, n) => sum + n.width, 0)
      const totalSpace = sorted[sorted.length - 1]!.x + sorted[sorted.length - 1]!.width - sorted[0]!.x
      const gap = (totalSpace - totalWidth) / (sorted.length - 1)
      let currentX = sorted[0]!.x
      for (const n of sorted) {
        state.updateNode(n.id, { x: currentX })
        currentX += n.width + gap
      }
    } else {
      const totalHeight = sorted.reduce((sum, n) => sum + n.height, 0)
      const totalSpace = sorted[sorted.length - 1]!.y + sorted[sorted.length - 1]!.height - sorted[0]!.y
      const gap = (totalSpace - totalHeight) / (sorted.length - 1)
      let currentY = sorted[0]!.y
      for (const n of sorted) {
        state.updateNode(n.id, { y: currentY })
        currentY += n.height + gap
      }
    }
  })
}

// --- Layer handlers ---

function handleLayerSelect(nodeId: string, addToSelection: boolean) {
  if (addToSelection) {
    const current = [...state.selectedIds.value]
    const idx = current.indexOf(nodeId)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(nodeId)
    }
    state.selectNodes(current)
  } else {
    state.selectNodes([nodeId])
  }
}

function handleToggleVisibility(id: string) {
  state.toggleVisibility(id)
}

function handleToggleLock(id: string) {
  state.toggleLock(id)
}

function handleRename(id: string, name: string) {
  state.updateNodeWithHistory(id, { name })
}

function handleReparent(nodeId: string, parentId: string | null) {
  state.updateNodeWithHistory(nodeId, { parentId })
}

function handleLayerDelete(ids: string[]) {
  state.deleteNodes(ids)
}

function handleBringToFront(id: string) {
  const all = [...state.nodes.value]
  const idx = all.findIndex(n => n.id === id)
  if (idx === -1) return
  const orderedIds = all.map(n => n.id)
  orderedIds.splice(idx, 1)
  orderedIds.push(id)
  state.reorderNodes(orderedIds)
  state.saveToHistory()
}

function handleSendToBack(id: string) {
  const all = [...state.nodes.value]
  const idx = all.findIndex(n => n.id === id)
  if (idx === -1) return
  const orderedIds = all.map(n => n.id)
  orderedIds.splice(idx, 1)
  orderedIds.unshift(id)
  state.reorderNodes(orderedIds)
  state.saveToHistory()
}

function handleBringForward(id: string) {
  const all = [...state.nodes.value]
  const idx = all.findIndex(n => n.id === id)
  if (idx === -1 || idx >= all.length - 1) return
  const orderedIds = all.map(n => n.id)
  ;[orderedIds[idx]!, orderedIds[idx + 1]!] = [orderedIds[idx + 1]!, orderedIds[idx]!]
  state.reorderNodes(orderedIds)
  state.saveToHistory()
}

function handleSendBackward(id: string) {
  const all = [...state.nodes.value]
  const idx = all.findIndex(n => n.id === id)
  if (idx <= 0) return
  const orderedIds = all.map(n => n.id)
  ;[orderedIds[idx]!, orderedIds[idx - 1]!] = [orderedIds[idx - 1]!, orderedIds[idx]!]
  state.reorderNodes(orderedIds)
  state.saveToHistory()
}

function handleLayerReorder() {
  // The layers panel signals that a reorder happened via drag-and-drop
  // The actual ordering comes through reparent events
  state.saveToHistory()
}

function handleDuplicateSelected() {
  const selected = state.getSelectedNodes()
  state.withHistoryTransaction(() => {
    for (const n of selected) {
      state.addNode({
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        x: n.x + 16,
        y: n.y + 16,
        name: `${n.name} copy`,
      })
    }
  })
}

async function handleCanvasContextMenu() {
  const selected = state.getSelectedNodes()
  const pages = pagesState.pages.value

  if (selected.length === 0) {
    await showContextMenu([
      [
        { label: 'Select All', onSelect: () => state.selectNodes(state.nodes.value.map(n => n.id)) },
      ],
      [
        { label: 'Add Screen', onSelect: () => { showBlueprintsPanel.value = true } },
      ],
    ])
    return
  }

  const isSingle = selected.length === 1
  const isMultiple = selected.length >= 2
  const isThreePlus = selected.length >= 3
  const firstId = selected[0]!.id
  const selIds = selected.map(n => n.id)

  const groups: NativeMenuOption[][] = []

  groups.push([
    { label: 'Duplicate', onSelect: handleDuplicateSelected },
    { label: 'Delete', onSelect: () => state.deleteNodes(selIds) },
  ])

  if (isSingle) {
    groups.push([
      { label: 'Rename', disabled: true },
    ])
  }

  groups.push([
    { label: 'Bring to Front', onSelect: () => handleBringToFront(firstId) },
    { label: 'Bring Forward', onSelect: () => handleBringForward(firstId) },
    { label: 'Send Backward', onSelect: () => handleSendBackward(firstId) },
    { label: 'Send to Back', onSelect: () => handleSendToBack(firstId) },
  ])

  if (isMultiple) {
    groups.push([
      { label: 'Align Left', onSelect: () => handleAlign('left') },
      { label: 'Align Center Horizontal', onSelect: () => handleAlign('centerH') },
      { label: 'Align Right', onSelect: () => handleAlign('right') },
      { label: 'Align Top', onSelect: () => handleAlign('top') },
      { label: 'Align Center Vertical', onSelect: () => handleAlign('centerV') },
      { label: 'Align Bottom', onSelect: () => handleAlign('bottom') },
    ])
  }

  if (isThreePlus) {
    groups.push([
      { label: 'Distribute Horizontally', onSelect: () => handleDistribute('horizontal') },
      { label: 'Distribute Vertically', onSelect: () => handleDistribute('vertical') },
    ])
  }

  if (pages.length > 1) {
    const currentPageId = pagesState.currentPageId.value
    const otherPages = pages.filter(p => p.id !== currentPageId)
    groups.push([
      {
        label: 'Move to Page',
        children: otherPages.map(p => ({
          label: p.name,
          onSelect: () => handleMoveToPage(selIds, p.id),
        })),
      },
    ])
  }

  const allLocked = selected.every(n => n.locked)
  const allVisible = selected.every(n => n.visible !== false)
  groups.push([
    {
      label: allLocked ? 'Unlock' : 'Lock',
      onSelect: () => { for (const n of selected) state.toggleLock(n.id) },
    },
    {
      label: allVisible ? 'Hide' : 'Show',
      onSelect: () => { for (const n of selected) state.toggleVisibility(n.id) },
    },
  ])

  await showContextMenu(groups)
}

// --- Page handlers ---

function handleSwitchPage(pageId: string) {
  // Save current page nodes
  const clonedNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
  pagesState.updateCurrentPageNodes(clonedNodes)
  pagesState.updateCurrentPageComments(JSON.parse(JSON.stringify(comments.comments.value)))

  // Switch page
  pagesState.switchToPage(pageId)
  const page = pagesState.currentPage.value
  if (page) {
    state.loadFromJSON(page.nodes)
    comments.loadComments(page.comments || [])
  }
}

function handleAddPage() {
  // Save current page
  const clonedNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
  pagesState.updateCurrentPageNodes(clonedNodes)
  pagesState.updateCurrentPageComments(JSON.parse(JSON.stringify(comments.comments.value)))

  // Add new page
  pagesState.addPage()
  state.loadFromJSON([])
  comments.loadComments([])
}

function handleRenamePage(pageId: string, name: string) {
  pagesState.renamePage(pageId, name)
}

function handleMoveToPage(nodeIds: string[], targetPageId: string) {
  const nodesToMove = nodeIds.map(id => state.getNode(id)).filter(Boolean) as DesignNode[]
  if (nodesToMove.length === 0) return

  state.withHistoryTransaction(() => {
    state.deleteNodesRaw(nodeIds)
    pagesState.addNodesToPage(targetPageId, JSON.parse(JSON.stringify(nodesToMove)))
  })
}

function getPageContextItems(page: { id: string; name: string }, index: number, startRename: (pageId: string) => void) {
  return [[
    { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(page.id) },
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => {
      const clonedNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
      pagesState.updateCurrentPageNodes(clonedNodes)
      pagesState.duplicatePage(page.id)
      const currentPage = pagesState.currentPage.value
      if (currentPage) {
        state.loadFromJSON(currentPage.nodes)
        comments.loadComments(currentPage.comments || [])
      }
    }},
    ...(pagesState.pages.value.length > 1 ? [{
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      onSelect: () => {
        pagesState.deletePage(page.id)
        const currentPage = pagesState.currentPage.value
        if (currentPage) {
          state.loadFromJSON(currentPage.nodes)
          comments.loadComments(currentPage.comments || [])
        }
      },
    }] : []),
  ]]
}

// --- AI Action Queue ---

let processingAIActions = false
const aiActionQueue: any[] = []

watch(pendingActions, () => {
  if (!canvasRef.value) return
  const actions = consumeDesignActions()
  if (actions.length === 0) return
  aiActionQueue.push(...actions)
  processAIActionQueue()
})

async function processAIActionQueue() {
  if (processingAIActions || !canvasRef.value) return
  processingAIActions = true
  isUpdatingFromCanvas.value = true

  try {
    await state.withHistoryTransactionAsync(async () => {
      while (aiActionQueue.length > 0) {
        const action = aiActionQueue.shift()
        if (!action) break
        await applyDesignAction(action)
      }
    })
  } finally {
    await nextTick()
    isUpdatingFromCanvas.value = false
    processingAIActions = false

    if (aiActionQueue.length > 0) {
      processAIActionQueue()
    }
  }
}

async function applyDesignAction(action: any): Promise<boolean> {
  if (action.type === 'create_element' && action.element) {
    state.addNodeRaw(action.element)
    return true
  }

  if (action.type === 'create_screen' && action.elements) {
    for (const el of action.elements) {
      state.addNodeRaw(el)
      await new Promise(r => requestAnimationFrame(r))
    }
    return true
  }

  if (action.type === 'update_element' && action.elementId && action.updates) {
    state.updateNode(action.elementId, action.updates)
    return true
  }

  if (action.type === 'delete_element' && action.elementId) {
    state.deleteNodesRaw([action.elementId])
    return true
  }

  return false
}

// --- Tool/preset change ---
function handleToolChange(tool: UITool) {
  activeTool.value = tool
  canvasRef.value?.setTool(tool as any)
}

function handleTextPresetChange(_preset: TextPreset) {
  // TODO: apply text preset styles to text tool
}

// --- Blueprint creation ---
function handleBlueprintCreate(preset: { name: string; width: number; height: number }) {
  const node: DesignNode = {
    id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    type: 'screen',
    name: preset.name,
    x: 100,
    y: 100,
    width: preset.width,
    height: preset.height,
    fill: '#ffffff',
    stroke: '#d1d5db',
    strokeWidth: 1,
    visible: true,
    locked: false,
    opacity: 1,
  }
  isUpdatingFromCanvas.value = true
  state.addNode(node)
  state.selectNodes([node.id])
  showBlueprintsPanel.value = false
  nextTick(() => { isUpdatingFromCanvas.value = false })
}

// --- Zoom ---
function handleZoomIn() {
  const current = canvasRef.value?.engine.zoom.value ?? 1
  canvasRef.value?.setZoom(current * 1.2)
}

function handleZoomOut() {
  const current = canvasRef.value?.engine.zoom.value ?? 1
  canvasRef.value?.setZoom(current / 1.2)
}

function handleZoomReset() {
  canvasRef.value?.setZoom(1)
}

function handleFitToScreen() {
  canvasRef.value?.fitToScreen()
}

// --- Undo/Redo ---
function handleUndo() {
  isUpdatingFromCanvas.value = true
  isReplayingHistory.value = true
  state.undo()
  nextTick(() => {
    canvasRef.value?.loadNodes(JSON.parse(JSON.stringify(state.nodes.value)))
    nextTick(() => {
      isUpdatingFromCanvas.value = false
      isReplayingHistory.value = false
    })
  })
}

function handleRedo() {
  isUpdatingFromCanvas.value = true
  isReplayingHistory.value = true
  state.redo()
  nextTick(() => {
    canvasRef.value?.loadNodes(JSON.parse(JSON.stringify(state.nodes.value)))
    nextTick(() => {
      isUpdatingFromCanvas.value = false
      isReplayingHistory.value = false
    })
  })
}

// --- Panel toggles ---
function toggleBlueprintsPanel() {
  showBlueprintsPanel.value = !showBlueprintsPanel.value
  if (showBlueprintsPanel.value) { showStylesPanel.value = false; showComponentsPanel.value = false }
}

function toggleStylesPanel() {
  showStylesPanel.value = !showStylesPanel.value
  if (showStylesPanel.value) { showBlueprintsPanel.value = false; showComponentsPanel.value = false }
}

function toggleComponentsPanel() {
  showComponentsPanel.value = !showComponentsPanel.value
  if (showComponentsPanel.value) { showBlueprintsPanel.value = false; showStylesPanel.value = false }
}

// --- Comment mode ---
const isCommentMode = ref(false)
function toggleCommentMode() {
  isCommentMode.value = !isCommentMode.value
}

// --- Keyboard shortcuts ---
useSpaceShortcuts([
  // Tools
  { id: 'design.select',    key: 'v',         label: 'Select tool',         group: 'Tools',   onPress: () => handleToolChange('select') },
  { id: 'design.rectangle', key: 'r',         label: 'Rectangle tool',      group: 'Tools',   onPress: () => handleToolChange('rectangle') },
  { id: 'design.ellipse',   key: 'e',         label: 'Ellipse tool',        group: 'Tools',   onPress: () => handleToolChange('ellipse') },
  { id: 'design.text',      key: 't',         label: 'Text tool',           group: 'Tools',   onPress: () => handleToolChange('text') },
  { id: 'design.hand',      key: 'h',         label: 'Hand (pan) tool',     group: 'Tools',   onPress: () => handleToolChange('hand') },
  { id: 'design.frame',     key: 'f',         label: 'Frame tool',          group: 'Tools',   onPress: () => handleToolChange('frame') },
  { id: 'design.pen',       key: 'p',         label: 'Pen tool',            group: 'Tools',   onPress: () => handleToolChange('pen') },
  { id: 'design.line',      key: 'l',         label: 'Line tool',           group: 'Tools',   onPress: () => handleToolChange('line') },
  { id: 'design.comment',   key: 'c',         label: 'Toggle comment mode', group: 'Tools',   onPress: toggleCommentMode },
  // Escape for comment exit is conditional — not remappable, no id
  { key: 'Escape', label: 'Cancel comment mode', when: () => isCommentMode.value, onPress: () => { isCommentMode.value = false; comments.cancelAddingComment(); comments.selectComment(null) } },
  // History
  { id: 'design.undo',      key: 'cmd+z',       label: 'Undo',              group: 'History', onPress: handleUndo },
  { id: 'design.redo',      key: 'cmd+shift+z', label: 'Redo',              group: 'History', onPress: handleRedo },
  { id: 'design.redo2',     key: 'cmd+y',       label: 'Redo (alternate)',  group: 'History', onPress: handleRedo },
  // View
  { id: 'design.grid',      key: "cmd+'",        label: 'Toggle grid',      group: 'View',    onPress: () => canvasRef.value?.toggleGrid() },
  { id: 'design.rulers',    key: 'cmd+shift+r',  label: 'Toggle rulers',    group: 'View',    onPress: () => canvasRef.value?.toggleRulers() },
  { id: 'design.snap',      key: 'cmd+shift+s',  label: 'Toggle snap',      group: 'View',    onPress: () => canvasRef.value?.toggleSnap() },
  // File
  { id: 'design.export',    key: 'cmd+e',        label: 'Export',           group: 'File',    onPress: () => { showExportModal.value = true } },
])

// --- Load or create design ---
onMounted(async () => {
  isLoading.value = true
  loadError.value = null

  const checkTeleportTarget = () => {
    const target = document.getElementById('toolbar-bun-slot')
    if (target) {
      isTeleportReady.value = true
    } else {
      setTimeout(checkTeleportTarget, 50)
    }
  }
  checkTeleportTarget()

  clearPageItems()

  try {
    if (designLocalId.value) {
      const design = await localDesigns.loadDesign(designLocalId.value)
      if (design?.nodes) {
        pagesState.initializePages(design.pages as DesignPage[] | undefined, design.nodes)
        const currentPage = pagesState.currentPage.value
        if (currentPage) {
          state.loadFromJSON(currentPage.nodes)
          comments.loadComments(currentPage.comments || [])
        } else {
          state.loadFromJSON(design.nodes)
        }
      } else {
        loadError.value = `Could not find design: ${designLocalId.value}`
      }
    } else {
      router.push(designIndexRoute.value)
      return
    }
  } catch (e) {
    loadError.value = String(e)
    console.error('Failed to load design:', e)
  } finally {
    isLoading.value = false
  }
})

// --- Auto-save ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null
const scheduleAutoSave = () => {
  const localId = localDesigns.currentDesign.value?.localId
  if (!localId) return

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      const clonedNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
      pagesState.updateCurrentPageNodes(clonedNodes)
      const pages = pagesState.exportPages()
      const currentPageId = pagesState.currentPageId.value || undefined
      await localDesigns.updateNodes(localId, clonedNodes, pages, currentPageId)
    } catch (e) {
      console.error('Error saving to IndexedDB:', e)
    }
  }, 500)
}

const nodesGeneration = ref(0)
watch(() => state.nodes.value, () => { nodesGeneration.value++ }, { deep: true })
watch(nodesGeneration, scheduleAutoSave)

// --- Canvas context for AI ---
let aiContextTimeout: ReturnType<typeof setTimeout> | null = null
const pagesGeneration = ref(0)
watch(() => pagesState.pages.value, () => { pagesGeneration.value++ }, { deep: true })

function updateAIContext() {
  const currentNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
  const allPages = pagesState.pages.value
  const name = designName.value
  const pageId = pagesState.currentPageId.value || undefined
  setCanvasContext(currentNodes, name, pageId)
  if (name) {
    const pages = allPages.length > 0 ? pagesState.exportPages() : undefined
    if (pages && pageId) {
      const currentIdx = pages.findIndex(page => page.id === pageId)
      if (currentIdx !== -1) {
        const current = pages[currentIdx]
        if (current) {
          pages[currentIdx] = { ...current, nodes: currentNodes }
        }
      }
    }
    registerDesign(name, currentNodes, undefined, pages, pageId)
  }
}

watch([nodesGeneration, pagesGeneration], () => {
  if (aiContextTimeout) clearTimeout(aiContextTimeout)
  aiContextTimeout = setTimeout(updateAIContext, 300)
}, { immediate: true })

// --- Cleanup ---
onUnmounted(() => {
  if (aiContextTimeout) clearTimeout(aiContextTimeout)
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    const localId = localDesigns.currentDesign.value?.localId
    if (localId) {
      const clonedNodes = JSON.parse(JSON.stringify(state.nodes.value)) as DesignNode[]
      pagesState.updateCurrentPageNodes(clonedNodes)
      pagesState.updateCurrentPageComments(JSON.parse(JSON.stringify(comments.comments.value)))
      const pages = pagesState.exportPages()
      const currentPageId = pagesState.currentPageId.value || undefined
      localDesigns.updateNodes(localId, clonedNodes, pages, currentPageId)
    }
  }
  clearCanvasContext()
})

// --- Navigation ---
const goBack = () => { router.push(designIndexRoute.value) }

// --- Toolbar breadcrumbs ---
const { clearToolbar, setBreadcrumbs, clearPageItems } = useToolbar()

watch([designIndexRoute, designName], () => {
  setBreadcrumbs([
    { label: 'Design', to: designIndexRoute.value },
    { label: designName.value },
  ])
}, { immediate: true })

onUnmounted(() => { clearToolbar() })

// --- Status bar ref ---
const statusBarRef = ref<any>()

function pageContextItemsFn(page: { id: string; name: string }, index: number) {
  return getPageContextItems(page, index, (pageId: string) => {
    statusBarRef.value?.startRename(pageId, pagesState.pages.value.find((p: any) => p.id === pageId)?.name || '')
  })
}
</script>

<template>
  <div class="h-full flex flex-col bg-app overflow-hidden">
    <!-- Toolbar (teleported) — reuse EditorToolbar from ui/ space -->
    <EditorToolbar
      :active-tool="activeTool"
      :can-undo="state.canUndo.value"
      :can-redo="state.canRedo.value"
      :show-blueprints-panel="showBlueprintsPanel"
      :show-styles-panel="showStylesPanel"
      :show-components-panel="showComponentsPanel"
      :is-comment-mode="isCommentMode"
      :unresolved-comment-count="comments.unresolvedCount.value"
      :show-unsplash-search="false"
      :unsplash-query="''"
      :unsplash-results="[]"
      :unsplash-loading="false"
      :is-saving="localDesigns.saving.value"
      :is-teleport-ready="isTeleportReady"
      @tool-change="handleToolChange"
      @text-preset-change="handleTextPresetChange"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-blueprints="toggleBlueprintsPanel"
      @toggle-styles="toggleStylesPanel"
      @toggle-components="toggleComponentsPanel"
      @export="showExportModal = true"
      @toggle-comment-mode="toggleCommentMode"
    />

    <!-- Loading state -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center bg-app">
      <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="flex-1 flex flex-col items-center justify-center gap-4 bg-app">
      <Icon name="i-lucide-file-warning" class="size-12 text-red-500" />
      <div class="text-center">
        <p class="text-app font-medium">Failed to load design</p>
        <p class="text-sm text-app-muted mt-1 max-w-md">{{ loadError }}</p>
      </div>
      <Button icon="i-lucide-arrow-left" label="Back to blueprints" variant="soft" @click="goBack" />
    </div>

    <!-- Main editor -->
    <template v-else>
      <div class="flex-1 flex min-h-0 overflow-hidden">
        <SplitPane direction="horizontal" :initial-size="15" :min-size="8" :max-size="30" :min-pane-size-px="256">
          <template #first>
            <UILayersPanel
              :nodes="nodes"
              :selected-node-ids="selectedIds"
              :pages="pagesState.pages.value"
              :current-page-id="pagesState.currentPageId.value"
              @select="handleLayerSelect"
              @toggle-visibility="handleToggleVisibility"
              @toggle-lock="handleToggleLock"
              @rename="handleRename"
              @reparent="handleReparent"
              @delete="handleLayerDelete"
              @bring-to-front="handleBringToFront"
              @send-to-back="handleSendToBack"
              @bring-forward="handleBringForward"
              @send-backward="handleSendBackward"
              @reorder="handleLayerReorder"
              @move-to-page="handleMoveToPage"
            />
          </template>
          <template #second>
            <SplitPane direction="horizontal" :initial-size="80" :min-size="60" :max-size="92" :min-pane-size-px="256">
              <template #first>
                <!-- Canvas -->
                <div class="w-full h-full relative bg-app-canvas">
                  <DesignCanvas
                    ref="canvasRef"
                    :nodes="nodes"
                    :selected-ids="selectedIds"
                    :skip-selection-sync="isUpdatingFromCanvas"
                    @selection-change="handleSelectionChange"
                    @node-update="handleNodeUpdate"
                    @node-create="handleNodeCreate"
                    @node-create-raw="handleNodeCreateRaw"
                    @batch-complete="handleBatchComplete"
                    @node-delete="handleNodeDelete"
                    @transform-end="handleTransformEnd"
                    @layer-order-change="handleLayerOrderChange"
                    @tool-change="(tool) => activeTool = tool"
                    @context-menu="handleCanvasContextMenu"
                  />
                </div>
              </template>
              <template #second>
                <!-- Right Panel -->
                <div class="h-full overflow-hidden">
                  <UIBlueprintPresets
                    v-if="showBlueprintsPanel"
                    @create="handleBlueprintCreate"
                  />
                  <UIStylesPanel
                    v-else-if="showStylesPanel"
                    :selected-node="selectedNode"
                  />
                  <UIComponentsPanel
                    v-else-if="showComponentsPanel"
                    :components="componentsState.components.value"
                    :selected-node="selectedNode"
                  />
                  <UIPropertiesPanel
                    v-else
                    :selected-nodes="selectedNodes"
                    :prototype-targets="prototypeTargets"
                    :active-tool="activeTool"
                    :is-path-edit-mode="false"
                    :is-path-closed="false"
                    :selected-point-index="null"
                    :selected-point-type="null"
                    :master-name="selectedNode?.componentId ? componentsState.getComponent(selectedNode.componentId)?.name : undefined"
                    @update="handlePropertyUpdate"
                    @preview="handlePropertyPreview"
                    @align="handleAlign"
                    @distribute="handleDistribute"
                  />
                </div>
              </template>
            </SplitPane>
          </template>
        </SplitPane>
      </div>

      <!-- Status Bar -->
      <EditorStatusBar
        ref="statusBarRef"
        :pages="pagesState.pages.value"
        :current-page-id="pagesState.currentPageId.value"
        :zoom-percent="zoomPercent"
        :grid-enabled="canvasRef?.engine.gridEnabled.value ?? false"
        :snap-enabled="canvasRef?.engine.snapEnabled.value ?? false"
        :rulers-enabled="canvasRef?.engine.rulersEnabled.value ?? false"
        :page-context-items="pageContextItemsFn"
        @switch-page="handleSwitchPage"
        @add-page="handleAddPage"
        @rename-page="handleRenamePage"
        @zoom-in="handleZoomIn"
        @zoom-out="handleZoomOut"
        @zoom-reset="handleZoomReset"
        @fit-to-screen="handleFitToScreen"
        @toggle-grid="canvasRef?.toggleGrid()"
        @toggle-snap="canvasRef?.toggleSnap()"
        @toggle-rulers="canvasRef?.toggleRulers()"
      />
    </template>

    <!-- Export Modal -->
    <UIExportModal
      v-if="showExportModal"
      v-model:open="showExportModal"
      :nodes="nodes"
      :selected-ids="selectedIds"
      :canvas-width="800"
      :canvas-height="600"
    />
  </div>
</template>
