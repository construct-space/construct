<script setup lang="ts">
/**
 * UIScrubSelect - Select with Figma-like drag-to-scrub on icon
 * Combines dropdown presets with drag-to-adjust functionality
 */

// Custom SVG cursor for horizontal scrubbing (↔)
const scrubCursor = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.8));"><path d="M5 12h14"/><path d="M5 12l4 -4"/><path d="M5 12l4 4"/><path d="M19 12l-4 -4"/><path d="M19 12l-4 4"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ew-resize`
})()

interface Props {
  modelValue: number
  options: number[]
  min?: number
  max?: number
  step?: number
  suffix?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: Infinity,
  step: 1,
  suffix: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

// Scrubbing state
const isScrubbing = ref(false)
const startX = ref(0)
const startValue = ref(0)

const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isScrubbing.value = true
  startX.value = e.clientX
  startValue.value = props.modelValue ?? 0

  window.addEventListener('mousemove', handleMouseMove, true)
  window.addEventListener('mouseup', handleMouseUp, true)

  // Force cursor globally
  const style = document.createElement('style')
  style.id = 'scrub-cursor-style'
  style.textContent = `* { cursor: ${scrubCursor} !important; } body { user-select: none !important; }`
  document.head.appendChild(style)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isScrubbing.value) return

  const deltaX = e.clientX - startX.value
  const sensitivity = e.shiftKey ? 0.1 : 1
  const deltaValue = Math.round(deltaX * sensitivity) * props.step

  let newValue = startValue.value + deltaValue
  newValue = Math.max(props.min, Math.min(props.max, newValue))

  emit('update:modelValue', newValue)
}

const handleMouseUp = () => {
  isScrubbing.value = false
  window.removeEventListener('mousemove', handleMouseMove, true)
  window.removeEventListener('mouseup', handleMouseUp, true)
  document.getElementById('scrub-cursor-style')?.remove()
}

// Select option
const selectOption = (value: number) => {
  emit('update:modelValue', value)
}

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove, true)
  window.removeEventListener('mouseup', handleMouseUp, true)
  document.getElementById('scrub-cursor-style')?.remove()
})
</script>

<template>
  <Popover>
    <div
      class="flex items-center rounded-md h-7 border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-background)_80%,var(--app-canvas-bg)_20%)] min-w-[70px]">
      <!-- Scrub handle -->
      <div
        class="flex items-center justify-center px-2 select-none shrink-0 h-full rounded-l-md border-r border-[var(--app-border)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-muted)_12%,transparent)]"
        :class="{ 'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]': isScrubbing }" :style="{ cursor: scrubCursor }"
        @mousedown.prevent.stop="handleMouseDown">
        <Icon name="i-lucide-grip-vertical" class="size-3 text-[var(--app-muted)] pointer-events-none" />
      </div>

      <!-- Value display -->
      <div class="flex-1 flex items-center justify-between px-1 cursor-pointer">
        <span class="text-xs text-[var(--app-foreground)] tabular-nums">{{ modelValue }}</span>
        <span v-if="suffix" class="text-[10px] text-[var(--app-muted)] mr-1">{{ suffix }}</span>
      </div>
    </div>

    <template #content>
      <div class="py-1 min-w-[60px]" @mousedown.stop>
        <button
v-for="option in options" :key="option"
          class="w-full px-3 py-1 text-left text-xs hover:bg-app-hover transition-colors"
          :class="{ 'bg-app-subtle text-[var(--app-accent)]': modelValue === option }" @click="selectOption(option)">
          {{ option }}{{ suffix }}
        </button>
      </div>
    </template>
  </Popover>
</template>
