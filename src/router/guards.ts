import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const authStore = useAuthStore()

  const requiresAuth = to.matched.some(r => r.meta.requiresAuth)

  // OAuth callback must ALWAYS be accessible (deep link from browser)
  if (to.path === '/oauth/callback') {
    return next()
  }

  // Hydrate auth if not yet authenticated
  if (!authStore.isAuthenticated) {
    await authStore.hydrateAuthState()
  }

  // Authenticated user hitting guest-only routes → redirect to /app
  const guestOnlyRoutes = ['/login', '/register']
  if (authStore.isAuthenticated && guestOnlyRoutes.includes(to.path)) {
    return next('/app')
  }

  // Unauthenticated user hitting protected routes → redirect to /login
  if (!authStore.isAuthenticated && requiresAuth) {
    return next('/login')
  }

  // Root → redirect based on auth state
  if (to.path === '/') {
    return next(authStore.isAuthenticated ? '/app' : '/login')
  }

  // Auto-skip onboarding if spaces are already installed on disk
  if (authStore.isAuthenticated && !localStorage.getItem('cp_onboarding_complete')) {
    try {
      const { exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')
      const home = await homeDir()
      const checkPath = `${home}/.construct/spaces/code/manifest.json`
      if (await exists(checkPath)) {
        localStorage.setItem('cp_onboarding_complete', 'true')
        if (to.path === '/onboarding') {
          return next('/app')
        }
      }
    } catch {
      // Tauri APIs not available (web mode)
    }
  }

  // Onboarding check: authenticated + navigating to app + not yet onboarded → redirect
  if (
    authStore.isAuthenticated &&
    to.path.startsWith('/app') &&
    !localStorage.getItem('cp_onboarding_complete')
  ) {
    return next('/onboarding')
  }

  next()
}
