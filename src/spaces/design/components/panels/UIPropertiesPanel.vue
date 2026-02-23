<script setup lang="ts">
/**
 * UIPropertiesPanel - Figma-style properties panel
 * Tabs: Design | Content (text) | Component (component nodes) | Prototype
 * Each tab shows only relevant properties for the selected element type.
 */
import type { DesignNode, Fill, Shadow, PrototypeInteraction, Constraints, NineSliceInsets } from '~/types/design'
import type { UITool } from '~/spaces/design/types'
import PropertyPosition from './properties/PropertyPosition.vue'
import PropertyLayout from './properties/PropertyLayout.vue'
import PropertyAppearance from './properties/PropertyAppearance.vue'
import PropertyFill from './properties/PropertyFill.vue'
import PropertyStroke from './properties/PropertyStroke.vue'
import PropertyEffects from './properties/PropertyEffects.vue'
import PropertyPolygon from './properties/PropertyPolygon.vue'
import PropertyStar from './properties/PropertyStar.vue'
import PropertyTypography from './properties/PropertyTypography.vue'
import PropertyAlign from './properties/PropertyAlign.vue'
import PropertyImage from './properties/PropertyImage.vue'
import PropertyPath from './properties/PropertyPath.vue'
import PropertyPrototype from './properties/PropertyPrototype.vue'
import PropertyComponentInstance from './properties/PropertyComponentInstance.vue'
import PropertyComponentStates from './properties/PropertyComponentStates.vue'
import PropertyConstraints from './properties/PropertyConstraints.vue'
import PropertyNineSlice from './properties/PropertyNineSlice.vue'

interface Props {
  selectedNodes: DesignNode[]
  prototypeTargets: readonly {
    value: string
    label: string
    pageLabel: string
    nodeLabel: string
  }[]
  activeTool?: UITool
  isPathEditMode?: boolean
  isPathClosed?: boolean
  selectedPointIndex?: number | null
  selectedPointType?: 'M' | 'L' | 'C' | 'Q' | null
  masterName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  update: [property: string, value: number | string | boolean | Fill | Shadow[] | number[] | PrototypeInteraction[] | Constraints | NineSliceInsets | { top: boolean; right: boolean; bottom: boolean; left: boolean }]
  preview: [property: string, value: string | null]
  align: [alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom']
  distribute: [direction: 'horizontal' | 'vertical']
  tidyUp: []
  smoothAllCorners: []
  enterPathEdit: []
  exitPathEdit: []
  closePath: []
  openPath: []
  convertPoint: [type: 'corner' | 'smooth' | 'asymmetric']
  goToComponent: [componentId: string]
  detachInstance: [instanceId: string]
  resetOverride: [instanceId: string, path: string]
  resetAllOverrides: [instanceId: string]
  autoAssignConstraints: [masterId: string]
  addState: [componentId: string, name: string]
  removeState: [componentId: string, stateId: string]
  renameState: [componentId: string, stateId: string, name: string]
  setActiveState: [componentId: string, stateId: string | null]
  resetStateOverride: [componentId: string, stateId: string, path: string]
  resetAllStateOverrides: [componentId: string, stateId: string]
}>()

// ── Active tab ─────────────────────────────────────────────────────
type PanelTab = 'design' | 'content' | 'component' | 'prototype'
const activeTab = ref<PanelTab>('design')

// ── Type checks ────────────────────────────────────────────────────
const hasTextNode = computed(() => props.selectedNodes.some(n => n.type === 'text'))
const hasNonTextNode = computed(() => props.selectedNodes.some(n => n.type !== 'text'))
const hasPolygon = computed(() => props.selectedNodes.some(n => n.type === 'polygon'))
const hasStar = computed(() => props.selectedNodes.some(n => n.type === 'star'))
const hasImage = computed(() => props.selectedNodes.some(n => n.type === 'image'))
const hasPath = computed(() => props.selectedNodes.some(n => n.type === 'path'))
const hasComponentInstance = computed(() => {
  return props.selectedNodes.length === 1 && props.selectedNodes[0]?.type === 'component-instance'
})
const hasComponentMaster = computed(() => {
  return props.selectedNodes.length === 1 && props.selectedNodes[0]?.isComponent === true
})
const hasParent = computed(() => {
  return props.selectedNodes.length === 1 && !!props.selectedNodes[0]?.parentId
})
const showPrototypeSection = computed(() => {
  if (props.selectedNodes.length !== 1) return false
  const node = props.selectedNodes[0]
  return !!node && node.type !== 'screen'
})

// ── Tab visibility ─────────────────────────────────────────────────
const showContentTab = computed(() => hasTextNode.value)
const showComponentTab = computed(() => hasComponentMaster.value || hasComponentInstance.value)
const showPrototypeTab = computed(() => showPrototypeSection.value)

// ── Available tabs ─────────────────────────────────────────────────
const availableTabs = computed(() => {
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'design', label: 'Design' },
  ]
  if (showContentTab.value) tabs.push({ id: 'content', label: 'Content' })
  if (showComponentTab.value) tabs.push({ id: 'component', label: 'Component' })
  if (showPrototypeTab.value) tabs.push({ id: 'prototype', label: 'Prototype' })
  return tabs
})

