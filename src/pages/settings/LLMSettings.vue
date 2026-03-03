<script setup lang="ts">
import { useAnthropicOAuth } from '@/composables/useAnthropicOAuth'
import { useAIModel } from '@/composables/useAIModel'
import { useContextService } from '@/composables/useContextService'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const toast = useToast()
const route = useRoute()

// AI Model selection
const { modelsByProvider, defaultModelId, setDefaultModel, allModels, resolveModelId, isAutoModelId } = useAIModel()

const isAutoMode = computed(() => isAutoModelId(defaultModelId.value))

const currentModelLabel = computed(() => {
  const resolvedModel = resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto' })
  if (isAutoModelId(resolvedModel)) return 'Auto (Conductor)'
  const model = allModels.value.find(m => m.id === resolvedModel)
  return model ? `${model.providerLabel}: ${model.label}` : defaultModelId.value
})

// Anthropic OAuth
const anthropicOAuth = useAnthropicOAuth()
const authCode = ref('')
const showAuthCodeInput = ref(false)

// OpenAI OAuth
const contextService = useContextService()
const openAIAuthenticated = ref(false)
const openAIAuthLoading = ref(false)
const openAIAuthCode = ref('')
const showOpenAIAuthCodeInput = ref(false)

async function startAnthropicAuth() {
  try {
    const url = await anthropicOAuth.startAuth('max')
    showAuthCodeInput.value = true
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    } catch {
      window.open(url, '_blank')
    }
    toast.add({ title: 'Authentication started', description: 'Complete the login in your browser, then paste the code here.', color: 'info' })
  } catch {
    toast.add({ title: 'Failed to start authentication', color: 'error' })
  }
}

async function submitAuthCode() {
  if (!authCode.value) return
  try {
    const success = await anthropicOAuth.exchangeCode(authCode.value)
    if (success) {
      showAuthCodeInput.value = false
      authCode.value = ''
      toast.add({ title: 'Claude Max authentication successful', color: 'success' })
    } else {
      toast.add({ title: anthropicOAuth.error.value || 'Failed to authenticate', color: 'error' })
    }
  } catch {
    toast.add({ title: 'Authentication failed', color: 'error' })
  }
}

function logoutAnthropic() {
  anthropicOAuth.logout()
  toast.add({ title: 'Claude Max authentication cleared', color: 'info' })
}

async function checkOpenAIStatus() {
  if (!contextService.isTauri.value) return
  try {
    const result = await contextService.sendRequest('auth.openai.status', {}) as { authenticated?: boolean }
    openAIAuthenticated.value = !!result?.authenticated
  } catch {
    openAIAuthenticated.value = false
  }
}

async function startOpenAIAuth() {
  if (!contextService.isTauri.value) {
    toast.add({ title: 'OpenAI OAuth is only available in the desktop app', color: 'warning' })
    return
  }
  openAIAuthLoading.value = true
  try {
    const result = await contextService.sendRequest('auth.openai.start', {}) as { auth_url?: string; authenticated?: boolean; source?: string }
    if (result?.authenticated) {
      await checkOpenAIStatus()
      showOpenAIAuthCodeInput.value = false
      openAIAuthCode.value = ''
      toast.add({ title: 'OpenAI authentication successful', color: 'success' })
      return
    }
    const authUrl = result?.auth_url
    if (!authUrl) throw new Error('No auth URL returned')
    showOpenAIAuthCodeInput.value = true
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(authUrl)
    } catch {
      window.open(authUrl, '_blank')
    }
    toast.add({ title: 'Complete OpenAI login in your browser', color: 'info' })
  } catch {
    toast.add({ title: 'Failed to start OpenAI authentication', color: 'error' })
  } finally {
    openAIAuthLoading.value = false
  }
}

async function submitOpenAIAuthCode() {
  if (!openAIAuthCode.value) return
  openAIAuthLoading.value = true
  try {
    const result = await contextService.sendRequest('auth.openai.exchange', { code: openAIAuthCode.value.trim() }) as { authenticated?: boolean; success?: boolean; error?: string }
    if (result?.authenticated || result?.success) {
      showOpenAIAuthCodeInput.value = false
      openAIAuthCode.value = ''
      await checkOpenAIStatus()
      toast.add({ title: 'OpenAI authentication successful', color: 'success' })
      return
    }
    toast.add({ title: result?.error || 'Failed to authenticate with OpenAI', color: 'error' })
  } catch {
    toast.add({ title: 'OpenAI authentication failed', color: 'error' })
  } finally {
    openAIAuthLoading.value = false
  }
}

