<script setup lang="ts">
/**
 * Git Space - Git repository management
 * Uses the Git.vue component for full git functionality
 */
import { useGitRepo } from '../composables/useGitRepo'
import Git from '../components/Git.vue'

const route = useRoute()
const projectId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? id : undefined
})
const scope = computed<'company' | 'project'>(() => projectId.value ? 'project' : 'company')

const { setPageItems, setSearch, clearToolbar } = useToolbar()

// Git composable (module-level singleton, shares state with Git.vue)
const gitRepo = useGitRepo()

// Template ref to control Git.vue
const gitComponent = ref<InstanceType<typeof Git> | null>(null)

// Set up toolbar when page mounts
onMounted(() => {
  setPageItems([
    {
      id: 'git-commit',
      icon: 'i-lucide-git-commit',
      label: 'Commit',
      type: 'action',
      category: 'space',
      onClick: () => {
        if (gitComponent.value) {
          gitComponent.value.viewMode = 'changes'
        }
      }
    },
    {
      id: 'git-push',
      icon: 'i-lucide-upload',
      label: 'Push',
      type: 'action',
      category: 'space',
      onClick: async () => {
        const repo = gitRepo.currentRepo.value
        await gitRepo.push(!repo?.hasUpstream)
      }
    },
    {
      id: 'git-pull',
      icon: 'i-lucide-download',
      label: 'Pull',
      type: 'action',
      category: 'space',
      onClick: () => gitRepo.pull()
    },
    {
      id: 'git-branch',
      icon: 'i-lucide-git-branch',
      label: 'Branch',
      type: 'action',
      category: 'space',
      onClick: () => {
        if (gitComponent.value) {
          gitComponent.value.viewMode = 'branches'
        }
      }
    }
  ])

  setSearch('Search commits...', async (query) => {
    if (!query.trim()) return
    if (gitComponent.value) {
      gitComponent.value.viewMode = 'history'
    }
    const results = await gitRepo.searchCommits(query)
    if (gitComponent.value) {
      gitComponent.value.searchResults = results
    }
  })
})

onUnmounted(() => {
  clearToolbar()
})
</script>

<template>
  <div class="h-full bg-app">
    <Git ref="gitComponent" :scope="scope" :project-id="projectId" />
  </div>
</template>
