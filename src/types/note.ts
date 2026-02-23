// Note types for the Sticky Notes space

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange'

export interface Note {
  id: number
  content: string
  color: NoteColor
  position_x: number
  position_y: number
  width: number
  height: number
  is_pinned: boolean
  is_shared: boolean
  project_id?: number
  owner_id?: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
  project?: {
    id: number
    name: string
  }
  owner?: {
    id: number
    first_name: string
    last_name: string
    email: string
  }
}

export interface CreateNoteRequest {
  content: string
  color: NoteColor
  position_x: number
  position_y: number
  width: number
  height: number
  is_pinned?: boolean
  is_shared?: boolean
  project_id?: number
  owner_id?: number
}

export interface UpdateNoteRequest {
  content?: string
  color?: NoteColor
  position_x?: number
  position_y?: number
  width?: number
  height?: number
  is_pinned?: boolean
  is_shared?: boolean
  project_id?: number
  owner_id?: number
}

export interface NoteListResponse {
  id: number
  content: string
  color: NoteColor
  position_x: number
  position_y: number
  width: number
  height: number
  is_pinned: boolean
  is_shared: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}
