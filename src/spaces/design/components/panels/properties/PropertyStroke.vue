<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'
import UIFillPicker from '../UIFillPicker.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: string | number | boolean | number[]): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed } = usePropertyHelpers(selectedNodesRef)
const selectionKey = computed(() => props.selectedNodes.map(n => n.id).join(','))

// Stroke color
const rawStroke = computed(() => getValue(n => n.stroke ?? '#000000'))
const localStroke = computed({
  get: () => isMixed(rawStroke.value) ? '#000000' : rawStroke.value,
  set: (v) => emit('update', 'stroke', v)
})

// Stroke width
const rawStrokeWidth = computed(() => getValue(n => n.strokeWidth ?? 0))
const localStrokeWidth = computed({
  get: () => isMixed(rawStrokeWidth.value) ? '' : rawStrokeWidth.value,
  set: (v) => { if (v !== '') emit('update', 'strokeWidth', Number(v)) }
})

const hasStroke = computed(() => {
  const val = rawStrokeWidth.value
  return isMixed(val) ? true : val > 0
})

// Stroke dash
const localStrokeDash = computed({
  get: () => {
    const val = getValue(n => {
      const dash = n.strokeDashArray
      if (!dash || dash.length === 0) return 'solid'
      if ((dash[0] ?? 0) <= 3) return 'dotted'
      return 'dashed'
    })
    return isMixed(val) ? '' : val
  },
  set: (v: string) => emit('update', 'strokeDashArray', v === 'dashed' ? [8, 8] : v === 'dotted' ? [2, 4] : [])
})

// Stroke line cap
const localStrokeLineCap = computed({
  get: () => {
    const val = getValue(n => n.strokeLineCap ?? 'butt')
    return isMixed(val) ? '' : val
  },
  set: (v) => emit('update', 'strokeLineCap', v)
})

// Stroke line join
const localStrokeLineJoin = computed({
  get: () => {
    const val = getValue(n => n.strokeLineJoin ?? 'miter')
    return isMixed(val) ? '' : val
  },
  set: (v) => emit('update', 'strokeLineJoin', v)
})

// Stroke uniform
const localStrokeUniform = computed({
  get: () => {
    const val = getValue(n => n.strokeUniform ?? false)
    return isMixed(val) ? false : val
  },
  set: (v) => emit('update', 'strokeUniform', v)
})

// Stroke position maps to paintFirst: 'fill' = center (default), 'stroke' = inside
const localStrokePosition = computed({
  get: () => {
    const val = getValue(n => n.paintFirst ?? 'fill')
    if (isMixed(val)) return 'center'
    return val === 'stroke' ? 'inside' : 'center'
  },
  set: (v: string) => emit('update', 'paintFirst', v === 'inside' ? 'stroke' : 'fill')
})
const showStrokeAdvanced = ref(false)

const strokeDashOptions = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dash', value: 'dashed' },
  { label: 'Dot', value: 'dotted' }
]

const strokePositionOptions = [
  { label: 'Center', value: 'center' },
  { label: 'Inside', value: 'inside' },
  { label: 'Outside', value: 'outside' }
]

const strokeCapOptions = [
  { label: 'None', value: 'butt' },
  { label: 'Round', value: 'round' },
  { label: 'Square', value: 'square' }
]

const strokeJoinOptions = [
  { label: 'Miter', value: 'miter' },
  { label: 'Round', value: 'round' },
  { label: 'Bevel', value: 'bevel' }
]

const addStroke = () => {
  emit('update', 'strokeWidth', 1)
}

const removeStroke = () => {
  emit('update', 'strokeWidth', 0)
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Stroke</p>
      <div class="flex items-center gap-1">
        <Button
icon="i-lucide-settings-2" size="xs" variant="ghost" color="neutral"
          @click="showStrokeAdvanced = !showStrokeAdvanced" />
        <Button icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="addStroke" />
      </div>
    </div>
    <!-- Stroke Row -->
    <div class="flex items-center gap-2 mb-2 min-w-0">
      <UIFillPicker v-model="localStroke" :allow-gradient="false" :selection-key="selectionKey" class="flex-1 min-w-0" />
      <span class="text-[11px] text-[var(--app-muted)] shrink-0">100%</span>
      <Button icon="i-lucide-eye" size="xs" variant="ghost" color="neutral" class="shrink-0" />
      <Button icon="i-lucide-minus" size="xs" variant="ghost" color="neutral" class="shrink-0" @click="removeStroke" />
    </div>
    <!-- Position + Width Row -->
    <div class="flex items-center gap-2 min-w-0">
      <Select
v-model="localStrokePosition" :items="strokePositionOptions" size="xs" value-key="value"
        class="w-24" />
      <UIScrubInput
v-model="localStrokeWidth" icon="i-lucide-move-horizontal" :min="0"
        :placeholder="isMixed(rawStrokeWidth) ? 'Mixed' : ''" class="w-24" />
    </div>
    <!-- Advanced Stroke Options -->
    <div v-if="showStrokeAdvanced && hasStroke" class="mt-2 pt-2 border-t border-[var(--app-border)]/50 space-y-2">
      <div class="grid grid-cols-3 gap-2">
        <Select v-model="localStrokeDash" :items="strokeDashOptions" size="xs" />
        <Select v-model="localStrokeLineCap" :items="strokeCapOptions" size="xs" />
        <Select v-model="localStrokeLineJoin" :items="strokeJoinOptions" size="xs" />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-[var(--app-muted)]">Uniform stroke</span>
        <Switch v-model="localStrokeUniform" size="xs" />
      </div>
    </div>
  </div>
</template>
