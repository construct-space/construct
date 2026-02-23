<script setup lang="ts">
/**
 * SpacesPage — Launchpad-style grid of all available spaces
 *
 * Shows all built-in + installed spaces. Users can pin/unpin spaces
 * and navigate to any space. Links to the Marketplace for more.
 */

import { useSpaces } from '@/composables/useSpaces'
import { usePinnedStore, createSpacePin } from '@/stores/pinned'
import { getSpace as getSpaceConfig } from '@/config/spaces'
import { Pin, PinOff, ArrowRight, Store } from 'lucide-vue-next'

const router = useRouter()
const { spaces, loadSpaces } = useSpaces()
const pinnedStore = usePinnedStore()

onMounted(async () => {
  if (spaces.value.length === 0) {
    await loadSpaces()
  }
  if (pinnedStore.items.length === 0) {
    await pinnedStore.init()
  }
})

const spaceCards = computed(() => {
  return spaces.value.map(s => {
    const config = getSpaceConfig(s.name)
    const pinId = `space-global-${s.name}`
    return {
      name: s.name,
      displayName: s.displayName || s.name,
      description: s.description || config.description,
      icon: config.icon,
      color: config.color,
      bg: config.bg,
      isPinned: pinnedStore.isPinned(pinId),
      pinId,
      isInstalled: s.isInstalled ?? false,
    }
  })
})

async function togglePin(space: typeof spaceCards.value[0]) {
  const pin = createSpacePin({
    name: space.displayName,
    spaceId: space.name,
    icon: space.icon,
  })
  await pinnedStore.togglePin(pin)
}

function navigateToSpace(spaceName: string) {
  router.push(`/app/${spaceName}`)
}

function openMarketplace() {
  router.push('/app/marketplace')
}
</script>

<template>
  <div class="h-screen overflow-y-auto">
    <div class="max-w-4xl mx-auto px-6 py-10">

      <!-- Header -->
      <div class="mb-8">
        <p class="text-lg tracking-wide select-none mb-1">
          <span class="text-[var(--app-muted)] font-normal">CONSTRUCT:</span><span class="font-bold text-[var(--app-foreground)]">SPACES</span>
        </p>
        <p class="text-sm text-[var(--app-muted)]">All available spaces. Pin your favorites to the sidebar dock.</p>
      </div>

      <!-- Space grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <button
          v-for="space in spaceCards"
          :key="space.name"
          class="group relative text-left p-5 rounded-xl border border-[var(--app-border)] hover:border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_3%,transparent)] transition-all"
          @click="navigateToSpace(space.name)"
        >
          <!-- Pin toggle -->
          <button
            class="absolute top-3 right-3 p-1.5 rounded-md transition-all z-10"
            :class="space.isPinned
              ? 'text-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)]'
              : 'text-[var(--app-muted)] opacity-0 group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--app-muted)_10%,transparent)]'"
            :title="space.isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'"
            @click.stop="togglePin(space)"
          >
            <component :is="space.isPinned ? PinOff : Pin" class="size-3.5" />
          </button>

          <!-- Installed badge -->
          <span
            v-if="space.isInstalled"
            class="absolute top-3 left-3 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] text-[var(--app-accent)]"
          >
            Installed
          </span>

          <!-- Icon -->
          <div
            class="size-10 rounded-lg flex items-center justify-center mb-3"
            :class="space.bg"
          >
            <Icon :name="space.icon" class="size-5" :class="space.color" />
          </div>

          <!-- Name & description -->
          <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-1">{{ space.displayName }}</h3>
          <p class="text-xs text-[var(--app-muted)] line-clamp-2 leading-relaxed">{{ space.description }}</p>

          <!-- Navigate arrow -->
          <ArrowRight class="absolute bottom-4 right-4 size-3.5 text-[var(--app-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      <!-- Browse Marketplace -->
      <div class="border-t border-[var(--app-border)] pt-8">
        <button
          class="flex items-center gap-3 px-5 py-3.5 rounded-xl border border-dashed border-[var(--app-border)] hover:border-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_3%,transparent)] transition-all w-full text-left"
          @click="openMarketplace"
        >
          <Store class="size-5 text-[var(--app-muted)]" />
          <div>
            <p class="text-sm font-medium text-[var(--app-foreground)]">Browse Marketplace</p>
            <p class="text-xs text-[var(--app-muted)]">Discover and install more spaces from the community</p>
          </div>
          <ArrowRight class="size-4 text-[var(--app-muted)] ml-auto" />
        </button>
      </div>

    </div>
  </div>
</template>
