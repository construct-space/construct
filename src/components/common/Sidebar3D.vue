<script setup lang="ts">
/**
 * Sidebar3D - 3-panel rotating sidebar with CSS 3D transforms
 *
 * Matches construct-mono sidebar design:
 * - 72px wide, dark bg
 * - Large rounded icon buttons (~48px) with generous spacing
 * - Active state: accent/10 bg with accent text
 * - Main panel: Dashboard, Architect, Calendar, Projects
 * - Bottom: Settings
 */

const router = useRouter()
const route = useRoute()
const { state, setPanel, exitSpace } = useSidebar()
const authStore = useAuthStore()

const showUserMenu = ref(false)

const userInitials = computed(() => {
  const u = authStore.user
  if (u?.first_name) return u.first_name.charAt(0).toUpperCase()
  if (u?.name) return u.name.charAt(0).toUpperCase()
  if (u?.email) return u.email.charAt(0).toUpperCase()
  return 'U'
})

async function logout() {
  showUserMenu.value = false
  await authStore.logout()
  router.push('/login')
}

function navigateTo(path: string) {
  showUserMenu.value = false
  router.push(path)
}

// Icon lookup for space names
const spaceIconMap: Record<string, string> = {
  code: 'i-lucide-code',
  design: 'i-lucide-pen-tool',
  kanban: 'i-lucide-kanban',
  docs: 'i-lucide-book-open',
  notes: 'i-lucide-file-text',
  chat: 'i-lucide-messages-square',
  architect: 'i-lucide-compass',
  ai: 'i-lucide-sparkles',
  terminal: 'i-lucide-terminal',
  git: 'i-lucide-git-branch',
}

// Main panel nav items — matches construct-mono
const mainNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-lucide-house', to: '/app' },
  { id: 'architect', label: 'Architect', icon: 'i-lucide-compass', to: '/app/architect' },
  { id: 'ai', label: 'AI', icon: 'i-lucide-sparkles', to: '/app/ai' },
  { id: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar', to: '/app/calendar' },
  { id: 'projects', label: 'Projects', icon: 'i-lucide-box', to: '/app/projects' },
]

// Active route detection
const activeId = computed(() => {
  const path = route.path
  if (path === '/app' || path === '/app/') return 'dashboard'
  if (path.startsWith('/app/projects')) return 'projects'
  if (path.startsWith('/app/architect')) return 'architect'
  if (path.startsWith('/app/ai')) return 'ai'
  if (path.startsWith('/app/calendar')) return 'calendar'
  if (path.startsWith('/app/settings')) return 'settings'
  const seg = path.replace('/app/', '').split('/')[0]
  return seg || 'dashboard'
})

// Current space (for project/space panels)
const currentSpace = computed(() => {
  const path = route.path.replace('/app/', '')
  if (path.startsWith('projects/')) {
    const parts = path.split('/')
    return parts[2] || ''
  }
  return path.split('/')[0] || ''
})

// Rotation angle
const rotationY = computed(() => {
  switch (state.panel) {
    case 'project': return -90
    case 'space': return -180
    default: return 0
  }
})

const goBackToMain = () => {
  setPanel('main')
  router.push('/app/projects')
}

const goBackToProject = () => {
  if (state.spaceBackRoute) {
    router.push(state.spaceBackRoute)
  }
  exitSpace()
}

const getSpaceIcon = (spaceName: string) => {
  return spaceIconMap[spaceName] || 'i-lucide-circle'
}
</script>

