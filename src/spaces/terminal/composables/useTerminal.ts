/**
 * Terminal composable - manages terminal state and command execution
 */

export interface TerminalLine {
  type: 'input' | 'output' | 'error'
  content: string
}

export interface UseTerminalOptions {
  workingDir?: string
  onCommand?: (cmd: string) => void
  onOutput?: (text: string) => void
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const { workingDir = '~', onCommand, onOutput } = options

  const history = ref<TerminalLine[]>([
    { type: 'output', content: 'Welcome to Construct Terminal' },
    { type: 'output', content: `Working directory: ${workingDir}` },
    { type: 'output', content: '' }
  ])

  const currentInput = ref('')
  const terminalRef = ref<HTMLElement | null>(null)

  const scrollToBottom = () => {
    nextTick(() => {
      if (terminalRef.value) {
        terminalRef.value.scrollTop = terminalRef.value.scrollHeight
      }
    })
  }

  const addLine = (line: TerminalLine) => {
    history.value.push(line)
    scrollToBottom()
  }

  const addOutput = (content: string) => {
    addLine({ type: 'output', content })
    onOutput?.(content)
  }

  const addError = (content: string) => {
    addLine({ type: 'error', content })
  }

  const clear = () => {
    history.value = []
  }

  const executeCommand = () => {
    const cmd = currentInput.value.trim()
    if (!cmd) return

    addLine({ type: 'input', content: `$ ${cmd}` })
    onCommand?.(cmd)

    // Handle built-in commands
    const [command, ..._args] = cmd.split(' ')
    switch (command) {
      case 'ls':
        addOutput('src/  package.json  tsconfig.json  README.md')
        break
      case 'pwd':
        addOutput(workingDir || '/home/user/project')
        break
      case 'clear':
        clear()
        break
      case 'help':
        addOutput('Available commands: ls, pwd, clear, help, git, npm, node')
        break
      default:
        addOutput(`Command executed: ${cmd}`)
    }

    currentInput.value = ''
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand()
    }
  }

  return {
    history,
    currentInput,
    terminalRef,
    addLine,
    addOutput,
    addError,
    clear,
    executeCommand,
    handleKeydown,
    scrollToBottom
  }
}
