import type { RouteRecordRaw } from 'vue-router'
import { SETTINGS_DEFAULT_PATH, settingsRouteChildren } from './settingsNavigation'

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
    redirect: '/app',
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
            redirect: SETTINGS_DEFAULT_PATH,
          },
          ...settingsRouteChildren,
        ],
      },

      // ===== Project-scoped space routes =====
      // /app/projects/:projectId/:spaceName — space within a project
      // Must come BEFORE the :spaceName catch-all so Vue Router matches literal "projects" first.
      {
        path: 'projects/:projectId/:spaceName',
        component: () => import('@/layouts/SpaceLayout.vue'),
        meta: { projectScoped: true },
        children: [
          {
            path: '',
            component: () => import('@/spaces/DynamicSpacePage.vue'),
            props: (route) => ({
              spaceName: route.params.spaceName,
              projectId: route.params.projectId,
            }),
          },
          {
            path: ':subPage',
            component: () => import('@/spaces/DynamicSpacePage.vue'),
            props: (route) => ({
              spaceName: route.params.spaceName,
              subPage: route.params.subPage,
              projectId: route.params.projectId,
            }),
          },
        ],
      },

      // ===== Dynamic space routes (company-scoped) =====
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
    redirect: '/app',
  },
]
