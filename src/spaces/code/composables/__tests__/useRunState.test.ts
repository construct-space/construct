import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRunState } from '../useRunState'

interface MockProcess {
  id: string
  name: string
  command: readonly string[]
  status: string
  output: string
  error: string
  startedAt: Date
  pid?: number
}

function createMockProcess(overrides: Partial<MockProcess> = {}): MockProcess {
  return {
    id: 'proc-1',
    name: 'dev',
    command: ['npm', 'run', 'dev'],
    status: 'running',
    output: '',
    error: '',
    startedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }
}

function createRunState(processes: MockProcess[] = []) {
  const allProcesses = ref(processes) as unknown as Parameters<typeof useRunState>[0]
  const hasRunningProcess = ref(processes.length > 0)
  const toast = { add: () => {} } as unknown as Parameters<typeof useRunState>[2]
  return { state: useRunState(allProcesses, hasRunningProcess, toast), allProcesses, hasRunningProcess }
}

describe('useRunState', () => {
  describe('localhost URL extraction', () => {
    it('extracts http://localhost:3000 from process output', () => {
      const proc = createMockProcess({
        output: 'Server running at http://localhost:3000/',
      })
      const { state } = createRunState([proc])
      expect(state.localhostUrl.value).toBe('http://localhost:3000/')
    })

    it('extracts http://127.0.0.1:8080', () => {
      const proc = createMockProcess({
        output: 'Listening on http://127.0.0.1:8080',
      })
      const { state } = createRunState([proc])
      expect(state.localhostUrl.value).toBe('http://127.0.0.1:8080')
    })

    it('returns last matched URL (most recent)', () => {
      const proc = createMockProcess({
        output: 'http://localhost:3000\nRestarted: http://localhost:3001/',
      })
      const { state } = createRunState([proc])
      expect(state.localhostUrl.value).toBe('http://localhost:3001/')
    })

    it('strips ANSI before matching', () => {
      const proc = createMockProcess({
        output: '  \x1B[32m➜\x1B[39m  Local: \x1B[36mhttp://localhost:5173/\x1B[39m',
      })
      const { state } = createRunState([proc])
      expect(state.localhostUrl.value).toBe('http://localhost:5173/')
    })

    it('returns null when no URL found', () => {
      const proc = createMockProcess({ output: 'no urls here' })
      const { state } = createRunState([proc])
      expect(state.localhostUrl.value).toBeNull()
    })

    it('returns null with no processes', () => {
      const { state } = createRunState([])
      expect(state.localhostUrl.value).toBeNull()
    })

    it('sorts by process start time — newest wins', () => {
      const older = createMockProcess({
        id: 'proc-old',
        output: 'http://localhost:3000/',
        startedAt: new Date('2025-01-01T00:00:00Z'),
      })
      const newer = createMockProcess({
        id: 'proc-new',
        output: 'http://localhost:4000/',
        startedAt: new Date('2025-06-01T00:00:00Z'),
      })
      const { state } = createRunState([older, newer])
      expect(state.localhostUrl.value).toBe('http://localhost:4000/')
    })
  })

  describe('port conflict detection', () => {
    it('detects "Port 3000 is in use"', async () => {
      const proc = createMockProcess()
      const { state, allProcesses } = createRunState([proc])

      // Trigger watch by updating process output
      allProcesses.value = [{ ...proc, output: 'Port 3000 is in use' }]
      await nextTick()

      expect(state.conflictingPort.value).toBe(3000)
      expect(state.portConflictModal.value).toBe(true)
    })

    it('detects "address already in use :8080"', async () => {
      const proc = createMockProcess()
      const { state, allProcesses } = createRunState([proc])

      allProcesses.value = [{ ...proc, output: 'Error: address already in use :8080' }]
      await nextTick()

      expect(state.conflictingPort.value).toBe(8080)
    })

    it('detects "EADDRINUSE :5173"', async () => {
      const proc = createMockProcess()
      const { state, allProcesses } = createRunState([proc])

      allProcesses.value = [{ ...proc, output: 'Error: EADDRINUSE :5173' }]
      await nextTick()

      expect(state.conflictingPort.value).toBe(5173)
    })

    it('does not trigger for non-matching output', async () => {
      const proc = createMockProcess()
      const { state, allProcesses } = createRunState([proc])

      allProcesses.value = [{ ...proc, output: 'Server started successfully' }]
      await nextTick()

      expect(state.conflictingPort.value).toBeNull()
      expect(state.portConflictModal.value).toBe(false)
    })

    it('does not re-trigger for same port', async () => {
      const proc = createMockProcess()
      const { state, allProcesses } = createRunState([proc])

      allProcesses.value = [{ ...proc, output: 'Port 3000 is in use' }]
      await nextTick()
      expect(state.portConflictModal.value).toBe(true)

      // Close modal manually
      state.portConflictModal.value = false

      // Same port again — conflictingPort hasn't changed, so watch doesn't re-trigger
      allProcesses.value = [{ ...proc, output: 'Port 3000 is in use again' }]
      await nextTick()
      expect(state.portConflictModal.value).toBe(false)
    })
  })

  describe('combined state', () => {
    it('isRunning reflects hasRunningProcess', () => {
      const { state, hasRunningProcess } = createRunState([])
      expect(state.isRunning.value).toBe(false)
      hasRunningProcess.value = true
      expect(state.isRunning.value).toBe(true)
    })

    it('isRunning reflects isRunningDirect', () => {
      const { state } = createRunState([])
      expect(state.isRunning.value).toBe(false)
      state.isRunningDirect.value = true
      expect(state.isRunning.value).toBe(true)
    })

    it('selectedProcess defaults to first process', () => {
      const proc = createMockProcess()
      const { state } = createRunState([proc])
      expect(state.selectedProcess.value).toBeDefined()
      expect(state.selectedProcess.value?.id).toBe('proc-1')
    })

    it('selectedProcess uses selectedProcessId when set', () => {
      const proc1 = createMockProcess({ id: 'p1', name: 'dev1' })
      const proc2 = createMockProcess({ id: 'p2', name: 'dev2' })
      const { state } = createRunState([proc1, proc2])
      state.selectedProcessId.value = 'p2'
      expect(state.selectedProcess.value?.id).toBe('p2')
    })

    it('runOutput shows selected process output', () => {
      const proc = createMockProcess({ output: 'hello from dev' })
      const { state } = createRunState([proc])
      expect(state.runOutput.value).toBe('hello from dev')
    })

    it('runOutput falls back to quickCommandOutput', () => {
      const { state } = createRunState([])
      state.quickCommandOutput.value = 'install output'
      expect(state.runOutput.value).toBe('install output')
    })

    it('runOutput shows "No output" when nothing available', () => {
      const { state } = createRunState([])
      expect(state.runOutput.value).toBe('No output')
    })
  })
})
