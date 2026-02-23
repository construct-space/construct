<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Switch from '@/components/ui/Switch.vue'
import Slider from '@/components/ui/Slider.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  ai_enabled: true,
  ai_suggestions_enabled: true,
  ai_context_limit: 4096,
})

const contextPresets = [
  { label: '2K', value: 2048 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
]

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.aiSettings, (settings) => {
  skipWatch = true
  for (const s of settings) {
    const key = s.setting_key as keyof typeof formData.value
    if (key in formData.value) {
      if (s.type === 'bool') {
        ;(formData.value as Record<string, unknown>)[key] = s.value_bool
      } else if (s.type === 'int') {
        ;(formData.value as Record<string, unknown>)[key] = s.value_int
      }
    }
  }
  nextTick(() => { skipWatch = false; loaded.value = true })
}, { immediate: true })

watch(formData, () => {
  if (!loaded.value || skipWatch) return
  saved.value = false
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 600)
}, { deep: true })

async function save() {
  try {
    await settingsStore.updateAiSettings(formData.value)
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  }
}
</script>

<template>
  <div>

    <div class="flex flex-col gap-5">
      <FormField label="Enable AI" description="Turn the AI assistant on or off globally.">
        <Switch v-model="formData.ai_enabled" />
      </FormField>

      <FormField label="AI Suggestions" description="Show inline AI suggestions while editing.">
        <Switch v-model="formData.ai_suggestions_enabled" />
      </FormField>

      <FormField label="Context Limit" :description="`${formData.ai_context_limit} tokens`">
        <Slider
          v-model="formData.ai_context_limit"
          :min="1024"
          :max="32768"
          :step="1024"
        />
        <div class="flex gap-2 mt-2">
          <button
            v-for="preset in contextPresets"
            :key="preset.value"
            type="button"
            class="px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer"
            :class="formData.ai_context_limit === preset.value
              ? 'border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-app-accent'
              : 'border-[var(--app-border)] text-[var(--app-muted)] hover:border-[var(--app-accent)]'"
            @click="formData.ai_context_limit = preset.value"
          >
            {{ preset.label }}
          </button>
        </div>
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>
  </div>
</template>
