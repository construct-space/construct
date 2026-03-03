<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  company_name: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_website: '',
  company_nui: '',
})

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.companySettings, (settings) => {
  skipWatch = true
  for (const s of settings) {
    const key = s.setting_key as keyof typeof formData.value
    if (key in formData.value) {
      formData.value[key] = s.value_string || ''
    }
  }
  nextTick(() => { skipWatch = false; loaded.value = true })
}, { immediate: true })

watch(formData, () => {
  if (!loaded.value || skipWatch) return
  saved.value = false
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 1200)
}, { deep: true })

async function save() {
  try {
    await settingsStore.updateCompanySettings(formData.value)
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
      <FormField label="Company Name" name="company_name">
        <Input v-model="formData.company_name" placeholder="Your company name" />
      </FormField>

      <FormField label="Address" name="company_address">
        <Input v-model="formData.company_address" placeholder="Street address" />
      </FormField>

      <div class="grid grid-cols-2 gap-4">
        <FormField label="Phone" name="company_phone">
          <Input v-model="formData.company_phone" placeholder="+1 234 567 890" />
        </FormField>
        <FormField label="Email" name="company_email">
          <Input v-model="formData.company_email" type="email" placeholder="info@company.com" />
        </FormField>
      </div>

      <FormField label="Website" name="company_website">
        <Input v-model="formData.company_website" placeholder="https://company.com" />
      </FormField>

      <FormField label="NUI / Tax ID" name="company_nui">
        <Input v-model="formData.company_nui" placeholder="Tax identification number" />
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>
  </div>
</template>
