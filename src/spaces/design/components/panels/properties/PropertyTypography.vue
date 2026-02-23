<script setup lang="ts">
import type { DesignNode } from '~/types/design'
import { usePropertyHelpers } from '../../../composables/usePropertyHelpers'
import { loadGoogleFont } from '~/composables/useGoogleFonts'
import UIScrubInput from '../../UIScrubInput.vue'
import UIFontPicker from '../../UIFontPicker.vue'
import UIFillPicker from '../UIFillPicker.vue'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: string | number | boolean): void
  (e: 'preview', property: string, value: string | null): void
}>()

// Store original font for preview reset
const originalFont = ref<string | null>(null)

// Handle font preview (instant update on hover)
function handleFontPreview(fontFamily: string | null) {
  if (fontFamily) {
    if (originalFont.value === null) {
      originalFont.value = localFontFamily.value
    }
    emit('preview', 'fontFamily', fontFamily)
  } else {
    if (originalFont.value !== null) {
      emit('preview', 'fontFamily', originalFont.value)
      originalFont.value = null
    }
  }
}

const selectedNodesRef = toRef(props, 'selectedNodes')
const { getValue, isMixed, firstNode } = usePropertyHelpers(selectedNodesRef)
const selectionKey = computed(() => props.selectedNodes.map(n => n.id).join(','))

// Text content
const localText = computed({
  get: () => firstNode.value?.text ?? '',
  set: (v) => emit('update', 'text', v)
})

// Font size
const localFontSize = computed({
  get: () => {
    const val = getValue(n => n.fontSize ?? 16)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'fontSize', Number(v)) }
})

// Font weight
const localFontWeight = computed({
  get: () => {
    const val = getValue(n => n.fontWeight ?? 'normal')
    return isMixed(val) ? '' : val
  },
  set: (v) => emit('update', 'fontWeight', v)
})

// Font family
const localFontFamily = computed({
  get: () => {
    const val = getValue(n => n.fontFamily ?? 'Inter')
    return isMixed(val) ? '' : val
  },
  set: (v) => {
    const nextFont = v.trim()
    if (!nextFont) return
    originalFont.value = null
    void loadGoogleFont(nextFont)
    emit('update', 'fontFamily', nextFont)
  }
})

// Font style (italic)
const localFontStyle = computed({
  get: () => {
    const val = getValue(n => n.fontStyle ?? 'normal')
    return isMixed(val) ? 'normal' : val
  },
  set: (v) => emit('update', 'fontStyle', v)
})

// Line height
const localLineHeight = computed({
  get: () => {
    const val = getValue(n => n.lineHeight ?? 1.5)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'lineHeight', Number(v)) }
})

// Letter spacing
const localLetterSpacing = computed({
  get: () => {
    const val = getValue(n => n.letterSpacing ?? 0)
    return isMixed(val) ? '' : val
  },
  set: (v) => { if (v !== '') emit('update', 'letterSpacing', Number(v)) }
})

// Text color
const localTextColor = computed<string>({
  get: (): string => {
    const fill = firstNode.value?.fill
    return typeof fill === 'string' ? fill : '#000000'
  },
  set: (v: string) => emit('update', 'fill', v)
})

// Text align
const textAlign = computed(() => firstNode.value?.textAlign ?? 'left')

// Text decorations
const isUnderline = computed(() => firstNode.value?.underline ?? false)
const isLinethrough = computed(() => firstNode.value?.linethrough ?? false)
const isOverline = computed(() => firstNode.value?.overline ?? false)

// Text background color
const localTextBgColor = computed({
  get: () => firstNode.value?.textBackgroundColor ?? '',
  set: (v: string) => emit('update', 'textBackgroundColor', v || '')
})
const hasTextBgColor = computed(() => !!localTextBgColor.value)

const localTextBgColorWithFallback = computed<string>({
  get: () => localTextBgColor.value || '#ffff00',
  set: (v: string) => emit('update', 'textBackgroundColor', v || '')
})

const localBackgroundEnabled = computed({
  get: () => hasTextBgColor.value,
  set: (enabled: boolean) => emit('update', 'textBackgroundColor', enabled ? (localTextBgColor.value || '#ffff00') : '')
})

