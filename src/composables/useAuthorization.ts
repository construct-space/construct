/**
 * Authorization composable that provides permission checking functionality
 * Similar to the backend's can() method but for frontend components
 */

export const useAuthorization = () => {
  const authorizationStore = useAuthorizationStore()
  const authStore = useAuthStore()

  /**
   * Check if the current user has permission to perform an action
   * @param resourceType - The resource type (e.g., 'customers', 'orders', 'employees')
   * @param action - The action ('create', 'read', 'update', 'delete', 'list', etc.)
   * @param resourceId - Optional specific resource ID for resource-level permissions
   * @returns Promise<boolean>
   */
  const can = async (
    resourceType: string,
    action: string,
    resourceId?: string | number
  ): Promise<boolean> => {
    const numericId = typeof resourceId === 'string' ? parseInt(resourceId, 10) : resourceId
    return await authorizationStore.checkPermission(resourceType, action, numericId)
  }

  /**
   * Synchronous permission check using cached results
   * Use this for UI reactivity, but ensure permissions are preloaded
   * @param resourceType - The resource type
   * @param action - The action
   * @param resourceId - Optional specific resource ID
   * @returns boolean (cached result or false if not cached)
   */
  const canSync = (
    resourceType: string,
    action: string,
    resourceId?: string
  ): boolean => {
    if (!authStore.isAuthenticated || !authStore.user) {
      return false
    }

    // For resource-specific permissions, fall back to cache
    if (resourceId) {
      const cacheKey = `${authStore.user.id}-${resourceType}-${action}-${resourceId}`
      return authorizationStore.userPermissions.get(cacheKey) || false
    }

    // Use the new efficient hasPermission for general permissions
    return authorizationStore.hasPermission(`${resourceType}:${action}`)
  }

  /**
   * Fast permission check using preloaded permissions list
   * This is the preferred method for UI elements
   * @param resourceType - The resource type
   * @param action - The action
   * @returns boolean
   */
  const hasPermission = (resourceType: string, action: string): boolean => {
    if (!authStore.isAuthenticated || !authStore.user) {
      return false
    }

    return authorizationStore.hasPermission(`${resourceType}:${action}`)
  }

  /**
   * Check multiple permissions at once
   * @param checks - Array of permission checks
   * @returns Promise<Record<string, boolean>> - Results keyed by "resourceType:action"
   */
  const canMultiple = async (
    checks: Array<{ resourceType: string; action: string; resourceId?: string }>
  ): Promise<Record<string, boolean>> => {
    const results: Record<string, boolean> = {}
    
    await Promise.all(
      checks.map(async ({ resourceType, action, resourceId }) => {
        const key = `${resourceType}:${action}${resourceId ? `:${resourceId}` : ''}`
        results[key] = await can(resourceType, action, resourceId)
      })
    )

    return results
  }

  /**
   * Check if user has any of the specified permissions (OR logic)
   * @param checks - Array of permission checks
   * @returns Promise<boolean>
   */
  const canAny = async (
    checks: Array<{ resourceType: string; action: string; resourceId?: string }>
  ): Promise<boolean> => {
    const results = await Promise.all(
      checks.map(({ resourceType, action, resourceId }) =>
        can(resourceType, action, resourceId)
      )
    )

    return results.some(result => result === true)
  }

  /**
   * Check if user has all specified permissions (AND logic)
   * @param checks - Array of permission checks
   * @returns Promise<boolean>
   */
  const canAll = async (
    checks: Array<{ resourceType: string; action: string; resourceId?: string }>
  ): Promise<boolean> => {
    const results = await Promise.all(
      checks.map(({ resourceType, action, resourceId }) =>
        can(resourceType, action, resourceId)
      )
    )

    return results.every(result => result === true)
  }

  /**
   * Reactive computed that checks permission with caching
   * @param resourceType - The resource type
   * @param action - The action
   * @param resourceId - Optional specific resource ID
   * @returns Ref<boolean>
   */
  const useCanReactive = (
    resourceType: string,
    action: string,
    resourceId?: string
  ) => {
    return computed(() => canSync(resourceType, action, resourceId))
  }
 

  /**
   * Initialize permissions for the current user
   */
  const initialize = async () => {
    if (authStore.isAuthenticated) {
      await authorizationStore.initialize()
    }
  }

  /**
   * Clear permission cache (useful when user roles change)
   */
  const clearCache = () => {
    authorizationStore.clearPermissionCache()
  }

  /**
   * Create a reactive computed for permission checking
   * @param resourceType - The resource type
   * @param action - The action
   * @returns Ref<boolean>
   */
  const usePermissionReactive = (resourceType: string, action: string) => {
    return computed(() => hasPermission(resourceType, action))
  }

  return {
    // Core permission checking
    can,
    canSync,
    hasPermission, // New efficient method
    canMultiple,
    canAny,
    canAll,
    useCanReactive,
    usePermissionReactive, // New reactive method
    
    // Utility methods
    initialize,
    clearCache,
    
    // Store access
    authorizationStore,
    
    // Common getters
    roles: computed(() => authorizationStore.roles),
    roleOptions: computed(() => authorizationStore.roleOptions),
    isLoadingRoles: computed(() => authorizationStore.loading),
    isLoadingUserPermissions: computed(() => authorizationStore.loading),
  }
}