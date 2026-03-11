import { ref } from 'vue'

// Global state for AI Assistant visibility
const isOpen = ref(false)
const isPoppedOut = ref(false)

export function useAssistant() {
  const open = () => {
    isOpen.value = true
  }

  const close = () => {
    isOpen.value = false
  }

  const toggle = () => {
    isOpen.value = !isOpen.value
  }

  return {
    isOpen,
    isPoppedOut,
    open,
    close,
    toggle,
  }
}
