<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'

const settingsStore = useSettingsStore()
const toast = useToast()

const formData = ref({
  email_from_name: '',
  email_signature: '',
})

const loaded = ref(false)
const saved = ref(false)
let skipWatch = false
let saveTimeout: ReturnType<typeof setTimeout> | null = null

watch(() => settingsStore.emailSettings, (settings) => {
  skipWatch = true
  for (const s of settings) {
    if (s.setting_key === 'email_from_name') {
      formData.value.email_from_name = s.value_string || ''
    } else if (s.setting_key === 'email_signature') {
      formData.value.email_signature = s.value_string || ''
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
    await settingsStore.updateEmailSettings(formData.value)
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
      <FormField label="From Name" name="email_from_name" description="The display name for outgoing emails.">
        <Input v-model="formData.email_from_name" placeholder="Support Team" />
      </FormField>

      <FormField label="Email Signature" name="email_signature" description="Appended to outgoing emails.">
        <Textarea v-model="formData.email_signature" placeholder="Best regards,&#10;Your Team" :rows="6" />
      </FormField>

      <p v-if="settingsStore.isSaving" class="text-xs text-[var(--app-muted)]">Saving...</p>
      <p v-else-if="saved" class="text-xs text-green-500">Saved</p>
    </div>

    <!-- Preview -->
    <div class="mt-8 pt-6 border-t border-[var(--app-border)]">
      <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-4">Preview</h3>
      <div class="rounded-lg border border-[var(--app-border)] p-4 bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
        <div class="border-t border-[var(--app-border)] mt-3 pt-3">
          <pre class="text-sm text-[var(--app-muted)] whitespace-pre-wrap font-sans">{{ formData.email_signature || 'Best regards,\nYour Team' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
