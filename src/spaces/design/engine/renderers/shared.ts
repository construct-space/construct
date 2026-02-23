/**
 * Shared renderer utilities for PixiJS 8
 *
 * PixiJS 8 fill/stroke API:
 *   g.rect(0, 0, w, h)   // define shape
 *   g.fill(color)         // fill it
 *   g.stroke({ ... })     // stroke it
 */
import type { Container, Graphics } from 'pixi.js'
import type { DesignNode, Gradient } from '~/types/design'

/**
 * Apply fill to a Graphics object.
 * Must be called AFTER the shape path is defined.
 */
export function applyFill(g: Graphics, node: DesignNode): void {
  const fill = node.fill
  if (fill === undefined || fill === null) {
    g.fill({ color: 0x000000, alpha: 0 })
    return
  }

  if (typeof fill === 'string') {
    // PixiJS Color cannot parse 'none', 'transparent', or empty string
    if (fill === 'none' || fill === 'transparent' || fill === '') {
      g.fill({ color: 0x000000, alpha: 0 })
      return
    }
    g.fill({ color: fill })
  } else {
    // Gradient fill
    const gradientFill = buildGradientFill(fill, node.width, node.height)
    g.fill(gradientFill)
  }
}

/**
 * Apply stroke to a Graphics object.
 * Must be called AFTER the shape path is defined and after fill.
 */
export function applyStroke(g: Graphics, node: DesignNode): void {
  if (!node.stroke || !node.strokeWidth) return

  g.stroke({
    color: node.stroke,
    width: node.strokeWidth,
    cap: node.strokeLineCap || 'butt',
    join: node.strokeLineJoin || 'miter',
    miterLimit: node.strokeMiterLimit || 4,
  })
}

/**
 * Apply common display properties to any Container/DisplayObject.
 * Position, rotation, opacity, visibility, blend mode.
 */
export function applyCommonProps(obj: Container, node: DesignNode): void {
  obj.x = node.x
  obj.y = node.y
  obj.alpha = node.opacity ?? 1
  obj.visible = node.visible !== false
  obj.angle = node.rotation ?? 0

  // Flip
  if (node.flipX) obj.scale.x = -Math.abs(obj.scale.x)
  if (node.flipY) obj.scale.y = -Math.abs(obj.scale.y)

  // Skew
  if (node.skewX) obj.skew.x = (node.skewX * Math.PI) / 180
  if (node.skewY) obj.skew.y = (node.skewY * Math.PI) / 180

  // Blend mode
  if (node.blendMode && node.blendMode !== 'normal') {
    obj.blendMode = node.blendMode as Container['blendMode']
  }

  // Interactive for selection
  obj.eventMode = 'static'
  obj.cursor = 'default'
}

/**
 * Build gradient fill descriptor for PixiJS 8.
 * Uses FillGradient from pixi.js.
 */
function buildGradientFill(gradient: Gradient, _width: number, _height: number) {
  // For now, use the first/last stop as solid color approximation
  // TODO: Use PixiJS FillGradient when available for full gradient support
  if (gradient.stops.length === 0) {
    return { color: 0x000000 }
  }

  // Use first stop color as primary fill (PixiJS 8 has limited gradient support on Graphics)
  const firstStop = gradient.stops[0]
  return { color: firstStop?.color || '#000000' }
}

/**
 * Parse a hex color string to a number.
 */
export function hexToNumber(hex: string): number {
  if (hex.startsWith('#')) hex = hex.slice(1)
  return parseInt(hex, 16)
}
