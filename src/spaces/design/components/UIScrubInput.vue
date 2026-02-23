<script setup lang="ts">
/**
 * UIScrubInput — Construct UI
 * Number input with Figma-like drag-to-scrub on the prefix label.
 * Drag left/right on the label to decrease/increase the value.
 * Matches Input.vue prefix style exactly.
 */

// Custom SVG cursor for horizontal scrubbing (↔)
const scrubCursor = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8))"><path d="M5 12h14"/><path d="M5 12l4-4"/><path d="M5 12l4 4"/><path d="M19 12l-4-4"/><path d="M19 12l-4 4"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ew-resize`
})()

interface Props {
  modelValue: number | string
  min?: number
  max?: number
  step?: number
  icon?: string
  label?: string
  suffix?: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: -Infinity,
  max: Infinity,
  icon: undefined,
  label: undefined,
  step: 1,
  suffix: '',
  placeholder: '',
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
  startValue.value = typeof props.modelValue === 'number' ? props.modelValue : 0

  window.addEventListener('mousemove', handleMouseMove, true)
  window.addEventListener('mouseup', handleMouseUp, true)

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

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.value === '' || target.value === '-') return
  const parsed = parseFloat(target.value)
  if (isNaN(parsed)) return
  const value = Math.max(props.min, Math.min(props.max, parsed))
  emit('update:modelValue', value)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove, true)
  window.removeEventListener('mouseup', handleMouseUp, true)
  document.getElementById('scrub-cursor-style')?.remove()
})
</script>

<template>
  <div
    class="flex items-center w-full rounded-md border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-background)_80%,var(--app-canvas-bg)_20%)] overflow-hidden transition-colors hover:border-[var(--app-muted)]/50 focus-within:border-[var(--app-accent)]"
  >
    <!-- Scrub handle — styled like Input prefix -->
    <div
      class="flex items-center justify-center px-2 py-1.5 shrink-0 border-r border-[var(--app-border)] select-none transition-colors"
      :class="isScrubbing ? 'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--app-muted)_10%,transparent)]'"
      :style="{ cursor: scrubCursor }"
      @mousedown.prevent.stop="handleMouseDown"
    >
      <span class="text-xs text-[var(--app-muted)] font-medium tabular-nums pointer-events-none leading-none">
        {{ label }}
      </span>
    </div>

    <!-- Number input -->
    <input
      type="number"
      :value="modelValue === '' ? '' : modelValue"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      class="flex-1 min-w-0 bg-transparent text-xs text-[var(--app-foreground)] px-2 py-1.5 outline-none tabular-nums placeholder:text-[var(--app-muted)]/50"
      @input="handleInput"
      @keydown.stop
      @mousedown.stop
    />

    <!-- Suffix -->
    <span
      v-if="suffix"
      class="text-xs text-[var(--app-muted)] pr-2 shrink-0 border-l border-[var(--app-border)] pl-2 py-1.5"
    >{{ suffix }}</span>
  </div>
</template>

<style scoped>
/* Hide number input spinners */
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
