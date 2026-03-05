/**
 * useDragout — Native file drag-out from Construct to Finder/Desktop
 *
 * Enables dragging files (exports, code files, documents) out of the app
 * to native file managers. Uses tauri-plugin-dragout.
 */

export function useDragout() {
  /**
   * Start a native drag operation for a file path.
   * Call this from a dragstart handler or a custom drag trigger.
   *
   * @param filePath - Absolute path to the file on disk
   * @param iconPath - Optional icon to show during drag
   */
  async function startDrag(filePath: string, iconPath?: string) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:dragout|start_drag', {
        filePath,
        iconPath: iconPath ?? '',
      })
    } catch {
      // Plugin not available or not on supported platform
    }
  }

  /**
   * Start a drag for multiple files.
   */
  async function startDragMultiple(filePaths: string[], iconPath?: string) {
    for (const fp of filePaths) {
      await startDrag(fp, iconPath)
    }
  }

  return {
    startDrag,
    startDragMultiple,
  }
}
