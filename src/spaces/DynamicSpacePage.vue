<script setup lang="ts">
/**
 * DynamicSpacePage — THE unified renderer for ALL spaces.
 *
 * There are no built-in/hardcoded space routes anymore.
 * Every space (code, design, architect, etc.) goes through this component.
 *
 * Dev mode:  loads from src/spaces/ via Vite dynamic import
 * Prod mode: loads pre-built IIFE bundles from ~/.construct/spaces/
 *
 * Uses SpaceLoader to get Vue components, renders with <component :is>.
 * Falls back to agent-powered placeholder for config-only spaces (no Vue bundle).
 */

import { loadSpace, watchSpace, type LoadedSpace } from '@/spaces/SpaceLoader'
import { getSpace as getSpaceTheme } from '@/config/spaces'
import { useSpaces } from '@/composables/useSpaces'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-vue-next'
import { shallowRef, markRaw } from 'vue'

const props = defineProps<{
  spaceName: string
  subPage?: string
}>()

const router = useRouter()

const space = shallowRef<LoadedSpace | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

/** The current page path ('' for index, 'editor', 'terminal', etc.) */
const currentPagePath = computed(() => props.subPage ?? '')

/** The Vue component to render for the current page */
const currentPage = computed(() => {
  if (!space.value?.pages) return null
  return space.value.pages[currentPagePath.value] ?? null
})

/** Theme config for the space (colors, icon) */
const theme = computed(() => getSpaceTheme(props.spaceName))

/** Manifest data */
const manifest = computed(() => space.value?.manifest)

/** Apply markRaw to loaded space pages */
function applyLoaded(loaded: LoadedSpace | null) {
  if (loaded) {
    Object.keys(loaded.pages).forEach(k => {
      loaded.pages[k] = markRaw(loaded.pages[k])
    })
  }
  space.value = loaded
  if (!space.value) {
    error.value = `Space "${props.spaceName}" is not installed.`
  }
}

/** Load the space on mount and when spaceName changes */
async function load() {
  loading.value = true
  error.value = null
  try {
    const loaded = await loadSpace(props.spaceName)
    applyLoaded(loaded)
  } catch (err) {
    error.value = `Failed to load space "${props.spaceName}": ${err}`
    console.error('[DynamicSpacePage]', err)
  } finally {
    loading.value = false
  }
}

/** Dev mode HMR: watch the space bundle for changes and hot-reload */
let unwatchFn: (() => void) | null = null

async function setupDevWatcher() {
  if (!import.meta.env.DEV) return
  // Clean up previous watcher
  unwatchFn?.()
  const { loadSpaces } = useSpaces()
  unwatchFn = await watchSpace(props.spaceName, async (reloaded) => {
    applyLoaded(reloaded)
    // Refresh spaces list so sidebar/toolbar pick up manifest changes
    await loadSpaces()
  })
}

onMounted(async () => {
  await load()
  await setupDevWatcher()
})

watch(() => props.spaceName, async () => {
  unwatchFn?.()
  await load()
  await setupDevWatcher()
})

onUnmounted(() => {
  unwatchFn?.()
})
</script>

<template>
  <div class="h-full flex flex-col">
<!-- Loading state -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-[var(--app-muted)]">
        <Loader2 class="size-5 animate-spin" />
        <span class="text-sm">Loading {{ spaceName }}...</span>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-sm">
        <AlertCircle class="size-10 text-red-400 mx-auto mb-4" />
        <p class="text-sm text-[var(--app-muted)] mb-4">{{ error }}</p>
        <div class="flex gap-3 justify-center">
          <button
            class="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-foreground)] hover:bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)] transition-colors"
            @click="router.push('/app/marketplace')"
          >
            Browse Marketplace
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-foreground)] hover:bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)] transition-colors"
            @click="load"
          >
            Retry
          </button>
        </div>
      </div>
    </div>

    <!-- Space loaded — render component -->
    <template v-else-if="space">
      <!-- Render the page component if available -->
      <component
        v-if="currentPage"
        :is="currentPage"
        :key="`${spaceName}-${currentPagePath}`"
      />

      <!-- Page not found within the space -->
      <div v-else-if="currentPagePath" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p class="text-sm text-[var(--app-muted)]">
            Page "{{ currentPagePath }}" not found in {{ manifest?.name ?? spaceName }}.
          </p>
          <button
            class="mt-4 px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)] transition-colors"
            @click="router.push(`/app/${spaceName}`)"
          >
            Go to {{ manifest?.name ?? spaceName }}
          </button>
        </div>
      </div>

      <!-- Config-only space with no Vue pages — agent fallback -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center max-w-sm">
          <div
            class="size-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            :class="theme.bg"
          >
            <Icon :name="theme.icon" class="size-8" :class="theme.color" />
          </div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)] mb-2">
            {{ manifest?.name ?? spaceName }}
          </h2>
          <p class="text-sm text-[var(--app-muted)] mb-4">
            {{ manifest?.description ?? '' }}
          </p>
          <p class="text-xs text-[var(--app-muted)]">
            This space uses agent-powered interaction.
          </p>
        </div>
      </div>
    </template>
</div>
</template>
