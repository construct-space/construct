<script setup lang="ts">
import type { InterviewQuestion } from '@/utils/architect-knowledge'

const props = defineProps<{
  question: InterviewQuestion
  step: number
  totalSteps: number
  selectedValues: string[]
  showOtherInput: boolean
  otherInputValue: string
}>()

const emit = defineEmits<{
  select: [value: string]
  confirm: []
  confirmOther: []
  back: []
  'update:showOtherInput': [value: boolean]
  'update:otherInputValue': [value: string]
}>()

function isSelected(value: string): boolean {
  return props.selectedValues.includes(value)
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-1">
      <p class="text-sm text-app-muted tracking-wider uppercase">{{ question.id }}</p>
      <span class="text-[10px] text-app-muted bg-white/10 px-1.5 py-0.5 rounded font-mono">
        {{ step }}/{{ totalSteps }}
      </span>
    </div>
    <h2 class="text-2xl font-bold text-app mt-1">{{ question.question }}</h2>
    <p v-if="question.type === 'multi'" class="text-xs text-app-muted mt-1">
      Select multiple, then press Continue
    </p>
  </div>

  <!-- Options -->
  <div class="space-y-2">
    <button
      v-for="(opt, idx) in question.options"
      :key="opt.value"
      class="w-full flex items-center gap-3 p-3 rounded-md transition-all duration-150 text-left group"
      :class="isSelected(opt.value)
        ? 'bg-app-accent/10 ring-1 ring-app-accent/30'
        : 'bg-white/50 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/15'"
      @click="emit('select', opt.value)"
    >
      <span class="text-[10px] text-app-muted/40 w-4 text-center font-mono shrink-0">{{ idx + 1 }}</span>
      <div
        class="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        :class="isSelected(opt.value) ? 'bg-app-accent/20' : 'bg-white dark:bg-white/10'"
      >
        <Icon :name="opt.icon || 'i-lucide-box'" class="size-4" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-sm text-app">{{ opt.label }}</p>
        <p class="text-xs text-app-muted">{{ opt.description }}</p>
      </div>
      <div v-if="isSelected(opt.value)" class="w-5 h-5 rounded-full bg-app-accent flex items-center justify-center shrink-0">
        <Icon name="i-lucide-check" class="size-3 text-white" />
      </div>
    </button>

    <!-- "Other" option -->
    <button
      v-if="!showOtherInput"
      class="w-full flex items-center gap-3 p-3 rounded-md transition-all duration-150 text-left group bg-white/50 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/15 border border-dashed border-white/20"
      @click="emit('select', '__other__')"
    >
      <span class="text-[10px] text-app-muted/40 w-4 text-center font-mono shrink-0">{{ question.options.length + 1 }}</span>
      <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-white dark:bg-white/10">
        <Icon name="i-lucide-pencil" class="size-4 text-app-muted" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-sm text-app-muted">Other</p>
        <p class="text-xs text-app-muted/60">Type your own answer</p>
      </div>
    </button>

    <!-- "Other" text input -->
    <div v-if="showOtherInput" class="p-3 rounded-md bg-app-accent/5 ring-1 ring-app-accent/30 space-y-3">
      <div class="flex items-center gap-2">
        <Icon name="i-lucide-pencil" class="size-4 text-app-accent shrink-0" />
        <p class="text-sm font-medium text-app">Your answer</p>
      </div>
      <Input
        :model-value="otherInputValue"
        placeholder="Type your choice..."
        autofocus
        @update:model-value="emit('update:otherInputValue', $event as string)"
        @keydown.enter.prevent="emit('confirmOther')"
        @keydown.escape.prevent="emit('update:showOtherInput', false); emit('update:otherInputValue', '')"
      />
      <div class="flex items-center justify-end gap-2">
        <button
          class="text-xs text-app-muted hover:text-app transition-colors"
          @click="emit('update:showOtherInput', false); emit('update:otherInputValue', '')"
        >
          Cancel
        </button>
        <Button size="xs" :disabled="!otherInputValue.trim()" @click="emit('confirmOther')">
          Confirm
        </Button>
      </div>
    </div>
  </div>

  <!-- Bottom bar -->
  <div class="flex items-center justify-between pt-2">
    <button class="text-xs text-app-muted hover:text-app transition-colors flex items-center gap-1" @click="emit('back')">
      <Icon name="i-lucide-arrow-left" class="size-3" />
      Back
    </button>
    <Button v-if="question.type === 'multi'" size="sm" :disabled="selectedValues.length === 0" @click="emit('confirm')">
      Continue
    </Button>
  </div>
</template>
