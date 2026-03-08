<script setup lang="ts">
import type { ArchitectPlan } from '@/utils/documentsGenerator'
import type { TemplateConfig } from '@/utils/templates.config'

defineProps<{
  plan: ArchitectPlan
  projectPath: string
  initGit: boolean
  isKicking: boolean
  kickoffProgress: number
  progressMessage: string
  isConstructSpace: boolean
  detectedTemplate: TemplateConfig | null
  detectedBackendTemplate: TemplateConfig | null
}>()

const emit = defineEmits<{
  'update:projectPath': [value: string]
  'update:initGit': [value: boolean]
  create: []
  back: []
  browse: []
}>()
</script>

<template>
  <div>
    <p class="text-sm text-app-muted tracking-wider">CONFIGURE</p>
    <h2 class="text-3xl font-bold text-app mt-1">{{ plan.name }}</h2>
  </div>

  <!-- Kickoff progress overlay -->
  <div v-if="isKicking" class="space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
        <div class="architect-spinner" />
      </div>
      <div>
        <p class="text-sm font-medium text-app">Creating your project</p>
        <p class="text-xs text-app-muted">{{ progressMessage }}</p>
      </div>
    </div>
    <div class="h-2 bg-white/10 rounded-full overflow-hidden w-full">
      <div class="h-full bg-app-accent rounded-full transition-all duration-500 ease-out" :style="{ width: `${kickoffProgress}%` }" />
    </div>
  </div>

  <!-- Config form -->
  <div v-else class="space-y-5">
    <!-- Local directory -->
    <div class="space-y-2">
      <label class="text-xs text-app-muted uppercase tracking-wider">Project Directory</label>
      <div class="flex items-center gap-2">
        <input
          :value="projectPath"
          type="text"
          class="flex-1 px-3 py-2 text-sm rounded-md bg-white/50 dark:bg-white/10 text-app border border-white/10 focus:border-app-accent/50 focus:outline-none transition-colors"
          placeholder="~/ConstructProjects/my-project"
          @input="emit('update:projectPath', ($event.target as HTMLInputElement).value)"
        >
        <button
          class="px-3 py-2 text-sm rounded-md bg-white/50 dark:bg-white/10 text-app-muted hover:text-app hover:bg-white/70 dark:hover:bg-white/15 transition-colors shrink-0"
          @click="emit('browse')"
        >
          <Icon name="i-lucide-folder-open" class="size-4" />
        </button>
      </div>
    </div>

    <!-- Framework scaffold info -->
    <div class="space-y-2">
      <label class="text-xs text-app-muted uppercase tracking-wider">Framework Scaffold</label>
      <!-- Frontend -->
      <div class="flex items-center gap-3 p-2.5 rounded-md bg-white/50 dark:bg-white/5">
        <div class="w-8 h-8 rounded-md flex items-center justify-center bg-white dark:bg-white/10">
          <Icon
            :name="isConstructSpace ? (plan?.spaceIcon || 'i-lucide-puzzle') : (detectedTemplate?.icon || 'i-lucide-file-code')"
            class="size-4"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-app">
            {{ isConstructSpace ? `Will scaffold Construct space: ${plan?.spaceId}` : detectedTemplate ? `Frontend: ${detectedTemplate.name}` : 'Static frontend (no framework)' }}
          </p>
          <p class="text-xs text-app-muted">
            {{ isConstructSpace ? `Creates space-${plan?.spaceId}/ with Vue 3 IIFE bundle, pages, components, and brain` : `code/frontend/ — ${detectedTemplate?.description || 'Creates index.html, style.css, script.js'}` }}
          </p>
        </div>
      </div>
      <!-- Backend -->
      <div v-if="detectedBackendTemplate && !isConstructSpace" class="flex items-center gap-3 p-2.5 rounded-md bg-white/50 dark:bg-white/5">
        <div class="w-8 h-8 rounded-md flex items-center justify-center bg-white dark:bg-white/10">
          <Icon :name="detectedBackendTemplate.icon || 'i-lucide-server'" class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-app">Backend: {{ detectedBackendTemplate.name }}</p>
          <p class="text-xs text-app-muted">code/backend/ — {{ detectedBackendTemplate.description }}</p>
        </div>
      </div>
    </div>

    <!-- Git init checkbox -->
    <div class="space-y-2">
      <label class="text-xs text-app-muted uppercase tracking-wider">Version Control</label>
      <button
        class="w-full flex items-center gap-3 p-2.5 rounded-md transition-all duration-150 text-left"
        :class="initGit
          ? 'bg-app-accent/10 ring-1 ring-app-accent/30'
          : 'bg-white/50 dark:bg-white/10 hover:bg-white/70 dark:hover:bg-white/15'"
        @click="emit('update:initGit', !initGit)"
      >
        <div
          class="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
          :class="initGit ? 'bg-app-accent' : 'bg-white/20 border border-white/20'"
        >
          <Icon v-if="initGit" name="i-lucide-check" class="size-3 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-app">Initialize git repository</p>
          <p class="text-xs text-app-muted">Run git init in the project directory</p>
        </div>
        <Icon name="i-lucide-git-branch" class="size-4 text-app-muted shrink-0" />
      </button>
    </div>
  </div>

  <!-- Actions -->
  <div v-if="!isKicking" class="flex items-center gap-3 pt-2">
    <Button :disabled="!projectPath.trim()" @click="emit('create')">
      <template #leading>
        <Icon name="i-lucide-rocket" class="size-4" />
      </template>
      Create Project
    </Button>
    <button class="text-sm text-app-muted hover:text-app transition-colors" @click="emit('back')">
      Back to plan
    </button>
  </div>
</template>
