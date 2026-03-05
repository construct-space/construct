/**
 * useStatusBar — macOS NSPopover status-bar quick access
 *
 * Shows a popover from the menu bar icon with quick actions.
 * Uses tauri-plugin-nspopover on macOS via raw invoke.
 */

import { ref } from 'vue'

const isPopoverVisible = ref(false)

export function useStatusBar() {
  async function showPopover() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:nspopover|show_popover')
      isPopoverVisible.value = true
    } catch {
      // Plugin not available or not on macOS
    }
  }

  async function hidePopover() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:nspopover|hide_popover')
      isPopoverVisible.value = false
    } catch {
      // Plugin not available
    }
  }

  async function togglePopover() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const shown = await invoke<boolean>('plugin:nspopover|is_popover_shown')
      if (shown) {
        await hidePopover()
      } else {
        await showPopover()
      }
    } catch {
      // Plugin not available
    }
  }

  return {
    isPopoverVisible,
    showPopover,
    hidePopover,
    togglePopover,
  }
}
