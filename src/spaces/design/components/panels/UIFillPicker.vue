<script setup lang="ts">
/**
 * UIFillPicker - Figma-like fill editor with tabbed interface
 * Supports solid colors, linear gradients, and radial gradients
 * Features: draggable stops, add/remove stops, per-stop opacity
 *
 * TODO: Add on-canvas gradient handles (like Figma)
 * - Draw interactive handles on selected shape when editing gradient
 * - Linear: two endpoints to control angle and position
 * - Radial: center point + radius handle
 * - Requires custom Fabric.js control overlay implementation
 */
import type { Fill, Gradient, GradientStop, LinearGradient, RadialGradient } from '~/types/design'

interface Props {
  modelValue: Fill
  allowGradient?: boolean
  selectionKey?: string
  stickyOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  allowGradient: true,
  selectionKey: '',
  stickyOpen: true,
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: Fill): void
}>()

// Selected stop index for gradient editing
const selectedStopIndex = ref(0)

// Dragging state
const isDraggingStop = ref(false)
const gradientBarRef = ref<HTMLElement | null>(null)

// Store drag handlers for cleanup
let currentMoveHandler: ((e: MouseEvent) => void) | null = null
let currentUpHandler: (() => void) | null = null

const cleanupDragHandlers = () => {
  if (currentMoveHandler) {
    document.removeEventListener('mousemove', currentMoveHandler, true)
    currentMoveHandler = null
  }
  if (currentUpHandler) {
    document.removeEventListener('mouseup', currentUpHandler, true)
    currentUpHandler = null
  }
  isDraggingStop.value = false
}

onUnmounted(() => {
  cleanupDragHandlers()
})

onMounted(() => {
  window.addEventListener('resize', updatePopoverAlign)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePopoverAlign)
})

const popoverOpen = ref(false)
const swatchTriggerRef = ref<HTMLElement | null>(null)
const popoverAlign = ref<'start' | 'end'>('start')

function updatePopoverAlign() {
  if (typeof window === 'undefined') return
  const trigger = swatchTriggerRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  popoverAlign.value = spaceBelow >= 420 || spaceBelow >= spaceAbove ? 'start' : 'end'
}

const popoverContent = computed(() => {
  const baseContent = {
    side: 'left' as const,
    align: popoverAlign.value,
    sideOffset: 8,
    alignOffset: 0,
    collisionPadding: 12,
    avoidCollisions: true,
  }

  if (!props.stickyOpen) return baseContent

  return {
    ...baseContent,
    onInteractOutside: (event: Event) => {
      const target = event.target as HTMLElement | null
      // Keep the picker open when interacting outside, except when clicking trigger again.
      if (target?.closest?.('[data-color-swatch-trigger="true"]')) return
      event.preventDefault()
    },
  }
})

watch(
  () => props.selectionKey,
  () => {
    popoverOpen.value = false
  }
)

watch(popoverOpen, (open) => {
  if (!open) return
  nextTick(() => {
    updatePopoverAlign()
  })
})

// Determine fill type
const rawFillType = computed(() => {
  if (typeof props.modelValue === 'string') return 'solid'
  return props.modelValue?.type || 'solid'
})
const supportsGradient = computed(() => props.allowGradient !== false)
const fillType = computed(() => supportsGradient.value ? rawFillType.value : 'solid')

// Get solid color (either direct or first gradient stop)
const solidColor = computed<string>({
  get: (): string => {
    if (typeof props.modelValue === 'string') return props.modelValue
    if (props.modelValue?.stops?.length) return props.modelValue.stops[0]?.color ?? '#e5e7eb'
    return '#e5e7eb'
  },
  set: (color: string) => {
    emit('update:modelValue', color)
  }
})

// Get the currently selected gradient stop color
const selectedStopColor = computed<string>({
  get: (): string => {
    if (typeof props.modelValue === 'string') return props.modelValue
    const stops = props.modelValue?.stops || []
    return stops[selectedStopIndex.value]?.color || '#e5e7eb'
  },
  set: (color: string) => {
    if (typeof props.modelValue === 'string') return
    updateStopColor(selectedStopIndex.value, color)
  }
})

// Gradient angle for linear gradients
const gradientAngle = computed({
  get: () => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'linear') {
      return (props.modelValue as LinearGradient).angle
    }
    return 90
  },
  set: (angle: number) => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'linear') {
      emit('update:modelValue', { ...props.modelValue, angle } as LinearGradient)
    }
  }
})

// Radial gradient properties
const radialCenterX = computed({
  get: () => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      return Math.round((props.modelValue as RadialGradient).centerX * 100)
    }
    return 50
  },
  set: (value: number) => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      emit('update:modelValue', { ...props.modelValue, centerX: value / 100 } as RadialGradient)
    }
  }
})

const radialCenterY = computed({
  get: () => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      return Math.round((props.modelValue as RadialGradient).centerY * 100)
    }
    return 50
  },
  set: (value: number) => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      emit('update:modelValue', { ...props.modelValue, centerY: value / 100 } as RadialGradient)
    }
  }
})

const radialRadius = computed({
  get: () => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      return Math.round((props.modelValue as RadialGradient).radius * 100)
    }
    return 50
  },
  set: (value: number) => {
    if (typeof props.modelValue !== 'string' && props.modelValue?.type === 'radial') {
      emit('update:modelValue', { ...props.modelValue, radius: value / 100 } as RadialGradient)
    }
  }
})

// Gradient stops
const gradientStops = computed(() => {
  if (typeof props.modelValue === 'string') {
    return [
      { offset: 0, color: props.modelValue },
      { offset: 1, color: '#000000' }
    ]
  }
  return props.modelValue?.stops || [
    { offset: 0, color: '#e5e7eb' },
    { offset: 1, color: '#000000' }
  ]
})

