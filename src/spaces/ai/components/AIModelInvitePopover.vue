<script setup lang="ts">
/**
 * AIModelInvitePopover - Dropdown listing all models grouped by provider
 * Already-invited models shown as checked/disabled
 * Teleported to body so it's not clipped by overflow-hidden parents
 */
import type { InvitedModel } from '~/composables/useRoundRobin'

const props = defineProps<{
  invitedIds: string[]
  maxReached: boolean
}>()

const emit = defineEmits<{
  (e: 'invite', model: InvitedModel): void
}>()

const { modelsByProvider } = useAIModel()
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const dropdownPos = ref({ top: 0, left: 0 })

function updatePosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  // Open below the button
  dropdownPos.value = {
    top: rect.bottom + 6,
    left: rect.left,
  }
}

function toggle() {
  if (props.maxReached) return
  open.value = !open.value
  if (open.value) {
    nextTick(updatePosition)
  }
}

function handleInvite(compositeId: string, label: string, providerId: string, providerLabel: string) {
  if (props.invitedIds.includes(compositeId) || props.maxReached) return
  emit('invite', { compositeId, label, providerId, providerLabel })
}

const providerIcons: Record<string, string> = {
  anthropic: 'i-lucide-brain',
  deepseek: 'i-lucide-fish',
  xai: 'i-lucide-zap',
  gemini: 'i-lucide-sparkle',
  zai: 'i-lucide-cpu',
  xiaomi: 'i-lucide-smartphone',
}
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-app-muted hover:text-app transition-colors"
      :class="props.maxReached ? 'opacity-40 cursor-not-allowed' : ''"
      :disabled="props.maxReached"
      @click="toggle"
    >
      <Icon name="i-lucide-plus" class="size-3.5" />
      <span>Invite</span>
    </button>

    <Teleport to="body">
      <!-- Backdrop -->
      <div
        v-if="open"
        class="fixed inset-0 z-[199]"
        @click="open = false"
      />
      <!-- Dropdown -->
      <div
        v-if="open"
        class="fixed z-[200] w-72 bg-app rounded-xl border border-app shadow-2xl overflow-hidden"
        :style="{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }"
      >
        <div class="px-3 py-2.5 border-b border-app">
          <p class="text-xs font-medium text-app-muted uppercase tracking-wider">Invite Model</p>
        </div>

        <div class="max-h-72 overflow-y-auto py-1">
          <div
            v-for="group in modelsByProvider"
            :key="group.provider.id"
          >
            <div class="px-3 py-1.5 flex items-center gap-2 sticky top-0 bg-app">
              <Icon :name="providerIcons[group.provider.id] || 'i-lucide-cpu'" class="size-3.5 text-app-muted" />
              <span class="text-[11px] font-medium text-app-muted uppercase tracking-wider">{{ group.provider.label }}</span>
            </div>

            <button
              v-for="model in group.models"
              :key="model.compositeId"
              class="w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors"
              :class="props.invitedIds.includes(model.compositeId)
                ? 'bg-app-accent/5 text-app-muted cursor-default'
                : 'hover:bg-white/[0.06] text-app'"
              :disabled="props.invitedIds.includes(model.compositeId)"
              @click="handleInvite(model.compositeId, model.label, group.provider.id, group.provider.label)"
            >
              <AIModelAvatar :provider-id="group.provider.id" :model-label="model.label" size="sm" />
              <span class="flex-1 text-sm truncate">{{ model.label }}</span>
              <Icon
                v-if="props.invitedIds.includes(model.compositeId)"
                name="i-lucide-check"
                class="size-4 text-app-accent shrink-0"
              />
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
