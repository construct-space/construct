<script setup lang="ts">
/**
 * OnboardingPage — Space picker for first-time users
 *
 * Shown after first login. User selects which built-in spaces to pin
 * to their sidebar dock, then continues to the app.
 */

import { builtinSpaces } from '~/spaces/builtin'
import { usePinnedStore, createSpacePin } from '@/stores/pinned'
import { getSpace as getSpaceConfig } from '@/config/spaces'
import { ArrowRight } from 'lucide-vue-next'

const router = useRouter()
const pinnedStore = usePinnedStore()

// Pre-select common spaces
const defaultSelections = new Set(['code', 'design', 'kanban', 'docs'])
const selected = ref<Set<string>>(new Set(defaultSelections))

const spaceCards = computed(() => {
  return builtinSpaces
    .sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
    .map(s => {
      const config = getSpaceConfig(s.name)
      return {
        name: s.name,
        displayName: s.displayName || s.name,
        description: s.description || config.description,
        icon: config.icon,
        color: config.color,
        bg: config.bg,
        isSelected: selected.value.has(s.name),
      }
    })
})

function toggleSpace(spaceName: string) {
  const newSet = new Set(selected.value)
  if (newSet.has(spaceName)) {
    newSet.delete(spaceName)
  } else {
    newSet.add(spaceName)
  }
  selected.value = newSet
}

const isLoading = ref(false)

async function handleContinue() {
  isLoading.value = true
  try {
    // Initialize pinned store if needed
    if (pinnedStore.items.length === 0) {
      await pinnedStore.init()
    }

    // Pin selected spaces
    for (const spaceName of selected.value) {
      const space = builtinSpaces.find(s => s.name === spaceName)
      if (!space) continue
      const config = getSpaceConfig(spaceName)
      const pin = createSpacePin({
        name: space.displayName || spaceName,
        spaceId: spaceName,
        icon: config.icon,
      })
      await pinnedStore.addPin(pin)
    }

    // Mark onboarding as complete
    localStorage.setItem('onboarding_complete', 'true')

    // Navigate to app
    router.push('/app')
  } catch (error) {
    console.error('Onboarding error:', error)
    // Still mark complete so user isn't stuck
    localStorage.setItem('onboarding_complete', 'true')
    router.push('/app')
  } finally {
    isLoading.value = false
  }
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
          <p class="text-[var(--app-muted)]">Choose the spaces you'd like in your sidebar. You can always change this later.</p>
        </div>

        <!-- Space grid -->
        <div class="grid grid-cols-3 gap-3 mb-8">
          <button
            v-for="space in spaceCards"
            :key="space.name"
            class="relative text-left p-4 rounded-xl border-2 transition-all"
            :class="space.isSelected
              ? 'border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)]'
              : 'border-[var(--app-border)] hover:border-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]'"
            @click="toggleSpace(space.name)"
          >
            <!-- Checkbox indicator -->
            <div
              class="absolute top-3 right-3 size-5 rounded-md border-2 flex items-center justify-center transition-all"
              :class="space.isSelected
                ? 'border-[var(--app-accent)] bg-[var(--app-accent)]'
                : 'border-[var(--app-border)]'"
            >
              <svg v-if="space.isSelected" class="size-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
            </div>

            <!-- Icon -->
            <div
              class="size-9 rounded-lg flex items-center justify-center mb-2"
              :class="space.bg"
            >
              <Icon :name="space.icon" class="size-4.5" :class="space.color" />
            </div>

            <!-- Name & description -->
            <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-0.5">{{ space.displayName }}</h3>
            <p class="text-[11px] text-[var(--app-muted)] line-clamp-2 leading-relaxed">{{ space.description }}</p>
          </button>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between">
          <RouterLink
            to="/app/marketplace"
            class="text-sm text-[var(--app-muted)] hover:text-[var(--app-accent)] transition-colors"
          >
            Get more spaces from the Marketplace
          </RouterLink>

          <button
            class="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[var(--app-accent)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="isLoading || selected.size === 0"
            @click="handleContinue"
          >
            {{ isLoading ? 'Setting up...' : 'Continue' }}
            <ArrowRight class="size-4" />
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
