import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import {
  Bell,
  Bot,
  Brush,
  CircleUser,
  Cpu,
  Download,
  FolderOpen,
  Keyboard,
  Puzzle,
  Server,
  Settings,
  Shield,
} from 'lucide-vue-next'

export const SETTINGS_DEFAULT_PATH = '/app/settings/general'

type SettingsGroup = 'Account' | 'Workspace' | 'AI' | 'System'

interface SettingsDefinition {
  label: string
  path: string
  group: SettingsGroup
  icon: Component
  component: () => Promise<unknown>
}

const settingsDefinitions: SettingsDefinition[] = [
  { label: 'Profile', path: 'profile', group: 'Account', icon: CircleUser, component: () => import('@/pages/settings/ProfileSettings.vue') },

  { label: 'General', path: 'general', group: 'Workspace', icon: Settings, component: () => import('@/pages/settings/GeneralSettings.vue') },
  { label: 'Projects', path: 'projects', group: 'Workspace', icon: FolderOpen, component: () => import('@/pages/settings/ProjectsSettings.vue') },
  { label: 'Appearance', path: 'appearance', group: 'Workspace', icon: Brush, component: () => import('@/pages/settings/AppearanceSettings.vue') },
  { label: 'Shortcuts', path: 'shortcuts', group: 'Workspace', icon: Keyboard, component: () => import('@/pages/settings/ShortcutsSettings.vue') },
  { label: 'Notifications', path: 'notifications', group: 'Workspace', icon: Bell, component: () => import('@/pages/settings/NotificationSettings.vue') },

  { label: 'AI Assistant', path: 'ai', group: 'AI', icon: Bot, component: () => import('@/pages/settings/AISettings.vue') },
  { label: 'LLMs & Models', path: 'llms', group: 'AI', icon: Cpu, component: () => import('@/pages/settings/LLMSettings.vue') },
  { label: 'MCP Servers', path: 'mcp', group: 'AI', icon: Server, component: () => import('@/pages/settings/MCPSettings.vue') },
  { label: 'Skills & Hooks', path: 'skills', group: 'AI', icon: Puzzle, component: () => import('@/pages/settings/SkillsSettings.vue') },

  { label: 'Privacy', path: 'privacy', group: 'System', icon: Shield, component: () => import('@/pages/settings/PrivacySettings.vue') },
  { label: 'Security', path: 'security', group: 'System', icon: Shield, component: () => import('@/pages/settings/SecuritySettings.vue') },
  { label: 'System', path: 'system', group: 'System', icon: Settings, component: () => import('@/pages/settings/SystemSettings.vue') },
  { label: 'Updates', path: 'updates', group: 'System', icon: Download, component: () => import('@/pages/settings/UpdatesSettings.vue') },
]

export interface SettingsNavItem {
  label: string
  path: string
  icon: Component
}

export interface SettingsNavGroup {
  label: SettingsGroup
  items: SettingsNavItem[]
}

const groupOrder: SettingsGroup[] = ['Account', 'Workspace', 'AI', 'System']

export const settingsNavGroups: SettingsNavGroup[] = groupOrder
  .map((group) => {
    const items = settingsDefinitions
      .filter(item => item.group === group)
      .map(item => ({
        label: item.label,
        path: `/app/settings/${item.path}`,
        icon: item.icon,
      }))

    return { label: group, items }
  })
  .filter(group => group.items.length > 0)

export const allSettingsNavItems = settingsNavGroups.flatMap(group => group.items)

export const settingsRouteChildren: RouteRecordRaw[] = settingsDefinitions.map(item => ({
  path: item.path,
  component: item.component,
}))
