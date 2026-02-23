<script setup lang="ts">
import type { DesignNode, PrototypeInteraction, PrototypeTrigger, PrototypeAction, PrototypeTransition, PrototypeEasing } from '~/types/design'
import UIScrubInput from '../../UIScrubInput.vue'

interface Props {
  selectedNodes: DesignNode[]
  targets: readonly {
    value: string
    label: string
    pageLabel: string
    nodeLabel: string
  }[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update', property: string, value: unknown): void
}>()

const selectedNode = computed(() => props.selectedNodes[0] ?? null)

const interactions = computed<PrototypeInteraction[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  if (node.prototypeInteractions?.length) return node.prototypeInteractions
  // Legacy fallback — show old link as single interaction
  if (node.prototypeLinkTarget || node.prototypeLinkPageId) {
    return [{
      trigger: 'click' as PrototypeTrigger,
      action: 'navigate' as PrototypeAction,
      target: node.prototypeLinkTarget || node.prototypeLinkPageId || '',
      transition: 'instant' as PrototypeTransition,
      duration: 0,
      easing: 'easeInOut' as PrototypeEasing,
    }]
  }
  return []
})

// Flat targets for native select
const flatTargets = computed(() => props.targets.map(t => ({ label: t.label, value: t.value })))

const triggerOptions = [
  { label: 'Click', value: 'click' },
  { label: 'Hover', value: 'hover' },
  { label: 'Mouse Enter', value: 'mouseEnter' },
  { label: 'Mouse Leave', value: 'mouseLeave' },
  { label: 'After Delay', value: 'afterDelay' },
]

const actionOptions = [
  { label: 'Navigate', value: 'navigate' },
  { label: 'Back', value: 'back' },
  { label: 'Open URL', value: 'openUrl' },
]

const transitionOptions = [
  { label: 'Instant', value: 'instant' },
  { label: 'Dissolve', value: 'dissolve' },
  { label: 'Slide Left', value: 'slideLeft' },
  { label: 'Slide Right', value: 'slideRight' },
  { label: 'Slide Up', value: 'slideUp' },
  { label: 'Slide Down', value: 'slideDown' },
  { label: 'Push', value: 'push' },
]

const easingOptions = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease In', value: 'easeIn' },
  { label: 'Ease Out', value: 'easeOut' },
  { label: 'Ease In Out', value: 'easeInOut' },
]

function emitInteractions(updated: PrototypeInteraction[]) {
  emit('update', 'prototypeInteractions', updated)
  // Clear legacy fields when using new system
  emit('update', 'prototypeLinkTarget', '')
  emit('update', 'prototypeLinkPageId', '')
}

function addInteraction() {
  const next: PrototypeInteraction[] = [
    ...interactions.value,
    { trigger: 'click', action: 'navigate', transition: 'instant', duration: 300, easing: 'easeInOut' },
  ]
  emitInteractions(next)
}

function removeInteraction(index: number) {
  const next = interactions.value.filter((_, i) => i !== index)
  emitInteractions(next)
}

function updateField<K extends keyof PrototypeInteraction>(index: number, field: K, value: PrototypeInteraction[K]) {
  const next = interactions.value.map((item, i) => {
    if (i !== index) return item
    return { ...item, [field]: value }
  })
  emitInteractions(next)
}
</script>

<template>
  <div class="px-3 py-3 border-b border-[var(--app-border)] overflow-hidden">
    <div class="flex items-center justify-between mb-2">
      <p class="text-[11px] font-medium text-[var(--app-muted)]">Prototype</p>
      <Button
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="addInteraction"
      />
    </div>

    <div v-if="interactions.length === 0" class="text-[11px] text-[var(--app-muted)]">
      No interactions. Click + to add one.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(interaction, index) in interactions"
        :key="index"
        class="rounded-md bg-app-subtle border border-[var(--app-border)] p-2 space-y-2"
      >
        <!-- Header: trigger summary + delete -->
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-medium text-[var(--app-foreground)] truncate">
            {{ triggerOptions.find(t => t.value === interaction.trigger)?.label || interaction.trigger }}
            → {{ actionOptions.find(a => a.value === interaction.action)?.label || interaction.action }}
          </span>
          <Button
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="removeInteraction(index)"
          />
        </div>

        <!-- Trigger -->
        <div>
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Trigger</label>
          <Select
            :model-value="interaction.trigger"
            :items="triggerOptions"
            size="xs"
            @update:model-value="(v: string | number) => updateField(index, 'trigger', String(v) as PrototypeTrigger)"
          />
        </div>

        <!-- Delay (only for afterDelay) -->
        <div v-if="interaction.trigger === 'afterDelay'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Delay (ms)</label>
          <UIScrubInput
            :model-value="interaction.delay ?? 1000"
            :min="0"
            :max="10000"
            :step="100"
            icon="i-lucide-timer"
            suffix="ms"
            @update:model-value="(v: number) => updateField(index, 'delay', v)"
          />
        </div>

        <!-- Action -->
        <div>
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Action</label>
          <Select
            :model-value="interaction.action"
            :items="actionOptions"
            size="xs"
            @update:model-value="(v: string | number) => updateField(index, 'action', String(v) as PrototypeAction)"
          />
        </div>

        <!-- Target (only for navigate) -->
        <div v-if="interaction.action === 'navigate'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Target</label>
          <Select
            :model-value="interaction.target || ''"
            :items="flatTargets"
            size="xs"
            placeholder="Select screen…"
            @update:model-value="(v: string | number) => updateField(index, 'target', String(v))"
          />
        </div>

        <!-- URL (only for openUrl) -->
        <div v-if="interaction.action === 'openUrl'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">URL</label>
          <Input
            :model-value="interaction.url || ''"
            size="xs"
            placeholder="https://…"
            @update:model-value="(v: string | number) => updateField(index, 'url', String(v))"
          />
        </div>

        <!-- Transition -->
        <div v-if="interaction.action !== 'openUrl'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Transition</label>
          <Select
            :model-value="interaction.transition || 'instant'"
            :items="transitionOptions"
            size="xs"
            @update:model-value="(v: string | number) => updateField(index, 'transition', String(v) as PrototypeTransition)"
          />
        </div>

        <!-- Duration (hidden when instant) -->
        <div v-if="interaction.action !== 'openUrl' && interaction.transition && interaction.transition !== 'instant'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Duration (ms)</label>
          <UIScrubInput
            :model-value="interaction.duration ?? 300"
            :min="0"
            :max="2000"
            :step="50"
            icon="i-lucide-clock"
            suffix="ms"
            @update:model-value="(v: number) => updateField(index, 'duration', v)"
          />
        </div>

        <!-- Easing (hidden when instant) -->
        <div v-if="interaction.action !== 'openUrl' && interaction.transition && interaction.transition !== 'instant'">
          <label class="text-[10px] text-[var(--app-muted)] block mb-0.5">Easing</label>
          <Select
            :model-value="interaction.easing || 'easeInOut'"
            :items="easingOptions"
            size="xs"
            @update:model-value="(v: string | number) => updateField(index, 'easing', String(v) as PrototypeEasing)"
          />
        </div>
      </div>
    </div>

    <p v-if="props.targets.length === 0 && interactions.length > 0" class="text-[11px] text-[var(--app-muted)] mt-2">
      Add another screen or page to create navigate targets.
    </p>
  </div>
</template>
