import { defineStore } from 'pinia'
import { appConfig } from '@/utils/config'
import type { AuthUserData, AuthResponse, LoginRequest, RegisterRequest } from '@/types'

interface AuthState {
  user: AuthUserData | null
  token: string | null
  roleId: number | null
  isCompanyOwner: boolean
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

const isContextNotConnectedError = (error: unknown): boolean =>
  String(error).toLowerCase().includes('not connected')

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    roleId: null,
    isCompanyOwner: false,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  }),

  getters: {
    currentUser: (state) => state.user,
    hasFullAccess: (state) => state.isCompanyOwner || state.user?.is_company_owner === true,
    userName: (state) => state.user?.name || 'User',
    userEmail: (state) => state.user?.email || '',
    userAvatar: (state) => state.user?.avatar || null,
  },

  actions: {
    async syncTokenToContextService(token?: string | null, user?: AuthUserData | null) {
      const syncToken = token || this.token
      const syncUser = user || this.user
      if (!syncToken || !syncUser) return

      try {
        const { useContextService } = await import('@/composables/useContextService')
        const contextService = useContextService()
        if (!contextService.isTauri.value) return

        const apiBaseUrl = appConfig.apiBase
        const baseUrl = apiBaseUrl.replace(/\/api$/, '')

        let lastError: unknown = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await contextService.connect()
            await contextService.sendRequest('auth.set_api_base', { baseUrl })
            await contextService.sendRequest('auth.sync_token', {
              token: syncToken,
              userId: String(syncUser.id || ''),
              userJson: JSON.stringify(syncUser),
            })
            return
          } catch (error) {
            lastError = error
            if (!isContextNotConnectedError(error) || attempt === 2) {
              break
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
          }
        }

        if (lastError && !isContextNotConnectedError(lastError)) {
          console.warn('Failed to sync token to context service:', lastError)
        }
      } catch {
        // Context service composable not available yet — safe to ignore
      }
    },

    async login(credentials: LoginRequest) {
      this.isLoading = true
      this.error = null

      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        const authData = await api.authPost<AuthResponse>('/auth/login', {
          email: credentials.email,
          password: credentials.password,
        })

        // Set the token
        this.token = authData.accessToken
        api.setToken(authData.accessToken)

        // Create user object from auth response
        const userData: AuthUserData = {
          id: authData.id,
          email: authData.email,
          username: authData.username,
          first_name: authData.first_name,
          last_name: authData.last_name,
          name: `${authData.first_name} ${authData.last_name}`.trim(),
          phone: authData.phone,
          company_id: authData.company_id,
          is_company_owner: authData.extend?.is_company_owner === true,
          avatar: authData.avatar_url,
          last_login: authData.last_login,
          created_at: '',
          updated_at: '',
        }

        this.user = userData
        this.roleId = authData.extend?.role?.id ?? null
        this.isCompanyOwner = authData.extend?.is_company_owner === true
        this.isAuthenticated = true

        // Persist to storage for hydration
        await this.persistAuthState()

        // Sync token and API base URL to context service
        await this.syncTokenToContextService(authData.accessToken, userData)

        // Initialize authorization permissions
        try {
          await new Promise((resolve) => setTimeout(resolve, 100))
          const { useAuthorizationStore } = await import('@/stores/authorization')
          const authorizationStore = useAuthorizationStore()
          await authorizationStore.initialize()
        } catch (error) {
          console.warn('Failed to initialize authorization after login:', error)
        }

        return { success: true as const, data: userData }
      } catch (error: unknown) {
        this.error = error instanceof Error ? error.message : 'Login failed'
        this.clearAuthState()
        return { success: false as const, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async register(userData: RegisterRequest) {
      this.isLoading = true
      this.error = null

      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        const authData = await api.authPost<AuthResponse>('/auth/register', {
          email: userData.email,
          password: userData.password,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
          username: userData.username,
        })

        this.token = authData.accessToken
        api.setToken(authData.accessToken)

        const userDataObj: AuthUserData = {
          id: authData.id,
          email: authData.email,
          username: authData.username,
          first_name: authData.first_name,
          last_name: authData.last_name,
          name: `${authData.first_name} ${authData.last_name}`.trim(),
          phone: authData.phone,
          company_id: authData.company_id,
          is_company_owner: authData.extend?.is_company_owner === true,
          avatar: authData.avatar_url,
          last_login: authData.last_login,
          created_at: '',
          updated_at: '',
        }

        this.user = userDataObj
        this.roleId = authData.extend?.role?.id ?? null
        this.isCompanyOwner = authData.extend?.is_company_owner === true
        this.isAuthenticated = true

        await this.persistAuthState()

        if (authData.company_id) {
          try {
            const { useAuthorizationStore } = await import('@/stores/authorization')
            const authorizationStore = useAuthorizationStore()
            await authorizationStore.initialize()
          } catch (error) {
            console.warn('Failed to initialize authorization after registration:', error)
          }
        }

        return { success: true as const, data: userDataObj }
      } catch (error: unknown) {
        this.error = error instanceof Error ? error.message : 'Registration failed'
        this.clearAuthState()
        return { success: false as const, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      this.isLoading = true

      const { useApi } = await import('@/composables/useApi')
      const api = useApi()
      api.removeToken()
      this.clearAuthState()
      this.clearPersistedState()

      try {
        await api.request('/auth/logout', { method: 'POST', skipErrorHandling: true })
      } catch {
        // Ignore — we already cleared local state
      }

      try {
        const { useAuthorizationStore } = await import('@/stores/authorization')
        const authorizationStore = useAuthorizationStore()
        authorizationStore.clearPermissionCache()
      } catch {
        // Ignore
      }

      this.isLoading = false
    },

    async forgotPassword(email: string) {
      this.isLoading = true
      this.error = null

      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        await api.authPost('/auth/forgot-password', { email })
        return { success: true as const }
      } catch (error: unknown) {
        this.error = error instanceof Error ? error.message : 'Failed to send reset email'
        return { success: false as const, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async resetPassword(resetToken: string, password: string) {
      this.isLoading = true
      this.error = null

      try {
        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        await api.authPost('/auth/reset-password', { token: resetToken, password })
        return { success: true as const }
      } catch (error: unknown) {
        this.error = error instanceof Error ? error.message : 'Password reset failed'
        return { success: false as const, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async checkAuth() {
      if (!this.token) {
        this.hydrateAuthState()
      }

      if (!this.token) {
        return false
      }

      try {
        if (!this.user || !this.token) {
          this.clearAuthState()
          this.clearPersistedState()
          return false
        }

        const { useApi } = await import('@/composables/useApi')
        const api = useApi()
        api.setToken(this.token)

        await api.get('/profile')
        this.isAuthenticated = true
        return true
      } catch (error: unknown) {
        console.error('Auth check failed:', error)
        this.clearAuthState()
        this.clearPersistedState()
        return false
      }
    },

    clearAuthState() {
      this.user = null
      this.token = null
      this.roleId = null
      this.isCompanyOwner = false
      this.isAuthenticated = false
      this.error = null

      import('@/stores/authorization').then(({ useAuthorizationStore }) => {
        try {
          const authorizationStore = useAuthorizationStore()
          authorizationStore.clearPermissionCache()
        } catch {
          // Authorization store may not be initialized yet
        }
      }).catch(() => {})
    },

    async persistAuthState() {
      if (typeof window === 'undefined') return

      const authState = {
        user: this.user,
        token: this.token,
        roleId: this.roleId,
        isCompanyOwner: this.isCompanyOwner,
        isAuthenticated: this.isAuthenticated,
      }

      const stateJson = JSON.stringify(authState)
      localStorage.setItem('construct_auth', stateJson)

      // Also try SQLite for Tauri
      try {
        const { useContextDB } = await import('@/composables/useContextDB')
        const db = useContextDB()
        if (db.isTauri.value) {
          await db.settingSet('auth_state', stateJson)
        }
      } catch {
        // Context DB may not be available yet
      }
    },

    _applyAuthState(authState: {
      user: AuthUserData | null
      token: string | null
      roleId: number | null
      isCompanyOwner: boolean
      isAuthenticated: boolean
    }) {
      this.user = authState.user
      this.token = authState.token
      this.roleId = authState.roleId
      this.isCompanyOwner = authState.isCompanyOwner || authState.user?.is_company_owner === true
      this.isAuthenticated = authState.isAuthenticated

      if (this.token) {
        import('@/composables/useApi').then(({ useApi }) => {
          const api = useApi()
          api.setToken(this.token!)
        })
      }
    },

    async hydrateAuthState() {
      if (typeof window === 'undefined') return

      try {
        // Phase 1 (SYNC): Read from localStorage — instant
        const stored = localStorage.getItem('construct_auth')

        if (stored) {
          const authState = JSON.parse(stored)
          this._applyAuthState(authState)
        } else {
          // Check for legacy token
          const legacyToken = localStorage.getItem('auth_token')
          if (legacyToken) {
            this.token = legacyToken
            const { useApi } = await import('@/composables/useApi')
            const api = useApi()
            api.setToken(legacyToken)

            try {
              const profile = await api.get<{
                id: number
                email: string
                username: string
                first_name: string
                last_name: string
                phone?: string
                company_id?: number
                avatar_url?: string
              }>('/profile')

              if (profile) {
                this.user = {
                  id: profile.id,
                  email: profile.email,
                  username: profile.username,
                  first_name: profile.first_name,
                  last_name: profile.last_name,
                  name: `${profile.first_name} ${profile.last_name}`.trim(),
                  phone: profile.phone,
                  company_id: profile.company_id,
                  is_company_owner: false,
                  avatar: profile.avatar_url,
                  created_at: '',
                  updated_at: '',
                }
                this.isAuthenticated = true
                await this.persistAuthState()
              }
            } catch {
              this.token = null
              api.removeToken()
            }
          }
        }

        // Phase 2 (BACKGROUND): Sync with context service (Tauri only)
        try {
          const { isTauriEnv } = await import('@/utils/tauri')
          if (isTauriEnv()) {
            this._backgroundContextSync().catch((error) => {
              console.warn('Background context sync failed:', error)
            })
          }
        } catch {
          // Tauri utils not available
        }
      } catch (error) {
        console.warn('Failed to hydrate auth state:', error)
        await this.clearPersistedState()
      }
    },

    async _backgroundContextSync() {
      try {
        const { useContextDB } = await import('@/composables/useContextDB')
        const db = useContextDB()
        const sqliteState = await db.settingGet('auth_state')

        if (sqliteState) {
          const authState = JSON.parse(sqliteState)
          if (authState.token) {
            this._applyAuthState(authState)
            localStorage.setItem('construct_auth', sqliteState)
          }
        }
      } catch (error) {
        console.warn('Background SQLite auth read failed:', error)
      }

      if (this.token && this.user) {
        await this.syncTokenToContextService(this.token, this.user)
      }
    },

    async clearPersistedState() {
      if (typeof window === 'undefined') return

      localStorage.removeItem('construct_auth')
      localStorage.removeItem('auth_token')

      try {
        const { useContextDB } = await import('@/composables/useContextDB')
        const db = useContextDB()
        if (db.isTauri.value) {
          await db.settingSet('auth_state', '')
        }
      } catch {
        // Safe to ignore
      }
    },

    async initialize() {
      await this.hydrateAuthState()

      if (this.token && this.user) {
        await this.checkAuth()

        if (this.isAuthenticated) {
          this.syncTokenToContextService(this.token, this.user).catch((err) =>
            console.warn('Background syncTokenToContextService failed:', err)
          )

          try {
            const { useAuthorizationStore } = await import('@/stores/authorization')
            const authorizationStore = useAuthorizationStore()
            await authorizationStore.initialize()
          } catch (error) {
            console.warn('Failed to initialize authorization store:', error)
          }
        }
      }
    },
  },
})
