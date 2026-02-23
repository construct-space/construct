<script setup lang="ts">
/**
 * Code Space - Editor (default view)
 * With toolbar actions for Run, Build, Terminal
 * Supports running on multiple devices simultaneously (Flutter)
 */
import { invoke } from '@tauri-apps/api/core'
import { useProcessManager } from '../composables/useProcessManager'
import { useProjectConfig } from '../composables/useProjectConfig'
import { useRunState } from '../composables/useRunState'
import { useProjectCommands } from '../composables/useProjectCommands'
import { useFlutterDevices } from '../composables/useFlutterDevices'
import { useCodeEditor } from '../composables/useCodeEditor'
import Code from '../components/Code.vue'
import CreateProjectModal from '../components/CreateProjectModal.vue'
import { useSpaceShortcuts } from '~/composables/useSpaceShortcuts'

const route = useRoute()
const projectId = computed(() => route.query.project as string)
const projectStore = useProjectStore()
const {
  state: editorState,
  loadDirectory,
  initTauri,
  saveFile,
  saveFileAs,
  newFile,
  closeFile,
  openFolder,
} = useCodeEditor()
const { setPageItems: _setPageItems } = useToolbar()
const toast = useToast()

// Process manager for multi-device running
const {
  allProcesses,
  hasRunningProcess,
  setProjectPath,
} = useProcessManager()

// Teleport ready state (wait for toolbar to mount)
const isTeleportReady = ref(false)
let _teleportCheckTimer: ReturnType<typeof setTimeout> | null = null

// Save current file
const saveCurrentFile = async () => {
  if (!editorState.currentFile) return
  await saveFile()
  if (!editorState.isDirty) {
    toast.add({ title: 'File saved', color: 'success' })
  }
}

// --- Composables ---

// Project config (.construct/project.json + package.json)
const { constructConfig, packageInfo } = useProjectConfig(editorState)

// Run state (process tracking, localhost URL, port conflicts)
const {
  isRunning,
  selectedProcessId,
  selectedProcess,
  quickCommandOutput,
  quickCommandDebugOutput,
  runOutput,
  debugOutput,
  localhostUrl,
  portConflictModal,
  conflictingPort,
  killPortAndRestart,
} = useRunState(allProcesses, hasRunningProcess, toast)

// Terminal panel state
const showTerminalPanel = ref(false)
const activeTab = ref<'output' | 'debug' | 'problems' | 'terminal'>('output')

// Auto-show panel when process starts
watch(hasRunningProcess, (running) => {
  if (running && !showTerminalPanel.value) {
    showTerminalPanel.value = true
  }
})

// Track if project has index.html (for plain HTML projects)
const hasIndexHtml = ref(false)
watch(() => editorState.rootPath, async (rootPath) => {
  if (!rootPath) {
    hasIndexHtml.value = false
    return
  }
  try {
    const result = await invoke<{ success: boolean }>('run_shell_command', {
      command: 'test',
      args: ['-f', `${rootPath}/index.html`],
      cwd: rootPath,
    })
    hasIndexHtml.value = result.success
  } catch {
    hasIndexHtml.value = false
  }
}, { immediate: true })

// Detect project type from config or file structure
const detectedProjectType = computed<'flutter' | 'nuxt' | 'bun' | 'node' | 'python' | 'rust' | 'go' | 'html' | 'unknown'>(() => {
  // 1. Check construct config template
  const template = constructConfig.value?.template?.toLowerCase() || ''
  if (template.includes('flutter')) return 'flutter'
  if (template.includes('nuxt')) return 'nuxt'
  if (template.includes('html')) return 'html'
  if (template.includes('python') || template.includes('django') || template.includes('fastapi')) return 'python'
  if (template.includes('rust')) return 'rust'
  if (template.includes('go')) return 'go'

  // 2. Detect Nuxt from package.json scripts
  const scripts = packageInfo.value?.scripts
  if (scripts) {
    if (scripts.dev?.includes('nuxi') || scripts.dev?.includes('nuxt')
      || scripts.build?.includes('nuxi') || scripts.build?.includes('nuxt')) {
      return 'nuxt'
    }
  }

  // 3. Check construct config commands for hints
  const installCmd = constructConfig.value?.commands?.install?.[0]
  if (installCmd === 'flutter') return 'flutter'
  if (installCmd === 'pip' || installCmd === 'pip3' || installCmd === 'python') return 'python'
  if (installCmd === 'cargo') return 'rust'
  if (installCmd === 'go') return 'go'

  // 4. Detect from package.json (has scripts = Node/Bun project)
  if (scripts && Object.keys(scripts).length > 0) {
    if (packageInfo.value?.packageManager === 'bun') return 'bun'
    return 'node'
  }

  // 5. Plain HTML project (has index.html but no package.json with scripts)
  if (hasIndexHtml.value) return 'html'

  return 'unknown'
})

