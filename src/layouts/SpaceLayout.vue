<script setup lang="ts">
/**
 * SpaceLayout — Replaces ProjectLayout
 *
 * Reads ?project= from route query, opens the project in the store,
 * and provides project context to child space pages.
 * Preserves project query param across space navigation.
 *
 * NOTE: Does NOT clear project on unmount — the project persists
 * when switching between spaces via sidebar. This is intentional:
 * the user's project context should carry over.
 */
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { watch, onMounted } from 'vue'

const route = useRoute()
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
</script>

<template>
  <RouterView />
</template>
