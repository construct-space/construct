import { defineStore } from 'pinia'
import type { User, CreateUserRequest, UpdateUserRequest } from '~/types'

interface UsersState {
  users: User[]
  selectedUser: User | null
  isLoading: boolean
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
  error: string | null
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
  }
}

export const useUsersStore = defineStore('users', {
  state: (): UsersState => ({
    users: [],
    selectedUser: null,
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      itemsPerPage: 25
    }
  }),

  getters: {
    userById: (state) => (id: number) =>
      state.users.find((user: User) => user.id === id),

    usersByRole: (state) => (roleId: number) =>
      state.users.filter((user: User) => user.role_id === roleId),

    activeUsers: (state) =>
      state.users.filter((user: User) => !user.deleted_at),

    userCount: (state) => state.users.length,

    // Transform users for display
    usersWithDisplayName: (state) => state.users.map((user: User) => ({
      ...user,
      name: `${user.first_name} ${user.last_name}`.trim(),
      display_name: `${user.first_name} ${user.last_name}`.trim()
    }))
  },

  actions: {
    async fetchUsers(page = 1, limit = 25, search = '') {
      this.isLoading = true
      this.error = null

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          ...(search && { search })
        })

        const api = useApi()
        const response = await api.get<{
          data: User[]
          pagination?: {
            current_page: number
            total_pages: number
            total_items: number
            items_per_page: number
          }
        }>(`/users?${params}`)

        // Handle both paginated and non-paginated responses
        if (Array.isArray(response)) {
          this.users = response
        } else {
          this.users = response.data || []
          if (response.pagination) {
            this.pagination = {
              currentPage: response.pagination.current_page,
              totalPages: response.pagination.total_pages,
              totalItems: response.pagination.total_items,
              itemsPerPage: response.pagination.items_per_page
            }
          }
        }

        return this.users
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch users'
        console.error('Error fetching users:', error)
        return []
      } finally {
        this.isLoading = false
      }
    },

    async fetchUser(id: number) {
      this.isLoading = true
      this.error = null

      try {
        const api = useApi()
        const user = await api.get<User>(`/users/${id}`)
        this.selectedUser = user

        // Update user in the list if it exists
        const index = this.users.findIndex((user: User) => user.id === id)
        if (index !== -1) {
          this.users[index] = user
        }

        return user
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch user'
        console.error('Error fetching user:', error)
        return null
      } finally {
        this.isLoading = false
      }
    },

    async createUser(userData: CreateUserRequest) {
      this.isCreating = true
      this.error = null

      try {
        const api = useApi()
        const newUser = await api.post<User>('/users', userData)

        // Add to local state
        this.users.unshift(newUser)
        this.pagination.totalItems++

        return { success: true, data: newUser }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create user'
        console.error('Error creating user:', error)
        return { success: false, error: this.error }
      } finally {
        this.isCreating = false
      }
    },

    async updateUser(id: number, userData: UpdateUserRequest) {
      this.isUpdating = true
      this.error = null

      try {
        const api = useApi()
        const updatedUser = await api.put<User>(`/users/${id}`, userData)

        // Update in local state
        const index = this.users.findIndex((user: User) => user.id === id)
        if (index !== -1) {
          this.users[index] = updatedUser
        }

        if (this.selectedUser?.id === id) {
          this.selectedUser = updatedUser
        }

        return { success: true, data: updatedUser }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to update user'
        console.error('Error updating user:', error)
        return { success: false, error: this.error }
      } finally {
        this.isUpdating = false
      }
    },

    async deleteUser(id: number) {
      this.isDeleting = true
      this.error = null

      try {
        const api = useApi()
        await api.delete(`/users/${id}`)

        // Remove from local state
        this.users = this.users.filter((user: User) => user.id !== id)
        this.pagination.totalItems--

        if (this.selectedUser?.id === id) {
          this.selectedUser = null
        }

        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to delete user'
        console.error('Error deleting user:', error)
        return { success: false, error: this.error }
      } finally {
        this.isDeleting = false
      }
    },

    async changeUserPassword(id: number, newPassword: string, currentPassword: string) {
      this.isUpdating = true
      this.error = null

      try {
        const api = useApi()
        const result = await api.put(`/users/${id}/password`, {
          NewPassword: newPassword,
          CurrentPassword: currentPassword
        })

        return { success: true, data: result }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to change user password'
        console.error('Error changing user password:', error)
        return { success: false, error: this.error }
      } finally {
        this.isUpdating = false
      }
    },

    async searchUsers(query: string) {
      return await this.fetchUsers(1, this.pagination.itemsPerPage, query)
    },

    setSelectedUser(user: User | null) {
      this.selectedUser = user
    },

    clearError() {
      this.error = null
    },

    clearUsers() {
      this.users = []
      this.selectedUser = null
      this.pagination = {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage: 25
      }
    },

    // Refresh current page
    async refresh() {
      await this.fetchUsers(this.pagination.currentPage, this.pagination.itemsPerPage)
    }
  }
})