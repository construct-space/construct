/**
 * DesignApp — Core PixiJS engine for the design space
 *
 * Owns:
 * - PixiJS Application (renderer)
 * - Viewport (pan/zoom via pixi-viewport)
 * - Scene layer (content objects)
 * - Overlay layer (selection handles, guides — always on top)
 * - SceneRenderer (DesignNode[] → PixiJS sync)
 * - SelectionManager
 * - TransformHandles
 * - GridOverlay
 * - Tool system
 */
import { Application, Container } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { SceneRenderer } from './SceneRenderer'
import { SelectionManager } from './SelectionManager'
import { TransformHandles } from './TransformHandles'
import { GridOverlay } from './GridOverlay'
import type { Tool } from './tools/Tool'
import type { DesignNode } from '~/types/design'

export interface DesignAppCallbacks {
  onSelectionChange?: (ids: string[]) => void
  onNodeUpdate?: (id: string, updates: Partial<DesignNode>) => void
  onNodeCreate?: (node: DesignNode) => void
  onNodeCreateRaw?: (node: DesignNode) => void
  onBatchComplete?: () => void
  onNodeDelete?: (id: string) => void
  onTransformEnd?: () => void
  onLayerOrderChange?: (orderedIds: string[]) => void
  onToolChange?: (toolName: string) => void
}

export class DesignApp {
  app!: Application
  viewport!: Viewport
  scene!: Container
  overlay!: Container
  grid!: GridOverlay
  renderer!: SceneRenderer
  selection!: SelectionManager
  transforms!: TransformHandles
  callbacks: DesignAppCallbacks

  private tools = new Map<string, Tool>()
  private _activeTool: Tool | null = null
  private _activeToolName = 'select'
  private _isSpaceDown = false
  private _wasToolBeforeSpace: string | null = null
  private _keyDownHandler: ((e: KeyboardEvent) => void) | null = null
  private _keyUpHandler: ((e: KeyboardEvent) => void) | null = null
  private _resizeObserver: ResizeObserver | null = null

  constructor(callbacks: DesignAppCallbacks = {}) {
    this.callbacks = callbacks
  }

  /**
   * Initialize the PixiJS application and mount to a canvas element.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application()

    await this.app.init({
      canvas,
      background: 0xf0f0f0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    })
    this.app.stage.eventMode = 'static'

    // Create viewport for pan/zoom
    this.viewport = new Viewport({
      screenWidth: canvas.clientWidth,
      screenHeight: canvas.clientHeight,
      events: this.app.renderer.events,
    })
    this.app.stage.addChild(this.viewport)

    // Enable viewport interactions
    this.viewport
      .drag({ mouseButtons: 'middle' }) // Middle-click drag to pan
      .pinch()       // Pinch to zoom on trackpad
      .wheel()       // Scroll wheel to zoom
      .decelerate()  // Smooth deceleration after pan

    // Scene container (design content)
    this.scene = new Container()
    this.scene.label = '__scene'
    this.viewport.addChild(this.scene)

    // Overlay container (selection handles, guides — not affected by viewport transform)
    this.overlay = new Container()
    this.overlay.label = '__overlay'
    this.viewport.addChild(this.overlay)

    // Grid
    this.grid = new GridOverlay(this.app.stage)

    // Scene renderer
    this.renderer = new SceneRenderer(this.scene)

    // Selection manager
    this.selection = new SelectionManager(this.scene, this.renderer, (ids) => {
      this.transforms.update(ids, this.renderer, this.getZoom())
      this.callbacks.onSelectionChange?.(ids)
    })

    // Transform handles
    this.transforms = new TransformHandles(this.overlay, (id, updates) => {
      this.callbacks.onNodeUpdate?.(id, updates)
    }, () => {
      this.callbacks.onTransformEnd?.()
    })

    // Setup viewport event forwarding to active tool
    this.setupPointerEvents()
    this.setupKeyboardEvents()
    this.setupResizeObserver(canvas)

    // Redraw grid on viewport changes
    this.viewport.on('moved', () => this.updateGrid())
    this.viewport.on('zoomed', () => {
      this.updateGrid()
      this.updateSelectionVisuals()
    })
  }

  /**
   * Set the full node set and sync to PixiJS.
   */
  setNodes(nodes: DesignNode[]): void {
    this.renderer.sync(nodes)
    // Update selection visuals
    this.updateSelectionVisuals()
  }

  /**
   * Add a single node.
   */
  addNode(node: DesignNode): void {
    this.renderer.addNode(node)
  }

  /**
   * Update a single node in the renderer.
   */
  updateNode(id: string, updates: Partial<DesignNode>): void {
    this.renderer.updateNode(id, updates)
    // Update transform handles if this node is selected
    if (this.selection.selectedIds.includes(id)) {
      this.transforms.update(this.selection.selectedIds, this.renderer, this.getZoom())
    }
  }

