<script setup lang="ts">
defineProps<{
  canDropImage: boolean
}>()
</script>

<template>
  <div class="px-4 py-2 border-b border-gray-200/50 dark:border-gray-800/50 bg-fuchsia-500/5">
    <div class="flex items-center gap-2 text-xs text-app-muted">
      <Icon name="i-lucide-palette" class="size-3.5 text-fuchsia-500" />
      <span>UI Assistant active</span>
    </div>
    <p class="text-[11px] text-app-muted mt-1">
      <template v-if="canDropImage">Drop a screenshot to convert into canvas elements, or describe UI changes.</template>
      <template v-else>Describe UI updates and the assistant will use design tools on canvas.</template>
    </p>
  </div>
</template>
