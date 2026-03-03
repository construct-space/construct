<script setup lang="ts">
/**
 * OnboardingPage — First-run space installer
 *
 * On first launch, proposes installing recommended spaces from the marketplace.
 * In dev mode, all spaces are already available — install is a no-op.
 */

import { useSpaceMarketplace } from '@/composables/useSpaceMarketplace'
import { useSpaces } from '@/composables/useSpaces'
import { usePinnedStore, createSpacePin } from '@/stores/pinned'
import { getSpace as getSpaceTheme } from '@/config/spaces'
import { ArrowRight, Download, Check, Loader2 } from 'lucide-vue-next'

const router = useRouter()
const pinnedStore = usePinnedStore()
const marketplace = useSpaceMarketplace()
const { loadSpaces } = useSpaces()

// Recommended spaces to offer on first run
const recommendedSpaces = [
  { id: 'architect', name: 'Architect', description: 'AI-powered project planning', recommended: true },
  { id: 'code', name: 'Code', description: 'Code editor with terminal & git', recommended: true },
  { id: 'design', name: 'Design', description: 'Visual design tool', recommended: true },
  { id: 'kanban', name: 'Tasks', description: 'Project management with boards' },
  { id: 'docs', name: 'Docs', description: 'Project documentation' },
  { id: 'notes', name: 'Notes', description: 'Sticky notes and reminders' },
  { id: 'terminal', name: 'Terminal', description: 'Terminal emulator' },
  { id: 'git', name: 'Git', description: 'Version control' },
  { id: 'calendar', name: 'Calendar', description: 'Events and scheduling' },
  { id: 'ai', name: 'AI', description: 'AI-powered project assistant' },
  { id: 'chat', name: 'Chat', description: 'Team chat with AI' },
]

const selected = ref<Set<string>>(new Set(['architect', 'code', 'design']))
const installing = ref(false)
const installedIds = ref<Set<string>>(new Set())
const currentInstall = ref('')
const installError = ref<string | null>(null)

// On mount, check which spaces are already installed on disk
onMounted(async () => {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()

    const diskInstalled = new Set<string>()
    for (const s of recommendedSpaces) {
      const manifestPath = `${home}/.construct/spaces/${s.id}/manifest.json`
      if (await exists(manifestPath)) {
        diskInstalled.add(s.id)
      }
    }

    if (diskInstalled.size > 0) {
      installedIds.value = diskInstalled
      selected.value = diskInstalled
    }
  } catch { /* Tauri FS not available */ }
})

const spaceCards = computed(() => {
  return recommendedSpaces.map(s => {
    const theme = getSpaceTheme(s.id)
    return {
      ...s,
      icon: theme.icon,
      color: theme.color,
      bg: theme.bg,
      isSelected: selected.value.has(s.id),
      isInstalled: installedIds.value.has(s.id),
    }
  })
})

