/**
 * RectRenderer — DesignNode(rectangle) → PixiJS Graphics
 */
import { Graphics } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyFill, applyStroke, applyCommonProps } from './shared'

export function createRect(node: DesignNode): Graphics {
  const g = new Graphics()
  g.label = node.id
  updateRect(g, node)
  return g
}

export function updateRect(g: Graphics, node: DesignNode): void {
  g.clear()

  const w = node.width
  const h = node.height
  const cr = node.cornerRadius

  // Draw shape
  if (cr) {
    if (Array.isArray(cr)) {
      g.roundRect(0, 0, w, h, 0)
      // PixiJS 8 roundRect doesn't support per-corner radii directly
      // We draw with SVG path for per-corner radii
      const [tl, tr, br, bl] = cr
      g.clear()
      drawRoundedRectPath(g, w, h, tl, tr, br, bl)
    } else {
      g.roundRect(0, 0, w, h, cr)
    }
  } else {
    g.rect(0, 0, w, h)
  }

  applyFill(g, node)
  applyStroke(g, node)
  applyCommonProps(g, node)
}

function drawRoundedRectPath(
  g: Graphics,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): void {
  g.moveTo(tl, 0)
  g.lineTo(w - tr, 0)
  if (tr > 0) g.arcTo(w, 0, w, tr, tr)
  else g.lineTo(w, 0)

  g.lineTo(w, h - br)
  if (br > 0) g.arcTo(w, h, w - br, h, br)
  else g.lineTo(w, h)

  g.lineTo(bl, h)
  if (bl > 0) g.arcTo(0, h, 0, h - bl, bl)
  else g.lineTo(0, h)

  g.lineTo(0, tl)
  if (tl > 0) g.arcTo(0, 0, tl, 0, tl)
  else g.lineTo(0, 0)

  g.closePath()
}
