<script setup lang="ts">
/**
 * Git - Main Git workspace component (GitHub Desktop-like)
 * Multi-repo management with changes, history, and branch views
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSpaceShortcuts } from '~/composables/useSpaceShortcuts'
import { useRouter } from 'vue-router'
import { useGitRepo, type GitFileChange, type GitCommit, type GitFileDiff, type GitStash, type GitTag } from '../composables/useGitRepo'
import { db } from '~/utils/db'

export interface GitProps {
  scope?: 'company' | 'project'
  projectId?: string
  /** Single repo mode: path to specific repository (for Code space integration) */
  repoPath?: string
}

const props = withDefaults(defineProps<GitProps>(), {
  scope: 'project',
  projectId: undefined,
  repoPath: undefined
})

const emit = defineEmits<{
  (e: 'repo-select' | 'branch-checkout' | 'commit', value: string): void
}>()

// Stores and composables
const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()
const { initTauri, getSpacePath } = useProjectDirectory()
const gitRepo = useGitRepo()
const toast = useToast()

interface RepoSource {
  projectId: string | number
  projectName: string
  localPath: string
  codePath: string
}

// View mode state
const viewMode = ref<'changes' | 'history' | 'branches'>('changes')

// Search results (set from pages/index.vue via template ref)
const searchResults = ref<GitCommit[] | null>(null)

// Displayed commits: search results when searching, otherwise full history
const displayedCommits = computed(() => {
  return searchResults.value ?? gitRepo.state.commits
})

// Clone modal state
const showCloneModal = ref(false)

// Publish modal state
const showPublishModal = ref(false)

// Stash dirty-switch modal
const showDirtySwitchModal = ref(false)
const pendingSwitchBranch = ref<string | null>(null)

// Stash list for changes view
const stashes = ref<GitStash[]>([])

// Tags list for branches view
const tags = ref<GitTag[]>([])

// Settings panel
const showSettings = ref(false)
const gitUxLevel = ref<'beginner' | 'pro'>('beginner')
const gitUxLevelStorageKey = computed(() => `construct_git_ux_level:${authStore.currentUser?.id || 'guest'}`)

// Diff viewer state
const showDiffViewer = ref(false)
const selectedDiffFile = ref<{ path: string; type: 'staged' | 'unstaged' | 'commit'; commitHash?: string } | null>(null)
const diffContent = ref<{ original: string; modified: string; isBinary: boolean } | null>(null)
const isDiffLoading = ref(false)

// Selected commit for history view (commit detail)
const selectedCommitHash = ref<string | null>(null)
const selectedCommitData = ref<GitCommit | null>(null)
const selectedCommitFiles = ref<GitFileDiff[]>([])
const repoSources = ref<RepoSource[]>([])
const repoProjectLookup = ref(new Map<string, string | number>())

// Expose viewMode and searchResults so pages/index.vue can control them
defineExpose({
  viewMode,
  searchResults,
})

// Clear search when switching away from history
watch(viewMode, (newMode) => {
  if (newMode !== 'history') {
    searchResults.value = null
  }
})

// Single repo mode - directly select the provided repo path
const initSingleRepo = async () => {
  if (!props.repoPath) return

  stopBackgroundFetch()
  await initTauri()
  gitRepo.clearDiscoveredRepositories()

  // Get repo info and select it directly
  const repoInfo = await gitRepo.getRepositoryInfo(props.repoPath)
  if (repoInfo) {
    repoProjectLookup.value = new Map()
    await gitRepo.selectRepository(props.repoPath)
    await Promise.all([refreshStashes(), refreshTags()])
    startBackgroundFetch()
  }
}

// Multi-repo mode - discover all repos in project/code/
const initMultiRepo = async () => {
  stopBackgroundFetch()
  const localPath = projectStore.currentProject?.local_path
  if (!localPath) return

  await initTauri()
  gitRepo.clearDiscoveredRepositories()
  const codePath = getSpacePath('code')

  if (codePath) {
    await gitRepo.discoverRepositories(codePath)
    repoSources.value = projectStore.currentProject?.id
      ? [{
          projectId: projectStore.currentProject.id,
          projectName: projectStore.currentProject.name,
          localPath,
          codePath,
        }]
      : []

    const lookup = new Map<string, string | number>()
    for (const repo of gitRepo.repositories.value) {
      if (projectStore.currentProject?.id) {
        lookup.set(repo.path, projectStore.currentProject.id)
      }
    }
    repoProjectLookup.value = lookup

    // Auto-select first repo if available
    const repos = gitRepo.repositories.value
    if (repos.length > 0 && repos[0]) {
      await gitRepo.selectRepository(repos[0].path)
      await Promise.all([refreshStashes(), refreshTags()])
      startBackgroundFetch()
    }
  }
}

const loadRepoSourcesForCompanyScope = async (): Promise<RepoSource[]> => {
  await projectStore.loadProjects()

  const projects = [...projectStore.projects]
  if (typeof window === 'undefined' || projects.length === 0) return []

  const settings = await db.project_settings.bulkGet(projects.map(project => project.id) as any)
  const settingsByProjectId = new Map<string | number, string>()
  for (const setting of settings) {
    if (setting?.projectId && setting.localPath) {
      settingsByProjectId.set(setting.projectId, setting.localPath)
    }
  }

  return projects
    .filter((project) => {
      const spaces = Array.isArray(project.spaces) ? project.spaces : []
      return spaces.length === 0 || spaces.includes('git')
    })
    .map((project) => {
      const localPath = project.local_path || settingsByProjectId.get(project.id) || ''
      if (!localPath) return null
      return {
        projectId: project.id,
        projectName: project.name,
        localPath,
        codePath: `${localPath}/code`,
      } as RepoSource
    })
    .filter((item): item is RepoSource => Boolean(item))
}

const rebuildRepoProjectLookup = () => {
  const lookup = new Map<string, string | number>()
  for (const repo of gitRepo.repositories.value) {
    for (const source of repoSources.value) {
      if (repo.path === source.localPath || repo.path.startsWith(`${source.localPath}/`)) {
        lookup.set(repo.path, source.projectId)
        break
      }
    }
  }
  repoProjectLookup.value = lookup
}

