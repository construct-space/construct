<script setup lang="ts">
/**
 * Code Space - Git
 * Git view for the currently open repository in Monaco editor
 * Shows only the repo that's loaded in the editor (single-repo mode)
 */
import { useCodeEditor } from '../composables/useCodeEditor'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => route.query.project as string)

// Get the current editor state to access rootPath
const { state: editorState, loadDirectory } = useCodeEditor()

// Current repo path from editor (the folder open in Monaco)
const currentRepoPath = computed(() => editorState.rootPath)

// Restore rootPath from localStorage if empty (page reload)
onMounted(async () => {
  if (!editorState.rootPath) {
    const storageKey = `construct-editor-${projectId.value}`
    const savedPath = localStorage.getItem(storageKey)
    if (savedPath) {
      console.log('[Git] Restoring rootPath from localStorage:', savedPath)
      await loadDirectory(savedPath)
    }
  }
})

// Navigation helper (for vue-tsc compatibility)
const goToEditor = async () => {
  await router.push({ path: '/app/code/editor', query: { project: projectId.value } })
}

// Event handlers
const handleBranchCheckout = (branch: string) => {
  console.log('Checkout branch:', branch)
}

const handleCommit = (message: string) => {
  console.log('Commit:', message)
}
</script>

<template>
  <div class="h-full w-full">
    <!-- Single repo mode: pass repoPath from editor -->
    <Git
      v-if="currentRepoPath"
      :repo-path="currentRepoPath"
      :project-id="projectId"
      @branch-checkout="handleBranchCheckout"
      @commit="handleCommit"
    />

    <!-- No repo open in editor -->
    <div v-else class="flex flex-col items-center justify-center h-full text-center p-6">
      <Icon name="i-lucide-folder-open" class="size-16 text-app-muted mb-4" />
      <h2 class="text-lg font-medium text-app mb-2">No Repository Open</h2>
      <p class="text-app-muted text-sm mb-4 max-w-md">
        Open a folder in the Code editor first to view its Git status.
      </p>
      <Button
        icon="i-lucide-code"
        label="Go to Editor"
        @click="goToEditor"
      />
    </div>
  </div>
</template>
