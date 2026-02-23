<script setup lang="ts">
/**
 * GitCloneModal - Modal for cloning a repository
 */
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  clone: [url: string, name?: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const cloneUrl = ref('')
const repoName = ref('')

// Handle clone
const handleClone = () => {
  if (!cloneUrl.value) return
  emit('clone', cloneUrl.value, repoName.value || undefined)
  resetForm()
}

// Handle cancel
const handleCancel = () => {
  isOpen.value = false
  resetForm()
}

// Reset form
const resetForm = () => {
  cloneUrl.value = ''
  repoName.value = ''
}
</script>

<template>
  <Modal v-model:open="isOpen">
    <template #content>
      <div class="p-4 space-y-4">
        <div class="flex items-center gap-3 mb-4">
          <Icon name="i-lucide-git-branch" class="size-5 text-app-accent" />
          <h2 class="text-lg font-medium text-app">Clone Repository</h2>
        </div>

        <FormField label="Repository URL">
          <Input
            v-model="cloneUrl"
            placeholder="https://github.com/user/repo.git"
            icon="i-lucide-link"
          />
        </FormField>

        <FormField label="Local Name (optional)">
          <Input
            v-model="repoName"
            placeholder="Leave empty to use repo name"
            icon="i-lucide-folder"
          />
        </FormField>

        <div class="flex justify-end gap-2 pt-4">
          <Button
            label="Cancel"
            variant="ghost"
            @click="handleCancel"
          />
          <Button
            label="Clone"
            icon="i-lucide-download"
            :disabled="!cloneUrl"
            @click="handleClone"
          />
        </div>
      </div>
    </template>
  </Modal>
</template>
