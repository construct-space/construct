<script setup lang="ts">
/**
 * ProjectFormModal - Create/Edit project modal
 *
 * Props:
 *   open - show/hide modal
 *   project - null for create, object for edit
 *
 * Emits:
 *   update:open - modal visibility
 *   created - new project created
 *   updated - existing project updated
 */
import type { Project } from '@/stores/project'

const props = withDefaults(defineProps<{
  open: boolean
  project?: Project | null
}>(), {
  project: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [project: Project]
  updated: [project: Project]
}>()

const projectStore = useProjectStore()

const form = reactive({
  name: '',
  description: '',
})

const saving = ref(false)
const error = ref('')

const isEditing = computed(() => !!props.project)
const modalTitle = computed(() => isEditing.value ? 'Edit Project' : 'New Project')

// Reset form when modal opens or project changes
watch(() => props.open, (open) => {
  if (open) {
    form.name = props.project?.name || ''
    form.description = props.project?.description || ''
    error.value = ''
  }
})

const close = () => {
  emit('update:open', false)
}

const onSubmit = async () => {
  if (!form.name.trim()) {
    error.value = 'Project name is required'
    return
  }

  saving.value = true
  error.value = ''

  try {
    if (isEditing.value && props.project) {
      const result = await projectStore.updateProject(props.project.id, {
        name: form.name.trim(),
        description: form.description.trim(),
      })
      if (result.success && result.data) {
        emit('updated', result.data)
        close()
      } else {
        error.value = result.error || 'Failed to update project'
      }
    } else {
      const result = await projectStore.createProject({
        name: form.name.trim(),
        description: form.description.trim(),
      })
      if (result.success && result.data) {
        emit('created', result.data)
        close()
      } else {
        error.value = result.error || 'Failed to create project'
      }
    }
  } catch (e) {
    error.value = (e as Error).message || 'An error occurred'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="modalTitle"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="onSubmit">
        <!-- Error -->
        <div v-if="error" class="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-md">
          {{ error }}
        </div>

        <!-- Name -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-[var(--app-foreground)]">Name</label>
          <Input
            v-model="form.name"
            placeholder="Project name"
            required
            autofocus
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-[var(--app-foreground)]">Description</label>
          <Textarea
            v-model="form.description"
            placeholder="What is this project about?"
            :rows="3"
          />
        </div>
      </form>
    </template>

    <template #footer>
      <Button variant="ghost" color="neutral" @click="close">Cancel</Button>
      <Button :loading="saving" @click="onSubmit">
        {{ isEditing ? 'Save Changes' : 'Create Project' }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
/* Glow effect on the modal */
:deep([data-state="open"] > .fixed:not(.inset-0)) {
  border: 1px solid var(--app-accent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--app-accent) 20%, transparent),
              0 0 40px color-mix(in srgb, var(--app-accent) 10%, transparent);
}
</style>
