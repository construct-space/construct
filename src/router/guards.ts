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

  // Per-user onboarding key (so switching accounts triggers onboarding again)
  const userId = authStore.user?.id || authStore.user?.email || 'unknown'
  const onboardingKey = `cp_onboarding_complete:${userId}`

  // Onboarding check: authenticated + navigating to app + not yet onboarded → redirect
  if (
    authStore.isAuthenticated &&
    to.path.startsWith('/app') &&
    !localStorage.getItem(onboardingKey)
  ) {
    return next('/onboarding')
  }

  // If on onboarding page but already completed, redirect to app
  if (
    authStore.isAuthenticated &&
    to.path === '/onboarding' &&
    localStorage.getItem(onboardingKey)
  ) {
    return next('/app')
  }

  next()
}
