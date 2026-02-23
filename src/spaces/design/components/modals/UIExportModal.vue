<script setup lang="ts">
/**
 * UIExportModal - Export dialog for UI Designer
 * Supports SVG, PNG, CSS, HTML, Vue, React, and Tailwind exports
 */
import type { DesignNode } from '~/types/design'
import { useUIExport, type ExportFormat, type PNGScale } from '../../composables/useUIExport'

interface Props {
  nodes: DesignNode[]
  selectedIds?: string[]
  canvasWidth?: number
  canvasHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  selectedIds: () => [],
  canvasWidth: 800,
  canvasHeight: 600,
})

const isOpen = defineModel<boolean>('open', { default: false })

const { exportDesign, exportToSVG, exportToCSS, exportToHTML, exportToVue, exportToReact, exportToTailwind, calculateBounds: _calculateBounds } = useUIExport()

// Export options
const selectedFormat = ref<ExportFormat>('svg')
const pngScale = ref<PNGScale>(2)
const exportSelectedOnly = ref(false)
const filename = ref('design')

// Preview
const preview = ref('')
const svgPreview = ref('')

// Format options
const formatOptions = [
  { value: 'svg', label: 'SVG', icon: 'i-lucide-image', description: 'Vector graphics' },
  { value: 'png', label: 'PNG', icon: 'i-lucide-image', description: 'Raster image' },
  { value: 'json', label: 'JSON', icon: 'i-lucide-braces', description: 'Raw node data' },
  { value: 'css', label: 'CSS', icon: 'i-lucide-palette', description: 'Stylesheet' },
  { value: 'html', label: 'HTML', icon: 'i-lucide-code', description: 'Markup + styles' },
  { value: 'vue', label: 'Vue', icon: 'i-lucide-component', description: 'Vue SFC' },
  { value: 'react', label: 'React', icon: 'i-lucide-atom', description: 'React JSX' },
  { value: 'tailwind', label: 'Tailwind', icon: 'i-lucide-wind', description: 'Utility classes' },
]

const scaleOptions = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
]

// Helper to get all descendant node IDs recursively
function getDescendantIds(nodeId: string, allNodes: DesignNode[]): string[] {
  const ids: string[] = []
  const children = allNodes.filter(n => n.parentId === nodeId)
  for (const child of children) {
    ids.push(child.id)
    ids.push(...getDescendantIds(child.id, allNodes))
  }
  return ids
}

// Check if any selected node is a screen or has children (container)
const selectedContainers = computed(() => {
  if (props.selectedIds.length === 0) return []
  return props.nodes.filter(n =>
    props.selectedIds.includes(n.id) &&
    (n.type === 'screen' || n.childIds?.length)
  )
})

// Get nodes to export - includes children of selected screens/groups
const nodesToExport = computed(() => {
  // If "Export selected only" is checked, export only the exact selection (no children)
  if (exportSelectedOnly.value && props.selectedIds.length > 0) {
    return props.nodes.filter(n => props.selectedIds.includes(n.id))
  }

  // If a screen or container is selected, export it + all descendants
  if (selectedContainers.value.length > 0) {
    const idsToInclude = new Set<string>()

    for (const container of selectedContainers.value) {
      idsToInclude.add(container.id)
      const descendantIds = getDescendantIds(container.id, props.nodes)
      descendantIds.forEach(did => idsToInclude.add(did))
    }

    return props.nodes.filter(n => idsToInclude.has(n.id))
  }

  // If non-container elements are selected, export just those
  if (props.selectedIds.length > 0) {
    return props.nodes.filter(n => props.selectedIds.includes(n.id))
  }

  // No selection - export all
  return props.nodes
})

// Update preview when options change
watch([selectedFormat, nodesToExport, pngScale], () => {
  updatePreview()
}, { immediate: true })

function updatePreview() {
  const nodes = nodesToExport.value
  if (nodes.length === 0) {
    preview.value = '// No nodes to export'
    svgPreview.value = ''
    return
  }

  switch (selectedFormat.value) {
    case 'svg':
      // For SVG, use fitToBounds=true for preview to scale content to fit
      svgPreview.value = exportToSVG(nodes, props.canvasWidth, props.canvasHeight, true)
      preview.value = ''
      break
    case 'png':
      preview.value = ''
      // Use fitToBounds=true for visual preview
      svgPreview.value = exportToSVG(nodes, props.canvasWidth, props.canvasHeight, true)
      break
    case 'css':
      preview.value = exportToCSS(nodes)
      svgPreview.value = ''
      break
    case 'html':
      preview.value = exportToHTML(nodes)
      svgPreview.value = ''
      break
    case 'vue':
      preview.value = exportToVue(nodes)
      svgPreview.value = ''
      break
    case 'react':
      preview.value = exportToReact(nodes)
      svgPreview.value = ''
      break
    case 'tailwind':
      preview.value = exportToTailwind(nodes)
      svgPreview.value = ''
      break
    case 'json':
      preview.value = JSON.stringify(nodes, null, 2)
      svgPreview.value = ''
      break
  }
}

