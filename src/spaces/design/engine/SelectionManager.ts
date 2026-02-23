/**
 * SelectionManager — Click, shift-click, and rubber-band selection
 *
 * Manages which nodes are currently selected.
 * Draws selection highlight (blue border) on selected objects.
 */
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { SceneRenderer } from './SceneRenderer'

export class SelectionManager {
  /** Currently selected node IDs */
  selectedIds: string[] = []

  private scene: Container
  private renderer: SceneRenderer
  private onChange: (ids: string[]) => void

  /** Selection highlight graphics per selected object */
  private highlights = new Map<string, Graphics>()
  /** Hover preview */
  private hoverId: string | null = null
  private hoverPreview: Graphics

  /** Current zoom level (used to keep strokes constant screen size) */
  private zoom = 1

  /** Rubber band state */
  private rubberBand: Graphics | null = null
  private rubberBandStart: { x: number; y: number } | null = null
  private isRubberBanding = false

  constructor(
    scene: Container,
    renderer: SceneRenderer,
    onChange: (ids: string[]) => void,
  ) {
    this.scene = scene
    this.renderer = renderer
    this.onChange = onChange

    this.hoverPreview = new Graphics()
    this.hoverPreview.label = '__hoverPreview'
    this.hoverPreview.eventMode = 'none'
    this.scene.addChild(this.hoverPreview)
  }

  /**
   * Select a single node, optionally adding to existing selection.
   */
  select(id: string, additive = false): void {
    if (additive) {
      // Toggle in multi-selection
      const idx = this.selectedIds.indexOf(id)
      if (idx >= 0) {
        this.selectedIds.splice(idx, 1)
      } else {
        this.selectedIds.push(id)
      }
    } else {
      this.selectedIds = [id]
    }
    this.updateHighlights()
    this.onChange([...this.selectedIds])
  }

  /**
   * Select multiple nodes (replace current selection).
   */
  selectMultiple(ids: string[]): void {
    this.selectedIds = [...ids]
    this.updateHighlights()
    this.onChange([...this.selectedIds])
  }

  /**
   * Remove a node from selection.
   */
  deselect(id: string): void {
    this.selectedIds = this.selectedIds.filter(s => s !== id)
    this.updateHighlights()
    this.onChange([...this.selectedIds])
  }

  /**
   * Clear all selection.
   */
  clearSelection(): void {
    this.selectedIds = []
    this.updateHighlights()
    this.onChange([])
  }

  /**
   * Set selection to exact IDs (from external source like useUIState).
   */
  setSelection(ids: string[]): void {
    this.selectedIds = [...ids]
    this.updateHighlights()
  }

  /**
   * Update the zoom level so strokes stay constant screen size.
   */
  setZoom(zoom: number): void {
    this.zoom = zoom
    this.updateHighlights()
  }

  /**
   * Set hover-preview target (what would be selected on click).
   */
  setHoverTarget(id: string | null): void {
    const nextId = id && !this.selectedIds.includes(id) ? id : null
    if (this.hoverId === nextId) return
    this.hoverId = nextId
    this.updateHoverPreview()
  }

  clearHoverTarget(): void {
    if (!this.hoverId) return
    this.hoverId = null
    this.hoverPreview.clear()
  }

  /**
   * Hit test: find the topmost object under a point.
   */
  hitTest(globalX: number, globalY: number): string | null {
    const objects = this.renderer.getAllObjects()
    let topId: string | null = null
    let topPath: number[] | null = null

    for (const [id, obj] of objects) {
      if (!obj.visible) continue

      const bounds = this.getSceneLocalBounds(obj)
      if (bounds && this.containsPoint(bounds, globalX, globalY)) {
        const path = this.getDisplayPath(obj)
        if (path && (!topPath || this.compareDisplayPath(path, topPath) > 0)) {
          topPath = path
          topId = id
        }
      }
    }

    return topId
  }

  /**
   * Start rubber band selection from a point.
   */
  startRubberBand(x: number, y: number): void {
    this.rubberBandStart = { x, y }
    this.isRubberBanding = true

    if (!this.rubberBand) {
      this.rubberBand = new Graphics()
      this.rubberBand.label = '__rubberBand'
      this.rubberBand.eventMode = 'none'
      this.scene.addChild(this.rubberBand)
    }
  }

  /**
   * Update rubber band to a new point.
   */
  updateRubberBand(x: number, y: number): void {
    if (!this.rubberBandStart || !this.rubberBand) return

    const sx = Math.min(this.rubberBandStart.x, x)
    const sy = Math.min(this.rubberBandStart.y, y)
    const w = Math.abs(x - this.rubberBandStart.x)
    const h = Math.abs(y - this.rubberBandStart.y)

    this.rubberBand.clear()
    this.rubberBand.rect(sx, sy, w, h)
    this.rubberBand.fill({ color: 0x2563eb, alpha: 0.08 })
    this.rubberBand.stroke({ color: 0x2563eb, width: 1 / this.zoom, alpha: 0.5 })
  }

  /**
   * End rubber band and select intersecting objects.
   */
  endRubberBand(x: number, y: number): void {
    if (!this.rubberBandStart) return

    const sx = Math.min(this.rubberBandStart.x, x)
    const sy = Math.min(this.rubberBandStart.y, y)
    const w = Math.abs(x - this.rubberBandStart.x)
    const h = Math.abs(y - this.rubberBandStart.y)

    // Only select if rubber band is meaningful size
    if (w > 2 && h > 2) {
      const rect = new Rectangle(sx, sy, w, h)
      const ids: string[] = []

      const objects = this.renderer.getAllObjects()
      for (const [id, obj] of objects) {
        if (!obj.visible) continue
        const bounds = this.getSceneLocalBounds(obj)
        if (bounds && this.intersects(bounds, rect)) {
          ids.push(id)
        }
      }

      this.selectMultiple(ids)
    }

    // Clean up
    if (this.rubberBand) {
      this.rubberBand.clear()
      this.scene.removeChild(this.rubberBand)
      this.rubberBand.destroy()
      this.rubberBand = null
    }
    this.rubberBandStart = null
    this.isRubberBanding = false
  }

