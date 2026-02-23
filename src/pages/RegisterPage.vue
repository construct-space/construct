<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { LogIn, ArrowRight } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const inviteCode = computed(() => (route.query.invite_code as string) || '')

const form = reactive({
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  password: '',
})

const confirmPassword = ref('')
const error = ref('')

const handleRegister = async () => {
  error.value = ''

  if (form.password !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  if (form.password.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  const result = await authStore.register(form)

  if (!result.success) {
    error.value = result.error || 'Registration failed'
  } else {
    const redirectPath = inviteCode.value
      ? `/onboarding?invite_code=${inviteCode.value}`
      : '/onboarding'
    router.push(redirectPath)
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-5xl">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <!-- LEFT COLUMN -->
          <div class="flex flex-col items-end justify-start gap-4 p-1 lg:sticky lg:top-12">
            <RouterLink to="/" class="flex items-center gap-3">
              <svg width="48" height="48" viewBox="0 0 533 533" fill="currentColor" class="text-[#34C759]">
                <path d="M266.5 410.156C230.912 410.156 199.106 402.203 171.081 386.297C143.056 370.39 121.036 348.519 105.022 320.684C89.0072 292.848 81 261.256 81 225.909C81 190.12 89.0072 158.308 105.022 130.472C121.036 102.636 143.056 80.7655 171.081 64.8593C199.106 48.9531 230.912 41 266.5 41C302.087 41 333.671 48.9531 361.252 64.8593C389.277 80.7655 411.297 102.636 427.311 130.472C443.326 158.308 451.555 190.12 452 225.909C452 261.256 443.77 292.848 427.311 320.684C411.297 348.519 389.277 370.39 361.252 386.297C333.671 402.203 302.087 410.156 266.5 410.156ZM266.5 363.763C292.301 363.763 315.433 357.798 335.896 345.868C356.359 333.939 372.373 317.591 383.939 296.824C395.505 276.058 401.288 252.42 401.288 225.909C401.288 199.399 395.505 175.761 383.939 154.994C372.373 133.786 356.359 117.217 335.896 105.287C315.433 93.3579 292.301 87.393 266.5 87.393C240.699 87.393 217.567 93.3579 197.104 105.287C176.641 117.217 160.405 133.786 148.394 154.994C136.828 175.761 131.045 199.399 131.045 225.909C131.045 252.42 136.828 276.058 148.394 296.824C160.405 317.591 176.641 333.939 197.104 345.868C217.567 357.798 240.699 363.763 266.5 363.763Z" />
                <path d="M378.22 451.578C393.077 451.578 405.121 460.85 405.121 472.289C405.121 483.727 393.077 493 378.22 493H160.945C146.089 493 134.044 483.727 134.044 472.289C134.044 460.85 146.089 451.578 160.945 451.578H378.22Z" />
              </svg>
            </RouterLink>
            <p class="text-2xl text-right">
              <span class="text-gray-400">BASECODE:</span><span class="font-bold text-gray-900 dark:text-white">REGISTER</span>
            </p>
            <p class="text-sm text-gray-500 text-right max-w-xs">
              Create your account and start building with Construct.
            </p>
            <div class="pt-6 border-t border-gray-200 dark:border-gray-800 space-y-3 mt-4 w-full">
              <RouterLink to="/login" class="flex items-center justify-end gap-2 text-gray-600 dark:text-gray-400 hover:text-app-accent transition-colors">
                <span class="text-sm uppercase tracking-wider">Sign In</span>
                <LogIn class="size-4" />
              </RouterLink>
              <RouterLink to="/" class="flex items-center justify-end gap-2 text-gray-600 dark:text-gray-400 hover:text-app-accent transition-colors">
                <span class="text-sm uppercase tracking-wider">Back to Home</span>
                <ArrowRight class="size-4" />
              </RouterLink>
            </div>
          </div>

          <!-- RIGHT COLUMN - Form -->
          <div class="space-y-6">
            <form class="space-y-5" @submit.prevent="handleRegister">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">First Name</label>
                  <input v-model="form.first_name" type="text" placeholder="John" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Last Name</label>
                  <input v-model="form.last_name" type="text" placeholder="Doe" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Username</label>
                <input v-model="form.username" type="text" placeholder="johndoe" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Email</label>
                  <input v-model="form.email" type="email" placeholder="john@example.com" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Phone <span class="text-gray-400 font-normal text-xs">(optional)</span></label>
                  <input v-model="form.phone" type="tel" placeholder="+1234567890" class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Password</label>
                  <input v-model="form.password" type="password" placeholder="Min. 8 characters" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Confirm</label>
                  <input v-model="confirmPassword" type="password" placeholder="Confirm password" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
              </div>
              <div v-if="error" class="text-red-600 dark:text-red-400 text-sm">{{ error }}</div>
              <button type="submit" :disabled="authStore.isLoading" class="w-full py-3 rounded-md bg-app-accent text-app-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {{ authStore.isLoading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
