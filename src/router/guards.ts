import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  console.log('[guard] to:', to.path, 'onboarding_complete:', localStorage.getItem('cp_onboarding_complete'))
  const authStore = useAuthStore()

  const guestOnlyRoutes = ['/login', '/register']
  const isGuestOnlyRoute = guestOnlyRoutes.includes(to.path)

  // Hydrate auth if not yet authenticated
  if (!authStore.isAuthenticated) {
    await authStore.hydrateAuthState()
  }

  // Login is disabled — redirect guest-only routes straight to /app
  if (isGuestOnlyRoute || to.path === '/') {
    return next('/app')
  }

  // Auto-skip onboarding if spaces are already installed on disk
  if (!localStorage.getItem('cp_onboarding_complete')) {
    try {
      const { exists } = await import('@tauri-apps/plugin-fs')
      const { homeDir } = await import('@tauri-apps/api/path')
      const home = await homeDir()
      const checkPath = `${home}/.construct/spaces/code/manifest.json`
      console.log('[guard] checking disk:', checkPath)
      if (await exists(checkPath)) {
        console.log('[guard] spaces found on disk, skipping onboarding')
        localStorage.setItem('cp_onboarding_complete', 'true')
        // If we're heading to onboarding, redirect to app instead
        if (to.path === '/onboarding') {
          return next('/app')
        }
      }
    } catch (err) {
      console.error('[guard] disk check failed:', err)
    }
  }

  // Onboarding check: if navigating to app + not yet onboarded → redirect
  if (
    to.path.startsWith('/app') &&
    !localStorage.getItem('cp_onboarding_complete')
  ) {
    return next('/onboarding')
  }

  next()
}
