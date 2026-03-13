<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import { useDevMode } from '@/composables/useDevMode'
import { ExternalLink } from 'lucide-vue-next'

const toast = useToast()
const { disableUpdates } = useDevMode()

const appVersion = ref('')

onMounted(async () => {
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    appVersion.value = await getVersion()
  } catch {
    appVersion.value = __APP_VERSION__
  }
})

async function handleRunConstructDev() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_construct_dev')
  } catch (error) {
    toast.add({
      title: 'Construct DEV not available',
      description: String(error || 'Build Construct DEV first with tauri:build:devmode'),
      color: 'warning',
    })
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h2 class="text-lg font-semibold text-app mb-1">Developer</h2>
      <p class="text-sm text-app-muted">Tools for space development and testing</p>
    </div>

    <div class="space-y-4">
      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Construct DEV</p>
          <p class="text-xs text-app-muted">Spawn an isolated dev instance to test spaces</p>
        </div>
        <Button variant="soft" @click="handleRunConstructDev">
          <ExternalLink class="size-3.5 mr-1.5" />
          Run Construct Dev
        </Button>
      </div>

      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Disable Updates</p>
          <p class="text-xs text-app-muted">Skip update checks for local development builds</p>
        </div>
        <Switch v-model="disableUpdates" />
      </div>

      <div class="flex items-center justify-between py-3 border-b border-app">
        <div>
          <p class="text-sm font-medium text-app">Version</p>
          <p class="text-xs text-app-muted">Current app version</p>
        </div>
        <span class="text-sm text-app-muted font-mono">v{{ appVersion }}</span>
      </div>
    </div>
  </div>
</template>