function toggleSpace(id: string) {
  if (installedIds.value.has(id)) return
  const newSet = new Set(selected.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selected.value = newSet
}

async function handleContinue() {
  installing.value = true
  installError.value = null

  try {
    // Initialize pinned store
    if (pinnedStore.items.length === 0) {
      await pinnedStore.init()
    }

    // Install or pin selected spaces
    for (const id of selected.value) {
      currentInstall.value = id

      // If not already on disk, download from marketplace
      if (!installedIds.value.has(id)) {
        try {
          await marketplace.install(id)
          installedIds.value.add(id)
        } catch (err) {
          console.error(`Failed to install ${id}:`, err)
          continue
        }
      }

      // Pin the space
      const space = recommendedSpaces.find(s => s.id === id)
      const theme = getSpaceTheme(id)
      if (space) {
        const pin = createSpacePin({
          name: space.name,
          spaceId: id,
          icon: theme.icon,
        })
        await pinnedStore.addPin(pin)
      }
    }

    // Reload spaces list
    await loadSpaces()

    // Mark onboarding complete
    localStorage.setItem('cp_onboarding_complete', 'true')
    router.push('/app')
  } catch (error) {
    console.error('Onboarding error:', error)
    installError.value = 'Some spaces failed to install. You can install them later from the Marketplace.'
    localStorage.setItem('cp_onboarding_complete', 'true')
    router.push('/app')
  } finally {
    installing.value = false
    currentInstall.value = ''
  }
}

function skipOnboarding() {
  localStorage.setItem('cp_onboarding_complete', 'true')
  router.push('/app')
}
</script>

<template>
  <div class="min-h-screen bg-[var(--app-background)]">
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-2xl">
<!-- Header -->
        <div class="text-center mb-10">
          <svg width="48" height="48" viewBox="0 0 533 533" fill="currentColor" class="text-[var(--app-accent)] mx-auto mb-4">
            <path d="M266.5 410.156C230.912 410.156 199.106 402.203 171.081 386.297C143.056 370.39 121.036 348.519 105.022 320.684C89.0072 292.848 81 261.256 81 225.909C81 190.12 89.0072 158.308 105.022 130.472C121.036 102.636 143.056 80.7655 171.081 64.8593C199.106 48.9531 230.912 41 266.5 41C302.087 41 333.671 48.9531 361.252 64.8593C389.277 80.7655 411.297 102.636 427.311 130.472C443.326 158.308 451.555 190.12 452 225.909C452 261.256 443.77 292.848 427.311 320.684C411.297 348.519 389.277 370.39 361.252 386.297C333.671 402.203 302.087 410.156 266.5 410.156ZM266.5 363.763C292.301 363.763 315.433 357.798 335.896 345.868C356.359 333.939 372.373 317.591 383.939 296.824C395.505 276.058 401.288 252.42 401.288 225.909C401.288 199.399 395.505 175.761 383.939 154.994C372.373 133.786 356.359 117.217 335.896 105.287C315.433 93.3579 292.301 87.393 266.5 87.393C240.699 87.393 217.567 93.3579 197.104 105.287C176.641 117.217 160.405 133.786 148.394 154.994C136.828 175.761 131.045 199.399 131.045 225.909C131.045 252.42 136.828 276.058 148.394 296.824C160.405 317.591 176.641 333.939 197.104 345.868C217.567 357.798 240.699 363.763 266.5 363.763Z" />
            <path d="M378.22 451.578C393.077 451.578 405.121 460.85 405.121 472.289C405.121 483.727 393.077 493 378.22 493H160.945C146.089 493 134.044 483.727 134.044 472.289C134.044 460.85 146.089 451.578 160.945 451.578H378.22Z" />
          </svg>
          <h1 class="text-3xl font-bold text-[var(--app-foreground)] mb-2">Welcome to Construct</h1>
          <p class="text-[var(--app-muted)]">Install spaces to get started. You can add more from the Marketplace anytime.</p>
        </div>

        <!-- Space grid -->
        <div class="grid grid-cols-3 gap-3 mb-8">
          <button
            v-for="space in spaceCards"
            :key="space.id"
            class="relative text-left p-4 rounded-xl border-2 transition-all"
            :class="[
              space.isInstalled
                ? 'border-green-500/30 bg-green-500/5 opacity-70'
                : space.isSelected
                  ? 'border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)]'
                  : 'border-[var(--app-border)] hover:border-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]'
            ]"
            :disabled="installing"
            @click="toggleSpace(space.id)"
          >
            <!-- Status indicator -->
            <div class="absolute top-3 right-3">
              <Check v-if="space.isInstalled" class="size-4 text-green-400" />
              <div
                v-else
                class="size-5 rounded-md border-2 flex items-center justify-center transition-all"
                :class="space.isSelected
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent)]'
                  : 'border-[var(--app-border)]'"
              >
                <svg v-if="space.isSelected" class="size-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              </div>
            </div>

            <!-- Recommended badge -->
            <span
              v-if="space.recommended"
              class="absolute top-3 left-3 text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--app-accent)]/10 text-[var(--app-accent)]"
            >
              Recommended
            </span>

            <!-- Icon -->
            <div
              class="size-9 rounded-lg flex items-center justify-center mb-2"
              :class="space.bg"
              :style="space.recommended ? 'margin-top: 1rem' : ''"
            >
              <Icon :name="space.icon" class="size-4.5" :class="space.color" />
            </div>

            <!-- Name & description -->
            <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-0.5">{{ space.name }}</h3>
            <p class="text-[11px] text-[var(--app-muted)] line-clamp-2 leading-relaxed">{{ space.description }}</p>
          </button>
        </div>

        <!-- Install progress -->
        <div v-if="installing" class="mb-6 p-4 rounded-lg border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-accent)_3%,transparent)]">
          <div class="flex items-center gap-3">
            <Loader2 class="size-4 text-[var(--app-accent)] animate-spin" />
            <span class="text-sm text-[var(--app-foreground)]">
              Installing {{ currentInstall }}...
            </span>
          </div>
        </div>

        <!-- Error -->
        <div v-if="installError" class="mb-6 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <p class="text-sm text-amber-400">{{ installError }}</p>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between">
          <button
            class="text-sm text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
            :disabled="installing"
            @click="skipOnboarding"
          >
            Skip for now
          </button>

          <button
            class="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[var(--app-accent)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="installing || selected.size === 0"
            @click="handleContinue"
          >
            <Download v-if="!installing" class="size-4" />
            <Loader2 v-else class="size-4 animate-spin" />
            {{ installing ? 'Installing...' : `Install ${selected.size} space${selected.size !== 1 ? 's' : ''} & Continue` }}
            <ArrowRight v-if="!installing" class="size-4" />
          </button>
        </div>
</div>
    </div>
  </div>
</template>
