// Global state for AI Assistant visibility
const isOpen = ref(false)

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
    isOpen, // Return writable ref for direct usage in templates
    open,
    close,
    toggle
  }
}
