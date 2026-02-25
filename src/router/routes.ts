import type { RouteRecordRaw } from 'vue-router'

/**
 * Routes — fully dynamic space loading.
 *
 * There are NO hardcoded space routes. All spaces (code, design, architect, etc.)
 * are loaded at runtime via DynamicSpacePage + SpaceLoader.
 * This means spaces can be installed/uninstalled from the marketplace
 * without any code changes to the router.
 */

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
    path: '/oauth/callback',
    name: 'oauth-callback',
    component: () => import('@/pages/OAuthCallbackPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/forgot-password',
    redirect: '/login',
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

      // ===== Dynamic space routes =====
      // ALL spaces (including code, design, architect) go through DynamicSpacePage.
      // SpaceLoader handles dev (Vite import) vs prod (IIFE bundle) loading.

      // Space index page: /app/:spaceName
      {
        path: ':spaceName',
        component: () => import('@/layouts/SpaceLayout.vue'),
        children: [
          {
            path: '',
            component: () => import('@/spaces/DynamicSpacePage.vue'),
            props: (route) => ({
              spaceName: route.params.spaceName,
            }),
          },
          // Space sub-page: /app/:spaceName/:subPage
          {
            path: ':subPage',
            component: () => import('@/spaces/DynamicSpacePage.vue'),
            props: (route) => ({
              spaceName: route.params.spaceName,
              subPage: route.params.subPage,
            }),
          },
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
