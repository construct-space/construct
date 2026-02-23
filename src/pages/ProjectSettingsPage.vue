<script setup lang="ts">
/**
 * ProjectSettingsPage - construct-mono style
 *
 * Two-column layout:
 *   Left  (1/3): back button + "BASECODE:PROJECTNAME SETTINGS", vertically centered
 *   Right (2/3): settings form — name, description, spaces, danger zone
 */
import { getSpace, spaces as allSpacesConfig } from '@/config/spaces'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const authStore = useAuthStore()

const companyName = computed(() => {
  const name = (authStore.user as any)?.company?.name || 'BASECODE'
  return name.toUpperCase()
})

const projectId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? parseInt(id, 10) : null
})

const project = computed(() => projectStore.currentProject)

// All available space IDs
const allSpaceIds = Object.keys(allSpacesConfig)

// Form state
const form = reactive({
  name: '',
  description: '',
  spaces: [] as string[],
})

const saving = ref(false)
const error = ref('')
const success = ref('')

watch(project, (p) => {
  if (p) {
    form.name = p.name
    form.description = p.description || ''
    form.spaces = [...(p.spaces || [])]
  }
}, { immediate: true })

onMounted(async () => {
  if (projectId.value && (!project.value || project.value.id !== projectId.value)) {
    await projectStore.fetchProject(projectId.value)
  }
})

const toggleSpace = (spaceId: string) => {
  const idx = form.spaces.indexOf(spaceId)
  if (idx !== -1) {
    form.spaces.splice(idx, 1)
  } else {
    form.spaces.push(spaceId)
  }
}

const saveSettings = async () => {
  if (!projectId.value || !form.name.trim()) return

  saving.value = true
  error.value = ''
  success.value = ''

  const result = await projectStore.updateProject(projectId.value, {
    name: form.name.trim(),
    description: form.description.trim(),
    spaces: form.spaces,
  })

  saving.value = false

  if (result.success) {
    success.value = 'Settings saved'
    setTimeout(() => { success.value = '' }, 3000)
  } else {
    error.value = (result as any).error || 'Failed to save settings'
  }
}

const deleteProject = async () => {
  if (!projectId.value || !project.value) return
  if (!confirm(`Are you sure you want to delete "${project.value.name}"? This cannot be undone.`)) return

  await projectStore.updateProject(projectId.value, { deleted_at: new Date().toISOString() } as any)
  router.push('/app/projects')
}

const goBack = () => {
  if (projectId.value) {
    router.push(`/app/projects/${projectId.value}`)
  }
}
</script>

<template>
  <div class="h-full flex">
    <!-- LEFT COLUMN (1/3) — branding, vertically centered -->
    <div class="w-1/3 flex flex-col items-start justify-center shrink-0 px-6">
      <template v-if="project">
        <button
          class="w-7 h-7 flex items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-muted)] hover:text-[var(--app-foreground)] hover:border-[var(--app-foreground)] transition-colors shrink-0 mb-6"
          title="Back to project"
          @click="goBack"
        >
          <Icon name="i-lucide-arrow-left" class="size-3.5" />
        </button>
        <p class="text-lg tracking-wide select-none">
          <span class="text-[var(--app-muted)] font-normal">{{ companyName }}:</span><span class="font-bold text-[var(--app-foreground)]">{{ project.name.toUpperCase() }}</span>
        </p>
        <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest mt-1">Settings</p>
      </template>
    </div>

    <!-- RIGHT COLUMN (2/3) — settings form -->
    <div class="w-2/3 flex-1 overflow-auto py-10 pr-10">
      <!-- Messages -->
      <div v-if="error" class="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded mb-4">{{ error }}</div>
      <div v-if="success" class="text-sm text-emerald-400 bg-emerald-400/10 px-3 py-2 rounded mb-4">{{ success }}</div>

      <form class="space-y-8" @submit.prevent="saveSettings">
        <!-- Name -->
        <div>
          <label class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium block mb-2">Project Name</label>
          <input
            v-model="form.name"
            type="text"
            required
            class="w-full max-w-md h-9 px-3 text-sm rounded border border-[var(--app-border)] bg-transparent text-[var(--app-foreground)] placeholder:text-[var(--app-muted)]/50 outline-none focus:border-[var(--app-accent)]"
            placeholder="Project name"
          />
        </div>

        <!-- Description -->
        <div>
          <label class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium block mb-2">Description</label>
          <textarea
            v-model="form.description"
            rows="3"
            class="w-full max-w-lg px-3 py-2 text-sm rounded border border-[var(--app-border)] bg-transparent text-[var(--app-foreground)] placeholder:text-[var(--app-muted)]/50 outline-none focus:border-[var(--app-accent)] resize-none"
            placeholder="Project description"
          />
        </div>

        <!-- Spaces -->
        <div>
          <label class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium block mb-4">Enabled Spaces</label>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              v-for="spaceId in allSpaceIds"
              :key="spaceId"
              type="button"
              class="flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left"
              :class="form.spaces.includes(spaceId)
                ? 'border-[var(--app-accent)]/40 bg-white/[0.04]'
                : 'border-[var(--app-border)] bg-transparent hover:bg-white/[0.02]'"
              @click="toggleSpace(spaceId)"
            >
              <Icon
                :name="getSpace(spaceId).icon"
                class="size-5 shrink-0"
                :class="form.spaces.includes(spaceId) ? getSpace(spaceId).color : 'text-[var(--app-muted)]/40'"
              />
              <div class="flex-1 min-w-0">
                <h3
                  class="text-sm font-semibold uppercase tracking-wide"
                  :class="form.spaces.includes(spaceId) ? 'text-[var(--app-foreground)]' : 'text-[var(--app-muted)]'"
                >
                  {{ getSpace(spaceId).label }}
                </h3>
                <p class="text-[10px] text-[var(--app-muted)] truncate">
                  {{ getSpace(spaceId).description }}
                </p>
              </div>
              <div
                class="size-4 rounded border shrink-0 flex items-center justify-center"
                :class="form.spaces.includes(spaceId)
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent)]'
                  : 'border-[var(--app-border)]'"
              >
                <Icon v-if="form.spaces.includes(spaceId)" name="i-lucide-check" class="size-3 text-white" />
              </div>
            </button>
          </div>
        </div>

        <!-- Save -->
        <button
          type="submit"
          :disabled="saving"
          class="h-9 px-5 rounded text-sm font-medium bg-[var(--app-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {{ saving ? 'Saving...' : 'Save Settings' }}
        </button>
      </form>

      <!-- Danger zone -->
      <div class="mt-16 pt-8 border-t border-[var(--app-border)]">
        <p class="text-xs text-red-400 uppercase tracking-widest font-medium mb-3">Danger Zone</p>
        <p class="text-sm text-[var(--app-muted)] mb-4">
          Deleting a project is permanent and cannot be undone. All project data will be removed.
        </p>
        <button
          class="h-9 px-4 rounded text-sm font-medium border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-2"
          @click="deleteProject"
        >
          <Icon name="i-lucide-trash-2" class="size-4" />
          Delete Project
        </button>
      </div>
    </div>
  </div>
</template>
