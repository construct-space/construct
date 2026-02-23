/**
 * SelectTool — Select, move, and resize objects
 *
 * Click to select, shift+click to multi-select,
 * drag on empty space for rubber-band selection,
 * drag on selected object to move.
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'

export class SelectTool implements Tool {
  name = 'select'
  cursor = 'default'

  private app: DesignApp
  private isDragging = false
  private isMoving = false
  private dragStart = { x: 0, y: 0 }
  private moveStartPositions: Map<string, { x: number; y: number }> = new Map()

  constructor(app: DesignApp) {
    this.app = app
  }

  onActivate(): void {}
  onDeactivate(): void {
    this.isDragging = false
    this.isMoving = false
    this.app.selection.clearHoverTarget()
  }

  onPointerDown(e: FederatedPointerEvent): void {
    const point = this.getGlobalPoint(e)
    const worldPos = this.app.viewport.toWorld(point.x, point.y)
    const hitId = this.app.selection.hitTest(worldPos.x, worldPos.y)
    const isShift = e.shiftKey
    this.app.selection.clearHoverTarget()

    if (hitId) {
      // Clicked on an object
      if (isShift) {
        this.app.selection.select(hitId, true) // Toggle in multi-selection
      } else if (!this.app.selection.selectedIds.includes(hitId)) {
        this.app.selection.select(hitId) // Select single
      }

      // Start move drag
      this.isDragging = true
      this.isMoving = true
      this.dragStart = { x: worldPos.x, y: worldPos.y }

      // Record start positions for all selected objects
      this.moveStartPositions.clear()
      for (const id of this.app.selection.selectedIds) {
        const obj = this.app.renderer.getObject(id)
        if (obj) {
          this.moveStartPositions.set(id, { x: obj.x, y: obj.y })
        }
      }
    } else {
      // Clicked on empty space
      if (!isShift) {
        this.app.selection.clearSelection()
      }

      // Start rubber-band selection
      this.isDragging = true
      this.isMoving = false
      this.dragStart = { x: worldPos.x, y: worldPos.y }
      this.app.selection.startRubberBand(worldPos.x, worldPos.y)
    }
  }

  onPointerMove(e: FederatedPointerEvent): void {
    const point = this.getGlobalPoint(e)
    const worldPos = this.app.viewport.toWorld(point.x, point.y)
    if (!this.isDragging) {
      this.updateHoverAt(worldPos.x, worldPos.y)
      return
    }

    if (this.isMoving) {
      // Move selected objects
      const dx = worldPos.x - this.dragStart.x
      const dy = worldPos.y - this.dragStart.y

      for (const [id, startPos] of this.moveStartPositions) {
        let newX = startPos.x + dx
        let newY = startPos.y + dy

        // Snap to grid
        newX = this.app.grid.snap(newX)
        newY = this.app.grid.snap(newY)

        this.app.callbacks.onNodeUpdate?.(id, { x: newX, y: newY })
      }
    } else {
      // Update rubber-band
      this.app.selection.clearHoverTarget()
      this.app.selection.updateRubberBand(worldPos.x, worldPos.y)
    }
  }

  onPointerUp(e: FederatedPointerEvent): void {
    if (!this.isDragging) return

    const point = this.getGlobalPoint(e)
    const worldPos = this.app.viewport.toWorld(point.x, point.y)

    if (this.isMoving) {
      // Finish move
      this.app.callbacks.onTransformEnd?.()
    } else {
      // Finish rubber-band
      this.app.selection.endRubberBand(worldPos.x, worldPos.y)
    }

    this.isDragging = false
    this.isMoving = false
    this.moveStartPositions.clear()
    this.updateHoverAt(worldPos.x, worldPos.y)
  }

  onKeyDown(e: KeyboardEvent): void {
    // Delete/Backspace → delete selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      for (const id of [...this.app.selection.selectedIds]) {
        this.app.callbacks.onNodeDelete?.(id)
      }
      this.app.selection.clearSelection()
    }

    // Escape → deselect
    if (e.key === 'Escape') {
      this.app.selection.clearSelection()
    }

    // Arrow keys → nudge
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0

      for (const id of this.app.selection.selectedIds) {
        const obj = this.app.renderer.getObject(id)
        if (obj) {
          this.app.callbacks.onNodeUpdate?.(id, {
            x: obj.x + dx,
            y: obj.y + dy,
          })
        }
      }
      this.app.callbacks.onTransformEnd?.()
    }
  }

  private updateHoverAt(x: number, y: number): void {
    const hitId = this.app.selection.hitTest(x, y)
    this.app.selection.setHoverTarget(hitId)
  }

  private getGlobalPoint(e: FederatedPointerEvent): { x: number; y: number } {
    const x = e.global?.x ?? e.globalX
    const y = e.global?.y ?? e.globalY
    return { x, y }
  }
}
