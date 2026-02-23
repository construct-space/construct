<script setup lang="ts">
/**
 * PropertyAlign - Align and distribute controls for multi-selection
 */
import type { DesignNode } from '~/types/design'

const props = defineProps<{
  selectedNodes: DesignNode[]
}>()

defineEmits<{
  align: [alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom']
  distribute: [direction: 'horizontal' | 'vertical']
  tidyUp: []
}>()

// Only show when 2+ items selected
const showControls = computed(() => props.selectedNodes.length >= 2)
const showDistribute = computed(() => props.selectedNodes.length >= 3)
</script>

<template>
  <div v-if="showControls" class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Align</p>

    <!-- Align buttons -->
    <div class="flex items-center gap-1 mb-2">
      <!-- Horizontal alignment -->
      <Tooltip text="Align left">
        <Button
icon="i-lucide-align-horizontal-justify-start" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'left')" />
      </Tooltip>
      <Tooltip text="Align center">
        <Button
icon="i-lucide-align-horizontal-justify-center" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'centerH')" />
      </Tooltip>
      <Tooltip text="Align right">
        <Button
icon="i-lucide-align-horizontal-justify-end" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'right')" />
      </Tooltip>

      <div class="w-px h-4 bg-[var(--app-border)] mx-1" />

      <!-- Vertical alignment -->
      <Tooltip text="Align top">
        <Button
icon="i-lucide-align-vertical-justify-start" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'top')" />
      </Tooltip>
      <Tooltip text="Align middle">
        <Button
icon="i-lucide-align-vertical-justify-center" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'centerV')" />
      </Tooltip>
      <Tooltip text="Align bottom">
        <Button
icon="i-lucide-align-vertical-justify-end" size="xs" variant="ghost" color="neutral"
          @click="$emit('align', 'bottom')" />
      </Tooltip>
    </div>

    <!-- Distribute buttons (3+ items) -->
    <div v-if="showDistribute" class="flex items-center gap-1">
      <Tooltip text="Distribute horizontally">
        <Button
icon="i-lucide-align-horizontal-space-between" size="xs" variant="ghost" color="neutral"
          @click="$emit('distribute', 'horizontal')" />
      </Tooltip>
      <Tooltip text="Distribute vertically">
        <Button
icon="i-lucide-align-vertical-space-between" size="xs" variant="ghost" color="neutral"
          @click="$emit('distribute', 'vertical')" />
      </Tooltip>

      <div class="w-px h-4 bg-[var(--app-border)] mx-1" />

      <Tooltip text="Tidy up (⌃⌥T)">
        <Button icon="i-lucide-layout-grid" size="xs" variant="ghost" color="neutral" @click="$emit('tidyUp')" />
      </Tooltip>
    </div>
  </div>
</template>
