/**
 * Run state composable — running process state, localhost URL extraction,
 * port conflict detection, selected process tracking.
 */
import { stripAnsi } from './useAnsiStrip'
import { useProcessManager, type RunningProcess } from './useProcessManager'

export function useRunState(
  allProcesses: Ref<RunningProcess[]>,
  hasRunningProcess: Ref<boolean>,
  toast: ReturnType<typeof useToast>,
) {
  // Direct running state (for quick one-off commands)
  const isRunningDirect = ref(false)
  // Combined running state
  const isRunning = computed(() => hasRunningProcess.value || isRunningDirect.value)

  // Selected process for viewing output (multi-device support)
  const selectedProcessId = ref<string | null>(null)
  const selectedProcess = computed<RunningProcess | undefined>(() => {
    const processes = allProcesses.value

    if (selectedProcessId.value) {
      return processes.find(process => process.id === selectedProcessId.value)
    }

    return processes.length > 0 ? processes[0] : undefined
  })

  // Quick command output (for one-off commands like build/install)
  const quickCommandOutput = ref('')
  const quickCommandDebugOutput = ref('')

  // Combined output
  const runOutput = computed(() => selectedProcess.value?.output || quickCommandOutput.value || 'No output')
  const debugOutput = computed(() => selectedProcess.value?.error || quickCommandDebugOutput.value || 'No debug output')

  // Localhost URL extraction
  const localhostUrl = computed(() => {
    const withUrl = allProcesses.value
      .map((process) => {
        const output = stripAnsi(process.output || '')
        const localhostMatches = output.match(/https?:\/\/localhost:\d+\/?/gi)
        const ipMatches = output.match(/https?:\/\/127\.0\.0\.1:\d+\/?/gi)
        const url = localhostMatches?.[localhostMatches.length - 1] || ipMatches?.[ipMatches.length - 1] || null
        return { process, url }
      })
      .filter((item): item is { process: RunningProcess; url: string } => Boolean(item.url))
      .sort((a, b) => new Date(b.process.startedAt).getTime() - new Date(a.process.startedAt).getTime())

    return withUrl[0]?.url || null
  })

  // Port conflict detection
  const portConflictModal = ref(false)
  const conflictingPort = ref<number | null>(null)

  watch(runOutput, (output) => {
    const portMatch = output.match(/Port (\d+) is in use/i)
      || output.match(/address already in use.*:(\d+)/i)
      || output.match(/EADDRINUSE.*:(\d+)/i)

    if (portMatch && portMatch[1]) {
      const port = parseInt(portMatch[1])
      if (port && port !== conflictingPort.value) {
        conflictingPort.value = port
        portConflictModal.value = true
      }
    }
  })

  const killPortAndRestart = async () => {
    if (!conflictingPort.value) return

    const { killPort, restartProcess, runningProcesses } = useProcessManager()

    toast.add({ title: 'Killing port', description: `Killing process on port ${conflictingPort.value}...`, color: 'info' })

    const killed = await killPort(conflictingPort.value)
    if (killed) {
      toast.add({ title: 'Port freed', description: `Port ${conflictingPort.value} is now available`, color: 'success' })

      const processId = runningProcesses.value[0]?.id
      if (processId) {
        await restartProcess(processId)
      }
    } else {
      toast.add({ title: 'Failed to kill port', color: 'error' })
    }

    portConflictModal.value = false
    conflictingPort.value = null
  }

  return {
    isRunningDirect,
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
  }
}
