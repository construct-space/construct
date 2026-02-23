/**
 * Simplified permission composable for easy UI element visibility control
 * This provides a generic way to check permissions for hiding/disabling UI elements
 */

export const usePermissions = () => {
  const { hasPermission, usePermissionReactive } = useAuthorization()

  /**
   * Check if current user can perform an action on a resource
   * @param resource - Resource type (e.g., 'customer', 'order', 'plan')
   * @param action - Action type (e.g., 'create', 'read', 'update', 'delete', 'list')
   * @returns boolean
   */
  const can = (resource: string, action: string): boolean => {
    return hasPermission(resource, action)
  }

  /**
   * Reactive permission check for UI elements
   * @param resource - Resource type 
   * @param action - Action type
   * @returns ComputedRef<boolean>
   */
  const canReactive = (resource: string, action: string) => {
    return usePermissionReactive(resource, action)
  }

  /**
   * Check multiple permissions (OR logic) - user needs ANY of these permissions
   * @param permissions - Array of [resource, action] tuples
   * @returns boolean
   */
  const canAny = (permissions: [string, string][]): boolean => {
    return permissions.some(([resource, action]) => hasPermission(resource, action))
  }

  /**
   * Check multiple permissions (AND logic) - user needs ALL of these permissions
   * @param permissions - Array of [resource, action] tuples  
   * @returns boolean
   */
  const canAll = (permissions: [string, string][]): boolean => {
    return permissions.every(([resource, action]) => hasPermission(resource, action))
  }

  /**
   * Reactive version of canAny
   */
  const canAnyReactive = (permissions: [string, string][]) => {
    return computed(() => canAny(permissions))
  }

  /**
   * Reactive version of canAll
   */
  const canAllReactive = (permissions: [string, string][]) => {
    return computed(() => canAll(permissions))
  }

  // Common UI permission checks for easy use
  const ui = {
    // Navigation permissions
    canAccessCustomers: canReactive('customer', 'list'),
    canAccessOrders: canReactive('order', 'list'), 
    canAccessPlans: canReactive('plan', 'list'),
    canAccessEmployees: canReactive('user', 'list'),
    canAccessSettings: canReactive('settings', 'read'),
    canAccessReports: canReactive('report', 'list'),

    // Button permissions
    canCreateCustomer: canReactive('customer', 'create'),
    canCreateOrder: canReactive('order', 'create'),
    canCreatePlan: canReactive('plan', 'create'),
    canCreateEmployee: canReactive('user', 'create'),

    // Management permissions
    canManageRoles: canReactive('authorization', 'manage_role'),
    canManageUsers: canReactive('user', 'update'),
  }

  return {
    can,
    canReactive,
    canAny,
    canAll,
    canAnyReactive,
    canAllReactive,
    ui
  }
}