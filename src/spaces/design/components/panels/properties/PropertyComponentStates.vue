<script setup lang="ts">
/**
 * PropertyComponentStates - Interactive state management for component masters
 * Shown when a component master or component instance is selected.
 */
import type { DesignNode, ComponentState } from '~/types/design'

interface Props {
  selectedNodes: DesignNode[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  addState: [componentId: string, name: string]
  removeState: [componentId: string, stateId: string]
  renameState: [componentId: string, stateId: string, name: string]
  setActiveState: [componentId: string, stateId: string | null]
  resetStateOverride: [componentId: string, stateId: string, path: string]
  resetAllStateOverrides: [componentId: string, stateId: string]
}>()

const PRESET_STATE_NAMES = ['Hover', 'Active', 'Pressed', 'Focused', 'Disabled']

const node = computed(() => props.selectedNodes[0] ?? null)

const componentId = computed(() => {
  if (!node.value) return null
  if (node.value.isComponent) return node.value.id
  if (node.value.type === 'component-instance') return node.value.componentId ?? null
  return null
})

const states = computed((): ComponentState[] => {
  return node.value?.componentStates ?? []
})

const activeStateId = computed(() => node.value?.activeStateId ?? null)

const activeState = computed((): ComponentState | null => {
  if (!activeStateId.value) return null
  return states.value.find(s => s.id === activeStateId.value) ?? null
})

const overrideEntries = computed(() => {
  if (!activeState.value?.overrides) return []
  return Object.entries(activeState.value.overrides).map(([path, value]) => ({
    path,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }))
})

// Available presets = presets that haven't been added yet
const availablePresets = computed(() => {
  const existing = new Set(states.value.map(s => s.name))
  return PRESET_STATE_NAMES.filter(name => !existing.has(name))
})

// Add state UI
const showAddInput = ref(false)
const newStateName = ref('')

function handleAddState() {
  const name = newStateName.value.trim()
  if (!name || !componentId.value) return
  emit('addState', componentId.value, name)
  newStateName.value = ''
  showAddInput.value = false
}

function handleAddPreset(name: string) {
  if (!componentId.value) return
  emit('addState', componentId.value, name)
}

function handleSetActiveState(stateId: string | null) {
  if (!componentId.value) return
  emit('setActiveState', componentId.value, stateId)
}

function handleRemoveState(stateId: string) {
  if (!componentId.value) return
  emit('removeState', componentId.value, stateId)
}

// Rename
const renamingStateId = ref<string | null>(null)
const renameValue = ref('')

function startRename(state: ComponentState) {
  renamingStateId.value = state.id
  renameValue.value = state.name
}

function confirmRename() {
  if (!renamingStateId.value || !componentId.value) return
  const name = renameValue.value.trim()
  if (name) {
    emit('renameState', componentId.value, renamingStateId.value, name)
  }
  renamingStateId.value = null
}

function handleResetOverride(path: string) {
  if (!componentId.value || !activeStateId.value) return
  emit('resetStateOverride', componentId.value, activeStateId.value, path)
}

function handleResetAll() {
  if (!componentId.value || !activeStateId.value) return
  emit('resetAllStateOverrides', componentId.value, activeStateId.value)
}
</script>

<template>
  <div v-if="componentId" class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">States</p>
      <Button
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="showAddInput = !showAddInput"
      />
    </div>

    <!-- State pills -->
    <div class="flex flex-wrap items-center gap-1 mb-2">
      <!-- Default pill -->
      <button
        class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
        :class="activeStateId === null
          ? 'bg-[var(--app-accent)] text-white'
          : 'bg-app-subtle text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
        @click="handleSetActiveState(null)"
      >
        Default
      </button>

      <!-- State pills -->
      <template v-for="s in states" :key="s.id">
        <!-- Rename mode -->
        <input
          v-if="renamingStateId === s.id"
          v-model="renameValue"
          class="px-2 py-0.5 rounded text-[10px] font-medium bg-app-subtle border border-[var(--app-accent)] w-16 outline-none"
          @keydown.enter="confirmRename"
          @keydown.escape="renamingStateId = null"
          @blur="confirmRename"
        >
        <!-- Normal pill -->
        <button
          v-else
          class="group relative px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          :class="activeStateId === s.id
            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
            : 'bg-app-subtle text-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
          @click="handleSetActiveState(s.id)"
          @dblclick.stop="startRename(s)"
        >
          {{ s.name }}
          <!-- Delete X on hover -->
          <span
            class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
            @click.stop="handleRemoveState(s.id)"
          >
            &times;
          </span>
        </button>
      </template>
    </div>

    <!-- Add state input -->
    <div v-if="showAddInput" class="mb-2">
      <!-- Preset quick-add -->
      <div v-if="availablePresets.length > 0" class="flex flex-wrap gap-1 mb-1.5">
        <button
          v-for="preset in availablePresets"
          :key="preset"
          class="px-1.5 py-0.5 rounded text-[9px] text-[var(--app-muted)] bg-app-subtle hover:bg-app-hover hover:text-[var(--app-foreground)] transition-colors"
          @click="handleAddPreset(preset)"
        >
          + {{ preset }}
        </button>
      </div>
      <!-- Custom name input -->
      <div class="flex items-center gap-1">
        <input
          v-model="newStateName"
          placeholder="Custom state name..."
          class="flex-1 px-2 py-1 rounded text-[10px] bg-app-subtle border border-[var(--app-border)] outline-none focus:border-[var(--app-accent)]"
          @keydown.enter="handleAddState"
          @keydown.escape="showAddInput = false"
        >
        <Button
          size="xs"
          variant="soft"
          color="primary"
          :disabled="!newStateName.trim()"
          @click="handleAddState"
        >
          Add
        </Button>
      </div>
    </div>

    <!-- Active state indicator -->
    <div
      v-if="activeState"
      class="mb-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20"
    >
      <div class="flex items-center gap-1.5">
        <span class="i-lucide-zap w-3 h-3 text-amber-400" />
        <span class="text-[10px] font-medium text-amber-400">
          Editing "{{ activeState.name }}" state
        </span>
      </div>
      <p class="text-[9px] text-amber-400/60 mt-0.5">
        Property changes apply to this state only
      </p>
    </div>

    <!-- State overrides list -->
    <template v-if="activeState && overrideEntries.length > 0">
      <p class="text-[10px] font-medium text-[var(--app-muted)] mb-1.5">
        State Overrides ({{ overrideEntries.length }})
      </p>
      <div class="space-y-1">
        <div
          v-for="entry in overrideEntries"
          :key="entry.path"
          class="flex items-center gap-1.5 px-2 py-1.5 rounded bg-app-subtle"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[10px] text-[var(--app-muted)] truncate">{{ entry.path }}</p>
            <p class="text-[10px] text-[var(--app-foreground)] truncate">{{ entry.value }}</p>
          </div>
          <Button
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            color="neutral"
            class="shrink-0"
            @click="handleResetOverride(entry.path)"
          />
        </div>
      </div>
      <Button
        icon="i-lucide-rotate-ccw"
        size="xs"
        variant="ghost"
        color="neutral"
        class="w-full mt-2"
        @click="handleResetAll"
      >
        Reset State Overrides
      </Button>
    </template>
  </div>
</template>
