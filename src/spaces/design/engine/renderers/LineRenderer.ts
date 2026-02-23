/**
 * LineRenderer — DesignNode(line/arrow) → PixiJS Graphics
 */
import { Graphics } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyStroke, applyCommonProps } from './shared'

export function createLine(node: DesignNode): Graphics {
  const g = new Graphics()
  g.label = node.id
  updateLine(g, node)
  return g
}

export function updateLine(g: Graphics, node: DesignNode): void {
  g.clear()

  // Line goes from (0,0) to (x2-x, y2-y) relative to node position
  const dx = (node.x2 ?? node.width) - node.x
  const dy = (node.y2 ?? 0) - node.y

  g.moveTo(0, 0)
  g.lineTo(dx, dy)

  applyStroke(g, node)

  // Draw arrowhead for arrow type
  if (node.type === 'arrow') {
    drawArrowhead(g, 0, 0, dx, dy, node.strokeWidth || 2)
  }

  applyCommonProps(g, node)
}

function drawArrowhead(
  g: Graphics,
  _x1: number,
  _y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
): void {
  const headLen = Math.max(10, strokeWidth * 4)
  const angle = Math.atan2(y2, x2)
  const a1 = angle - Math.PI / 6
  const a2 = angle + Math.PI / 6

  g.moveTo(x2, y2)
  g.lineTo(x2 - headLen * Math.cos(a1), y2 - headLen * Math.sin(a1))
  g.moveTo(x2, y2)
  g.lineTo(x2 - headLen * Math.cos(a2), y2 - headLen * Math.sin(a2))
}