// Check if current format shows visual preview
const showVisualPreview = computed(() => ['svg', 'png'].includes(selectedFormat.value))
const showCodePreview = computed(() => !showVisualPreview.value)

async function handleExport() {
  await exportDesign(
    nodesToExport.value,
    {
      format: selectedFormat.value,
      scale: pngScale.value,
      selectedOnly: exportSelectedOnly.value,
    },
    filename.value,
    props.canvasWidth,
    props.canvasHeight
  )
  isOpen.value = false
}

function copyToClipboard() {
  navigator.clipboard.writeText(preview.value)
}
</script>

<template>
  <Modal v-model:open="isOpen" :ui="{ content: 'max-w-4xl' }">
    <template #content>
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-app">Export Design</h2>
          <Button
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="isOpen = false"
          />
        </div>

        <div class="grid grid-cols-3 gap-6">
          <!-- Left: Options -->
          <div class="space-y-4">
            <!-- Format Selection -->
            <div>
              <p class="text-xs font-medium text-app-muted uppercase mb-2">Format</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="format in formatOptions"
                  :key="format.value"
                  class="p-2 rounded border text-left transition-colors"
                  :class="selectedFormat === format.value
                    ? 'border-primary bg-primary/10'
                    : 'border-app hover:border-primary/50'"
                  @click="selectedFormat = format.value as ExportFormat"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <Icon :name="format.icon" class="size-4 text-app-muted" />
                    <span class="text-sm font-medium text-app">{{ format.label }}</span>
                  </div>
                  <span class="text-[10px] text-app-muted">{{ format.description }}</span>
                </button>
              </div>
            </div>

            <!-- PNG Scale (only for PNG) -->
            <div v-if="selectedFormat === 'png'">
              <p class="text-xs font-medium text-app-muted uppercase mb-2">Scale</p>
              <div class="flex gap-2">
                <Button
                  v-for="scale in scaleOptions"
                  :key="scale.value"
                  :variant="pngScale === scale.value ? 'soft' : 'ghost'"
                  :color="pngScale === scale.value ? 'primary' : 'neutral'"
                  size="sm"
                  @click="pngScale = scale.value as PNGScale"
                >
                  {{ scale.label }}
                </Button>
              </div>
            </div>

            <!-- Filename -->
            <div>
              <p class="text-xs font-medium text-app-muted uppercase mb-2">Filename</p>
              <Input v-model="filename" size="sm" variant="soft" placeholder="design" />
            </div>

            <!-- Export Selected Only (only show when container with children is selected) -->
            <div v-if="selectedContainers.length > 0" class="flex items-center gap-2">
              <Checkbox v-model="exportSelectedOnly" />
              <span class="text-sm text-app">Export without children</span>
            </div>

            <!-- Selection info -->
            <div v-if="selectedIds.length > 0" class="text-xs text-app-muted">
              <template v-if="selectedContainers.length > 0">
                Exporting: {{ selectedContainers[0]?.name || 'Screen' }}
                <span v-if="!exportSelectedOnly"> + children</span>
              </template>
              <template v-else>
                Exporting {{ selectedIds.length }} selected element{{ selectedIds.length === 1 ? '' : 's' }}
              </template>
            </div>

            <!-- Stats -->
            <div class="pt-4 border-t border-app">
              <p class="text-xs text-app-muted">
                {{ nodesToExport.length }} element{{ nodesToExport.length === 1 ? '' : 's' }} to export
              </p>
            </div>
          </div>

          <!-- Right: Preview -->
          <div class="col-span-2 flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium text-app-muted uppercase">Preview</p>
              <Button
                v-if="showCodePreview"
                icon="i-lucide-copy"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="copyToClipboard"
              >
                Copy
              </Button>
            </div>

            <!-- Visual Preview for SVG/PNG -->
            <div v-if="showVisualPreview" class="flex-1 h-[400px] bg-[#2a2a2a] rounded-lg overflow-hidden flex items-center justify-center p-4">
              <SvgPreview
                :svg="svgPreview"
                class="w-full h-full bg-white rounded shadow-lg flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
              />
            </div>

            <!-- Code Preview for other formats -->
            <div v-else class="flex-1 min-h-[400px] bg-[#1e1e1e] rounded-lg overflow-auto">
              <pre class="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap">{{ preview }}</pre>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-app">
          <Button variant="ghost" color="neutral" @click="isOpen = false">
            Cancel
          </Button>
          <Button color="primary" @click="handleExport">
            <Icon name="i-lucide-download" class="size-4 mr-1" />
            Export {{ selectedFormat.toUpperCase() }}
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>
