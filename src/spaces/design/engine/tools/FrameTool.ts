/**
 * FrameTool — Click-drag to create a screen/frame (artboard)
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'
import type { DesignNode } from '~/types/design'

export class FrameTool implements Tool {
  name = 'frame'
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

    const x = Math.min(this.start.x, endX)
    const y = Math.min(this.start.y, endY)
    const w = Math.abs(endX - this.start.x)
    const h = Math.abs(endY - this.start.y)

    const width = Math.max(w, 320)
    const height = Math.max(h, 240)

    const node: DesignNode = {
      id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'screen',
      name: 'Frame',
      x,
      y,
      width,
      height,
      fill: '#ffffff',
      stroke: '#d1d5db',
      strokeWidth: 1,
      opacity: 1,
      visible: true,
      locked: false,
    }

    this.app.callbacks.onNodeCreate?.(node)
    this.app.selection.select(node.id)
    this.app.setTool('select')
  }
}
