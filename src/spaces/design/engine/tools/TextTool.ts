/**
 * TextTool — Click to place a text node
 */
import type { FederatedPointerEvent } from 'pixi.js'
import type { Tool } from './Tool'
import type { DesignApp } from '../DesignApp'
import type { DesignNode } from '~/types/design'

export class TextTool implements Tool {
  name = 'text'
  cursor = 'text'

  private app: DesignApp

  constructor(app: DesignApp) {
    this.app = app
  }

  onActivate(): void {}
  onDeactivate(): void {}

  onPointerDown(_e: FederatedPointerEvent): void {}
  onPointerMove(_e: FederatedPointerEvent): void {}

  onPointerUp(e: FederatedPointerEvent): void {
    const world = this.app.viewport.toWorld(e.globalX, e.globalY)
    const x = this.app.grid.snap(world.x)
    const y = this.app.grid.snap(world.y)

    const node: DesignNode = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'text',
      name: 'Text',
      x,
      y,
      width: 200,
      height: 40,
      text: 'Text',
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 'normal',
      textAlign: 'left',
      fill: '#18181b',
      opacity: 1,
      visible: true,
      locked: false,
    }

    this.app.callbacks.onNodeCreate?.(node)
    this.app.selection.select(node.id)
    this.app.setTool('select')
  }
}
