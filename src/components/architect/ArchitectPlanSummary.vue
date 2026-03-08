<script setup lang="ts">
import type { ArchitectPlan } from '@/utils/documentsGenerator'

defineProps<{
  plan: ArchitectPlan
  isInsideProject: boolean
  isKicking: boolean
}>()

defineEmits<{
  createProject: []
  saveFeature: []
  editChoices: []
}>()
</script>

<template>
  <div>
    <p class="text-sm text-app-muted tracking-wider">
      {{ isInsideProject ? 'YOUR FEATURE' : 'YOUR PROJECT' }}
    </p>
    <h2 class="text-3xl font-bold text-app mt-1">{{ plan.name }}</h2>
  </div>

  <p class="text-app-muted text-sm">{{ plan.description }}</p>

  <!-- Decisions grid -->
  <div class="space-y-2">
    <div
      v-for="(value, key) in plan.decisions"
      v-show="value && (Array.isArray(value) ? value.length > 0 : true)"
      :key="key"
      class="flex items-center gap-3 p-2.5 rounded-md bg-white/50 dark:bg-white/5"
    >
      <span class="text-xs text-app-muted capitalize w-20 shrink-0">{{ key }}</span>
      <span class="text-sm font-medium text-app">
        {{ Array.isArray(value) ? value.join(', ') : value }}
      </span>
    </div>
  </div>

  <!-- Core features -->
  <div v-if="plan.prd?.coreFeatures?.length" class="space-y-2">
    <p class="text-xs text-app-muted uppercase tracking-wider">
      {{ isInsideProject ? 'Components' : 'Core Features' }}
    </p>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="feature in plan.prd.coreFeatures"
        :key="feature"
        class="text-xs px-2 py-1 rounded-md bg-white/50 dark:bg-white/5 text-app"
      >
        {{ feature }}
      </span>
    </div>
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-3 pt-4">
    <Button v-if="!isInsideProject" :loading="isKicking" :disabled="isKicking" @click="$emit('createProject')">
      <template #leading>
        <Icon name="i-lucide-rocket" class="size-4" />
      </template>
      {{ isKicking ? 'Creating Project...' : 'Create Project' }}
    </Button>
    <Button v-else @click="$emit('saveFeature')">
      <template #leading>
        <Icon name="i-lucide-save" class="size-4" />
      </template>
      Save Feature Plan
    </Button>
    <button class="text-sm text-app-muted hover:text-app transition-colors" @click="$emit('editChoices')">
      Edit choices
    </button>
  </div>
</template>