// Reset to design tab when selection type changes
watch(() => props.selectedNodes.map(n => n.id).join(','), () => {
  activeTab.value = 'design'
})

// Auto-switch if current tab becomes unavailable
watch(availableTabs, (tabs) => {
  if (!tabs.some(t => t.id === activeTab.value)) {
    activeTab.value = 'design'
  }
})

// ── Header text ────────────────────────────────────────────────────
const headerText = computed(() => {
  const nodes = props.selectedNodes
  if (nodes.length === 0) return 'Design'
  if (nodes.length === 1) {
    const node = nodes[0]!
    const typeLabel = node.type === 'component-instance' ? 'Component'
      : node.type === 'text' ? 'Text'
      : node.type === 'image' ? 'Image'
      : node.type === 'path' ? 'Vector'
      : node.type === 'polygon' ? 'Polygon'
      : node.type === 'star' ? 'Star'
      : node.type === 'screen' ? 'Screen'
      : node.isComponent ? 'Component'
      : null
    return typeLabel ? `${node.name} · ${typeLabel}` : node.name
  }
  return `${nodes.length} selected`
})

// Tool state
const isPenToolActive = computed(() => props.activeTool === 'pen')
const isPencilToolActive = computed(() => props.activeTool === 'pencil')

// Forward events
const handleUpdate = (property: string, value: unknown) => {
  emit('update', property, value as never)
}
const handlePreview = (property: string, value: string | null) => {
  emit('preview', property, value)
}
</script>

