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
const error = ref<string | null>(null)

const AUTO_CHECK_KEY = 'construct_updater_auto_check'
const LAST_CHECK_KEY = 'construct_updater_last_check'

export function useUpdater() {
  async function checkForUpdates(): Promise<UpdateInfo | null> {
    if (!window.__TAURI__) return null

    isChecking.value = true
    error.value = null
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString())
      // Also persist to Tauri store
      import('@/composables/useTauriStore').then(({ getTauriStore }) =>
        getTauriStore().then(s => s?.set(LAST_CHECK_KEY, new Date().toISOString()))
      ).catch(() => {})

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
      error.value = String(e)
      return null
    } finally {
      isChecking.value = false
    }
  }

  async function downloadAndInstall(): Promise<boolean> {
    if (!window.__TAURI__ || !updateAvailable.value) return false

    isDownloading.value = true
    downloadProgress.value = 0
    error.value = null

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()

      if (!update) return false

      let totalLength = 0
      let downloaded = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength ?? 0
          downloaded = 0
          downloadProgress.value = 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (totalLength > 0) {
            downloadProgress.value = Math.min(Math.round((downloaded / totalLength) * 100), 100)
          }
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
      error.value = String(e)
      return false
    } finally {
      isDownloading.value = false
    }
  }

  function getAutoCheck(): boolean {
    return localStorage.getItem(AUTO_CHECK_KEY) !== 'false'
  }

  function setAutoCheck(enabled: boolean) {
    localStorage.setItem(AUTO_CHECK_KEY, String(enabled))
    import('@/composables/useTauriStore').then(({ getTauriStore }) =>
      getTauriStore().then(s => s?.set(AUTO_CHECK_KEY, String(enabled)))
    ).catch(() => {})
  }

  function getLastChecked(): Date | null {
    const raw = localStorage.getItem(LAST_CHECK_KEY)
    return raw ? new Date(raw) : null
  }

  /** Call on app startup — checks if auto-check is enabled */
  async function autoCheckOnStartup() {
    if (!getAutoCheck()) return
    await checkForUpdates()
  }

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    getAutoCheck,
    setAutoCheck,
    getLastChecked,
    autoCheckOnStartup,
  }
}
