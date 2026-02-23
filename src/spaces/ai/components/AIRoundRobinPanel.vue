<script setup lang="ts">
/**
 * AIRoundRobinPanel - Horizontal chip strip of invited models below composer
 * Supports reordering, remove, and invite
 */
import type { InvitedModel } from '~/composables/useRoundRobin'

const props = defineProps<{
  invitedModels: InvitedModel[]
  canInvite: boolean
  isRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'invite', model: InvitedModel): void
  (e: 'remove', compositeId: string): void
  (e: 'reorder', models: InvitedModel[]): void
}>()

const invitedIds = computed(() => props.invitedModels.map(m => m.compositeId))

// Drag state
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number) {
  dragIndex.value = index
}

function onDragOver(index: number) {
  dragOverIndex.value = index
}

function onDragEnd() {
  if (dragIndex.value !== null && dragOverIndex.value !== null && dragIndex.value !== dragOverIndex.value) {
    const reordered = [...props.invitedModels]
    const [moved] = reordered.splice(dragIndex.value, 1)
    if (moved) {
      reordered.splice(dragOverIndex.value, 0, moved)
      emit('reorder', reordered)
    }
  }
  dragIndex.value = null
  dragOverIndex.value = null
}

function handleInvite(model: InvitedModel) {
  emit('invite', model)
}

function handleRemove(compositeId: string) {
  emit('remove', compositeId)
}
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <!-- Model chips -->
    <div
      v-for="(model, i) in props.invitedModels"
      :key="model.compositeId"
      class="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all cursor-grab active:cursor-grabbing"
      :class="[
        dragOverIndex === i ? 'bg-app-accent/10' : 'bg-white/[0.04]',
        props.isRunning ? 'opacity-60 pointer-events-none' : '',
      ]"
      draggable="true"
      @dragstart="onDragStart(i)"
      @dragover.prevent="onDragOver(i)"
      @dragend="onDragEnd"
    >
      <span class="text-[10px] text-app-muted font-mono">{{ i + 1 }}</span>
      <AIModelAvatar :provider-id="model.providerId" :model-label="model.label" size="sm" />
      <span class="text-xs text-app font-medium truncate max-w-28">{{ model.label }}</span>
      <button
        v-if="!props.isRunning"
        class="p-0.5 rounded-full hover:bg-white/10 text-app-muted hover:text-app transition-colors"
        @click="handleRemove(model.compositeId)"
      >
        <Icon name="i-lucide-x" class="size-3" />
      </button>
    </div>

    <!-- Invite button -->
    <AIModelInvitePopover
      v-if="!props.isRunning"
      :invited-ids="invitedIds"
      :max-reached="!props.canInvite"
      @invite="handleInvite"
    />

    <!-- Model count -->
    <span class="text-[10px] text-app-muted ml-auto">
      {{ props.invitedModels.length }}/5 models
    </span>
  </div>
</template>
