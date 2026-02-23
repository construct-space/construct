/**
 * Git Repository Management Composable
 * Provides git operations via Tauri shell commands
 */
import { ref, reactive, computed, readonly, onUnmounted, getCurrentInstance } from 'vue'
import { invoke } from '@tauri-apps/api/core'

// ============================================================================
// Types
// ============================================================================

/** Git file status codes from `git status --porcelain` */
export type GitStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!' | ' '

export interface GitFileChange {
  path: string
  oldPath?: string // For renames
  indexStatus: GitStatusCode
  workTreeStatus: GitStatusCode
  staged: boolean
}

export type RepoStatus = 'clean' | 'dirty' | 'conflict' | 'unknown'

export interface GitRepository {
  name: string
  path: string
  status: RepoStatus
  currentBranch: string
  headCommit: string
  ahead: number
  behind: number
  hasUpstream: boolean
  remoteUrl?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  subject: string
  author: string
  authorEmail: string
  authorDate: Date
  committer: string
  committerEmail: string
  committerDate: Date
  parents: readonly string[]
  refs: readonly string[]
}

export interface GitBranch {
  name: string
  isLocal: boolean
  isRemote: boolean
  isCurrent: boolean
  upstream?: string
  ahead: number
  behind: number
  lastCommit?: string
}

export interface GitRemote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitFileDiff {
  path: string
  oldPath?: string
  isBinary: boolean
  additions: number
  deletions: number
  hunks: GitDiffHunk[]
}

export interface GitDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string[]
}

export interface GitDiffContent {
  original: string
  modified: string
  isBinary: boolean
}

export type GitErrorCode = 'NOT_A_REPO' | 'CONFLICT' | 'AUTH_REQUIRED' | 'NETWORK' | 'COMMAND_FAILED' | 'UNKNOWN'

export interface GitError {
  code: GitErrorCode
  message: string
  command?: string
  stderr?: string
}

export interface AuthMethods {
  gh: boolean
  ghUser?: string
  ghOrgs: string[]
  sshKeys: string[]
  gitCredentialHelper?: string
}

export interface PublishResult {
  success: boolean
  remoteUrl?: string
  error?: string
}

export type SyncStatus = 'idle' | 'fetching' | 'pulling' | 'pushing'

// ============================================================================
// State
// ============================================================================

interface GitRepoState {
  // Repository management
  repositories: Map<string, GitRepository>
  currentRepoPath: string | null

  // File changes (for current repo)
  stagedChanges: GitFileChange[]
  unstagedChanges: GitFileChange[]
  untrackedFiles: string[]
  conflictedFiles: string[]

  // Branches (for current repo)
  localBranches: GitBranch[]
  remoteBranches: GitBranch[]
  currentBranch: string

  // History (for current repo)
  commits: GitCommit[]
  historyHasMore: boolean
  historyOffset: number

  // Remotes (for current repo)
  remotes: GitRemote[]

  // Loading states
  isLoading: boolean
  isRefreshing: boolean
  isOperationInProgress: boolean
  currentOperation: string | null

  // Sync status
  syncStatus: SyncStatus

  // Error state
  lastError: GitError | null

  // Polling
  pollIntervalId: ReturnType<typeof setInterval> | null
}

// Module-level shared state
const state = reactive<GitRepoState>({
  repositories: new Map(),
  currentRepoPath: null,
  stagedChanges: [],
  unstagedChanges: [],
  untrackedFiles: [],
  conflictedFiles: [],
  localBranches: [],
  remoteBranches: [],
  currentBranch: '',
  commits: [],
  historyHasMore: false,
  historyOffset: 0,
  remotes: [],
  isLoading: false,
  isRefreshing: false,
  isOperationInProgress: false,
  currentOperation: null,
  syncStatus: 'idle',
  lastError: null,
  pollIntervalId: null,
})

// Version counter for reactivity on Map changes
const stateVersion = ref(0)

// ============================================================================
// Shell Command Helpers
// ============================================================================

interface ShellResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Execute a shell command
 */
async function runShellCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<ShellResult> {
  try {
    const result = await invoke<ShellResult>('run_shell_command', {
      command,
      args,
      cwd,
    })
    return result
  } catch (e) {
    console.error('[Git] Shell command error:', e)
    return {
      success: false,
      code: -1,
      stdout: '',
      stderr: String(e),
    }
  }
}

/**
 * Execute a git command in a repository
 * @param silent - If true, don't log errors (for expected failures like missing upstream)
 */
async function runGitCommand(repoPath: string, args: string[], silent: boolean = false): Promise<ShellResult> {
  const result = await runShellCommand('git', args, repoPath)

  if (!result.success && !silent) {
    console.error(`[Git] Command failed: git ${args.join(' ')}`)
    console.error(`[Git] stderr: ${result.stderr}`)
  }

  return result
}

/**
 * Parse error from git command
 */
function parseGitError(result: ShellResult, command: string): GitError {
  const stderr = result.stderr.toLowerCase()

  if (stderr.includes('not a git repository')) {
    return { code: 'NOT_A_REPO', message: 'Not a git repository', command, stderr: result.stderr }
  }
  if (
    stderr.includes('merge conflict') ||
    stderr.includes('unmerged') ||
    stderr.includes('resolve your current index first') ||
    stderr.includes('both modified')
  ) {
    return { code: 'CONFLICT', message: 'Merge conflicts exist', command, stderr: result.stderr }
  }
  if (stderr.includes('authentication') || stderr.includes('permission denied') || stderr.includes('could not read username')) {
    return { code: 'AUTH_REQUIRED', message: 'Authentication required', command, stderr: result.stderr }
  }
  if (stderr.includes('could not resolve') || stderr.includes('network') || stderr.includes('unable to access')) {
    return { code: 'NETWORK', message: 'Network error', command, stderr: result.stderr }
  }

  return {
    code: 'COMMAND_FAILED',
    message: result.stderr || 'Git command failed',
    command,
    stderr: result.stderr,
  }
}

// ============================================================================
// Status Parsing
// ============================================================================

/**
 * Parse `git status --porcelain=v1` output
 * Format: XY PATH or XY ORIG -> PATH (for renames)
 */
