<script setup lang="ts">
/**
 * Code Space - Terminal
 * Full-screen terminal emulator for current project
 */
import Terminal from '../../terminal/components/Terminal.vue'

const projectStore = useProjectStore()
const isMounted = ref(false)

// Get project working directory - use code subfolder
const workingDir = computed(() => {
  const localPath = projectStore.currentProject?.local_path
  return localPath ? `${localPath}/code` : undefined
})

onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <div class="h-full w-full" style="background: var(--app-background)">
    <Terminal v-if="isMounted" :cwd="workingDir" />
    <div v-else class="h-full flex items-center justify-center" style="background: var(--app-background)">
      <div class="flex items-center gap-2" style="color: var(--app-muted)">
        <Icon name="i-lucide-loader-2" class="size-5 animate-spin" />
        <span>Loading terminal...</span>
      </div>
    </div>
  </div>
</template>
