<script setup lang="ts">
/**
 * ProjectDetailPage - Shows project info and available spaces grid
 * ProjectLayout has already resolved and set currentProject
 */
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { getSpace } from '@/config/spaces'
import { routeParamString } from '@/utils/projectRoutes'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const project = computed(() => projectStore.currentProject)

const projectRouteKey = computed(() => {
  return routeParamString(route.params.projectId)
})

function enterSpace(spaceName: string) {
  if (projectRouteKey.value) {
    router.push(`/app/projects/${projectRouteKey.value}/${spaceName}`)
  }
}

function goBack() {
  router.push('/app/projects')
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}
</script>

<template>
  <div class="h-full flex">
    <!-- LEFT COLUMN (1/3) -->
    <div class="w-1/3 flex flex-col items-start justify-center shrink-0 px-6">
      <div v-if="projectStore.loading" class="space-y-3">
        <div class="h-5 w-32 bg-[var(--app-muted)]/10 rounded animate-pulse" />
      </div>

      <template v-else-if="project">
        <div class="flex items-center gap-3">
          <button
            class="w-7 h-7 flex items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-muted)] hover:text-[var(--app-foreground)] hover:border-[var(--app-foreground)] transition-colors shrink-0"
            title="Back to Projects"
            @click="goBack"
          >
            <i class="i-lucide-arrow-left size-3.5" />
          </button>
          <p class="text-lg tracking-wide select-none">
            <span class="text-[var(--app-muted)] font-normal">CONSTRUCT:</span><span class="font-bold text-[var(--app-foreground)]">{{ project.name.toUpperCase() }}</span>
          </p>
        </div>
      </template>

      <div v-else class="text-sm text-[var(--app-muted)]">
        Project not found
      </div>
    </div>

    <!-- RIGHT COLUMN (2/3) -->
    <div class="w-2/3 flex-1 overflow-auto py-10 pr-10">
      <div v-if="projectStore.loading" class="space-y-4">
        <div class="h-6 w-3/4 bg-[var(--app-muted)]/10 rounded animate-pulse" />
        <div class="h-6 w-1/2 bg-[var(--app-muted)]/10 rounded animate-pulse" />
      </div>

      <template v-else-if="project">
        <p v-if="project.description" class="text-2xl text-[var(--app-foreground)]/80 leading-relaxed font-light mb-6">
          {{ project.description }}
        </p>

        <div class="flex items-center gap-6 text-sm text-[var(--app-muted)] mb-10">
          <span class="flex items-center gap-2">
            <i class="i-lucide-calendar size-4" />
            Created {{ formatDate(project.created_at || '') }}
          </span>
          <span class="flex items-center gap-2">
            <i class="i-lucide-layers size-4" />
            {{ (project.spaces || []).length }} spaces
          </span>
          <span class="flex items-center gap-2 font-mono text-xs opacity-60">
            {{ project.path }}
          </span>
        </div>

        <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium mb-6">Available Spaces</p>

        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            v-for="space in (project.spaces || [])"
            :key="space"
            class="flex items-start gap-3 p-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
            @click="enterSpace(space)"
          >
            <i
              :class="[getSpace(space).icon, 'size-5 shrink-0 mt-0.5', getSpace(space).color]"
            />
            <div>
              <h3 class="text-sm font-bold text-[var(--app-foreground)] uppercase tracking-wide">
                {{ getSpace(space).label }}
              </h3>
              <p class="text-xs text-[var(--app-muted)] mt-0.5">
                {{ getSpace(space).description }}
              </p>
            </div>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
