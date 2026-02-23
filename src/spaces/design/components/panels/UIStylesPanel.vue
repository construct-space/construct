<script setup lang="ts">
/**
 * UIStylesPanel - Shared styles management panel
 * Shows color, text, and effect styles for the design
 */
import type { Fill, DesignNode } from '~/types/design'
import { useSharedStylesState } from '../../composables/useSharedStyles'

interface Props {
  selectedNode?: DesignNode | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  applyColorStyle: [styleId: string]
  applyTextStyle: [styleId: string]
  applyEffectStyle: [styleId: string]
}>()

const styles = useSharedStylesState()

// Active tab
const activeTab = ref<'colors' | 'text' | 'effects'>('colors')

// New style input
const newStyleName = ref('')
const isCreating = ref(false)

// Get fill preview color (reserved for future use)
function _getFillPreview(fill: Fill): string {
  if (typeof fill === 'string') return fill
  if (fill.type === 'linear' || fill.type === 'radial') {
    return fill.stops[0]?.color || '#808080'
  }
  return '#808080'
}

// Get gradient CSS - accepts both mutable and readonly Fill types
type FillInput = Fill | string | {
  readonly type: 'linear' | 'radial'
  readonly angle?: number
  readonly centerX?: number
  readonly centerY?: number
  readonly radius?: number
  readonly stops: readonly { readonly offset: number; readonly color: string }[]
}

function getGradientCSS(fill: FillInput): string {
  if (typeof fill === 'string') return fill
  if (fill.type === 'linear') {
    const stops = fill.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    return `linear-gradient(${'angle' in fill ? fill.angle : 0}deg, ${stops})`
  }
  if (fill.type === 'radial') {
    const stops = fill.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    const cx = 'centerX' in fill ? fill.centerX ?? 0.5 : 0.5
    const cy = 'centerY' in fill ? fill.centerY ?? 0.5 : 0.5
    return `radial-gradient(circle at ${cx * 100}% ${cy * 100}%, ${stops})`
  }
  return '#808080'
}

// Create new color style from current selection
function createColorFromSelection() {
  if (!props.selectedNode?.fill) return
  const name = newStyleName.value.trim() || 'Untitled'
  styles.createColorStyleFromFill(name, props.selectedNode.fill)
  newStyleName.value = ''
  isCreating.value = false
}

// Create new text style from current selection
function createTextFromSelection() {
  if (!props.selectedNode || props.selectedNode.type !== 'text') return
  const name = newStyleName.value.trim() || 'Untitled'
  styles.createTextStyleFromNode(name, {
    fontFamily: props.selectedNode.fontFamily,
    fontSize: props.selectedNode.fontSize,
    fontWeight: props.selectedNode.fontWeight,
    lineHeight: props.selectedNode.lineHeight,
    letterSpacing: props.selectedNode.letterSpacing,
    textAlign: props.selectedNode.textAlign,
  })
  newStyleName.value = ''
  isCreating.value = false
}

// Create new effect style from current selection
function createEffectFromSelection() {
  if (!props.selectedNode) return
  const name = newStyleName.value.trim() || 'Untitled'
  styles.createEffectStyleFromNode(name, {
    shadows: props.selectedNode.shadows,
    blur: props.selectedNode.blur,
  })
  newStyleName.value = ''
  isCreating.value = false
}

// Handle create based on active tab
function handleCreate() {
  switch (activeTab.value) {
    case 'colors':
      createColorFromSelection()
      break
    case 'text':
      createTextFromSelection()
      break
    case 'effects':
      createEffectFromSelection()
      break
  }
}