// Project commands (resolve and run)
const { resolveProjectCommand, runBuild, runInstall } = useProjectCommands(
  editorState,
  constructConfig,
  packageInfo,
  detectedProjectType,
  toast,
)

// Flutter devices (device listing, run, hot reload/restart)
const {
  flutterDevices,
  selectedDevice,
  showDeviceModal,
  isLoadingDevices,
  fetchFlutterDevices,
  runFlutter,
  hotReload,
  hotRestart,
} = useFlutterDevices(editorState, constructConfig, detectedProjectType, toast, saveCurrentFile)

// Thin wrappers for composable calls that need local refs
const handleHotReload = () => hotReload(quickCommandDebugOutput)
const handleHotRestart = () => hotRestart(quickCommandDebugOutput)
const handleRunFlutter = () => runFlutter(showTerminalPanel, activeTab, selectedProcessId, isRunning)

// Settings panel state
const showSettings = ref(false)

// Create project modal
const showCreateProject = ref(false)

// AI assistant (hoisted so it can be used in useSpaceShortcuts)
const assistant = useAssistant()

// Space-scoped shortcuts — remappable via Settings → Shortcuts
useSpaceShortcuts([
  // File
  { id: 'code.save',         key: 'cmd+s', label: 'Save',               group: 'File', onPress: () => { saveCurrentFile() } },
  // AI
  { id: 'code.ai-edit',      key: 'cmd+k', label: 'AI edit selection',  group: 'AI',   onPress: () => { assistant.toggle() } },
  { id: 'code.ai-assistant', key: 'cmd+l', label: 'AI assistant',       group: 'AI',   onPress: () => { assistant.toggle() } },
  // Run
  { id: 'code.hotreload',    key: 'r',     label: 'Hot reload',         group: 'Run',  onPress: handleHotReload },
])

// Keyboard shortcuts — file ops that need confirm() dialogs (async, not remappable via store)
const handleKeydown = async (e: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modKey = isMac ? e.metaKey : e.ctrlKey

  // Cmd/Ctrl + Shift + S - Save As (confirm dialog variant — kept here)
  if (modKey && e.shiftKey && e.key === 's') {
    e.preventDefault()
    const success = await saveFileAs()
    if (success) {
      toast.add({ title: 'File saved', description: editorState.currentFile.split('/').pop(), color: 'success' })
    }
    return
  }

  // Cmd/Ctrl + N - New File
  if (modKey && e.key === 'n') {
    e.preventDefault()
    if (editorState.isDirty) {
      if (!confirm('You have unsaved changes. Create new file anyway?')) return
    }
    newFile()
    return
  }

  // Cmd/Ctrl + O - Open Folder
  if (modKey && e.key === 'o') {
    e.preventDefault()
    await openFolder()
    return
  }

  // Cmd/Ctrl + W - Close File
  if (modKey && e.key === 'w') {
    e.preventDefault()
    if (editorState.isDirty) {
      if (!confirm('You have unsaved changes. Close anyway?')) return
    }
    closeFile()
    return
  }
}

// Storage key for persisting editor state per project
const storageKey = computed(() => `construct-editor-${projectId.value}`)

// ===========================================
// PROJECT TYPE DETECTION FOR TOOLBAR
// ===========================================

// Get available npm/bun scripts from package.json
const availableScripts = computed<string[]>(() => {
  const scripts = packageInfo.value?.scripts
  if (!scripts) return []
  return Object.keys(scripts)
})

