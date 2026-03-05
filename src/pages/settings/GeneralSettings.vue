<script setup lang="ts">
/**
 * GeneralSettings — App version, data location, storage info, autostart
 */
import { ref, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()

const appVersion = ref('1.0.0')
const dataLocation = ref(projectStore.projectsRoot || 'Not configured')
const launchAtLogin = ref(false)
const launchAtLoginLoading = ref(false)

onMounted(async () => {
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    appVersion.value = await getVersion()
  } catch {
    // Not in Tauri environment
  }
  dataLocation.value = projectStore.projectsRoot || 'Not configured'

  // Load autostart state
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart')
    launchAtLogin.value = await isEnabled()
  } catch {
    // Plugin not available
  }
})

async function toggleLaunchAtLogin() {
  launchAtLoginLoading.value = true
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart')
    if (launchAtLogin.value) {
      await disable()
      launchAtLogin.value = false
    } else {
      await enable()
      launchAtLogin.value = true
    }
  } catch (e) {
    console.error('Failed to toggle autostart:', e)
  } finally {
    launchAtLoginLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h2 class="text-lg font-semibold text-app mb-1">General</h2>
      <p class="text-sm text-app-muted">Application information and settings</p>
    </div>

    <div class="space-y-4">
      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">App Version</p>
          <p class="text-xs text-app-muted">Current installed version</p>
        </div>
        <span class="text-sm text-app-muted font-mono">v{{ appVersion }}</span>
      </div>

      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Data Location</p>
          <p class="text-xs text-app-muted">Where project data is stored</p>
        </div>
        <span class="text-sm text-app-muted font-mono truncate max-w-[280px]">{{ dataLocation }}</span>
      </div>

      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Projects</p>
          <p class="text-xs text-app-muted">Total projects in workspace</p>
        </div>
        <span class="text-sm text-app-muted">{{ projectStore.projects.length }}</span>
      </div>

      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Launch at Login</p>
          <p class="text-xs text-app-muted">Automatically start Construct when you log in</p>
        </div>
        <button
          type="button"
          :disabled="launchAtLoginLoading"
          :class="[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
            launchAtLogin ? 'bg-[var(--app-accent)]' : 'bg-[color-mix(in_srgb,var(--app-muted)_30%,transparent)]',
            launchAtLoginLoading ? 'opacity-50 cursor-wait' : ''
          ]"
          @click="toggleLaunchAtLogin"
        >
          <span
            :class="[
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              launchAtLogin ? 'translate-x-5' : 'translate-x-0'
            ]"
          />
        </button>
      </div>
    </div>
  </div>
</template>
