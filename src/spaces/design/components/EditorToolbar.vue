<script setup lang="ts">
/**
 * EditorToolbar - Top toolbar tools (teleported into toolbar-bun-slot and toolbar-right-slot)
 * Owns tool arrays, selected tool refs, icon computeds, dropdown items
 */
import type { UITool, TextPreset } from '../types'

const props = defineProps<{
  activeTool: UITool
  canUndo: boolean
  canRedo: boolean
  showBlueprintsPanel: boolean
  showStylesPanel: boolean
  showComponentsPanel: boolean
  isCommentMode: boolean
  unresolvedCommentCount: number
  showUnsplashSearch: boolean
  unsplashQuery: string
  unsplashResults: Array<{ url: string; thumb: string; description?: string; credit?: string }>
  unsplashLoading: boolean
  isSaving: boolean
  isTeleportReady: boolean
}>()

const emit = defineEmits<{
  toolChange: [tool: UITool]
  textPresetChange: [preset: TextPreset]
  undo: []
  redo: []
  toggleBlueprints: []
  toggleStyles: []
  toggleComponents: []
  imageSelect: []
  export: []
  toggleCommentMode: []
  'update:showUnsplashSearch': [value: boolean]
  'update:unsplashQuery': [value: string]
  searchUnsplash: []
  insertUnsplashImage: [imageData: { url: string; description?: string }]
}>()

// Shape tools group
const shapeTools: { id: UITool; icon: string; label: string; shortcut: string }[] = [
  { id: 'rectangle', icon: 'i-lucide-square', label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: 'i-lucide-circle', label: 'Ellipse', shortcut: 'O' },
  { id: 'polygon', icon: 'i-lucide-hexagon', label: 'Polygon', shortcut: 'G' },
  { id: 'star', icon: 'i-lucide-star', label: 'Star', shortcut: 'S' },
  { id: 'heart', icon: 'i-lucide-heart', label: 'Heart', shortcut: '' },
]

// Line tools group
const lineTools: { id: UITool; icon: string; label: string; shortcut: string }[] = [
  { id: 'line', icon: 'i-lucide-minus', label: 'Line', shortcut: 'L' },
  { id: 'arrow', icon: 'i-lucide-arrow-right', label: 'Arrow', shortcut: 'A' },
]

// Drawing tools group
const drawTools: { id: UITool; icon: string; label: string; shortcut: string }[] = [
  { id: 'pen', icon: 'i-lucide-pen-tool', label: 'Pen', shortcut: 'P' },
  { id: 'pencil', icon: 'i-lucide-pencil', label: 'Pencil', shortcut: '' },
]

// Text presets
const textPresets: { id: TextPreset; icon: string; label: string; desc: string }[] = [
  { id: 'heading1', icon: 'i-lucide-heading-1', label: 'Heading 1', desc: '48px Bold' },
  { id: 'heading2', icon: 'i-lucide-heading-2', label: 'Heading 2', desc: '36px Bold' },
  { id: 'heading3', icon: 'i-lucide-heading-3', label: 'Heading 3', desc: '24px Semibold' },
  { id: 'paragraph', icon: 'i-lucide-pilcrow', label: 'Paragraph', desc: '16px Regular' },
  { id: 'caption', icon: 'i-lucide-text', label: 'Caption', desc: '12px Regular' },
  { id: 'label', icon: 'i-lucide-tag', label: 'Label', desc: '11px Medium' },
]

// Track selected tool in each group
const selectedShapeTool = ref<UITool>('rectangle')
const selectedLineTool = ref<UITool>('line')
const selectedDrawTool = ref<UITool>('pen')
const selectedTextPreset = ref<TextPreset>('paragraph')

// Check if active tool is in a group
const isShapeToolActive = computed(() => shapeTools.some(t => t.id === props.activeTool))
const isLineToolActive = computed(() => lineTools.some(t => t.id === props.activeTool))
const isDrawToolActive = computed(() => drawTools.some(t => t.id === props.activeTool))

// Get current icon for each group
const currentShapeIcon = computed(() => {
  const active = shapeTools.find(t => t.id === props.activeTool)
  if (active) return active.icon
  return shapeTools.find(t => t.id === selectedShapeTool.value)?.icon || 'i-lucide-square'
})

const currentLineIcon = computed(() => {
  const active = lineTools.find(t => t.id === props.activeTool)
  if (active) return active.icon
  return lineTools.find(t => t.id === selectedLineTool.value)?.icon || 'i-lucide-minus'
})

const currentDrawIcon = computed(() => {
  const active = drawTools.find(t => t.id === props.activeTool)
  if (active) return active.icon
  return drawTools.find(t => t.id === selectedDrawTool.value)?.icon || 'i-lucide-pen-tool'
})

const currentTextIcon = computed(() => {
  return textPresets.find(t => t.id === selectedTextPreset.value)?.icon || 'i-lucide-type'
})

