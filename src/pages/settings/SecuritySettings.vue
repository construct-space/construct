<script setup lang="ts">
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const authStore = useAuthStore()
const toast = useToast()

const passwordForm = ref({
  current_password: '',
  new_password: '',
  confirm_password: '',
})

const isSaving = ref(false)
const passwordError = ref('')

async function changePassword() {
  passwordError.value = ''

  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    passwordError.value = 'Passwords do not match'
    return
  }

  if (passwordForm.value.new_password.length < 8) {
    passwordError.value = 'Password must be at least 8 characters'
    return
  }

  isSaving.value = true
  try {
    const api = useApi()
    await api.put('/profile/password', {
      current_password: passwordForm.value.current_password,
      new_password: passwordForm.value.new_password,
    })
    toast.add({ title: 'Password updated successfully', color: 'success' })
    passwordForm.value = { current_password: '', new_password: '', confirm_password: '' }
  } catch {
    toast.add({ title: 'Failed to update password', color: 'error' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div>

    <!-- Account info -->
    <div class="mb-8 p-4 rounded-lg border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-muted)_5%,transparent)]">
      <p class="text-sm font-medium text-[var(--app-foreground)]">{{ authStore.userEmail }}</p>
    </div>

    <!-- Change password -->
    <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-4">Change Password</h3>

    <form class="flex flex-col gap-5" @submit.prevent="changePassword">
      <FormField label="Current Password" name="current_password">
        <Input v-model="passwordForm.current_password" type="password" placeholder="Enter current password" />
      </FormField>

      <FormField label="New Password" name="new_password">
        <Input v-model="passwordForm.new_password" type="password" placeholder="Enter new password" />
      </FormField>

      <FormField label="Confirm New Password" name="confirm_password" :error="passwordError">
        <Input v-model="passwordForm.confirm_password" type="password" placeholder="Confirm new password" />
      </FormField>

      <div class="pt-2">
        <Button type="submit" :loading="isSaving" label="Update Password" />
      </div>
    </form>

    <!-- Danger zone -->
    <div class="mt-12 pt-6 border-t border-[var(--app-border)]">
      <p class="text-xs text-red-400 uppercase tracking-widest font-medium mb-3">Danger Zone</p>
      <p class="text-sm text-[var(--app-muted)] mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
      <Button variant="soft" color="error" label="Delete Account" />
    </div>
  </div>
</template>
