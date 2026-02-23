import { defineStore } from 'pinia'
import type { LocalProject, SpaceType } from '@/types/project'

// Backward-compatible alias — old code imports `Project` from this store
export type Project = LocalProject

const STORAGE_KEY_RECENTS = 'construct_recent_projects'
const STORAGE_KEY_EXTERNALS = 'construct_external_paths'
const STORAGE_KEY_ROOT = 'construct_projects_root'
const MAX_RECENTS = 20

// All spaces available to every project by default
const DEFAULT_SPACES: SpaceType[] = [
  'code', 'design', 'kanban', 'docs', 'notes', 'chat',
  'architect', 'ai', 'git', 'terminal', 'calendar'
]

export const useProjectStore = defineStore('project', {
  state: () => ({
    currentProject: null as LocalProject | null,
    projects: [] as LocalProject[],
    recentProjects: [] as LocalProject[],
    externalPaths: [] as string[],
    projectsRoot: '' as string,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    hasProject: (state) => !!state.currentProject,

    projectSpaces: (state) => {
      return state.currentProject?.spaces || DEFAULT_SPACES
    },

    hasSpace: () => (_spaceName: string) => {
      // All spaces are always available in personal mode
      return true
    },
  },

  actions: {
    async initialize() {
      // Load persisted state from localStorage
      this.projectsRoot = localStorage.getItem(STORAGE_KEY_ROOT) || ''
      this.externalPaths = JSON.parse(localStorage.getItem(STORAGE_KEY_EXTERNALS) || '[]')
      this.recentProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENTS) || '[]')

      // Scan filesystem for projects if root is set
      if (this.projectsRoot) {
        await this.loadProjects()
      }
    },

    async loadProjects() {
      if (!this.projectsRoot) return

      this.loading = true
      this.error = null

      try {
        const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
        const projectDir = useProjectDirectory()

        // List projects from root directory
        const entries = await projectDir.listProjects()

        const projects: LocalProject[] = []

        for (const entry of entries) {
          // Check if it's a valid construct project
          const isConstruct = await projectDir.isConstructProject(entry.path)

          if (isConstruct) {
            const config = await projectDir.loadProjectConfig(entry.path)
            projects.push({
              id: entry.name,
              name: config?.name || entry.name,
              path: entry.path,
              description: config?.description,
              spaces: (config?.spaces as SpaceType[]) || DEFAULT_SPACES,
              last_opened_at: this.getRecentTimestamp(entry.path),
              is_external: false,
              created_at: config?.created || new Date().toISOString(),
              updated_at: config?.updated || new Date().toISOString(),
            })
          } else {
            // Non-construct directories still show as projects
            projects.push({
              id: entry.name,
              name: entry.name,
              path: entry.path,
              spaces: DEFAULT_SPACES,
              last_opened_at: this.getRecentTimestamp(entry.path),
              is_external: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }
        }

        // Add external projects
        for (const extPath of this.externalPaths) {
          const name = extPath.split('/').pop() || extPath
          const existing = projects.find(p => p.path === extPath)
          if (!existing) {
            const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
            const projectDir = useProjectDirectory()
            const config = await projectDir.loadProjectConfig(extPath).catch(() => null)
            projects.push({
              id: `ext-${name}`,
              name: config?.name || name,
              path: extPath,
              description: config?.description,
              spaces: (config?.spaces as SpaceType[]) || DEFAULT_SPACES,
              last_opened_at: this.getRecentTimestamp(extPath),
              is_external: true,
              created_at: config?.created || new Date().toISOString(),
              updated_at: config?.updated || new Date().toISOString(),
            })
          }
        }

        // Set local_path alias for backward compat
        for (const p of projects) {
          p.local_path = p.path
        }
        this.projects = projects
      } catch (error) {
        this.error = (error as Error).message || 'Failed to load projects'
        console.warn('Failed to load projects:', error)
      } finally {
        this.loading = false
      }
    },

    async createProject(data: { name: string; description?: string; spaces?: SpaceType[] }) {
      this.loading = true
      this.error = null

      try {
        const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
        const projectDir = useProjectDirectory()

        // Ensure projects root exists
        if (!this.projectsRoot) {
          const root = await projectDir.getProjectsRoot()
          if (root) {
            this.projectsRoot = root
            localStorage.setItem(STORAGE_KEY_ROOT, root)
          } else {
            throw new Error('No projects root directory set')
          }
        }

        const spaces = data.spaces || DEFAULT_SPACES
        const createdPath = await projectDir.createProjectStructure(data.name, this.projectsRoot, spaces)

        if (!createdPath) {
          throw new Error('Failed to create project structure')
        }

        const project: LocalProject = {
          id: data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          name: data.name,
          path: createdPath,
          local_path: createdPath,
          description: data.description,
          spaces,
          last_opened_at: new Date().toISOString(),
          is_external: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        this.projects.push(project)
        this.trackRecentOpen(project)

        return { success: true as const, data: project }
      } catch (error) {
        this.error = (error as Error).message || 'Failed to create project'
        return { success: false as const, error: this.error }
      } finally {
        this.loading = false
      }
    },

    openProject(path: string) {
      const project = this.projects.find(p => p.path === path)
      if (project) {
        this.currentProject = project
        this.trackRecentOpen(project)
        return project
      }

      // Project not in list — create a minimal entry
      const name = path.split('/').pop() || path
      const newProject: LocalProject = {
        id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name,
        path,
        local_path: path,
        spaces: DEFAULT_SPACES,
        last_opened_at: new Date().toISOString(),
        is_external: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      this.projects.push(newProject)
      this.currentProject = newProject
      this.trackRecentOpen(newProject)
      return newProject
    },

    async updateProject(_projectId: string | number, data: Partial<{ name: string; description: string; spaces: string[]; local_path: string }>) {
      // Update in-memory only for local projects
      if (this.currentProject) {
        if (data.name) this.currentProject.name = data.name
        if (data.description) this.currentProject.description = data.description
        if (data.spaces) this.currentProject.spaces = data.spaces as SpaceType[]
        this.currentProject.updated_at = new Date().toISOString()

        // Persist to project config file if possible
        try {
          const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
          const projectDir = useProjectDirectory()
          const config = await projectDir.loadProjectConfig(this.currentProject.path)
          if (config) {
            if (data.name) config.name = data.name
            if (data.description) config.description = data.description
            if (data.spaces) config.spaces = data.spaces
            config.updated = new Date().toISOString()
            await projectDir.saveProjectConfig(this.currentProject.path, config)
          }
        } catch {
          // Config file update is best-effort
        }
      }
      return { success: true, data: this.currentProject }
    },

    clearCurrentProject() {
      this.currentProject = null
    },

    /** Alias for loadProjects — backward compat with old code */
    async fetchProjects() {
      return this.loadProjects()
    },

    /** Alias: load a single project by id (path slug) */
    async fetchProject(id: string | number) {
      if (this.projects.length === 0) {
        await this.loadProjects()
      }
      const project = this.projects.find(p => p.id === id || p.id === String(id))
      if (project) {
        this.currentProject = project
        this.trackRecentOpen(project)
      }
    },

    async addExternalProject(path: string) {
      if (this.externalPaths.includes(path)) return

      this.externalPaths.push(path)
      localStorage.setItem(STORAGE_KEY_EXTERNALS, JSON.stringify(this.externalPaths))

      // Reload projects to include the new external
      await this.loadProjects()
    },

    trackRecentOpen(project: LocalProject) {
      project.last_opened_at = new Date().toISOString()

      // Update in projects list
      const idx = this.projects.findIndex(p => p.path === project.path)
      if (idx !== -1) {
        this.projects[idx] = { ...project }
      }

      // Update recents list
      const recents = this.recentProjects.filter(p => p.path !== project.path)
      recents.unshift({ ...project })
      this.recentProjects = recents.slice(0, MAX_RECENTS)

      localStorage.setItem(STORAGE_KEY_RECENTS, JSON.stringify(this.recentProjects))
    },

    setProjectsRoot(path: string) {
      this.projectsRoot = path
      localStorage.setItem(STORAGE_KEY_ROOT, path)
    },

    getRecentTimestamp(path: string): string {
      const recent = this.recentProjects.find(p => p.path === path)
      return recent?.last_opened_at || ''
    },
  },
})