// Project type icon and color for toolbar
const projectTypeInfo = computed(() => {
  switch (detectedProjectType.value) {
    case 'flutter':
      return { icon: 'i-simple-icons-flutter', color: 'text-cyan-400', label: 'Flutter' }
    case 'nuxt':
      return { icon: 'i-simple-icons-nuxtdotjs', color: 'text-green-400', label: 'Nuxt' }
    case 'bun':
      return { icon: 'i-simple-icons-bun', color: 'text-orange-400', label: 'Bun' }
    case 'node':
      return { icon: 'i-simple-icons-nodedotjs', color: 'text-green-500', label: 'Node.js' }
    case 'python':
      return { icon: 'i-simple-icons-python', color: 'text-yellow-400', label: 'Python' }
    case 'rust':
      return { icon: 'i-simple-icons-rust', color: 'text-orange-600', label: 'Rust' }
    case 'go':
      return { icon: 'i-simple-icons-go', color: 'text-cyan-500', label: 'Go' }
    case 'html':
      return { icon: 'i-lucide-file-code', color: 'text-orange-500', label: 'HTML' }
    default:
      return { icon: 'i-lucide-code', color: 'text-app-muted', label: 'Code' }
  }
})

// Run dropdown items for toolbar
const runDropdownItems = computed(() => {
  const items: Array<{ label?: string; icon?: string; shortcut?: string; disabled?: boolean; type?: 'separator'; onSelect?: () => void }> = []

  // Primary run action
  items.push({
    label: isRunning.value ? 'Stop' : 'Run Dev Server',
    icon: isRunning.value ? 'i-lucide-square' : 'i-lucide-play',
    shortcut: isRunning.value ? '⌘.' : '⌘R',
    onSelect: () => isRunning.value ? stopAllProcesses() : handleToolbarRun(),
  })

  items.push({ type: 'separator' as const })

  // Project-type specific actions
  if (detectedProjectType.value === 'flutter') {
    items.push(
      { label: 'Hot Reload', icon: 'i-lucide-refresh-cw', shortcut: 'R', disabled: !isRunning.value, onSelect: () => handleHotReload() },
      { label: 'Hot Restart', icon: 'i-lucide-rotate-cw', shortcut: '⇧R', disabled: !isRunning.value, onSelect: () => handleHotRestart() },
      { type: 'separator' as const },
      { label: 'Flutter Clean', icon: 'i-lucide-trash-2', onSelect: () => handleRunScript('clean') },
      { label: 'Pub Get', icon: 'i-lucide-download', onSelect: () => handleInstall() },
    )
  } else if (detectedProjectType.value === 'nuxt') {
    items.push(
      { label: 'Build', icon: 'i-lucide-hammer', onSelect: () => handleBuild() },
      { label: 'Generate Static', icon: 'i-lucide-file-output', onSelect: () => handleRunScript('generate') },
      { label: 'Preview', icon: 'i-lucide-eye', onSelect: () => handleRunScript('preview') },
      { type: 'separator' as const },
      { label: 'Type Check', icon: 'i-lucide-check-circle', onSelect: () => handleRunScript('typecheck') },
      { label: 'Lint', icon: 'i-lucide-shield-check', onSelect: () => handleRunScript('lint') },
      { label: 'Install', icon: 'i-lucide-download', onSelect: () => handleInstall() },
    )
  } else if (detectedProjectType.value === 'bun' || detectedProjectType.value === 'node') {
    items.push(
      { label: 'Build', icon: 'i-lucide-hammer', onSelect: () => handleBuild() },
      { label: 'Install', icon: 'i-lucide-download', onSelect: () => handleInstall() },
    )
    // Add available scripts
    if (availableScripts.value.length > 0) {
      const scriptItems = availableScripts.value
        .filter(s => !['dev', 'start', 'build', 'install'].includes(s))
        .slice(0, 5)
      if (scriptItems.length > 0) {
        items.push({ type: 'separator' as const })
        scriptItems.forEach((script) => {
          items.push({ label: `Run: ${script}`, icon: 'i-lucide-terminal', onSelect: () => handleRunScript(script) })
        })
      }
    }
  } else if (detectedProjectType.value === 'python') {
    items.push(
      { label: 'Install Requirements', icon: 'i-lucide-download', onSelect: () => handleInstall() },
    )
  } else if (detectedProjectType.value === 'rust') {
    items.push(
      { label: 'Cargo Build', icon: 'i-lucide-hammer', onSelect: () => handleBuild() },
      { label: 'Cargo Check', icon: 'i-lucide-check-circle', onSelect: () => handleRunScript('check') },
      { label: 'Cargo Test', icon: 'i-lucide-test-tube', onSelect: () => handleRunScript('test') },
    )
  } else if (detectedProjectType.value === 'go') {
    items.push(
      { label: 'Go Build', icon: 'i-lucide-hammer', onSelect: () => handleBuild() },
      { label: 'Go Test', icon: 'i-lucide-test-tube', onSelect: () => handleRunScript('test') },
      { label: 'Go Mod Tidy', icon: 'i-lucide-package', onSelect: () => handleRunScript('tidy') },
    )
  } else if (detectedProjectType.value === 'html') {
    items.push(
      { label: 'Open in Browser', icon: 'i-lucide-external-link', onSelect: () => handleRunScript('open-browser') },
    )
  }

  return items
})

