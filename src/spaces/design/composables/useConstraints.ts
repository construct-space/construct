/**
 * useConstraints - Pure constraint transform math for Figma-like component resizing
 *
 * No Fabric/Vue dependency. Used by useComponents to apply constraint-aware
 * transforms when instances are resized relative to their master.
 */
import type { Constraints, NineSliceInsets } from '~/types/design'

/**
 * Apply constraint-based transform to a child when its parent changes size.
 *
 * Each axis is resolved independently:
 * - left/top: position & size unchanged
 * - right/bottom: pinned to far edge (distance from edge preserved)
 * - center: center ratio preserved, size unchanged
 * - scale: position & size scale proportionally
 * - leftAndRight/topAndBottom: both edges pinned, size stretches
 */
export function applyConstraintTransform(
  child: { x: number; y: number; width: number; height: number },
  constraints: Constraints,
  oldParentW: number, oldParentH: number,
  newParentW: number, newParentH: number
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = child

  // Horizontal axis
  switch (constraints.horizontal) {
    case 'left':
      // unchanged
      break
    case 'right': {
      // Distance from right edge preserved
      const distFromRight = oldParentW - (x + width)
      x = newParentW - width - distFromRight
      break
    }
    case 'center': {
      // Center ratio preserved, size unchanged
      const centerRatio = (x + width / 2) / oldParentW
      x = centerRatio * newParentW - width / 2
      break
    }
    case 'scale': {
      // Position & size scale proportionally
      const scaleX = newParentW / oldParentW
      x = x * scaleX
      width = width * scaleX
      break
    }
    case 'leftAndRight': {
      // Both edges pinned, size stretches
      const distFromRight = oldParentW - (x + width)
      width = newParentW - x - distFromRight
      break
    }
  }

  // Vertical axis
  switch (constraints.vertical) {
    case 'top':
      // unchanged
      break
    case 'bottom': {
      const distFromBottom = oldParentH - (y + height)
      y = newParentH - height - distFromBottom
      break
    }
    case 'center': {
      const centerRatio = (y + height / 2) / oldParentH
      y = centerRatio * newParentH - height / 2
      break
    }
    case 'scale': {
      const scaleY = newParentH / oldParentH
      y = y * scaleY
      height = height * scaleY
      break
    }
    case 'topAndBottom': {
      const distFromBottom = oldParentH - (y + height)
      height = newParentH - y - distFromBottom
      break
    }
  }

  return { x, y, width, height }
}

/**
 * Classify a child into one of 9 zones based on its center point and parent insets.
 * Maps each zone to appropriate constraints for Figma-style 9-slice behavior.
 *
 * The 9 zones:
 * ┌─────┬────────┬─────┐
 * │ TL  │   T    │ TR  │
 * ├─────┼────────┼─────┤
 * │  L  │ Center │  R  │
 * ├─────┼────────┼─────┤
 * │ BL  │   B    │ BR  │
 * └─────┴────────┴─────┘
 */
export function classifyChildForNineSlice(
  child: { x: number; y: number; width: number; height: number },
  parentWidth: number, parentHeight: number,
  insets: NineSliceInsets
): Constraints {
  const cx = child.x + child.width / 2
  const cy = child.y + child.height / 2

  // Determine horizontal zone
  let horizontal: Constraints['horizontal']
  if (cx < insets.left) {
    horizontal = 'left'
  } else if (cx > parentWidth - insets.right) {
    horizontal = 'right'
  } else {
    horizontal = 'leftAndRight' // Center zone stretches
  }

  // Determine vertical zone
  let vertical: Constraints['vertical']
  if (cy < insets.top) {
    vertical = 'top'
  } else if (cy > parentHeight - insets.bottom) {
    vertical = 'bottom'
  } else {
    vertical = 'topAndBottom' // Center zone stretches
  }

  return { horizontal, vertical }
}