// Tool selection
const selectTool = (tool: UITool) => {
  emit('toolChange', tool)
  if (shapeTools.some(t => t.id === tool)) selectedShapeTool.value = tool
  else if (lineTools.some(t => t.id === tool)) selectedLineTool.value = tool
  else if (drawTools.some(t => t.id === tool)) selectedDrawTool.value = tool
}

const selectTextPreset = (preset: TextPreset) => {
  selectedTextPreset.value = preset
  emit('toolChange', 'text')
  emit('textPresetChange', preset)
}

// Create dropdown items
const createDropdownItems = (tools: typeof shapeTools) => {
  return tools.map(tool => ({
    label: tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label,
    icon: tool.icon,
    onSelect: () => selectTool(tool.id),
  }))
}

const shapeDropdownItems = computed(() => createDropdownItems(shapeTools))
const lineDropdownItems = computed(() => createDropdownItems(lineTools))
const drawDropdownItems = computed(() => createDropdownItems(drawTools))
const textDropdownItems = computed(() => textPresets.map(preset => ({
  label: preset.label,
  icon: preset.icon,
  description: preset.desc,
  onSelect: () => selectTextPreset(preset.id),
})))

const unsplashSearchModel = computed({
  get: () => props.showUnsplashSearch,
  set: (v: boolean) => emit('update:showUnsplashSearch', v),
})

const unsplashQueryModel = computed({
  get: () => props.unsplashQuery,
  set: (v: string) => emit('update:unsplashQuery', v),
})
</script>

