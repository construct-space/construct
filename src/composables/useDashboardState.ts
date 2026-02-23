/**
 * useDashboardState — simplified for personal local-first mode
 * Kept for backward compatibility but stripped of team/role concepts
 */
export const useDashboardState = () => {
  const selectedDashboard = useState<string>('selected_dashboard', () => 'personal')

  const isAdminRole = computed(() => true) // Always admin in personal mode

  const getCurrentRoleName = (): string => 'Owner'

  const getCurrentRole = () => null

  const initializeDashboard = () => {
    selectedDashboard.value = 'personal'
  }

  const setSelectedDashboard = (_dashboardRole: string) => {
    // No-op in personal mode
  }

  const getDashboardTitle = () => 'Dashboard'

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
