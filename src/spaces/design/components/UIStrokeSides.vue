<script setup lang="ts">
/**
 * UIStrokeSides - Visual selector for stroke sides (top, right, bottom, left)
 * Click on each side to toggle, or click center to toggle all
 */

interface Props {
  modelValue: { top: boolean; right: boolean; bottom: boolean; left: boolean }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: { top: boolean; right: boolean; bottom: boolean; left: boolean }]
}>()

const toggleSide = (side: 'top' | 'right' | 'bottom' | 'left') => {
  emit('update:modelValue', {
    ...props.modelValue,
    [side]: !props.modelValue[side]
  })
}

const toggleAll = () => {
  const allEnabled = props.modelValue.top && props.modelValue.right && props.modelValue.bottom && props.modelValue.left
  const newValue = !allEnabled
  emit('update:modelValue', {
    top: newValue,
    right: newValue,
    bottom: newValue,
    left: newValue
  })
}

const allEnabled = computed(() =>
  props.modelValue.top && props.modelValue.right && props.modelValue.bottom && props.modelValue.left
)
</script>

<template>
  <div class="relative size-7 flex items-center justify-center">
    <!-- Center square (toggle all) -->
    <div
      class="absolute size-3 rounded-sm cursor-pointer transition-colors"
      :class="allEnabled ? 'bg-primary' : 'bg-elevated ring-1 ring-default'"
      @click="toggleAll"
    />

    <!-- Top side -->
    <div
      class="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full cursor-pointer transition-colors"
      :class="modelValue.top ? 'bg-primary' : 'bg-border'"
      @click="toggleSide('top')"
    />

    <!-- Right side -->
    <div
      class="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full cursor-pointer transition-colors"
      :class="modelValue.right ? 'bg-primary' : 'bg-border'"
      @click="toggleSide('right')"
    />

    <!-- Bottom side -->
    <div
      class="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full cursor-pointer transition-colors"
      :class="modelValue.bottom ? 'bg-primary' : 'bg-border'"
      @click="toggleSide('bottom')"
    />

    <!-- Left side -->
    <div
      class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full cursor-pointer transition-colors"
      :class="modelValue.left ? 'bg-primary' : 'bg-border'"
      @click="toggleSide('left')"
    />
  </div>
</template>