// Text direction
const textDirection = computed(() => firstNode.value?.direction ?? 'ltr')

// Text transform
const textTransform = computed(() => firstNode.value?.textTransform ?? 'none')

const fontWeightOptions = [
  { label: 'Thin', value: '100' },
  { label: 'Extra Light', value: '200' },
  { label: 'Light', value: '300' },
  { label: 'Regular', value: 'normal' },
  { label: 'Medium', value: '500' },
  { label: 'Semibold', value: '600' },
  { label: 'Bold', value: 'bold' },
  { label: 'Extra Bold', value: '800' },
  { label: 'Black', value: '900' }
]

function toggleDecoration(prop: 'underline' | 'linethrough' | 'overline') {
  const current = firstNode.value?.[prop] ?? false
  emit('update', prop, !current)
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-visible relative z-40">
    <div class="mb-3">
      <p class="text-[11px] font-medium text-[var(--app-muted)] mb-2">Content</p>
      <Textarea
        v-model="localText"
        size="xs"
        :rows="3"
        placeholder="Enter text..."
        @keydown.stop
      />
    </div>

    <div class="space-y-2.5">
      <div class="flex items-center justify-between">
        <p class="text-[11px] font-medium text-[var(--app-foreground)]">Typography</p>
        <Button
          icon="i-lucide-sliders-horizontal"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="emit('update', 'textTransform', 'none')"
        />
      </div>

      <!-- Font family -->
      <UIFontPicker v-model="localFontFamily" @preview="handleFontPreview" />

      <!-- Weight + size -->
      <div class="grid grid-cols-2 gap-2">
        <Select
          v-model="localFontWeight"
          :items="fontWeightOptions"
          size="xs"
        />
        <UIScrubInput v-model="localFontSize" label="Size" :min="1" :max="1000" />
      </div>

      <!-- Line height + letter spacing -->
      <div class="grid grid-cols-2 gap-2">
        <UIScrubInput v-model="localLineHeight" label="A" :min="0.5" :max="5" :step="0.1" />
        <UIScrubInput v-model="localLetterSpacing" label="| A |" :min="-10" :max="50" :step="0.5" />
      </div>

      <!-- Align + direction -->
      <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div class="flex items-center gap-1 rounded-md bg-app-subtle border border-[var(--app-border)] p-0.5">
          <Tooltip text="Align left">
            <Button
              icon="i-lucide-align-left"
              size="xs"
              :variant="textAlign === 'left' ? 'soft' : 'ghost'"
              :color="textAlign === 'left' ? 'primary' : 'neutral'"
              @click="emit('update', 'textAlign', 'left')"
            />
          </Tooltip>
          <Tooltip text="Align center">
            <Button
              icon="i-lucide-align-center"
              size="xs"
              :variant="textAlign === 'center' ? 'soft' : 'ghost'"
              :color="textAlign === 'center' ? 'primary' : 'neutral'"
              @click="emit('update', 'textAlign', 'center')"
            />
          </Tooltip>
          <Tooltip text="Align right">
            <Button
              icon="i-lucide-align-right"
              size="xs"
              :variant="textAlign === 'right' ? 'soft' : 'ghost'"
              :color="textAlign === 'right' ? 'primary' : 'neutral'"
              @click="emit('update', 'textAlign', 'right')"
            />
          </Tooltip>
          <Tooltip text="Justify">
            <Button
              icon="i-lucide-align-justify"
              size="xs"
              :variant="textAlign === 'justify' ? 'soft' : 'ghost'"
              :color="textAlign === 'justify' ? 'primary' : 'neutral'"
              @click="emit('update', 'textAlign', 'justify')"
            />
          </Tooltip>
        </div>

        <div class="flex items-center gap-1 rounded-md bg-app-subtle border border-[var(--app-border)] p-0.5">
          <Tooltip text="Left to Right">
            <Button
              icon="i-lucide-pilcrow-left"
              size="xs"
              :variant="textDirection === 'ltr' ? 'soft' : 'ghost'"
              :color="textDirection === 'ltr' ? 'primary' : 'neutral'"
              @click="emit('update', 'direction', 'ltr')"
            />
          </Tooltip>
          <Tooltip text="Right to Left">
            <Button
              icon="i-lucide-pilcrow-right"
              size="xs"
              :variant="textDirection === 'rtl' ? 'soft' : 'ghost'"
              :color="textDirection === 'rtl' ? 'primary' : 'neutral'"
              @click="emit('update', 'direction', 'rtl')"
            />
          </Tooltip>
        </div>
      </div>

      <!-- Style + transform -->
      <div class="space-y-2">
        <div class="flex items-center gap-1 rounded-md bg-app-subtle border border-[var(--app-border)] p-0.5">
          <Tooltip text="Italic">
            <Button
              icon="i-lucide-italic"
              size="xs"
              :variant="localFontStyle === 'italic' ? 'soft' : 'ghost'"
              :color="localFontStyle === 'italic' ? 'primary' : 'neutral'"
              @click="emit('update', 'fontStyle', localFontStyle === 'italic' ? 'normal' : 'italic')"
            />
          </Tooltip>
          <Tooltip text="Underline">
            <Button
              icon="i-lucide-underline"
              size="xs"
              :variant="isUnderline ? 'soft' : 'ghost'"
              :color="isUnderline ? 'primary' : 'neutral'"
              @click="toggleDecoration('underline')"
            />
          </Tooltip>
          <Tooltip text="Strikethrough">
            <Button
              icon="i-lucide-strikethrough"
              size="xs"
              :variant="isLinethrough ? 'soft' : 'ghost'"
              :color="isLinethrough ? 'primary' : 'neutral'"
              @click="toggleDecoration('linethrough')"
            />
          </Tooltip>
          <Tooltip text="Overline">
            <Button
              size="xs"
              :variant="isOverline ? 'soft' : 'ghost'"
              :color="isOverline ? 'primary' : 'neutral'"
              class="text-[10px] font-medium"
              @click="toggleDecoration('overline')"
            >
              <span class="overline">O</span>
            </Button>
          </Tooltip>
        </div>

        <div class="flex items-center gap-1 rounded-md bg-app-subtle border border-[var(--app-border)] p-0.5">
          <Tooltip text="Capitalize">
            <Button
              size="xs"
              :variant="textTransform === 'capitalize' ? 'soft' : 'ghost'"
              :color="textTransform === 'capitalize' ? 'primary' : 'neutral'"
              class="text-[10px]"
              @click="emit('update', 'textTransform', 'capitalize')"
            >
              Aa
            </Button>
          </Tooltip>
          <Tooltip text="Uppercase">
            <Button
              size="xs"
              :variant="textTransform === 'uppercase' ? 'soft' : 'ghost'"
              :color="textTransform === 'uppercase' ? 'primary' : 'neutral'"
              class="text-[10px]"
              @click="emit('update', 'textTransform', 'uppercase')"
            >
              AA
            </Button>
          </Tooltip>
          <Tooltip text="Lowercase">
            <Button
              size="xs"
              :variant="textTransform === 'lowercase' ? 'soft' : 'ghost'"
              :color="textTransform === 'lowercase' ? 'primary' : 'neutral'"
              class="text-[10px]"
              @click="emit('update', 'textTransform', 'lowercase')"
            >
              aa
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>

    <div class="mt-3 space-y-2.5">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Color</p>
      <div class="space-y-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[11px] text-[var(--app-muted)] w-16 shrink-0">Text</span>
          <UIFillPicker v-model="localTextColor" :allow-gradient="false" :selection-key="selectionKey" class="flex-1 min-w-0" />
        </div>

        <div class="rounded-md bg-app-subtle/40 space-y-2 p-2">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-[var(--app-muted)]">Background</span>
            <Switch v-model="localBackgroundEnabled" size="xs" class="ml-auto" />
          </div>

          <div v-if="localBackgroundEnabled">
            <UIFillPicker
              v-model="localTextBgColorWithFallback"
              :allow-gradient="false"
              :selection-key="selectionKey"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content-textarea :deep(textarea) {
  resize: vertical;
  min-height: 72px;
  max-height: 320px;
}
</style>
