<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { isTauriEnv } from '@/utils/tauri'
import { useAppTheme } from '@/composables/useAppTheme'

const route = useRoute()
const { initTheme } = useAppTheme()

// Check if we're in an app route (needs sidebar + toolbar)
const showSidebar = computed(() => route.path.startsWith('/app'))

// Check if running in Tauri
const isTauri = ref(false)

// Window control handlers
const handleClose = async () => {
  if (!isTauri.value) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch (e) {
    console.error('Failed to close window:', e)
  }
}

const handleMinimize = async () => {
  if (!isTauri.value) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().minimize()
  } catch (e) {
    console.error('Failed to minimize window:', e)
  }
}

const handleMaximize = async () => {
  if (!isTauri.value) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
    } else {
      await win.maximize()
    }
  } catch (e) {
    console.error('Failed to maximize window:', e)
  }
}

// Hide native traffic lights (we use custom semaphore)
const hideNativeTrafficLights = async () => {
  if (!isTauri.value) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_traffic_lights_visible', { visible: false })
  } catch (e) {
    console.error('Failed to hide traffic lights:', e)
  }
}

onMounted(() => {
  isTauri.value = isTauriEnv()

  if (isTauri.value) {
    setTimeout(() => hideNativeTrafficLights(), 100)
  }

  // Apply dark mode by default, then initialize theme from preferences
  document.documentElement.classList.add('dark')
  initTheme()
})
</script>

<template>
  <div class="bg-app text-app min-h-screen">
    <!-- Tauri semaphore (traffic lights) placeholder -->
    <div v-if="isTauri && showSidebar" class="fixed top-3 left-[10px] z-[200]">
      <!-- CommonSemaphore will go here once migrated -->
      <div class="flex gap-2">
        <button
          class="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600"
          @click="handleClose"
        />
        <button
          class="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600"
          @click="handleMinimize"
        />
        <button
          class="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600"
          @click="handleMaximize"
        />
      </div>
    </div>

    <!-- Main content -->
    <RouterView />

    <!-- Global toast notifications -->
    <Toast />
  </div>
</template>
