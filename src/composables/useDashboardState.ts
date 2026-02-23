export const useDashboardState = () => {
  // Reactive state for selected dashboard
  const selectedDashboard = useState<string>('selected_dashboard', () => '')

  // Check if user is admin (can switch dashboards)
  const isAdminRole = computed(() => {
    const authStore = useAuthStore()
    const authorizationStore = useAuthorizationStore()

    // Company owner has full access
    if (authStore.hasFullAccess) return true

    const roleId = authStore.roleId
    if (!roleId) return false

    const role = authorizationStore.getRoleById(roleId)
    const roleName = role?.name || 'Member'
    return roleName === 'Super Admin' || roleName === 'Admin'
  })

  // Get current user's role name
  const getCurrentRoleName = (): string => {
    const authStore = useAuthStore()
    const authorizationStore = useAuthorizationStore()
    const roleId = authStore.roleId
    if (!roleId) return 'Member'

    const role = authorizationStore.getRoleById(roleId)
    return role?.name || 'Member'
  }

  // Get current user's role object
  const getCurrentRole = () => {
    const authStore = useAuthStore()
    const authorizationStore = useAuthorizationStore()
    const roleId = authStore.roleId
    if (!roleId) return null

    return authorizationStore.getRoleById(roleId)
  }

  // Initialize dashboard selection
  const initializeDashboard = () => {
    if (import.meta.client) {
      const currentRole = getCurrentRoleName()

      if (isAdminRole.value) {
        // For admin users, load from localStorage or default to their role
        const saved = localStorage.getItem('selected_dashboard')
        selectedDashboard.value = saved || currentRole
      } else {
        // For non-admin users, always use their role
        selectedDashboard.value = currentRole
      }
    }
  }

  // Set selected dashboard (only for admin users)
  const setSelectedDashboard = (dashboardRole: string) => {
    if (isAdminRole.value && import.meta.client) {
      selectedDashboard.value = dashboardRole
      localStorage.setItem('selected_dashboard', dashboardRole)
    }
  }

  // Get dashboard title based on selected dashboard - generic for any role
  const getDashboardTitle = () => {
    const dashboardRole = selectedDashboard.value || getCurrentRoleName()
    return `${dashboardRole} Dashboard`
  }

  return {
    selectedDashboard: readonly(selectedDashboard),
    isAdminRole,
    getCurrentRoleName,
    getCurrentRole,
    initializeDashboard,
    setSelectedDashboard,
    getDashboardTitle
  }
}