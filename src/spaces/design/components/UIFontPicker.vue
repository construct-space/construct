<script setup lang="ts">
/**
 * UIFontPicker - Figma-like font picker
 * - Shows popular fonts by default
 * - Searches all 1900+ fonts when typing
 * - Loads fonts on-demand
 * - Instant preview on hover
 */
import { useGoogleFonts, loadGoogleFont, preloadCachedFonts, POPULAR_FONTS } from '~/composables/useGoogleFonts'
import { useDropdownPosition } from '~/composables/useDropdownPosition'

interface Props {
  modelValue: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'preview': [value: string | null]
}>()

const { fontOptions } = useGoogleFonts()

// UI state
const isOpen = ref(false)
const searchQuery = ref('')
const listRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement | null>(null)
const triggerRef = ref<HTMLElement>()
const recentFonts = ref<string[]>([])
const activeIndex = ref(-1)

// Smart dropdown positioning
const { openAbove, recalculate } = useDropdownPosition(triggerRef, 300)

const RECENT_FONTS_STORAGE_KEY = 'ui.fontPicker.recentFonts'
const MAX_RECENT_FONTS = 20
let previewRequestId = 0
let visiblePreloadRequestId = 0

// System fonts
const systemFonts = [
  { label: 'SF Pro', value: 'SF Pro' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Arial', value: 'Arial' },
]

const toOption = (fontFamily: string) => {
  const fromCatalog = fontOptions.value.find(f => f.value === fontFamily)
  if (fromCatalog) return fromCatalog
  const fromSystem = systemFonts.find(f => f.value === fontFamily)
  if (fromSystem) return fromSystem
  return { label: fontFamily, value: fontFamily, category: 'custom' }
}

const mergeUniqueByValue = <T extends { value: string }>(items: T[]): T[] => {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const item of items) {
    if (seen.has(item.value)) continue
    seen.add(item.value)
    merged.push(item)
  }
  return merged
}

function persistRecentFonts() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_FONTS_STORAGE_KEY, JSON.stringify(recentFonts.value))
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

function loadRecentFonts() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(RECENT_FONTS_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    recentFonts.value = parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, MAX_RECENT_FONTS)
  } catch {
    recentFonts.value = []
  }
}

function addRecentFont(fontFamily: string) {
  const clean = fontFamily.trim()
  if (!clean) return
  recentFonts.value = [clean, ...recentFonts.value.filter(f => f !== clean)].slice(0, MAX_RECENT_FONTS)
  persistRecentFonts()
}

// Filtered fonts based on search
const filteredFonts = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()

  if (!query) {
    // No search: selected + recent + popular + system.
    const selected = props.modelValue ? [toOption(props.modelValue)] : []
    const recent = recentFonts.value.map(toOption)
    const popular = fontOptions.value.filter(f => POPULAR_FONTS.includes(f.value))
    return mergeUniqueByValue([...selected, ...recent, ...popular, ...systemFonts])
  }

  // Search: include system fonts and limit results for performance.
  const googleMatches = fontOptions.value
    .filter(f => f.label.toLowerCase().includes(query))
    .slice(0, 30)
  const systemMatches = systemFonts.filter(f => f.label.toLowerCase().includes(query))
  return mergeUniqueByValue([...googleMatches, ...systemMatches]).slice(0, 30)
})

function clampIndex(index: number): number {
  if (filteredFonts.value.length === 0) return -1
  return Math.max(0, Math.min(filteredFonts.value.length - 1, index))
}

function scrollActiveIntoView() {
  nextTick(() => {
    const list = listRef.value
    if (!list || activeIndex.value < 0) return
    const target = list.querySelector<HTMLElement>(`[data-font-index="${activeIndex.value}"]`)
    target?.scrollIntoView({ block: 'nearest' })
  })
}

function initializeActiveIndex() {
  if (!filteredFonts.value.length) {
    activeIndex.value = -1
    return
  }
  const selected = filteredFonts.value.findIndex(font => font.value === props.modelValue)
  activeIndex.value = selected >= 0 ? selected : 0
  scrollActiveIntoView()
}

function setActiveIndex(index: number) {
  const next = clampIndex(index)
  activeIndex.value = next
  const font = filteredFonts.value[next]
  if (font) {
    void previewFont(font.value)
  }
  scrollActiveIntoView()
}

async function preloadVisibleFonts(fonts: Array<{ value: string }>) {
  const requestId = ++visiblePreloadRequestId
  const families = fonts
    .slice(0, 30)
    .map(font => font.value.trim())
    .filter(Boolean)
  await Promise.all(families.map(family => loadGoogleFont(family)))
  if (requestId !== visiblePreloadRequestId) return
}

// Select a font
function selectFont(font: { value: string }) {
  const family = font.value.trim()
  if (!family) return
  previewRequestId++
  addRecentFont(family)
  emit('update:modelValue', family)
  emit('preview', null)

  void loadGoogleFont(family).then((loaded) => {
    if (!loaded) return
    emit('preview', family)
  })
  isOpen.value = false
  searchQuery.value = ''
  activeIndex.value = -1
}

function handleSearchKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    setActiveIndex(activeIndex.value < 0 ? 0 : activeIndex.value + 1)
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    setActiveIndex(activeIndex.value < 0 ? 0 : activeIndex.value - 1)
    return
  }

  if (e.key === 'Home') {
    e.preventDefault()
    e.stopPropagation()
    setActiveIndex(0)
    return
  }

  if (e.key === 'End') {
    e.preventDefault()
    e.stopPropagation()
    setActiveIndex(filteredFonts.value.length - 1)
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    const index = activeIndex.value >= 0 ? activeIndex.value : 0
    const font = filteredFonts.value[index]
    if (font) selectFont(font)
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    isOpen.value = false
    resetPreview()
  }
}

// Load font for preview on hover
async function previewFont(fontFamily: string) {
  const requestId = ++previewRequestId
  emit('preview', fontFamily)
  const loaded = await loadGoogleFont(fontFamily)
  if (requestId !== previewRequestId || !loaded) return
  emit('preview', fontFamily)
}

// Reset preview when mouse leaves
function resetPreview() {
  previewRequestId++
  emit('preview', null)
}

// Close on click outside
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-font-picker]')) {
    isOpen.value = false
    resetPreview()
  }
}

onMounted(() => {
  loadRecentFonts()
  void preloadCachedFonts(10)
  for (const font of recentFonts.value.slice(0, 10)) {
    void loadGoogleFont(font)
  }
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  previewRequestId++
  document.removeEventListener('click', handleClickOutside)
})

// Focus search on open
watch(isOpen, (open) => {
  if (open) {
    recalculate()
    initializeActiveIndex()
    void preloadVisibleFonts(filteredFonts.value)
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  } else {
    activeIndex.value = -1
    visiblePreloadRequestId++
  }
})

watch(filteredFonts, () => {
  if (!isOpen.value) return
  if (!filteredFonts.value.length) {
    activeIndex.value = -1
    return
  }
  void preloadVisibleFonts(filteredFonts.value)
  if (activeIndex.value < 0 || activeIndex.value >= filteredFonts.value.length) {
    initializeActiveIndex()
    return
  }
  scrollActiveIntoView()
})
</script>

<template>
  <div class="relative" data-font-picker>
    <!-- Trigger — matches Select.vue style exactly -->
    <button
      ref="triggerRef"
      type="button"
      class="w-full flex items-center justify-between gap-1.5 rounded-md border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-background)_80%,var(--app-canvas-bg)_20%)] px-2.5 py-1.5 text-xs text-[var(--app-foreground)] transition-colors hover:border-[var(--app-muted)]/50 focus:outline-none focus:border-[var(--app-accent)]"
      :style="{ fontFamily: modelValue }"
      @click="isOpen = !isOpen"
    >
      <span class="truncate">{{ modelValue || 'Select font…' }}</span>
      <svg class="size-3 text-[var(--app-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute z-[140] w-full min-w-[200px] rounded-md border border-[var(--app-border)] bg-[var(--app-background)] shadow-xl overflow-hidden"
        :class="openAbove ? 'bottom-full mb-1' : 'top-full mt-1'"
      >
        <!-- Search -->
        <div class="p-1.5 border-b border-[var(--app-border)]">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            data-font-search
            type="text"
            placeholder="Search fonts…"
            class="w-full rounded-md border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-background)_80%,var(--app-canvas-bg)_20%)] px-2 py-1 text-xs text-[var(--app-foreground)] placeholder:text-[var(--app-muted)]/50 outline-none focus:border-[var(--app-accent)]"
            @keydown.stop="handleSearchKeydown"
          >
        </div>

        <!-- Font list -->
        <div ref="listRef" class="max-h-60 overflow-y-auto" @mouseleave="resetPreview">
          <button
            v-for="(font, i) in filteredFonts"
            :key="font.value"
            :data-font-index="i"
            type="button"
            class="w-full px-2.5 py-1.5 text-left text-xs text-[var(--app-foreground)] transition-colors border-l-2 border-transparent flex items-center justify-between"
            :class="{
              'bg-[color-mix(in_srgb,var(--app-muted)_10%,transparent)]': modelValue === font.value,
              'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] !border-[var(--app-accent)]': activeIndex === i,
            }"
            :style="{ fontFamily: font.value }"
            @mouseenter="setActiveIndex(i)"
            @click="selectFont(font)"
          >
            <span>{{ font.label }}</span>
            <svg
              v-if="modelValue === font.value"
              class="size-3 text-[var(--app-accent)] shrink-0"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>

          <!-- Empty state -->
          <div v-if="filteredFonts.length === 0" class="px-3 py-4 text-center text-xs text-[var(--app-muted)]">
            No fonts found
          </div>
        </div>

        <!-- Footer -->
        <div class="px-2.5 py-1 border-t border-[var(--app-border)] text-[10px] text-[var(--app-muted)]">
          {{ searchQuery ? `${filteredFonts.length} results` : `${POPULAR_FONTS.length} popular fonts` }} · Type to search 1900+
        </div>
      </div>
    </Transition>
  </div>
</template>
