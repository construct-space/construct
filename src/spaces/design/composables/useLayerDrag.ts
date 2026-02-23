/**
 * useLayerDrag - Pointer-event based drag and drop for layer reordering/reparenting.
 *
 * HTML5 drag events (draggable/dragstart/dragover/drop) don't fire reliably in
 * Tauri's WKWebView on macOS. This implementation uses pointer events instead,
 * which work everywhere.
 */
import { ref, onUnmounted } from 'vue'

export type DropPosition = 'before' | 'after' | 'inside' | null

/** Minimum px of movement before a pointerdown becomes a drag. */
const DRAG_THRESHOLD = 4

export function useLayerDrag() {
  const draggedId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)
  const dropPosition = ref<DropPosition>(null)

  // Internal tracking for the pointer-based drag lifecycle.
  let _pending = false // pointerdown happened, waiting for threshold
  let _active = false // threshold exceeded, drag is live
  let _startX = 0
  let _startY = 0
  let _pendingNodeId: string | null = null

  // ── public helpers ──────────────────────────────────────────────

  function isDragging(nodeId: string) {
    return draggedId.value === nodeId
  }

  function isDropTarget(nodeId: string, position: DropPosition) {
    return dropTargetId.value === nodeId && dropPosition.value === position
  }

  // ── pointer lifecycle ───────────────────────────────────────────

  /**
   * Call from @pointerdown on each layer row.
   * We don't immediately enter drag mode — we wait until the pointer moves
   * past DRAG_THRESHOLD so that normal clicks still work.
   */
  function onPointerDown(e: PointerEvent, nodeId: string) {
    // Only primary button
    if (e.button !== 0) return
    // Ignore clicks on interactive children (buttons, inputs, icons with click handlers)
    const target = e.target as HTMLElement
    if (target.closest('button, input, [data-no-drag]')) return

    _pending = true
    _pendingNodeId = nodeId
    _startX = e.clientX
    _startY = e.clientY

    document.addEventListener('pointermove', _onPointerMove)
    document.addEventListener('pointerup', _onPointerUp)
  }

  function _onPointerMove(e: PointerEvent) {
    if (_pending && !_active) {
      const dx = e.clientX - _startX
      const dy = e.clientY - _startY
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return

      // Threshold exceeded — activate drag.
      _active = true
      draggedId.value = _pendingNodeId
    }

    if (!_active) return

    // Update drop target from pointer position.
    // The panel component is responsible for calling updateDropTarget() with the
    // current clientY and the container element reference.  We emit a custom
    // event on document that the panel listens for.
    document.dispatchEvent(new CustomEvent('layer-drag-move', { detail: { clientX: e.clientX, clientY: e.clientY } }))
  }

  function _onPointerUp(_e: PointerEvent) {
    const wasDragging = _active

    // Remove listeners first, but don't reset _active yet.
    _pending = false
    _pendingNodeId = null
    document.removeEventListener('pointermove', _onPointerMove)
    document.removeEventListener('pointerup', _onPointerUp)
    _active = false

    if (wasDragging) {
      // The panel reads draggedId / dropTargetId / dropPosition to execute the
      // drop, then calls reset().
      document.dispatchEvent(new CustomEvent('layer-drag-drop'))
    } else {
      // Never exceeded threshold — this was just a click.
      _reset()
    }
  }

  function _cleanup() {
    _pending = false
    _active = false
    _pendingNodeId = null
    document.removeEventListener('pointermove', _onPointerMove)
    document.removeEventListener('pointerup', _onPointerUp)
  }

  /** Reset all drag state. Called by the panel after processing the drop. */
  function reset() {
    _cleanup()
    _reset()
  }

  function _reset() {
    draggedId.value = null
    dropTargetId.value = null
    dropPosition.value = null
  }

  // ── legacy API aliases (keep the same return shape) ─────────────

  /** @deprecated kept for compatibility – prefer onPointerDown */
  function onDragStart(e: DragEvent, nodeId: string) {
    draggedId.value = nodeId
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', nodeId)
    }
  }

  function onDragEnd() {
    reset()
  }

  onUnmounted(() => {
    _cleanup()
  })

  return {
    draggedId,
    dropTargetId,
    dropPosition,
    onPointerDown,
    onDragStart,
    onDragEnd,
    reset,
    isDragging,
    isDropTarget,
  }
}
