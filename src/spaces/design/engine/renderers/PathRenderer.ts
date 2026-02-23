/**
 * PathRenderer — DesignNode(path) → PixiJS Graphics
 * Renders SVG path data using PixiJS Graphics API
 */
import { Graphics } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyFill, applyStroke, applyCommonProps } from './shared'

export function createPath(node: DesignNode): Graphics {
  const g = new Graphics()
  g.label = node.id
  updatePath(g, node)
  return g
}

export function updatePath(g: Graphics, node: DesignNode): void {
  g.clear()

  if (node.pathData) {
    // PixiJS 8 Graphics.svg() expects a full SVG string, not just path data.
    // Wrap raw path data in an SVG <path> element.
    const data = node.pathData.trim()

    // Skip empty or clearly invalid path data
    if (data && /[A-Za-z]/.test(data)) {
      let svgString: string
      if (data.startsWith('<svg') || data.startsWith('<path')) {
        // Already an SVG element — wrap if needed
        svgString = data.startsWith('<svg') ? data : `<svg xmlns="http://www.w3.org/2000/svg"><${data.startsWith('<path') ? data : `path d="${data}"`}/></svg>`
      } else {
        // Raw path data (e.g. "M 0 0 L 100 100") — wrap in SVG
        svgString = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${data}"/></svg>`
      }
      try {
        g.svg(svgString)
      } catch {
        // Silently ignore malformed path data — nothing useful to render
      }
    }
  }

  applyFill(g, node)
  applyStroke(g, node)
  applyCommonProps(g, node)
}
