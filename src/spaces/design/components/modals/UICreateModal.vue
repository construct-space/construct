<script setup lang="ts">
/**
 * UICreateModal - Modal for creating new blueprint/prototype files
 */
const props = defineProps<{
  modelValue: boolean
  type: 'ui' | 'ux'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  create: [name: string, type: 'ui' | 'ux']
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const fileName = ref('')

// Get icon for file type (for future use)
const _fileIcon = computed(() => {
  return props.type === 'ui' ? 'i-lucide-layout' : 'i-lucide-play-circle'
})

// Get title for file type
const title = computed(() => {
  return props.type === 'ui' ? 'New Blueprint' : 'New Prototype'
})

// Get placeholder for file type
const placeholder = computed(() => {
  return props.type === 'ui' ? 'homepage' : 'checkout-flow'
})

// Convert name to filename format
const fileNamePreview = computed(() => {
  const name = fileName.value || placeholder.value
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ui'
})

// Handle create
const handleCreate = () => {
  if (!fileName.value) return
  emit('create', fileName.value, props.type)
  fileName.value = ''
}

// Handle cancel
const handleCancel = () => {
  isOpen.value = false
  fileName.value = ''
}

// Handle enter key
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleCreate()
  }
}
</script>

<template>
  <Modal v-model:open="isOpen" :title="title" :description="`Create a new ${type === 'ui' ? 'blueprint' : 'prototype'} file`">
    <template #body>
      <FormField label="File Name">
        <Input
          v-model="fileName"
          :placeholder="placeholder"
          icon="i-lucide-file"
          @keydown="handleKeydown"
        />
        <template #hint>
          <span class="text-xs text-app-muted">
            Will be saved as <code class="text-app-accent">{{ fileNamePreview }}</code>
          </span>
        </template>
      </FormField>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          label="Cancel"
          variant="ghost"
          @click="handleCancel"
        />
        <Button
          label="Create"
          icon="i-lucide-plus"
          :disabled="!fileName"
          @click="handleCreate"
        />
      </div>
    </template>
  </Modal>
</template>
