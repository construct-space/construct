<script setup lang="ts">
/**
 * AIModelAvatar - Circular avatar with provider icon + accent color
 */
const props = withDefaults(defineProps<{
  providerId: string
  modelLabel?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  modelLabel: '',
  size: 'md',
})

const providerConfig: Record<string, { icon: string; color: string }> = {
  anthropic: { icon: 'i-lucide-brain', color: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
  deepseek: { icon: 'i-lucide-fish', color: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
  xai: { icon: 'i-lucide-zap', color: 'bg-purple-500/20 border-purple-500/30 text-purple-400' },
  gemini: { icon: 'i-lucide-sparkle', color: 'bg-teal-500/20 border-teal-500/30 text-teal-400' },
  zai: { icon: 'i-lucide-cpu', color: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' },
  xiaomi: { icon: 'i-lucide-smartphone', color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
}

const config = computed(() => providerConfig[props.providerId] || { icon: 'i-lucide-cpu', color: 'bg-gray-500/20 border-gray-500/30 text-gray-400' })

const sizeClasses = computed(() => {
  if (props.size === 'sm') return { wrapper: 'size-6', icon: 'size-3' }
  if (props.size === 'lg') return { wrapper: 'size-10', icon: 'size-5' }
  return { wrapper: 'size-8', icon: 'size-4' }
})
</script>

<template>
  <div
    class="rounded-full border flex items-center justify-center shrink-0"
    :class="[config.color, sizeClasses.wrapper]"
    :title="modelLabel"
  >
    <Icon :name="config.icon" :class="sizeClasses.icon" />
  </div>
</template>
