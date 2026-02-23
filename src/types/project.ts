/**
 * Project-related types
 *
 * Core types (Project, ProjectMember, SpaceAccess, MemberSpaceAccess) are defined
 * in src/stores/project.ts and re-exported here for convenience.
 * Additional input types for create/update operations live here.
 */

// Re-export types from the store
export type { Project, ProjectOwner, ProjectMember, SpaceAccess, MemberSpaceAccess } from '@/stores/project'

export type SpaceType = 'code' | 'design' | 'git' | 'ai' | 'chat' | 'notes' | 'kanban' | 'architect' | 'terminal' | 'docs'

export interface CreateProjectInput {
  name: string
  description?: string
  spaces?: SpaceType[]
}

export type UpdateProjectInput = Partial<CreateProjectInput>