  get isRubberBandActive(): boolean {
    return this.isRubberBanding
  }

  /**
   * Update selection highlight borders.
   */
  private updateHighlights(): void {
    // Remove stale highlights
    for (const [id, highlight] of this.highlights) {
      if (!this.selectedIds.includes(id)) {
        highlight.destroy()
        this.highlights.delete(id)
      }
    }

    // Add/update highlights for selected objects
    for (const id of this.selectedIds) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue

      let highlight = this.highlights.get(id)
      if (!highlight) {
        highlight = new Graphics()
        highlight.label = `__highlight_${id}`
        highlight.eventMode = 'none'
        this.scene.addChild(highlight)
        this.highlights.set(id, highlight)
      }

      // Draw blue selection border — stroke width stays constant on screen
      const bounds = this.getSceneLocalBounds(obj) ?? this.getSceneLocalFallbackBounds(obj)
      if (!bounds) continue
      const inv = 1 / this.zoom
      const pad = 1 * inv
      highlight.clear()
      highlight.rect(
        bounds.x - pad,
        bounds.y - pad,
        Math.max(0, bounds.width) + pad * 2,
        Math.max(0, bounds.height) + pad * 2,
      )
      highlight.stroke({ color: 0x2563eb, width: 1.5 * inv })
    }

    if (this.hoverId && this.selectedIds.includes(this.hoverId)) {
      this.hoverId = null
      this.hoverPreview.clear()
    } else {
      this.updateHoverPreview()
    }
  }

  private updateHoverPreview(): void {
    this.hoverPreview.clear()
    if (!this.hoverId) return

    const obj = this.renderer.getObject(this.hoverId)
    if (!obj || !obj.visible) return
    this.scene.addChild(this.hoverPreview)
    const bounds = this.getSceneLocalBounds(obj) ?? this.getSceneLocalFallbackBounds(obj)
    if (!bounds) return

    const inv = 1 / this.zoom

    // Text gets a thin underline cue (Figma-like preselection).
    if (obj instanceof Text) {
      const underlineY = bounds.y + bounds.height + 1 * inv
      this.hoverPreview
        .moveTo(bounds.x, underlineY)
        .lineTo(bounds.x + bounds.width, underlineY)
      this.hoverPreview.stroke({ color: 0x22a3ff, width: 2 * inv, alpha: 0.95 })
      return
    }

    const pad = 0.5 * inv
    this.hoverPreview.rect(
      bounds.x - pad,
      bounds.y - pad,
      Math.max(0, bounds.width) + pad * 2,
      Math.max(0, bounds.height) + pad * 2,
    )
    this.hoverPreview.stroke({ color: 0x22a3ff, width: 1 * inv, alpha: 0.9 })
  }

  private containsPoint(bounds: Rectangle, x: number, y: number): boolean {
    return x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
  }

  private intersects(a: Rectangle, b: Rectangle): boolean {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
  }

  private getSceneLocalBounds(obj: Container): Rectangle | null {
    const target = this.getRenderedBoundsTarget(obj)
    return this.getBoundsFromRenderedCorners(target, this.scene) ?? this.getSceneLocalFallbackBounds(target)
  }

  private getSceneLocalFallbackBounds(obj: Container): Rectangle | null {
    const bounds = obj.getBounds()
    if (
      !isFinite(bounds.x) || !isFinite(bounds.y) ||
      !isFinite(bounds.width) || !isFinite(bounds.height)
    ) {
      return null
    }

    const topLeft = this.scene.toLocal({ x: bounds.x, y: bounds.y })
    const bottomRight = this.scene.toLocal({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    const minX = Math.min(topLeft.x, bottomRight.x)
    const minY = Math.min(topLeft.y, bottomRight.y)

    return new Rectangle(
      minX,
      minY,
      Math.abs(bottomRight.x - topLeft.x),
      Math.abs(bottomRight.y - topLeft.y),
    )
  }

  private getBoundsFromRenderedCorners(target: Container, space: Container): Rectangle | null {
    const localBounds = target.getLocalBounds()
    if (
      !isFinite(localBounds.x) || !isFinite(localBounds.y) ||
      !isFinite(localBounds.width) || !isFinite(localBounds.height)
    ) {
      return null
    }

    const corners = [
      { x: localBounds.x, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
      { x: localBounds.x, y: localBounds.y + localBounds.height },
    ]

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const corner of corners) {
      const global = target.toGlobal(corner)
      const local = space.toLocal(global)
      minX = Math.min(minX, local.x)
      minY = Math.min(minY, local.y)
      maxX = Math.max(maxX, local.x)
      maxY = Math.max(maxY, local.y)
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null
    }

    return new Rectangle(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  }

  private getRenderedBoundsTarget(obj: Container): Container {
    // For screens, use only the frame graphics and exclude the title label.
    const background = obj.getChildByLabel('__bg') as Container | null
    const title = obj.getChildByLabel('__name')
    if (background && title) return background
    return obj
  }

  private getDisplayPath(obj: Container): number[] | null {
    const path: number[] = []
    let current: Container | null = obj

    while (current && current !== this.scene) {
      const parent = current.parent as Container | null
      if (!parent) return null
      path.unshift(parent.children.indexOf(current))
      current = parent
    }

    if (current !== this.scene) return null
    return path
  }

  private compareDisplayPath(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return a[i] - b[i]
    }
    return a.length - b.length
  }
}
