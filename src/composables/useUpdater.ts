import { ref } from 'vue'

declare global {
  interface Window {
    __TAURI__?: unknown
  }
}

export interface UpdateInfo {
  version: string
  date: string
  body: string
}

const updateAvailable = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const isChecking = ref(false)
const isDownloading = ref(false)
const downloadProgress = ref(0)

export function useUpdater() {
  async function checkForUpdates(): Promise<UpdateInfo | null> {
    if (!window.__TAURI__) return null

    isChecking.value = true
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (update) {
        updateAvailable.value = true
        updateInfo.value = {
          version: update.version,
          date: update.date ?? '',
          body: update.body ?? '',
        }
        return updateInfo.value
      }

      updateAvailable.value = false
      updateInfo.value = null
      return null
    } catch (e) {
      console.error('[Updater] Check failed:', e)
      return null
    } finally {
      isChecking.value = false
    }
  }

  async function downloadAndInstall(): Promise<boolean> {
    if (!window.__TAURI__ || !updateAvailable.value) return false

    isDownloading.value = true
    downloadProgress.value = 0

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) return false

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          downloadProgress.value = 0
        } else if (event.event === 'Progress') {
          downloadProgress.value = event.data.chunkLength
        } else if (event.event === 'Finished') {
          downloadProgress.value = 100
        }
      })

      // Restart the app
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()

      return true
    } catch (e) {
      console.error('[Updater] Download/install failed:', e)
      return false
    } finally {
      isDownloading.value = false
    }
  }

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    checkForUpdates,
    downloadAndInstall,
  }
}
