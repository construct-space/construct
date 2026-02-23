<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import Slider from '@/components/ui/Slider.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  design_grid_size: 10,
  design_snap_enabled: false,
  design_show_grid: true,
  design_show_rulers: true,
  design_auto_save: true,
  design_auto_save_interval: 30,
})

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.designSettings, (settings) => {
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
    await settingsStore.updateDesignSettings(formData.value)
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-10">

    <!-- Grid -->
    <div>
      <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium mb-6">Grid</p>

      <div class="space-y-0">
        <div class="flex items-center justify-between py-3 border-b border-[var(--app-border)]/50">
          <span class="text-sm text-[var(--app-foreground)]">Grid size</span>
          <Input v-model="formData.design_grid_size" type="number" prefix="px" class="w-28" />
        </div>
        <div class="flex items-center justify-between py-3 border-b border-[var(--app-border)]/50">
          <span class="text-sm text-[var(--app-foreground)]">Snap to grid</span>
          <Switch v-model="formData.design_snap_enabled" />
        </div>
        <div class="flex items-center justify-between py-3 border-b border-[var(--app-border)]/50">
          <span class="text-sm text-[var(--app-foreground)]">Show grid</span>
          <Switch v-model="formData.design_show_grid" />
        </div>
        <div class="flex items-center justify-between py-3">
          <span class="text-sm text-[var(--app-foreground)]">Rulers</span>
          <Switch v-model="formData.design_show_rulers" />
        </div>
      </div>
    </div>

    <!-- Auto Save -->
    <div>
      <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium mb-6">Auto Save</p>

      <div class="space-y-0">
        <div class="flex items-center justify-between py-3 border-b border-[var(--app-border)]/50">
          <span class="text-sm text-[var(--app-foreground)]">Enabled</span>
          <Switch v-model="formData.design_auto_save" />
        </div>
        <div class="flex items-center justify-between gap-6 py-3">
          <span class="text-sm text-[var(--app-foreground)] shrink-0">Interval</span>
          <div class="flex items-center gap-3 flex-1">
            <Slider v-model="formData.design_auto_save_interval" :min="5" :max="120" :step="5" class="flex-1" />
            <Input v-model="formData.design_auto_save_interval" type="number" suffix="s" class="w-20 shrink-0" />
          </div>
        </div>
      </div>
    </div>

    <!-- Save status -->
    <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving…</p>
    <p v-else-if="saved" class="text-xs text-emerald-400">Saved</p>

  </div>
</template>