function parseGitStatus(output: string): {
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  conflicted: string[]
} {
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []
  const untracked: string[] = []
  const conflicted: string[] = []

  const lines = output.split('\n').filter(Boolean)

  for (const line of lines) {
    if (line.length < 3) continue

    const indexStatus = line[0] as GitStatusCode
    const workTreeStatus = line[1] as GitStatusCode
    const pathPart = line.slice(3)

    // Handle renames: "R  old -> new"
    let path = pathPart
    let oldPath: string | undefined
    if (pathPart.includes(' -> ')) {
      const parts = pathPart.split(' -> ')
      oldPath = parts[0]
      path = parts[1] ?? pathPart
    }

    // Untracked files
    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked.push(path)
      continue
    }

    // Conflicts (all porcelain conflict status pairs)
    const conflictPair = `${indexStatus}${workTreeStatus}`
    if (
      conflictPair === 'DD' ||
      conflictPair === 'AU' ||
      conflictPair === 'UD' ||
      conflictPair === 'UA' ||
      conflictPair === 'DU' ||
      conflictPair === 'AA' ||
      conflictPair === 'UU'
    ) {
      conflicted.push(path)
      continue
    }

    // Staged changes (index has status, not just space)
    if (indexStatus !== ' ' && indexStatus !== '?') {
      staged.push({
        path,
        oldPath,
        indexStatus,
        workTreeStatus,
        staged: true,
      })
    }

    // Unstaged changes (worktree has status, not just space)
    if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
      unstaged.push({
        path,
        oldPath,
        indexStatus,
        workTreeStatus,
        staged: false,
      })
    }
  }

  return { staged, unstaged, untracked, conflicted }
}

// ============================================================================
// History Parsing
// ============================================================================

/**
 * Parse git log output with custom format
 */
function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  // Split by null byte delimiter
  const entries = output.split('\x00').filter(Boolean)

  for (const entry of entries) {
    const lines = entry.split('\n')
    if (lines.length < 10) continue

    const [hash, shortHash, subject, author, authorEmail, authorDateStr, committer, committerEmail, committerDateStr, parentsStr, refsStr, ...bodyLines] = lines

    // Parse refs like "HEAD -> main, origin/main, tag: v1.0"
    const refs = (refsStr || '').split(',')
      .map(r => r.trim())
      .filter(Boolean)

    commits.push({
      hash: hash || '',
      shortHash: shortHash || '',
      message: [subject, '', ...bodyLines].join('\n').trim(),
      subject: subject || '',
      author: author || '',
      authorEmail: authorEmail || '',
      authorDate: new Date(authorDateStr || 0),
      committer: committer || '',
      committerEmail: committerEmail || '',
      committerDate: new Date(committerDateStr || 0),
      parents: (parentsStr || '').split(' ').filter(Boolean),
      refs,
    })
  }

  return commits
}

// ============================================================================
// Branch Parsing
// ============================================================================

/**
 * Parse git branch output
 */
function parseBranches(
  localOutput: string,
  remoteOutput: string
): { local: GitBranch[]; remote: GitBranch[] } {
  const local: GitBranch[] = []
  const remote: GitBranch[] = []

  // Parse local branches
  for (const line of localOutput.split('\n').filter(Boolean)) {
    const isCurrent = line.startsWith('*')
    const name = line.replace(/^\*?\s+/, '').trim()
    if (!name || name.startsWith('(HEAD detached')) continue

    local.push({
      name,
      isLocal: true,
      isRemote: false,
      isCurrent,
      ahead: 0,
      behind: 0,
    })
  }

  // Parse remote branches
  for (const line of remoteOutput.split('\n').filter(Boolean)) {
    const trimmed = line.trim()
    // Skip symbolic refs like: origin/HEAD -> origin/main
    if (!trimmed || trimmed.includes(' -> ')) continue

    const name = trimmed.replace(/^origin\//, '')
    if (!name || name === 'HEAD') continue

    remote.push({
      name,
      isLocal: false,
      isRemote: true,
      isCurrent: false,
      upstream: `origin/${name}`,
      ahead: 0,
      behind: 0,
    })
  }

  return { local, remote }
}

function parseUpstreamTrack(track: string): { ahead: number; behind: number } {
  const normalized = (track || '').trim()
  if (!normalized || normalized === '[gone]') {
    return { ahead: 0, behind: 0 }
  }

  const aheadMatch = normalized.match(/ahead (\d+)/)
  const behindMatch = normalized.match(/behind (\d+)/)

  return {
    ahead: parseInt(aheadMatch?.[1] || '0', 10),
    behind: parseInt(behindMatch?.[1] || '0', 10),
  }
}

// ============================================================================
// Diff Parsing
// ============================================================================

/**
 * Parse unified diff output
 */
function parseDiff(output: string): GitFileDiff[] {
  const diffs: GitFileDiff[] = []
  const fileChunks = output.split(/^diff --git /m).filter(Boolean)

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n')

    // Parse header: a/path b/path
    const headerMatch = lines[0]?.match(/a\/(.+)\s+b\/(.+)/)
    if (!headerMatch) continue

    const oldPath = headerMatch[1] ?? ''
    const newPath = headerMatch[2] ?? ''
    const isBinary = lines.some(l => l.includes('Binary files'))

    const hunks: GitDiffHunk[] = []
    let currentHunk: GitDiffHunk | null = null
    let additions = 0
    let deletions = 0

    for (const line of lines) {
      // Hunk header: @@ -start,count +start,count @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk)
        currentHunk = {
          oldStart: parseInt(hunkMatch[1] ?? '1', 10),
          oldLines: parseInt(hunkMatch[2] ?? '1', 10),
          newStart: parseInt(hunkMatch[3] ?? '1', 10),
          newLines: parseInt(hunkMatch[4] ?? '1', 10),
          content: [],
        }
        continue
      }

      if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunk.content.push(line)
        if (line.startsWith('+') && !line.startsWith('+++')) additions++
        if (line.startsWith('-') && !line.startsWith('---')) deletions++
      }
    }

    if (currentHunk) hunks.push(currentHunk)

    diffs.push({
      path: newPath,
      oldPath: oldPath !== newPath ? oldPath : undefined,
      isBinary,
      hunks,
      additions,
      deletions,
    })
  }

  return diffs
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Discover repositories in a directory
 */
async function discoverRepositories(codePath: string): Promise<GitRepository[]> {
  const repos: GitRepository[] = []

  // List directories in code/
  const listResult = await runShellCommand('ls', ['-1'], codePath)
  if (!listResult.success) return repos

  const dirs = listResult.stdout.split('\n').filter(Boolean)

  for (const dir of dirs) {
    const repoPath = `${codePath}/${dir}`

    // Check if it's a git repo
    const gitCheck = await runGitCommand(repoPath, ['rev-parse', '--git-dir'])
    if (!gitCheck.success) continue

    // Get repo info
    const repo = await getRepositoryInfo(repoPath)
    if (repo) {
      repos.push(repo)
      state.repositories.set(repoPath, repo)
    }
  }

  stateVersion.value++
  return repos
}

/**
 * Get detailed info about a repository
 */
