/**
 * Design Actions Composable
 *
 * Provides a reactive channel for AI-generated design actions to be
 * communicated between AssistantFloat and the UI canvas.
 *
 * IMPORTANT: This is the single source of truth for design actions.
 * Space IIFE bundles (space-design) import this via @construct/sdk
 * so both host and space share the same pendingActions ref.
 */

import type { DesignNode } from '~/types/design'

export interface DesignAction {
  type: 'create_element' | 'create_screen' | 'update_element' | 'delete_element' | 'export_element'
  element?: DesignNode
  elements?: DesignNode[]
  elementId?: string
  updates?: Partial<DesignNode>
  timestamp: number
  // Export-specific properties
  format?: 'png' | 'svg'
  scale?: 1 | 2 | 3
  filename?: string
}

// Global state for pending design actions
const pendingActions = ref<DesignAction[]>([])
let lastProcessedId = 0
let actionCounter = 0
let isConsuming = false

/**
 * Queue a design action from AI tool response
 */
export function queueDesignAction(action: Omit<DesignAction, 'timestamp'>) {
  if (isConsuming) return // Prevent queuing during consumption

  actionCounter++
  const newAction = {
    ...action,
    timestamp: actionCounter,
  }
  pendingActions.value = [...pendingActions.value, newAction]
}

/**
 * Get and clear pending design actions
 * Returns actions that haven't been processed yet
 */
export function consumeDesignActions(): DesignAction[] {
  if (isConsuming) return [] // Prevent re-entry
  isConsuming = true

  try {
    const actions = pendingActions.value.filter(
      a => a.timestamp > lastProcessedId
    )

    if (actions.length > 0) {
      lastProcessedId = Math.max(...actions.map(a => a.timestamp))
      pendingActions.value.length = 0
    }

    return actions
  } finally {
    isConsuming = false
  }
}

/**
 * Normalize element properties from snake_case to camelCase.
 * AI sends snake_case, canvas expects camelCase.
 * Also coerces numeric and boolean fields to correct types.
 */
