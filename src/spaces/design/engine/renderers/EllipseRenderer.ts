/**
 * EllipseRenderer — DesignNode(ellipse) → PixiJS Graphics
 */
import { Graphics } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyFill, applyStroke, applyCommonProps } from './shared'

export function createEllipse(node: DesignNode): Graphics {
  const g = new Graphics()
  g.label = node.id
  updateEllipse(g, node)
  return g
}

export function updateEllipse(g: Graphics, node: DesignNode): void {
  g.clear()

  const rx = node.width / 2
  const ry = node.height / 2

  g.ellipse(rx, ry, rx, ry)

  applyFill(g, node)
  applyStroke(g, node)
  applyCommonProps(g, node)
}
