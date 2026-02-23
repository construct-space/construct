<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: number | boolean): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed } = usePropertyHelpers(selectedNodesRef)

const rawX = computed(() => getValue(n => Math.round(n.x)))
const rawY = computed(() => getValue(n => Math.round(n.y)))

const localX = computed({
  get: () => isMixed(rawX.value) ? '' : rawX.value,
  set: (v) => { if (v !== '') emit('update', 'x', Number(v)) }
})

const localY = computed({
  get: () => isMixed(rawY.value) ? '' : rawY.value,
  set: (v) => { if (v !== '') emit('update', 'y', Number(v)) }
})

const localRotation = computed({
  get: () => {
    const val = getValue(n => Math.round(n.rotation ?? 0))
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'rotation', Number(v)) }
})

const rawFlipX = computed(() => getValue(n => n.flipX ?? false))
const rawFlipY = computed(() => getValue(n => n.flipY ?? false))

const localFlipX = computed({
  get: () => isMixed(rawFlipX.value) ? false : rawFlipX.value,
  set: (v) => emit('update', 'flipX', v)
})

const localFlipY = computed({
  get: () => isMixed(rawFlipY.value) ? false : rawFlipY.value,
  set: (v) => emit('update', 'flipY', v)
})
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Position</p>
      <div class="flex items-center gap-0.5 rounded-md bg-app-subtle border border-[var(--app-border)] p-0.5">
        <Tooltip text="Flip horizontal">
          <Button
            icon="i-lucide-flip-horizontal"
            size="xs"
            :variant="localFlipX ? 'soft' : 'ghost'"
            :color="localFlipX ? 'primary' : 'neutral'"
            @click="localFlipX = !localFlipX"
          />
        </Tooltip>
        <Tooltip text="Flip vertical">
          <Button
            icon="i-lucide-flip-vertical"
            size="xs"
            :variant="localFlipY ? 'soft' : 'ghost'"
            :color="localFlipY ? 'primary' : 'neutral'"
            @click="localFlipY = !localFlipY"
          />
        </Tooltip>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <UIScrubInput v-model="localX" label="X" :placeholder="isMixed(rawX) ? 'Mixed' : ''" />
      <UIScrubInput v-model="localY" label="Y" :placeholder="isMixed(rawY) ? 'Mixed' : ''" />
    </div>

    <div class="mt-2">
      <UIScrubInput
        v-model="localRotation"
        icon="i-lucide-rotate-cw"
        suffix="°"
        :min="-360"
        :max="360"
        :placeholder="isMixed(getValue(n => n.rotation ?? 0)) ? 'Mixed' : ''"
        class="w-full"
      />
    </div>
  </div>
</template>