const initCompanyRepos = async () => {
  stopBackgroundFetch()
  await initTauri()
  gitRepo.clearDiscoveredRepositories()

  try {
    repoSources.value = await loadRepoSourcesForCompanyScope()
  } catch (error) {
    console.error('[Git] Failed to load company repo sources:', error)
    repoSources.value = []
  }

  for (const source of repoSources.value) {
    await gitRepo.discoverRepositories(source.codePath)
  }

  rebuildRepoProjectLookup()

  const repos = gitRepo.repositories.value
  if (repos.length > 0 && repos[0]) {
    await gitRepo.selectRepository(repos[0].path)
    await Promise.all([refreshStashes(), refreshTags()])
    startBackgroundFetch()
  }
}

// Refresh stash and tag lists
const refreshStashes = async () => {
  stashes.value = await gitRepo.stashList()
}

const refreshTags = async () => {
  tags.value = await gitRepo.loadTags()
}

// Watch for repoPath changes (Code space)
watch(() => props.repoPath, (newPath, oldPath) => {
  if (newPath && newPath !== oldPath) {
    initSingleRepo()
  }
})

// Watch for project changes (Git space - multi-repo mode)
watch(() => projectStore.currentProject?.local_path, (newPath, oldPath) => {
  // Only run if path actually changed and not in single repo mode
  if (!props.repoPath && props.scope === 'project' && newPath && newPath !== oldPath) {
    initMultiRepo()
  }
})

watch(() => props.scope, (scope, previousScope) => {
  if (scope === previousScope || props.repoPath) return
  if (scope === 'company') {
    initCompanyRepos()
  } else if (projectStore.currentProject?.local_path) {
    initMultiRepo()
  }
})

const loadGitUxLevel = () => {
  if (typeof window === 'undefined') return
  const stored = window.localStorage.getItem(gitUxLevelStorageKey.value)
  if (stored === 'beginner' || stored === 'pro') {
    gitUxLevel.value = stored
    return
  }
  gitUxLevel.value = 'beginner'
}

watch(gitUxLevel, (level) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(gitUxLevelStorageKey.value, level)
})

watch(gitUxLevelStorageKey, () => {
  loadGitUxLevel()
})

// Load on mount
onMounted(() => {
  loadGitUxLevel()

  if (props.repoPath) {
    initSingleRepo()
  } else if (props.scope === 'company') {
    initCompanyRepos()
  } else if (props.scope === 'project' && projectStore.currentProject?.local_path) {
    initMultiRepo()
  }
})

// Background fetch interval (5 min) — separate from status polling
let fetchIntervalId: ReturnType<typeof setInterval> | null = null

const startBackgroundFetch = () => {
  stopBackgroundFetch()
  fetchIntervalId = setInterval(async () => {
    if (gitRepo.state.isOperationInProgress || gitRepo.state.syncStatus !== 'idle') return
    if (!gitRepo.state.currentRepoPath) return
    // Silent fetch — no toast on success, only on error if needed
    await gitRepo.fetch('--all', true)
  }, 5 * 60 * 1000) // 5 minutes
}

const stopBackgroundFetch = () => {
  if (fetchIntervalId) {
    clearInterval(fetchIntervalId)
    fetchIntervalId = null
  }
}

// Cleanup
onUnmounted(() => {
  gitRepo.stopPolling()
  stopBackgroundFetch()
})

// Computed states
const hasLocalPath = computed(() => props.scope === 'company' ? true : !!projectStore.currentProject?.local_path)
const hasRepos = computed(() => gitRepo.repositories.value.length > 0)
const currentRepo = computed(() => gitRepo.currentRepo.value)
const isSingleRepoMode = computed(() => !!props.repoPath)
const allRepos = computed(() => gitRepo.repositories.value)

// Repo selector dropdown
const repoDropdownOpen = ref(false)

// Select a different repo (multi-repo mode only)
const handleRepoSelect = async (repoPath: string) => {
  await gitRepo.selectRepository(repoPath)
  await Promise.all([refreshStashes(), refreshTags()])
  repoDropdownOpen.value = false
}

