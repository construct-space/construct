import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const authStore = useAuthStore()

  const guestOnlyRoutes = ['/login', '/register']
  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password']

  const isPublicRoute = publicRoutes.includes(to.path)
  const isGuestOnlyRoute = guestOnlyRoutes.includes(to.path)

  // Hydrate auth if not yet authenticated
  if (!authStore.isAuthenticated) {
    await authStore.hydrateAuthState()
  }

  // Not authenticated → redirect to login (unless public route)
  if (!authStore.isAuthenticated && !isPublicRoute) {
    return next('/login')
  }

  // Authenticated on guest-only route → redirect to app
  if (authStore.isAuthenticated && isGuestOnlyRoute) {
    return next('/app')
  }

  // Onboarding check: if authenticated + navigating to app + not yet onboarded → redirect
  if (
    authStore.isAuthenticated &&
    to.path.startsWith('/app') &&
    to.path !== '/onboarding' &&
    !localStorage.getItem('onboarding_complete')
  ) {
    return next('/onboarding')
  }

  next()
}
