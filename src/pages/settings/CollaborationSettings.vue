<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Switch from '@/components/ui/Switch.vue'
import Slider from '@/components/ui/Slider.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  collab_real_time_sync: true,
  collab_show_cursors: true,
  collab_presence_timeout: 300,
})

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.collaborationSettings, (settings) => {
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
    await settingsStore.updateCollaborationSettings(formData.value)
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
      <FormField label="Real-Time Sync" description="Enable real-time synchronization between collaborators.">
        <Switch v-model="formData.collab_real_time_sync" />
      </FormField>

      <FormField label="Show Cursors" description="Display other users' cursors in the editor.">
        <Switch v-model="formData.collab_show_cursors" />
      </FormField>

      <FormField label="Presence Timeout" :description="`Users appear offline after ${formData.collab_presence_timeout} seconds of inactivity.`">
        <Slider v-model="formData.collab_presence_timeout" :min="30" :max="900" :step="30" />
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>
  </div>
</template>
