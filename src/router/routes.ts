import type { RouteRecordRaw } from 'vue-router'

// Space route definitions — reused for both company-level and project-scoped routes
const spaceRoutes: RouteRecordRaw[] = [
  // Code space
  {
    path: 'code',
    component: () => import('@/spaces/code/pages/index.vue'),
  },
  {
    path: 'code/editor',
    component: () => import('@/spaces/code/pages/editor.vue'),
  },
  {
    path: 'code/git',
    component: () => import('@/spaces/git/pages/index.vue'),
  },
  {
    path: 'code/terminal',
    component: () => import('@/spaces/terminal/pages/index.vue'),
  },
  {
    path: 'code/responsive',
    component: () => import('@/spaces/code/pages/responsive.vue'),
  },
  // Design space (PixiJS)
  {
    path: 'design',
    component: () => import('@/spaces/design/pages/index.vue'),
  },
  {
    path: 'design/editor',
    component: () => import('@/spaces/design/pages/editor.vue'),
  },
  // Kanban space
  {
    path: 'kanban',
    component: () => import('@/spaces/kanban/pages/index.vue'),
  },
  // Terminal space
  {
    path: 'terminal',
    component: () => import('@/spaces/terminal/pages/index.vue'),
  },
  // Calendar space
  {
    path: 'calendar',
    component: () => import('@/spaces/calendar/pages/index.vue'),
  },
  // Git space
  {
    path: 'git',
    component: () => import('@/spaces/git/pages/index.vue'),
  },
  // Docs space
  {
    path: 'docs',
    component: () => import('@/spaces/docs/pages/index.vue'),
  },
  // Notes space
  {
    path: 'notes',
    component: () => import('@/spaces/notes/pages/index.vue'),
  },
  // Chat space
  {
    path: 'chat',
    component: () => import('@/spaces/chat/pages/index.vue'),
  },
  // Architect space
  {
    path: 'architect',
    component: () => import('@/spaces/architect/pages/index.vue'),
  },
  // AI space
  {
    path: 'ai',
    component: () => import('@/spaces/ai/pages/index.vue'),
  },
]

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
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/pages/DashboardPage.vue'),
      },
      // Settings
      {
        path: 'settings',
        component: () => import('@/pages/SettingsPage.vue'),
        children: [
          {
            path: '',
            component: () => import('@/pages/settings/CompanySettings.vue'),
          },
          {
            path: 'profile',
            component: () => import('@/pages/settings/ProfileSettings.vue'),
          },
          {
            path: 'system',
            component: () => import('@/pages/settings/SystemSettings.vue'),
          },
          {
            path: 'security',
            component: () => import('@/pages/settings/SecuritySettings.vue'),
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
            path: 'media',
            component: () => import('@/pages/settings/MediaSettings.vue'),
          },
          {
            path: 'collaboration',
            component: () => import('@/pages/settings/CollaborationSettings.vue'),
          },
          {
            path: 'ai',
            component: () => import('@/pages/settings/AISettings.vue'),
          },
          {
            path: 'email',
            component: () => import('@/pages/settings/EmailSettings.vue'),
          },
          {
            path: 'notifications',
            component: () => import('@/pages/settings/NotificationSettings.vue'),
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
            path: 'billing',
            component: () => import('@/pages/settings/BillingSettings.vue'),
          },
          {
            path: 'credits',
            component: () => import('@/pages/settings/CreditsSettings.vue'),
          },
          {
            path: 'shortcuts',
            component: () => import('@/pages/settings/ShortcutsSettings.vue'),
          },
          {
            path: 'updates',
            component: () => import('@/pages/settings/UpdatesSettings.vue'),
          },
        ],
      },
      // Company-level spaces (no project context)
      ...spaceRoutes,
      // Projects list page
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/pages/ProjectsPage.vue'),
      },
      // Project-scoped pages — wrapped in ProjectLayout
      {
        path: 'projects/:id',
        component: () => import('@/layouts/ProjectLayout.vue'),
        children: [
          {
            path: '',
            name: 'project-detail',
            component: () => import('@/pages/ProjectDetailPage.vue'),
          },
          {
            path: 'settings',
            name: 'project-settings',
            component: () => import('@/pages/ProjectSettingsPage.vue'),
          },
          ...spaceRoutes,
        ],
      },
    ],
  },

  // Catch-all
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
]
