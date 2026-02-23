/**
 * Flutter device management composable — device listing, selection, run, hot reload/restart.
 */
import { invoke } from '@tauri-apps/api/core'
import type { ConstructProjectConfig } from '../templates.config'
import { useProcessManager } from './useProcessManager'

interface FlutterDevice {
  id: string
  name: string
  platform: string
  isEmulator: boolean
}

interface CodeEditorState {
  rootPath: string
  currentFile: string
  isDirty: boolean
}

export function useFlutterDevices(
  editorState: CodeEditorState,
  constructConfig: Ref<ConstructProjectConfig | null>,
  detectedProjectType: ComputedRef<string>,
  toast: ReturnType<typeof useToast>,
  saveCurrentFile: () => Promise<void>,
) {
  const flutterDevices = ref<FlutterDevice[]>([])
  const selectedDevice = ref<string | null>(null)
  const showDeviceModal = ref(false)
  const isLoadingDevices = ref(false)

  const isFlutterProject = computed(() => {
    return constructConfig.value?.template === 'flutter'
  })

  const fetchFlutterDevices = async () => {
    if (!editorState.rootPath) return

    isLoadingDevices.value = true
    try {
      const result = await invoke<{ success: boolean; stdout: string; stderr: string }>('run_shell_command', {
        command: 'flutter',
        args: ['devices', '--machine'],
        cwd: editorState.rootPath,
      })

      if (result.success && result.stdout) {
        const devices = JSON.parse(result.stdout) as Array<{
          id: string
          name: string
          platform: string
          emulator: boolean
        }>

        flutterDevices.value = devices.map(d => ({
          id: d.id,
          name: d.name,
          platform: d.platform,
          isEmulator: d.emulator,
        }))

        if (!selectedDevice.value && flutterDevices.value.length > 0) {
          const firstDevice = flutterDevices.value[0]
          if (firstDevice) selectedDevice.value = firstDevice.id
        }
      }
    } catch (e) {
      console.error('Failed to fetch Flutter devices:', e)
      flutterDevices.value = []
    } finally {
      isLoadingDevices.value = false
    }
  }

  const runFlutter = async (
    showTerminalPanel: Ref<boolean>,
    activeTab: Ref<string>,
    selectedProcessId: Ref<string | null>,
    isRunning: ComputedRef<boolean>,
  ) => {
    if (!editorState.rootPath || isRunning.value) return

    const device = flutterDevices.value.find(d => d.id === selectedDevice.value)
    const args = ['run']

    if (selectedDevice.value) {
      args.push('-d', selectedDevice.value)
    }

    const processId = selectedDevice.value ? `flutter-${selectedDevice.value}` : `flutter-${Date.now()}`

    const { startProcess } = useProcessManager()
    showTerminalPanel.value = true
    showDeviceModal.value = false
    activeTab.value = 'output'

    const started = await startProcess({
      id: processId,
      command: ['flutter', ...args],
      name: device ? `Flutter - ${device.name}` : 'Flutter Run',
    })

    selectedProcessId.value = processId

    if (!started) {
      toast.add({
        title: 'Failed to start Flutter',
        description: 'Check Flutter SDK/device availability and try again.',
        color: 'error',
      })
    }
  }

  const hotReload = async (quickCommandDebugOutput: Ref<string>) => {
    await saveCurrentFile()

    if (isFlutterProject.value) {
      const { hotReload: sendHotReload } = useProcessManager()
      quickCommandDebugOutput.value += '\n[Hot Reload] Sending r to Flutter...\n'
      const success = await sendHotReload()
      if (success) {
        toast.add({ title: 'Hot reload', description: 'Reloading...', color: 'success' })
      } else {
        toast.add({ title: 'Hot reload failed', description: 'No running process found', color: 'error' })
      }
    } else {
      toast.add({ title: 'File saved', description: 'HMR will reload automatically', color: 'success' })
    }
  }

  const hotRestart = async (quickCommandDebugOutput: Ref<string>) => {
    if (!editorState.rootPath) return

    const { hotRestart: sendHotRestart, restartProcess, runningProcesses } = useProcessManager()

    if (isFlutterProject.value) {
      quickCommandDebugOutput.value += '\n[Hot Restart] Sending R to Flutter...\n'
      const success = await sendHotRestart()
      if (success) {
        toast.add({ title: 'Hot restart', description: 'Restarting app state...', color: 'info' })
      } else {
        toast.add({ title: 'Hot restart failed', description: 'No running process found', color: 'error' })
      }
    } else {
      const processId = runningProcesses.value[0]?.id
      if (processId) {
        quickCommandDebugOutput.value += '\n[Restart] Restarting dev server...\n'
        toast.add({ title: 'Restarting', description: 'Stopping and restarting dev server...', color: 'info' })
        await restartProcess(processId)
      } else {
        toast.add({ title: 'Restart failed', description: 'No running process found', color: 'error' })
      }
    }
  }

  return {
    flutterDevices,
    selectedDevice,
    showDeviceModal,
    isLoadingDevices,
    isFlutterProject,
    fetchFlutterDevices,
    runFlutter,
    hotReload,
    hotRestart,
  }
}
