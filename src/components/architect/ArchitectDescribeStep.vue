<script setup lang="ts">
defineProps<{
  isInsideProject: boolean
  projectName?: string
  errorMessage: string
  description: string
}>()

const emit = defineEmits<{
  'update:description': [value: string]
  submit: []
  quickStart: [text: string]
  dismissError: []
}>()

const quickStartOptionsProject = ['Authentication', 'Dashboard', 'API Endpoints', 'File Upload', 'Notifications', 'Search']
const quickStartOptionsNew = ['Dashboard', 'E-commerce', 'Chat App', 'Blog', 'Todo App', 'SaaS']
</script>

<template>
  <div>
    <p class="text-sm text-app-muted tracking-wider">DESCRIBE YOUR</p>
    <h1 class="text-4xl font-bold text-app mt-1">
      {{ isInsideProject ? 'Feature' : 'Project' }}
    </h1>
    <p v-if="isInsideProject" class="text-sm text-app-muted mt-2">
      Adding to <span class="font-medium text-app">{{ projectName }}</span>
    </p>
  </div>

  <!-- Inline error -->
  <div v-if="errorMessage" class="flex items-start gap-3 p-3 rounded-md bg-red-500/10 border border-red-500/20">
    <Icon name="i-lucide-alert-circle" class="size-4 text-red-400 shrink-0 mt-0.5" />
    <div class="flex-1 min-w-0">
      <p class="text-sm text-red-400">{{ errorMessage }}</p>
      <button class="text-xs text-red-400/60 hover:text-red-400 mt-1 transition-colors" @click="emit('dismissError')">
        Dismiss
      </button>
    </div>
  </div>

  <div class="space-y-4">
    <Textarea
      :model-value="description"
      :placeholder="isInsideProject ? 'I want to add...' : 'I want to build...'"
      :rows="4"
      autofocus
      @update:model-value="emit('update:description', $event)"
      @keydown.meta.enter="emit('submit')"
      @keydown.ctrl.enter="emit('submit')"
    />
    <Button :disabled="!description.trim()" @click="emit('submit')">
      <template #leading>
        <Icon name="i-lucide-arrow-right" class="size-4" />
      </template>
      Continue
    </Button>
  </div>

  <div class="space-y-2">
    <p class="text-xs text-app-muted uppercase tracking-wider">Quick Start</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="text in isInsideProject ? quickStartOptionsProject : quickStartOptionsNew"
        :key="text"
        class="px-3 py-1.5 text-xs text-app-muted hover:text-app rounded-md bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors"
        @click="emit('quickStart', text)"
      >
        {{ text }}
      </button>
    </div>
  </div>
</template>
