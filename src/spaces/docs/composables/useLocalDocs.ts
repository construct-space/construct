/**
 * useLocalDocs - Composable for local .md file management
 * Loads local docs from project_path/docs/, supports syncing to API,
 * and write-through to local files when saving synced docs.
 *
 * Pattern follows useLocalDesigns.ts:
 * - Tauri FS APIs for filesystem operations
 * - Lazy initialization
 * - Bidirectional sync with per-doc control
 */
import type { DocumentType, DocumentListItem } from '~/stores/documents'

// Unified doc type for the sidebar - represents both API and local docs
export interface UnifiedDoc {
  id?: number              // DB id (undefined for local-only)
  title: string
  type: DocumentType
  updated_at: string
  created_at: string
  source: 'api' | 'local' | 'synced'  // api = DB only, local = file only, synced = both
  localPath?: string       // Full path to local .md file
  filename?: string        // e.g. "my-doc.md"
  project_id?: number
  company_id?: number
}

// Tauri filesystem API (lazy loaded)
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null

const initTauri = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  try {
    if (!tauriFs) {
      tauriFs = await import('@tauri-apps/plugin-fs')
    }
    return true
  } catch (e) {
    console.warn('[useLocalDocs] Tauri not available:', e)
    return false
  }
}

// Convert title to filename (collapses multiple non-alphanum chars into single dash)
export function docTitleToFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') + '.md'
}