async function getRepositoryInfo(repoPath: string): Promise<GitRepository | null> {
  // Get current branch (may be empty for new repos or detached HEAD)
  const branchResult = await runGitCommand(repoPath, ['branch', '--show-current'])
  let currentBranch = branchResult.success ? branchResult.stdout.trim() : ''

  // If no branch, check if we're in detached HEAD or new repo
  if (!currentBranch) {
    // Try to get symbolic ref (silent - expected to fail for detached HEAD)
    const symbolicRef = await runGitCommand(repoPath, ['symbolic-ref', '--short', 'HEAD'], true)
    if (symbolicRef.success) {
      currentBranch = symbolicRef.stdout.trim()
    } else {
      // Detached HEAD or new repo - try to get any ref (silent)
      const headRef = await runGitCommand(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'], true)
      currentBranch = headRef.success ? headRef.stdout.trim() : '(no branch)'
    }
  }

  // Default to 'main' indicator for new repos
  if (!currentBranch || currentBranch === 'HEAD') {
    currentBranch = '(new repo)'
  }

  // Get HEAD commit (may fail for new repos with no commits - silent)
  const headResult = await runGitCommand(repoPath, ['rev-parse', '--short', 'HEAD'], true)
  const headCommit = headResult.success ? headResult.stdout.trim() : ''

  // Check status (clean/dirty)
  const statusResult = await runGitCommand(repoPath, ['status', '--porcelain'])
  let status: RepoStatus = 'unknown'
  if (statusResult.success) {
    const parsedStatus = parseGitStatus(statusResult.stdout)
    const hasChanges = statusResult.stdout.trim().length > 0
    const hasConflicts = parsedStatus.conflicted.length > 0
    status = hasConflicts ? 'conflict' : hasChanges ? 'dirty' : 'clean'
  }

  // Get ahead/behind (only if we have commits and an upstream - silent, may not exist)
  let ahead = 0
  let behind = 0
  let hasUpstream = false
  if (headCommit) {
    // Only check upstream if we have commits
    const upstreamResult = await runGitCommand(repoPath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], true)
    if (upstreamResult.success) {
      hasUpstream = true
      const parts = upstreamResult.stdout.trim().split(/\s+/)
      behind = parseInt(parts[0] || '0', 10)
      ahead = parseInt(parts[1] || '0', 10)
    }
  }

  // Get remote URL (silent - remote may not exist)
  const remoteResult = await runGitCommand(repoPath, ['remote', 'get-url', 'origin'], true)
  const remoteUrl = remoteResult.success ? remoteResult.stdout.trim() : undefined

  return {
    name: repoPath.split('/').pop() || '',
    path: repoPath,
    status,
    currentBranch,
    headCommit,
    ahead,
    behind,
    hasUpstream,
    remoteUrl,
  }
}

/**
 * Refresh status for current repository
 */
async function refreshStatus(): Promise<void> {
  if (!state.currentRepoPath) return

  state.isRefreshing = true

  try {
    const result = await runGitCommand(state.currentRepoPath, ['status', '--porcelain=v1'])

    if (!result.success) {
      state.lastError = parseGitError(result, 'status')
      return
    }

    const { staged, unstaged, untracked, conflicted } = parseGitStatus(result.stdout)

    state.stagedChanges = staged
    state.unstagedChanges = unstaged
    state.untrackedFiles = untracked
    state.conflictedFiles = conflicted
    state.lastError = null

    // Update repo info
    const repo = await getRepositoryInfo(state.currentRepoPath)
    if (repo) {
      state.repositories.set(state.currentRepoPath, repo)
      state.currentBranch = repo.currentBranch
    }

    stateVersion.value++
  } finally {
    state.isRefreshing = false
  }
}

// ============================================================================
// Staging Operations
// ============================================================================

/**
 * Stage specific file(s)
 */