// Check if can create from selection
const canCreateFromSelection = computed(() => {
  if (!props.selectedNode) return false
  switch (activeTab.value) {
    case 'colors':
      return !!props.selectedNode.fill
    case 'text':
      return props.selectedNode.type === 'text'
    case 'effects':
      return !!props.selectedNode.shadows?.length || !!props.selectedNode.blur
    default:
      return false
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-app border-l border-app">
    <!-- Header -->
    <div class="p-3 border-b border-app">
      <h3 class="text-sm font-semibold text-app">Styles</h3>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-app">
      <button
        v-for="tab in ['colors', 'text', 'effects'] as const"
        :key="tab"
        class="flex-1 py-2 text-xs font-medium transition-colors"
        :class="activeTab === tab
          ? 'text-primary border-b-2 border-primary'
          : 'text-app-muted hover:text-app'"
        @click="activeTab = tab"
      >
        {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-3">
      <!-- Colors Tab -->
      <template v-if="activeTab === 'colors'">
        <div v-if="styles.colorStyles.value.length === 0" class="text-center py-8">
          <Icon name="i-lucide-palette" class="size-8 text-app-muted mb-2" />
          <p class="text-xs text-app-muted">No color styles yet</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="style in styles.colorStyles.value"
            :key="style.id"
            class="group flex items-center gap-2 p-2 rounded-lg hover:bg-app-muted/10 cursor-pointer"
            @click="emit('applyColorStyle', style.id)"
          >
            <div
              class="size-8 rounded border border-app"
              :style="{ background: getGradientCSS(style.color) }"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm text-app truncate">{{ style.name }}</p>
              <p class="text-[10px] text-app-muted">{{ typeof style.color === 'string' ? style.color : style.color.type }}</p>
            </div>
            <Button
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="styles.deleteColorStyle(style.id)"
            />
          </div>
        </div>
      </template>

      <!-- Text Tab -->
      <template v-else-if="activeTab === 'text'">
        <div v-if="styles.textStyles.value.length === 0" class="text-center py-8">
          <Icon name="i-lucide-type" class="size-8 text-app-muted mb-2" />
          <p class="text-xs text-app-muted">No text styles yet</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="style in styles.textStyles.value"
            :key="style.id"
            class="group flex items-center gap-2 p-2 rounded-lg hover:bg-app-muted/10 cursor-pointer"
            @click="emit('applyTextStyle', style.id)"
          >
            <div class="size-8 rounded bg-app-muted/20 flex items-center justify-center">
              <span
                class="text-app"
                :style="{
                  fontFamily: style.fontFamily,
                  fontSize: '14px',
                  fontWeight: style.fontWeight,
                }"
              >Aa</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-app truncate">{{ style.name }}</p>
              <p class="text-[10px] text-app-muted">{{ style.fontFamily }} · {{ style.fontSize }}px</p>
            </div>
            <Button
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="styles.deleteTextStyle(style.id)"
            />
          </div>
        </div>
      </template>

      <!-- Effects Tab -->
      <template v-else>
        <div v-if="styles.effectStyles.value.length === 0" class="text-center py-8">
          <Icon name="i-lucide-sparkles" class="size-8 text-app-muted mb-2" />
          <p class="text-xs text-app-muted">No effect styles yet</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="style in styles.effectStyles.value"
            :key="style.id"
            class="group flex items-center gap-2 p-2 rounded-lg hover:bg-app-muted/10 cursor-pointer"
            @click="emit('applyEffectStyle', style.id)"
          >
            <div class="size-8 rounded bg-white flex items-center justify-center">
              <div
                class="size-5 rounded bg-gray-400"
                :style="{
                  boxShadow: style.shadows?.map(s =>
                    `${s.type === 'inner' ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`
                  ).join(', ') || 'none',
                  filter: style.blur ? `blur(${style.blur}px)` : 'none',
                }"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-app truncate">{{ style.name }}</p>
              <p class="text-[10px] text-app-muted">
                {{ style.shadows?.length || 0 }} shadow{{ (style.shadows?.length || 0) !== 1 ? 's' : '' }}
                {{ style.blur ? `· ${style.blur}px blur` : '' }}
              </p>
            </div>
            <Button
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="styles.deleteEffectStyle(style.id)"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Create New Style -->
    <div class="p-3 border-t border-app">
      <template v-if="isCreating">
        <div class="space-y-2">
          <Input
            v-model="newStyleName"
            placeholder="Style name..."
            size="sm"
            autofocus
            @keydown.enter="handleCreate"
            @keydown.escape="isCreating = false"
          />
          <div class="flex gap-2">
            <Button
              size="xs"
              variant="ghost"
              color="neutral"
              class="flex-1"
              @click="isCreating = false"
            >
              Cancel
            </Button>
            <Button
              size="xs"
              color="primary"
              class="flex-1"
              :disabled="!canCreateFromSelection"
              @click="handleCreate"
            >
              Create
            </Button>
          </div>
        </div>
      </template>
      <template v-else>
        <Button
          icon="i-lucide-plus"
          size="sm"
          variant="soft"
          color="primary"
          class="w-full"
          :disabled="!canCreateFromSelection"
          @click="isCreating = true"
        >
          Create from Selection
        </Button>
        <p v-if="!canCreateFromSelection" class="text-[10px] text-app-muted text-center mt-2">
          Select an element to create a style
        </p>
      </template>
    </div>
  </div>
</template>
