<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  timezone: 'UTC',
  date_format: 'YYYY-MM-DD',
  time_format: '24h',
  maintenance_mode: false,
})

const timezoneOptions = [
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Central', value: 'US/Central' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'Europe/Paris', value: 'Europe/Paris' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'Asia/Shanghai', value: 'Asia/Shanghai' },
  { label: 'Australia/Sydney', value: 'Australia/Sydney' },
]

const dateFormatOptions = [
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'DD.MM.YYYY', value: 'DD.MM.YYYY' },
]

const timeFormatOptions = [
  { label: '24-hour', value: '24h' },
  { label: '12-hour', value: '12h' },
]

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.systemSettings, (settings) => {
  skipWatch = true
  for (const s of settings) {
    if (s.setting_key === 'maintenance_mode') {
      formData.value.maintenance_mode = s.value_bool
    } else {
      const key = s.setting_key as keyof typeof formData.value
      if (key in formData.value && typeof formData.value[key] === 'string') {
        ;(formData.value as Record<string, unknown>)[key] = s.value_string || ''
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
    await settingsStore.updateSystemSettings(formData.value)
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
      <FormField label="Timezone" name="timezone">
        <Select v-model="formData.timezone" :options="timezoneOptions" />
      </FormField>

      <div class="grid grid-cols-2 gap-4">
        <FormField label="Date Format" name="date_format">
          <Select v-model="formData.date_format" :options="dateFormatOptions" />
        </FormField>
        <FormField label="Time Format" name="time_format">
          <Select v-model="formData.time_format" :options="timeFormatOptions" />
        </FormField>
      </div>

      <FormField label="Maintenance Mode" description="When enabled, only admins can access the application.">
        <Switch v-model="formData.maintenance_mode" />
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>
  </div>
</template>
