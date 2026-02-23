/**
 * HandTool — Pan the viewport
 * Activated via spacebar hold or tool selection.
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'

export class HandTool implements Tool {
  name = 'hand'
  cursor = 'grab'

  private app: DesignApp

  constructor(app: DesignApp) {
    this.app = app
  }

  onActivate(): void {
    // Enable full viewport drag
    this.app.viewport.drag({})
  }

  onDeactivate(): void {
    // Restore middle-click only drag
    this.app.viewport.drag({ mouseButtons: 'middle' })
  }

  onPointerDown(_e: FederatedPointerEvent): void {
    this.cursor = 'grabbing'
  }

  onPointerMove(_e: FederatedPointerEvent): void {}

  onPointerUp(_e: FederatedPointerEvent): void {
    this.cursor = 'grab'
  }
}