// ===========================================
// TOOLBAR HANDLERS
// ===========================================

// Run a specific script (from package.json or special commands)
const handleRunScript = async (script: string) => {
  if (!editorState.rootPath) return

  // Handle special commands
  if (script === 'open-browser') {
    // Open currently detected dev URL, fallback to localhost:3000
    const url = localhostUrl.value || 'http://localhost:3000'
    try {
      await invoke('run_shell_command', {
        command: 'open',
        args: [url],
        cwd: editorState.rootPath,
      })
      toast.add({ title: 'Opening in browser', description: url, color: 'success' })
    } catch (e) {
      console.error('[Editor] Failed to open browser:', e)
      toast.add({ title: 'Failed to open browser', description: String(e), color: 'error' })
    }
    return
  }

  // Handle Nuxt-specific scripts
  if (detectedProjectType.value === 'nuxt') {
    const pm = packageInfo.value?.packageManager || 'npm'
    if (script === 'cleanup') {
      runShellCommand('rm', ['-rf', '.nuxt', '.output'], '.nuxt cleaned')
      return
    }
    runShellCommand(pm, ['run', script], `${script} completed`)
    return
  }

  // Handle Flutter-specific scripts
  if (detectedProjectType.value === 'flutter') {
    if (script === 'clean') {
      runShellCommand('flutter', ['clean'], 'Flutter clean completed')
      return
    }
  }

  // Handle Rust-specific scripts
  if (detectedProjectType.value === 'rust') {
    if (script === 'check') {
      runShellCommand('cargo', ['check'], 'Cargo check completed')
      return
    }
    if (script === 'test') {
      runShellCommand('cargo', ['test'], 'Cargo test completed')
      return
    }
  }

  // Handle Go-specific scripts
  if (detectedProjectType.value === 'go') {
    if (script === 'test') {
      runShellCommand('go', ['test', './...'], 'Go test completed')
      return
    }
    if (script === 'tidy') {
      runShellCommand('go', ['mod', 'tidy'], 'Go mod tidy completed')
      return
    }
  }

  // Default: run as npm/bun script
  const pm = packageInfo.value?.packageManager || 'npm'
  showTerminalPanel.value = true
  activeTab.value = 'output'

  try {
    const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
      command: pm,
      args: ['run', script],
      cwd: editorState.rootPath,
    })

    const output = result.stdout || result.stderr || 'Done'
    console.log(`[Editor] ${pm} run ${script}:`, result.success ? 'success' : 'failed')

    toast.add({
      title: result.success ? `${script} completed` : `${script} failed`,
      description: result.success ? undefined : output.slice(0, 100),
      color: result.success ? 'success' : 'error',
    })
  } catch (e) {
    console.error(`[Editor] ${script} failed:`, e)
    toast.add({ title: `${script} failed`, description: String(e), color: 'error' })
  }
}

// Run a generic shell command
const runShellCommand = async (command: string, args: string[], successMsg?: string) => {
  if (!editorState.rootPath) return

  showTerminalPanel.value = true
  activeTab.value = 'output'

  try {
    const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
      command,
      args,
      cwd: editorState.rootPath,
    })

    const output = result.stdout || result.stderr || 'Done'
    console.log(`[Editor] ${command} ${args.join(' ')}:`, result.success ? 'success' : 'failed')

    toast.add({
      title: result.success ? (successMsg || `${command} completed`) : `${command} failed`,
      description: result.success ? undefined : output.slice(0, 100),
      color: result.success ? 'success' : 'error',
    })
  } catch (e) {
    console.error(`[Editor] ${command} failed:`, e)
    toast.add({ title: `${command} failed`, description: String(e), color: 'error' })
  }
}

