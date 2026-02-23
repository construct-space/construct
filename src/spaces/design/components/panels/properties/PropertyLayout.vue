<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: number): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed } = usePropertyHelpers(selectedNodesRef)

const rawWidth = computed(() => getValue(n => Math.round(n.width)))
const rawHeight = computed(() => getValue(n => Math.round(n.height)))

const localWidth = computed({
  get: () => isMixed(rawWidth.value) ? '' : rawWidth.value,
  set: (v) => { if (v !== '') emit('update', 'width', Number(v)) }
})

const localHeight = computed({
  get: () => isMixed(rawHeight.value) ? '' : rawHeight.value,
  set: (v) => { if (v !== '') emit('update', 'height', Number(v)) }
})
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Layout</p>
    <div class="grid grid-cols-2 gap-2">
      <UIScrubInput v-model="localWidth" label="W" :min="1" :placeholder="isMixed(rawWidth) ? 'Mixed' : ''" />
      <UIScrubInput v-model="localHeight" label="H" :min="1" :placeholder="isMixed(rawHeight) ? 'Mixed' : ''" />
    </div>
  </div>
</template>