async function stageFiles(paths: string[]): Promise<boolean> {
  if (!state.currentRepoPath || paths.length === 0) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Staging files...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['add', '--', ...paths])

    if (!result.success) {
      state.lastError = parseGitError(result, 'add')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Unstage specific file(s)
 */
async function unstageFiles(paths: string[]): Promise<boolean> {
  if (!state.currentRepoPath || paths.length === 0) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Unstaging files...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['reset', 'HEAD', '--', ...paths])

    if (!result.success) {
      state.lastError = parseGitError(result, 'reset')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Stage all changes
 */
async function stageAll(): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Staging all changes...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['add', '-A'])

    if (!result.success) {
      state.lastError = parseGitError(result, 'add -A')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Unstage all changes
 */
async function unstageAll(): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Unstaging all changes...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['reset', 'HEAD'])

    if (!result.success) {
      state.lastError = parseGitError(result, 'reset HEAD')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Discard changes in working directory for specific file(s)
 */
async function discardChanges(paths: string[]): Promise<boolean> {
  if (!state.currentRepoPath || paths.length === 0) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Discarding changes...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['checkout', '--', ...paths])

    if (!result.success) {
      state.lastError = parseGitError(result, 'checkout')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Discard all unstaged changes
 */
async function discardAllChanges(): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Discarding all changes...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['checkout', '--', '.'])

    if (!result.success) {
      state.lastError = parseGitError(result, 'checkout .')
      return false
    }

    // Also clean untracked files
    await runGitCommand(state.currentRepoPath, ['clean', '-fd'])

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Resolve a conflicted file by choosing ours/theirs and staging it.
 */
async function resolveConflict(path: string, strategy: 'ours' | 'theirs'): Promise<boolean> {
  if (!state.currentRepoPath || !path) return false

  state.isOperationInProgress = true
  state.currentOperation = strategy === 'ours'
    ? `Resolving conflict (use mine): ${path}`
    : `Resolving conflict (use theirs): ${path}`

  try {
    // Write selected side into working tree
    let checkoutResult = await runGitCommand(state.currentRepoPath, ['checkout', `--${strategy}`, '--', path], true)
    if (!checkoutResult.success) {
      // Fallback for newer git flows where restore behaves better
      checkoutResult = await runGitCommand(state.currentRepoPath, ['restore', `--${strategy}`, '--worktree', '--', path], true)
      if (!checkoutResult.success) {
        state.lastError = parseGitError(checkoutResult, `resolve conflict --${strategy}`)
        return false
      }
    }

    // Mark file as resolved
    const addResult = await runGitCommand(state.currentRepoPath, ['add', '--', path])
    if (!addResult.success) {
      state.lastError = parseGitError(addResult, 'add')
      return false
    }

    await refreshStatus()

    // Guard: only report success when this file is no longer conflicted
    if (state.conflictedFiles.includes(path)) {
      state.lastError = {
        code: 'CONFLICT',
        message: `Conflict is not fully resolved for ${path}. Open file and resolve markers manually, then stage it.`,
        command: `resolve conflict --${strategy}`,
      }
      return false
    }

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

async function resolveConflictUseMine(path: string): Promise<boolean> {
  return resolveConflict(path, 'ours')
}

async function resolveConflictUseTheirs(path: string): Promise<boolean> {
  return resolveConflict(path, 'theirs')
}

// ============================================================================
// Commit Operations
// ============================================================================

/**
 * Create a commit
 */
async function createCommit(message: string): Promise<boolean> {
  if (!state.currentRepoPath || !message.trim()) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Creating commit...'

  try {
    const result = await runGitCommand(state.currentRepoPath, ['commit', '-m', message])

    if (!result.success) {
      state.lastError = parseGitError(result, 'commit')
      return false
    }

    await refreshStatus()
    await loadHistory(0, 20)
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Amend the last commit
 */
async function amendCommit(message?: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Amending commit...'

  try {
    const args = message
      ? ['commit', '--amend', '-m', message]
      : ['commit', '--amend', '--no-edit']

    const result = await runGitCommand(state.currentRepoPath, args)

    if (!result.success) {
      state.lastError = parseGitError(result, 'commit --amend')
      return false
    }

    await refreshStatus()
    await loadHistory(0, 20)
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// History Operations
// ============================================================================

/**
 * Load commit history with pagination
 */
async function loadHistory(offset: number = 0, limit: number = 50): Promise<{ commits: GitCommit[]; hasMore: boolean }> {
  if (!state.currentRepoPath) {
    return { commits: [], hasMore: false }
  }

  state.isLoading = true

  try {
    // Custom format: hash, short hash, subject, author, email, date, committer, email, date, parents, body
    const format = '%H%n%h%n%s%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%P%n%D%n%b%x00'

    const result = await runGitCommand(state.currentRepoPath, [
      'log',
      `--format=${format}`,
      `--skip=${offset}`,
      `-n`,
      `${limit + 1}`, // Get one extra to check hasMore
    ])

    if (!result.success) {
      const stderr = result.stderr.toLowerCase()
      if (
        stderr.includes('does not have any commits yet') ||
        (stderr.includes('your current branch') && stderr.includes('does not have any commits yet')) ||
        stderr.includes('fatal: bad default revision')
      ) {
        // New repository with no commits yet.
        if (offset === 0) {
          state.commits = []
          state.historyHasMore = false
          state.historyOffset = 0
          state.lastError = null
          stateVersion.value++
        }
        return { commits: [], hasMore: false }
      }

      state.lastError = parseGitError(result, 'log')
      return { commits: [], hasMore: false }
    }

    const allCommits = parseGitLog(result.stdout)
    const hasMore = allCommits.length > limit
    const commits = allCommits.slice(0, limit)

    if (offset === 0) {
      state.commits = commits
    } else {
      state.commits.push(...commits)
    }

    state.historyHasMore = hasMore
    state.historyOffset = offset + commits.length
    stateVersion.value++

    return { commits, hasMore }
  } finally {
    state.isLoading = false
  }
}

/**
 * Get details for a specific commit
 */
async function getCommitDetails(hash: string): Promise<GitCommit | null> {
  if (!state.currentRepoPath) return null

  const format = '%H%n%h%n%s%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%P%n%D%n%b%x00'
  const result = await runGitCommand(state.currentRepoPath, ['log', '-1', `--format=${format}`, hash])

  if (!result.success) {
    state.lastError = parseGitError(result, 'log')
    return null
  }

  const commits = parseGitLog(result.stdout)
  return commits[0] || null
}

// ============================================================================
// Branch Operations
// ============================================================================

/**
 * Load all branches
 */
async function loadBranches(): Promise<void> {
  if (!state.currentRepoPath) return

  state.isLoading = true

  try {
    const [localResult, remoteResult] = await Promise.all([
      runGitCommand(state.currentRepoPath, ['branch']),
      runGitCommand(state.currentRepoPath, ['branch', '-r']),
    ])

    const { local, remote } = parseBranches(
      localResult.success ? localResult.stdout : '',
      remoteResult.success ? remoteResult.stdout : ''
    )

    // Populate upstream and ahead/behind for local branches.
    const trackingResult = await runGitCommand(
      state.currentRepoPath,
      ['for-each-ref', '--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)', 'refs/heads'],
      true
    )
    const trackingByBranch = new Map<string, { upstream?: string; ahead: number; behind: number }>()
    if (trackingResult.success) {
      for (const line of trackingResult.stdout.split('\n').filter(Boolean)) {
        const [name, upstream, track] = line.split('\t')
        if (!name) continue
        const { ahead, behind } = parseUpstreamTrack(track || '')
        trackingByBranch.set(name, {
          upstream: upstream || undefined,
          ahead,
          behind,
        })
      }
    }

    for (const branch of local) {
      const track = trackingByBranch.get(branch.name)
      if (!track) continue
      branch.upstream = track.upstream
      branch.ahead = track.ahead
      branch.behind = track.behind
    }

    state.localBranches = local
    state.remoteBranches = remote
    state.currentBranch = local.find(b => b.isCurrent)?.name || ''
    stateVersion.value++
  } finally {
    state.isLoading = false
  }
}

/**
 * Create a new branch
 */
async function createBranch(name: string, checkout: boolean = true): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Creating branch ${name}...`

  try {
    const args = checkout ? ['checkout', '-b', name] : ['branch', name]
    const result = await runGitCommand(state.currentRepoPath, args)

    if (!result.success) {
      state.lastError = parseGitError(result, args.join(' '))
      return false
    }

    await loadBranches()
    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Switch to a branch
 */
async function checkoutBranch(name: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Switching to ${name}...`

  try {
    let result = await runGitCommand(state.currentRepoPath, ['checkout', name], true)

    // If no local branch exists yet, try tracking origin/<name>.
    if (
      !result.success &&
      !name.includes('/') &&
      (
        result.stderr.toLowerCase().includes('did not match any file') ||
        result.stderr.toLowerCase().includes('pathspec')
      )
    ) {
      const trackingResult = await runGitCommand(state.currentRepoPath, ['checkout', '--track', `origin/${name}`], true)
      if (trackingResult.success) {
        result = trackingResult
      }
    }

    if (!result.success) {
      state.lastError = parseGitError(result, `checkout ${name}`)
      return false
    }

    await loadBranches()
    await refreshStatus()
    await loadHistory(0, 50)
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Delete a branch
 */
async function deleteBranch(name: string, force: boolean = false): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Deleting branch ${name}...`

  try {
    const flag = force ? '-D' : '-d'
    const result = await runGitCommand(state.currentRepoPath, ['branch', flag, name])

    if (!result.success) {
      state.lastError = parseGitError(result, `branch ${flag} ${name}`)
      return false
    }

    await loadBranches()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Merge a branch into current
 */
async function mergeBranch(name: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Merging ${name}...`

  try {
    const result = await runGitCommand(state.currentRepoPath, ['merge', name])

    if (!result.success) {
      state.lastError = parseGitError(result, `merge ${name}`)
      return false
    }

    await refreshStatus()
    await loadHistory(0, 50)
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// Remote Operations
// ============================================================================

/**
 * Fetch from remotes
 */
async function fetch(remote: string = '--all', prune: boolean = true): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.syncStatus = 'fetching'
  state.currentOperation = 'Fetching...'

  try {
    const args = ['fetch', remote]
    if (prune) args.push('--prune')

    const result = await runGitCommand(state.currentRepoPath, args)

    if (!result.success) {
      state.lastError = parseGitError(result, args.join(' '))
      return false
    }

    await loadBranches()
    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.syncStatus = 'idle'
    state.currentOperation = null
  }
}

/**
 * Pull from upstream
 */
async function pull(rebase: boolean = false): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.syncStatus = 'pulling'
  state.currentOperation = 'Pulling...'

  try {
    const args = rebase ? ['pull', '--rebase'] : ['pull']
    const result = await runGitCommand(state.currentRepoPath, args)

    if (!result.success) {
      state.lastError = parseGitError(result, args.join(' '))
      return false
    }

    await refreshStatus()
    await loadHistory(0, 50)
    return true
  } finally {
    state.isOperationInProgress = false
    state.syncStatus = 'idle'
    state.currentOperation = null
  }
}

/**
 * Push to upstream
 */
async function push(setUpstream: boolean = false, force: boolean = false): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.syncStatus = 'pushing'
  state.currentOperation = 'Pushing...'

  try {
    const args = ['push']
    if (setUpstream) args.push('-u', 'origin', state.currentBranch)
    if (force) args.push('--force-with-lease') // Safer than --force

    const result = await runGitCommand(state.currentRepoPath, args)

    if (!result.success) {
      state.lastError = parseGitError(result, args.join(' '))
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.syncStatus = 'idle'
    state.currentOperation = null
  }
}

/**
 * Load remotes
 */
async function loadRemotes(): Promise<void> {
  if (!state.currentRepoPath) return

  const result = await runGitCommand(state.currentRepoPath, ['remote', '-v'])
  if (!result.success) return

  const remotes: Map<string, GitRemote> = new Map()

  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue

    const name = match[1] ?? ''
    const url = match[2] ?? ''
    const type = match[3]

    if (!remotes.has(name)) {
      remotes.set(name, { name, fetchUrl: '', pushUrl: '' })
    }

    const remote = remotes.get(name)
    if (remote) {
      if (type === 'fetch') remote.fetchUrl = url
      if (type === 'push') remote.pushUrl = url
    }
  }

  state.remotes = Array.from(remotes.values())
  stateVersion.value++
}

// ============================================================================
// Diff Operations
// ============================================================================

/**
 * Get diff for unstaged changes
 */
async function getUnstagedDiff(path?: string): Promise<GitFileDiff[]> {
  if (!state.currentRepoPath) return []

  const args = ['diff']
  if (path) args.push('--', path)

  const result = await runGitCommand(state.currentRepoPath, args)

  if (!result.success) {
    state.lastError = parseGitError(result, args.join(' '))
    return []
  }

  return parseDiff(result.stdout)
}

/**
 * Get diff for staged changes
 */
async function getStagedDiff(path?: string): Promise<GitFileDiff[]> {
  if (!state.currentRepoPath) return []

  const args = ['diff', '--cached']
  if (path) args.push('--', path)

  const result = await runGitCommand(state.currentRepoPath, args)

  if (!result.success) {
    state.lastError = parseGitError(result, args.join(' '))
    return []
  }

  return parseDiff(result.stdout)
}

/**
 * Get diff between commits
 * Uses diff-tree for single commits to handle root commits safely
 * (root commits have no parent, so `git diff hash^ hash` crashes)
 */
async function getCommitDiff(fromHash: string, toHash?: string): Promise<GitFileDiff[]> {
  if (!state.currentRepoPath) return []

  const args = toHash
    ? ['diff', fromHash, toHash]
    : ['diff-tree', '--root', '-r', '--no-commit-id', '-p', fromHash]

  const result = await runGitCommand(state.currentRepoPath, args)

  if (!result.success) {
    state.lastError = parseGitError(result, args.join(' '))
    return []
  }

  return parseDiff(result.stdout)
}

/**
 * Get file content at a specific ref
 * @param ref - Git ref: HEAD, :0 (index), commit SHA, etc.
 */
async function getFileContent(filePath: string, ref: string): Promise<string | null> {
  if (!state.currentRepoPath) return null

  const result = await runGitCommand(state.currentRepoPath, ['show', `${ref}:${filePath}`])

  if (!result.success) {
    // File might not exist at this ref (new file)
    return null
  }

  return result.stdout
}

/**
 * Read a file from working tree.
 * Uses Tauri fs first, then shell `cat` as fallback.
 */
async function getWorkingTreeFileContent(filePath: string): Promise<string | null> {
  if (!state.currentRepoPath) return null

  try {
    const tauriFs = await import('@tauri-apps/plugin-fs')
    const fullPath = `${state.currentRepoPath}/${filePath}`
    const content = await tauriFs.readTextFile(fullPath)
    return content
  } catch {
    // Fallback for environments where fs plugin path access fails.
    const catResult = await runShellCommand('cat', [filePath], state.currentRepoPath)
    if (catResult.success) {
      return catResult.stdout
    }
    return null
  }
}

/**
 * Check whether a file diff is binary.
 * Uses --numstat, which reports binary changes as "-\t-".
 */
async function isBinaryDiff(
  filePath: string,
  type: 'staged' | 'unstaged' | 'commit',
  commitHash?: string
): Promise<boolean> {
  if (!state.currentRepoPath) return false

  let args: string[] | null = null
  if (type === 'unstaged') {
    args = ['diff', '--numstat', '--', filePath]
  } else if (type === 'staged') {
    args = ['diff', '--cached', '--numstat', '--', filePath]
  } else if (type === 'commit' && commitHash) {
    args = ['show', '--format=', '--numstat', commitHash, '--', filePath]
  }

  if (!args) return false

  const result = await runGitCommand(state.currentRepoPath, args, true)
  if (!result.success || !result.stdout.trim()) return false

  return result.stdout
    .split('\n')
    .some((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const [added, deleted] = trimmed.split('\t')
      return added === '-' && deleted === '-'
    })
}

/**
 * Get diff content for Monaco DiffEditor
 * Returns original and modified content for a file
 */
async function getDiffContent(
  filePath: string,
  type: 'staged' | 'unstaged' | 'commit',
  commitHash?: string
): Promise<GitDiffContent | null> {
  if (!state.currentRepoPath) return null

  const binary = await isBinaryDiff(filePath, type, commitHash)
  if (binary) {
    return {
      original: '',
      modified: '',
      isBinary: true,
    }
  }

  let original: string | null = null
  let modified: string | null = null

  if (type === 'unstaged') {
    // Original = index (:0), Modified = working tree (read from fs)
    original = await getFileContent(filePath, ':0')
    modified = await getWorkingTreeFileContent(filePath)
  } else if (type === 'staged') {
    // Original = HEAD, Modified = index (:0)
    original = await getFileContent(filePath, 'HEAD')
    modified = await getFileContent(filePath, ':0')
  } else if (type === 'commit' && commitHash) {
    // Original = parent commit, Modified = commit
    original = await getFileContent(filePath, `${commitHash}^`)
    modified = await getFileContent(filePath, commitHash)
  }

  return {
    original: original || '',
    modified: modified || '',
    isBinary: false,
  }
}

// ============================================================================
// Polling
// ============================================================================

/**
 * Start polling for status changes
 */
function startPolling(intervalMs: number = 5000): void {
  stopPolling()

  state.pollIntervalId = setInterval(async () => {
    if (state.isOperationInProgress) return
    await refreshStatus()
  }, intervalMs)
}

/**
 * Stop polling
 */
function stopPolling(): void {
  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId)
    state.pollIntervalId = null
  }
}

// ============================================================================
// Repository Selection
// ============================================================================

/**
 * Select a repository to work with
 */
async function selectRepository(repoPath: string): Promise<void> {
  state.currentRepoPath = repoPath
  state.lastError = null

  // Load all data for this repo
  await Promise.all([
    refreshStatus(),
    loadBranches(),
    loadHistory(0, 50),
    loadRemotes(),
  ])

  // Start auto-polling for status changes (30s)
  startPolling(30000)
}

/**
 * Deselect current repository
 */
function deselectRepository(): void {
  stopPolling()
  state.currentRepoPath = null
  state.stagedChanges = []
  state.unstagedChanges = []
  state.untrackedFiles = []
  state.conflictedFiles = []
  state.localBranches = []
  state.remoteBranches = []
  state.commits = []
  state.remotes = []
  state.currentBranch = ''
  stateVersion.value++
}

/**
 * Clear all discovered repositories and reset current selection/state.
 * Useful when switching scope (project -> company, etc).
 */
function clearDiscoveredRepositories(): void {
  stopPolling()
  state.repositories.clear()
  deselectRepository()
  stateVersion.value++
}

// ============================================================================
// Clone
// ============================================================================

/**
 * Clone a repository into targetDir
 */
async function cloneRepository(url: string, targetDir: string, name?: string): Promise<boolean> {
  state.isOperationInProgress = true
  state.currentOperation = 'Cloning repository...'

  try {
    const args = ['clone', url]
    if (name) args.push(name)

    const result = await runGitCommand(targetDir, args)

    if (!result.success) {
      state.lastError = parseGitError(result, 'clone')
      return false
    }

    // Determine the cloned directory name
    const repoName = name || url.split('/').pop()?.replace(/\.git$/, '') || ''
    const clonedPath = `${targetDir}/${repoName}`

    // Re-discover repos and select the new one
    await discoverRepositories(targetDir)
    await selectRepository(clonedPath)

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search commits by message, author, or hash
 */
async function searchCommits(
  query: string,
  type: 'message' | 'author' | 'hash' = 'message'
): Promise<GitCommit[]> {
  if (!state.currentRepoPath || !query.trim()) return []

  const format = '%H%n%h%n%s%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%P%n%D%n%b%x00'

  let args: string[]
  if (type === 'hash') {
    // Direct hash lookup
    args = ['log', '-1', `--format=${format}`, query.trim()]
  } else if (type === 'author') {
    args = ['log', `--format=${format}`, `--author=${query.trim()}`, '-n', '50']
  } else {
    args = ['log', `--format=${format}`, `--grep=${query.trim()}`, '--regexp-ignore-case', '-n', '50']
  }

  const result = await runGitCommand(state.currentRepoPath, args, true)
  if (!result.success) return []

  return parseGitLog(result.stdout)
}

// ============================================================================
// Stash Operations
// ============================================================================

export interface GitStash {
  index: number
  message: string
  branch: string
  date: string
}

export interface GitStashSaveResult {
  success: boolean
  created: boolean
  stashRef?: string
}

/**
 * List stashes
 */
async function stashList(): Promise<GitStash[]> {
  if (!state.currentRepoPath) return []

  const result = await runGitCommand(state.currentRepoPath, [
    'stash', 'list', '--format=%gd%n%gs%n%aI'
  ], true)

  if (!result.success || !result.stdout.trim()) return []

  const stashes: GitStash[] = []
  const lines = result.stdout.trim().split('\n')

  for (let i = 0; i < lines.length; i += 3) {
    const refLine = lines[i] || ''
    const messageLine = lines[i + 1] || ''
    const dateLine = lines[i + 2] || ''

    const indexMatch = refLine.match(/stash@\{(\d+)\}/)
    const index = indexMatch ? parseInt(indexMatch[1] || '0', 10) : stashes.length

    // Extract branch from message like "WIP on main: abc1234 commit msg"
    const branchMatch = messageLine.match(/on\s+([^:]+):/)
    const branch = branchMatch ? branchMatch[1] || '' : ''

    stashes.push({
      index,
      message: messageLine,
      branch,
      date: dateLine,
    })
  }

  return stashes
}

/**
 * Stash save (push) with optional message
 */
async function stashSaveDetailed(
  message?: string,
  options?: { includeUntracked?: boolean }
): Promise<GitStashSaveResult> {
  if (!state.currentRepoPath) return { success: false, created: false }

  state.isOperationInProgress = true
  state.currentOperation = 'Stashing changes...'

  try {
    const before = await stashList()
    const args = ['stash', 'push']
    if (options?.includeUntracked) args.push('--include-untracked')
    if (message) args.push('-m', message)

    const result = await runGitCommand(state.currentRepoPath, args)
    if (!result.success) {
      state.lastError = parseGitError(result, 'stash push')
      return { success: false, created: false }
    }

    const stdoutAndStderr = `${result.stdout}\n${result.stderr}`.toLowerCase()
    const noLocalChanges = stdoutAndStderr.includes('no local changes to save')
    const after = await stashList()
    const created = !noLocalChanges && after.length > before.length

    await refreshStatus()
    return {
      success: true,
      created,
      stashRef: created ? 'stash@{0}' : undefined,
    }
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

async function stashSave(message?: string, options?: { includeUntracked?: boolean }): Promise<boolean> {
  const result = await stashSaveDetailed(message, options)
  return result.success
}

/**
 * Pop a stash
 */
async function stashPop(index?: number): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Popping stash...'

  try {
    const args = ['stash', 'pop']
    if (index !== undefined) args.push(`stash@{${index}}`)

    const result = await runGitCommand(state.currentRepoPath, args)
    if (!result.success) {
      state.lastError = parseGitError(result, 'stash pop')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Apply a stash (without removing it)
 */
async function stashApply(index?: number): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Applying stash...'

  try {
    const args = ['stash', 'apply']
    if (index !== undefined) args.push(`stash@{${index}}`)

    const result = await runGitCommand(state.currentRepoPath, args)
    if (!result.success) {
      state.lastError = parseGitError(result, 'stash apply')
      return false
    }

    await refreshStatus()
    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Drop a stash entry
 */
async function stashDrop(index?: number): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Dropping stash...'

  try {
    const args = ['stash', 'drop']
    if (index !== undefined) args.push(`stash@{${index}}`)

    const result = await runGitCommand(state.currentRepoPath, args)
    if (!result.success) {
      state.lastError = parseGitError(result, 'stash drop')
      return false
    }

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// Tag Operations
// ============================================================================

export interface GitTag {
  name: string
  message?: string
  hash: string
  date: string
  isAnnotated: boolean
}

/**
 * Load tags
 */
async function loadTags(): Promise<GitTag[]> {
  if (!state.currentRepoPath) return []

  const result = await runGitCommand(state.currentRepoPath, [
    'tag', '-l', '--format=%(refname:short)%09%(objecttype)%09%(creatordate:iso-strict)%09%(*objectname:short)%(objectname:short)%09%(contents:subject)'
  ], true)

  if (!result.success || !result.stdout.trim()) return []

  const tags: GitTag[] = []
  for (const line of result.stdout.trim().split('\n')) {
    if (!line) continue
    const [name, type, date, hash, message] = line.split('\t')
    if (!name) continue

    tags.push({
      name,
      message: message || undefined,
      hash: hash || '',
      date: date || '',
      isAnnotated: type === 'tag',
    })
  }

  return tags.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Create a tag
 */
async function createTag(name: string, message?: string, hash?: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Creating tag ${name}...`

  try {
    const args = ['tag']
    if (message) {
      args.push('-a', name, '-m', message)
    } else {
      args.push(name)
    }
    if (hash) args.push(hash)

    const result = await runGitCommand(state.currentRepoPath, args)
    if (!result.success) {
      state.lastError = parseGitError(result, 'tag')
      return false
    }

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Delete a tag
 */
async function deleteTag(name: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Deleting tag ${name}...`

  try {
    const result = await runGitCommand(state.currentRepoPath, ['tag', '-d', name])
    if (!result.success) {
      state.lastError = parseGitError(result, 'tag -d')
      return false
    }

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Push a tag to remote
 */
async function pushTag(name: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = `Pushing tag ${name}...`

  try {
    const result = await runGitCommand(state.currentRepoPath, ['push', 'origin', name])
    if (!result.success) {
      state.lastError = parseGitError(result, 'push tag')
      return false
    }

    return true
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// Gitignore Management
// ============================================================================

/**
 * Add a pattern to .gitignore
 */
async function addToGitignore(pattern: string): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Updating .gitignore'

  try {
    const tauriFs = await import('@tauri-apps/plugin-fs')
    const gitignorePath = `${state.currentRepoPath}/.gitignore`

    // Read existing gitignore content
    let existingContent = ''
    try {
      existingContent = await tauriFs.readTextFile(gitignorePath)
    } catch {
      const readResult = await runShellCommand('cat', ['.gitignore'], state.currentRepoPath)
      existingContent = readResult.success ? readResult.stdout : ''
    }

    // Check if pattern already exists
    const lines = existingContent.split('\n')
    if (lines.some(line => line.trim() === pattern)) {
      return true // Already in gitignore
    }

    // Append the new pattern
    const newContent = existingContent.trim()
      ? existingContent.trim() + '\n' + pattern + '\n'
      : pattern + '\n'

    // Write back via Tauri fs first to avoid shell escaping issues.
    try {
      await tauriFs.writeTextFile(gitignorePath, newContent)
    } catch {
      const writeResult = await runShellCommand(
        'bash',
        ['-c', 'printf "%s" "$1" > .gitignore', 'bash', newContent],
        state.currentRepoPath
      )
      if (!writeResult.success) {
        return false
      }
    }

    // Refresh status to see the changes
    await refreshStatus()
    return true
  } catch (e) {
    console.error('[Git] Failed to update .gitignore:', e)
    return false
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Reveal a file in Finder (macOS) or file manager
 */
async function revealInFinder(fullPath: string): Promise<void> {
  try {
    // Use 'open' command with -R flag to reveal in Finder (macOS)
    await invoke('run_shell_command', {
      command: 'open',
      args: ['-R', fullPath],
      cwd: state.currentRepoPath || '/',
    })
  } catch (e) {
    console.error('[Git] Failed to reveal in Finder:', e)
  }
}

// ============================================================================
// Publish / Auth Detection
// ============================================================================

/**
 * Detect available authentication methods for pushing to a remote
 * Checks: GitHub CLI (gh), SSH keys, git credential helper
 */
async function detectAuthMethods(): Promise<AuthMethods> {
  const result: AuthMethods = {
    gh: false,
    ghOrgs: [],
    sshKeys: [],
  }

  // 1. Check GitHub CLI auth status
  const ghResult = await runShellCommand('gh', ['auth', 'status'], '/')
  if (ghResult.success || ghResult.stderr.includes('Logged in to')) {
    result.gh = true
    // Parse username from output (stderr contains the info for gh auth status)
    const output = ghResult.stdout + ghResult.stderr
    const userMatch = output.match(/Logged in to [^\s]+ account (\S+)|account (\S+)|as (\S+)/)
    if (userMatch) {
      result.ghUser = userMatch[1] || userMatch[2] || userMatch[3]
    }

    // Fetch organizations the user belongs to
    const orgsResult = await runShellCommand('gh', ['api', 'user/orgs', '--jq', '.[].login'], '/')
    if (orgsResult.success && orgsResult.stdout.trim()) {
      result.ghOrgs = orgsResult.stdout.trim().split('\n').filter(Boolean)
    }
  }

  // 2. Check for SSH keys
  const sshResult = await runShellCommand('bash', ['-c', 'ls -1 ~/.ssh/id_*.pub 2>/dev/null'], '/')
  if (sshResult.success && sshResult.stdout.trim()) {
    result.sshKeys = sshResult.stdout.trim().split('\n').filter(Boolean)
  }

  // 3. Check git credential helper
  const credResult = await runShellCommand('git', ['config', '--global', 'credential.helper'], '/')
  if (credResult.success && credResult.stdout.trim()) {
    result.gitCredentialHelper = credResult.stdout.trim()
  }

  return result
}

/**
 * Create a GitHub repository using `gh` CLI and push local repo
 */
async function createGitHubRepo(
  name: string,
  isPrivate: boolean,
  description?: string
): Promise<PublishResult> {
  if (!state.currentRepoPath) {
    return { success: false, error: 'No repository selected' }
  }

  state.isOperationInProgress = true
  state.currentOperation = 'Creating GitHub repository...'

  try {
    const args = ['repo', 'create', name, isPrivate ? '--private' : '--public', '--source=.', '--remote=origin', '--push']
    if (description) args.push('--description', description)

    const result = await runShellCommand('gh', args, state.currentRepoPath)

    if (!result.success) {
      return {
        success: false,
        error: result.stderr || 'Failed to create repository',
      }
    }

    // Get the new remote URL
    const remoteResult = await runGitCommand(state.currentRepoPath, ['remote', 'get-url', 'origin'], true)
    const remoteUrl = remoteResult.success ? remoteResult.stdout.trim() : undefined

    // Refresh repo state
    await refreshStatus()
    await loadRemotes()

    return { success: true, remoteUrl }
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

/**
 * Add a remote and push the current branch
 */
async function addRemoteAndPush(remoteName: string, url: string): Promise<PublishResult> {
  if (!state.currentRepoPath) {
    return { success: false, error: 'No repository selected' }
  }

  state.isOperationInProgress = true
  state.currentOperation = 'Adding remote...'

  try {
    // Add the remote
    const addResult = await runGitCommand(state.currentRepoPath, ['remote', 'add', remoteName, url])
    if (!addResult.success) {
      return {
        success: false,
        error: addResult.stderr || 'Failed to add remote',
      }
    }

    // Push with upstream tracking
    state.currentOperation = 'Pushing to remote...'
    state.syncStatus = 'pushing'

    const pushResult = await runGitCommand(state.currentRepoPath, ['push', '-u', remoteName, state.currentBranch])
    if (!pushResult.success) {
      // Remote was added but push failed — keep the remote, report the error
      return {
        success: false,
        error: pushResult.stderr || 'Failed to push to remote',
      }
    }

    // Refresh repo state
    await refreshStatus()
    await loadRemotes()

    return { success: true, remoteUrl: url }
  } finally {
    state.isOperationInProgress = false
    state.syncStatus = 'idle'
    state.currentOperation = null
  }
}

async function resolveAllConflicts(strategy: 'ours' | 'theirs'): Promise<{ resolved: string[]; failed: string[] }> {
  const targets = [...state.conflictedFiles]
  const resolved: string[] = []
  const failed: string[] = []

  for (const path of targets) {
    const success = await resolveConflict(path, strategy)
    if (success) {
      resolved.push(path)
    } else {
      failed.push(path)
    }
  }

  return { resolved, failed }
}

async function resolveAllConflictsUseMine(): Promise<{ resolved: string[]; failed: string[] }> {
  return resolveAllConflicts('ours')
}

async function resolveAllConflictsUseTheirs(): Promise<{ resolved: string[]; failed: string[] }> {
  return resolveAllConflicts('theirs')
}

function isNoAbortInProgressError(stderr: string): boolean {
  const text = stderr.toLowerCase()
  return (
    text.includes('there is no merge to abort') ||
    text.includes('no rebase in progress') ||
    text.includes('no cherry-pick or revert in progress') ||
    text.includes('there is no cherry-pick in progress') ||
    text.includes('there is no revert in progress') ||
    text.includes('not in the middle of a rebase')
  )
}

async function abortOngoingOperation(): Promise<boolean> {
  if (!state.currentRepoPath) return false

  state.isOperationInProgress = true
  state.currentOperation = 'Aborting merge/rebase...'

  try {
    const attempts: string[][] = [
      ['merge', '--abort'],
      ['rebase', '--abort'],
      ['cherry-pick', '--abort'],
      ['revert', '--abort'],
    ]

    let meaningfulFailure: ShellResult | null = null

    for (const args of attempts) {
      const result = await runGitCommand(state.currentRepoPath, args, true)
      if (result.success) {
        await Promise.all([refreshStatus(), loadBranches(), loadHistory(0, 50)])
        state.lastError = null
        return true
      }

      if (!isNoAbortInProgressError(result.stderr)) {
        meaningfulFailure = result
      }
    }

    if (meaningfulFailure) {
      state.lastError = parseGitError(meaningfulFailure, 'abort')
    } else {
      state.lastError = {
        code: 'COMMAND_FAILED',
        message: 'No merge, rebase, cherry-pick, or revert operation is currently in progress.',
        command: 'abort',
      }
    }

    return false
  } finally {
    state.isOperationInProgress = false
    state.currentOperation = null
  }
}

// ============================================================================
// Composable Export
// ============================================================================

export function useGitRepo() {
  // Cleanup on unmount (only if called within a component)
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      stopPolling()
      deselectRepository()
    })
  }

  // === COMPUTED GETTERS ===

  const repositories = computed(() => {
    const _version = stateVersion.value // Trigger reactivity
    return Array.from(state.repositories.values())
  })

  const currentRepo = computed((): GitRepository | null => {
    if (!state.currentRepoPath) return null
    return state.repositories.get(state.currentRepoPath) || null
  })

  const hasChanges = computed(() => {
    return (
      state.stagedChanges.length > 0 ||
      state.unstagedChanges.length > 0 ||
      state.untrackedFiles.length > 0
    )
  })

  const hasConflicts = computed(() => state.conflictedFiles.length > 0)

  const canCommit = computed(() => state.stagedChanges.length > 0 && !hasConflicts.value)

  const allBranches = computed(() => [...state.localBranches, ...state.remoteBranches])

  // === RETURN API ===

  return {
    // State (readonly)
    state: readonly(state),

    // Computed
    repositories,
    currentRepo,
    hasChanges,
    hasConflicts,
    canCommit,
    allBranches,

    // Repository management
    discoverRepositories,
    clearDiscoveredRepositories,
    selectRepository,
    deselectRepository,
    getRepositoryInfo,

    // Status
    refreshStatus,

    // Staging
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    discardChanges,
    discardAllChanges,
    resolveConflictUseMine,
    resolveConflictUseTheirs,
    resolveAllConflictsUseMine,
    resolveAllConflictsUseTheirs,
    abortOngoingOperation,

    // Commits
    createCommit,
    amendCommit,
    loadHistory,
    getCommitDetails,

    // Branches
    loadBranches,
    createBranch,
    checkoutBranch,
    deleteBranch,
    mergeBranch,

    // Remotes
    fetch,
    pull,
    push,
    loadRemotes,

    // Diffs
    getUnstagedDiff,
    getStagedDiff,
    getCommitDiff,
    getFileContent,
    getDiffContent,

    // Clone
    cloneRepository,

    // Search
    searchCommits,

    // Stash
    stashList,
    stashSave,
    stashSaveDetailed,
    stashPop,
    stashApply,
    stashDrop,

    // Tags
    loadTags,
    createTag,
    deleteTag,
    pushTag,

    // Polling
    startPolling,
    stopPolling,

    // Gitignore & File Operations
    addToGitignore,
    revealInFinder,

    // Publish / Auth
    detectAuthMethods,
    createGitHubRepo,
    addRemoteAndPush,
  }
}
