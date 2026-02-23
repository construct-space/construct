<script setup lang="ts">
defineProps<{
  framework: string
}>()
</script>

<template>
  <div class="px-4 py-2 border-b border-gray-200/50 dark:border-gray-800/50 bg-blue-500/5">
    <div class="flex items-center gap-2 text-xs text-app-muted">
      <Icon name="i-lucide-code-2" class="size-3.5 text-blue-500" />
      <span>
        Code Assistant active
        <template v-if="framework && framework !== 'unknown'"> | Stack: <strong class="text-app">{{ framework }}</strong></template>
        <template v-else> | Stack: <strong class="text-app">auto-detect</strong></template>
      </span>
    </div>
    <p class="text-[11px] text-app-muted mt-1">
      @design references are implemented directly in project files using the code agent.
    </p>
  </div>
</template>