// Handle build/install from toolbar
const handleBuild = () => runBuild(quickCommandOutput, showTerminalPanel, activeTab)
const handleInstall = () => runInstall(quickCommandOutput, showTerminalPanel, activeTab)

// Run the project (start dev server or run main)
const runProject = async () => {
  if (!editorState.rootPath) return

  const { startProcess } = useProcessManager()

  // Flutter requires a device selection UX
  if (detectedProjectType.value === 'flutter') {
    showDeviceModal.value = true
    await fetchFlutterDevices()
    return
  }

  const resolved = resolveProjectCommand('dev')
  if (!resolved) {
    toast.add({
      title: 'No run command found',
      description: 'Add a "dev" command in .construct/project.json or package.json scripts.',
      color: 'warning',
    })
    return
  }

  showTerminalPanel.value = true
  activeTab.value = 'output'

  if (resolved.label === 'HTML Server') {
    toast.add({
      title: 'Starting local server',
      description: 'Selecting a free localhost port...',
      color: 'info',
    })
  }

  // projectPath is kept in sync via rootPath watcher
  const processId = `run-${Date.now()}`
  selectedProcessId.value = processId

  const started = await startProcess({
    id: processId,
    command: [resolved.command, ...resolved.args],
    name: resolved.label,
  })

  if (!started) {
    toast.add({
      title: 'Failed to start process',
      description: 'Unable to start the selected run command. Check command availability and project path.',
      color: 'error',
    })
  }
}

// Handle run from toolbar
const handleToolbarRun = () => {
  if (detectedProjectType.value === 'flutter') {
    showDeviceModal.value = true
    fetchFlutterDevices()
  } else {
    runProject()
  }
}

// Stop all running processes
const stopAllProcesses = async () => {
  const { stopAll } = useProcessManager()
  await stopAll()
  toast.add({ title: 'All processes stopped', color: 'info' })
}

// Legacy wrappers for bottom panel events
const stopProcess = async () => {
  await stopAllProcesses()
}

const clearOutput = () => {
  toast.add({ title: 'Output cleared', color: 'info' })
}

// Save rootPath to localStorage when it changes
watch(() => editorState.rootPath, (newPath) => {
  if (newPath && storageKey.value) {
    localStorage.setItem(storageKey.value, newPath)
    setProjectPath(newPath)
  }
}, { immediate: true })

// Restore state and setup toolbar
onMounted(async () => {
  // Setup keyboard shortcuts
  window.addEventListener('keydown', handleKeydown)

  await initTauri()

  // Restore rootPath if empty (page reload)
  if (!editorState.rootPath) {
    // First try localStorage
    const savedPath = localStorage.getItem(storageKey.value)
    if (savedPath) {
      console.log('[Editor] Restoring from localStorage:', savedPath)
      await loadDirectory(savedPath)
    } else if (projectStore.currentProject?.local_path) {
      // Fall back to project's local path
      console.log('[Editor] Restoring from project local_path:', projectStore.currentProject.local_path)
      await loadDirectory(projectStore.currentProject.local_path)
    }
  }

  // Check if toolbar right slot is available for teleport
  const checkTeleportTarget = () => {
    if (isTeleportReady.value) return // already ready, stop polling
    const target = document.getElementById('toolbar-right-slot')
    if (target) {
      isTeleportReady.value = true
    } else {
      _teleportCheckTimer = setTimeout(checkTeleportTarget, 100)
    }
  }
  checkTeleportTarget()

  // Toolbar is now managed by CodeToolbar component
})

