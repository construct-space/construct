<script setup lang="ts">
/**
 * PropertyComponentInstance - Instance override panel
 * Shown when a component-instance is selected.
 * Displays master name, go-to/detach actions, and override list.
 */
import type { DesignNode } from '~/types/design'

interface Props {
  selectedNodes: DesignNode[]
  masterName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  goToComponent: [componentId: string]
  detachInstance: [instanceId: string]
  resetOverride: [instanceId: string, path: string]
  resetAllOverrides: [instanceId: string]
}>()

const instance = computed(() => {
  const node = props.selectedNodes[0]
  return node?.type === 'component-instance' ? node : null
})

const componentId = computed(() => instance.value?.componentId || '')

const overrideEntries = computed(() => {
  if (!instance.value?.overrides) return []
  return Object.entries(instance.value.overrides).map(([path, value]) => ({
    path,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }))
})

function handleGoToComponent() {
  if (componentId.value) {
    emit('goToComponent', componentId.value)
  }
}

function handleDetach() {
  if (instance.value) {
    emit('detachInstance', instance.value.id)
  }
}

function handleResetOverride(path: string) {
  if (instance.value) {
    emit('resetOverride', instance.value.id, path)
  }
}

function handleResetAll() {
  if (instance.value) {
    emit('resetAllOverrides', instance.value.id)
  }
}
</script>

<template>
  <div v-if="instance" class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-3">
      <span class="i-lucide-component w-4 h-4 text-violet-400 shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-medium text-violet-400 truncate">
          Component Instance
        </p>
        <p v-if="masterName" class="text-[10px] text-[var(--app-muted)] truncate">
          {{ masterName }}
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1.5 mb-3">
      <Button
        icon="i-lucide-external-link"
        size="xs"
        variant="soft"
        color="neutral"
        class="flex-1"
        @click="handleGoToComponent"
      >
        Go to Main
      </Button>
      <Button
        icon="i-lucide-unlink"
        size="xs"
        variant="soft"
        color="neutral"
        class="flex-1"
        @click="handleDetach"
      >
        Detach
      </Button>
    </div>

    <!-- Overrides list -->
    <template v-if="overrideEntries.length > 0">
      <p class="text-[10px] font-medium text-[var(--app-muted)] mb-1.5">
        Overrides ({{ overrideEntries.length }})
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
        Reset All Overrides
      </Button>
    </template>
  </div>
</template>