<template>
  <div
    class="h-full flex flex-col min-h-0 bg-app"
    data-properties-panel
    @mousedown.stop
    @mousemove.stop
  >
    <!-- Header -->
    <div class="h-10 px-3 flex items-center shrink-0 border-b border-[var(--app-border)]">
      <span class="text-xs font-medium text-[var(--app-foreground)] truncate flex-1">
        {{ headerText }}
      </span>
    </div>

    <div v-if="selectedNodes.length > 0" class="flex-1 flex flex-col min-h-0">
      <!-- Tab bar (only shown when there are multiple tabs) -->
      <div v-if="availableTabs.length > 1" class="flex border-b border-[var(--app-border)] shrink-0">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          class="flex-1 text-[11px] py-2 font-medium transition-colors"
          :class="activeTab === tab.id
            ? 'text-[var(--app-accent)] border-b-2 border-[var(--app-accent)] -mb-px'
            : 'text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        <!-- ── DESIGN TAB ── -->
        <template v-if="activeTab === 'design'">
          <!-- Align & Distribute (2+ items) -->
          <PropertyAlign
            :selected-nodes="selectedNodes"
            @align="(a) => emit('align', a)"
            @distribute="(d) => emit('distribute', d)"
            @tidy-up="emit('tidyUp')"
          />

          <!-- Position -->
          <PropertyPosition :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Layout -->
          <PropertyLayout :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Constraints (when node has a parent) -->
          <PropertyConstraints
            v-if="hasParent"
            :selected-nodes="selectedNodes"
            @update="handleUpdate"
          />

          <!-- Appearance -->
          <PropertyAppearance :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Fill (non-text only) -->
          <PropertyFill v-if="hasNonTextNode" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Stroke (non-text only) -->
          <PropertyStroke v-if="hasNonTextNode" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Effects -->
          <PropertyEffects v-if="hasNonTextNode" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Image -->
          <PropertyImage v-if="hasImage" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Polygon -->
          <PropertyPolygon v-if="hasPolygon" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Star -->
          <PropertyStar v-if="hasStar" :selected-nodes="selectedNodes" @update="handleUpdate" />

          <!-- Path / Vector -->
          <PropertyPath
            v-if="hasPath || isPathEditMode"
            :selected-nodes="selectedNodes"
            :is-path-edit-mode="isPathEditMode"
            :is-path-closed="isPathClosed"
            :selected-point-index="selectedPointIndex"
            :selected-point-type="selectedPointType"
            @smooth-all-corners="emit('smoothAllCorners')"
            @enter-path-edit="emit('enterPathEdit')"
            @exit-path-edit="emit('exitPathEdit')"
            @convert-point="(type) => emit('convertPoint', type)"
            @close-path="emit('closePath')"
            @open-path="emit('openPath')"
          />

          <!-- Typography in Design tab (inline preview when no Content tab shown) -->
          <PropertyTypography
            v-if="hasTextNode && !showContentTab"
            :selected-nodes="selectedNodes"
            @update="handleUpdate"
            @preview="handlePreview"
          />
        </template>

        <!-- ── CONTENT TAB (text nodes) ── -->
        <template v-else-if="activeTab === 'content'">
          <PropertyTypography
            :selected-nodes="selectedNodes"
            @update="handleUpdate"
            @preview="handlePreview"
          />
        </template>

        <!-- ── COMPONENT TAB ── -->
        <template v-else-if="activeTab === 'component'">
          <PropertyComponentInstance
            v-if="hasComponentInstance"
            :selected-nodes="selectedNodes"
            :master-name="masterName"
            @go-to-component="(id) => emit('goToComponent', id)"
            @detach-instance="(id) => emit('detachInstance', id)"
            @reset-override="(id, path) => emit('resetOverride', id, path)"
            @reset-all-overrides="(id) => emit('resetAllOverrides', id)"
          />
          <PropertyNineSlice
            v-if="hasComponentMaster"
            :selected-nodes="selectedNodes"
            @update="handleUpdate"
            @auto-assign-constraints="(id) => emit('autoAssignConstraints', id)"
          />
          <PropertyComponentStates
            :selected-nodes="selectedNodes"
            @add-state="(cid, name) => emit('addState', cid, name)"
            @remove-state="(cid, sid) => emit('removeState', cid, sid)"
            @rename-state="(cid, sid, name) => emit('renameState', cid, sid, name)"
            @set-active-state="(cid, sid) => emit('setActiveState', cid, sid)"
            @reset-state-override="(cid, sid, path) => emit('resetStateOverride', cid, sid, path)"
            @reset-all-state-overrides="(cid, sid) => emit('resetAllStateOverrides', cid, sid)"
          />
        </template>

        <!-- ── PROTOTYPE TAB ── -->
        <template v-else-if="activeTab === 'prototype'">
          <PropertyPrototype
            :selected-nodes="selectedNodes"
            :targets="prototypeTargets"
            @update="handleUpdate"
          />
        </template>
      </div>
    </div>

    <!-- Pen Tool Active State -->
    <div v-else-if="isPenToolActive" class="flex-1 flex flex-col p-4 gap-4">
      <div class="text-xs text-[var(--app-foreground)] font-medium">Pen Tool</div>
      <div class="text-xs text-[var(--app-muted)] space-y-2">
        <p><span class="text-[var(--app-foreground)]">Click</span> to add point</p>
        <p><span class="text-[var(--app-foreground)]">Click + Drag</span> to create curve</p>
        <p><span class="text-[var(--app-foreground)]">Click first point</span> to close path</p>
        <p><span class="text-[var(--app-foreground)]">Click last point</span> to finish</p>
        <p><span class="text-[var(--app-foreground)]">Escape</span> to finish/cancel</p>
        <p><span class="text-[var(--app-foreground)]">Enter</span> to close and finish</p>
      </div>
    </div>

    <!-- Pencil Tool Active State -->
    <div v-else-if="isPencilToolActive" class="flex-1 flex flex-col p-4 gap-4">
      <div class="text-xs text-[var(--app-foreground)] font-medium">Pencil Tool</div>
      <div class="text-xs text-[var(--app-muted)] space-y-2">
        <p><span class="text-[var(--app-foreground)]">Click + Drag</span> to draw freehand</p>
        <p><span class="text-[var(--app-foreground)]">Release</span> to finish stroke</p>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-xs text-[var(--app-muted)]">Select an element</p>
    </div>
  </div>
</template>
