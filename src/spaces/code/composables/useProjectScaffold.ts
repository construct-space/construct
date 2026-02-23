/**
 * useProjectScaffold - Handles the full project scaffold flow
 * Template selection → tool checking → project creation → module install → done
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { TemplateConfig, TemplateModule } from '../templates.config'
import {
  sanitizeProjectName,
  buildCreateCommand,
  generateConstructConfig,
  getRequiredTools,
  parseCommandError,
} from '../templates.config'
import { useTemplateRegistry } from './useTemplateRegistry'

export type ScaffoldStep = 'select' | 'configure' | 'creating' | 'done' | 'error'
export type ToolCheckStatus = 'checking' | 'installed' | 'missing'

interface ScaffoldState {
  step: ScaffoldStep
  selectedTemplate: TemplateConfig | null
  projectName: string
  projectPath: string
  toolStatus: Map<string, ToolCheckStatus>
  progress: number
  progressMessage: string
  creationOutput: string
  error: string | null
  selectedModules: Set<string>
  initGit: boolean
}

// Shared state so modal and editor can reference the same instance
const state = reactive<ScaffoldState>({
  step: 'select',
  selectedTemplate: null,
  projectName: '',
  projectPath: '',
  toolStatus: new Map(),
  progress: 0,
  progressMessage: '',
  creationOutput: '',
  error: null,
  selectedModules: new Set(),
  initGit: true,
})

// Active process ID for cancellation
let activeProcessId: string | null = null
let activeListeners: UnlistenFn[] = []

export function useProjectScaffold() {
  const projectStore = useProjectStore()
  const toast = useToast()
  const registry = useTemplateRegistry()

  // Computed helpers — uses registry to include custom templates
  const allTemplates = registry.allTemplates

  const sanitizedName = computed(() => {
    if (!state.selectedTemplate || !state.projectName) return ''
    return sanitizeProjectName(state.projectName, state.selectedTemplate)
  })

  const allToolsInstalled = computed(() => {
    if (state.toolStatus.size === 0) return false
    for (const status of state.toolStatus.values()) {
      if (status !== 'installed') return false
    }
    return true
  })

  const hasToolsMissing = computed(() => {
    for (const status of state.toolStatus.values()) {
      if (status === 'missing') return true
    }
    return false
  })

  const isChecking = computed(() => {
    for (const status of state.toolStatus.values()) {
      if (status === 'checking') return true
    }
    return false
  })

  const canCreate = computed(() => {
    return (
      state.selectedTemplate !== null &&
      sanitizedName.value.length > 0 &&
      allToolsInstalled.value &&
      !isChecking.value
    )
  })

  const availableModules = computed<TemplateModule[]>(() => {
    return state.selectedTemplate?.modules || []
  })

  /**
   * Select a template and move to configure step
   */
  async function selectTemplate(template: TemplateConfig) {
    state.selectedTemplate = template
    state.step = 'configure'
    state.toolStatus = new Map()
    state.selectedModules = new Set()

    // Pre-select recommended modules
    if (template.modules) {
      for (const mod of template.modules) {
        if (mod.recommended) {
          state.selectedModules.add(mod.id)
        }
      }
    }

    // Auto-set project path from current project
    if (!state.projectPath && projectStore.currentProject?.local_path) {
      state.projectPath = projectStore.currentProject.local_path
    }

    // Check tools
    await checkTools(template)
  }

  /**
   * Check if all required tools are installed
   */
  async function checkTools(template: TemplateConfig) {
    const tools = getRequiredTools(template)
    if (tools.length === 0) {
      // No tools required — mark as ready
      state.toolStatus = new Map()
      return true
    }

    // Set all to checking
    for (const tool of tools) {
      state.toolStatus.set(tool.command, 'checking')
    }

    let allInstalled = true
    for (const tool of tools) {
      try {
        const result = await invoke<{ success: boolean; code: number | null; stdout: string; stderr: string }>('run_shell_command', {
          command: 'which',
          args: [tool.command],
          cwd: '/',
        })
        state.toolStatus.set(tool.command, result.success ? 'installed' : 'missing')
        if (!result.success) allInstalled = false
      } catch {
        state.toolStatus.set(tool.command, 'missing')
        allInstalled = false
      }
    }

    return allInstalled
  }

  /**
   * Pick a directory for the project
   */
  async function pickDirectory() {
    try {
      const tauriDialog = await import('@tauri-apps/plugin-dialog')
      const selected = await tauriDialog.open({
        directory: true,
        multiple: false,
        title: 'Choose Project Location',
      })
      if (selected && typeof selected === 'string') {
        state.projectPath = selected
      }
    } catch (e) {
      console.error('[ProjectScaffold] Failed to open folder picker:', e)
    }
  }

  /**
   * Toggle a module selection
   */
  function toggleModule(moduleId: string) {
    if (state.selectedModules.has(moduleId)) {
      state.selectedModules.delete(moduleId)
    } else {
      state.selectedModules.add(moduleId)
    }
  }

  /**
   * Clean up streaming listeners
   */
  function cleanupListeners() {
    for (const unlisten of activeListeners) {
      unlisten()
    }
    activeListeners = []
    activeProcessId = null
  }

  /**
   * Run the full scaffold flow
   */
  async function scaffold() {
    if (!state.selectedTemplate || !sanitizedName.value) return

    state.step = 'creating'
    state.progress = 0
    state.progressMessage = 'Validating...'
    state.creationOutput = ''
    state.error = null

    const template = state.selectedTemplate
    const name = sanitizedName.value

    try {
      // Step 1: Validate (10%)
      state.progress = 10
      state.progressMessage = 'Checking tools...'

      const toolsOk = await checkTools(template)
      if (!toolsOk) {
        throw new Error('Required tools are not installed')
      }

      // Step 2: Resolve directory (20%)
      state.progress = 20
      state.progressMessage = 'Setting up directory...'

      let parentDir = state.projectPath
      if (!parentDir) {
        // Try project local_path
        parentDir = projectStore.currentProject?.local_path || ''
      }
      if (!parentDir) {
        // Prompt user for directory
        const { promptForProjectsRoot } = useProjectDirectory()
        const chosen = await promptForProjectsRoot()
        if (!chosen) throw new Error('No directory selected')
        parentDir = chosen
      }

      const projectDir = `${parentDir}/${name}`

      // Step 3: Run create command (30-70%)
      state.progress = 30
      state.progressMessage = 'Creating project...'

      const createCmd = buildCreateCommand(template, state.projectName, {
        initGit: state.initGit,
      })
      if (!createCmd) throw new Error('Failed to build create command')

      state.creationOutput += `$ ${createCmd.cmd} ${createCmd.args.join(' ')}\n`

      // Use spawn_shell_command for streaming output
      const processId = `scaffold-${Date.now()}`
      activeProcessId = processId

      // Set up listeners before spawning
      const outputPromise = new Promise<{ success: boolean; code: number | null }>((resolve) => {
        let resolved = false

        const setupListeners = async () => {
          const unlistenOutput = await listen<{ process_id: string; stream: string; data: string }>('process-output', (event) => {
            if (event.payload.process_id !== processId) return
            state.creationOutput += event.payload.data + '\n'
            // Update progress gradually during creation
            if (state.progress < 70) {
              state.progress = Math.min(state.progress + 2, 70)
            }
          })

          const unlistenExit = await listen<{ process_id: string; code: number | null; success: boolean }>('process-exit', (event) => {
            if (event.payload.process_id !== processId) return
            if (!resolved) {
              resolved = true
              resolve({ success: event.payload.success, code: event.payload.code })
            }
          })

          activeListeners.push(unlistenOutput, unlistenExit)
        }

        setupListeners()
      })

      // Spawn the process
      await invoke<{ success: boolean; pid: number; process_id: string }>('spawn_shell_command', {
        processId,
        command: createCmd.cmd,
        args: createCmd.args,
        cwd: parentDir,
      })

      // Wait for the process to complete
      const result = await outputPromise
      cleanupListeners()

      if (!result.success) {
        // Try to parse a user-friendly error
        const parsed = parseCommandError(state.creationOutput)
        if (parsed) {
          throw new Error(`${parsed.title}: ${parsed.hint}`)
        }
        throw new Error(`Create command failed with exit code ${result.code}`)
      }

      // Step 4: Run dependency install if template has an install command (72%)
      if (template.commands.install && template.commands.install.length > 0) {
        state.progress = 72
        state.progressMessage = 'Installing dependencies...'

        const [installCmd, ...installArgs] = template.commands.install
        state.creationOutput += `\n$ ${installCmd} ${installArgs.join(' ')}\n`

        try {
          // Use spawn for streaming output so user sees progress
          const installProcessId = `scaffold-install-${Date.now()}`
          activeProcessId = installProcessId

          const installPromise = new Promise<{ success: boolean; code: number | null }>((resolve) => {
            let resolved = false
            const setup = async () => {
              const unOut = await listen<{ process_id: string; stream: string; data: string }>('process-output', (event) => {
                if (event.payload.process_id !== installProcessId) return
                state.creationOutput += event.payload.data + '\n'
              })
              const unExit = await listen<{ process_id: string; code: number | null; success: boolean }>('process-exit', (event) => {
                if (event.payload.process_id !== installProcessId) return
                if (!resolved) {
                  resolved = true
                  resolve({ success: event.payload.success, code: event.payload.code })
                }
              })
              activeListeners.push(unOut, unExit)
            }
            setup()
          })

          await invoke<{ success: boolean; pid: number; process_id: string }>('spawn_shell_command', {
            processId: installProcessId,
            command: installCmd,
            args: installArgs,
            cwd: projectDir,
          })

          const installResult = await installPromise
          cleanupListeners()

          if (!installResult.success) {
            state.creationOutput += `\nWarning: Dependency install exited with code ${installResult.code}\n`
          }
        } catch (e) {
          cleanupListeners()
          console.warn('[ProjectScaffold] Dependency install warning:', e)
          state.creationOutput += `Warning: Dependency install failed — you may need to run "${installCmd} ${installArgs.join(' ')}" manually\n`
        }
      }

      // Step 5: Install selected modules (75%)
      state.progress = 75
      const selectedMods = availableModules.value.filter(m => state.selectedModules.has(m.id))

      if (selectedMods.length > 0) {
        state.progressMessage = 'Installing modules...'

        const regularPkgs = selectedMods.filter(m => !m.dev).map(m => m.package)
        const devPkgs = selectedMods.filter(m => m.dev).map(m => m.package)

        // Helper to run a module install command
        const runModuleInstall = async (cmd: string, args: string[], label: string) => {
          state.creationOutput += `\n$ ${cmd} ${args.join(' ')}\n`
          try {
            const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
              command: cmd,
              args,
              cwd: projectDir,
            })
            state.creationOutput += result.stdout || result.stderr || ''
          } catch (e) {
            console.warn(`[ProjectScaffold] ${label} warning:`, e)
            state.creationOutput += `Warning: ${label} may not have completed correctly\n`
          }
        }

        const pm = template.packageManager
        const isDart = template.requiredTools?.some(t => t.command === 'dart')
        const isElixir = template.requiredTools?.some(t => t.command === 'mix')
        const isGo = template.requiredTools?.some(t => t.command === 'go')

        if (isDart || pm === 'flutter') {
          // Dart/Flutter: `dart pub add <pkg>` one at a time
          const allPkgs = [...regularPkgs, ...devPkgs.map(p => `dev:${p}`)]
          for (const pkg of allPkgs) {
            await runModuleInstall('dart', ['pub', 'add', pkg], `dart pub add ${pkg}`)
          }
        } else if (pm === 'composer') {
          // PHP/Composer: `composer require <pkg> [<pkg>...]`
          if (regularPkgs.length > 0) {
            await runModuleInstall('composer', ['require', ...regularPkgs], 'Composer require')
          }
          if (devPkgs.length > 0) {
            await runModuleInstall('composer', ['require', '--dev', ...devPkgs], 'Composer require --dev')
          }
        } else if (pm === 'pip') {
          // Python/pip: `pip install <pkg> [<pkg>...]`
          const allPkgs = [...regularPkgs, ...devPkgs]
          if (allPkgs.length > 0) {
            await runModuleInstall('pip', ['install', ...allPkgs], 'pip install')
          }
        } else if (isElixir) {
          // Elixir/Mix: packages are added to mix.exs, not via CLI — show note
          const allPkgs = [...regularPkgs, ...devPkgs]
          state.creationOutput += `\nNote: Add these to mix.exs deps: ${allPkgs.map(p => `{:${p}}`).join(', ')}\n`
          state.creationOutput += `Then run: mix deps.get\n`
        } else if (isGo) {
          // Go: `go get <pkg>` one at a time
          const allPkgs = [...regularPkgs, ...devPkgs]
          for (const pkg of allPkgs) {
            await runModuleInstall('go', ['get', pkg], `go get ${pkg}`)
          }
        } else if (pm === 'none') {
          // Rails/Ruby gems: `bundle add <gem>` one at a time
          const isRuby = template.requiredTools?.some(t => t.command === 'ruby' || t.command === 'rails')
          if (isRuby) {
            const allPkgs = [...regularPkgs, ...devPkgs]
            for (const pkg of allPkgs) {
              await runModuleInstall('bundle', ['add', pkg], `bundle add ${pkg}`)
            }
          }
        } else {
          // JS package managers: bun, npm, yarn, pnpm
          const cmd = pm === 'bun' ? 'bun' : pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm'

          if (regularPkgs.length > 0) {
            await runModuleInstall(cmd, ['add', ...regularPkgs], 'Module install')
          }
          if (devPkgs.length > 0) {
            await runModuleInstall(cmd, ['add', '-D', ...devPkgs], 'Dev module install')
          }
        }
      }

      // Step 6: Write .construct/project.json (80%)
      state.progress = 80
      state.progressMessage = 'Writing project config...'

      const constructConfig = generateConstructConfig(template)
      const configJson = JSON.stringify(constructConfig, null, 2)

      await invoke('run_shell_command', {
        command: 'mkdir',
        args: ['-p', `${projectDir}/.construct`],
        cwd: projectDir,
      })

      await invoke('run_shell_command', {
        command: 'sh',
        args: ['-c', `cat > "${projectDir}/.construct/project.json" << 'EOFCONFIG'\n${configJson}\nEOFCONFIG`],
        cwd: projectDir,
      })

      // Step 7: Init git if needed (85%)
      state.progress = 85
      if (state.initGit && !template.create.initsGit) {
        state.progressMessage = 'Initializing git...'
        try {
          await invoke('run_shell_command', {
            command: 'git',
            args: ['init'],
            cwd: projectDir,
          })
          state.creationOutput += '\n$ git init\nInitialized git repository\n'
        } catch (e) {
          console.warn('[ProjectScaffold] Git init failed (non-critical):', e)
        }
      }

      // Step 8: Update project store (90%)
      state.progress = 90
      state.progressMessage = 'Updating project...'

      if (projectStore.currentProject) {
        await projectStore.updateProject(projectStore.currentProject.id, {
          local_path: projectDir,
        })
      }

      // Step 9: Done (100%)
      state.progress = 100
      state.progressMessage = 'Complete!'
      state.projectPath = projectDir
      state.step = 'done'

      toast.add({
        title: 'Project created!',
        description: `${template.name} project "${name}" is ready`,
        color: 'success',
      })
    } catch (e) {
      cleanupListeners()
      const message = e instanceof Error ? e.message : String(e)
      state.error = message
      state.step = 'error'
      state.progressMessage = 'Failed'
      console.error('[ProjectScaffold] Scaffold failed:', e)
    }
  }

  /**
   * Cancel a running scaffold process
   */
  async function cancel() {
    if (activeProcessId) {
      try {
        await invoke('kill_shell_process', { processId: activeProcessId })
      } catch {
        // Process may have already exited
      }
      cleanupListeners()
    }
    state.step = 'error'
    state.error = 'Cancelled by user'
    state.progressMessage = 'Cancelled'
  }

  /**
   * Go back to template selection
   */
  function goBack() {
    if (state.step === 'configure') {
      state.step = 'select'
      state.selectedTemplate = null
      state.toolStatus = new Map()
    }
  }

  /**
   * Reset all state back to initial
   */
  function reset() {
    state.step = 'select'
    state.selectedTemplate = null
    state.projectName = ''
    state.projectPath = ''
    state.toolStatus = new Map()
    state.progress = 0
    state.progressMessage = ''
    state.creationOutput = ''
    state.error = null
    state.selectedModules = new Set()
    state.initGit = true
    cleanupListeners()
  }

  return {
    // State
    state: readonly(state),
    step: computed(() => state.step),
    selectedTemplate: computed(() => state.selectedTemplate),
    projectName: computed({
      get: () => state.projectName,
      set: (val: string) => { state.projectName = val },
    }),
    projectPath: computed({
      get: () => state.projectPath,
      set: (val: string) => { state.projectPath = val },
    }),
    initGit: computed({
      get: () => state.initGit,
      set: (val: boolean) => { state.initGit = val },
    }),
    sanitizedName,
    toolStatus: computed(() => state.toolStatus),
    allToolsInstalled,
    hasToolsMissing,
    isChecking,
    canCreate,
    progress: computed(() => state.progress),
    progressMessage: computed(() => state.progressMessage),
    creationOutput: computed(() => state.creationOutput),
    error: computed(() => state.error),
    selectedModules: computed(() => state.selectedModules),
    availableModules,
    allTemplates,

    // Registry
    registry,

    // Actions
    selectTemplate,
    checkTools,
    pickDirectory,
    toggleModule,
    scaffold,
    cancel,
    goBack,
    reset,
  }
}
