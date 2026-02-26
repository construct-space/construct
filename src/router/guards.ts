import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
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

  // Onboarding check: if navigating to app + not yet onboarded → redirect
  if (
    to.path.startsWith('/app') &&
    to.path !== '/onboarding' &&
    !localStorage.getItem('cp_onboarding_complete')
  ) {
    return next('/onboarding')
  }

  next()
}