// Switch to gradient - preserves existing stops when switching types
const switchToGradient = (type: 'linear' | 'radial') => {
  // Preserve existing stops if we're already a gradient
  const isCurrentlyGradient = typeof props.modelValue !== 'string' && props.modelValue?.stops?.length
  const existingStops = isCurrentlyGradient ? [...props.modelValue.stops] : null

  const baseColor = typeof props.modelValue === 'string' ? props.modelValue : '#e5e7eb'

  // Use existing stops or create default ones
  const stops = existingStops || [
    { offset: 0, color: baseColor },
    { offset: 1, color: '#000000' }
  ]

  if (type === 'linear') {
    // Preserve angle if coming from linear gradient
    const existingAngle = isCurrentlyGradient && props.modelValue.type === 'linear'
      ? (props.modelValue as LinearGradient).angle
      : 90

    emit('update:modelValue', {
      type: 'linear',
      angle: existingAngle,
      stops
    } as LinearGradient)
  } else {
    // Preserve radial properties if coming from radial gradient
    const existingRadial = isCurrentlyGradient && props.modelValue.type === 'radial'
      ? props.modelValue as RadialGradient
      : null

    emit('update:modelValue', {
      type: 'radial',
      centerX: existingRadial?.centerX ?? 0.5,
      centerY: existingRadial?.centerY ?? 0.5,
      radius: existingRadial?.radius ?? 0.5,
      stops
    } as RadialGradient)
  }

  // Keep selected stop index if still valid
  if (selectedStopIndex.value >= stops.length) {
    selectedStopIndex.value = 0
  }
}

// Switch back to solid
const switchToSolid = () => {
  const color = gradientStops.value[0]?.color || '#e5e7eb'
  emit('update:modelValue', color)
}

// Update a gradient stop color
const updateStopColor = (index: number, color: string) => {
  if (typeof props.modelValue === 'string') return

  const newStops = [...(props.modelValue.stops || [])]
  const currentStop = newStops[index]
  if (currentStop) {
    newStops[index] = { ...currentStop, color }
    emit('update:modelValue', { ...props.modelValue, stops: newStops } as Gradient)
  }
}

// Update a gradient stop offset
const updateStopOffset = (index: number, offset: number) => {
  if (typeof props.modelValue === 'string') return

  const newStops = [...(props.modelValue.stops || [])]
  const currentStop = newStops[index]
  if (!currentStop) return

  // Create the updated stop object
  const updatedStop: GradientStop = { ...currentStop, offset: Math.max(0, Math.min(1, offset)) }
  newStops[index] = updatedStop
  // Sort stops by offset
  newStops.sort((a, b) => a.offset - b.offset)
  // Find where our updated stop ended up after sorting
  const newIndex = newStops.indexOf(updatedStop)
  if (newIndex !== -1) selectedStopIndex.value = newIndex

  emit('update:modelValue', { ...props.modelValue, stops: newStops } as Gradient)
}

// Add a new gradient stop
const addStop = () => {
  if (typeof props.modelValue === 'string') return

  const stops = [...(props.modelValue.stops || [])]
  // Find the midpoint with the largest gap
  let maxGap = 0
  let insertOffset = 0.5
  let insertColor = '#808080'

  for (let i = 0; i < stops.length - 1; i++) {
    const currStop = stops[i]
    const nextStop = stops[i + 1]
    if (!currStop || !nextStop) continue
    const gap = nextStop.offset - currStop.offset
    if (gap > maxGap) {
      maxGap = gap
      insertOffset = (currStop.offset + nextStop.offset) / 2
      // Interpolate color (simple average)
      insertColor = interpolateColor(currStop.color, nextStop.color, 0.5)
    }
  }

  const newStop: GradientStop = { offset: insertOffset, color: insertColor }
  stops.push(newStop)
  stops.sort((a, b) => a.offset - b.offset)

  selectedStopIndex.value = stops.findIndex(s => s.offset === insertOffset)
  emit('update:modelValue', { ...props.modelValue, stops } as Gradient)
}

// Remove a gradient stop
const removeStop = (index: number) => {
  if (typeof props.modelValue === 'string') return
  if (props.modelValue.stops.length <= 2) return // Minimum 2 stops

  const newStops = props.modelValue.stops.filter((_, i) => i !== index)
  if (selectedStopIndex.value >= newStops.length) {
    selectedStopIndex.value = newStops.length - 1
  }
  emit('update:modelValue', { ...props.modelValue, stops: newStops } as Gradient)
}

// Simple color interpolation
const interpolateColor = (color1: string, color2: string, t: number): string => {
  const first = parseColor(color1) || { r: 128, g: 128, b: 128, a: 1 }
  const second = parseColor(color2) || { r: 128, g: 128, b: 128, a: 1 }
  const ratio = clamp01(t)

  return rgbaToStoreString({
    r: first.r + (second.r - first.r) * ratio,
    g: first.g + (second.g - first.g) * ratio,
    b: first.b + (second.b - first.b) * ratio,
    a: first.a + (second.a - first.a) * ratio,
  })
}

// Handle stop drag start
const handleStopDragStart = (index: number, e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()

  // Clean up any existing handlers
  cleanupDragHandlers()

  selectedStopIndex.value = index
  isDraggingStop.value = true

  currentMoveHandler = (moveEvent: MouseEvent) => {
    if (!gradientBarRef.value || !isDraggingStop.value) return

    const rect = gradientBarRef.value.getBoundingClientRect()
    const x = moveEvent.clientX - rect.left
    const offset = Math.max(0, Math.min(1, x / rect.width))
    updateStopOffset(selectedStopIndex.value, offset)
  }

  currentUpHandler = () => {
    cleanupDragHandlers()
  }

  // Use capture phase to receive events before popover's .stop modifiers block them
  document.addEventListener('mousemove', currentMoveHandler, true)
  document.addEventListener('mouseup', currentUpHandler, true)
}

