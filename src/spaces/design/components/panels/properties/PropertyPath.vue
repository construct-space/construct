<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'

interface Props {
  selectedNodes: DesignNode[]
  isPathEditMode?: boolean
  isPathClosed?: boolean
  selectedPointIndex?: number | null
  selectedPointType?: 'M' | 'L' | 'C' | 'Q' | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'smoothAllCorners' | 'enterPathEdit' | 'exitPathEdit' | 'closePath' | 'openPath'): void
  (e: 'convertPoint', type: 'corner' | 'smooth' | 'asymmetric'): void
}>()

const selectedNodesRef = toRef(props, 'selectedNodes')
const { firstNode } = usePropertyHelpers(selectedNodesRef)

// Count corners (L commands) and curves (C/Q commands) in path
const pathStats = computed(() => {
  const node = firstNode.value
  if (!node || node.type !== 'path' || !node.pathData) {
    return { corners: 0, curves: 0, total: 0 }
  }

  const pathData = node.pathData
  const corners = (pathData.match(/\bL\s/g) || []).length
  let curves = (pathData.match(/\b[CQ]\s/g) || []).length
  const moves = (pathData.match(/\bM\s/g) || []).length

  const trimmed = pathData.trim()
  const isClosed = /Z\s*$/i.test(trimmed)
  if (isClosed && curves > 0) {
    const hasClosingCurve = /\bC\s+[^CLMQ]+Z\s*$/i.test(trimmed)
    if (hasClosingCurve) {
      curves -= 1
    }
  }

  return { corners, curves, total: corners + curves + moves }
})

const hasCorners = computed(() => pathStats.value.corners > 0)

// Determine current point type for the selected point
const currentPointType = computed(() => {
  if (props.selectedPointType === 'L' || props.selectedPointType === 'M') {
    return 'corner'
  } else if (props.selectedPointType === 'C' || props.selectedPointType === 'Q') {
    return 'curve'
  }
  return null
})

const lastAppliedType = ref<'corner' | 'smooth' | 'asymmetric' | null>(null)

const activeButtonType = computed(() => {
  if (currentPointType.value === 'corner') {
    return 'corner'
  }
  if (currentPointType.value === 'curve' && lastAppliedType.value) {
    return lastAppliedType.value
  }
  if (currentPointType.value === 'curve') {
    return 'smooth'
  }
  return null
})

watch(() => props.selectedPointIndex, () => {
  lastAppliedType.value = null
})

function handleConvert(type: 'corner' | 'smooth' | 'asymmetric') {
  lastAppliedType.value = type
  emit('convertPoint', type)
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Vector</p>

    <!-- Point type controls (shown when in edit mode) -->
    <div v-if="isPathEditMode" class="mb-3">
      <div class="flex gap-0.5 mb-2">
        <Tooltip text="No mirroring (corner)">
          <Button
            size="xs"
            :variant="activeButtonType === 'corner' ? 'soft' : 'ghost'"
            :color="activeButtonType === 'corner' ? 'primary' : 'neutral'"
            class="px-2"
            @click="handleConvert('corner')"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 16 L12 8 L20 16" stroke-linejoin="miter" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip text="Mirror angle and length (smooth)">
          <Button
            size="xs"
            :variant="activeButtonType === 'smooth' ? 'soft' : 'ghost'"
            :color="activeButtonType === 'smooth' ? 'primary' : 'neutral'"
            class="px-2"
            @click="handleConvert('smooth')"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="4" cy="12" r="2" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <circle cx="20" cy="12" r="2" />
              <path d="M6 12 L10 12 M14 12 L18 12" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip text="Mirror angle only (asymmetric)">
          <Button
            size="xs"
            :variant="activeButtonType === 'asymmetric' ? 'soft' : 'ghost'"
            :color="activeButtonType === 'asymmetric' ? 'primary' : 'neutral'"
            class="px-2"
            @click="handleConvert('asymmetric')"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <circle cx="21" cy="12" r="2" />
              <path d="M7 12 L10 12 M14 12 L19 12" />
            </svg>
          </Button>
        </Tooltip>
      </div>

      <!-- Selected point info -->
      <div v-if="selectedPointIndex !== null && selectedPointIndex !== undefined" class="text-[10px] text-[var(--app-muted)] mb-2">
        Point {{ selectedPointIndex + 1 }}
        <span v-if="activeButtonType === 'corner'" class="text-[var(--app-foreground)] ml-1">(corner)</span>
        <span v-else-if="activeButtonType === 'smooth'" class="text-[var(--app-foreground)] ml-1">(smooth)</span>
        <span v-else-if="activeButtonType === 'asymmetric'" class="text-[var(--app-foreground)] ml-1">(asymmetric)</span>
      </div>
    </div>

    <!-- Path stats (when not in edit mode) -->
    <div v-if="!isPathEditMode" class="text-[10px] text-[var(--app-muted)] mb-2 flex gap-3">
      <span>{{ pathStats.total }} points</span>
      <span v-if="pathStats.corners > 0">{{ pathStats.corners }} corners</span>
      <span v-if="pathStats.curves > 0">{{ pathStats.curves }} curves</span>
    </div>

    <!-- Path edit mode toggle -->
    <div class="flex gap-1 mb-2">
      <Tooltip :text="isPathEditMode ? 'Finish editing' : 'Edit path points (double-click)'">
        <Button
          icon="i-lucide-pen-tool"
          size="xs"
          :variant="isPathEditMode ? 'soft' : 'ghost'"
          :color="isPathEditMode ? 'primary' : 'neutral'"
          @click="isPathEditMode ? emit('exitPathEdit') : emit('enterPathEdit')"
        >
          {{ isPathEditMode ? 'Done' : 'Edit Path' }}
        </Button>
      </Tooltip>
    </div>

    <!-- Smooth corners button (when not in edit mode) -->
    <div v-if="!isPathEditMode && hasCorners" class="flex gap-1">
      <Tooltip text="Convert all sharp corners to smooth bezier curves">
        <Button
          icon="i-lucide-spline"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="emit('smoothAllCorners')"
        >
          Smooth All
        </Button>
      </Tooltip>
    </div>

    <!-- Close/Open path button (in edit mode) -->
    <div v-if="isPathEditMode" class="flex gap-1 mt-2">
      <Tooltip :text="isPathClosed ? 'Open the path (remove closing segment)' : 'Close the path (connect last to first point)'">
        <Button
          :icon="isPathClosed ? 'i-lucide-unlock' : 'i-lucide-lock'"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="isPathClosed ? emit('openPath') : emit('closePath')"
        >
          {{ isPathClosed ? 'Open Path' : 'Close Path' }}
        </Button>
      </Tooltip>
    </div>

    <!-- Tips (in edit mode) -->
    <div v-if="isPathEditMode" class="text-[10px] text-[var(--app-muted)] mt-2 space-y-1">
      <p><span class="text-[var(--app-foreground)]">Click</span> point to select</p>
      <p><span class="text-[var(--app-foreground)]">Drag</span> to move point/handle</p>
      <p><span class="text-[var(--app-foreground)]">Escape</span> to finish</p>
    </div>
  </div>
</template>
