<script setup lang="ts">
/**
 * Code Space - Home
 * Project structure hub: create, clone, manage structures
 */
import { invoke } from '@tauri-apps/api/core'
import { createFolderPin } from '~/stores/pinned'
import { useCodeEditor } from '../composables/useCodeEditor'
import {
  getTemplatesByCategory,
  getTemplate,
  buildCreateCommand,
  sanitizeProjectName,
  generateConstructConfig,
  getRequiredTools,
  formatMissingToolsError,
  parseCommandError,
  type RequiredTool,
} from '../templates.config'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const pinnedStore = usePinnedStore()
const projectId = computed(() => {
  const p = route.query.project
  return typeof p === 'string' ? p : undefined
})
const isProjectScope = computed(() => !!projectId.value)

const { setPageItems, setSearch, clearToolbar } = useToolbar()
const { initTauri, listProjectDirectory, openFolderDialog, addRepository, createProjectStructure, getProjectsRoot, getDefaultProjectsRoot, setProjectsRoot } = useProjectDirectory()
const { loadDirectory } = useCodeEditor()
const toast = useToast()

interface RepoListItem {
  name: string
  path: string
  isRepo: boolean
  status?: 'clean' | 'dirty' | 'unknown'
}

interface CompanyRepoListItem extends RepoListItem {
  projectId: string | number
  projectName: string
}

// Local state
const repos = ref<RepoListItem[]>([])
const companyRepos = ref<CompanyRepoListItem[]>([])
const isLoading = ref(true)
const isCreating = ref(false)

// Create repo modal state
const showCreateModal = ref(false)
const createMode = ref<'empty' | 'template' | 'clone'>('template')
const newRepoName = ref('')
const cloneUrl = ref('')
const selectedTemplate = ref<string | null>(null)
const selectedCategory = ref<'frontend' | 'mobile' | 'backend' | 'fullstack'>('frontend')
const initGit = ref(true)
const selectedModules = ref<string[]>([])

// Tool check state
const toolCheckStatus = ref<'idle' | 'checking' | 'ok' | 'missing'>('idle')
const missingTools = ref<RequiredTool[]>([])

// Edit modal state
const showEditModal = ref(false)
const editingRepo = ref<{ name: string; path: string } | null>(null)
const editName = ref('')
const isRenaming = ref(false)

// Delete modal state
const showDeleteModal = ref(false)
const deletingRepo = ref<{ name: string; path: string } | null>(null)
const isDeleting = ref(false)
const deleteLocalFiles = ref(true)

// Get templates for current category
const currentTemplates = computed(() => getTemplatesByCategory(selectedCategory.value))

// Get modules for selected template
const currentModules = computed(() => {
  if (!selectedTemplate.value) return []
  const template = getTemplate(selectedTemplate.value)
  return template?.modules || []
})

// Validate that a path is within allowed directories (prevents path traversal attacks)
const isPathSafe = (targetPath: string, allowedBase: string): boolean => {
  // Normalize paths to prevent ../ traversal
  const normalizedTarget = targetPath.replace(/\/+/g, '/').replace(/\/$/, '')
  const normalizedBase = allowedBase.replace(/\/+/g, '/').replace(/\/$/, '')

  // Check if target starts with allowed base
  if (!normalizedTarget.startsWith(normalizedBase + '/') && normalizedTarget !== normalizedBase) {
    return false
  }

  // Reject paths with .. components
  if (normalizedTarget.includes('/../') || normalizedTarget.endsWith('/..')) {
    return false
  }

  return true
}

// Whitelist of allowed shell commands for security
const ALLOWED_COMMANDS = ['mkdir', 'mv', 'rm', 'git', 'test', 'sh', 'flutter', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'bunx', 'cargo', 'go', 'composer', 'php', 'rails', 'ruby', 'python3', 'which', 'duxt', 'dart', 'django-admin', 'elixir', 'mix', 'pip', 'uvicorn', 'bundle']

// Check if a command exists on the system
const checkCommandExists = async (command: string): Promise<boolean> => {
  try {
    const result = await invoke<boolean>('lsp_check_command', { command })
    return result
  } catch (e) {
    console.error('Failed to check command:', e)
    return false
  }
}

// Check all required tools for a template, returns list of missing tools
const checkRequiredTools = async (templateId: string): Promise<RequiredTool[]> => {
  const requiredTools = getRequiredTools(templateId)

  // Parallelize Tauri bridge calls instead of sequential N+1
  const results = await Promise.all(
    requiredTools.map(tool => checkCommandExists(tool.command))
  )

  return requiredTools.filter((_, index) => !results[index])
}

// Run shell command helper via Tauri backend - must be defined before syncLocalPath
const runCommand = async (cmd: string, args: string[], cwd: string): Promise<{ success: boolean; output: string }> => {
  // Validate command is in whitelist
  if (!ALLOWED_COMMANDS.includes(cmd)) {
    console.error(`Command not allowed: ${cmd}`)
    return { success: false, output: `Command not allowed: ${cmd}` }
  }

  try {
    console.log(`Running: ${cmd} ${args.join(' ')} in ${cwd}`)
    const result = await invoke<{ success: boolean; code: number | null; stdout: string; stderr: string }>('run_shell_command', {
      command: cmd,
      args,
      cwd
    })
    if (!result.success) {
      console.error('Command failed:', result.stderr)
      return { success: false, output: result.stderr || `Exit code: ${result.code}` }
    }
    return { success: true, output: result.stdout }
  } catch (e) {
    console.error('Command error:', e)
    return { success: false, output: String(e) }
  }
}

