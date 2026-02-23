<script setup lang="ts">
/**
 * AIModeToggle - Segmented pill toggle: Single | Roundtable
 */
const props = defineProps<{
  modelValue: 'single' | 'roundrobin'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'single' | 'roundrobin'): void
}>()

const modes = [
  { value: 'single' as const, label: 'Single', icon: 'i-lucide-message-square' },
  { value: 'roundrobin' as const, label: 'Roundtable', icon: 'i-lucide-users' },
]
</script>

<template>
  <div class="flex items-center bg-white/[0.04] rounded-lg p-0.5">
    <button
      v-for="mode in modes"
      :key="mode.value"
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
      :class="props.modelValue === mode.value
        ? 'bg-app-accent/15 text-app-accent'
        : 'text-app-muted hover:text-app'"
      @click="emit('update:modelValue', mode.value)"
    >
      <Icon :name="mode.icon" class="size-3.5" />
      <span>{{ mode.label }}</span>
    </button>
  </div>
</template>
