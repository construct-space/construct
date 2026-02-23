// Global state for Chat panel visibility
const isOpen = ref(false)
const isPinned = ref(false)

const CHAT_PIN_STORAGE_KEY = 'construct-chat-panel-pinned'
const CHAT_PINNED_WIDTH = 384

let initialized = false

function initChatPanelState() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  try {
    isPinned.value = localStorage.getItem(CHAT_PIN_STORAGE_KEY) === '1'
    if (isPinned.value) {
      isOpen.value = true
    }
  } catch (error) {
    console.warn('[ChatPanel] Failed to restore pinned state:', error)
  }
}

function persistPinnedState() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CHAT_PIN_STORAGE_KEY, isPinned.value ? '1' : '0')
  } catch (error) {
    console.warn('[ChatPanel] Failed to persist pinned state:', error)
  }
}

export function useChatPanel() {
  initChatPanelState()

  const setPinned = (value: boolean) => {
    isPinned.value = value
    if (value) {
      isOpen.value = true
    }
    persistPinnedState()
  }

  const open = () => {
    isOpen.value = true
  }

  const close = () => {
    isOpen.value = false
    if (isPinned.value) {
      setPinned(false)
    }
  }

  const toggle = () => {
    if (isPinned.value) {
      close()
      return
    }
    isOpen.value = !isOpen.value
  }

  return {
    isOpen, // Return writable ref for direct usage in templates
    isPinned,
    pinnedWidth: CHAT_PINNED_WIDTH,
    pinnedOffset: computed(() => isPinned.value ? CHAT_PINNED_WIDTH : 0),
    open,
    close,
    toggle,
    setPinned,
    togglePinned: () => setPinned(!isPinned.value),
  }
}
