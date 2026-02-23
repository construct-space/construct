<script setup lang="ts">
import {
  Building2, Globe, Shield, Mail, Bell, CreditCard,
  Palette, Image, Users, Bot, Cpu, Server, Puzzle,
  Coins, Download, Brush, Keyboard, CircleUser,
} from 'lucide-vue-next'

const route = useRoute()
const settingsStore = useSettingsStore()

const navGroups = [
  {
    label: 'Account',
    items: [
      { label: 'Profile', path: '/app/settings/profile', icon: CircleUser },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'Company',        path: '/app/settings',               icon: Building2 },
      { label: 'System',         path: '/app/settings/system',        icon: Globe },
      { label: 'Security',       path: '/app/settings/security',      icon: Shield },
      { label: 'Email',          path: '/app/settings/email',         icon: Mail },
      { label: 'Notifications',  path: '/app/settings/notifications', icon: Bell },
      { label: 'Billing',        path: '/app/settings/billing',       icon: CreditCard },
    ],
  },
  {
    label: 'Project',
    items: [
      { label: 'Design',         path: '/app/settings/design',        icon: Palette },
      { label: 'Media',          path: '/app/settings/media',         icon: Image },
      { label: 'Collaboration',  path: '/app/settings/collaboration', icon: Users },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'AI Assistant',   path: '/app/settings/ai',            icon: Bot },
      { label: 'LLMs & Models',  path: '/app/settings/llms',          icon: Cpu },
      { label: 'MCP Servers',    path: '/app/settings/mcp',           icon: Server },
      { label: 'Skills & Hooks', path: '/app/settings/skills',        icon: Puzzle },
      { label: 'Credits',        path: '/app/settings/credits',       icon: Coins },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Appearance',     path: '/app/settings/appearance',    icon: Brush },
      { label: 'Shortcuts',      path: '/app/settings/shortcuts',     icon: Keyboard },
      { label: 'Updates',        path: '/app/settings/updates',       icon: Download },
    ],
  },
]

const allItems = navGroups.flatMap(g => g.items)

const currentSection = computed(() =>
  allItems.find(item => route.path === item.path)?.label ?? ''
)

onMounted(() => {
  if (settingsStore.settings.length === 0) {
    settingsStore.fetchSettings()
  }
})
</script>

<template>
  <div class="h-full flex">

    <!-- LEFT COLUMN (1/3) — branding + nav -->
    <div class="w-1/3 shrink-0 flex flex-col items-start px-6 py-10 overflow-y-auto">

      <!-- Branding — same pattern as ProjectSettingsPage -->
      <p class="text-lg tracking-wide select-none mb-1">
        <span class="text-[var(--app-muted)] font-normal">CONSTRUCT:</span><span class="font-bold text-[var(--app-foreground)]">SETTINGS</span>
      </p>
      <p class="text-xs text-[var(--app-muted)] uppercase tracking-widest mb-10">
        {{ currentSection }}
      </p>

      <!-- Nav -->
      <nav class="w-full space-y-6">
        <div v-for="group in navGroups" :key="group.label">
          <p class="text-[10px] font-semibold tracking-widest text-[var(--app-muted)] uppercase mb-1.5 px-1">
            {{ group.label }}
          </p>
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors"
              :class="route.path === item.path
                ? 'text-app-accent bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]'
                : 'text-[var(--app-foreground)] hover:bg-[color-mix(in_srgb,var(--app-muted)_8%,transparent)]'"
            >
              <component
                :is="item.icon"
                class="w-4 h-4 shrink-0"
                :class="route.path === item.path ? 'text-app-accent' : 'text-[var(--app-muted)]'"
              />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>
    </div>

    <!-- RIGHT COLUMN (2/3) — page content -->
    <div class="w-2/3 flex-1 overflow-y-auto py-10 px-10">
      <RouterView />
    </div>

  </div>
</template>
