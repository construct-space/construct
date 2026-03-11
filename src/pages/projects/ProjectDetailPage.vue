<script setup lang="ts">
/**
 * ProjectDetailPage - Shows project info, space summaries, and available spaces grid
 * ProjectLayout has already resolved and set currentProject
 */
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { getSpace } from '@/config/spaces'
import { routeParamString } from '@/utils/projectRoutes'
import { useProjectSummary } from '@/composables/useProjectSummary'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const project = computed(() => projectStore.currentProject)

const projectRouteKey = computed(() => {
  return routeParamString(route.params.projectId)
})

const projectPath = computed(() => project.value?.path || project.value?.local_path)
const projectId = computed(() => project.value?.id)

const { summary } = useProjectSummary(projectPath, projectId)

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

const extLabel: Record<string, string> = {
  ts: 'TypeScript', js: 'JavaScript', vue: 'Vue', tsx: 'TSX', jsx: 'JSX',
  go: 'Go', rs: 'Rust', py: 'Python', rb: 'Ruby', swift: 'Swift',
  dart: 'Dart', kt: 'Kotlin', java: 'Java', css: 'CSS', scss: 'SCSS',
  html: 'HTML', json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  md: 'Markdown', sql: 'SQL', sh: 'Shell', svg: 'SVG', png: 'Image',
  jpg: 'Image', jpeg: 'Image', gif: 'Image', webp: 'Image',
}

function getExtLabel(ext: string): string {
  return extLabel[ext] || `.${ext}`
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
          <button
            class="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-foreground)] transition-colors hover:border-amber-400/40 hover:bg-amber-400/10"
            @click="enterSpace('vibe')"
          >
            <i class="i-lucide-zap size-3.5 text-amber-400" />
            Open Vibe
          </button>
        </div>

        <!-- PROJECT OVERVIEW CARDS -->
        <div v-if="summary.loading" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <div v-for="i in 4" :key="i" class="h-24 rounded-lg bg-white/[0.02] animate-pulse" />
        </div>
        <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <!-- Files -->
          <div
            v-if="summary.files.count > 0"
            class="p-4 rounded-lg bg-white/[0.02] border border-transparent hover:border-[var(--app-border)] transition-colors cursor-pointer"
            @click="enterSpace('code')"
          >
            <div class="flex items-center gap-2 mb-2">
              <i class="i-lucide-folder-tree size-4 text-blue-400" />
              <span class="text-xs text-[var(--app-muted)] uppercase tracking-wider font-medium">Files</span>
            </div>
            <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ summary.files.count }}</p>
            <div v-if="summary.files.languages.length" class="flex flex-wrap gap-1 mt-2">
              <span
                v-for="lang in summary.files.languages.slice(0, 3)"
                :key="lang.ext"
                class="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[var(--app-muted)]"
              >{{ getExtLabel(lang.ext) }}</span>
            </div>
          </div>

          <!-- Documents -->
          <div
            v-if="summary.docs.count > 0"
            class="p-4 rounded-lg bg-white/[0.02] border border-transparent hover:border-[var(--app-border)] transition-colors cursor-pointer"
            @click="enterSpace('docs')"
          >
            <div class="flex items-center gap-2 mb-2">
              <i class="i-lucide-file-text size-4 text-emerald-400" />
              <span class="text-xs text-[var(--app-muted)] uppercase tracking-wider font-medium">Docs</span>
            </div>
            <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ summary.docs.count }}</p>
            <div v-if="summary.docs.items.length" class="mt-2 space-y-0.5">
              <p
                v-for="doc in summary.docs.items.slice(0, 3)"
                :key="doc.title"
                class="text-[10px] text-[var(--app-muted)] truncate"
              >{{ doc.title }}</p>
            </div>
          </div>

          <!-- Designs -->
          <div
            v-if="summary.designs.count > 0"
            class="p-4 rounded-lg bg-white/[0.02] border border-transparent hover:border-[var(--app-border)] transition-colors cursor-pointer"
            @click="enterSpace('design')"
          >
            <div class="flex items-center gap-2 mb-2">
              <i class="i-lucide-pen-tool size-4 text-purple-400" />
              <span class="text-xs text-[var(--app-muted)] uppercase tracking-wider font-medium">Designs</span>
            </div>
            <p class="text-2xl font-bold text-[var(--app-foreground)]">{{ summary.designs.count }}</p>
            <div v-if="summary.designs.items.length" class="mt-2 space-y-0.5">
              <p
                v-for="design in summary.designs.items.slice(0, 3)"
                :key="design.name"
                class="text-[10px] text-[var(--app-muted)] truncate"
              >{{ design.name }}</p>
            </div>
          </div>

          <!-- Git -->
          <div
            v-if="summary.git.hasRepo"
            class="p-4 rounded-lg bg-white/[0.02] border border-transparent hover:border-[var(--app-border)] transition-colors cursor-pointer"
            @click="enterSpace('git')"
          >
            <div class="flex items-center gap-2 mb-2">
              <i class="i-lucide-git-branch size-4 text-orange-400" />
              <span class="text-xs text-[var(--app-muted)] uppercase tracking-wider font-medium">Git</span>
            </div>
            <p class="text-sm font-medium text-[var(--app-foreground)] mt-1">
              {{ summary.git.branch || 'Repository' }}
            </p>
            <p class="text-[10px] text-[var(--app-muted)] mt-1">Version controlled</p>
          </div>
        </div>

        <!-- SPACES GRID -->
        <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium mb-6">Spaces</p>

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
