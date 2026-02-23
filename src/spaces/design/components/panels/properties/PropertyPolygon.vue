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

const localSides = computed({
  get: () => {
    const val = getValue(n => n.sides ?? 6)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'sides', Number(v)) }
})

const polygonPresets = [
  { label: 'Triangle', value: 3, icon: 'i-lucide-triangle' },
  { label: 'Square', value: 4, icon: 'i-lucide-square' },
  { label: 'Pentagon', value: 5, icon: 'i-lucide-pentagon' },
  { label: 'Hexagon', value: 6, icon: 'i-lucide-hexagon' },
  { label: 'Octagon', value: 8, icon: 'i-lucide-octagon' },
]
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Polygon</p>
    <div class="flex gap-1 mb-2">
      <Tooltip v-for="preset in polygonPresets" :key="preset.value" :text="preset.label">
        <Button
          :icon="preset.icon"
          size="xs"
          :variant="localSides === preset.value ? 'soft' : 'ghost'"
          :color="localSides === preset.value ? 'primary' : 'neutral'"
          @click="emit('update', 'sides', preset.value)"
        />
      </Tooltip>
    </div>
    <UIScrubInput v-model="localSides" label="Sides" :min="3" :max="12" />
  </div>
</template>
