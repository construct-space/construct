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

const localPoints = computed({
  get: () => {
    const val = getValue(n => n.points ?? 5)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'points', Number(v)) }
})

const localInnerRadius = computed({
  get: () => {
    const val = getValue(n => Math.round((n.innerRadius ?? 0.5) * 100))
    return isMixed(val) ? 50 : val
  },
  set: (v) => emit('update', 'innerRadius', v / 100)
})
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Star</p>
    <div class="space-y-2">
      <UIScrubInput v-model="localPoints" label="Points" :min="3" :max="12" />
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-[var(--app-muted)]">Inner Radius</span>
          <span class="text-[10px] text-[var(--app-muted)] tabular-nums">{{ localInnerRadius }}%</span>
        </div>
        <Slider v-model="localInnerRadius" :min="10" :max="90" :step="5" size="xs" />
      </div>
    </div>
  </div>
</template>
