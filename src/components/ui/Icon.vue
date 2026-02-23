<script setup lang="ts">
/**
 * Icon - Nuxt UI compatible icon component
 * Converts i-lucide-* names to @iconify/vue format
 */
import { Icon } from '@iconify/vue'

const props = defineProps<{
  name?: string
}>()

// Convert i-lucide-check → lucide:check
// Convert i-heroicons-check → heroicons:check
const iconName = computed(() => {
  const n = props.name || ''
  if (n.startsWith('i-')) {
    // i-lucide-check → lucide-check → lucide:check
    const stripped = n.slice(2) // remove 'i-'
    const colonIdx = stripped.indexOf('-')
    if (colonIdx > 0) {
      return stripped.slice(0, colonIdx) + ':' + stripped.slice(colonIdx + 1)
    }
    return stripped
  }
  return n
})
</script>

<template>
  <Icon v-if="name" :icon="iconName" />
</template>