async function logoutOpenAI() {
  if (!contextService.isTauri.value) return
  openAIAuthLoading.value = true
  try {
    await contextService.sendRequest('auth.openai.clear', {})
    openAIAuthenticated.value = false
    showOpenAIAuthCodeInput.value = false
    openAIAuthCode.value = ''
    toast.add({ title: 'OpenAI authentication cleared', color: 'info' })
  } catch {
    toast.add({ title: 'Failed to disconnect OpenAI', color: 'error' })
  } finally {
    openAIAuthLoading.value = false
  }
}

onMounted(async () => {
  try {
    await anthropicOAuth.checkStatus()
    await checkOpenAIStatus()
    if (route.query.connect === 'oauth' && !anthropicOAuth.isAuthenticated.value) {
      await startAnthropicAuth()
    }
    if (route.query.connect === 'openai' && !openAIAuthenticated.value) {
      await startOpenAIAuth()
    }
  } catch {
    // silent
  }
})
</script>

<template>
  <div>
<!-- Model Selection -->
    <div class="mb-8">
      <h3 class="text-sm font-semibold text-[var(--app-foreground)] mb-3">Model Selection</h3>

      <div class="p-4 rounded-lg border border-[var(--app-border)]">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-[var(--app-muted)]">Current:</span>
          <span class="text-sm font-medium text-[var(--app-foreground)]">{{ currentModelLabel }}</span>
        </div>

        <!-- Auto/Conductor -->
        <button
          class="w-full p-3 rounded-lg border text-left transition-colors mb-3 cursor-pointer"
          :class="isAutoMode ? 'border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)]' : 'border-[var(--app-border)] hover:border-[var(--app-muted)]'"
          @click="setDefaultModel('auto')"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] flex items-center justify-center">
              <svg class="w-4 h-4 text-app-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /></svg>
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-[var(--app-foreground)]">Auto (Conductor)</p>
              <p class="text-xs text-[var(--app-muted)]">Smart routing selects the best model based on task complexity</p>
            </div>
            <svg v-if="isAutoMode" class="w-5 h-5 text-app-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
        </button>

        <!-- Provider/Model List -->
        <div class="space-y-3">
          <p class="text-xs text-[var(--app-muted)] uppercase tracking-wider">Or select specific model:</p>
          <div v-for="group in modelsByProvider" :key="group.provider.id" class="space-y-1">
            <p class="text-xs font-medium text-[var(--app-muted)]">{{ group.provider.label }}</p>
            <div class="grid grid-cols-2 gap-1">
              <button
                v-for="model in group.models"
                :key="model.compositeId"
                class="px-3 py-2 text-xs text-left rounded-lg border transition-colors cursor-pointer"
                :class="defaultModelId === model.compositeId
                  ? 'border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)] text-[var(--app-foreground)]'
                  : 'border-[var(--app-border)] text-[var(--app-muted)] hover:border-[var(--app-muted)] hover:text-[var(--app-foreground)]'"
                @click="setDefaultModel(model.compositeId)"
              >
                {{ model.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Routing info -->
      <div class="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <div class="flex gap-2">
          <svg class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <div class="text-xs text-[var(--app-muted)]">
            <p class="font-medium text-[var(--app-foreground)] mb-1">How Conductor works:</p>
            <ul class="space-y-1 list-disc list-inside">
              <li><strong>Simple queries</strong> &rarr; Budget models (DeepSeek)</li>
              <li><strong>Code tasks</strong> &rarr; Balanced models (Z.ai, Xiaomi)</li>
              <li><strong>Complex reasoning</strong> &rarr; Premium models (Claude, xAI)</li>
              <li><strong>Images</strong> &rarr; Vision-capable models</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Claude Max OAuth -->
    <div class="pt-6 border-t border-[var(--app-border)] mb-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold text-[var(--app-foreground)]">Claude Max Authentication</h3>
          <p class="text-xs text-[var(--app-muted)]">Authenticate with Claude Pro/Max for unlimited usage</p>
        </div>
        <span
          class="px-2 py-0.5 text-xs rounded-full"
          :class="anthropicOAuth.isAuthenticated.value ? 'bg-green-500/10 text-green-500' : 'bg-[color-mix(in_srgb,var(--app-muted)_15%,transparent)] text-[var(--app-muted)]'"
        >
          {{ anthropicOAuth.isAuthenticated.value ? 'Connected' : 'Not Connected' }}
        </span>
      </div>

      <!-- Connected state -->
      <div v-if="anthropicOAuth.isAuthenticated.value" class="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            <div>
              <p class="text-sm font-medium text-[var(--app-foreground)]">Claude Max Connected</p>
              <p class="text-xs text-[var(--app-muted)]">Your Claude Pro/Max subscription is active</p>
            </div>
          </div>
          <Button variant="ghost" color="error" size="sm" label="Disconnect" @click="logoutAnthropic" />
        </div>
      </div>

      <!-- Auth code input -->
      <div v-else-if="showAuthCodeInput" class="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
        <p class="text-sm font-medium text-blue-500">Enter Authorization Code</p>
        <p class="text-xs text-[var(--app-muted)]">Complete login in your browser and paste the authorization code below.</p>
        <div class="flex gap-2">
          <Input v-model="authCode" placeholder="Paste authorization code here..." :disabled="anthropicOAuth.isLoading.value" />
          <Button :loading="anthropicOAuth.isLoading.value" :disabled="!authCode" label="Submit" @click="submitAuthCode" />
          <Button variant="ghost" color="neutral" label="Cancel" @click="showAuthCodeInput = false; authCode = ''" />
        </div>
      </div>

      <!-- Login button -->
      <div v-else class="p-4 rounded-lg border border-[var(--app-border)]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-[var(--app-foreground)]">Connect your Claude Pro or Max subscription</p>
            <p class="text-xs text-[var(--app-muted)] mt-1">Unlimited Claude usage with your subscription</p>
          </div>
          <Button :loading="anthropicOAuth.isLoading.value" label="Connect Claude Max" @click="startAnthropicAuth" />
        </div>
      </div>
    </div>

    <!-- OpenAI OAuth -->
    <div class="pt-6 border-t border-[var(--app-border)]">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold text-[var(--app-foreground)]">OpenAI Authentication</h3>
          <p class="text-xs text-[var(--app-muted)]">Authenticate with OpenAI account OAuth for model access</p>
        </div>
        <span
          class="px-2 py-0.5 text-xs rounded-full"
          :class="openAIAuthenticated ? 'bg-green-500/10 text-green-500' : 'bg-[color-mix(in_srgb,var(--app-muted)_15%,transparent)] text-[var(--app-muted)]'"
        >
          {{ openAIAuthenticated ? 'Connected' : 'Not Connected' }}
        </span>
      </div>

      <!-- Connected -->
      <div v-if="openAIAuthenticated" class="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            <div>
              <p class="text-sm font-medium text-[var(--app-foreground)]">OpenAI Connected</p>
              <p class="text-xs text-[var(--app-muted)]">Your OpenAI OAuth session is active</p>
            </div>
          </div>
          <Button variant="ghost" color="error" size="sm" label="Disconnect" :loading="openAIAuthLoading" @click="logoutOpenAI" />
        </div>
      </div>

      <!-- Auth code input -->
      <div v-else-if="showOpenAIAuthCodeInput" class="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
        <p class="text-sm font-medium text-blue-500">Enter OpenAI Authorization Code</p>
        <p class="text-xs text-[var(--app-muted)]">Complete login in your browser and paste the returned authorization code below.</p>
        <div class="flex gap-2">
          <Input v-model="openAIAuthCode" placeholder="Paste OpenAI authorization code..." :disabled="openAIAuthLoading" />
          <Button :loading="openAIAuthLoading" :disabled="!openAIAuthCode" label="Submit" @click="submitOpenAIAuthCode" />
          <Button variant="ghost" color="neutral" label="Cancel" @click="showOpenAIAuthCodeInput = false; openAIAuthCode = ''" />
        </div>
      </div>

      <!-- Login button -->
      <div v-else class="p-4 rounded-lg border border-[var(--app-border)]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-[var(--app-foreground)]">Connect your OpenAI account via OAuth</p>
            <p class="text-xs text-[var(--app-muted)] mt-1">Required for OpenAI OAuth-backed models</p>
          </div>
          <Button :loading="openAIAuthLoading" label="Connect OpenAI" @click="startOpenAIAuth" />
        </div>
      </div>
    </div>
  </div>
</template>