onBeforeUnmount(() => {
  // Disable Teleports BEFORE Vue unmounts — prevents 'node.parentNode is null' errors
  // that occur when Vue tries to remove teleported content after the target slot is gone
  isTeleportReady.value = false
  if (_teleportCheckTimer !== null) {
    clearTimeout(_teleportCheckTimer)
    _teleportCheckTimer = null
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  // Don't clear toolbar here - navigateWithRotation handles clearing on actual navigation
  // Clearing here causes issues with HMR since unmount happens before remount
})
</script>

<template>
  <div class="h-full w-full flex flex-col">
    <!-- Teleport project info to toolbar (after breadcrumb) -->
    <Teleport v-if="isTeleportReady" to="#toolbar-after-breadcrumb-slot">
      <!-- Saving indicator -->
      <span v-if="editorState.isDirty" class="text-app-accent text-lg leading-none">•</span>
    </Teleport>

    <!-- Teleport tools to toolbar center -->
    <Teleport v-if="isTeleportReady" to="#toolbar-bun-slot">
      <!-- Project type indicator -->
      <div v-if="editorState.rootPath && detectedProjectType !== 'unknown'"
        class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5">
        <Icon :name="projectTypeInfo.icon" :class="projectTypeInfo.color" class="size-4" />
        <span class="text-xs text-app-muted">{{ projectTypeInfo.label }}</span>
      </div>

      <div v-if="editorState.rootPath" class="h-5 w-px bg-app-muted/30 mx-1" />

      <!-- Run/Stop button -->
      <Tooltip v-if="editorState.rootPath" :text="isRunning ? 'Stop (⌘.)' : 'Run (⌘R)'">
        <Button :icon="isRunning ? 'i-lucide-square' : 'i-lucide-play'" size="xs"
          :variant="isRunning ? 'soft' : 'solid'" :color="isRunning ? 'error' : 'primary'"
          @click="isRunning ? stopAllProcesses() : handleToolbarRun()" />
      </Tooltip>

      <!-- Run dropdown (more options) -->
      <DropdownMenu v-if="editorState.rootPath" :items="runDropdownItems">
        <Button icon="i-lucide-chevron-down" size="xs" variant="ghost" color="neutral" />
      </DropdownMenu>

      <!-- Flutter: Hot Reload / Hot Restart -->
      <template v-if="detectedProjectType === 'flutter' && isRunning">
        <div class="h-5 w-px bg-app-muted/30 mx-1" />
        <Tooltip text="Hot Reload (R)">
          <Button icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" @click="handleHotReload" />
        </Tooltip>
        <Tooltip text="Hot Restart (⇧R)">
          <Button icon="i-lucide-rotate-cw" size="xs" variant="ghost" color="neutral" @click="handleHotRestart" />
        </Tooltip>
      </template>

      <!-- Nuxt/Node: Quick Build -->
      <template
        v-if="(detectedProjectType === 'nuxt' || detectedProjectType === 'bun' || detectedProjectType === 'node') && !isRunning && editorState.rootPath">
        <div class="h-5 w-px bg-app-muted/30 mx-1" />
        <Tooltip text="Install Dependencies">
          <Button icon="i-lucide-download" size="xs" variant="ghost" color="neutral" @click="handleInstall" />
        </Tooltip>
        <Tooltip text="Build">
          <Button icon="i-lucide-hammer" size="xs" variant="ghost" color="neutral" @click="handleBuild" />
        </Tooltip>
      </template>
    </Teleport>

    <!-- Teleport right-side actions to toolbar -->
    <Teleport v-if="isTeleportReady" to="#toolbar-right-slot">
      <!-- New Project -->
      <Tooltip text="New Project from Template">
        <Button icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="showCreateProject = true" />
      </Tooltip>

      <!-- AI Assistant toggle -->
      <Tooltip text="AI Assistant (⌘L)">
        <Button icon="i-lucide-sparkles" size="xs" variant="ghost" color="neutral"
          class="text-purple-400 hover:text-purple-300" @click="useAssistant().toggle()" />
      </Tooltip>

      <!-- Terminal toggle -->
      <Tooltip text="Terminal (⌘`)">
        <Button icon="i-lucide-terminal" size="xs" :variant="showTerminalPanel ? 'soft' : 'ghost'"
          :color="showTerminalPanel ? 'primary' : 'neutral'" @click="showTerminalPanel = !showTerminalPanel" />
      </Tooltip>

      <!-- Settings -->
      <Tooltip text="Settings">
        <Button icon="i-lucide-settings" size="xs" variant="ghost" color="neutral" @click="showSettings = true" />
      </Tooltip>
    </Teleport>

    <!-- Main Layout -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Editor Area (with resizable bottom panel when shown) -->
      <SplitPane v-if="showTerminalPanel" direction="vertical" :initial-size="70" :min-size="30" :max-size="90"
        class="flex-1">
        <template #first>
          <!-- File Explorer + Code -->
          <SplitPane direction="horizontal" :initial-size="20" :min-size="10" :max-size="40">
            <template #first>
              <FileExplorer />
            </template>
            <template #second>
              <Code />
            </template>
          </SplitPane>
        </template>

        <template #second>
          <!-- Bottom Panel -->
          <BottomPanel v-model="showTerminalPanel" :active-tab="activeTab" :output="runOutput"
            :debug-output="debugOutput" :is-running="isRunning"
            :process-name="selectedProcess?.name || selectedProcess?.deviceName"
            :process-status="selectedProcess?.status" @update:active-tab="activeTab = $event" @clear="clearOutput"
            @stop="stopProcess" @hot-reload="handleHotReload" @hot-restart="handleHotRestart" />
        </template>
      </SplitPane>

      <!-- Editor Area (without bottom panel) -->
      <SplitPane v-else direction="horizontal" :initial-size="20" :min-size="10" :max-size="40" class="flex-1">
        <template #first>
          <FileExplorer />
        </template>
        <template #second>
          <Code />
        </template>
      </SplitPane>
    </div>

    <!-- Flutter Device Picker Modal -->
    <Modal v-model:open="showDeviceModal">
      <template #header>
        <div class="flex items-center gap-3">
          <Icon name="i-simple-icons-flutter" class="size-6 text-cyan-400" />
          <h2 class="text-xl font-medium text-app">Select Device</h2>
        </div>
      </template>

      <template #body>
        <div v-if="isLoadingDevices" class="flex items-center justify-center py-8">
          <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-app-muted" />
        </div>

        <div v-else class="space-y-2">
          <button v-for="device in flutterDevices" :key="device.id"
            class="w-full p-3 rounded-lg border transition-all text-left flex items-center gap-3" :class="selectedDevice === device.id
              ? 'border-(--app-accent) bg-(--app-accent)/10'
              : 'border-white/10 hover:border-white/20 hover:bg-white/5'" @click="selectedDevice = device.id">
            <Icon :name="device.platform === 'ios' ? 'i-simple-icons-apple' :
              device.platform === 'android' ? 'i-simple-icons-android' :
                device.platform === 'macos' ? 'i-simple-icons-macos' :
                  device.platform === 'windows' ? 'i-simple-icons-windows' :
                    device.platform === 'linux' ? 'i-simple-icons-linux' :
                      device.platform === 'web' || device.platform === 'chrome' ? 'i-lucide-globe' :
                        'i-lucide-smartphone'" class="size-5" :class="device.platform === 'android' ? 'text-green-400' :
                      device.platform === 'ios' || device.platform === 'macos' ? 'text-gray-300' :
                        device.platform === 'web' || device.platform === 'chrome' ? 'text-blue-400' :
                          'text-app-muted'" />
            <div class="flex-1">
              <div class="font-medium text-app">{{ device.name }}</div>
              <div class="text-xs text-app-muted">
                {{ device.id }}
                <span v-if="device.isEmulator" class="ml-1 text-yellow-400">(Emulator)</span>
              </div>
            </div>
            <Icon v-if="selectedDevice === device.id" name="i-lucide-check" class="size-5 text-app-accent" />
          </button>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-between items-center">
          <Button icon="i-lucide-refresh-cw" label="Refresh" variant="ghost" size="sm" :loading="isLoadingDevices"
            @click="fetchFlutterDevices" />
          <div class="flex gap-2">
            <Button label="Cancel" variant="ghost" @click="showDeviceModal = false" />
            <Button label="Run" icon="i-lucide-play" :disabled="!selectedDevice" @click="handleRunFlutter" />
          </div>
        </div>
      </template>
    </Modal>

    <!-- Port Conflict Modal -->
    <Modal v-model:open="portConflictModal">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-yellow-500/10">
            <Icon name="i-lucide-alert-triangle" class="size-6 text-yellow-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-app">Port In Use</h3>
            <p class="text-sm text-app-muted">Port {{ conflictingPort }} is already in use</p>
          </div>
        </div>
      </template>

      <template #body>
        <p class="text-sm text-app-muted">
          Another process is using port {{ conflictingPort }}. Would you like to kill that process and restart the dev
          server?
        </p>
      </template>

      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <Button label="Cancel" variant="ghost" color="neutral" @click="portConflictModal = false" />
          <Button label="Kill & Restart" color="warning" icon="i-lucide-zap" @click="killPortAndRestart" />
        </div>
      </template>
    </Modal>

    <!-- Create Project Modal -->
    <CreateProjectModal v-model:open="showCreateProject" />
  </div>
</template>
