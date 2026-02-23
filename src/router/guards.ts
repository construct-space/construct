import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'

// Track if we've verified the session this page load
let sessionVerified = false

export async function authGuard(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const authStore = useAuthStore()

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password']

  // Routes that should redirect if already logged in
  const guestOnlyRoutes = ['/login', '/register']

  // Onboarding route
  const onboardingRoute = '/onboarding'

  const isPublicRoute = publicRoutes.includes(to.path)
  const isGuestOnlyRoute = guestOnlyRoutes.includes(to.path)
  const isOnboardingRoute = to.path === onboardingRoute || to.path.startsWith('/onboarding')

  // If not authenticated yet, try to hydrate from storage
  if (!authStore.isAuthenticated) {
    await authStore.hydrateAuthState()
  }

  // Verify token once per page load (not on every navigation)
  if (authStore.isAuthenticated && authStore.token && !isPublicRoute && !sessionVerified) {
    try {
      const api = useApi()
      api.setToken(authStore.token)
      await api.get('/profile')
      sessionVerified = true
    } catch {
      // Token invalid or expired — clear auth and redirect to login
      sessionVerified = false
      await authStore.logout()
      return next('/login')
    }
  }

  // If user is not authenticated and trying to access protected route
  if (!authStore.isAuthenticated && !isPublicRoute) {
    return next('/login')
  }

  // If user is authenticated and trying to access guest-only routes
  if (authStore.isAuthenticated && isGuestOnlyRoute) {
    if (!authStore.user?.company_id) {
      return next('/onboarding')
    } else {
      return next('/app')
    }
  }

  // If user is authenticated but has no company and trying to access app routes
  if (authStore.isAuthenticated && !authStore.user?.company_id && !isOnboardingRoute && !isPublicRoute) {
    return next('/onboarding')
  }

  // If user is authenticated with company but trying to access onboarding
  if (authStore.isAuthenticated && authStore.user?.company_id && isOnboardingRoute) {
    return next('/app')
  }

  next()
}
