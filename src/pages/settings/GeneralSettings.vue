<script setup lang="ts">
/**
 * GeneralSettings — App version, data location, storage info
 */
import { ref, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()

const appVersion = ref('1.0.0')
const dataLocation = ref(projectStore.projectsRoot || 'Not configured')

onMounted(async () => {
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    appVersion.value = await getVersion()
  } catch {
    // Not in Tauri environment
  }
  dataLocation.value = projectStore.projectsRoot || 'Not configured'
})
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
    </div>
  </div>
</template>
