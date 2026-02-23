<script setup lang="ts">
/**
 * PropertyNineSlice - Nine-slice inset editor for component masters
 * Shown when a node with isComponent === true is selected.
 * 4 number inputs for insets + auto-assign button.
 */
import type { DesignNode, NineSliceInsets } from '~/types/design'
import UIScrubInput from '../../UIScrubInput.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: NineSliceInsets): void
  (e: 'autoAssignConstraints', masterId: string): void
}>()

const currentInsets = computed((): NineSliceInsets => {
  const node = props.selectedNodes[0]
  return node?.nineSliceInsets ?? { top: 20, right: 20, bottom: 20, left: 20 }
})

const localTop = computed({
  get: () => currentInsets.value.top,
  set: (v) => emitUpdate({ ...currentInsets.value, top: Number(v) }),
})

const localRight = computed({
  get: () => currentInsets.value.right,
  set: (v) => emitUpdate({ ...currentInsets.value, right: Number(v) }),
})

const localBottom = computed({
  get: () => currentInsets.value.bottom,
  set: (v) => emitUpdate({ ...currentInsets.value, bottom: Number(v) }),
})

const localLeft = computed({
  get: () => currentInsets.value.left,
  set: (v) => emitUpdate({ ...currentInsets.value, left: Number(v) }),
})

function emitUpdate(insets: NineSliceInsets) {
  emit('update', 'nineSliceInsets', insets)
}

function handleAutoAssign() {
  const node = props.selectedNodes[0]
  if (node) {
    // First save the insets
    emitUpdate(currentInsets.value)
    // Then trigger auto-assign
    emit('autoAssignConstraints', node.id)
  }
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">9-Slice Insets</p>

    <div class="grid grid-cols-2 gap-2">
      <UIScrubInput v-model="localTop" label="Top" :min="0" />
      <UIScrubInput v-model="localRight" label="Right" :min="0" />
      <UIScrubInput v-model="localBottom" label="Bottom" :min="0" />
      <UIScrubInput v-model="localLeft" label="Left" :min="0" />
    </div>

    <Button
      icon="i-lucide-wand-2"
      size="xs"
      variant="soft"
      color="neutral"
      class="w-full mt-2"
      @click="handleAutoAssign"
    >
      Auto-assign Constraints
    </Button>
  </div>
</template>
