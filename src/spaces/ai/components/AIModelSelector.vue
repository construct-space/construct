<script setup lang="ts">
/**
 * AIModelSelector - Dropdown for selecting AI model grouped by provider
 * Uses useAIModel composable for state and useContextService for data
 */

const {
  modelsByProvider,
  defaultModelId,
  currentModel,
  setDefaultModel,
  loading,
  initialized,
  init,
} = useAIModel()

const open = ref(false)

onMounted(async () => {
  if (!initialized.value) {
    await init()
  }
})

function selectModel(compositeId: string) {
  setDefaultModel(compositeId)
  open.value = false
}

// Provider icon mapping
function getProviderIcon(providerId: string): string {
  const icons: Record<string, string> = {
    anthropic: 'i-lucide-brain',
    openai: 'i-lucide-sparkles',
    deepseek: 'i-lucide-fish',
    gemini: 'i-lucide-sparkle',
    xai: 'i-lucide-zap',
    zai: 'i-lucide-cpu',
    kimi: 'i-lucide-moon',
    ollama: 'i-lucide-server',
  }
  return icons[providerId] || 'i-lucide-cpu'
}

// Auth type badge
function getAuthBadge(authType: string): { label: string; color: 'info' | 'success' } | null {
  if (authType === 'oauth') return { label: 'OAuth', color: 'info' }
  if (authType === 'local') return { label: 'Local', color: 'success' }
  return null
}
</script>

<template>
  <div class="relative">
    <Button
      variant="ghost"
      color="neutral"
      size="sm"
      :loading="loading"
      class="gap-2 max-w-48"
      @click="open = !open"
    >
      <template #leading>
        <Icon
          v-if="currentModel"
          :name="getProviderIcon(currentModel.providerId)"
          class="size-4"
        />
        <Icon v-else name="i-lucide-cpu" class="size-4" />
      </template>
      <span class="truncate text-xs">
        {{ currentModel?.label || 'Select Model' }}
      </span>
      <template #trailing>
        <Icon name="i-lucide-chevron-down" class="size-3" />
      </template>
    </Button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute top-full left-0 mt-1 w-72 bg-app rounded-lg border border-app shadow-xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div class="px-3 py-2 border-b border-app">
          <p class="text-xs font-medium text-app-muted uppercase tracking-wider">Select Model</p>
        </div>

        <!-- Provider Groups -->
        <div class="max-h-80 overflow-y-auto">
          <div
            v-for="group in modelsByProvider"
            :key="group.provider.id"
            class="border-b border-app last:border-b-0"
          >
            <!-- Provider Header -->
            <div class="px-3 py-1.5 flex items-center gap-2 bg-white/3">
              <Icon :name="getProviderIcon(group.provider.id)" class="size-3.5 text-app-muted" />
              <span class="text-xs font-medium text-app-muted">{{ group.provider.label }}</span>
              <Badge
                v-if="getAuthBadge(group.authType)"
                :label="getAuthBadge(group.authType)!.label"
                :color="getAuthBadge(group.authType)!.color"
                size="xs"
                variant="subtle"
              />
            </div>

            <!-- Models -->
            <button
              v-for="model in group.models"
              :key="model.compositeId"
              class="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors hover:bg-white/5"
              :class="defaultModelId === model.compositeId ? 'bg-app-accent/10' : ''"
              @click="selectModel(model.compositeId)"
            >
              <span class="flex-1 text-sm text-app truncate">{{ model.label }}</span>
              <Icon
                v-if="defaultModelId === model.compositeId"
                name="i-lucide-check"
                class="size-4 text-app-accent shrink-0"
              />
            </button>
          </div>

          <!-- Empty State -->
          <div v-if="modelsByProvider.length === 0 && !loading" class="px-3 py-6 text-center">
            <Icon name="i-lucide-cloud-off" class="size-8 text-app-muted mx-auto mb-2" />
            <p class="text-sm text-app-muted">No providers available</p>
            <p class="text-xs text-app-muted mt-1">Connect to the context service</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Backdrop to close -->
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="open = false"
    />
  </div>
</template>