// Handle click on gradient bar to add stop
const handleBarClick = (e: MouseEvent) => {
  if (isDraggingStop.value) return
  if (!gradientBarRef.value) return
  if (typeof props.modelValue === 'string') return

  const rect = gradientBarRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const offset = Math.max(0, Math.min(1, x / rect.width))

  // Check if clicking near an existing stop
  const stops = props.modelValue.stops || []
  const nearbyStop = stops.findIndex(s => Math.abs(s.offset - offset) < 0.05)
  if (nearbyStop !== -1) {
    selectedStopIndex.value = nearbyStop
    return
  }

  // Add new stop at click position
  const insertColor = getColorAtOffset(offset)
  const newStop: GradientStop = { offset, color: insertColor }
  const newStops = [...stops, newStop].sort((a, b) => a.offset - b.offset)

  selectedStopIndex.value = newStops.findIndex(s => s.offset === offset)
  emit('update:modelValue', { ...props.modelValue, stops: newStops } as Gradient)
}

// Get interpolated color at offset
const getColorAtOffset = (offset: number): string => {
  const stops = gradientStops.value
  if (stops.length === 0) return '#808080'
  const firstStop = stops[0]
  const lastStop = stops[stops.length - 1]
  if (!firstStop || !lastStop) return '#808080'
  if (offset <= firstStop.offset) return firstStop.color
  if (offset >= lastStop.offset) return lastStop.color

  for (let i = 0; i < stops.length - 1; i++) {
    const currStop = stops[i]
    const nextStop = stops[i + 1]
    if (!currStop || !nextStop) continue
    if (offset >= currStop.offset && offset <= nextStop.offset) {
      const t = (offset - currStop.offset) / (nextStop.offset - currStop.offset)
      return interpolateColor(currStop.color, nextStop.color, t)
    }
  }
  return '#808080'
}

// CSS gradient preview
const gradientPreview = computed(() => {
  if (!supportsGradient.value) {
    return solidColor.value
  }

  if (typeof props.modelValue === 'string') {
    return props.modelValue
  }

  const stops = [...gradientStops.value]
    .sort((a, b) => a.offset - b.offset)
    .map(s => `${s.color} ${s.offset * 100}%`)
    .join(', ')

  if (props.modelValue?.type === 'linear') {
    return `linear-gradient(${gradientAngle.value}deg, ${stops})`
  } else if (props.modelValue?.type === 'radial') {
    return `radial-gradient(circle, ${stops})`
  }

  return props.modelValue
})

// Horizontal gradient for the bar (always left-to-right)
const barGradient = computed(() => {
  const stops = [...gradientStops.value]
    .sort((a, b) => a.offset - b.offset)
    .map(s => `${s.color} ${s.offset * 100}%`)
    .join(', ')
  return `linear-gradient(90deg, ${stops})`
})

// Fill type tabs
const fillTabs = [
  { value: 'solid', icon: 'i-lucide-square', title: 'Solid Color' },
  { value: 'linear', icon: 'i-lucide-arrow-right', title: 'Linear Gradient' },
  { value: 'radial', icon: 'i-lucide-circle-dot', title: 'Radial Gradient' },
]

const handleTabChange = (type: string) => {
  if (type === 'solid') switchToSolid()
  else switchToGradient(type as 'linear' | 'radial')
}

type ColorFormatMode = 'hex' | 'rgb' | 'hsl' | 'css'

interface RGBAColor {
  r: number
  g: number
  b: number
  a: number
}

const colorFormat = ref<ColorFormatMode>('hex')

const colorFormatOptions = [
  { label: 'Hex', value: 'hex' as const },
  { label: 'RGB', value: 'rgb' as const },
  { label: 'HSL', value: 'hsl' as const },
  { label: 'CSS', value: 'css' as const },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const clamp01 = (value: number) => clamp(value, 0, 1)
const clamp255 = (value: number) => Math.round(clamp(value, 0, 255))

const normalizeHex = (hex: string): string | null => {
  const raw = hex.trim().replace(/^#/, '')
  if (![3, 4, 6, 8].includes(raw.length)) return null
  const expanded = (raw.length === 3 || raw.length === 4)
    ? raw.split('').map(ch => ch + ch).join('')
    : raw
  if (!/^[0-9a-fA-F]+$/.test(expanded)) return null
  return expanded.toUpperCase()
}

const parseHex = (hex: string): RGBAColor | null => {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  const a = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1
  if ([r, g, b, a].some(v => Number.isNaN(v))) return null
  return { r, g, b, a: clamp01(a) }
}

const parseNumberList = (value: string): number[] => {
  return (value.match(/-?\d*\.?\d+/g) || []).map(Number).filter(n => Number.isFinite(n))
}

const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp01(s)
  const light = clamp01(l)
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x]

  return {
    r: clamp255((r1 + m) * 255),
    g: clamp255((g1 + m) * 255),
    b: clamp255((b1 + m) * 255),
  }
}

const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  const rn = clamp255(r) / 255
  const gn = clamp255(g) / 255
  const bn = clamp255(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }

  if (h < 0) h += 360
  return { h, s, l }
}

const rgbToHsv = (r: number, g: number, b: number): { h: number; s: number; v: number } => {
  const rn = clamp255(r) / 255
  const gn = clamp255(g) / 255
  const bn = clamp255(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  const s = max === 0 ? 0 : delta / max
  const v = max

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }

  if (h < 0) h += 360
  return { h, s, v }
}