<template>
  <!-- Tools teleported to toolbar center (bun slot) -->
  <Teleport v-if="isTeleportReady" to="#toolbar-bun-slot">
    <!-- Move tool -->
    <Tooltip text="Move (V)">
      <Button
        icon="i-lucide-mouse-pointer-2"
        size="xs"
        :variant="activeTool === 'select' ? 'soft' : 'ghost'"
        :color="activeTool === 'select' ? 'primary' : 'neutral'"
        @click="selectTool('select')"
      />
    </Tooltip>

    <!-- Screen tool -->
    <Tooltip text="Screen (F)">
      <Button
        icon="i-lucide-smartphone"
        size="xs"
        :variant="activeTool === 'screen' ? 'soft' : 'ghost'"
        :color="activeTool === 'screen' ? 'primary' : 'neutral'"
        @click="selectTool('screen')"
      />
    </Tooltip>

    <div class="h-5 w-px bg-app-muted/30 mx-1" />

    <!-- Shape tools dropdown -->
    <DropdownMenu :items="shapeDropdownItems">
      <Tooltip text="Shapes">
        <Button
          :icon="currentShapeIcon"
          size="xs"
          :variant="isShapeToolActive ? 'soft' : 'ghost'"
          :color="isShapeToolActive ? 'primary' : 'neutral'"
          trailing-icon="i-lucide-chevron-down"
          class="pr-0.5"
        />
      </Tooltip>
    </DropdownMenu>

    <!-- Line tools dropdown -->
    <DropdownMenu :items="lineDropdownItems">
      <Tooltip text="Lines">
        <Button
          :icon="currentLineIcon"
          size="xs"
          :variant="isLineToolActive ? 'soft' : 'ghost'"
          :color="isLineToolActive ? 'primary' : 'neutral'"
          trailing-icon="i-lucide-chevron-down"
          class="pr-0.5"
        />
      </Tooltip>
    </DropdownMenu>

    <div class="h-5 w-px bg-app-muted/30 mx-1" />

    <!-- Text tools dropdown -->
    <DropdownMenu :items="textDropdownItems">
      <Tooltip text="Text (T)">
        <Button
          :icon="currentTextIcon"
          size="xs"
          :variant="activeTool === 'text' ? 'soft' : 'ghost'"
          :color="activeTool === 'text' ? 'primary' : 'neutral'"
          trailing-icon="i-lucide-chevron-down"
          class="pr-0.5"
        />
      </Tooltip>
    </DropdownMenu>

    <!-- Draw tools dropdown -->
    <DropdownMenu :items="drawDropdownItems">
      <Tooltip text="Drawing">
        <Button
          :icon="currentDrawIcon"
          size="xs"
          :variant="isDrawToolActive ? 'soft' : 'ghost'"
          :color="isDrawToolActive ? 'primary' : 'neutral'"
          trailing-icon="i-lucide-chevron-down"
          class="pr-0.5"
        />
      </Tooltip>
    </DropdownMenu>

    <!-- Hand tool -->
    <Tooltip text="Hand (H)">
      <Button
        icon="i-lucide-hand"
        size="xs"
        :variant="activeTool === 'hand' ? 'soft' : 'ghost'"
        :color="activeTool === 'hand' ? 'primary' : 'neutral'"
        @click="selectTool('hand')"
      />
    </Tooltip>

    <!-- Divider -->
    <div class="h-4 w-px bg-border mx-1" />

    <!-- Image tool -->
    <Tooltip text="Image (I)">
      <Button
        icon="i-lucide-image"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="$emit('imageSelect')"
      />
    </Tooltip>
  </Teleport>

  <!-- Panel toggles teleported to toolbar right slot -->
  <Teleport v-if="isTeleportReady" to="#toolbar-right-slot">
    <!-- Unsplash Search -->
    <Popover v-model:open="unsplashSearchModel">
      <Tooltip text="Unsplash Images">
        <Button
          size="xs"
          variant="ghost"
          color="neutral"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z" />
          </svg>
        </Button>
      </Tooltip>
      <template #content>
        <div class="w-96 p-3">
          <div class="flex gap-2 mb-3">
            <Input
              v-model="unsplashQueryModel"
              placeholder="Search images..."
              class="flex-1"
              @keyup.enter="$emit('searchUnsplash')"
            />
            <Button
              icon="i-lucide-search"
              :loading="unsplashLoading"
              @click="$emit('searchUnsplash')"
            />
          </div>
          <div v-if="unsplashResults.length" class="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            <button
              v-for="(img, i) in unsplashResults"
              :key="i"
              class="relative aspect-video rounded overflow-hidden hover:ring-2 ring-primary transition-all group"
              @dblclick="$emit('insertUnsplashImage', img)"
            >
              <img :src="img.thumb" :alt="img.description" class="w-full h-full object-cover">
              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span class="text-white text-xs">Double-click to add</span>
              </div>
            </button>
          </div>
          <p v-else-if="unsplashQuery && !unsplashLoading" class="text-sm text-muted text-center py-4">
            Search for images to insert
          </p>
          <p class="text-xs text-muted mt-2 text-center">
            Photos from Unsplash · Double-click to add
          </p>
        </div>
      </template>
    </Popover>

    <div class="h-4 w-px bg-app-muted/30 mx-1" />

    <!-- Undo/Redo -->
    <Tooltip text="Undo (⌘Z)">
      <Button
        icon="i-lucide-undo-2"
        variant="ghost"
        color="neutral"
        size="xs"
        :disabled="!canUndo"
        @click="$emit('undo')"
      />
    </Tooltip>
    <Tooltip text="Redo (⌘⇧Z)">
      <Button
        icon="i-lucide-redo-2"
        variant="ghost"
        color="neutral"
        size="xs"
        :disabled="!canRedo"
        @click="$emit('redo')"
      />
    </Tooltip>

    <div class="h-4 w-px bg-app-muted/30 mx-1" />

    <!-- Screens toggle -->
    <Tooltip text="Screens">
      <Button
        icon="i-lucide-layout-template"
        :variant="showBlueprintsPanel ? 'soft' : 'ghost'"
        :color="showBlueprintsPanel ? 'primary' : 'neutral'"
        size="xs"
        @click="$emit('toggleBlueprints')"
      />
    </Tooltip>

    <!-- Styles toggle -->
    <Tooltip text="Styles">
      <Button
        icon="i-lucide-palette"
        :variant="showStylesPanel ? 'soft' : 'ghost'"
        :color="showStylesPanel ? 'primary' : 'neutral'"
        size="xs"
        @click="$emit('toggleStyles')"
      />
    </Tooltip>

    <!-- Components toggle -->
    <Tooltip text="Components">
      <Button
        icon="i-lucide-component"
        :variant="showComponentsPanel ? 'soft' : 'ghost'"
        :color="showComponentsPanel ? 'primary' : 'neutral'"
        size="xs"
        @click="$emit('toggleComponents')"
      />
    </Tooltip>

    <div class="h-4 w-px bg-app-muted/30 mx-1" />

    <!-- Export button -->
    <Tooltip text="Export (⌘E)">
      <Button
        icon="i-lucide-download"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="$emit('export')"
      />
    </Tooltip>

    <!-- Comments toggle -->
    <Tooltip :text="isCommentMode ? 'Exit comment mode (Esc)' : 'Add comment (C)'">
      <Button
        icon="i-lucide-message-circle"
        :variant="isCommentMode ? 'soft' : 'ghost'"
        :color="isCommentMode ? 'warning' : 'neutral'"
        size="xs"
        @click="$emit('toggleCommentMode')"
      >
        <template v-if="unresolvedCommentCount > 0" #trailing>
          <span class="size-4 rounded-full bg-orange-500 text-[10px] text-white font-bold flex items-center justify-center">
            {{ unresolvedCommentCount }}
          </span>
        </template>
      </Button>
    </Tooltip>
  </Teleport>

  <!-- Saving indicator teleported after breadcrumb -->
  <Teleport v-if="isTeleportReady" to="#toolbar-after-breadcrumb-slot">
    <div class="w-20 h-5 flex items-center ml-3">
      <Transition name="fade">
        <div v-if="isSaving" class="flex items-center gap-1.5 text-xs text-app-muted">
          <Icon name="i-lucide-loader-2" class="size-3 animate-spin" />
          <span>Saving...</span>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
