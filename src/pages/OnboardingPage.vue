<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { Building2, Users, ArrowLeft } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const api = useApi()

const selectedOption = ref<'create' | 'join' | null>(null)
const isLoading = ref(false)
const error = ref('')

const createForm = reactive({ name: '', description: '' })
const joinForm = reactive({ invite_code: '' })

onMounted(async () => {
  if (authStore.user?.company_id) {
    router.push('/app')
    return
  }
  const inviteCode = route.query.invite_code as string
  if (inviteCode) {
    joinForm.invite_code = inviteCode.toUpperCase()
    selectedOption.value = 'join'
  }
})

const handleCreateCompany = async () => {
  error.value = ''
  isLoading.value = true
  try {
    const response = await api.post<{ id: number }>('/onboarding/create-company', createForm)
    if (authStore.user && response?.id) {
      authStore.user.company_id = response.id
      authStore.persistAuthState()
    }
    try {
      const { useAuthorizationStore } = await import('@/stores/authorization')
      const authorizationStore = useAuthorizationStore()
      await authorizationStore.initialize()
    } catch { /* ignore */ }
    router.push('/app')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create company'
  } finally {
    isLoading.value = false
  }
}

const handleJoinCompany = async () => {
  error.value = ''
  isLoading.value = true
  try {
    const response = await api.post<{ id: number }>('/onboarding/join-company', { invite_code: joinForm.invite_code.toUpperCase() })
    if (authStore.user && response?.id) {
      authStore.user.company_id = response.id
      authStore.persistAuthState()
    }
    try {
      const { useAuthorizationStore } = await import('@/stores/authorization')
      const authorizationStore = useAuthorizationStore()
      await authorizationStore.initialize()
    } catch { /* ignore */ }
    router.push('/app')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to join company. Please check your invite code.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-5xl">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div class="flex flex-col items-end justify-start gap-4 p-1 lg:sticky lg:top-12">
            <svg width="48" height="48" viewBox="0 0 533 533" fill="currentColor" class="text-app-accent">
              <path d="M266.5 410.156C230.912 410.156 199.106 402.203 171.081 386.297C143.056 370.39 121.036 348.519 105.022 320.684C89.0072 292.848 81 261.256 81 225.909C81 190.12 89.0072 158.308 105.022 130.472C121.036 102.636 143.056 80.7655 171.081 64.8593C199.106 48.9531 230.912 41 266.5 41C302.087 41 333.671 48.9531 361.252 64.8593C389.277 80.7655 411.297 102.636 427.311 130.472C443.326 158.308 451.555 190.12 452 225.909C452 261.256 443.77 292.848 427.311 320.684C411.297 348.519 389.277 370.39 361.252 386.297C333.671 402.203 302.087 410.156 266.5 410.156ZM266.5 363.763C292.301 363.763 315.433 357.798 335.896 345.868C356.359 333.939 372.373 317.591 383.939 296.824C395.505 276.058 401.288 252.42 401.288 225.909C401.288 199.399 395.505 175.761 383.939 154.994C372.373 133.786 356.359 117.217 335.896 105.287C315.433 93.3579 292.301 87.393 266.5 87.393C240.699 87.393 217.567 93.3579 197.104 105.287C176.641 117.217 160.405 133.786 148.394 154.994C136.828 175.761 131.045 199.399 131.045 225.909C131.045 252.42 136.828 276.058 148.394 296.824C160.405 317.591 176.641 333.939 197.104 345.868C217.567 357.798 240.699 363.763 266.5 363.763Z" />
              <path d="M378.22 451.578C393.077 451.578 405.121 460.85 405.121 472.289C405.121 483.727 393.077 493 378.22 493H160.945C146.089 493 134.044 483.727 134.044 472.289C134.044 460.85 146.089 451.578 160.945 451.578H378.22Z" />
            </svg>
            <p class="text-2xl text-right">
              <span class="text-gray-400">BASECODE:</span><span class="font-bold text-gray-900 dark:text-white">SETUP</span>
            </p>
            <p class="text-sm text-gray-500 text-right max-w-xs">Set up your workspace to start building with Construct.</p>
            <div class="flex items-center gap-2 text-sm text-gray-500 mt-4">
              <span class="uppercase tracking-wider">Step 2 of 2</span>
            </div>
          </div>

          <div class="space-y-8">
            <!-- Choice -->
            <div v-if="!selectedOption" class="space-y-6">
              <button class="group w-full text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-sm p-2 -ml-2 block" @click="selectedOption = 'create'">
                <div class="flex items-center gap-3">
                  <Building2 class="size-5 text-gray-400 group-hover:text-app-accent transition-colors" />
                  <h3 class="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-app-accent transition-colors">CREATE COMPANY</h3>
                </div>
                <p class="text-sm text-gray-500 mt-1 ml-8">Start fresh and invite your team.</p>
              </button>
              <button class="group w-full text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-sm p-2 -ml-2 block" @click="selectedOption = 'join'">
                <div class="flex items-center gap-3">
                  <Users class="size-5 text-gray-400 group-hover:text-app-accent transition-colors" />
                  <h3 class="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-app-accent transition-colors">JOIN COMPANY</h3>
                </div>
                <p class="text-sm text-gray-500 mt-1 ml-8">Use an invite code from your team.</p>
              </button>
            </div>

            <!-- Create Form -->
            <div v-else-if="selectedOption === 'create'" class="space-y-6">
              <button class="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-app-accent transition-colors" @click="selectedOption = null">
                <ArrowLeft class="size-4" />
                <span class="text-sm uppercase tracking-wider">Back</span>
              </button>
              <form class="space-y-5" @submit.prevent="handleCreateCompany">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Company Name</label>
                  <input v-model="createForm.name" type="text" placeholder="Acme Inc." required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Description <span class="text-gray-400 font-normal">(optional)</span></label>
                  <textarea v-model="createForm.description" placeholder="Tell us about your company..." rows="3" class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none resize-none" />
                </div>
                <div v-if="error" class="text-red-600 dark:text-red-400 text-sm">{{ error }}</div>
                <button type="submit" :disabled="isLoading" class="w-full py-3 rounded-md bg-app-accent text-app-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {{ isLoading ? 'CREATING...' : 'CREATE COMPANY' }}
                </button>
              </form>
            </div>

            <!-- Join Form -->
            <div v-else-if="selectedOption === 'join'" class="space-y-6">
              <button class="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-app-accent transition-colors" @click="selectedOption = null">
                <ArrowLeft class="size-4" />
                <span class="text-sm uppercase tracking-wider">Back</span>
              </button>
              <form class="space-y-5" @submit.prevent="handleJoinCompany">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Invite Code</label>
                  <input v-model="joinForm.invite_code" type="text" placeholder="ABCD1234" required class="w-full px-4 py-3 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--app-accent)] focus:outline-none uppercase" />
                  <p class="text-xs text-gray-500 mt-2">Enter the 8-character invite code provided by your team.</p>
                </div>
                <div v-if="error" class="text-red-600 dark:text-red-400 text-sm">{{ error }}</div>
                <button type="submit" :disabled="isLoading" class="w-full py-3 rounded-md bg-app-accent text-app-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {{ isLoading ? 'JOINING...' : 'JOIN COMPANY' }}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