const hsvToRgb = (h: number, s: number, v: number): { r: number; g: number; b: number } => {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp01(s)
  const value = clamp01(v)
  const c = value * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x]

  return {
    r: clamp255((r1 + m) * 255),
    g: clamp255((g1 + m) * 255),
    b: clamp255((b1 + m) * 255),
  }
}

const linearToSrgb = (value: number) => {
  const v = clamp01(value)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - 0.055
}

const oklchToRgb = (L: number, C: number, H: number): { r: number; g: number; b: number } => {
  const l = clamp01(L)
  const c = Math.max(0, C)
  const hRad = (H * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b2 = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b2
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b2
  const s_ = l - 0.0894841775 * a - 1.291485548 * b2

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const rl = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const gl = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return {
    r: clamp255(linearToSrgb(rl) * 255),
    g: clamp255(linearToSrgb(gl) * 255),
    b: clamp255(linearToSrgb(bl) * 255),
  }
}

const parseRgb = (value: string): RGBAColor | null => {
  const nums = parseNumberList(value)
  if (nums.length < 3) return null
  const r = clamp255(nums[0] ?? 0)
  const g = clamp255(nums[1] ?? 0)
  const b = clamp255(nums[2] ?? 0)
  const alpha = nums.length >= 4 ? clamp01((nums[3] ?? 1) > 1 ? (nums[3] ?? 1) / 100 : (nums[3] ?? 1)) : 1
  return { r, g, b, a: alpha }
}

const parseHsl = (value: string): RGBAColor | null => {
  const nums = parseNumberList(value)
  if (nums.length < 3) return null
  const h = nums[0] ?? 0
  const sRaw = nums[1] ?? 0
  const lRaw = nums[2] ?? 0
  const s = sRaw > 1 ? sRaw / 100 : sRaw
  const l = lRaw > 1 ? lRaw / 100 : lRaw
  const alpha = nums.length >= 4 ? clamp01((nums[3] ?? 1) > 1 ? (nums[3] ?? 1) / 100 : (nums[3] ?? 1)) : 1
  const rgb = hslToRgb(h, s, l)
  return { ...rgb, a: alpha }
}

const parseOklch = (value: string): RGBAColor | null => {
  const nums = parseNumberList(value)
  if (nums.length < 3) return null
  const lRaw = nums[0] ?? 0
  const c = Math.max(0, nums[1] ?? 0)
  const h = nums[2] ?? 0
  const l = lRaw > 1 ? lRaw / 100 : lRaw
  const alpha = nums.length >= 4 ? clamp01((nums[3] ?? 1) > 1 ? (nums[3] ?? 1) / 100 : (nums[3] ?? 1)) : 1
  const rgb = oklchToRgb(l, c, h)
  return { ...rgb, a: alpha }
}

const parseColor = (value: string): RGBAColor | null => {
  const input = value.trim()
  if (!input) return null
  if (input.startsWith('#')) return parseHex(input)
  if (input.startsWith('rgb')) return parseRgb(input)
  if (input.startsWith('hsl')) return parseHsl(input)
  if (input.startsWith('oklch')) return parseOklch(input)
  return parseHex(input) || parseRgb(input) || parseHsl(input) || parseOklch(input)
}

const rgbaToHex = (color: RGBAColor) => {
  return `#${clamp255(color.r).toString(16).padStart(2, '0')}${clamp255(color.g).toString(16).padStart(2, '0')}${clamp255(color.b).toString(16).padStart(2, '0')}`.toUpperCase()
}

const rgbaToStoreString = (color: RGBAColor) => {
  const alpha = clamp01(color.a)
  if (alpha >= 0.999) return rgbaToHex(color)
  const alphaText = Number(alpha.toFixed(3)).toString()
  return `rgba(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)}, ${alphaText})`
}

// Current color for the picker
const currentPickerColor = computed<string>(() => {
  return fillType.value === 'solid' ? solidColor.value : selectedStopColor.value
})

const currentColorRgba = computed<RGBAColor>(() => {
  return parseColor(currentPickerColor.value) || { r: 229, g: 231, b: 235, a: 1 }
})

const hexValue = computed({
  get: () => rgbaToHex(currentColorRgba.value).replace('#', ''),
  set: (value: string) => {
    const parsed = parseHex(value.startsWith('#') ? value : `#${value}`)
    if (!parsed) return
    applyColorRgba({ ...parsed, a: currentColorRgba.value.a })
  }
})

const cssValue = computed({
  get: () => {
    const color = currentColorRgba.value
    const alphaText = Number(clamp01(color.a).toFixed(3)).toString()
    return `rgba(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)}, ${alphaText})`
  },
  set: (value: string) => {
    const parsed = parseColor(value)
    if (!parsed) return
    applyColorRgba(parsed)
  }
})

const applyRgbChannels = (r: number, g: number, b: number) => {
  applyColorRgba({
    r: clamp255(r),
    g: clamp255(g),
    b: clamp255(b),
    a: currentColorRgba.value.a,
  })
}

const currentHsl = computed(() => rgbToHsl(
  currentColorRgba.value.r,
  currentColorRgba.value.g,
  currentColorRgba.value.b
))

const applyHslChannels = (h: number, s: number, l: number) => {
  const rgb = hslToRgb(h, clamp01(s / 100), clamp01(l / 100))
  applyColorRgba({
    ...rgb,
    a: currentColorRgba.value.a,
  })
}

const rgbR = computed({
  get: () => clamp255(currentColorRgba.value.r),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyRgbChannels(value, currentColorRgba.value.g, currentColorRgba.value.b)
  }
})

const rgbG = computed({
  get: () => clamp255(currentColorRgba.value.g),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyRgbChannels(currentColorRgba.value.r, value, currentColorRgba.value.b)
  }
})

