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
  'code', 'design', 'kanban', 'docs', 'notes',
  'architect', 'git', 'terminal', 'calendar'
]

const slugifyProjectToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const buildProjectId = (name: string, isExternal = false): string => {
  const slug = slugifyProjectToken(name) || 'project'
  return isExternal ? `ext-${slug}` : slug
}

const projectLookupCandidates = (project: LocalProject): Set<string> => {
  const id = String(project.id || '')
  const name = project.name || ''
  const pathName = (project.path || '').split('/').filter(Boolean).pop() || ''
  const isExternal = Boolean(project.is_external) || id.startsWith('ext-')
  const canonical = buildProjectId(name || pathName || id, isExternal)

  return new Set([
    id,
    slugifyProjectToken(id),
    name,
    slugifyProjectToken(name),
    pathName,
    slugifyProjectToken(pathName),
    canonical,
    slugifyProjectToken(canonical),
  ])
}

const projectMatchesLookup = (project: LocalProject, lookup: string): boolean => {
  if (!lookup) return false

  const rawLookup = String(lookup)
  const slugLookup = slugifyProjectToken(rawLookup)
  const unprefixedLookup = rawLookup.replace(/^ext-/, '')
  const slugUnprefixedLookup = slugifyProjectToken(unprefixedLookup)
  const wantsExternal = rawLookup.startsWith('ext-')

  const candidates = projectLookupCandidates(project)
  if (candidates.has(rawLookup) || candidates.has(slugLookup)) return true

  if (wantsExternal) {
    return candidates.has(`ext-${slugUnprefixedLookup}`)
  }

  return candidates.has(unprefixedLookup) || candidates.has(slugUnprefixedLookup)
}

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

    /** Find a project by its slug ID across projects and recents */
    getProjectById: (state) => (id: string): LocalProject | null => {
      return state.projects.find(p => projectMatchesLookup(p, id))
        || state.recentProjects.find(p => projectMatchesLookup(p, id))
        || null
    },
  },

  actions: {
    async initialize() {
      // Load persisted state from localStorage only — no FS scanning.
      // FS scanning happens lazily via loadProjects() when pages need it.
      this.projectsRoot = localStorage.getItem(STORAGE_KEY_ROOT) || ''
      this.externalPaths = JSON.parse(localStorage.getItem(STORAGE_KEY_EXTERNALS) || '[]')
      this.recentProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENTS) || '[]')
    },

    async loadProjects() {
      this.loading = true
      this.error = null

      try {
        const { useProjectDirectory } = await import('@/composables/useProjectDirectory')
        const projectDir = useProjectDirectory()

        const projects: LocalProject[] = []

        // Load managed projects from projects root (if configured)
        if (this.projectsRoot) {
          const entries = await projectDir.listProjects()

          for (const entry of entries) {
            // Check if it's a valid construct project
            const isConstruct = await projectDir.isConstructProject(entry.path)

            // Only show directories that are actual Construct projects
            if (!isConstruct) continue

            const config = await projectDir.loadProjectConfig(entry.path)
            projects.push({
              id: buildProjectId(entry.name),
              name: config?.name || entry.name,
              path: entry.path,
              description: config?.description,
              spaces: (config?.spaces as SpaceType[]) || DEFAULT_SPACES,
              last_opened_at: this.getRecentTimestamp(entry.path),
              is_external: false,
              created_at: config?.created || new Date().toISOString(),
              updated_at: config?.updated || new Date().toISOString(),
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
              id: buildProjectId(name, true),
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
          id: buildProjectId(data.name),
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
        id: buildProjectId(name, true),
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

    updateProject(_projectId: string | number, data: Partial<{ name: string; description: string; spaces: string[]; local_path: string }>) {
      // In-memory update only — FS config persistence handled by space-projects
      if (this.currentProject) {
        if (data.name) this.currentProject.name = data.name
        if (data.description) this.currentProject.description = data.description
        if (data.spaces) this.currentProject.spaces = data.spaces as SpaceType[]
        this.currentProject.updated_at = new Date().toISOString()
      }
      return { success: true, data: this.currentProject }
    },

    /** Open a project by its slug ID (used by project-scoped routes) */
    openProjectById(id: string): LocalProject | null {
      const project = this.getProjectById(id)
      if (project) {
        this.currentProject = project
        this.trackRecentOpen(project)
        return project
      }
      return null
    },

    clearCurrentProject() {
      this.currentProject = null
    },

    async addExternalFolderByPath(path: string): Promise<LocalProject | null> {
      if (!path) return null

      if (!this.externalPaths.includes(path)) {
        this.externalPaths.push(path)
        localStorage.setItem(STORAGE_KEY_EXTERNALS, JSON.stringify(this.externalPaths))
      }

      // Reload projects to include the external path.
      await this.loadProjects()
      return this.projects.find(p => p.path === path) || null
    },

    async addExternalProject(path: string): Promise<LocalProject | null> {
      return this.addExternalFolderByPath(path)
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
