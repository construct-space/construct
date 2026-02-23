import type { RouteRecordRaw } from 'vue-router'
import { BUILTIN_SPACE_NAMES } from '~/spaces/builtin'

export const routes: RouteRecordRaw[] = [
  // Public routes
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/pages/RegisterPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/pages/ForgotPasswordPage.vue'),
    meta: { guest: true },
  },

  // Onboarding (first-time space picker)
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/pages/OnboardingPage.vue'),
    meta: { requiresAuth: true },
  },

  // App routes (authenticated)
  {
    path: '/app',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      // Home — recent projects
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
      },

      // All Spaces (Launchpad grid)
      {
        path: 'spaces',
        name: 'spaces',
        component: () => import('@/pages/SpacesPage.vue'),
      },

      // Marketplace
      {
        path: 'marketplace',
        name: 'marketplace',
        component: () => import('@/pages/MarketplacePage.vue'),
      },

      // ===== Spaces — top-level =====

      // Code space
      {
        path: 'code',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/code/pages/index.vue') },
          { path: 'editor', component: () => import('@/spaces/code/pages/editor.vue') },
          { path: 'responsive', component: () => import('@/spaces/code/pages/responsive.vue') },
          { path: 'terminal', component: () => import('@/spaces/terminal/pages/index.vue') },
          { path: 'git', component: () => import('@/spaces/git/pages/index.vue') },
        ],
      },

      // Design space
      {
        path: 'design',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/design/pages/index.vue') },
          { path: 'editor', component: () => import('@/spaces/design/pages/editor.vue') },
        ],
      },

      // Kanban space
      {
        path: 'kanban',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/kanban/pages/index.vue') },
        ],
      },

      // Docs space
      {
        path: 'docs',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/docs/pages/index.vue') },
        ],
      },

      // Notes space
      {
        path: 'notes',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/notes/pages/index.vue') },
        ],
      },

      // Architect space
      {
        path: 'architect',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/architect/pages/index.vue') },
        ],
      },

      // Terminal space
      {
        path: 'terminal',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/terminal/pages/index.vue') },
        ],
      },

      // Git space
      {
        path: 'git',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/git/pages/index.vue') },
        ],
      },

      // Calendar space
      {
        path: 'calendar',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          { path: '', component: () => import('@/spaces/calendar/pages/index.vue') },
        ],
      },

      // Settings
      {
        path: 'settings',
        component: () => import('@/pages/SettingsPage.vue'),
        children: [
          {
            path: '',
            component: () => import('@/pages/settings/GeneralSettings.vue'),
          },
          {
            path: 'profile',
            component: () => import('@/pages/settings/ProfileSettings.vue'),
          },
          {
            path: 'projects',
            component: () => import('@/pages/settings/ProjectsSettings.vue'),
          },
          {
            path: 'appearance',
            component: () => import('@/pages/settings/AppearanceSettings.vue'),
          },
          {
            path: 'design',
            component: () => import('@/pages/settings/DesignSettings.vue'),
          },
          {
            path: 'shortcuts',
            component: () => import('@/pages/settings/ShortcutsSettings.vue'),
          },
          {
            path: 'ai',
            component: () => import('@/pages/settings/AISettings.vue'),
          },
          {
            path: 'llms',
            component: () => import('@/pages/settings/LLMSettings.vue'),
          },
          {
            path: 'mcp',
            component: () => import('@/pages/settings/MCPSettings.vue'),
          },
          {
            path: 'skills',
            component: () => import('@/pages/settings/SkillsSettings.vue'),
          },
          {
            path: 'updates',
            component: () => import('@/pages/settings/UpdatesSettings.vue'),
          },
          {
            path: 'spaces',
            component: () => import('@/pages/settings/SpacesSettings.vue'),
          },
        ],
      },

      // Dynamic catch-all for marketplace-installed spaces
      {
        path: ':spaceName',
        component: () => import('@/spaces/_dynamic/DynamicSpacePage.vue'),
        props: true,
        beforeEnter: (to) => {
          // Reject if spaceName matches a built-in space (those have their own routes above)
          const name = to.params.spaceName as string
          if (BUILTIN_SPACE_NAMES.includes(name)) {
            return false
          }
        },
      },
    ],
  },

  // Catch-all
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
]
