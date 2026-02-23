<script setup lang="ts">
/**
 * GitPublishModal - Modal for publishing a local repository to a remote
 * Detects auth methods (gh CLI, SSH, HTTPS) and guides the user through setup
 */
import { ref, computed, watch } from 'vue'
import { useGitRepo, type AuthMethods } from '../composables/useGitRepo'

const props = defineProps<{
  modelValue: boolean
  repoName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  published: [remoteUrl: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const gitRepo = useGitRepo()

// Auth detection state
const isDetecting = ref(false)
const authMethods = ref<AuthMethods | null>(null)

// Selected method
type PublishMethod = 'gh' | 'ssh' | 'https'
const selectedMethod = ref<PublishMethod | null>(null)

// Form fields
const ghRepoName = ref('')
const ghIsPrivate = ref(true)
const ghDescription = ref('')
const ghOwner = ref<string | null>(null) // null = personal account, string = org login
const remoteUrl = ref('')

// Publishing state
const isPublishing = ref(false)
const publishError = ref<string | null>(null)

// Detect auth methods when modal opens
watch(isOpen, async (open) => {
  if (open) {
    resetForm()
    ghRepoName.value = props.repoName || ''
    isDetecting.value = true
    try {
      authMethods.value = await gitRepo.detectAuthMethods()
      // Auto-select best method
      if (authMethods.value.gh) {
        selectedMethod.value = 'gh'
      } else if (authMethods.value.sshKeys.length > 0) {
        selectedMethod.value = 'ssh'
      } else {
        selectedMethod.value = 'https'
      }
    } finally {
      isDetecting.value = false
    }
  }
})

// Available methods based on detection
const availableMethods = computed(() => {
  const methods: { key: PublishMethod; label: string; icon: string; description: string; available: boolean }[] = []

  const auth = authMethods.value
  if (!auth) return methods

  methods.push({
    key: 'gh',
    label: 'GitHub CLI',
    icon: 'i-lucide-terminal',
    description: auth.gh
      ? `Authenticated as ${auth.ghUser || 'unknown'}`
      : 'Not authenticated — run `gh auth login`',
    available: auth.gh,
  })

  methods.push({
    key: 'ssh',
    label: 'SSH',
    icon: 'i-lucide-key',
    description: auth.sshKeys.length > 0
      ? `${auth.sshKeys.length} key${auth.sshKeys.length > 1 ? 's' : ''} found`
      : 'No SSH keys found',
    available: auth.sshKeys.length > 0,
  })

  methods.push({
    key: 'https',
    label: 'HTTPS',
    icon: 'i-lucide-globe',
    description: auth.gitCredentialHelper
      ? `Credential helper: ${auth.gitCredentialHelper}`
      : 'Manual URL entry',
    available: true,
  })

  return methods
})

// Owner options for GitHub CLI (personal + orgs)
const ownerOptions = computed(() => {
  const auth = authMethods.value
  if (!auth?.gh) return []

  const options: { value: string | null; label: string; icon: string }[] = []

  if (auth.ghUser) {
    options.push({
      value: null, // null = personal account (gh repo create uses current user)
      label: auth.ghUser,
      icon: 'i-lucide-user',
    })
  }

  for (const org of auth.ghOrgs) {
    options.push({
      value: org,
      label: org,
      icon: 'i-lucide-building-2',
    })
  }

  return options
})

// Full repo name for gh repo create (org/name or just name)
const ghFullRepoName = computed(() => {
  const name = ghRepoName.value.trim()
  if (!name) return ''
  return ghOwner.value ? `${ghOwner.value}/${name}` : name
})

const canPublish = computed(() => {
  if (!selectedMethod.value || isPublishing.value) return false
  if (selectedMethod.value === 'gh') return ghRepoName.value.trim().length > 0
  return remoteUrl.value.trim().length > 0
})

// Publish action
const handlePublish = async () => {
  publishError.value = null
  isPublishing.value = true

  try {
    if (selectedMethod.value === 'gh') {
      const result = await gitRepo.createGitHubRepo(
        ghFullRepoName.value,
        ghIsPrivate.value,
        ghDescription.value.trim() || undefined
      )
      if (result.success) {
        emit('published', result.remoteUrl || '')
        isOpen.value = false
      } else {
        publishError.value = result.error || 'Failed to create repository'
      }
    } else {
      // SSH or HTTPS — add remote and push
      const result = await gitRepo.addRemoteAndPush('origin', remoteUrl.value.trim())
      if (result.success) {
        emit('published', result.remoteUrl || remoteUrl.value.trim())
        isOpen.value = false
      } else {
        publishError.value = result.error || 'Failed to add remote'
      }
    }
  } finally {
    isPublishing.value = false
  }
}

const handleCancel = () => {
  isOpen.value = false
  resetForm()
}

const resetForm = () => {
  selectedMethod.value = null
  ghRepoName.value = ''
  ghIsPrivate.value = true
  ghDescription.value = ''
  ghOwner.value = null
  remoteUrl.value = ''
  publishError.value = null
  authMethods.value = null
}
</script>

<template>
  <Modal
    v-model:open="isOpen"
    :ui="{ content: 'sm:max-w-[560px]' }"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <Icon name="i-lucide-cloud-upload" class="size-5 text-app-accent" />
        <h2 class="text-lg font-medium text-app">Publish Repository</h2>
      </div>
    </template>

    <template #body>
      <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <!-- Loading state -->
        <div v-if="isDetecting" class="flex items-center justify-center py-8">
          <div class="flex items-center gap-3 text-app-muted">
            <Icon name="i-lucide-loader-2" class="size-5 animate-spin" />
            <span class="text-sm">Detecting authentication methods...</span>
          </div>
        </div>

        <!-- Method selection -->
        <template v-else-if="authMethods">
          <div class="space-y-2">
            <p class="text-xs font-medium text-app-muted uppercase">Authentication Method</p>
            <div class="space-y-1.5">
              <button
                v-for="method in availableMethods"
                :key="method.key"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left"
                :class="[
                  selectedMethod === method.key
                    ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/5'
                    : method.available
                      ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      : 'border-gray-200/50 dark:border-gray-700/30 opacity-50 cursor-not-allowed'
                ]"
                :disabled="!method.available"
                @click="method.available && (selectedMethod = method.key)"
              >
                <Icon :name="method.icon" class="size-4 shrink-0" :class="selectedMethod === method.key ? 'text-app-accent' : 'text-app-muted'" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-app">{{ method.label }}</span>
                    <span v-if="!method.available" class="text-xs text-red-400">unavailable</span>
                  </div>
                  <p class="text-xs text-app-muted truncate">{{ method.description }}</p>
                </div>
                <Icon
                  v-if="selectedMethod === method.key"
                  name="i-lucide-check"
                  class="size-4 text-app-accent shrink-0"
                />
              </button>
            </div>
          </div>

          <!-- GitHub CLI form -->
          <div v-if="selectedMethod === 'gh'" class="space-y-3 pt-2">
            <!-- Owner selector (personal + orgs) -->
            <FormField v-if="ownerOptions.length > 1" label="Owner">
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="option in ownerOptions"
                  :key="option.label"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors"
                  :class="ghOwner === option.value
                    ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/5 text-app'
                    : 'border-gray-200 dark:border-gray-700 text-app-muted hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="ghOwner = option.value"
                >
                  <Icon :name="option.icon" class="size-3.5" />
                  {{ option.label }}
                </button>
              </div>
            </FormField>

            <FormField label="Repository Name">
              <div class="flex items-center gap-0">
                <span v-if="ghOwner" class="text-sm text-app-muted px-2 py-1.5 bg-gray-100 dark:bg-gray-800 border border-r-0 border-gray-200 dark:border-gray-700 rounded-l-md whitespace-nowrap">
                  {{ ghOwner }} /
                </span>
                <Input
                  v-model="ghRepoName"
                  placeholder="my-project"
                  icon="i-lucide-folder-git-2"
                  :class="ghOwner ? '[&_input]:rounded-l-none' : ''"
                />
              </div>
            </FormField>

            <FormField label="Visibility">
              <div class="flex gap-2">
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors"
                  :class="ghIsPrivate
                    ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/5 text-app'
                    : 'border-gray-200 dark:border-gray-700 text-app-muted hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="ghIsPrivate = true"
                >
                  <Icon name="i-lucide-lock" class="size-3.5" />
                  Private
                </button>
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors"
                  :class="!ghIsPrivate
                    ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/5 text-app'
                    : 'border-gray-200 dark:border-gray-700 text-app-muted hover:border-gray-300 dark:hover:border-gray-600'"
                  @click="ghIsPrivate = false"
                >
                  <Icon name="i-lucide-globe" class="size-3.5" />
                  Public
                </button>
              </div>
            </FormField>

            <FormField label="Description (optional)">
              <Input
                v-model="ghDescription"
                placeholder="A short description of your repository"
                icon="i-lucide-text"
              />
            </FormField>
          </div>

          <!-- SSH / HTTPS form -->
          <div v-if="selectedMethod === 'ssh' || selectedMethod === 'https'" class="space-y-3 pt-2">
            <FormField :label="selectedMethod === 'ssh' ? 'SSH Remote URL' : 'HTTPS Remote URL'">
              <Input
                v-model="remoteUrl"
                :placeholder="selectedMethod === 'ssh'
                  ? 'git@github.com:user/repo.git'
                  : 'https://github.com/user/repo.git'"
                icon="i-lucide-link"
              />
            </FormField>

            <div v-if="selectedMethod === 'ssh' && authMethods?.sshKeys.length" class="space-y-1">
              <p class="text-xs text-app-muted">Detected SSH keys:</p>
              <div
                v-for="key in authMethods.sshKeys"
                :key="key"
                class="flex items-center gap-2 px-2 py-1 rounded bg-white/20 dark:bg-white/5"
              >
                <Icon name="i-lucide-key" class="size-3 text-green-500" />
                <code class="text-xs text-app-muted truncate">{{ key }}</code>
              </div>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="publishError" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
            <Icon name="i-lucide-alert-circle" class="size-4 text-red-500 shrink-0 mt-0.5" />
            <p class="text-xs text-red-600 dark:text-red-400">{{ publishError }}</p>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          label="Cancel"
          variant="ghost"
          @click="handleCancel"
        />
        <Button
          label="Publish"
          icon="i-lucide-cloud-upload"
          :disabled="!canPublish"
          :loading="isPublishing"
          @click="handlePublish"
        />
      </div>
    </template>
  </Modal>
</template>
