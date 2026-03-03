<script setup lang="ts">
import Switch from '@/components/ui/Switch.vue'

const preferencesStore = usePreferencesStore()
const toast = useToast()

interface NotificationPreferences {
  email: boolean
  desktop: boolean
  product_updates: boolean
  weekly_digest: boolean
  important_updates: boolean
}

const defaultPrefs: NotificationPreferences = {
  email: true,
  desktop: false,
  product_updates: true,
  weekly_digest: false,
  important_updates: true,
}

const state = ref<NotificationPreferences>({ ...defaultPrefs })
const loading = ref(true)
const saving = ref<string | null>(null)

const sections = [
  {
    title: 'Notification Channels',
    description: 'Where can we notify you?',
    fields: [
      { name: 'email' as keyof NotificationPreferences, label: 'Email', description: 'Receive email notifications for important events.' },
      { name: 'desktop' as keyof NotificationPreferences, label: 'Desktop', description: 'Receive desktop push notifications.' },
    ],
  },
  {
    title: 'Account Updates',
    description: 'Receive updates about the platform.',
    fields: [
      { name: 'weekly_digest' as keyof NotificationPreferences, label: 'Weekly digest', description: 'Receive a weekly summary of activity.' },
      { name: 'product_updates' as keyof NotificationPreferences, label: 'Product updates', description: 'Get notified about new features and improvements.' },
      { name: 'important_updates' as keyof NotificationPreferences, label: 'Important updates', description: 'Security fixes and critical maintenance notices.' },
    ],
  },
]

onMounted(async () => {
  try {
    await preferencesStore.init()
    const saved = preferencesStore.get<NotificationPreferences>('notifications', defaultPrefs)
    Object.assign(state.value, saved)
  } catch (error) {
    console.error('Failed to load notification preferences:', error)
  } finally {
    loading.value = false
  }
})

async function onChange(fieldName: keyof NotificationPreferences) {
  saving.value = fieldName
  try {
    const result = await preferencesStore.setPreference('notifications', { ...state.value })
    if (!result.success) {
      state.value[fieldName] = !state.value[fieldName]
      toast.add({ title: 'Failed to save preference', color: 'error' })
    }
  } catch {
    state.value[fieldName] = !state.value[fieldName]
    toast.add({ title: 'Failed to save preference', color: 'error' })
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <div>
<!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-[var(--app-muted)]" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <!-- Sections -->
    <div v-else class="flex flex-col gap-8">
      <div v-for="(section, index) in sections" :key="index">
        <div class="border-b border-[var(--app-border)] pb-2 mb-4">
          <h3 class="text-sm font-semibold text-[var(--app-foreground)]">{{ section.title }}</h3>
          <p class="text-xs text-[var(--app-muted)]">{{ section.description }}</p>
        </div>

        <div class="flex flex-col gap-4">
          <div
            v-for="field in section.fields"
            :key="field.name"
            class="flex items-center justify-between py-2"
          >
            <div>
              <p class="text-sm font-medium text-[var(--app-foreground)]">{{ field.label }}</p>
              <p class="text-xs text-[var(--app-muted)]">{{ field.description }}</p>
            </div>
            <div class="flex items-center gap-2">
              <svg
                v-if="saving === field.name"
                class="w-4 h-4 animate-spin text-[var(--app-muted)]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <Switch
                v-model="state[field.name]"
                :disabled="saving !== null"
                @update:model-value="onChange(field.name)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
