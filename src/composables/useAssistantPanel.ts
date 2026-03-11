/**
 * useAssistantPanel — Panel positioning, drag-to-move, resize, and dock logic
 * for the AI Assistant floating panel.
 *
 * Extracted from AssistantFloat.vue.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { PanelPosition } from '~/types/assistant'

export function useAssistantPanel() {
  // Panel position
  const savedPosition = (typeof window !== 'undefined' && localStorage.getItem('construct_assistant_position') as PanelPosition) || 'bottom-center'
  // Reset floating to bottom-center — floating without a saved offset lands at 0,0 (top-left)
  const panelPosition = ref<PanelPosition>(savedPosition === 'floating' ? 'bottom-center' : savedPosition)
  const floatingPos = reactive({ x: 0, y: 0 })
  const isDraggingPanel = ref(false)
  const showDockMenu = ref(false)
  const panelRef = ref<HTMLElement | null>(null)
  let dragOffset = { x: 0, y: 0 }

  // Resize state
  const panelSize = reactive({
    width: parseInt(localStorage.getItem('construct_assistant_w') || '0') || 0,
    height: parseInt(localStorage.getItem('construct_assistant_h') || '0') || 0,
  })
  const isResizing = ref(false)
  let resizeEdge = '' // 'right', 'bottom', 'corner'
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 }

  // Dock logic
  const wantsDocked = computed(() => ['left', 'right', 'bottom'].includes(panelPosition.value))
  const dockTargetEl = ref<HTMLElement | null>(null)
  const isDocked = computed(() => wantsDocked.value && dockTargetEl.value !== null)

  function resolveDockTarget(): HTMLElement | null {
    switch (panelPosition.value) {
      case 'left': return document.getElementById('assistant-dock-left')
      case 'right': return document.getElementById('assistant-dock-right')
      case 'bottom': return document.getElementById('assistant-dock-bottom')
      default: return null
    }
  }

  watch(panelPosition, () => {
    if (wantsDocked.value) {
      nextTick(() => {
        requestAnimationFrame(() => {
          dockTargetEl.value = resolveDockTarget()
        })
      })
    } else {
      dockTargetEl.value = null
    }
  }, { immediate: true })

  const panelPositionClasses = computed(() => {
    switch (panelPosition.value) {
      case 'left':
        return 'w-[420px] h-full border-r border-gray-200/50 dark:border-gray-800/50'
      case 'right':
        return 'w-[420px] h-full border-l border-gray-200/50 dark:border-gray-800/50'
      case 'bottom':
        return 'w-full h-[350px] border-t border-gray-200/50 dark:border-gray-800/50'
      case 'floating':
        return 'fixed w-[50vw] min-w-[420px] max-w-[800px]'
      case 'bottom-center':
      default:
        return 'fixed bottom-6 left-[calc(50%+36px)] -translate-x-1/2 w-[50vw] min-w-[420px] max-w-[800px]'
    }
  })

  const panelStyle = computed(() => {
    const style: Record<string, string> = {}
    if (panelPosition.value === 'floating') {
      style.left = `${floatingPos.x}px`
      style.top = `${floatingPos.y}px`
    }
    if (!isDocked.value) {
      if (panelSize.width) {
        style.width = `${panelSize.width}px`
        style.minWidth = '380px'
        style.maxWidth = `${window.innerWidth - 32}px`
      }
      if (panelSize.height) {
        style.height = `${panelSize.height}px`
      }
    }
    return style
  })

  function savePanelPosition() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('construct_assistant_position', panelPosition.value)
    }
  }

  function setPanelPosition(pos: PanelPosition) {
    panelPosition.value = pos
    savePanelPosition()
  }

  function startPanelDrag(e: MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const panel = panelRef.value
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    if (panelPosition.value !== 'floating') {
      floatingPos.x = rect.left
      floatingPos.y = rect.top
      panelPosition.value = 'floating'
    }
    dragOffset = { x: e.clientX - floatingPos.x, y: e.clientY - floatingPos.y }
    isDraggingPanel.value = true
    document.addEventListener('mousemove', onPanelDrag)
    document.addEventListener('mouseup', stopPanelDrag)
  }

  function onPanelDrag(e: MouseEvent) {
    if (!isDraggingPanel.value) return
    const panel = panelRef.value
    const pw = panel?.offsetWidth || 420
    const ph = panel?.offsetHeight || 400
    floatingPos.x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - pw))
    floatingPos.y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - ph))
  }

  function stopPanelDrag() {
    isDraggingPanel.value = false
    document.removeEventListener('mousemove', onPanelDrag)
    document.removeEventListener('mouseup', stopPanelDrag)
    const threshold = 50
    const pw = panelRef.value?.offsetWidth || 420
    if (floatingPos.x < threshold) {
      setPanelPosition('left')
    } else if (floatingPos.x + pw > window.innerWidth - threshold) {
      setPanelPosition('right')
    } else if (floatingPos.y + 200 > window.innerHeight - threshold) {
      setPanelPosition('bottom')
    } else {
      savePanelPosition()
    }
  }

  // Resize handlers
  function startResize(e: MouseEvent, edge: string) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.value
    if (!panel) return
    resizeEdge = edge
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: panel.offsetWidth,
      h: panel.offsetHeight,
    }
    isResizing.value = true
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
  }

  function onResize(e: MouseEvent) {
    if (!isResizing.value) return
    const dx = e.clientX - resizeStart.x
    const dy = e.clientY - resizeStart.y
    const minW = 380
    const maxW = window.innerWidth - 32
    const minH = 300
    const maxH = window.innerHeight - 32

    if (resizeEdge === 'right' || resizeEdge === 'corner') {
      panelSize.width = Math.max(minW, Math.min(resizeStart.w + dx, maxW))
    }
    if (resizeEdge === 'bottom' || resizeEdge === 'corner') {
      panelSize.height = Math.max(minH, Math.min(resizeStart.h + dy, maxH))
    }
  }

  function stopResize() {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
    if (panelSize.width) localStorage.setItem('construct_assistant_w', String(panelSize.width))
    if (panelSize.height) localStorage.setItem('construct_assistant_h', String(panelSize.height))
  }

  /** Remove all global event listeners (call in onUnmounted) */
  function cleanupListeners() {
    document.removeEventListener('mousemove', onPanelDrag)
    document.removeEventListener('mouseup', stopPanelDrag)
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }

  return {
    panelPosition,
    floatingPos,
    isDraggingPanel,
    showDockMenu,
    panelRef,
    panelSize,
    isResizing,
    wantsDocked,
    dockTargetEl,
    isDocked,
    panelPositionClasses,
    panelStyle,
    setPanelPosition,
    startPanelDrag,
    startResize,
    resolveDockTarget,
    cleanupListeners,
  }
}
