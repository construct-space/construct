<script setup lang="ts">
import type { DesignNode, Fill } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIFillPicker from '../UIFillPicker.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: Fill): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed } = usePropertyHelpers(selectedNodesRef)
const selectionKey = computed(() => props.selectedNodes.map(n => n.id).join(','))

const rawFill = computed(() => getValue(n => n.fill ?? '#e5e7eb'))
const fillIsMixed = computed(() => isMixed(rawFill.value))

const localFill = computed({
  get: (): Fill => isMixed(rawFill.value) ? '#e5e7eb' : rawFill.value,
  set: (v: Fill) => emit('update', 'fill', v)
})

const addFill = () => {
  emit('update', 'fill', '#e5e7eb')
}

const removeFill = () => {
  emit('update', 'fill', 'transparent')
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Fill</p>
      <Button icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="addFill" />
    </div>
    <!-- Mixed Fill -->
    <div v-if="fillIsMixed" class="flex items-center gap-2">
      <div
        class="size-6 rounded border border-[var(--app-border)] cursor-pointer shrink-0 shadow-sm bg-linear-to-br from-gray-300 via-gray-400 to-gray-500"
        @click="addFill" />
      <span class="text-[11px] text-[var(--app-muted)] flex-1 min-w-0 truncate">Mixed</span>
      <Button icon="i-lucide-eye" size="xs" variant="ghost" color="neutral" />
    </div>
    <!-- Single Fill -->
    <div v-else class="flex items-center gap-2 min-w-0">
      <UIFillPicker v-model="localFill" :selection-key="selectionKey" class="flex-1 min-w-0" />
      <Button icon="i-lucide-eye" size="xs" variant="ghost" color="neutral" class="shrink-0" />
      <Button icon="i-lucide-minus" size="xs" variant="ghost" color="neutral" class="shrink-0" @click="removeFill" />
    </div>
  </div>
</template>
