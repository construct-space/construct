/**
 * LineTool — Click-drag to create a line
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'
import type { DesignNode } from '~/types/design'

export class LineTool implements Tool {
  name = 'line'
  cursor = 'crosshair'

  private app: DesignApp
  private isDragging = false
  private start = { x: 0, y: 0 }

  constructor(app: DesignApp) {
    this.app = app
  }

  onActivate(): void {}
  onDeactivate(): void { this.isDragging = false }

  onPointerDown(e: FederatedPointerEvent): void {
    const world = this.app.viewport.toWorld(e.globalX, e.globalY)
    this.start = { x: this.app.grid.snap(world.x), y: this.app.grid.snap(world.y) }
    this.isDragging = true
  }

  onPointerMove(_e: FederatedPointerEvent): void {}

  onPointerUp(e: FederatedPointerEvent): void {
    if (!this.isDragging) return
    this.isDragging = false

    const world = this.app.viewport.toWorld(e.globalX, e.globalY)
    const endX = this.app.grid.snap(world.x)
    const endY = this.app.grid.snap(world.y)

    // Minimum line length
    const dx = endX - this.start.x
    const dy = endY - this.start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 5) return // Too small, ignore

    const node: DesignNode = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'line',
      name: 'Line',
      x: this.start.x,
      y: this.start.y,
      x2: endX,
      y2: endY,
      width: Math.abs(dx) || 1,
      height: Math.abs(dy) || 1,
      stroke: '#71717a',
      strokeWidth: 2,
      opacity: 1,
      visible: true,
      locked: false,
    }

    this.app.callbacks.onNodeCreate?.(node)
    this.app.selection.select(node.id)
    this.app.setTool('select')
  }
}
