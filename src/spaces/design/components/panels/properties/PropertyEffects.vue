<script setup lang="ts">
import type { DesignNode, Shadow } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'
import UIFillPicker from '../UIFillPicker.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: Shadow[] | number | undefined): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { firstNode } = usePropertyHelpers(selectedNodesRef)
const selectionKey = computed(() => props.selectedNodes.map(n => n.id).join(','))

// Check if selected node is an image
const isImage = computed(() => firstNode.value?.type === 'image')

// Effects data
const shadows = computed(() => firstNode.value?.shadows ?? [])
const layerBlur = computed(() => firstNode.value?.blur ?? 0)

// Check what effects are active
const hasDropShadow = computed(() => shadows.value.some(s => s.type === 'drop'))
const hasLayerBlur = computed(() => layerBlur.value > 0)

// Get specific shadow by type
const getDropShadow = () => shadows.value.find(s => s.type === 'drop')

function normalizeColorToHex(color: string | undefined): string {
  if (!color) return '#000000'
  const value = color.trim()

  // #RRGGBB / #RGB
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    if (value.length === 4) {
      const r = value[1]
      const g = value[2]
      const b = value[3]
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }
    return value.toUpperCase()
  }

  // rgb(...) / rgba(...)
  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Number(rgbMatch[1] || 0)))
    const g = Math.max(0, Math.min(255, Number(rgbMatch[2] || 0)))
    const b = Math.max(0, Math.min(255, Number(rgbMatch[3] || 0)))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase()
  }

  return '#000000'
}

// Add effect
function addEffect(type: 'drop' | 'blur') {
  if (type === 'blur') {
    emit('update', 'blur', 8)
    return
  }

  const newShadow: Shadow = {
    type: 'drop',
    color: 'rgba(0,0,0,0.25)',
    offsetX: 0,
    offsetY: 4,
    blur: 8,
    spread: 0
  }
  emit('update', 'shadows', [...shadows.value, newShadow])
}

// Remove effect
function removeEffect(type: 'drop' | 'blur') {
  if (type === 'blur') {
    emit('update', 'blur', 0)
    return
  }
  emit('update', 'shadows', shadows.value.filter(s => s.type !== type))
}

// Update shadow
function updateShadow(updates: Partial<Shadow>) {
  const updated = shadows.value.map(s => {
    if (s.type === 'drop') {
      return { ...s, ...updates }
    }
    return s
  })
  emit('update', 'shadows', updated)
}

// Drop shadow computed properties
const dropShadowColor = computed({
  get: (): string => normalizeColorToHex(getDropShadow()?.color),
  set: (v: string) => updateShadow({ color: normalizeColorToHex(v) })
})
const dropShadowX = computed({
  get: () => getDropShadow()?.offsetX ?? 0,
  set: (v: number) => updateShadow({ offsetX: v })
})
const dropShadowY = computed({
  get: () => getDropShadow()?.offsetY ?? 4,
  set: (v: number) => updateShadow({ offsetY: v })
})
const dropShadowBlur = computed({
  get: () => getDropShadow()?.blur ?? 8,
  set: (v: number) => updateShadow({ blur: v })
})
const dropShadowSpread = computed({
  get: () => getDropShadow()?.spread ?? 0,
  set: (v: number) => updateShadow({ spread: v })
})

// Layer blur computed
const blurAmount = computed({
  get: () => layerBlur.value,
  set: (v: number) => emit('update', 'blur', v)
})

// Available effects based on what's already applied and node type
const availableEffects = computed(() => {
  const effects: { label: string; value: 'drop' | 'blur'; icon: string }[] = []

  if (!hasDropShadow.value) {
    effects.push({ label: 'Drop shadow', value: 'drop', icon: 'i-lucide-box-select' })
  }

  // Only show blur option for images
  if (isImage.value && !hasLayerBlur.value) {
    effects.push({ label: 'Layer blur', value: 'blur', icon: 'i-lucide-circle-dashed' })
  }

  return effects
})

// Check if any effects are active
const hasAnyEffect = computed(() => hasDropShadow.value || hasLayerBlur.value)
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Effects</p>
      <DropdownMenu :items="availableEffects.map(e => [{ label: e.label, icon: e.icon, onSelect: () => addEffect(e.value) }]).flat()">
        <Button icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" :disabled="availableEffects.length === 0" />
      </DropdownMenu>
    </div>

    <div class="space-y-3">
      <!-- Drop Shadow -->
      <div v-if="hasDropShadow" class="space-y-2">
        <div class="flex items-center gap-2">
          <Icon name="i-lucide-box-select" class="size-4 text-[var(--app-muted)] shrink-0" />
          <span class="text-[11px] text-[var(--app-foreground)] flex-1">Drop shadow</span>
          <Button icon="i-lucide-minus" size="xs" variant="ghost" color="neutral" @click="removeEffect('drop')" />
        </div>
        <div class="pl-6 space-y-2">
          <div class="flex items-center gap-2">
            <div class="w-[170px] min-w-0">
              <UIFillPicker v-model="dropShadowColor" :allow-gradient="false" :selection-key="selectionKey" />
            </div>
            <div class="grid grid-cols-2 gap-2 flex-1 min-w-0">
              <UIScrubInput v-model="dropShadowX" label="X" />
              <UIScrubInput v-model="dropShadowY" label="Y" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UIScrubInput v-model="dropShadowBlur" label="Blur" :min="0" />
            <UIScrubInput v-model="dropShadowSpread" label="Spread" />
          </div>
        </div>
      </div>

      <!-- Layer Blur (only for images) -->
      <div v-if="hasLayerBlur" class="space-y-2">
        <div class="flex items-center gap-2">
          <Icon name="i-lucide-circle-dashed" class="size-4 text-[var(--app-muted)] shrink-0" />
          <span class="text-[11px] text-[var(--app-foreground)] flex-1">Layer blur</span>
          <Button icon="i-lucide-minus" size="xs" variant="ghost" color="neutral" @click="removeEffect('blur')" />
        </div>
        <div class="pl-6">
          <UIScrubInput v-model="blurAmount" label="Amount" :min="0" :max="100" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!hasAnyEffect" class="text-[11px] text-[var(--app-muted)] text-center py-2">
        No effects applied
      </div>
    </div>
  </div>
</template>
