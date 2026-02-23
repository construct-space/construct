<script setup lang="ts">
/**
 * PropertyConstraints - Per-child constraint editor
 * Shown when a node with a parentId is selected.
 * Two dropdowns for horizontal and vertical constraints.
 */
import type { DesignNode, HorizontalConstraint, VerticalConstraint, Constraints } from '~/types/design'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: Constraints): void
}>()

const horizontalOptions = [
  { label: 'Left', value: 'left' as HorizontalConstraint },
  { label: 'Right', value: 'right' as HorizontalConstraint },
  { label: 'Center', value: 'center' as HorizontalConstraint },
  { label: 'Scale', value: 'scale' as HorizontalConstraint },
  { label: 'Left & Right', value: 'leftAndRight' as HorizontalConstraint },
]

const verticalOptions = [
  { label: 'Top', value: 'top' as VerticalConstraint },
  { label: 'Bottom', value: 'bottom' as VerticalConstraint },
  { label: 'Center', value: 'center' as VerticalConstraint },
  { label: 'Scale', value: 'scale' as VerticalConstraint },
  { label: 'Top & Bottom', value: 'topAndBottom' as VerticalConstraint },
]

const currentConstraints = computed((): Constraints => {
  const node = props.selectedNodes[0]
  return node?.constraints ?? { horizontal: 'left', vertical: 'top' }
})

const selectedHorizontal = computed({
  get: () => currentConstraints.value.horizontal,
  set: (value: HorizontalConstraint) => {
    emit('update', 'constraints', {
      ...currentConstraints.value,
      horizontal: value,
    })
  },
})

const selectedVertical = computed({
  get: () => currentConstraints.value.vertical,
  set: (value: VerticalConstraint) => {
    emit('update', 'constraints', {
      ...currentConstraints.value,
      vertical: value,
    })
  },
})
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Constraints</p>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-[var(--app-muted)] w-6 shrink-0">H</span>
        <Select
          v-model="selectedHorizontal"
          :items="horizontalOptions"
          size="xs"
          class="flex-1"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-[var(--app-muted)] w-6 shrink-0">V</span>
        <Select
          v-model="selectedVertical"
          :items="verticalOptions"
          size="xs"
          class="flex-1"
        />
      </div>
    </div>
  </div>
</template>