function normalizeElement(elem: Record<string, unknown>): DesignNode {
  const normalized = { ...elem } as Record<string, unknown>

  // Convert snake_case properties to camelCase
  const snakeToCamelMap: Record<string, string> = {
    image_url: 'imageUrl',
    path_data: 'pathData',
    corner_radius: 'cornerRadius',
    stroke_width: 'strokeWidth',
    stroke_sides: 'strokeSides',
    stroke_dash_array: 'strokeDashArray',
    stroke_line_cap: 'strokeLineCap',
    stroke_line_join: 'strokeLineJoin',
    stroke_miter_limit: 'strokeMiterLimit',
    stroke_dash_offset: 'strokeDashOffset',
    stroke_uniform: 'strokeUniform',
    paint_first: 'paintFirst',
    font_size: 'fontSize',
    font_weight: 'fontWeight',
    font_family: 'fontFamily',
    font_style: 'fontStyle',
    text_sizing_mode: 'textSizingMode',
    text_resize_mode: 'textSizingMode',
    text_auto_resize: 'textSizingMode',
    text_align: 'textAlign',
    line_height: 'lineHeight',
    letter_spacing: 'letterSpacing',
    text_background_color: 'textBackgroundColor',
    text_transform: 'textTransform',
    parent_id: 'parentId',
    child_ids: 'childIds',
    z_index: 'zIndex',
    object_position_x: 'objectPositionX',
    object_position_y: 'objectPositionY',
    crop_top: 'cropTop',
    crop_right: 'cropRight',
    crop_bottom: 'cropBottom',
    crop_left: 'cropLeft',
    crop_x: 'cropX',
    crop_y: 'cropY',
    prototype_link_target: 'prototypeLinkTarget',
    prototype_link_page_id: 'prototypeLinkPageId',
    prototype_trigger: 'prototypeTrigger',
    prototype_interactions: 'prototypeInteractions',
    is_component: 'isComponent',
    component_states: 'componentStates',
    active_state_id: 'activeStateId',
    component_id: 'componentId',
    nine_slice_insets: 'nineSliceInsets',
  }
  for (const [snakeKey, camelKey] of Object.entries(snakeToCamelMap)) {
    if (!(snakeKey in normalized)) continue
    normalized[camelKey] = normalized[snakeKey]
    delete normalized[snakeKey]
  }

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.trim().replace(',', '.').replace('%', ''))
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const toBoolean = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase()
      if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true
      if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false
    }
    return null
  }

  const numericKeys = [
    'x', 'y', 'width', 'height', 'rotation', 'opacity', 'strokeWidth',
    'fontSize', 'lineHeight', 'letterSpacing', 'x2', 'y2', 'sides', 'points', 'innerRadius',
    'skewX', 'skewY', 'blur', 'strokeMiterLimit', 'strokeDashOffset',
    'objectPositionX', 'objectPositionY',
    'cropTop', 'cropRight', 'cropBottom', 'cropLeft', 'cropX', 'cropY', 'zIndex',
  ]
  for (const key of numericKeys) {
    if (!(key in normalized)) continue
    const parsed = toFiniteNumber(normalized[key])
    if (parsed !== null) {
      normalized[key] = parsed
    }
  }

  const booleanKeys = [
    'visible', 'locked', 'flipX', 'flipY', 'strokeUniform',
    'underline', 'overline', 'linethrough', 'isComponent',
  ]
  for (const key of booleanKeys) {
    if (!(key in normalized)) continue
    const parsed = toBoolean(normalized[key])
    if (parsed !== null) normalized[key] = parsed
  }

  if (normalized.strokeSides && typeof normalized.strokeSides === 'object') {
    const strokeSides = normalized.strokeSides as {
      top?: unknown
      right?: unknown
      bottom?: unknown
      left?: unknown
    }
    normalized.strokeSides = {
      top: toBoolean(strokeSides.top) ?? false,
      right: toBoolean(strokeSides.right) ?? false,
      bottom: toBoolean(strokeSides.bottom) ?? false,
      left: toBoolean(strokeSides.left) ?? false,
    }
  }

  if (Array.isArray(normalized.cornerRadius)) {
    normalized.cornerRadius = normalized.cornerRadius.map((item) => {
      const parsed = toFiniteNumber(item)
      return parsed ?? 0
    })
  } else if ('cornerRadius' in normalized) {
    const parsed = toFiniteNumber(normalized.cornerRadius)
    if (parsed !== null) normalized.cornerRadius = parsed
  }

  if (Array.isArray(normalized.strokeDashArray)) {
    normalized.strokeDashArray = normalized.strokeDashArray
      .map((item) => toFiniteNumber(item))
      .filter((item): item is number => item !== null)
  }

  return normalized as unknown as DesignNode
}

function normalizeElementUpdates(updates: Record<string, unknown>): Partial<DesignNode> {
  return normalizeElement(updates) as Partial<DesignNode>
}

/**
 * Parse tool result JSON and queue design actions
 * Returns true if the result was a design action
 */
export function parseToolResult(resultContent: string): boolean {
  try {
    const data = JSON.parse(resultContent)

    if (data.action === 'create_element' && data.element) {
      queueDesignAction({
        type: 'create_element',
        element: normalizeElement(data.element),
      })
      return true
    }

    if (data.action === 'create_screen' && data.elements) {
      queueDesignAction({
        type: 'create_screen',
        elements: (data.elements as Record<string, unknown>[]).map(normalizeElement),
      })
      return true
    }

    if (data.action === 'update_element' && data.element_id) {
      const rawUpdates = (data.updates && typeof data.updates === 'object')
        ? data.updates as Record<string, unknown>
        : {}
      queueDesignAction({
        type: 'update_element',
        elementId: data.element_id,
        updates: normalizeElementUpdates(rawUpdates),
      })
      return true
    }

    if (data.action === 'delete_element' && data.element_id) {
      queueDesignAction({
        type: 'delete_element',
        elementId: data.element_id,
      })
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Composable for consuming design actions in the canvas
 */
export function useDesignActions() {
  return {
    pendingActions: readonly(pendingActions),
    consumeDesignActions,
    queueDesignAction,
    parseToolResult,
  }
}