const rgbB = computed({
  get: () => clamp255(currentColorRgba.value.b),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyRgbChannels(currentColorRgba.value.r, currentColorRgba.value.g, value)
  }
})

const hslH = computed({
  get: () => Math.round(currentHsl.value.h),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyHslChannels(value, currentHsl.value.s * 100, currentHsl.value.l * 100)
  }
})

const hslS = computed({
  get: () => Math.round(currentHsl.value.s * 100),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyHslChannels(currentHsl.value.h, value, currentHsl.value.l * 100)
  }
})

const hslL = computed({
  get: () => Math.round(currentHsl.value.l * 100),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    applyHslChannels(currentHsl.value.h, currentHsl.value.s * 100, value)
  }
})

// Opacity for current selection (0-100)
const currentOpacity = computed({
  get: () => Math.round(clamp01(currentColorRgba.value.a) * 100),
  set: (value: number) => {
    applyColorRgba({
      ...currentColorRgba.value,
      a: clamp01(value / 100),
    })
  }
})

const currentHsv = computed(() => rgbToHsv(
  currentColorRgba.value.r,
  currentColorRgba.value.g,
  currentColorRgba.value.b
))

const svAreaRef = ref<HTMLElement | null>(null)
const hueBarRef = ref<HTMLElement | null>(null)
const alphaBarRef = ref<HTMLElement | null>(null)

