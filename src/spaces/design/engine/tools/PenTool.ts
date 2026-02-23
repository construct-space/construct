/**
 * PenTool — Click to place bezier path points
 *
 * Phase 1: Simple polyline creation. Click to add points, double-click to finish.
 * Phase 2 (future): Full bezier curve editing with control handles.
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'
import type { DesignNode } from '~/types/design'

export class PenTool implements Tool {
  name = 'pen'
  cursor = 'crosshair'

  private app: DesignApp
  private points: { x: number; y: number }[] = []
  private isDrawing = false

  constructor(app: DesignApp) {
    this.app = app
  }

  onActivate(): void {
    this.points = []
    this.isDrawing = false
  }

  onDeactivate(): void {
    if (this.isDrawing && this.points.length >= 2) {
      this.finishPath()
    }
    this.points = []
    this.isDrawing = false
  }

  onPointerDown(e: FederatedPointerEvent): void {
    const world = this.app.viewport.toWorld(e.globalX, e.globalY)
    const x = this.app.grid.snap(world.x)
    const y = this.app.grid.snap(world.y)

    this.points.push({ x, y })
    this.isDrawing = true

    // Double-click detection via detail
    if (e.detail >= 2 && this.points.length >= 2) {
      this.finishPath()
    }
  }

  onPointerMove(_e: FederatedPointerEvent): void {}
  onPointerUp(_e: FederatedPointerEvent): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && this.points.length >= 2) {
      this.finishPath()
    }
    if (e.key === 'Escape') {
      this.points = []
      this.isDrawing = false
      this.app.setTool('select')
    }
  }

  private finishPath(): void {
    if (this.points.length < 2) return

    // Build SVG path data
    const first = this.points[0]!
    const pathParts = [`M ${first.x} ${first.y}`]
    for (let i = 1; i < this.points.length; i++) {
      pathParts.push(`L ${this.points[i]!.x} ${this.points[i]!.y}`)
    }
    const pathData = pathParts.join(' ')

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of this.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }

    const node: DesignNode = {
      id: `path-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'path',
      name: 'Path',
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      pathData,
      stroke: '#18181b',
      strokeWidth: 2,
      opacity: 1,
      visible: true,
      locked: false,
    }

    this.app.callbacks.onNodeCreate?.(node)
    this.app.selection.select(node.id)

    this.points = []
    this.isDrawing = false
    this.app.setTool('select')
  }
}
