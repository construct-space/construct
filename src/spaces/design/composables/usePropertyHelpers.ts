/**
 * Shared helpers for property panel components
 * Handles mixed value detection for multi-selection
 */
import type { Ref } from 'vue'
import type { DesignNode } from '~/types/design'

export const MIXED = Symbol('mixed')
export type MixedValue<T> = T | typeof MIXED

export function usePropertyHelpers(selectedNodes: Ref<DesignNode[]>) {
  // Get a value from all selected nodes - returns MIXED if values differ
  function getValue<T>(getter: (node: DesignNode) => T): MixedValue<T> {
    const nodes = selectedNodes.value
    if (nodes.length === 0) return MIXED
    const firstNode = nodes[0]
    if (!firstNode) return MIXED
    const first = getter(firstNode)
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node) continue
      const val = getter(node)
      if (JSON.stringify(val) !== JSON.stringify(first)) return MIXED
    }
    return first
  }

  // Check if value is mixed
  function isMixed(v: unknown): v is typeof MIXED {
    return v === MIXED
  }

  // First selected node for single-selection features
  const firstNode = computed(() => selectedNodes.value[0] ?? null)

  // Check if all selected nodes are same type
  const allSameType = computed(() => {
    const nodes = selectedNodes.value
    if (nodes.length === 0) return false
    const first = nodes[0]
    if (!first) return false
    const type = first.type
    return nodes.every(n => n.type === type)
  })

  // Type checks
  const hasTextNode = computed(() => selectedNodes.value.some(n => n.type === 'text'))
  const hasNonTextNode = computed(() => selectedNodes.value.some(n => n.type !== 'text'))
  const hasPolygon = computed(() => selectedNodes.value.some(n => n.type === 'polygon'))
  const hasStar = computed(() => selectedNodes.value.some(n => n.type === 'star'))
  const supportsCornerRadius = computed(() =>
    selectedNodes.value.some(n => n.type === 'rectangle' || n.type === 'screen' || n.type === 'image')
  )

  return {
    getValue,
    isMixed,
    firstNode,
    allSameType,
    hasTextNode,
    hasNonTextNode,
    hasPolygon,
    hasStar,
    supportsCornerRadius
  }
}
