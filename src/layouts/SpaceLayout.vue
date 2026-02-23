<script setup lang="ts">
/**
 * SpaceLayout — Replaces ProjectLayout
 *
 * Reads ?project= from route query, opens the project in the store,
 * and provides project context to child space pages.
 * Preserves project query param in navigation.
 */
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { watch, onMounted, onUnmounted } from 'vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const openProjectFromQuery = () => {
  const projectPath = route.query.project
  if (typeof projectPath === 'string' && projectPath) {
    // Only open if different from current
    if (!projectStore.currentProject || projectStore.currentProject.path !== projectPath) {
      projectStore.openProject(projectPath)
    }
  }
}

onMounted(() => {
  openProjectFromQuery()
})

// Watch for query changes (e.g., switching projects within a space)
watch(() => route.query.project, () => {
  openProjectFromQuery()
})

// Cleanup: clear project on unmount
onUnmounted(() => {
  projectStore.clearCurrentProject()
})
</script>

<template>
  <RouterView />
</template>
