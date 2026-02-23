<script setup lang="ts">
/**
 * ArchitectCreateProjectModal - Create project from PRD/Tasks
 */
import type { PRDContent, TaskItem } from '../../types/architect'

const props = defineProps<{
  open: boolean
  prd?: PRDContent | null
  tasks?: TaskItem[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'create', data: { name: string; description: string; tasks: TaskItem[] }): void
}>()

const projectForm = ref({
  name: '',
  description: ''
})

const isCreating = ref(false)

// Initialize form when PRD changes
watch(() => props.prd, (prd) => {
  if (prd) {
    projectForm.value.name = prd.name
    projectForm.value.description = prd.description
  }
}, { immediate: true })

async function handleCreate() {
  if (!projectForm.value.name) return

  isCreating.value = true
  try {
    emit('create', {
      name: projectForm.value.name,
      description: projectForm.value.description,
      tasks: props.tasks || []
    })
    emit('update:open', false)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Modal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <Card>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-app">Create Project</h3>
            <Button
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              @click="emit('update:open', false)"
            />
          </div>
        </template>

        <div class="space-y-4">
          <FormField label="Project Name">
            <Input
              v-model="projectForm.name"
              placeholder="My Project"
            />
          </FormField>

          <FormField label="Description">
            <Textarea
              v-model="projectForm.description"
              placeholder="Project description..."
              :rows="3"
            />
          </FormField>

          <div v-if="tasks && tasks.length > 0" class="text-sm text-app-muted">
            <p class="font-medium mb-1">{{ tasks.length }} tasks will be created:</p>
            <ul class="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              <li v-for="(task, idx) in tasks.slice(0, 5)" :key="idx">
                {{ task.title }}
              </li>
              <li v-if="tasks.length > 5" class="text-app-muted italic">
                ... and {{ tasks.length - 5 }} more
              </li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <Button
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="emit('update:open', false)"
            />
            <Button
              label="Create Project"
              color="primary"
              :loading="isCreating"
              :disabled="!projectForm.name"
              @click="handleCreate"
            />
          </div>
        </template>
      </Card>
    </template>
  </Modal>
</template>
