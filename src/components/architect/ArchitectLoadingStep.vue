<script setup lang="ts">
defineProps<{
  isGeneratingQuestions: boolean
  elapsedSeconds: number
  loadingSteps: string[]
  loadingPhase: number
}>()

defineEmits<{
  cancel: []
}>()
</script>

<template>
  <div class="flex flex-col items-start py-12 space-y-6">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
        <div class="architect-spinner" />
      </div>
      <div>
        <p class="text-sm font-medium text-app">
          {{ isGeneratingQuestions ? 'Preparing interview' : 'Building your plan' }}
        </p>
        <p class="text-xs text-app-muted">
          {{ elapsedSeconds < 5 ? 'This takes a few seconds' : `${elapsedSeconds}s elapsed` }}
        </p>
      </div>
    </div>

    <!-- Animated steps -->
    <div class="space-y-3 w-full">
      <div
        v-for="(stepText, idx) in loadingSteps"
        :key="idx"
        class="flex items-center gap-3 transition-all duration-700 ease-out"
        :class="idx <= loadingPhase ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'"
      >
        <div
          class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500"
          :class="idx < loadingPhase
            ? 'bg-app-accent/20'
            : idx === loadingPhase
              ? 'bg-app-accent/10 ring-2 ring-app-accent/30'
              : 'bg-white/5'"
        >
          <Icon v-if="idx < loadingPhase" name="i-lucide-check" class="size-3 text-app-accent" />
          <div v-else-if="idx === loadingPhase" class="w-2 h-2 rounded-full bg-app-accent architect-dot-pulse" />
          <div v-else class="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>
        <span
          class="text-sm transition-colors duration-500"
          :class="idx === loadingPhase ? 'text-app' : idx < loadingPhase ? 'text-app-muted' : 'text-app-muted/40'"
        >
          {{ stepText }}
        </span>
      </div>
    </div>

    <button
      class="text-xs text-app-muted hover:text-app transition-colors flex items-center gap-1.5 pt-2"
      @click="$emit('cancel')"
    >
      <Icon name="i-lucide-x" class="size-3" />
      Cancel
    </button>
  </div>
</template>