  /**
   * Remove a single node.
   */
  removeNode(id: string): void {
    this.renderer.removeObject(id)
    this.selection.deselect(id)
    this.transforms.update(this.selection.selectedIds, this.renderer, this.getZoom())
  }

  /**
   * Register a tool.
   */
  registerTool(name: string, tool: Tool): void {
    this.tools.set(name, tool)
  }

  /**
   * Switch the active tool.
   */
  setTool(name: string): void {
    if (this._activeTool) {
      this._activeTool.onDeactivate()
    }

    const tool = this.tools.get(name)
    if (tool) {
      this._activeTool = tool
      this._activeToolName = name
      tool.onActivate()
      this.viewport.cursor = tool.cursor

      // Disable viewport drag when not in hand mode
      if (name === 'hand') {
        this.viewport.drag({})
      } else {
        this.viewport.drag({ mouseButtons: 'middle' })
      }

      this.callbacks.onToolChange?.(name)
    }
  }

  get activeToolName(): string {
    return this._activeToolName
  }

  /**
   * Set zoom level.
   */
  setZoom(level: number): void {
    this.viewport.setZoom(level, true)
    this.updateGrid()
  }

  /**
   * Get current zoom level.
   */
  getZoom(): number {
    return this.viewport.scale.x
  }

  /**
   * Fit all content to screen.
   */
  fitToScreen(): void {
    this.viewport.fit()
    this.updateGrid()
  }

  /**
   * Clean up everything.
   */
  destroy(): void {
    if (this._keyDownHandler) {
      window.removeEventListener('keydown', this._keyDownHandler)
    }
    if (this._keyUpHandler) {
      window.removeEventListener('keyup', this._keyUpHandler)
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
    }

    this._activeTool?.onDeactivate()
    this.transforms.destroy()
    this.grid.destroy()
    this.renderer.destroy()
    this.app.destroy(true, { children: true })
  }

  /**
   * Refresh selection highlights and transform handles at current zoom.
   */
  private updateSelectionVisuals(): void {
    const zoom = this.getZoom()
    this.selection.setZoom(zoom)
    this.transforms.update(this.selection.selectedIds, this.renderer, zoom)
  }

  // --- Private ---

  private setupPointerEvents(): void {
    // Forward viewport pointer events to the active tool
    this.viewport.on('pointerdown', (e) => {
      this._activeTool?.onPointerDown(e)
    })
    const onMove = (e: Parameters<NonNullable<Tool['onPointerMove']>>[0]) => {
      this._activeTool?.onPointerMove(e)
    }
    // Normal move path when cursor is over the viewport.
    this.viewport.on('pointermove', onMove)
    // Global path for hover continuity while moving fast or crossing child boundaries.
    this.app.stage.on('globalpointermove', onMove)
    this.viewport.on('pointerup', (e) => {
      this._activeTool?.onPointerUp(e)
    })
    this.viewport.on('pointerupoutside', (e) => {
      this._activeTool?.onPointerUp(e)
    })
  }

  private isInputFocused(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null
    if (!t) return false
    const tag = t.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
  }

  private setupKeyboardEvents(): void {
    this._keyDownHandler = (e: KeyboardEvent) => {
      // Don't intercept keys when the user is typing in an input
      if (this.isInputFocused(e)) return

      // Space bar → temporary hand tool
      if (e.code === 'Space' && !this._isSpaceDown) {
        e.preventDefault()
        this._isSpaceDown = true
        this._wasToolBeforeSpace = this._activeToolName
        this.setTool('hand')
      }

      this._activeTool?.onKeyDown?.(e)
    }

    this._keyUpHandler = (e: KeyboardEvent) => {
      // Don't intercept keys when the user is typing in an input
      if (this.isInputFocused(e)) return

      // Release space → restore previous tool
      if (e.code === 'Space' && this._isSpaceDown) {
        this._isSpaceDown = false
        if (this._wasToolBeforeSpace) {
          this.setTool(this._wasToolBeforeSpace)
          this._wasToolBeforeSpace = null
        }
      }

      this._activeTool?.onKeyUp?.(e)
    }

    window.addEventListener('keydown', this._keyDownHandler)
    window.addEventListener('keyup', this._keyUpHandler)
  }

  private setupResizeObserver(canvas: HTMLCanvasElement): void {
    this._resizeObserver = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      this.app.renderer.resize(w, h)
      this.viewport.resize(w, h)
      this.updateGrid()
    })
    this._resizeObserver.observe(canvas)
  }

  private updateGrid(): void {
    const { x, y } = this.viewport.corner
    const zoom = this.viewport.scale.x
    this.grid.redraw(
      x,
      y,
      this.app.screen.width,
      this.app.screen.height,
      zoom,
    )
  }
}
