import { defineStore } from 'pinia'

interface Role {
  id: number
  name: string
  description?: string
}

interface Permission {
  id: number
  resource_type: string
  action: string
  description?: string
}

interface AuthorizationState {
  roles: Role[]
  permissions: Permission[]
  userPermissions: Map<string, boolean>
  userPermissionList: string[]
  loading: boolean
  error: string | null
}

export const useAuthorizationStore = defineStore('authorization', {
  state: (): AuthorizationState => ({
    roles: [],
    permissions: [],
    userPermissions: new Map(),
    userPermissionList: [],
    loading: false,
    error: null,
  }),

  getters: {
    roleOptions: (state) =>
      state.roles.map((role) => ({
        label: role.name,
        value: role.id,
      })),

    getRoleById: (state) => (id: number) =>
      state.roles.find((role) => role.id === id),

    getPermissionsByResource: (state) => (resourceType: string) =>
      state.permissions.filter((p) => p.resource_type === resourceType),

    isCached: (state) => (permission: string) =>
      state.userPermissions.has(permission),

    hasPermission: (state) => (permission: string) => {
      // Company owner has full access
      const authStore = (window as unknown as Record<string, Record<string, Record<string, Record<string, unknown>>>>).__pinia?.state?.value?.auth as Record<string, unknown> | undefined
      const user = authStore?.user as Record<string, unknown> | undefined
      if (authStore?.isCompanyOwner || user?.is_company_owner) {
        return true
      }
      return state.userPermissionList.includes(permission)
    },
  },

  actions: {
    async fetchRoles() {
      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        const response = await api.get<{ data: Role[] }>('/authorization/roles')
        if (response.data) {
          this.roles = response.data
        }
      } catch (error) {
        console.warn('Failed to fetch roles:', error)
      }
    },

    async fetchPermissions() {
      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        const response = await api.get<{ data: Permission[] }>('/permissions')
        if (response.data) {
          this.permissions = response.data
        }
      } catch (error) {
        console.warn('Failed to fetch permissions:', error)
      }
    },

    async fetchUserPermissions() {
      this.loading = true
      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()

        let lastError: unknown = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await api.get<{ permissions: string[] }>('/authorization/permissions')
            if (response.permissions) {
              this.userPermissionList = response.permissions
              this.userPermissions.clear()
              for (const perm of response.permissions) {
                this.userPermissions.set(perm, true)
              }
            }
            this.loading = false
            return
          } catch (error) {
            lastError = error
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
            }
          }
        }

        if (lastError) {
          console.warn('Failed to fetch user permissions after 3 attempts:', lastError)
        }
      } finally {
        this.loading = false
      }
    },

    async checkPermission(resourceType: string, action: string, _resourceId?: number): Promise<boolean> {
      const permKey = `${resourceType}:${action}`
      if (this.userPermissions.has(permKey)) {
        return this.userPermissions.get(permKey)!
      }
      return this.userPermissionList.includes(permKey)
    },

    clearPermissionCache() {
      this.userPermissions.clear()
      this.userPermissionList = []
    },

    async initialize() {
      await Promise.all([this.fetchRoles(), this.fetchUserPermissions()])
    },
  },
})
