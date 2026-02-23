import { defineStore } from 'pinia'
import { db } from '~/utils/db'

export interface ProjectOwner {
  id: number
  first_name: string
  last_name: string
  email: string
}

export interface Project {
  id: number
  name: string
  description: string
  spaces: string[] // Array of enabled space names like ["code", "design", "git"]
  company_id?: number
  owner_id?: number
  owner?: ProjectOwner
  local_path?: string // Local filesystem path for project folder
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: number
  member_id: number
  resource_type: string
  resource_id: string
  access_type: string
  role_id: string
  created_at: string
  updated_at: string
}

export interface SpaceAccess {
  space: string
  access_type: string // 'read' | 'write' | 'admin'
}

export interface MemberSpaceAccess {
  member_id: number
  spaces: SpaceAccess[]
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    currentProject: null as Project | null,
    projects: [] as Project[],
    members: [] as ProjectMember[],
    mySpaces: [] as SpaceAccess[], // Spaces the current user has access to with access types
    membersSpaces: [] as MemberSpaceAccess[], // All members' space permissions
    loading: false,
    membersLoading: false,
    mySpacesLoading: false,
    membersSpacesLoading: false,
    error: null as string | null
  }),

  getters: {
    hasProject: (state) => !!state.currentProject,

    projectSpaces: (state) => {
      if (!state.currentProject || !state.currentProject.spaces) {
        return []
      }
      return Array.isArray(state.currentProject.spaces)
        ? state.currentProject.spaces
        : []
    },

    hasSpace: (state) => (spaceName: string) => {
      return state.currentProject?.spaces?.includes(spaceName) || false
    },

    // Check if user can access a specific space (considers both project spaces and user permissions)
    canAccessSpace: (state) => (spaceName: string) => {
      // First check if the space is enabled for the project
      const spaceEnabled = state.currentProject?.spaces?.includes(spaceName) || false
      if (!spaceEnabled) return false
      // Then check if user has permission to access this space
      return state.mySpaces.some(s => s.space === spaceName)
    },

    // Get user's access type for a specific space
    getSpaceAccessType: (state) => (spaceName: string): string | null => {
      const access = state.mySpaces.find(s => s.space === spaceName)
      return access?.access_type || null
    },

    // Get list of space names user can access (intersection of project spaces and user permissions)
    // Project owners get access to all project spaces
    accessibleSpaces: (state) => {
      const projectSpaces = state.currentProject?.spaces || []

      // Check if current user is the project owner - owners get all spaces
      const authStore = useAuthStore()
      if (state.currentProject?.owner_id === authStore.user?.id) {
        return projectSpaces
      }

      // For non-owners, filter by their granted space permissions
      const mySpaceNames = state.mySpaces.map(s => s.space)
      return projectSpaces.filter(space => mySpaceNames.includes(space))
    },

    // Get member's space access by member_id
    getMemberSpaces: (state) => (memberId: number): SpaceAccess[] => {
      const memberAccess = state.membersSpaces.find(m => m.member_id === memberId)
      return memberAccess?.spaces || []
    }
  },

  actions: {
    async createProject(data: { name: string; description?: string; spaces?: string[] }) {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const project = await api.post<Project>('/projects', {
          name: data.name,
          description: data.description || '',
          spaces: data.spaces || ['code', 'kanban']
        })
        this.projects.push(project)
        return { success: true, data: project }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create project'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async fetchProject(projectId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const data = await api.get<Project>(`/projects/${projectId}`)

        // Load local_path from IndexedDB (machine-specific, not from API)
        try {
          const localSettings = await db.project_settings.get(projectId)
          if (localSettings?.localPath) {
            data.local_path = localSettings.localPath
          }
        } catch (e) {
          console.warn('Failed to load local path from IndexedDB:', e)
        }

        this.currentProject = data
        return data
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch project'
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchProjects() {
      this.loading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<{ data: Project[] }>('/projects')

        this.projects = response.data || []
        return this.projects
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch projects'
        throw error
      } finally {
        this.loading = false
      }
    },

    setCurrentProject(project: Project | null) {
      this.currentProject = project
    },

    clearCurrentProject() {
      this.currentProject = null
    },

    async updateProject(projectId: number, data: Partial<Project>) {
      this.error = null

      try {
        const api = useApi()
        const updated = await api.put<Project>(`/projects/${projectId}`, data)
        this.currentProject = updated
        // Also update in projects list if present
        const index = this.projects.findIndex(p => p.id === projectId)
        if (index !== -1) {
          this.projects[index] = updated
        }
        return { success: true, data: updated }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to update project'
        return { success: false, error: this.error }
      }
    },

    async fetchMembers(projectId: number) {
      this.membersLoading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<{ data: ProjectMember[] }>(`/projects/${projectId}/members`)
        this.members = response.data || []
        return this.members
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch project members'
        throw error
      } finally {
        this.membersLoading = false
      }
    },

    async addMember(projectId: number, memberId: number, accessType: string = 'read') {
      this.error = null

      try {
        const api = useApi()
        const member = await api.post<ProjectMember>(`/projects/${projectId}/members`, {
          member_id: memberId,
          access_type: accessType
        })
        this.members.push(member)
        return { success: true, data: member }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to add project member'
        return { success: false, error: this.error }
      }
    },

    async removeMember(projectId: number, memberId: number) {
      this.error = null

      try {
        const api = useApi()
        await api.delete(`/projects/${projectId}/members/${memberId}`)
        this.members = this.members.filter(m => m.member_id !== memberId)
        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to remove project member'
        return { success: false, error: this.error }
      }
    },

    clearMembers() {
      this.members = []
    },

    async fetchMySpaces(projectId: number) {
      this.mySpacesLoading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<{ spaces: SpaceAccess[] }>(`/projects/${projectId}/my-spaces`)
        this.mySpaces = response.spaces || []
        return this.mySpaces
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch user spaces'
        // Default to empty array on error
        this.mySpaces = []
        throw error
      } finally {
        this.mySpacesLoading = false
      }
    },

    async fetchMembersSpaces(projectId: number) {
      this.membersSpacesLoading = true
      this.error = null

      try {
        const api = useApi()
        const response = await api.get<{ data: MemberSpaceAccess[] }>(`/projects/${projectId}/members-spaces`)
        this.membersSpaces = response.data || []
        return this.membersSpaces
      } catch (error) {
        this.error = (error as Error).message || 'Failed to fetch members spaces'
        this.membersSpaces = []
        throw error
      } finally {
        this.membersSpacesLoading = false
      }
    },

    async addMemberToSpace(projectId: number, memberId: number, spaceName: string, accessType: string = 'read') {
      this.error = null

      try {
        const api = useApi()
        await api.post(`/projects/${projectId}/members/${memberId}/spaces`, {
          space_name: spaceName,
          access_type: accessType
        })
        // Update local membersSpaces state
        const memberIndex = this.membersSpaces.findIndex(m => m.member_id === memberId)
        if (memberIndex !== -1) {
          const memberEntry = this.membersSpaces[memberIndex]
          if (memberEntry) {
            const existingSpaceIndex = memberEntry.spaces.findIndex(s => s.space === spaceName)
            if (existingSpaceIndex !== -1) {
              const existingSpace = memberEntry.spaces[existingSpaceIndex]
              if (existingSpace) {
                existingSpace.access_type = accessType
              }
            } else {
              memberEntry.spaces.push({ space: spaceName, access_type: accessType })
            }
          }
        } else {
          this.membersSpaces.push({ member_id: memberId, spaces: [{ space: spaceName, access_type: accessType }] })
        }
        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to add member to space'
        return { success: false, error: this.error }
      }
    },

    async removeMemberFromSpace(projectId: number, memberId: number, spaceName: string) {
      this.error = null

      try {
        const api = useApi()
        await api.delete(`/projects/${projectId}/members/${memberId}/spaces/${spaceName}`)
        // Update local membersSpaces state
        const memberIndex = this.membersSpaces.findIndex(m => m.member_id === memberId)
        if (memberIndex !== -1) {
          const memberEntry = this.membersSpaces[memberIndex]
          if (memberEntry) {
            memberEntry.spaces = memberEntry.spaces.filter(s => s.space !== spaceName)
          }
        }
        return { success: true }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to remove member from space'
        return { success: false, error: this.error }
      }
    },

    clearMySpaces() {
      this.mySpaces = []
    },

    clearMembersSpaces() {
      this.membersSpaces = []
    }
  }
})
