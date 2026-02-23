<script setup lang="ts">
/**
 * PropertyImage - Image-specific properties (Object Fit, Position, Crop, AI Tools)
 */
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import UIScrubInput from '../../UIScrubInput.vue'

interface MediaFile {
  url: string
  name: string
  size: number
}

interface Media {
  id: number
  name: string
  type: string
  file?: MediaFile
}

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: number | string): void
}>()

// Freepik API for background removal
const { removeBackgroundAndSave, isProcessing, error } = useFreepikApi()
const toast = useToast()

// Media picker state
const showMediaPicker = ref(false)

// Get image URL from first selected node
const imageUrl = computed(() => {
  if (props.selectedNodes.length === 0) return null
  return props.selectedNodes[0]?.imageUrl || null
})

// Get the image name for filename generation
const imageName = computed(() => {
  if (props.selectedNodes.length === 0) return null
  return props.selectedNodes[0]?.name || 'image'
})

// Handle media selection from picker
function handleMediaSelect(media: Media) {
  if (media.file?.url) {
    emit('update', 'imageUrl', media.file.url)
    // Also update the node name to match the media name
    emit('update', 'name', media.name)
    toast.add({
      title: 'Image Changed',
      description: `Changed to ${media.name}`,
      color: 'success',
    })
  }
  showMediaPicker.value = false
}

// Handle background removal
async function handleRemoveBackground() {
  if (!imageUrl.value) return

  // Process the image (handles both public URLs and data URLs)
  const newUrl = await removeBackgroundAndSave(imageUrl.value, imageName.value || undefined)

  if (newUrl) {
    emit('update', 'imageUrl', newUrl)
    toast.add({
      title: 'Success',
      description: 'Background removed successfully',
      color: 'success',
    })
  } else if (error.value) {
    toast.add({
      title: 'Failed',
      description: error.value,
      color: 'error',
    })
  }
}

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed } = usePropertyHelpers(selectedNodesRef)

// Object Fit options with icons
const objectFitOptions = [
  { id: 'fill', label: 'Fill', icon: 'i-lucide-maximize', desc: 'Stretch to fill' },
  { id: 'contain', label: 'Contain', icon: 'i-lucide-shrink', desc: 'Fit entire image' },
  { id: 'cover', label: 'Cover', icon: 'i-lucide-expand', desc: 'Fill and crop' },
  { id: 'none', label: 'None', icon: 'i-lucide-image', desc: 'Original size' },
] as const

// Object Fit
const localObjectFit = computed({
  get: () => {
    const val = getValue(n => n.objectFit ?? 'fill')
    return isMixed(val) ? 'fill' : val
  },
  set: (v) => { emit('update', 'objectFit', v) }
})

// Object Position X (0-100, default 50)
const localPositionX = computed({
  get: () => {
    const val = getValue(n => n.objectPositionX ?? 50)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'objectPositionX', Number(v)) }
})

// Object Position Y (0-100, default 50)
const localPositionY = computed({
  get: () => {
    const val = getValue(n => n.objectPositionY ?? 50)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'objectPositionY', Number(v)) }
})

// Crop values (0-100)
const localCropTop = computed({
  get: () => {
    const val = getValue(n => n.cropTop ?? 0)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'cropTop', Number(v)) }
})

const localCropRight = computed({
  get: () => {
    const val = getValue(n => n.cropRight ?? 0)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'cropRight', Number(v)) }
})

const localCropBottom = computed({
  get: () => {
    const val = getValue(n => n.cropBottom ?? 0)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'cropBottom', Number(v)) }
})

const localCropLeft = computed({
  get: () => {
    const val = getValue(n => n.cropLeft ?? 0)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'cropLeft', Number(v)) }
})

// Quick position presets (like Figma's 9-point grid)
const positionPresets = [
  { x: 0, y: 0, label: 'Top Left' },
  { x: 50, y: 0, label: 'Top Center' },
  { x: 100, y: 0, label: 'Top Right' },
  { x: 0, y: 50, label: 'Center Left' },
  { x: 50, y: 50, label: 'Center' },
  { x: 100, y: 50, label: 'Center Right' },
  { x: 0, y: 100, label: 'Bottom Left' },
  { x: 50, y: 100, label: 'Bottom Center' },
  { x: 100, y: 100, label: 'Bottom Right' },
]

const setPositionPreset = (x: number, y: number) => {
  emit('update', 'objectPositionX', x)
  emit('update', 'objectPositionY', y)
}

const isPositionPresetActive = (x: number, y: number) => {
  return localPositionX.value === x && localPositionY.value === y
}

