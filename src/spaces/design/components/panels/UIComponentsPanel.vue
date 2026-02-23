<script setup lang="ts">
/**
 * UIComponentsPanel - Component library panel
 * Shows all components in the design and allows creating instances
 */
import type { DesignNode } from '~/types/design'

interface ComponentInfo {
  id: string
  name: string
  node: DesignNode
  instanceCount: number
}

interface Props {
  components: ComponentInfo[]
  selectedNode?: DesignNode | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  createInstance: [componentId: string]
  goToComponent: [componentId: string]
  createComponent: []
  removeComponent: [componentId: string]
}>()

// Search filter
const searchQuery = ref('')

// Filtered components
const filteredComponents = computed(() => {
  if (!searchQuery.value.trim()) return props.components
  const query = searchQuery.value.toLowerCase()
  return props.components.filter(c => c.name.toLowerCase().includes(query))
})

// Can create component from selection
const canCreateComponent = computed(() => {
  return props.selectedNode && !props.selectedNode.isComponent && props.selectedNode.type !== 'component-instance'
})

// Get preview background for component
function getComponentPreview(node: DesignNode): string {
  if (typeof node.fill === 'string') return node.fill
  if (node.fill?.type === 'linear') {
    const stops = node.fill.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
    return `linear-gradient(${node.fill.angle}deg, ${stops})`
  }
  return '#e5e7eb'
}
</script>

<template>
  <div class="h-full flex flex-col bg-app border-l border-app">
    <!-- Header -->
    <div class="p-3 border-b border-app">
      <h3 class="text-sm font-semibold text-app">Components</h3>
      <p class="text-[10px] text-app-muted mt-0.5">Reusable design elements</p>
    </div>

    <!-- Search -->
    <div class="p-2 border-b border-app">
      <Input
        v-model="searchQuery"
        placeholder="Search components..."
        icon="i-lucide-search"
        size="sm"
        variant="soft"
      />
    </div>

    <!-- Components List -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="filteredComponents.length === 0" class="text-center py-8">
        <Icon name="i-lucide-component" class="size-10 text-app-muted mb-2" />
        <p class="text-xs text-app-muted">No components yet</p>
        <p class="text-[10px] text-app-muted mt-1">
          Select an element and click<br>"Create Component" below
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="comp in filteredComponents"
          :key="comp.id"
          class="group relative p-2 rounded-lg border border-app hover:border-primary/50 transition-colors cursor-pointer"
          @click="emit('createInstance', comp.id)"
        >
          <!-- Preview -->
          <div
            class="h-16 rounded mb-2 flex items-center justify-center"
            :style="{ background: getComponentPreview(comp.node) }"
          >
            <Icon name="i-lucide-component" class="size-6 text-white/50" />
          </div>

          <!-- Info -->
          <div class="flex items-center justify-between">
            <div class="min-w-0">
              <p class="text-xs font-medium text-app truncate">{{ comp.name }}</p>
              <p class="text-[10px] text-app-muted">
                {{ comp.instanceCount }} instance{{ comp.instanceCount !== 1 ? 's' : '' }}
              </p>
            </div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                icon="i-lucide-crosshair"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Go to component"
                @click.stop="emit('goToComponent', comp.id)"
              />
              <Button
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                title="Remove component"
                @click.stop="emit('removeComponent', comp.id)"
              />
            </div>
          </div>

          <!-- Drag hint -->
          <div class="absolute inset-0 flex items-center justify-center bg-primary/10 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
            Click to create instance
          </div>
        </div>
      </div>
    </div>

    <!-- Create Component Button -->
    <div class="p-3 border-t border-app">
      <Button
        icon="i-lucide-plus"
        size="sm"
        variant="soft"
        color="primary"
        class="w-full"
        :disabled="!canCreateComponent"
        @click="emit('createComponent')"
      >
        Create Component
      </Button>
      <p v-if="!canCreateComponent" class="text-[10px] text-app-muted text-center mt-2">
        Select an element to create a component
      </p>
    </div>
  </div>
</template>
