<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const authStore = useAuthStore()
const toast = useToast()
const api = useApi()

const form = ref({
  first_name: authStore.user?.first_name ?? '',
  last_name: authStore.user?.last_name ?? '',
  username: authStore.user?.username ?? '',
  phone: authStore.user?.phone ?? '',
})

const isSaving = ref(false)

async function save() {
  isSaving.value = true
  try {
    const updated = await api.patch<Record<string, unknown>>('/profile', {
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      username: form.value.username || undefined,
      phone: form.value.phone || undefined,
    })
    if (authStore.user) {
      authStore.user = { ...authStore.user, ...updated }
    }
    toast.add({ title: 'Profile updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save profile', color: 'error' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div>
    <!-- Email (read-only) -->
    <div class="mb-8 p-4 rounded-lg border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
      <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest font-medium mb-1">Email</p>
      <p class="text-sm text-[var(--app-foreground)]">{{ authStore.userEmail }}</p>
    </div>

    <!-- Profile form -->
    <form class="flex flex-col gap-5" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-4">
        <FormField label="First Name" name="first_name">
          <Input v-model="form.first_name" placeholder="First name" />
        </FormField>
        <FormField label="Last Name" name="last_name">
          <Input v-model="form.last_name" placeholder="Last name" />
        </FormField>
      </div>

      <FormField label="Username" name="username">
        <Input v-model="form.username" placeholder="username" />
      </FormField>

      <FormField label="Phone" name="phone">
        <Input v-model="form.phone" type="tel" placeholder="+1 555 000 0000" />
      </FormField>

      <div class="pt-2">
        <Button type="submit" :loading="isSaving" label="Save Changes" />
      </div>
    </form>
  </div>
</template>