const svBackground = computed(() => `hsl(${Math.round(currentHsv.value.h)}, 100%, 50%)`)
const hueHandleLeft = computed(() => `${(currentHsv.value.h / 360) * 100}%`)
const svHandleLeft = computed(() => `${currentHsv.value.s * 100}%`)
const svHandleTop = computed(() => `${(1 - currentHsv.value.v) * 100}%`)
const alphaHandleLeft = computed(() => `${clamp01(currentColorRgba.value.a) * 100}%`)
const alphaForeground = computed(() => {
  const { r, g, b } = currentColorRgba.value
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0) 0%, rgba(${r}, ${g}, ${b}, 1) 100%)`
})

// Native color picker ref
const nativeColorPickerRef = ref<HTMLInputElement | null>(null)
const isOpeningNativePicker = ref(false)

let opacityMoveHandler: ((e: MouseEvent) => void) | null = null
let opacityUpHandler: (() => void) | null = null
let pickerMoveHandler: ((e: MouseEvent) => void) | null = null
let pickerUpHandler: (() => void) | null = null

const cleanupOpacityHandlers = () => {
  if (opacityMoveHandler) {
    document.removeEventListener('mousemove', opacityMoveHandler, true)
    opacityMoveHandler = null
  }
  if (opacityUpHandler) {
    document.removeEventListener('mouseup', opacityUpHandler, true)
    opacityUpHandler = null
  }
}

const cleanupPickerHandlers = () => {
  if (pickerMoveHandler) {
    document.removeEventListener('mousemove', pickerMoveHandler, true)
    pickerMoveHandler = null
  }
  if (pickerUpHandler) {
    document.removeEventListener('mouseup', pickerUpHandler, true)
    pickerUpHandler = null
  }
}

onUnmounted(() => {
  cleanupOpacityHandlers()
  cleanupPickerHandlers()
})

const startOpacityScrub = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  cleanupOpacityHandlers()

  const startX = event.clientX
  const startValue = currentOpacity.value

  opacityMoveHandler = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientX - startX
    currentOpacity.value = Math.round(clamp(startValue + delta, 0, 100))
  }

  opacityUpHandler = () => {
    cleanupOpacityHandlers()
  }

  document.addEventListener('mousemove', opacityMoveHandler, true)
  document.addEventListener('mouseup', opacityUpHandler, true)
}

const applyColorRgba = (color: RGBAColor) => {
  const colorText = rgbaToStoreString(color)
  if (fillType.value === 'solid') {
    solidColor.value = colorText
  } else {
    selectedStopColor.value = colorText
  }
}

const updateFromSvPointer = (event: MouseEvent) => {
  const area = svAreaRef.value
  if (!area) return
  const rect = area.getBoundingClientRect()
  const x = clamp01((event.clientX - rect.left) / rect.width)
  const y = clamp01((event.clientY - rect.top) / rect.height)
  const rgb = hsvToRgb(currentHsv.value.h, x, 1 - y)
  applyColorRgba({ ...rgb, a: currentColorRgba.value.a })
}

const updateFromHuePointer = (event: MouseEvent) => {
  const bar = hueBarRef.value
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const ratio = clamp01((event.clientX - rect.left) / rect.width)
  const rgb = hsvToRgb(ratio * 360, currentHsv.value.s, currentHsv.value.v)
  applyColorRgba({ ...rgb, a: currentColorRgba.value.a })
}

const updateFromAlphaPointer = (event: MouseEvent) => {
  const bar = alphaBarRef.value
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  const ratio = clamp01((event.clientX - rect.left) / rect.width)
  applyColorRgba({ ...currentColorRgba.value, a: ratio })
}

const startPickerDrag = (event: MouseEvent, updater: (e: MouseEvent) => void) => {
  event.preventDefault()
  event.stopPropagation()
  cleanupPickerHandlers()
  updater(event)
  pickerMoveHandler = (moveEvent: MouseEvent) => updater(moveEvent)
  pickerUpHandler = () => cleanupPickerHandlers()
  document.addEventListener('mousemove', pickerMoveHandler, true)
  document.addEventListener('mouseup', pickerUpHandler, true)
}

const applyPickedColor = (color: string) => {
  const parsed = parseColor(color)
  if (!parsed) return
  applyColorRgba({ ...parsed, a: currentColorRgba.value.a })
}

// Open native color picker (has built-in eyedropper on most systems)
const openNativeColorPicker = async () => {
  if (isOpeningNativePicker.value) return
  isOpeningNativePicker.value = true

  try {
    // Prefer the Tauri native system picker (macOS Colors panel).
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const picked = await invoke<string | null>('open_system_color_picker', {
        initialHex: rgbaToHex(currentColorRgba.value)
      })
      if (picked) {
        applyPickedColor(picked)
      }
      return
    } catch {
      // Fallback to browser/native HTML color picker.
    }

    const nativePicker = nativeColorPickerRef.value
    if (!nativePicker) return
    if (typeof nativePicker.showPicker === 'function') {
      nativePicker.showPicker()
    } else {
      nativePicker.click()
    }
  } finally {
    isOpeningNativePicker.value = false
  }
}

// Handle native color picker change
const handleNativeColorChange = (event: Event) => {
  const color = (event.target as HTMLInputElement).value
  applyPickedColor(color)
}

const displayStopHex = (color: string) => {
  const parsed = parseColor(color)
  return parsed ? rgbaToHex(parsed).replace('#', '') : color.replace('#', '').toUpperCase()
}

const displayStopOpacity = (color: string) => {
  const parsed = parseColor(color)
  if (!parsed) return 100
  return Math.round(clamp01(parsed.a) * 100)
}
</script>

<template>
  <div class="space-y-2 overflow-hidden">
    <!-- Color Swatch + Input Row -->
    <div class="flex items-center gap-2 min-w-0">
      <Popover v-model:open="popoverOpen" :content="popoverContent">
        <div
          ref="swatchTriggerRef"
          data-color-swatch-trigger="true"
          class="size-6 rounded border border-app cursor-pointer shrink-0 shadow-sm"
          :style="{ background: gradientPreview }"
        />
        <template #content>
          <div
            class="w-[304px] max-w-[calc(100vw-24px)] max-h-[72vh] overflow-y-auto overscroll-contain bg-[#2c2c2c] p-3"
            @mousedown.stop
            @mousemove.stop
            @mouseup.stop
          >
            <!-- Fill Type Tabs - Figma Style -->
            <div v-if="supportsGradient" class="flex items-center gap-0.5 mb-3 p-0.5 bg-[#1e1e1e] rounded">
              <button
                v-for="tab in fillTabs"
                :key="tab.value"
                class="flex items-center justify-center size-7 rounded transition-colors"
                :class="fillType === tab.value
                  ? 'bg-[#3c3c3c] text-white'
                  : 'text-[#8c8c8c] hover:text-white hover:bg-[#3c3c3c]/50'"
                :title="tab.title"
                @click="handleTabChange(tab.value)"
              >
                <Icon :name="tab.icon" class="size-4" />
              </button>
            </div>

            <!-- Figma-style Color Picker -->
            <div class="mb-3">
              <div
                ref="svAreaRef"
                class="relative w-full aspect-square rounded-md border border-[#161616] overflow-hidden cursor-crosshair shadow-inner"
                :style="{ background: svBackground }"
                @mousedown="startPickerDrag($event, updateFromSvPointer)"
              >
                <div class="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                <div
                  class="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
                  :style="{ left: svHandleLeft, top: svHandleTop }"
                >
                  <div class="absolute inset-0 rounded-full border border-black/15" />
                </div>
              </div>
            </div>

            <!-- Hue + Alpha Sliders -->
            <div class="flex items-center gap-2 mb-3">
              <!-- Native color picker (hidden) -->
              <input
                ref="nativeColorPickerRef"
                type="color"
                :value="rgbaToHex(currentColorRgba)"
                class="sr-only"
                @input="handleNativeColorChange"
              >
              <button
                class="flex items-center justify-center size-8 rounded bg-transparent text-[#d8d8d8] hover:text-white transition-colors shrink-0"
                title="Pick color from screen"
                @click="openNativeColorPicker"
              >
                <Icon name="i-lucide-pipette" class="size-4" />
              </button>
              <div class="flex-1 space-y-2">
                <div
                  ref="hueBarRef"
                  class="relative h-7 rounded-full border border-[#4a4a4a] cursor-ew-resize overflow-hidden"
                  @mousedown="startPickerDrag($event, updateFromHuePointer)"
                >
                  <div class="absolute inset-0 bg-[linear-gradient(90deg,#ff3b30_0%,#ff9500_16%,#ffcc00_33%,#34c759_50%,#00c7be_66%,#007aff_82%,#af52de_92%,#ff2d55_100%)]" />
                  <div
                    class="absolute top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] pointer-events-none"
                    :style="{ left: hueHandleLeft }"
                  >
                    <div class="absolute inset-[4px] rounded-full bg-transparent" />
                  </div>
                </div>
                <div
                  ref="alphaBarRef"
                  class="relative h-7 rounded-full border border-[#4a4a4a] cursor-ew-resize overflow-hidden"
                  @mousedown="startPickerDrag($event, updateFromAlphaPointer)"
                >
                  <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%208%208%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%200h4v4H0V0zm4%204h4v4H4V4z%22%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.35%22%2F%3E%3C%2Fsvg%3E')] bg-[#8890a0]/25" />
                  <div class="absolute inset-0" :style="{ background: alphaForeground }" />
                  <div
                    class="absolute top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] pointer-events-none"
                    :style="{ left: alphaHandleLeft }"
                  >
                    <div class="absolute inset-[4px] rounded-full bg-transparent" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Gradient Bar with Draggable Stops -->
            <template v-if="supportsGradient && fillType !== 'solid'">
              <div class="relative mb-4 py-2">
                <!-- Gradient Bar -->
                <div
                  ref="gradientBarRef"
                  class="relative h-3 rounded cursor-crosshair"
                  :style="{ background: barGradient }"
                  @click="handleBarClick"
                >
                  <!-- Checkerboard background for transparency -->
                  <div class="absolute inset-0 rounded -z-10 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%208%208%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%200h4v4H0V0zm4%204h4v4H4V4z%22%20fill%3D%22%23808080%22%20fill-opacity%3D%22.3%22%2F%3E%3C%2Fsvg%3E')]" />
                </div>

                <!-- Stop Handles - positioned outside the bar click area -->
                <div
                  v-for="(stop, i) in gradientStops"
                  :key="i"
                  class="absolute top-1/2 -translate-y-1/2 cursor-ew-resize z-10"
                  :style="{ left: `${stop.offset * 100}%` }"
                  @mousedown.stop.prevent="handleStopDragStart(i, $event)"
                >
                  <!-- Larger hit area -->
                  <div class="relative -ml-2 w-4 h-6 flex items-center justify-center">
                    <!-- Stop marker - diamond shape like Figma -->
                    <div
                      class="w-3 h-3 rotate-45 border-2 transition-all shadow-md"
                      :class="selectedStopIndex === i
                        ? 'border-white scale-125 shadow-lg'
                        : 'border-[#666] hover:border-white'"
                      :style="{ backgroundColor: stop.color }"
                    />
                  </div>
                </div>
              </div>

              <!-- Angle Slider (Linear only) -->
              <div v-if="fillType === 'linear'" class="mb-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] text-[#8c8c8c]">Angle</span>
                  <input
                    v-model.number="gradientAngle"
                    type="number"
                    class="w-12 bg-[#1e1e1e] text-[10px] text-white text-right px-1 py-0.5 rounded outline-none"
                    min="0"
                    max="360"
                    @keydown.stop
                  >
                </div>
                <Slider v-model="gradientAngle" :min="0" :max="360" size="xs" />
              </div>

              <!-- Radial Controls -->
              <div v-if="fillType === 'radial'" class="mb-3 space-y-2">
                <!-- Center X -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] text-[#8c8c8c]">Center X</span>
                    <div class="flex items-center gap-0.5">
                      <input
                        v-model.number="radialCenterX"
                        type="number"
                        class="w-10 bg-[#1e1e1e] text-[10px] text-white text-right px-1 py-0.5 rounded outline-none"
                        min="0"
                        max="100"
                        @keydown.stop
                      >
                      <span class="text-[10px] text-[#8c8c8c]">%</span>
                    </div>
                  </div>
                  <Slider v-model="radialCenterX" :min="0" :max="100" size="xs" />
                </div>

                <!-- Center Y -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] text-[#8c8c8c]">Center Y</span>
                    <div class="flex items-center gap-0.5">
                      <input
                        v-model.number="radialCenterY"
                        type="number"
                        class="w-10 bg-[#1e1e1e] text-[10px] text-white text-right px-1 py-0.5 rounded outline-none"
                        min="0"
                        max="100"
                        @keydown.stop
                      >
                      <span class="text-[10px] text-[#8c8c8c]">%</span>
                    </div>
                  </div>
                  <Slider v-model="radialCenterY" :min="0" :max="100" size="xs" />
                </div>

                <!-- Radius -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] text-[#8c8c8c]">Radius</span>
                    <div class="flex items-center gap-0.5">
                      <input
                        v-model.number="radialRadius"
                        type="number"
                        class="w-10 bg-[#1e1e1e] text-[10px] text-white text-right px-1 py-0.5 rounded outline-none"
                        min="1"
                        max="100"
                        @keydown.stop
                      >
                      <span class="text-[10px] text-[#8c8c8c]">%</span>
                    </div>
                  </div>
                  <Slider v-model="radialRadius" :min="1" :max="100" size="xs" />
                </div>
              </div>
            </template>

            <!-- Value Row -->
            <div class="flex items-center gap-2">
              <div class="relative w-[68px] shrink-0">
                <select
                  v-model="colorFormat"
                  class="h-9 w-full appearance-none rounded-md border border-[#3f3f3f] bg-[#242424] pl-2 pr-6 text-[11px] text-white outline-none"
                  @mousedown.stop
                  @keydown.stop
                >
                  <option v-for="option in colorFormatOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <Icon name="i-lucide-chevron-down" class="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-[#9a9a9a] pointer-events-none" />
              </div>
              <template v-if="colorFormat === 'hex'">
                <div class="flex-1 min-w-0 rounded-md border border-[#3f3f3f] bg-[#242424] overflow-hidden">
                  <input
                    v-model="hexValue"
                    class="w-full bg-transparent text-[11px] font-mono text-white outline-none uppercase px-3 py-1.5"
                    maxlength="8"
                    @keydown.stop
                  >
                </div>
                <div
                  class="flex items-center justify-end gap-1 rounded-md border border-[#3f3f3f] bg-[#242424] px-2 py-1.5 w-[96px] cursor-ew-resize select-none"
                  title="Drag left/right to adjust opacity"
                  @mousedown="startOpacityScrub"
                >
                  <input
                    v-model.number="currentOpacity"
                    type="number"
                    class="w-10 bg-transparent text-[11px] font-mono text-white outline-none text-right cursor-text"
                    min="0"
                    max="100"
                    @mousedown.stop
                    @keydown.stop
                  >
                  <span class="text-[10px] text-[#a5a5a5]">%</span>
                </div>
              </template>
              <template v-else-if="colorFormat === 'css'">
                <div class="flex-1 min-w-0 rounded-md border border-[#3f3f3f] bg-[#242424] overflow-hidden">
                  <input
                    v-model="cssValue"
                    class="w-full bg-transparent text-[11px] font-mono text-white outline-none px-3 py-1.5"
                    @keydown.stop
                  >
                </div>
              </template>
              <template v-else-if="colorFormat === 'rgb'">
                <div class="flex-1 min-w-0 grid grid-cols-[1fr_1fr_1fr_1fr_auto] rounded-md border border-[#3f3f3f] bg-[#242424] overflow-hidden">
                  <input
                    v-model.number="rgbR"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="255"
                    @keydown.stop
                  >
                  <input
                    v-model.number="rgbG"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="255"
                    @keydown.stop
                  >
                  <input
                    v-model.number="rgbB"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="255"
                    @keydown.stop
                  >
                  <div
                    class="border-r border-[#3c3c3c] cursor-ew-resize"
                    title="Drag left/right to adjust opacity"
                    @mousedown="startOpacityScrub"
                  >
                    <input
                      v-model.number="currentOpacity"
                      type="number"
                      class="w-full h-full bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5"
                      min="0"
                      max="100"
                      @mousedown.stop
                      @keydown.stop
                    >
                  </div>
                  <div class="flex items-center justify-center px-2 text-[10px] text-[#a5a5a5]">%</div>
                </div>
              </template>
              <template v-else>
                <div class="flex-1 min-w-0 grid grid-cols-[1fr_1fr_1fr_1fr_auto] rounded-md border border-[#3f3f3f] bg-[#242424] overflow-hidden">
                  <input
                    v-model.number="hslH"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="360"
                    @keydown.stop
                  >
                  <input
                    v-model.number="hslS"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="100"
                    @keydown.stop
                  >
                  <input
                    v-model.number="hslL"
                    type="number"
                    class="bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5 border-r border-[#3c3c3c]"
                    min="0"
                    max="100"
                    @keydown.stop
                  >
                  <div
                    class="border-r border-[#3c3c3c] cursor-ew-resize"
                    title="Drag left/right to adjust opacity"
                    @mousedown="startOpacityScrub"
                  >
                    <input
                      v-model.number="currentOpacity"
                      type="number"
                      class="w-full h-full bg-transparent text-[11px] font-mono text-white outline-none text-center px-1 py-1.5"
                      min="0"
                      max="100"
                      @mousedown.stop
                      @keydown.stop
                    >
                  </div>
                  <div class="flex items-center justify-center px-2 text-[10px] text-[#a5a5a5]">%</div>
                </div>
              </template>
            </div>

            <!-- Gradient Stops List - Figma Style -->
            <template v-if="supportsGradient && fillType !== 'solid'">
              <div class="mt-3 pt-3 border-t border-[#3c3c3c]">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[10px] text-[#8c8c8c]">Color Stops</span>
                  <button
                    class="flex items-center justify-center size-5 rounded text-[#8c8c8c] hover:text-white hover:bg-[#3c3c3c] transition-colors"
                    title="Add Stop"
                    @click="addStop"
                  >
                    <Icon name="i-lucide-plus" class="size-3" />
                  </button>
                </div>
                <div class="space-y-1 max-h-32 overflow-y-auto">
                  <div
                    v-for="(stop, i) in gradientStops"
                    :key="i"
                    class="flex items-center gap-2 p-1.5 rounded transition-colors cursor-pointer"
                    :class="selectedStopIndex === i ? 'bg-[#3c3c3c]' : 'hover:bg-[#3c3c3c]/50'"
                    @click="selectedStopIndex = i"
                  >
                    <!-- Offset Input -->
                    <div class="flex items-center gap-0.5 bg-[#1e1e1e] rounded px-1 py-0.5 w-12">
                      <input
                        :value="Math.round(stop.offset * 100)"
                        type="number"
                        class="w-6 bg-transparent text-[10px] text-white outline-none text-right tabular-nums"
                        min="0"
                        max="100"
                        @input="(e) => updateStopOffset(i, parseInt((e.target as HTMLInputElement).value) / 100)"
                        @keydown.stop
                        @click.stop
                      >
                      <span class="text-[10px] text-[#8c8c8c]">%</span>
                    </div>

                    <!-- Color Swatch -->
                    <div
                      class="size-5 rounded border border-[#4c4c4c] shrink-0"
                      :style="{ backgroundColor: stop.color }"
                    />

                    <!-- Hex Value -->
                    <input
                      :value="displayStopHex(stop.color)"
                      class="flex-1 bg-transparent text-[10px] font-mono text-white outline-none uppercase"
                      maxlength="6"
                      @input="(e) => updateStopColor(i, `#${(e.target as HTMLInputElement).value}`)"
                      @keydown.stop
                      @click.stop
                    >

                    <!-- Stop Opacity -->
                    <div class="flex items-center gap-0.5 text-[10px] text-[#8c8c8c] w-10">
                      <span>{{ displayStopOpacity(stop.color) }}</span>
                      <span>%</span>
                    </div>

                    <!-- Delete Button -->
                    <button
                      v-if="gradientStops.length > 2"
                      class="flex items-center justify-center size-5 rounded text-[#8c8c8c] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove Stop"
                      @click.stop="removeStop(i)"
                    >
                      <Icon name="i-lucide-minus" class="size-3" />
                    </button>
                    <div v-else class="w-5" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </Popover>

      <!-- Inline Color/Gradient Display -->
      <div class="flex-1 min-w-0 overflow-hidden">
        <input
          v-if="fillType === 'solid'"
          v-model="solidColor"
          class="w-full text-xs font-mono uppercase bg-transparent border-none outline-none text-app"
          @keydown.stop
        >
        <span v-else class="text-[10px] text-app-muted block truncate">
          {{ fillType === 'linear' ? 'Linear' : 'Radial' }} Gradient
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom slider styling for dark popover */
:deep(.dark .slider-track) {
  background: #3c3c3c;
}

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