// Convert filename to title (strip .md, convert dashes/underscores to spaces, title case)
export function docFilenameToTitle(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Normalize a string for matching: strip all non-alphanumeric, lowercase
// This handles lossy conversions like "MarketMind - Setup" vs "marketmind-setup"
// and "PRODUCT_MODULES" vs "PRODUCT MODULES"
function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Guess document type from content or filename
export function guessDocType(filename: string, content?: string): DocumentType {
  const lower = filename.toLowerCase()
  if (lower.includes('prd') || lower.includes('product-requirement')) return 'prd'
  if (lower.includes('readme')) return 'readme'
  if (lower.includes('architecture') || lower.includes('arch')) return 'architecture'
  if (lower.includes('roadmap')) return 'roadmap'
  if (lower.includes('setup') || lower.includes('install') || lower.includes('getting-started')) return 'setup'

  // Check content for hints
  if (content) {
    const lowerContent = content.toLowerCase().slice(0, 500)
    if (lowerContent.includes('# product requirement') || lowerContent.includes('# prd')) return 'prd'
    if (lowerContent.includes('# architecture') || lowerContent.includes('# system design')) return 'architecture'
    if (lowerContent.includes('# roadmap')) return 'roadmap'
    if (lowerContent.includes('# setup') || lowerContent.includes('# installation')) return 'setup'
  }

  return 'custom'
}

export function useLocalDocs() {
  const projectStore = useProjectStore()
  const documentsStore = useDocumentsStore()
  const toast = useToast()

  const localDocs = ref<UnifiedDoc[]>([])
  const loadingLocal = ref(false)
  const syncing = ref<string | null>(null)  // filename being synced

  // Get docs directory path
  function getDocsPath(): string {
    const projectPath = projectStore.currentProject?.local_path
    return projectPath ? `${projectPath}/docs` : ''
  }

  // Ensure docs directory exists
  async function ensureDocsDirectory(): Promise<boolean> {
    const docsPath = getDocsPath()
    if (!docsPath) return false

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      const exists = await tauriFs.exists(docsPath)
      if (!exists) {
        await tauriFs.mkdir(docsPath, { recursive: true })
      }
      return true
    } catch (e) {
      console.error('[useLocalDocs] Failed to ensure docs directory:', e)
      return false
    }
  }

  // Load local .md files from project_path/docs/
  async function loadLocalDocs(): Promise<UnifiedDoc[]> {
    const docsPath = getDocsPath()
    if (!docsPath) return []

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return []

    loadingLocal.value = true
    try {
      const exists = await tauriFs.exists(docsPath)
      if (!exists) {
        localDocs.value = []
        return []
      }

      const entries = await tauriFs.readDir(docsPath)
      const docs: UnifiedDoc[] = []

      for (const entry of entries) {
        if (!entry.name || !entry.name.endsWith('.md')) continue

        const filePath = `${docsPath}/${entry.name}`

        // Read file to get content for type guessing and date
        let content = ''
        let stat: { mtime?: Date } | null = null
        try {
          content = await tauriFs.readTextFile(filePath)
          stat = await tauriFs.stat(filePath) as { mtime?: Date } | null
        } catch {
          // Skip unreadable files
          continue
        }

        const title = docFilenameToTitle(entry.name)
        const type = guessDocType(entry.name, content)
        const mtime = stat?.mtime ? new Date(stat.mtime).toISOString() : new Date().toISOString()

        docs.push({
          title,
          type,
          updated_at: mtime,
          created_at: mtime,
          source: 'local',
          localPath: filePath,
          filename: entry.name,
        })
      }

      localDocs.value = docs
      return docs
    } catch (e) {
      console.error('[useLocalDocs] Failed to load local docs:', e)
      return []
    } finally {
      loadingLocal.value = false
    }
  }

  // Build unified doc list: merge API docs + local docs
  // - API docs that have a matching local file → 'synced'
  // - API docs without local file → 'api'
  // - Local docs without API match → 'local'
  function buildUnifiedList(apiDocs: DocumentListItem[]): UnifiedDoc[] {
    const unified: UnifiedDoc[] = []
    const matchedLocalPaths = new Set<string>()

    // Process API docs first
    for (const apiDoc of apiDocs) {
      const normalizedApiTitle = normalizeForMatch(apiDoc.title)
      const matchingLocal = localDocs.value.find(ld => {
        // Normalize both sides for robust matching:
        // handles "MarketMind - Setup" vs "marketmind-setup.md"
        // and "PRODUCT_MODULES.md" vs "PRODUCT MODULES"
        const normalizedLocalTitle = normalizeForMatch(ld.title)
        const normalizedFilename = ld.filename ? normalizeForMatch(ld.filename.replace(/\.md$/i, '')) : ''
        return normalizedLocalTitle === normalizedApiTitle
          || normalizedFilename === normalizedApiTitle
      })

      if (matchingLocal) {
        // Synced: exists in both
        matchedLocalPaths.add(matchingLocal.localPath || '')
        unified.push({
          id: apiDoc.id,
          title: apiDoc.title,
          type: apiDoc.type,
          updated_at: apiDoc.updated_at,
          created_at: apiDoc.created_at,
          source: 'synced',
          localPath: matchingLocal.localPath,
          filename: matchingLocal.filename,
          project_id: apiDoc.project_id,
          company_id: apiDoc.company_id,
        })
      } else {
        // API only
        unified.push({
          id: apiDoc.id,
          title: apiDoc.title,
          type: apiDoc.type,
          updated_at: apiDoc.updated_at,
          created_at: apiDoc.created_at,
          source: 'api',
          project_id: apiDoc.project_id,
          company_id: apiDoc.company_id,
        })
      }
    }

    // Add local-only docs
    for (const localDoc of localDocs.value) {
      if (!matchedLocalPaths.has(localDoc.localPath || '')) {
        unified.push(localDoc)
      }
    }

    return unified
  }

  // Sync a single local doc to API
  async function syncLocalDocToApi(doc: UnifiedDoc): Promise<boolean> {
    if (!doc.localPath || !doc.filename) return false

    const projectId = projectStore.currentProject?.id
    if (!projectId) {
      toast.add({ title: 'Error', description: 'No project selected', color: 'error' })
      return false
    }

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    syncing.value = doc.filename
    try {
      // Read local file content
      const content = await tauriFs.readTextFile(doc.localPath)

      // Create in API
      const result = await documentsStore.createProjectDocument(Number(projectId), {
        title: doc.title,
        type: doc.type,
        content,
      })

      if (result.success) {
        toast.add({
          title: 'Synced',
          description: `"${doc.title}" synced to cloud`,
          color: 'success'
        })
        return true
      } else {
        toast.add({
          title: 'Sync Failed',
          description: (result as any).error || 'Failed to sync document',
          color: 'error'
        })
        return false
      }
    } catch (e) {
      console.error('[useLocalDocs] Sync failed:', e)
      toast.add({
        title: 'Sync Failed',
        description: 'Failed to read local file',
        color: 'error'
      })
      return false
    } finally {
      syncing.value = null
    }
  }

  // Write a document to local .md file
  async function writeDocToLocal(title: string, content: string): Promise<boolean> {
    const docsPath = getDocsPath()
    if (!docsPath) return false

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      await ensureDocsDirectory()

      const filename = docTitleToFilename(title)
      const filePath = `${docsPath}/${filename}`

      await tauriFs.writeTextFile(filePath, content)
      return true
    } catch (e) {
      console.error('[useLocalDocs] Failed to write doc to local:', e)
      return false
    }
  }

  // Delete a local .md file
  async function deleteLocalDoc(localPath: string): Promise<boolean> {
    const initialized = await initTauri()
    if (!initialized || !tauriFs) return false

    try {
      const exists = await tauriFs.exists(localPath)
      if (exists) {
        await tauriFs.remove(localPath)
      }
      return true
    } catch (e) {
      console.error('[useLocalDocs] Failed to delete local doc:', e)
      return false
    }
  }

  // Rename a local .md file
  async function renameLocalDoc(oldPath: string, newTitle: string): Promise<string | null> {
    const docsPath = getDocsPath()
    if (!docsPath || !oldPath) return null

    const initialized = await initTauri()
    if (!initialized || !tauriFs) return null

    try {
      // Read old content
      const content = await tauriFs.readTextFile(oldPath)

      // Write new file
      const newFilename = docTitleToFilename(newTitle)
      const newPath = `${docsPath}/${newFilename}`
      await tauriFs.writeTextFile(newPath, content)

      // Delete old file (only if path changed)
      if (oldPath !== newPath) {
        await tauriFs.remove(oldPath)
      }

      return newPath
    } catch (e) {
      console.error('[useLocalDocs] Failed to rename local doc:', e)
      return null
    }
  }

  // Read content of a local .md file
  async function readLocalDoc(localPath: string): Promise<string | null> {
    const initialized = await initTauri()
    if (!initialized || !tauriFs) return null

    try {
      return await tauriFs.readTextFile(localPath)
    } catch (e) {
      console.error('[useLocalDocs] Failed to read local doc:', e)
      return null
    }
  }

  return {
    localDocs,
    loadingLocal,
    syncing,
    loadLocalDocs,
    buildUnifiedList,
    syncLocalDocToApi,
    writeDocToLocal,
    deleteLocalDoc,
    renameLocalDoc,
    readLocalDoc,
    ensureDocsDirectory,
    getDocsPath,
  }
}
