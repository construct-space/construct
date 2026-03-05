export interface ProjectRouteCandidate {
  id?: string | number | null
  name?: string | null
  path?: string | null
}

export const slugifyProjectToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const getProjectRouteKey = (project: ProjectRouteCandidate): string => {
  if (project.id !== undefined && project.id !== null && String(project.id).trim()) {
    return String(project.id)
  }

  const fromName = slugifyProjectToken(project.name || '')
  if (fromName) return fromName

  const pathSegment = (project.path || '').split('/').pop() || 'project'
  return slugifyProjectToken(pathSegment) || 'project'
}

export const buildProjectRoutePath = (project: ProjectRouteCandidate): string => {
  return `/app/projects/${encodeURIComponent(getProjectRouteKey(project))}`
}