// Try to detect and sync local_path for existing projects
const syncLocalPath = async () => {
  if (!isProjectScope.value) return
  console.log('syncLocalPath called')
  const project = projectStore.currentProject
  console.log('syncLocalPath - current project:', project?.name, 'local_path:', project?.local_path)

  if (!project) {
    console.log('syncLocalPath - no project')
    return
  }

  if (project.local_path) {
    console.log('syncLocalPath - already has local_path:', project.local_path)
    return
  }

  // Try to find local project folder based on project name
  const projectsRoot = await getProjectsRoot() || await getDefaultProjectsRoot()
  console.log('syncLocalPath - projectsRoot:', projectsRoot)
  if (!projectsRoot) return

  const safeName = (project.name || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')

  const expectedPath = `${projectsRoot}/${safeName}`
  const configPath = `${expectedPath}/.construct/project.json`

  console.log('syncLocalPath - checking for local project at:', expectedPath)

  // Check if project.json exists using shell command
  const checkResult = await runCommand('test', ['-f', configPath], '/')
  console.log('syncLocalPath - check result:', checkResult)

  if (checkResult.success) {
    console.log('syncLocalPath - Found local project, syncing local_path to database')
    // Update project in database with local_path
    try {
      const result = await projectStore.updateProject(Number(projectId.value), { local_path: expectedPath })
      console.log('syncLocalPath - updateProject result:', result)

      // Force update local store if API didn't return updated project
      if (projectStore.currentProject && !projectStore.currentProject.local_path) {
        console.log('syncLocalPath - Force setting local_path on store')
        projectStore.currentProject.local_path = expectedPath
      }

      toast.add({ title: 'Local folder detected', description: expectedPath, color: 'success' })
    } catch (e) {
      console.error('syncLocalPath - Failed to sync local_path:', e)
      // Still set locally even if API fails
      if (projectStore.currentProject) {
        projectStore.currentProject.local_path = expectedPath
        toast.add({ title: 'Local folder set', description: expectedPath, color: 'info' })
      }
    }
  } else {
    console.log('syncLocalPath - No local project found at:', expectedPath)
  }
}

// Load repositories from project's code/ directory
const loadRepos = async () => {
  isLoading.value = true

  try {
    await initTauri()

    if (!isProjectScope.value) {
      if (projectStore.projects.length === 0) {
        await projectStore.loadProjects()
      }

      const discovered: CompanyRepoListItem[] = []
      for (const project of projectStore.projects) {
        if (!project.local_path) continue
        if (project.spaces && project.spaces.length > 0 && !project.spaces.includes('code')) continue

        const codePath = `${project.local_path}/code`
        try {
          const entries = await listProjectDirectory(codePath)
          const projectItems = entries
            .filter(e => e.isDirectory)
            .map((entry): CompanyRepoListItem => ({
              name: entry.name,
              path: entry.path,
              isRepo: entry.isRepo || false,
              status: entry.repoStatus,
              projectId: project.id,
              projectName: project.name,
            }))

          discovered.push(...projectItems)
        } catch {
          // Ignore projects without a local code folder.
        }
      }

      companyRepos.value = discovered.sort((a, b) => {
        if (a.projectName === b.projectName) return a.name.localeCompare(b.name)
        return a.projectName.localeCompare(b.projectName)
      })
      repos.value = []
      return
    }

    // Try to sync local_path if not set
    await syncLocalPath()

    // Get project's local path from store or config
    const project = projectStore.currentProject
    if (!project?.local_path) {
      isLoading.value = false
      return
    }

    const codePath = `${project.local_path}/code`
    const entries = await listProjectDirectory(codePath)

    repos.value = entries
      .filter(e => e.isDirectory)
      .map(e => ({
        name: e.name,
        path: e.path,
        isRepo: e.isRepo || false,
        status: e.repoStatus,
      }))
    companyRepos.value = []
  } catch (e) {
    console.error('Failed to load repos:', e)
  } finally {
    isLoading.value = false
  }
}

// Open a repository in the editor
const openRepo = (repo: { name: string; path: string }) => {
  if (!projectId.value) return

  // Save to localStorage for persistence across reloads
  const storageKey = `construct-editor-${projectId.value}`
  localStorage.setItem(storageKey, repo.path)
  console.log('[Code] Saved editor path to localStorage:', repo.path)

  loadDirectory(repo.path)
  router.push({ path: '/app/code/editor', query: { project: projectId.value } })
}

const openCompanyRepo = (repo: CompanyRepoListItem) => {
  const storageKey = `construct-editor-${repo.projectId}`
  localStorage.setItem(storageKey, repo.path)
  loadDirectory(repo.path)
  router.push({ path: '/app/code/editor', query: { project: repo.projectId } })
}

// Create new repository
const createRepo = async () => {
  if (!isProjectScope.value) {
    toast.add({ title: 'Project required', description: 'Open a project to create structures.', color: 'warning' })
    return
  }
  console.log('createRepo called')
  const project = projectStore.currentProject
  console.log('Current project:', project)

  if (!project?.local_path) {
    console.error('No local_path set for project')
    toast.add({ title: 'Error', description: 'Project has no local folder. Create a local folder first.', color: 'error' })
    return
  }

  isCreating.value = true
  const codePath = `${project.local_path}/code`
  const repoName = newRepoName.value || selectedTemplate.value || 'new-repo'
  console.log('Creating repo:', { codePath, repoName, mode: createMode.value })

  try {
    // Ensure code directory exists
    console.log('Ensuring code directory exists:', codePath)
    const mkdirResult = await runCommand('mkdir', ['-p', codePath], project.local_path)
    if (!mkdirResult.success) {
      console.error('Failed to create code directory:', mkdirResult.output)
      toast.add({ title: 'Error', description: `Failed to create code directory: ${mkdirResult.output}`, color: 'error' })
      isCreating.value = false
      return
    }
    console.log('Code directory ready')

    let result: { success: boolean; output: string }

    if (createMode.value === 'empty') {
      // Create empty git repo
      const repoPath = `${codePath}/${repoName}`
      await runCommand('mkdir', ['-p', repoPath], codePath)
      result = await runCommand('git', ['init'], repoPath)

    } else if (createMode.value === 'clone') {
      // Clone from URL
      const cloneName = repoName || cloneUrl.value.split('/').pop()?.replace('.git', '') || 'repo'
      result = await runCommand('git', ['clone', cloneUrl.value, cloneName], codePath)

    } else if (createMode.value === 'template' && selectedTemplate.value) {
      // Scaffold from template using config
      const template = getTemplate(selectedTemplate.value)
      if (!template) {
        toast.add({ title: 'Error', description: 'Template not found', color: 'error' })
        return
      }

      // Check if required tools are installed
      console.log('[Template] Checking required tools...')
      const missingTools = await checkRequiredTools(template.id)
      if (missingTools.length > 0) {
        console.error('[Template] Missing tools:', missingTools, formatMissingToolsError(missingTools))
        toast.add({
          title: 'Missing Required Tools',
          description: missingTools.map(t => `${t.name}: ${t.installHint || t.installUrl || 'Not installed'}`).join('\n'),
          color: 'error'
        })
        isCreating.value = false
        return
      }

      // Sanitize name based on template requirements (e.g., Flutter needs snake_case)
      const sanitizedName = sanitizeProjectName(repoName, template.id)
      const repoPath = `${codePath}/${sanitizedName}`

      // Build create command from config
      const createCmd = buildCreateCommand(template.id, repoName, { initGit: initGit.value })
      if (!createCmd) {
        toast.add({ title: 'Error', description: 'Failed to build create command', color: 'error' })
        return
      }

      console.log(`[Template] Running: ${createCmd.cmd} ${createCmd.args.join(' ')}`)
      result = await runCommand(createCmd.cmd, createCmd.args, codePath)

      // If template doesn't init git by default and user wants git, init it manually
      if (result.success && initGit.value && !template.create.initsGit) {
        const checkDir = await runCommand('test', ['-d', repoPath], codePath)
        if (checkDir.success) {
          console.log('[Template] Initializing git in:', repoPath)
          await runCommand('git', ['init'], repoPath)
        }
      }

      // Run install command if template has one (e.g., flutter pub get, bun install)
      if (result.success && template.commands?.install && template.commands.install.length > 0) {
        const [installCmd, ...installArgs] = template.commands.install
        if (installCmd) {
          console.log(`[Template] Running install: ${installCmd} ${installArgs.join(' ')}`)
          const installResult = await runCommand(installCmd, installArgs, repoPath)
        if (!installResult.success) {
          console.warn('[Template] Install command failed:', installResult.output)
          // Don't fail the whole creation, just warn
          toast.add({
            title: 'Note',
            description: `Project created but dependency install failed. Run "${template.commands.install.join(' ')}" manually.`,
            color: 'warning'
          })
        }
        }
      }

      // Install selected modules
      if (result.success && selectedModules.value.length > 0 && template.modules) {
        const mods = template.modules.filter(m => selectedModules.value.includes(m.id))
        if (mods.length > 0) {
          const regularPkgs = mods.filter(m => !m.dev).map(m => m.package)
          const devPkgs = mods.filter(m => m.dev).map(m => m.package)
          const isDart = template.requiredTools?.some(t => t.command === 'dart')
          const isGo = template.requiredTools?.some(t => t.command === 'go')
          const isRuby = template.requiredTools?.some(t => t.command === 'ruby' || t.command === 'rails')

          if (isDart || template.packageManager === 'flutter') {
            for (const pkg of [...regularPkgs, ...devPkgs]) {
              console.log(`[Template] dart pub add ${pkg}`)
              await runCommand('dart', ['pub', 'add', pkg], repoPath)
            }
          } else if (template.packageManager === 'composer') {
            if (regularPkgs.length > 0) await runCommand('composer', ['require', ...regularPkgs], repoPath)
            if (devPkgs.length > 0) await runCommand('composer', ['require', '--dev', ...devPkgs], repoPath)
          } else if (template.packageManager === 'pip') {
            const allPkgs = [...regularPkgs, ...devPkgs]
            if (allPkgs.length > 0) await runCommand('pip', ['install', ...allPkgs], repoPath)
          } else if (isGo) {
            for (const pkg of [...regularPkgs, ...devPkgs]) {
              await runCommand('go', ['get', pkg], repoPath)
            }
          } else if (isRuby) {
            for (const pkg of [...regularPkgs, ...devPkgs]) {
              await runCommand('bundle', ['add', pkg], repoPath)
            }
          } else {
            const pm = template.packageManager === 'bun' ? 'bun' : template.packageManager === 'yarn' ? 'yarn' : template.packageManager === 'pnpm' ? 'pnpm' : 'npm'
            if (regularPkgs.length > 0) await runCommand(pm, ['add', ...regularPkgs], repoPath)
            if (devPkgs.length > 0) await runCommand(pm, ['add', '-D', ...devPkgs], repoPath)
          }
          console.log('[Template] Modules installed')
        }
      }

      // Create .construct directory with project config
      if (result.success) {
        const constructDir = `${repoPath}/.construct`
        const configContent = JSON.stringify(generateConstructConfig(template.id), null, 2)
        await runCommand('mkdir', ['-p', constructDir], codePath)
        // Write config file using shell
        await runCommand('sh', ['-c', `cat > "${constructDir}/project.json" << 'CONSTRUCT_EOF'
${configContent}
CONSTRUCT_EOF`], codePath)
        console.log('[Template] Created .construct/project.json')
      }
    } else {
      return
    }

    console.log('Command result:', result!)
    if (result!.success) {
      toast.add({ title: 'Structure created', description: repoName, color: 'success' })
      resetCreateModal()
      await loadRepos()
    } else {
      console.error('Create failed:', result!.output)

      // Try to parse the error for a user-friendly message
      const parsedError = parseCommandError(result!.output || '')
      if (parsedError) {
        toast.add({
          title: parsedError.title,
          description: parsedError.hint,
          color: 'error'
        })
      } else {
        // Fallback to showing raw error
        toast.add({
          title: 'Failed to create structure',
          description: result!.output || 'Unknown error occurred',
          color: 'error'
        })
      }
    }
  } catch (e) {
    console.error('Failed to create repo:', e)
    const errorStr = String(e)
    const parsedError = parseCommandError(errorStr)
    if (parsedError) {
      toast.add({
        title: parsedError.title,
        description: parsedError.hint,
        color: 'error'
      })
    } else {
      toast.add({ title: 'Error', description: errorStr, color: 'error' })
    }
  } finally {
    isCreating.value = false
  }
}

// Import existing folder
const importFolder = async () => {
  if (!isProjectScope.value) {
    toast.add({ title: 'Project required', description: 'Open a project to import folders.', color: 'warning' })
    return
  }
  const selectedPath = await openFolderDialog('Select Repository Folder')
  if (!selectedPath) return

  const project = projectStore.currentProject
  if (!project?.local_path) return

  const folderName = selectedPath.split('/').pop() || 'repo'
  await addRepository(project.local_path, folderName, {
    type: 'move',
    path: selectedPath,
  })

  await loadRepos()
}

// Open edit modal
const openEditModal = (repo: { name: string; path: string }) => {
  editingRepo.value = repo
  editName.value = repo.name
  showEditModal.value = true
}

// Rename structure
const renameStructure = async () => {
  if (!editingRepo.value || !editName.value.trim()) return

  const oldPath = editingRepo.value.path
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'))
  const newName = editName.value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
  const newPath = `${parentDir}/${newName}`

  if (oldPath === newPath) {
    showEditModal.value = false
    return
  }

  isRenaming.value = true
  try {
    const result = await runCommand('mv', [oldPath, newPath], parentDir)
    if (result.success) {
      toast.add({ title: 'Structure renamed', description: newName, color: 'success' })
      showEditModal.value = false
      editingRepo.value = null
      await loadRepos()
    } else {
      toast.add({ title: 'Error', description: result.output || 'Failed to rename structure', color: 'error' })
    }
  } catch (e) {
    toast.add({ title: 'Error', description: String(e), color: 'error' })
  } finally {
    isRenaming.value = false
  }
}

// Open delete modal
const openDeleteModal = (repo: { name: string; path: string }) => {
  deletingRepo.value = repo
  deleteLocalFiles.value = true
  showDeleteModal.value = true
}

// Delete structure
const deleteStructure = async () => {
  if (!deletingRepo.value) return

  const project = projectStore.currentProject
  if (!project?.local_path) {
    toast.add({ title: 'Error', description: 'Project has no local path', color: 'error' })
    return
  }

  // Validate path is within project directory (security check)
  if (!isPathSafe(deletingRepo.value.path, project.local_path)) {
    toast.add({ title: 'Error', description: 'Invalid path - operation not allowed', color: 'error' })
    console.error('Path validation failed:', deletingRepo.value.path, 'not within', project.local_path)
    return
  }

  isDeleting.value = true
  try {
    if (deleteLocalFiles.value) {
      // Delete the actual files - use project's local_path as cwd for safety
      const result = await runCommand('rm', ['-rf', deletingRepo.value.path], project.local_path)
      if (!result.success) {
        toast.add({ title: 'Error', description: result.output || 'Failed to delete structure', color: 'error' })
        return
      }
      toast.add({ title: 'Structure deleted', description: deletingRepo.value.name, color: 'success' })
    } else {
      // Just remove from view (files remain on disk)
      toast.add({ title: 'Structure removed', description: 'Local files were kept', color: 'info' })
    }

    await loadRepos()
  } catch (e) {
    toast.add({ title: 'Error', description: String(e), color: 'error' })
  } finally {
    showDeleteModal.value = false
    deletingRepo.value = null
    isDeleting.value = false
  }
}

// Reset modal state
const resetCreateModal = () => {
  showCreateModal.value = false
  createMode.value = 'template'
  newRepoName.value = ''
  cloneUrl.value = ''
  selectedTemplate.value = null
  selectedCategory.value = 'frontend'
  initGit.value = true
  selectedModules.value = []
  toolCheckStatus.value = 'idle'
  missingTools.value = []
}

// When template changes, pre-select recommended modules and check required tools
watch(selectedTemplate, async (templateId) => {
  if (!templateId) {
    selectedModules.value = []
    toolCheckStatus.value = 'idle'
    missingTools.value = []
    return
  }
  const template = getTemplate(templateId)
  if (template?.modules) {
    selectedModules.value = template.modules
      .filter(m => m.recommended)
      .map(m => m.id)
  } else {
    selectedModules.value = []
  }

  // Check required tools
  const required = getRequiredTools(templateId)
  if (required.length === 0) {
    toolCheckStatus.value = 'ok'
    missingTools.value = []
    return
  }
  toolCheckStatus.value = 'checking'
  const missing = await checkRequiredTools(templateId)
  missingTools.value = missing
  toolCheckStatus.value = missing.length > 0 ? 'missing' : 'ok'
})

// Open create modal
const openCreateModal = () => {
  if (!isProjectScope.value) {
    toast.add({ title: 'Project required', description: 'Open a project to create structures.', color: 'warning' })
    return
  }
  resetCreateModal()
  showCreateModal.value = true
}

// Create local folder for project
const isCreatingFolder = ref(false)
const createLocalFolder = async () => {
  if (!isProjectScope.value) {
    toast.add({ title: 'Project required', description: 'Open a project to create local folders.', color: 'warning' })
    return
  }
  const project = projectStore.currentProject
  if (!project) return

  isCreatingFolder.value = true
  try {
    // Get or create projects root
    let projectsRoot = await getProjectsRoot()
    if (!projectsRoot) {
      projectsRoot = await getDefaultProjectsRoot()
      if (projectsRoot) {
        await setProjectsRoot(projectsRoot)
      }
    }

    if (!projectsRoot) {
      toast.add({ title: 'Error', description: 'Could not determine projects folder', color: 'error' })
      return
    }

    // Create project structure
    const safeName = (project.name || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')

    const createdPath = await createProjectStructure(safeName, projectsRoot, ['code', 'design', 'assets'], false)

    if (createdPath) {
      // Update project with local path
      await projectStore.updateProject(Number(projectId.value), { local_path: createdPath })
      toast.add({ title: 'Local folder created', description: createdPath, color: 'success' })
      await loadRepos()
    } else {
      toast.add({ title: 'Error', description: 'Failed to create local folder', color: 'error' })
    }
  } catch (e) {
    console.error('Failed to create local folder:', e)
    toast.add({ title: 'Error', description: 'Failed to create local folder', color: 'error' })
  } finally {
    isCreatingFolder.value = false
  }
}

// Set up toolbar when page mounts
const syncToolbar = () => {
  if (isProjectScope.value) {
    setPageItems([
      {
        id: 'code-new',
        icon: 'i-lucide-plus',
        label: 'New',
        type: 'action',
        category: 'space',
        onClick: openCreateModal
      },
      {
        id: 'code-import',
        icon: 'i-lucide-folder-input',
        label: 'Import',
        type: 'action',
        category: 'space',
        onClick: importFolder
      },
      {
        id: 'code-refresh',
        icon: 'i-lucide-refresh-cw',
        label: 'Refresh',
        type: 'action',
        category: 'space',
        onClick: loadRepos
      }
    ])

    setSearch('Search structures...', (query) => {
      console.log('Search structures:', query)
    })
    return
  }

  setPageItems([
    {
      id: 'code-open-projects',
      icon: 'i-lucide-folder-open',
      label: 'Projects',
      type: 'action',
      category: 'space',
      onClick: () => router.push('/app')
    },
    {
      id: 'code-refresh',
      icon: 'i-lucide-refresh-cw',
      label: 'Refresh',
      type: 'action',
      category: 'space',
      onClick: loadRepos
    }
  ])

  setSearch('Search repositories...', (query) => {
    console.log('Search repositories:', query)
  })
}

onMounted(async () => {
  // Small delay to ensure toolbar rotation is complete
  setTimeout(syncToolbar, 100)

  await loadRepos()
})

// Clear toolbar when leaving
onUnmounted(() => {
  clearToolbar()
})

// Watch for project changes
watch(
  [isProjectScope, () => projectStore.currentProject?.local_path],
  async ([scope], [previousScope]) => {
    syncToolbar()
    if (scope !== previousScope) {
      await loadRepos()
    }
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-app">
<!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Loading -->
      <div v-if="isLoading" class="flex items-center justify-center h-64">
        <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
      </div>

      <!-- No project selected — show recent projects to open -->
      <div v-else-if="!isProjectScope" class="h-full flex items-center justify-center">
        <div class="w-full max-w-lg text-center">
          <Icon name="i-lucide-code" class="size-12 text-app-muted mb-3 mx-auto" />
          <h2 class="text-lg font-medium text-app mb-1">Code Editor</h2>
          <p class="text-sm text-app-muted mb-6">Select a project to open in the editor.</p>

          <!-- Recent projects -->
          <div v-if="projectStore.recentProjects.length > 0" class="space-y-2 mb-6 text-left">
            <p class="text-xs text-app-muted uppercase tracking-wider font-medium px-1">Recent Projects</p>
            <button
              v-for="project in projectStore.recentProjects.slice(0, 6)"
              :key="project.path"
              class="w-full text-left p-3 rounded-lg border border-app hover:border-app-accent/30 hover:bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)] transition-all"
              @click="router.push({ path: '/app/code/editor', query: { project: project.path } })"
            >
              <p class="text-sm font-medium text-app">{{ project.name }}</p>
              <p class="text-[10px] text-app-muted truncate mt-0.5">{{ project.path }}</p>
            </button>
          </div>

          <div class="flex gap-2 justify-center">
            <Button
              icon="i-lucide-folder-open"
              label="Open Folder"
              @click="importFolder"
            />
            <Button
              icon="i-lucide-plus"
              label="New Project"
              variant="soft"
              @click="openCreateModal"
            />
          </div>
        </div>
      </div>

      <!-- No local path configured -->
      <div v-else-if="!projectStore.currentProject?.local_path" class="flex flex-col items-center justify-center h-full text-center">
        <Icon name="i-lucide-folder-plus" class="size-16 text-app-muted mb-4" />
        <h2 class="text-lg font-medium text-app mb-2">Create Local Folder</h2>
        <p class="text-app-muted text-sm mb-4 max-w-md">
          Create a local folder to store repositories and files for this project.
        </p>
        <Button
          icon="i-lucide-folder-plus"
          label="Create Local Folder"
          :loading="isCreatingFolder"
          @click="createLocalFolder"
        />
      </div>

      <!-- Empty state - No structures yet -->
      <div v-else-if="repos.length === 0" class="flex flex-col items-center justify-center h-full text-center">
        <Icon name="i-lucide-code" class="size-16 text-app-muted mb-4" />
        <h2 class="text-lg font-medium text-app mb-2">No Structures</h2>
        <p class="text-app-muted text-sm mb-4 max-w-md">
          Create a new structure from a template, initialize an empty one, or import an existing folder.
        </p>
        <div class="flex gap-2">
          <Button
            icon="i-lucide-plus"
            label="Create Structure"
            @click="openCreateModal"
          />
          <Button
            icon="i-lucide-folder-input"
            label="Import"
            variant="soft"
            @click="importFolder"
          />
        </div>
      </div>

      <!-- Structure list -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Tooltip
          v-for="repo in repos"
          :key="repo.path"
          :text="repo.name"
          :popper="{ placement: 'top' }"
        >
          <div
            class="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all group"
            @click="openRepo(repo)"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-(--app-accent)/10">
                  <Icon
                    :name="repo.isRepo ? 'i-lucide-git-branch' : 'i-lucide-folder'"
                    class="size-5 text-app-accent"
                  />
                </div>
                <div>
                  <h3 class="font-medium text-app group-hover:text-app-accent transition-colors">
                    {{ repo.name }}
                  </h3>
                  <p class="text-xs text-app-muted">
                    {{ repo.isRepo ? 'Git Repository' : 'Folder' }}
                  </p>
                </div>
              </div>

              <!-- Status indicator -->
              <div v-if="repo.isRepo" class="flex items-center gap-1">
                <span
                  class="size-2 rounded-full"
                  :class="{
                    'bg-green-400': repo.status === 'clean',
                    'bg-yellow-400': repo.status === 'dirty',
                    'bg-gray-400': repo.status === 'unknown'
                  }"
                />
              </div>
            </div>

            <p class="text-xs text-app-muted truncate">
              {{ repo.path }}
            </p>

            <!-- Quick actions -->
            <div class="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                icon="i-lucide-code"
                size="xs"
                variant="soft"
                label="Open"
                @click.stop="openRepo(repo)"
              />
              <Button
                v-if="repo.isRepo"
                icon="i-lucide-terminal"
                size="xs"
                variant="ghost"
                title="Terminal"
                @click.stop="router.push({ path: '/app/code/terminal', query: { project: projectId } })"
              />
              <Button
                :icon="pinnedStore.isPinned(`folder-${repo.path}`) ? 'i-lucide-pin-off' : 'i-lucide-pin'"
                size="xs"
                variant="ghost"
                :title="pinnedStore.isPinned(`folder-${repo.path}`) ? 'Unpin' : 'Pin'"
                :class="pinnedStore.isPinned(`folder-${repo.path}`) ? 'text-app-accent' : ''"
                @click.stop="pinnedStore.togglePin(createFolderPin({ name: repo.name, localPath: repo.path, projectId: Number(projectId) }))"
              />
              <div class="flex-1" />
              <Button
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                title="Rename"
                @click.stop="openEditModal(repo)"
              />
              <Button
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                title="Delete"
                @click.stop="openDeleteModal(repo)"
              />
            </div>
          </div>
        </Tooltip>
      </div>
    </div>

    <!-- Create Structure Modal -->
    <!-- Create Structure Modal -->
    <Modal v-model:open="showCreateModal" :ui="{ content: 'w-[80vw] max-w-[80vw] max-h-[85vh]' }">
      <template #header>
        <div class="flex items-center gap-3">
          <Icon name="i-lucide-plus-circle" class="size-6 text-app-accent" />
          <h2 class="text-xl font-medium text-app">Create Structure</h2>
        </div>
      </template>

      <template #body>
        <!-- Mode Selection -->
        <div class="flex gap-2 mb-5">
          <Button
            :variant="createMode === 'template' ? 'solid' : 'ghost'"
            :color="createMode === 'template' ? 'primary' : 'neutral'"
            size="sm"
            icon="i-lucide-layout-template"
            label="From Template"
            @click="createMode = 'template'"
          />
          <Button
            :variant="createMode === 'empty' ? 'solid' : 'ghost'"
            :color="createMode === 'empty' ? 'primary' : 'neutral'"
            size="sm"
            icon="i-lucide-git-branch"
            label="Empty Repo"
            @click="createMode = 'empty'"
          />
          <Button
            :variant="createMode === 'clone' ? 'solid' : 'ghost'"
            :color="createMode === 'clone' ? 'primary' : 'neutral'"
            size="sm"
            icon="i-lucide-download"
            label="Clone URL"
            @click="createMode = 'clone'"
          />
        </div>

        <!-- Template Selection — Finder-style Miller columns -->
        <div v-if="createMode === 'template'" class="space-y-4 min-h-[460px]">
          <!-- Name input + Git checkbox above columns -->
          <div class="flex items-end gap-4">
            <FormField label="Structure Name" class="flex-1">
              <Input
                v-model="newRepoName"
                :placeholder="selectedTemplate || 'my-app'"
                icon="i-lucide-folder"
              />
            </FormField>
            <Checkbox v-model="initGit" label="Initialize Git" class="pb-2 shrink-0" />
          </div>

          <!-- Miller columns -->
          <div class="flex border border-white/10 rounded-lg overflow-hidden h-[400px]">
            <!-- Column 1: Categories -->
            <div class="flex-1 border-r border-white/10 overflow-y-auto">
              <div class="px-3 py-2 text-[10px] font-medium text-app-muted uppercase tracking-wider border-b border-white/10">
                Categories
              </div>
              <button
                v-for="cat in ([
                  { id: 'frontend', icon: 'i-lucide-monitor', label: 'Frontend' },
                  { id: 'mobile', icon: 'i-lucide-smartphone', label: 'Mobile' },
                  { id: 'backend', icon: 'i-lucide-server', label: 'Backend' },
                  { id: 'fullstack', icon: 'i-lucide-layers', label: 'Fullstack' },
                ] as const)"
                :key="cat.id"
                class="w-full px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors text-left"
                :class="selectedCategory === cat.id
                  ? 'bg-(--app-accent)/10 text-app-accent'
                  : 'text-app hover:bg-white/5'"
                @click="selectedCategory = cat.id"
              >
                <Icon :name="cat.icon" class="size-4 shrink-0" />
                <span class="text-sm flex-1">{{ cat.label }}</span>
                <Icon name="i-lucide-chevron-right" class="size-4 text-app-muted ml-auto" />
              </button>
            </div>

            <!-- Column 2: Templates -->
            <div class="flex-1 border-r border-white/10 overflow-y-auto">
              <div class="px-3 py-2 text-[10px] font-medium text-app-muted uppercase tracking-wider border-b border-white/10">
                Templates
              </div>
              <button
                v-for="template in currentTemplates"
                :key="template.id"
                class="w-full px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors text-left"
                :class="selectedTemplate === template.id
                  ? 'bg-(--app-accent)/10 text-app-accent'
                  : 'text-app hover:bg-white/5'"
                @click="selectedTemplate = template.id"
              >
                <Icon :name="template.icon" class="size-4 shrink-0" />
                <span class="text-sm flex-1 truncate">{{ template.name }}</span>
                <Icon v-if="template.modules && template.modules.length > 0" name="i-lucide-chevron-right" class="size-4 text-app-muted ml-auto shrink-0" />
              </button>
              <div v-if="currentTemplates.length === 0" class="flex items-center justify-center h-32 text-app-muted">
                <p class="text-xs">No templates in this category</p>
              </div>
            </div>

            <!-- Column 3: Modules / Details -->
            <div class="flex-1 overflow-y-auto">
              <div class="px-3 py-2 text-[10px] font-medium text-app-muted uppercase tracking-wider border-b border-white/10">
                {{ currentModules.length > 0 ? 'Modules' : 'Details' }}
              </div>

              <!-- Modules list -->
              <div v-if="currentModules.length > 0" class="p-1">
                <label
                  v-for="mod in currentModules"
                  :key="mod.id"
                  class="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors"
                  :class="selectedModules.includes(mod.id)
                    ? 'bg-(--app-accent)/10 text-app-accent'
                    : 'text-app hover:bg-white/5'"
                >
                  <input
                    v-model="selectedModules"
                    type="checkbox"
                    :value="mod.id"
                    class="size-3.5 rounded border-white/20 bg-white/5 text-app-accent focus:ring-app-accent/50"
                  >
                  <div class="flex-1 min-w-0">
                    <span class="text-sm">{{ mod.name }}</span>
                    <p v-if="mod.description" class="text-[10px] text-app-muted">{{ mod.description }}</p>
                  </div>
                </label>
              </div>

              <!-- Template details (no modules) -->
              <div v-else-if="selectedTemplate" class="p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <Icon :name="getTemplate(selectedTemplate)?.icon || 'i-lucide-code'" class="size-5 text-app-accent" />
                  <span class="text-sm font-medium text-app">{{ getTemplate(selectedTemplate)?.name }}</span>
                </div>
                <p v-if="getTemplate(selectedTemplate)?.description" class="text-xs text-app-muted">
                  {{ getTemplate(selectedTemplate)?.description }}
                </p>
                <div class="pt-2 border-t border-white/10 space-y-2">
                  <div class="flex items-center gap-2 text-xs text-app-muted">
                    <Icon name="i-lucide-package" class="size-3.5" />
                    <span>{{ getTemplate(selectedTemplate)?.packageManager || 'none' }}</span>
                  </div>
                </div>
              </div>

              <!-- Empty state -->
              <div v-else class="flex items-center justify-center h-full text-app-muted">
                <div class="text-center p-4">
                  <Icon name="i-lucide-columns-3" class="size-8 mx-auto mb-2 opacity-30" />
                  <p class="text-xs">Select a template</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Structure -->
        <div v-else-if="createMode === 'empty'" class="space-y-4">
          <p class="text-sm text-app-muted">
            Create an empty structure. You can add files and push to a remote later.
          </p>
          <FormField label="Structure Name" required>
            <Input
              v-model="newRepoName"
              placeholder="my-project"
              icon="i-lucide-folder"
            />
          </FormField>
          <Checkbox v-model="initGit" label="Initialize Git repository" />
        </div>

        <!-- Clone -->
        <div v-else-if="createMode === 'clone'" class="space-y-4">
          <FormField label="Repository URL" required>
            <Input
              v-model="cloneUrl"
              placeholder="https://github.com/user/repo.git"
              icon="i-lucide-link"
            />
          </FormField>
          <FormField label="Local Name (optional)">
            <Input
              v-model="newRepoName"
              placeholder="Leave empty to use repo name"
              icon="i-lucide-folder"
            />
          </FormField>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center gap-2">
          <!-- Tool check status (left side) -->
          <div v-if="createMode === 'template' && selectedTemplate" class="flex items-center gap-2 text-xs">
            <template v-if="toolCheckStatus === 'checking'">
              <Icon name="i-lucide-loader-2" class="size-3.5 animate-spin text-app-muted" />
              <span class="text-app-muted">Checking tools...</span>
            </template>
            <template v-else-if="toolCheckStatus === 'ok'">
              <Icon name="i-lucide-check-circle" class="size-3.5 text-green-400" />
              <span class="text-green-400">Tools installed</span>
            </template>
            <template v-else-if="toolCheckStatus === 'missing'">
              <Icon name="i-lucide-alert-triangle" class="size-3.5 text-yellow-400" />
              <span class="text-yellow-400">Missing: {{ missingTools.map(t => t.name).join(', ') }}</span>
            </template>
          </div>

          <div class="flex-1" />

          <Button
            label="Cancel"
            variant="ghost"
            @click="resetCreateModal"
          />
          <Button
            label="Create"
            icon="i-lucide-plus"
            :loading="isCreating"
            :disabled="(createMode === 'template' && !selectedTemplate) || (createMode === 'empty' && !newRepoName) || (createMode === 'clone' && !cloneUrl)"
            @click="createRepo"
          />
        </div>
      </template>
    </Modal>

    <!-- Edit Structure Modal -->
    <Modal v-model:open="showEditModal">
      <template #header>
        <div class="flex items-center gap-3">
          <Icon name="i-lucide-pencil" class="size-6 text-app-accent" />
          <h2 class="text-xl font-medium text-app">Rename Structure</h2>
        </div>
      </template>

      <template #body>
        <FormField label="Structure Name" required>
          <Input
            v-model="editName"
            :placeholder="editingRepo?.name"
            icon="i-lucide-folder"
            @keydown.enter="renameStructure"
          />
        </FormField>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            label="Cancel"
            variant="ghost"
            @click="showEditModal = false"
          />
          <Button
            label="Rename"
            icon="i-lucide-check"
            :loading="isRenaming"
            :disabled="!editName.trim()"
            @click="renameStructure"
          />
        </div>
      </template>
    </Modal>

    <!-- Delete Confirmation Modal -->
    <Modal v-model:open="showDeleteModal">
      <template #header>
        <div class="flex items-center gap-3">
          <Icon name="i-lucide-trash-2" class="size-6 text-red-500" />
          <h2 class="text-xl font-medium text-app">Delete Structure</h2>
        </div>
      </template>

      <template #body>
        <p class="text-app-muted">
          Are you sure you want to delete <span class="font-medium text-app">{{ deletingRepo?.name }}</span>?
        </p>

        <div class="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <Checkbox v-model="deleteLocalFiles" label="Delete local files" />
          <p class="text-xs text-app-muted mt-1 ml-6">
            {{ deleteLocalFiles ? 'All files will be permanently deleted from disk' : 'Files will be kept on disk' }}
          </p>
        </div>

        <p v-if="deleteLocalFiles" class="text-sm text-red-400 mt-3">
          This action cannot be undone.
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            label="Cancel"
            variant="ghost"
            @click="showDeleteModal = false"
          />
          <Button
            :label="deleteLocalFiles ? 'Delete' : 'Remove'"
            :icon="deleteLocalFiles ? 'i-lucide-trash-2' : 'i-lucide-x'"
            :color="deleteLocalFiles ? 'error' : 'neutral'"
            :loading="isDeleting"
            @click="deleteStructure"
          />
        </div>
      </template>
    </Modal>
  </div>
</template>
