<script setup lang="ts">
/**
 * AIRoundRobinProgress - Horizontal step indicator during a round
 */
import type { InvitedModel } from '~/composables/useRoundRobin'

const props = defineProps<{
  models: InvitedModel[]
  activeIndex: number
  completedIndices: number[]
  errorIndices: number[]
}>()

function getStepState(index: number): 'done' | 'active' | 'error' | 'waiting' {
  if (props.errorIndices.includes(index)) return 'error'
  if (props.completedIndices.includes(index)) return 'done'
  if (index === props.activeIndex) return 'active'
  return 'waiting'
}

const stepClasses: Record<string, string> = {
  done: 'bg-green-500/20 border-green-500/30 text-green-400',
  active: 'bg-app-accent/20 border-app-accent/30 text-app-accent',
  error: 'bg-red-500/20 border-red-500/30 text-red-400',
  waiting: 'bg-white/5 border-white/10 text-app-muted',
}

const stepIcons: Record<string, string> = {
  done: 'i-lucide-check',
  active: 'i-lucide-loader-2',
  error: 'i-lucide-alert-circle',
  waiting: 'i-lucide-circle',
}
</script>

<template>
  <div class="flex items-center gap-1.5 px-4 py-2 bg-white/3 border-b border-white/5 overflow-x-auto">
    <template v-for="(model, i) in props.models" :key="model.compositeId">
      <div class="flex items-center gap-1.5 shrink-0">
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs"
          :class="stepClasses[getStepState(i)]"
        >
          <span class="text-[10px] font-mono opacity-60">{{ i + 1 }}</span>
          <AIModelAvatar :provider-id="model.providerId" :model-label="model.label" size="sm" />
          <span class="font-medium truncate max-w-24">{{ model.label }}</span>
          <Icon
            :name="stepIcons[getStepState(i)]"
            class="size-3.5"
            :class="getStepState(i) === 'active' ? 'animate-spin' : ''"
          />
        </div>
      </div>
      <Icon
        v-if="i < props.models.length - 1"
        name="i-lucide-arrow-right"
        class="size-3 text-app-muted shrink-0"
      />
    </template>
  </div>
</template>
