<script setup lang="ts">
/**
 * GitHeader - Header for git space with title and actions
 */
defineProps<{
  projectName?: string
}>()

const emit = defineEmits<{
  clone: []
  import: []
}>()
</script>

<template>
  <div class="p-4 border-b border-white/10">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Icon name="i-lucide-git-branch" class="size-5 text-app-accent" />
        <div>
          <h1 class="text-lg font-medium text-app">Repositories</h1>
          <p class="text-xs text-app-muted">{{ projectName }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button
          icon="i-lucide-git-branch"
          label="Clone"
          size="sm"
          variant="soft"
          @click="emit('clone')"
        />
        <Button
          icon="i-lucide-folder-input"
          label="Import"
          size="sm"
          variant="ghost"
          @click="emit('import')"
        />
      </div>
    </div>
  </div>
</template>