// Expand/collapse crop section
const showCrop = ref(false)
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Image</p>

    <!-- Image Preview & Change -->
    <div class="mb-3 overflow-hidden">
      <div class="flex gap-2 items-start">
        <!-- Thumbnail -->
        <div class="w-14 h-14 rounded bg-app-subtle overflow-hidden flex-shrink-0 flex items-center justify-center">
          <img
            v-if="imageUrl"
            :src="imageUrl"
            :alt="imageName || 'Image'"
            class="w-full h-full object-cover"
          >
          <Icon v-else name="i-lucide-image" class="size-5 text-[var(--app-muted)]" />
        </div>
        <!-- Change Button -->
        <div class="flex-1 min-w-0 overflow-hidden">
          <p class="text-[10px] text-[var(--app-muted)] truncate" :title="imageName || ''">
            {{ imageName || 'No image' }}
          </p>
          <Button
            size="xs"
            variant="soft"
            icon="i-lucide-image-plus"
            class="mt-1"
            @click="showMediaPicker = true"
          >
            {{ imageUrl ? 'Change' : 'Select' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Object Fit -->
    <div class="mb-3">
      <p class="text-[10px] text-[var(--app-muted)] mb-1.5">Fit Mode</p>
      <div class="flex gap-1">
        <Tooltip v-for="option in objectFitOptions" :key="option.id" :text="`${option.label}: ${option.desc}`">
          <Button
:icon="option.icon" size="xs" :variant="localObjectFit === option.id ? 'soft' : 'ghost'"
            :color="localObjectFit === option.id ? 'primary' : 'neutral'" @click="localObjectFit = option.id" />
        </Tooltip>
      </div>
    </div>

    <!-- Object Position (only when not 'fill') -->
    <div v-if="localObjectFit !== 'fill'" class="mb-3">
      <p class="text-[10px] text-[var(--app-muted)] mb-1.5">Position</p>

      <!-- 9-point grid -->
      <div class="grid grid-cols-3 gap-0.5 w-16 mb-2">
        <button
v-for="preset in positionPresets" :key="`${preset.x}-${preset.y}`"
          class="w-5 h-5 rounded-sm border transition-colors" :class="isPositionPresetActive(preset.x, preset.y)
            ? 'bg-[var(--app-accent)] border-[var(--app-accent)]'
            : 'bg-app-subtle border-[var(--app-border)] hover:border-[var(--app-accent)]'" :title="preset.label"
          @click="setPositionPreset(preset.x, preset.y)" />
      </div>

      <!-- Fine control -->
      <div class="flex gap-2">
        <UIScrubInput v-model="localPositionX" label="X" suffix="%" :min="0" :max="100" class="flex-1" />
        <UIScrubInput v-model="localPositionY" label="Y" suffix="%" :min="0" :max="100" class="flex-1" />
      </div>
    </div>

    <!-- Crop controls (collapsible) -->
    <div>
      <button
class="flex items-center gap-1 text-[10px] text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
        @click="showCrop = !showCrop">
        <Icon :name="showCrop ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3" />
        Crop
      </button>

      <div v-if="showCrop" class="mt-2 space-y-2">
        <div class="flex gap-2">
          <UIScrubInput v-model="localCropTop" label="Top" suffix="%" :min="0" :max="99" class="flex-1" />
          <UIScrubInput v-model="localCropBottom" label="Bottom" suffix="%" :min="0" :max="99" class="flex-1" />
        </div>
        <div class="flex gap-2">
          <UIScrubInput v-model="localCropLeft" label="Left" suffix="%" :min="0" :max="99" class="flex-1" />
          <UIScrubInput v-model="localCropRight" label="Right" suffix="%" :min="0" :max="99" class="flex-1" />
        </div>
      </div>
    </div>

    <!-- AI Tools -->
    <div class="mt-3 pt-3 border-t border-[var(--app-border)]">
      <p class="text-[10px] text-[var(--app-muted)] mb-2">AI Tools</p>
      <Button
        size="xs"
        variant="soft"
        color="primary"
        icon="i-lucide-eraser"
        :loading="isProcessing"
        :disabled="!imageUrl"
        class="w-full justify-center"
        @click="handleRemoveBackground"
      >
        {{ isProcessing ? 'Processing...' : 'Remove Background' }}
      </Button>
    </div>

    <!-- Media Picker Modal -->
    <MediaPickerModal
      v-model="showMediaPicker"
      accept="image"
      @select="handleMediaSelect"
    />
  </div>
</template>
