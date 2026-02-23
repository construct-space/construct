/**
 * useDesignEngine — Main composable that bridges PixiJS engine with Vue
 *
 * Creates and manages the DesignApp, exposes reactive API.
 * Watches useUIState.nodes and syncs to the engine.
 */
import { DesignApp, SelectTool, HandTool, RectTool, EllipseTool, LineTool, TextTool, FrameTool, PenTool } from '../engine'
import type { DesignAppCallbacks } from '../engine'
import type { DesignNode } from '~/types/design'

export type DesignTool = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'line' | 'text' | 'frame' | 'pen'

export interface DesignEngineCallbacks {
  onSelectionChange?: (ids: string[]) => void
  onNodeUpdate?: (id: string, updates: Partial<DesignNode>) => void
  onNodeCreate?: (node: DesignNode) => void
  onNodeCreateRaw?: (node: DesignNode) => void
  onBatchComplete?: () => void
  onNodeDelete?: (id: string) => void
  onTransformEnd?: () => void
  onLayerOrderChange?: (orderedIds: string[]) => void
  onToolChange?: (tool: string) => void
}

export function useDesignEngine(callbacks: DesignEngineCallbacks = {}) {
  const engine = shallowRef<DesignApp | null>(null)
  const isReady = ref(false)
  const activeTool = ref<DesignTool>('select')
  const zoom = ref(1)

  /**
   * Initialize the engine on a canvas element.
   */
  async function init(canvas: HTMLCanvasElement): Promise<void> {
    const appCallbacks: DesignAppCallbacks = {
      onSelectionChange: (ids) => {
        callbacks.onSelectionChange?.(ids)
      },
      onNodeUpdate: (id, updates) => {
        callbacks.onNodeUpdate?.(id, updates)
      },
      onNodeCreate: (node) => {
        callbacks.onNodeCreate?.(node)
      },
      onNodeCreateRaw: (node) => {
        callbacks.onNodeCreateRaw?.(node)
      },
      onBatchComplete: () => {
        callbacks.onBatchComplete?.()
      },
      onNodeDelete: (id) => {
        callbacks.onNodeDelete?.(id)
      },
      onTransformEnd: () => {
        callbacks.onTransformEnd?.()
      },
      onLayerOrderChange: (ids) => {
        callbacks.onLayerOrderChange?.(ids)
      },
      onToolChange: (tool) => {
        activeTool.value = tool as DesignTool
        callbacks.onToolChange?.(tool)
      },
    }

    const app = new DesignApp(appCallbacks)
    await app.init(canvas)

    // Register tools
    app.registerTool('select', new SelectTool(app))
    app.registerTool('hand', new HandTool(app))
    app.registerTool('rectangle', new RectTool(app))
    app.registerTool('ellipse', new EllipseTool(app))
    app.registerTool('line', new LineTool(app))
    app.registerTool('text', new TextTool(app))
    app.registerTool('frame', new FrameTool(app))
    app.registerTool('pen', new PenTool(app))

    // Set default tool
    app.setTool('select')

    engine.value = app
    isReady.value = true

    // Track zoom changes
    app.viewport.on('zoomed', () => {
      zoom.value = app.getZoom()
    })
  }

  /**
   * Sync nodes from state to engine.
   */
  function setNodes(nodes: DesignNode[]): void {
    engine.value?.setNodes(nodes)
  }

  /**
   * Add a single node to the engine.
   */
  function addNodeToCanvas(node: DesignNode): void {
    engine.value?.addNode(node)
  }

  /**
   * Update a node on the canvas.
   */
  function updateNodeOnCanvas(id: string, updates: Partial<DesignNode>): void {
    engine.value?.updateNode(id, updates)
  }

  /**
   * Remove a node from the canvas.
   */
  function removeNodeFromCanvas(id: string): void {
    engine.value?.removeNode(id)
  }

  /**
   * Load nodes (full replacement).
   */
  function loadNodes(nodes: DesignNode[]): void {
    engine.value?.setNodes(nodes)
  }

  /**
   * Set the active tool.
   */
  function setTool(tool: DesignTool): void {
    engine.value?.setTool(tool)
    activeTool.value = tool
  }

  /**
   * Set zoom level.
   */
  function setZoom(level: number): void {
    engine.value?.setZoom(level)
    zoom.value = level
  }

  /**
   * Fit content to screen.
   */
  function fitToScreen(): void {
    engine.value?.fitToScreen()
    zoom.value = engine.value?.getZoom() ?? 1
  }

  /**
   * Get grid config (reactive via engine).
   */
  function toggleGrid(): void {
    engine.value?.grid.toggle()
  }

  function toggleSnap(): void {
    engine.value?.grid.toggleSnap()
  }

  function toggleRulers(): void {
    engine.value?.grid.toggleRulers()
  }

  const gridEnabled = computed(() => engine.value?.grid.config.enabled ?? false)
  const snapEnabled = computed(() => engine.value?.grid.config.snapEnabled ?? false)
  const rulersEnabled = computed(() => engine.value?.grid.config.showRulers ?? false)

  /**
   * Clean up.
   */
  function destroy(): void {
    engine.value?.destroy()
    engine.value = null
    isReady.value = false
  }

  return {
    engine: readonly(engine),
    isReady: readonly(isReady),
    activeTool: readonly(activeTool),
    zoom: readonly(zoom),

    // Lifecycle
    init,
    destroy,

    // Node operations (for AI action queue compatibility)
    setNodes,
    addNodeToCanvas,
    updateNodeOnCanvas,
    removeNodeFromCanvas,
    loadNodes,

    // Tools
    setTool,

    // Viewport
    setZoom,
    fitToScreen,

    // Grid
    toggleGrid,
    toggleSnap,
    toggleRulers,
    gridEnabled,
    snapEnabled,
    rulersEnabled,
  }
}