// Clone handler
const handleClone = async (url: string, name?: string) => {
  showCloneModal.value = false

  let codePath: string
  if (props.scope === 'company') {
    const selectedRepoPath = currentRepo.value?.path
    const selectedProjectId = selectedRepoPath ? repoProjectLookup.value.get(selectedRepoPath) : undefined
    const source = selectedProjectId
      ? repoSources.value.find(item => item.projectId === selectedProjectId)
      : undefined
    codePath = source?.codePath || ''
  } else {
    codePath = getSpacePath('code')
  }

  if (!codePath) {
    toast.add({
      title: 'Clone failed',
      description: props.scope === 'company'
        ? 'Select a repository first to infer target project code folder.'
        : 'No code directory configured',
      color: 'error'
    })
    return
  }

  const success = await gitRepo.cloneRepository(url, codePath, name)
  if (success) {
    toast.add({ title: 'Repository cloned', description: name || url.split('/').pop()?.replace(/\.git$/, ''), color: 'success' })
    await Promise.all([refreshStashes(), refreshTags()])
  } else {
    toast.add({ title: 'Clone failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// Publish handler
const handlePublished = (remoteUrl: string) => {
  showPublishModal.value = false
  toast.add({ title: 'Repository published', description: remoteUrl || 'Remote configured', color: 'success' })
}

// Handle publish request from status bar (when no remote exists)
const handlePublishRequest = () => {
  showPublishModal.value = true
}

// File selection for diff
const handleFileSelect = async (file: GitFileChange | { path: string; status: string }) => {
  const isStaged = 'staged' in file && file.staged
  const type = isStaged ? 'staged' : 'unstaged'

  selectedDiffFile.value = { path: file.path, type }
  showDiffViewer.value = true
  isDiffLoading.value = true

  try {
    const content = await gitRepo.getDiffContent(file.path, type)
    diffContent.value = content
  } catch (e) {
    console.error('Failed to load diff:', e)
    diffContent.value = null
  } finally {
    isDiffLoading.value = false
  }
}

// Commit selection for history view — shows detail panel
const handleCommitSelect = async (commit: GitCommit) => {
  selectedCommitHash.value = commit.hash
  selectedCommitData.value = commit
  selectedDiffFile.value = null
  showDiffViewer.value = false
  diffContent.value = null

  // Load commit file list for the detail panel
  const diffs = await gitRepo.getCommitDiff(commit.hash)
  selectedCommitFiles.value = diffs
}

// Handle file click from commit detail
const handleCommitFileSelect = async (filePath: string) => {
  if (!selectedCommitHash.value) return

  selectedDiffFile.value = { path: filePath, type: 'commit', commitHash: selectedCommitHash.value }
  showDiffViewer.value = true
  isDiffLoading.value = true

  try {
    const content = await gitRepo.getDiffContent(filePath, 'commit', selectedCommitHash.value)
    diffContent.value = content
  } catch (e) {
    console.error('Failed to load commit file diff:', e)
    diffContent.value = null
  } finally {
    isDiffLoading.value = false
  }
}

// Close diff viewer
const closeDiffViewer = () => {
  showDiffViewer.value = false
  selectedDiffFile.value = null
  diffContent.value = null
}

// Staging handlers
const handleStage = async (paths: readonly string[]) => {
  await gitRepo.stageFiles([...paths])
}

const handleUnstage = async (paths: readonly string[]) => {
  await gitRepo.unstageFiles([...paths])
}

const handleStageAll = async () => {
  await gitRepo.stageAll()
}

const handleUnstageAll = async () => {
  await gitRepo.unstageAll()
}

const handleDiscard = async (paths: readonly string[]) => {
  const success = await gitRepo.discardChanges([...paths])
  if (success) {
    toast.add({ title: 'Changes discarded', color: 'success' })
  }
}

const handleDiscardAll = async () => {
  const success = await gitRepo.discardAllChanges()
  if (success) {
    toast.add({ title: 'All changes discarded', color: 'success' })
  }
}

const refreshDiffForPath = async (path: string) => {
  if (selectedDiffFile.value?.path !== path) return

  const isNowStaged = gitRepo.state.stagedChanges.some(file => file.path === path)
  const isNowUnstaged = gitRepo.state.unstagedChanges.some(file => file.path === path)

  if (!isNowStaged && !isNowUnstaged) {
    closeDiffViewer()
    return
  }

  const type = isNowStaged ? 'staged' : 'unstaged'
  selectedDiffFile.value = { path, type }
  isDiffLoading.value = true

  try {
    diffContent.value = await gitRepo.getDiffContent(path, type)
  } catch {
    diffContent.value = null
  } finally {
    isDiffLoading.value = false
  }
}

const handleResolveMine = async (path: string) => {
  const success = await gitRepo.resolveConflictUseMine(path)
  if (success) {
    await refreshDiffForPath(path)
    toast.add({
      title: 'Conflict resolved with mine',
      description: `${path} now uses your current branch version and is staged.`,
      color: 'success',
    })
  } else {
    toast.add({
      title: 'Could not resolve conflict',
      description: gitRepo.state.lastError?.message || 'Unknown error',
      color: 'error',
    })
  }
}

const handleResolveTheirs = async (path: string) => {
  const success = await gitRepo.resolveConflictUseTheirs(path)
  if (success) {
    await refreshDiffForPath(path)
    toast.add({
      title: 'Conflict resolved with theirs',
      description: `${path} now uses incoming changes and is staged.`,
      color: 'success',
    })
  } else {
    toast.add({
      title: 'Could not resolve conflict',
      description: gitRepo.state.lastError?.message || 'Unknown error',
      color: 'error',
    })
  }
}

const handleResolveAllMine = async () => {
  const { resolved, failed } = await gitRepo.resolveAllConflictsUseMine()
  if (resolved.length > 0) {
    if (selectedDiffFile.value && resolved.includes(selectedDiffFile.value.path)) {
      await refreshDiffForPath(selectedDiffFile.value.path)
    }
    toast.add({
      title: `Resolved ${resolved.length} file${resolved.length !== 1 ? 's' : ''} with mine`,
      color: 'success',
    })
  }
  if (failed.length > 0) {
    toast.add({
      title: `Failed on ${failed.length} file${failed.length !== 1 ? 's' : ''}`,
      description: gitRepo.state.lastError?.message || 'Resolve remaining files manually.',
      color: 'error',
    })
  }
}

const handleResolveAllTheirs = async () => {
  const { resolved, failed } = await gitRepo.resolveAllConflictsUseTheirs()
  if (resolved.length > 0) {
    if (selectedDiffFile.value && resolved.includes(selectedDiffFile.value.path)) {
      await refreshDiffForPath(selectedDiffFile.value.path)
    }
    toast.add({
      title: `Resolved ${resolved.length} file${resolved.length !== 1 ? 's' : ''} with theirs`,
      color: 'success',
    })
  }
  if (failed.length > 0) {
    toast.add({
      title: `Failed on ${failed.length} file${failed.length !== 1 ? 's' : ''}`,
      description: gitRepo.state.lastError?.message || 'Resolve remaining files manually.',
      color: 'error',
    })
  }
}

const handleAbortOngoingOperation = async () => {
  const success = await gitRepo.abortOngoingOperation()
  if (success) {
    closeDiffViewer()
    toast.add({
      title: 'Merge/Rebase aborted',
      description: 'Repository state has been restored to before the in-progress operation.',
      color: 'success',
    })
  } else {
    toast.add({
      title: 'Could not abort operation',
      description: gitRepo.state.lastError?.message || 'Unknown error',
      color: 'error',
    })
  }
}

// Commit handler
const handleCommit = async (message: string) => {
  const success = await gitRepo.createCommit(message)
  if (success) {
    const subject = message.split('\n')[0] || message
    toast.add({ title: 'Committed', description: subject, color: 'success' })
    emit('commit', message)
    closeDiffViewer()
  } else {
    toast.add({ title: 'Commit failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// Amend handler
const handleAmend = async () => {
  const success = await gitRepo.amendCommit()
  if (success) {
    toast.add({ title: 'Commit amended', color: 'success' })
  } else {
    toast.add({ title: 'Amend failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// Branch handlers
const handleBranchCheckout = async (branch: string) => {
  const success = await gitRepo.checkoutBranch(branch)
  if (success) {
    emit('branch-checkout', branch)
    toast.add({ title: `Switched to ${branch}`, color: 'success' })
  } else {
    // Check if it failed due to dirty state
    const error = gitRepo.state.lastError
    const stderr = error?.stderr || ''
    const lowered = stderr.toLowerCase()
    if (lowered.includes('please commit your changes or stash them')) {
      pendingSwitchBranch.value = branch
      showDirtySwitchModal.value = true
    } else if (stderr.toLowerCase().includes('resolve your current index first')) {
      viewMode.value = 'changes'
      toast.add({
        title: 'Resolve conflicts first',
        description: 'Use the Conflicts section and choose Mine/Theirs for each file, then try switching branches again.',
        color: 'warning',
      })
    } else {
      toast.add({ title: 'Checkout failed', description: error?.message || 'Unknown error', color: 'error' })
    }
  }
}

// Stash-and-switch handler
const handleStashAndSwitch = async () => {
  showDirtySwitchModal.value = false
  const branch = pendingSwitchBranch.value
  if (!branch) return
  pendingSwitchBranch.value = null

  const stashResult = await gitRepo.stashSaveDetailed(`Auto-stash before switching to ${branch}`, { includeUntracked: true })
  if (!stashResult.success) {
    toast.add({ title: 'Stash failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
    return
  }

  const switched = await gitRepo.checkoutBranch(branch)
  if (switched) {
    toast.add({
      title: `Switched to ${branch}`,
      description: stashResult.created ? 'Changes stashed safely (including untracked files).' : 'No local edits needed stashing.',
      color: 'success'
    })
    await refreshStashes()
  } else {
    // Restore stash only if one was actually created.
    if (stashResult.created) {
      await gitRepo.stashPop(0)
    }
    toast.add({ title: 'Checkout failed after stash', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handleBranchCreate = async (name: string) => {
  const success = await gitRepo.createBranch(name)
  if (success) {
    toast.add({ title: `Branch "${name}" created`, color: 'success' })
  } else {
    toast.add({ title: 'Branch creation failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handleBranchDelete = async (name: string, force?: boolean) => {
  const success = await gitRepo.deleteBranch(name, force)
  if (success) {
    toast.add({ title: `Branch "${name}" deleted`, color: 'success' })
  } else {
    toast.add({ title: 'Branch deletion failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handleBranchMerge = async (name: string) => {
  const success = await gitRepo.mergeBranch(name)
  if (success) {
    toast.add({ title: `Merged "${name}"`, color: 'success' })
  } else {
    toast.add({ title: 'Merge failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// Remote handlers
const handleFetch = async () => {
  const success = await gitRepo.fetch()
  if (success) {
    toast.add({ title: 'Fetched from remote', color: 'success' })
  } else {
    toast.add({ title: 'Fetch failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handlePull = async () => {
  const success = await gitRepo.pull()
  if (success) {
    toast.add({ title: 'Pulled successfully', color: 'success' })
  } else {
    toast.add({ title: 'Pull failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handlePush = async () => {
  const repo = currentRepo.value
  const setUpstream = !repo?.hasUpstream
  const success = await gitRepo.push(setUpstream)
  if (success) {
    toast.add({ title: setUpstream ? 'Branch published' : 'Pushed successfully', color: 'success' })
  } else {
    toast.add({ title: 'Push failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const isOverwriteByLocalChangesError = (): boolean => {
  const error = gitRepo.state.lastError
  const text = `${error?.message || ''}\n${error?.stderr || ''}`.toLowerCase()
  return (
    text.includes('would be overwritten by merge') ||
    text.includes('your local changes to the following files') ||
    text.includes('please commit your changes or stash them')
  )
}

const safeRetryStashAction = async (action: 'apply' | 'pop', index: number): Promise<boolean> => {
  const stashRef = `stash@{${index}}`
  const autoStashMessage = `Auto-stash before ${action} ${stashRef}`

  toast.add({
    title: 'Saving your local edits first',
    description: 'Your current changes would be overwritten, so Construct is stashing them and retrying safely.',
    color: 'warning',
  })

  const stashResult = await gitRepo.stashSaveDetailed(autoStashMessage, { includeUntracked: true })
  if (!stashResult.success) {
    toast.add({
      title: 'Could not save your local edits',
      description: gitRepo.state.lastError?.message || 'Stash save failed',
      color: 'error',
    })
    return false
  }

  // A new stash shifts target index only when one was actually created.
  const shiftedIndex = stashResult.created ? index + 1 : index
  const retried = action === 'pop'
    ? await gitRepo.stashPop(shiftedIndex)
    : await gitRepo.stashApply(shiftedIndex)

  if (!retried) {
    toast.add({
      title: action === 'pop' ? 'Could not restore that stash yet' : 'Could not apply that stash yet',
      description: gitRepo.state.lastError?.message || 'Retry failed',
      color: 'error',
    })
    return false
  }

  await refreshStashes()
  toast.add({
    title: action === 'pop' ? 'Stash restored safely' : 'Stash applied safely',
    description: stashResult.created
      ? 'Your previous local edits were saved as a new stash at the top of the stash list.'
      : 'No new local stash was needed before applying the selected stash.',
    color: 'success',
  })
  return true
}

// Stash handlers
const handleStashSave = async (message?: string) => {
  const result = await gitRepo.stashSaveDetailed(message, { includeUntracked: true })
  if (result.success) {
    toast.add({
      title: result.created ? 'Changes stashed' : 'Nothing to stash',
      description: result.created ? 'Tracked and untracked files were saved to stash.' : undefined,
      color: 'success'
    })
    await refreshStashes()
  } else {
    toast.add({ title: 'Stash failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handleStashPop = async (index: number) => {
  const success = await gitRepo.stashPop(index)
  if (success) {
    toast.add({ title: 'Stash popped', color: 'success' })
    await refreshStashes()
  } else {
    if (isOverwriteByLocalChangesError()) {
      const recovered = await safeRetryStashAction('pop', index)
      if (recovered) return
    }
    toast.add({
      title: 'Could not restore this stash',
      description: gitRepo.state.lastError?.message || 'Unknown error',
      color: 'error',
    })
  }
}

const handleStashApply = async (index: number) => {
  const success = await gitRepo.stashApply(index)
  if (success) {
    toast.add({ title: 'Stash applied', color: 'success' })
  } else {
    if (isOverwriteByLocalChangesError()) {
      const recovered = await safeRetryStashAction('apply', index)
      if (recovered) return
    }
    toast.add({
      title: 'Could not apply this stash',
      description: gitRepo.state.lastError?.message || 'Unknown error',
      color: 'error',
    })
  }
}

const handleStashDrop = async (index: number) => {
  const success = await gitRepo.stashDrop(index)
  if (success) {
    toast.add({ title: 'Stash dropped', color: 'success' })
    await refreshStashes()
  } else {
    toast.add({ title: 'Stash drop failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// Tag handlers
const handleCreateTag = async (name: string, message?: string) => {
  const success = await gitRepo.createTag(name, message)
  if (success) {
    toast.add({ title: `Tag "${name}" created`, color: 'success' })
    await refreshTags()
  } else {
    toast.add({ title: 'Tag creation failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handleDeleteTag = async (name: string) => {
  const success = await gitRepo.deleteTag(name)
  if (success) {
    toast.add({ title: `Tag "${name}" deleted`, color: 'success' })
    await refreshTags()
  } else {
    toast.add({ title: 'Tag deletion failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

const handlePushTag = async (name: string) => {
  const success = await gitRepo.pushTag(name)
  if (success) {
    toast.add({ title: `Tag "${name}" pushed`, color: 'success' })
  } else {
    toast.add({ title: 'Tag push failed', description: gitRepo.state.lastError?.message || 'Unknown error', color: 'error' })
  }
}

// History load more
const handleLoadMoreHistory = async () => {
  await gitRepo.loadHistory(gitRepo.state.historyOffset, 50)
}

// Context menu handlers
const handleIgnoreFile = async (path: string) => {
  await gitRepo.addToGitignore(path)
}

const handleIgnoreFolder = async (folder: string) => {
  await gitRepo.addToGitignore(folder + '/')
}

const handleIgnoreExtension = async (extension: string) => {
  await gitRepo.addToGitignore('*.' + extension)
}

const handleRevealInFinder = async (path: string) => {
  if (!currentRepo.value?.path) return
  const fullPath = `${currentRepo.value.path}/${path}`
  await gitRepo.revealInFinder(fullPath)
}

const handleOpenInEditor = (path: string) => {
  // Navigate to code space with the file path.
  const selectedRepoPath = currentRepo.value?.path
  const scopedProjectId = selectedRepoPath
    ? repoProjectLookup.value.get(selectedRepoPath)
    : undefined
  const fallbackProjectId = projectStore.currentProject?.id || (props.projectId ? parseInt(props.projectId, 10) : undefined)
  const targetProjectId = scopedProjectId || fallbackProjectId

  // Resolve the project's filesystem path for query-based routing
  const targetSource = targetProjectId
    ? repoSources.value.find(item => item.projectId === targetProjectId)
    : undefined
  const projectPath = targetSource?.localPath || projectStore.currentProject?.path

  if (!projectPath) {
    toast.add({
      title: 'Open in Code failed',
      description: 'Could not determine project for this repository.',
      color: 'error',
    })
    return
  }
  const encodedPath = encodeURIComponent(path)
  router.push({ path: '/app/code', query: { project: projectPath, file: encodedPath } })
}

// Plain-key space shortcuts (input guard prevents firing in text inputs)
useSpaceShortcuts([
  { id: 'git.stage-all',   key: 's', label: 'Stage all',   group: 'Git', onPress: handleStageAll },
  { id: 'git.unstage-all', key: 'u', label: 'Unstage all', group: 'Git', onPress: handleUnstageAll },
  { id: 'git.refresh',     key: 'r', label: 'Refresh',     group: 'Git', onPress: () => gitRepo.refreshStatus() },
])

// Keyboard shortcuts (modifier combos for view switching / push)
const handleKeydown = (e: KeyboardEvent) => {
  const meta = e.metaKey || e.ctrlKey

  if (meta && !e.shiftKey) {
    if (e.key === '1') {
      e.preventDefault()
      viewMode.value = 'changes'
    } else if (e.key === '2') {
      e.preventDefault()
      viewMode.value = 'history'
    } else if (e.key === '3') {
      e.preventDefault()
      viewMode.value = 'branches'
    } else if (e.key === 'r') {
      e.preventDefault()
      gitRepo.refreshStatus()
    }
  }

  if (meta && e.shiftKey) {
    if (e.key === 'P' || e.key === 'p') {
      e.preventDefault()
      handlePush()
    } else if (e.key === 'N' || e.key === 'n') {
      e.preventDefault()
      viewMode.value = 'branches'
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <!-- Header -->
    <div class="h-12 px-4 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between bg-white/50 dark:bg-black/20">
      <div class="flex items-center gap-3">
        <Icon name="i-lucide-git-branch" class="size-5 text-app-accent" />

        <!-- Single repo mode: just show name -->
        <div v-if="isSingleRepoMode">
          <p class="text-sm font-medium text-app">
            {{ currentRepo?.name || 'Git' }}
          </p>
          <p class="text-xs text-app-muted">
            {{ currentRepo?.currentBranch || 'No repository' }}
          </p>
        </div>

        <!-- Multi-repo mode: show dropdown selector -->
        <div v-else class="relative">
          <button
            v-if="allRepos.length > 1"
            class="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/20 dark:hover:bg-white/10"
            @click="repoDropdownOpen = !repoDropdownOpen"
          >
            <div class="text-left">
              <p class="text-sm font-medium text-app">
                {{ currentRepo?.name || 'Select Repository' }}
              </p>
              <p class="text-xs text-app-muted">
                {{ currentRepo?.currentBranch || 'No branch' }}
              </p>
            </div>
            <Icon name="i-lucide-chevron-down" class="size-4 text-app-muted" />
          </button>

          <!-- Dropdown (only in multi-repo mode) -->
          <div
            v-if="repoDropdownOpen && allRepos.length > 1"
            class="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50"
          >
            <div class="p-2">
              <p class="text-xs font-medium text-app-muted uppercase px-2 py-1">Repositories</p>
              <div
                v-for="repo in allRepos"
                :key="repo.path"
                class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer"
                :class="repo.path === currentRepo?.path
                  ? 'bg-[var(--app-accent)]/10 text-app'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-app-muted'"
                @click="handleRepoSelect(repo.path)"
              >
                <Icon
                  :name="repo.path === currentRepo?.path ? 'i-lucide-check' : 'i-lucide-git-branch'"
                  class="size-4"
                  :class="repo.path === currentRepo?.path ? 'text-app-accent' : ''"
                />
                <div class="flex-1 min-w-0">
                  <span class="text-sm truncate block">{{ repo.name }}</span>
                  <span class="text-xs text-app-muted truncate block">{{ repo.currentBranch }}</span>
                </div>
                <span
                  class="size-2 rounded-full shrink-0"
                  :class="{
                    'bg-green-400': repo.status === 'clean',
                    'bg-yellow-400': repo.status === 'dirty',
                    'bg-gray-400': repo.status === 'unknown'
                  }"
                />
              </div>
            </div>
          </div>

          <!-- Backdrop for dropdown -->
          <div
            v-if="repoDropdownOpen"
            class="fixed inset-0 z-40"
            @click="repoDropdownOpen = false"
          />

          <!-- Single repo fallback (when only one repo) -->
          <div v-if="allRepos.length <= 1">
            <p class="text-sm font-medium text-app">
              {{ currentRepo?.name || 'Git' }}
            </p>
            <p class="text-xs text-app-muted">
              {{ currentRepo?.currentBranch || 'No repository selected' }}
            </p>
          </div>
        </div>

        <!-- Remote URL badge -->
        <div v-if="currentRepo?.remoteUrl" class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/20 dark:bg-white/5 max-w-64">
          <Icon name="i-lucide-globe" class="size-3 text-app-muted shrink-0" />
          <span class="text-xs text-app-muted truncate" :title="currentRepo.remoteUrl">
            {{ currentRepo.remoteUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '') }}
          </span>
        </div>
        <div v-else-if="currentRepo" class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/20 dark:bg-white/5">
          <Icon name="i-lucide-globe" class="size-3 text-yellow-500 shrink-0" />
          <span class="text-xs text-yellow-500">No remote</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button
          icon="i-lucide-rotate-cw"
          variant="ghost"
          color="neutral"
          size="sm"
          title="Refresh status (Cmd+R)"
          :loading="gitRepo.state.isRefreshing"
          :disabled="gitRepo.state.isOperationInProgress"
          @click="gitRepo.refreshStatus"
        />
        <Button
          icon="i-lucide-cloud-download"
          variant="ghost"
          color="neutral"
          size="sm"
          title="Fetch from remote"
          :loading="gitRepo.state.syncStatus === 'fetching'"
          :disabled="gitRepo.state.isOperationInProgress"
          @click="handleFetch"
        />
        <Button
          icon="i-lucide-download"
          variant="ghost"
          color="neutral"
          size="sm"
          title="Pull"
          :loading="gitRepo.state.syncStatus === 'pulling'"
          :disabled="gitRepo.state.isOperationInProgress"
          @click="handlePull"
        />
        <Button
          v-if="currentRepo?.remoteUrl"
          icon="i-lucide-upload"
          variant="ghost"
          color="neutral"
          size="sm"
          title="Push"
          :loading="gitRepo.state.syncStatus === 'pushing'"
          :disabled="gitRepo.state.isOperationInProgress"
          @click="handlePush"
        />
        <Button
          v-if="currentRepo && !currentRepo.remoteUrl"
          icon="i-lucide-cloud-upload"
          label="Publish"
          variant="soft"
          color="primary"
          size="sm"
          :disabled="gitRepo.state.isOperationInProgress"
          @click="showPublishModal = true"
        />
        <div class="w-px h-5 bg-gray-200/50 dark:bg-gray-700/50" />
        <Button
          icon="i-lucide-settings"
          variant="ghost"
          color="neutral"
          size="sm"
          title="Repository settings"
          @click="showSettings = !showSettings"
        />
      </div>
    </div>

    <!-- View Tabs -->
    <div v-if="(isSingleRepoMode || hasRepos)" class="px-2 py-2 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/30 dark:bg-black/10">
      <div class="flex gap-1">
        <Button
          :variant="viewMode === 'changes' ? 'solid' : 'ghost'"
          :color="viewMode === 'changes' ? 'primary' : 'neutral'"
          size="xs"
          @click="viewMode = 'changes'"
        >
          <Icon name="i-lucide-file-diff" class="size-3.5 mr-1" />
          Changes
          <span v-if="gitRepo.hasChanges.value" class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white/30">
            {{ gitRepo.state.stagedChanges.length + gitRepo.state.unstagedChanges.length }}
          </span>
        </Button>
        <Button
          :variant="viewMode === 'history' ? 'solid' : 'ghost'"
          :color="viewMode === 'history' ? 'primary' : 'neutral'"
          size="xs"
          @click="viewMode = 'history'; searchResults = null"
        >
          <Icon name="i-lucide-history" class="size-3.5 mr-1" />
          History
        </Button>
        <Button
          :variant="viewMode === 'branches' ? 'solid' : 'ghost'"
          :color="viewMode === 'branches' ? 'primary' : 'neutral'"
          size="xs"
          @click="viewMode = 'branches'"
        >
          <Icon name="i-lucide-git-branch" class="size-3.5 mr-1" />
          Branches
        </Button>
      </div>
    </div>

    <!-- Settings Panel (collapsible) -->
    <div v-if="showSettings && currentRepo" class="border-b border-gray-200/50 dark:border-gray-700/50 bg-white/20 dark:bg-black/10">
      <div class="px-4 py-3 space-y-3">
        <!-- Git UX level -->
        <div>
          <p class="text-xs font-medium text-app-muted uppercase mb-1">Git UI Level</p>
          <div class="inline-flex items-center gap-1 rounded-md border border-gray-200/50 dark:border-gray-700/50 p-1">
            <Button
              label="Beginner"
              size="xs"
              :variant="gitUxLevel === 'beginner' ? 'solid' : 'ghost'"
              :color="gitUxLevel === 'beginner' ? 'primary' : 'neutral'"
              @click="gitUxLevel = 'beginner'"
            />
            <Button
              label="Pro"
              size="xs"
              :variant="gitUxLevel === 'pro' ? 'solid' : 'ghost'"
              :color="gitUxLevel === 'pro' ? 'primary' : 'neutral'"
              @click="gitUxLevel = 'pro'"
            />
          </div>
          <p class="text-xs text-app-muted mt-1">
            <template v-if="gitUxLevel === 'beginner'">Shows Git terms with plain-language explanations.</template>
            <template v-else>Shows compact Git terms for experienced users.</template>
          </p>
        </div>

        <!-- Repository path -->
        <div>
          <p class="text-xs font-medium text-app-muted uppercase mb-1">Local Path</p>
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-folder" class="size-3.5 text-app-muted shrink-0" />
            <code class="text-xs text-app truncate" :title="currentRepo.path">{{ currentRepo.path }}</code>
          </div>
        </div>

        <!-- Remotes -->
        <div>
          <p class="text-xs font-medium text-app-muted uppercase mb-1">Remotes</p>
          <div v-if="gitRepo.state.remotes.length > 0" class="space-y-2">
            <div
              v-for="remote in gitRepo.state.remotes"
              :key="remote.name"
              class="rounded bg-white/20 dark:bg-white/5 px-3 py-2"
            >
              <div class="flex items-center gap-2 mb-1">
                <Icon name="i-lucide-globe" class="size-3.5 text-app-accent shrink-0" />
                <span class="text-xs font-medium text-app">{{ remote.name }}</span>
              </div>
              <div class="pl-5 space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs text-app-muted w-10 shrink-0">fetch</span>
                  <code class="text-xs text-app truncate" :title="remote.fetchUrl">{{ remote.fetchUrl }}</code>
                </div>
                <div v-if="remote.pushUrl !== remote.fetchUrl" class="flex items-center gap-1.5">
                  <span class="text-xs text-app-muted w-10 shrink-0">push</span>
                  <code class="text-xs text-app truncate" :title="remote.pushUrl">{{ remote.pushUrl }}</code>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="flex items-center gap-2 text-xs text-yellow-500">
            <Icon name="i-lucide-alert-circle" class="size-3.5" />
            <span>No remotes configured</span>
          </div>
        </div>

        <!-- HEAD commit -->
        <div>
          <p class="text-xs font-medium text-app-muted uppercase mb-1">HEAD</p>
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-git-commit-horizontal" class="size-3.5 text-app-muted shrink-0" />
            <code class="text-xs text-app-accent">{{ currentRepo.headCommit?.slice(0, 8) }}</code>
            <span v-if="currentRepo.hasUpstream" class="text-xs text-app-muted">
              <template v-if="gitUxLevel === 'beginner'">&middot; tracking upstream (linked remote branch)</template>
              <template v-else>&middot; tracking upstream</template>
            </span>
            <span v-else class="text-xs text-yellow-500">
              <template v-if="gitUxLevel === 'beginner'">&middot; no upstream (not linked yet)</template>
              <template v-else>&middot; no upstream</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- No local folder configured (only in multi-repo mode) -->
      <template v-if="!isSingleRepoMode && scope === 'project' && !hasLocalPath">
        <div class="flex flex-col items-center justify-center h-full text-center p-6 w-full">
          <Icon name="i-lucide-folder-x" class="size-16 text-app-muted mb-4" />
          <h2 class="text-lg font-medium text-app mb-2">No Local Folder</h2>
          <p class="text-app-muted text-sm mb-4 max-w-md">
            Configure a local folder in Code space first to use Git features.
          </p>
          <Button
            icon="i-lucide-code"
            label="Go to Code Space"
            @click="router.push({ path: '/app/code', query: { project: projectId } })"
          />
        </div>
      </template>

      <!-- No repos found (only in multi-repo mode) -->
      <template v-else-if="!isSingleRepoMode && scope === 'project' && !hasRepos && !gitRepo.state.isLoading">
        <div class="flex flex-col items-center justify-center h-full text-center p-6 w-full">
          <Icon name="i-lucide-git-branch" class="size-16 text-app-muted mb-4" />
          <h2 class="text-lg font-medium text-app mb-2">No Repositories</h2>
          <p class="text-app-muted text-sm mb-4 max-w-md">
            Create or clone repositories in Code space to start tracking changes.
          </p>
          <div class="flex gap-2">
            <Button
              icon="i-lucide-code"
              label="Go to Code Space"
              @click="router.push({ path: '/app/code', query: { project: projectId } })"
            />
            <Button
              icon="i-lucide-download"
              label="Clone Repository"
              variant="outline"
              @click="showCloneModal = true"
            />
          </div>
        </div>
      </template>

      <!-- No repos found in company scope -->
      <template v-else-if="!isSingleRepoMode && props.scope === 'company' && !hasRepos && !gitRepo.state.isLoading">
        <div class="flex flex-col items-center justify-center h-full text-center p-6 w-full">
          <Icon name="i-lucide-buildings" class="size-16 text-app-muted mb-4" />
          <h2 class="text-lg font-medium text-app mb-2">No Company Repositories Found</h2>
          <p class="text-app-muted text-sm mb-4 max-w-md">
            No repositories were discovered in accessible projects with configured local folders.
          </p>
          <Button
            icon="i-lucide-folder-open"
            label="Open Projects"
            @click="router.push('/app')"
          />
        </div>
      </template>

      <!-- Loading -->
      <template v-else-if="gitRepo.state.isLoading && !hasRepos">
        <div class="flex items-center justify-center h-full w-full">
          <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-app-muted" />
        </div>
      </template>

      <!-- Main content with optional diff panel -->
      <template v-else>
        <!-- === HISTORY VIEW: Full-width graph layout === -->
        <template v-if="viewMode === 'history'">
          <!-- Graph + commit list (takes full width, or shares with detail panel) -->
          <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-gray-200/50 dark:border-gray-700/50': selectedCommitData }">
            <!-- Search results indicator -->
            <div v-if="searchResults" class="px-3 py-2 border-b border-gray-200/50 dark:border-gray-700/50 bg-yellow-50 dark:bg-yellow-900/10 flex items-center justify-between shrink-0">
              <span class="text-xs text-app-muted">
                {{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }} found
              </span>
              <Button
                label="Clear"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="searchResults = null"
              />
            </div>
            <GitCommitList
              :commits="displayedCommits"
              :selected-hash="selectedCommitHash"
              :has-more="searchResults ? false : gitRepo.state.historyHasMore"
              :is-loading="gitRepo.state.isLoading"
              @select="handleCommitSelect"
              @load-more="handleLoadMoreHistory"
            />
          </div>

          <!-- Right sidebar: Commit detail + diff (only when commit selected) -->
          <div v-if="selectedCommitData" class="w-[480px] shrink-0 flex flex-col overflow-hidden">
            <GitCommitDetail
              :commit="selectedCommitData"
              :changed-files="selectedCommitFiles"
              :selected-file="selectedDiffFile?.path"
              @select-file="handleCommitFileSelect"
            />
            <GitDiffViewer
              v-if="selectedDiffFile && showDiffViewer"
              :file-path="selectedDiffFile.path"
              :original-content="diffContent?.original || ''"
              :modified-content="diffContent?.modified || ''"
              :is-binary="Boolean(diffContent?.isBinary)"
              :is-loading="isDiffLoading"
              class="flex-1"
              @close="closeDiffViewer"
            />
          </div>
        </template>

        <!-- === CHANGES / BRANCHES VIEW: Sidebar + panel layout === -->
        <template v-else>
          <!-- Left panel: File list / Branches -->
          <div class="w-80 shrink-0 flex flex-col overflow-hidden border-r border-gray-200/50 dark:border-gray-700/50">
            <!-- Changes View -->
            <template v-if="viewMode === 'changes'">
              <!-- Stash list (collapsible, above file list) -->
              <GitStashList
                v-if="stashes.length > 0"
                :stashes="stashes"
                @pop="handleStashPop"
                @apply="handleStashApply"
                @drop="handleStashDrop"
              />
              <GitFileList
                :staged-changes="gitRepo.state.stagedChanges"
                :unstaged-changes="gitRepo.state.unstagedChanges"
                :untracked-files="gitRepo.state.untrackedFiles"
                :conflicted-files="gitRepo.state.conflictedFiles"
                :is-loading="gitRepo.state.isRefreshing"
                :repo-path="currentRepo?.path"
                @stage="handleStage"
                @unstage="handleUnstage"
                @stage-all="handleStageAll"
                @unstage-all="handleUnstageAll"
                @discard="handleDiscard"
                @discard-all="handleDiscardAll"
                @resolve-mine="handleResolveMine"
                @resolve-theirs="handleResolveTheirs"
                @resolve-all-mine="handleResolveAllMine"
                @resolve-all-theirs="handleResolveAllTheirs"
                @abort-operation="handleAbortOngoingOperation"
                @select="handleFileSelect"
                @deselect="closeDiffViewer"
                @ignore-file="handleIgnoreFile"
                @ignore-folder="handleIgnoreFolder"
                @ignore-extension="handleIgnoreExtension"
                @reveal-in-finder="handleRevealInFinder"
                @open-in-editor="handleOpenInEditor"
              />
              <GitCommitForm
                :staged-count="gitRepo.state.stagedChanges.length"
                :disabled="!gitRepo.canCommit.value"
                :is-committing="gitRepo.state.isOperationInProgress && gitRepo.state.currentOperation?.includes('commit')"
                @commit="handleCommit"
                @amend="handleAmend"
              />
            </template>

            <!-- Branches View -->
            <template v-else-if="viewMode === 'branches'">
              <GitBranchList
                :local-branches="gitRepo.state.localBranches"
                :remote-branches="gitRepo.state.remoteBranches"
                :current-branch="gitRepo.state.currentBranch"
                :is-loading="gitRepo.state.isLoading"
                :is-operation-in-progress="gitRepo.state.isOperationInProgress"
                :tags="tags"
                @checkout="handleBranchCheckout"
                @create="handleBranchCreate"
                @delete="handleBranchDelete"
                @merge="handleBranchMerge"
                @refresh="gitRepo.loadBranches"
                @create-tag="handleCreateTag"
                @delete-tag="handleDeleteTag"
                @push-tag="handlePushTag"
              />
            </template>
          </div>

          <!-- Right panel: Diff viewer or empty state -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Diff viewer -->
            <GitDiffViewer
              v-if="selectedDiffFile && showDiffViewer"
              :file-path="selectedDiffFile.path"
              :original-content="diffContent?.original || ''"
              :modified-content="diffContent?.modified || ''"
              :is-binary="Boolean(diffContent?.isBinary)"
              :is-loading="isDiffLoading"
              @close="closeDiffViewer"
            />

            <!-- Empty state when no file selected -->
            <div
              v-if="!showDiffViewer"
              class="flex-1 flex flex-col items-center justify-center text-center"
            >
              <Icon name="i-lucide-file-diff" class="size-12 text-app-muted/30 mb-3" />
              <p class="text-sm text-app-muted">Select a file to view changes</p>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Status Bar -->
    <GitStatusBar
      v-if="isSingleRepoMode || hasRepos"
      :current-repo="currentRepo"
      :current-branch="gitRepo.state.currentBranch"
      :branches="gitRepo.allBranches.value"
      :ux-level="gitUxLevel"
      :sync-status="gitRepo.state.syncStatus"
      :is-operation-in-progress="gitRepo.state.isOperationInProgress"
      :current-operation="gitRepo.state.currentOperation"
      :last-error="gitRepo.state.lastError"
      :stash-count="stashes.length"
      @fetch="handleFetch"
      @pull="handlePull"
      @push="handlePush"
      @publish="handlePublishRequest"
      @checkout="handleBranchCheckout"
      @stash="handleStashSave()"
    />

    <!-- Clone Modal -->
    <GitCloneModal
      v-model="showCloneModal"
      @clone="handleClone"
    />

    <!-- Publish Modal -->
    <GitPublishModal
      v-model="showPublishModal"
      :repo-name="currentRepo?.name"
      @published="handlePublished"
    />

    <!-- Dirty Switch Modal (stash before branch switch) -->
    <Modal v-model:open="showDirtySwitchModal">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-alert-triangle" class="size-5 text-yellow-500" />
            <h3 class="text-lg font-semibold text-app">Uncommitted Changes</h3>
          </div>
          <p class="text-sm text-app-muted">
            You have uncommitted changes that would be overwritten by switching to
            <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{{ pendingSwitchBranch }}</code>.
          </p>
          <div class="flex justify-end gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              @click="showDirtySwitchModal = false; pendingSwitchBranch = null"
            />
            <Button
              label="Stash and Switch"
              icon="i-lucide-archive"
              @click="handleStashAndSwitch"
            />
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>