<template>
  <aside class="w-[72px] h-screen flex flex-col items-center shrink-0 z-50 bg-app border-r border-app">
    <!-- Logo (clear macOS traffic lights) -->
    <RouterLink to="/app" class="pt-9 pb-2 shrink-0">
      <svg width="32" height="32" viewBox="0 0 533 533" fill="currentColor" class="text-app-accent">
        <path d="M266.5 410.156C230.912 410.156 199.106 402.203 171.081 386.297C143.056 370.39 121.036 348.519 105.022 320.684C89.0072 292.848 81 261.256 81 225.909C81 190.12 89.0072 158.308 105.022 130.472C121.036 102.636 143.056 80.7655 171.081 64.8593C199.106 48.9531 230.912 41 266.5 41C302.087 41 333.671 48.9531 361.252 64.8593C389.277 80.7655 411.297 102.636 427.311 130.472C443.326 158.308 451.555 190.12 452 225.909C452 261.256 443.77 292.848 427.311 320.684C411.297 348.519 389.277 370.39 361.252 386.297C333.671 402.203 302.087 410.156 266.5 410.156ZM266.5 363.763C292.301 363.763 315.433 357.798 335.896 345.868C356.359 333.939 372.373 317.591 383.939 296.824C395.505 276.058 401.288 252.42 401.288 225.909C401.288 199.399 395.505 175.761 383.939 154.994C372.373 133.786 356.359 117.217 335.896 105.287C315.433 93.3579 292.301 87.393 266.5 87.393C240.699 87.393 217.567 93.3579 197.104 105.287C176.641 117.217 160.405 133.786 148.394 154.994C136.828 175.761 131.045 199.399 131.045 225.909C131.045 252.42 136.828 276.058 148.394 296.824C160.405 317.591 176.641 333.939 197.104 345.868C217.567 357.798 240.699 363.763 266.5 363.763Z" />
        <path d="M378.22 451.578C393.077 451.578 405.121 460.85 405.121 472.289C405.121 483.727 393.077 493 378.22 493H160.945C146.089 493 134.044 483.727 134.044 472.289C134.044 460.85 146.089 451.578 160.945 451.578H378.22Z" />
      </svg>
    </RouterLink>

    <!-- 3D Rotating Cube -->
    <div class="flex-1 w-full overflow-hidden py-1" style="perspective: 1000px">
      <div
        class="relative w-full h-full transition-transform duration-500 ease-out"
        :style="{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${rotationY}deg)`,
        }"
      >
        <!-- ====== Front Panel (main) ====== -->
        <div
          class="absolute inset-0 w-full h-full flex flex-col items-center gap-1 pt-2"
          style="backface-visibility: hidden; transform: translateZ(20px)"
        >
          <RouterLink
            v-for="item in mainNavItems"
            :key="item.id"
            :to="item.to"
            class="sidebar-btn"
            :class="activeId === item.id ? 'sidebar-btn-active' : 'sidebar-btn-inactive'"
            :title="item.label"
          >
            <Icon :name="item.icon" class="size-5" />
          </RouterLink>

          <div class="flex-1" />

          <RouterLink
            to="/app/settings"
            class="sidebar-btn mb-4"
            :class="activeId === 'settings' ? 'sidebar-btn-active' : 'sidebar-btn-inactive'"
            title="Settings"
          >
            <Icon name="i-lucide-settings" class="size-5" />
          </RouterLink>
        </div>

        <!-- ====== Right Panel (project) ====== -->
        <div
          class="absolute inset-0 w-full h-full flex flex-col items-center gap-1 pt-2"
          style="backface-visibility: hidden; transform: rotateY(90deg) translateZ(20px)"
        >
          <button
            class="sidebar-btn sidebar-btn-inactive"
            title="Back to Projects"
            @click="goBackToMain"
          >
            <Icon name="i-lucide-arrow-left" class="size-5" />
          </button>

          <div class="w-8 h-px bg-[var(--app-border)]" />

          <template v-for="item in state.projectItems" :key="item.to">
            <RouterLink
              :to="item.to"
              class="sidebar-btn"
              :class="currentSpace === item.spaceName ? 'sidebar-btn-active' : 'sidebar-btn-inactive'"
              :title="item.label"
            >
              <Icon :name="getSpaceIcon(item.spaceName || '')" class="size-5" />
            </RouterLink>
          </template>

          <div class="flex-1" />

          <template v-for="item in state.projectBottomItems" :key="item.to">
            <RouterLink
              :to="item.to"
              class="sidebar-btn sidebar-btn-inactive mb-4"
              :title="item.label"
            >
              <Icon :name="item.icon || 'i-lucide-settings'" class="size-5" />
            </RouterLink>
          </template>
        </div>

        <!-- ====== Back Panel (space) ====== -->
        <div
          class="absolute inset-0 w-full h-full flex flex-col items-center gap-1 pt-2"
          style="backface-visibility: hidden; transform: rotateY(180deg) translateZ(20px)"
        >
          <button
            class="sidebar-btn sidebar-btn-inactive"
            title="Back to Project"
            @click="goBackToProject"
          >
            <Icon name="i-lucide-arrow-left" class="size-5" />
          </button>

          <div
            v-if="state.activeSpace"
            class="sidebar-btn sidebar-btn-active"
          >
            <Icon :name="getSpaceIcon(state.activeSpace)" class="size-5" />
          </div>

          <div class="w-8 h-px bg-[var(--app-border)]" />

          <template v-for="item in state.activeSpaceItems" :key="item.route">
            <RouterLink
              :to="item.route"
              class="sidebar-btn"
              :class="route.path === item.route ? 'sidebar-btn-active' : 'sidebar-btn-inactive'"
              :title="item.label"
            >
              <Icon :name="item.icon || 'i-lucide-circle'" class="size-4" />
            </RouterLink>
          </template>

          <div class="flex-1" />
        </div>
      </div>
    </div>

    <!-- Avatar / user menu — always visible outside the 3D cube -->
    <div class="shrink-0 mb-4 relative flex justify-center">
      <button
        class="size-9 rounded-full flex items-center justify-center overflow-hidden ring-2 transition-all"
        :class="showUserMenu
          ? 'ring-[var(--app-accent)]'
          : 'ring-[var(--app-border)] hover:ring-[var(--app-muted)]'"
        :title="authStore.user?.name || authStore.userEmail"
        @click="showUserMenu = !showUserMenu"
      >
        <img
          v-if="authStore.userAvatar"
          :src="authStore.userAvatar"
          :alt="authStore.userName"
          class="w-full h-full object-cover"
        />
        <span v-else class="text-sm font-semibold text-[var(--app-foreground)]">
          {{ userInitials }}
        </span>
      </button>

      <!-- Dropdown — flies out to the right -->
      <Teleport to="body">
        <!-- Backdrop -->
        <div
          v-if="showUserMenu"
          class="fixed inset-0 z-[199]"
          @click="showUserMenu = false"
        />
        <!-- Menu -->
        <div
          v-if="showUserMenu"
          class="fixed z-[200] left-[80px] bottom-4 w-44 rounded-lg border border-[var(--app-border)] bg-[var(--app-background)] shadow-xl overflow-hidden"
        >
          <!-- User info header -->
          <div class="px-3 py-2.5 border-b border-[var(--app-border)]">
            <p class="text-xs font-medium text-[var(--app-foreground)] truncate">{{ authStore.userName }}</p>
            <p class="text-[10px] text-[var(--app-muted)] truncate">{{ authStore.userEmail }}</p>
          </div>

          <!-- Menu items -->
          <div class="py-1">
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--app-foreground)] hover:bg-[color-mix(in_srgb,var(--app-muted)_8%,transparent)] transition-colors text-left"
              @click="navigateTo('/app/settings/profile')"
            >
              <Icon name="i-lucide-circle-user" class="size-4 text-[var(--app-muted)] shrink-0" />
              Profile
            </button>
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--app-foreground)] hover:bg-[color-mix(in_srgb,var(--app-muted)_8%,transparent)] transition-colors text-left"
              @click="navigateTo('/app/settings')"
            >
              <Icon name="i-lucide-settings" class="size-4 text-[var(--app-muted)] shrink-0" />
              Settings
            </button>
          </div>

          <div class="border-t border-[var(--app-border)] py-1">
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors text-left"
              @click="logout"
            >
              <Icon name="i-lucide-log-out" class="size-4 shrink-0" />
              Log out
            </button>
          </div>
        </div>
      </Teleport>
    </div>

  </aside>
</template>

<style scoped>
.sidebar-btn {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sidebar-btn-active {
  background: color-mix(in srgb, var(--app-accent) 15%, transparent);
  color: var(--app-accent);
}

.sidebar-btn-inactive {
  color: var(--app-muted);
}

.sidebar-btn-inactive:hover {
  background: color-mix(in srgb, var(--app-foreground) 5%, transparent);
  color: var(--app-foreground);
}
</style>
