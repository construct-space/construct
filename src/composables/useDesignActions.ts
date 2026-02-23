/**
 * Design Actions Composable
 *
 * Provides a reactive channel for AI-generated design actions to be
 * communicated between AssistantFloat and the UI canvas.
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
 * Normalize element properties from snake_case to camelCase
 * AI sends snake_case, canvas expects camelCase
 */
function normalizeElement(elem: Record<string, unknown>): DesignNode {
  const normalized = { ...elem } as Record<string, unknown>

  // Convert snake_case properties to camelCase
  if ('image_url' in normalized) {
    normalized.imageUrl = normalized.image_url
    delete normalized.image_url
  }
  if ('path_data' in normalized) {
    normalized.pathData = normalized.path_data
    delete normalized.path_data
  }
  if ('corner_radius' in normalized) {
    normalized.cornerRadius = normalized.corner_radius
    delete normalized.corner_radius
  }
  if ('stroke_width' in normalized) {
    normalized.strokeWidth = normalized.stroke_width
    delete normalized.stroke_width
  }
  if ('font_size' in normalized) {
    normalized.fontSize = normalized.font_size
    delete normalized.font_size
  }
  if ('font_weight' in normalized) {
    normalized.fontWeight = normalized.font_weight
    delete normalized.font_weight
  }
  if ('text_align' in normalized) {
    normalized.textAlign = normalized.text_align
    delete normalized.text_align
  }
  if ('parent_id' in normalized) {
    normalized.parentId = normalized.parent_id
    delete normalized.parent_id
  }

  return normalized as unknown as DesignNode
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
      queueDesignAction({
        type: 'update_element',
        elementId: data.element_id,
        updates: data.updates,
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
