<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: number | string | [number, number, number, number]): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed, supportsCornerRadius } = usePropertyHelpers(selectedNodesRef)

// Opacity
const rawOpacity = computed(() => getValue(n => Math.round((n.opacity ?? 1) * 100)))
const localOpacity = computed({
  get: () => isMixed(rawOpacity.value) ? '' : rawOpacity.value,
  set: (v) => { if (v !== '') emit('update', 'opacity', Number(v) / 100) }
})

// Blend mode
const rawBlendMode = computed(() => getValue(n => n.blendMode ?? 'normal'))
const localBlendMode = computed({
  get: () => isMixed(rawBlendMode.value) ? '' : rawBlendMode.value,
  set: (v) => { if (v !== '') emit('update', 'blendMode', v) }
})

// Corner radius
const isPerCornerRadius = ref(false)
const rawCornerRadius = computed(() => getValue(n => {
  const cr = n.cornerRadius ?? 0
  return typeof cr === 'number' ? cr : cr[0]
}))
const localCornerRadius = computed({
  get: () => isMixed(rawCornerRadius.value) ? '' : rawCornerRadius.value,
  set: (v: number | string) => { if (v !== '') emit('update', 'cornerRadius', Number(v)) }
})

const cornerRadii = computed(() => {
  const val = getValue(n => {
    const cr = n.cornerRadius ?? 0
    if (typeof cr === 'number') return [cr, cr, cr, cr] as [number, number, number, number]
    return cr
  })
  return isMixed(val) ? [0, 0, 0, 0] as [number, number, number, number] : val
})

const updateCornerRadius = (index: number, value: number) => {
  const current = cornerRadii.value
  const newRadii: [number, number, number, number] = [...current]
  newRadii[index] = value
  emit('update', 'cornerRadius', newRadii)
}

const blendModeOptions = [
  { label: 'Normal', value: 'normal' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color Dodge', value: 'color-dodge' },
  { label: 'Color Burn', value: 'color-burn' },
  { label: 'Hard Light', value: 'hard-light' },
  { label: 'Soft Light', value: 'soft-light' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' }
]
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Appearance</p>

    <div class="grid grid-cols-2 gap-2">
      <UIScrubInput
        v-model="localOpacity"
        icon="i-lucide-blend"
        suffix="%"
        :min="0"
        :max="100"
        :placeholder="isMixed(rawOpacity) ? 'Mixed' : ''"
      />
      <Select
        v-model="localBlendMode"
        :items="blendModeOptions"
        size="xs"
        :placeholder="isMixed(rawBlendMode) ? 'Mixed' : ''"
      />
    </div>

    <div v-if="supportsCornerRadius" class="mt-2 flex gap-1">
      <UIScrubInput
        v-model="localCornerRadius"
        icon="i-lucide-square"
        :min="0"
        :placeholder="isMixed(rawCornerRadius) ? 'Mixed' : ''"
        class="flex-1"
      />
      <Button
        :icon="isPerCornerRadius ? 'i-lucide-unlink' : 'i-lucide-link'"
        size="xs"
        variant="ghost"
        color="neutral"
        class="rounded-md bg-app-subtle border border-[var(--app-border)]"
        @click="isPerCornerRadius = !isPerCornerRadius"
      />
    </div>

    <!-- Per-corner radius -->
    <div v-if="isPerCornerRadius && supportsCornerRadius" class="grid grid-cols-4 gap-1 mt-2">
      <UIScrubInput
        :model-value="cornerRadii[0]" label="TL" :min="0"
        @update:model-value="updateCornerRadius(0, $event)" />
      <UIScrubInput
        :model-value="cornerRadii[1]" label="TR" :min="0"
        @update:model-value="updateCornerRadius(1, $event)" />
      <UIScrubInput
        :model-value="cornerRadii[3]" label="BL" :min="0"
        @update:model-value="updateCornerRadius(3, $event)" />
      <UIScrubInput
        :model-value="cornerRadii[2]" label="BR" :min="0"
        @update:model-value="updateCornerRadius(2, $event)" />
    </div>
  </div>
</template>
