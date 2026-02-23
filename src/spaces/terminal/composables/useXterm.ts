/**
 * useXterm - xterm.js terminal composable
 * Manages terminal instance, PTY connection, and addons
 * Integrates with app theme system
 */
import type { Terminal, ITheme } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { WebLinksAddon } from '@xterm/addon-web-links'
import type { SearchAddon } from '@xterm/addon-search'
import type { AppTheme } from '~/composables/useAppTheme'

export interface UseXtermOptions {
  fontSize?: number
  fontFamily?: string
  cwd?: string
  shell?: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  onTitleChange?: (title: string) => void
}

export interface XtermInstance {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  sessionId: string | null
}

// Map app themes to xterm themes
const terminalThemes: Record<string, ITheme> = {
  'vs': {
    background: '#ffffff',
    foreground: '#1e293b',
    cursor: '#1e293b',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000',
    red: '#cd3131',
    green: '#00bc00',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#cd3131',
    brightGreen: '#14ce14',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5',
  },
  'vs-dark': {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff',
  },
  'tokyo-night': {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    cursorAccent: '#1a1b26',
    selectionBackground: '#33467c',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  },
  'dracula': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  'one-dark': {
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    cursorAccent: '#282c34',
    selectionBackground: '#3e4451',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
  'night-owl': {
    background: '#011627',
    foreground: '#d6deeb',
    cursor: '#80a4c2',
    cursorAccent: '#011627',
    selectionBackground: '#1d3b53',
    black: '#011627',
    red: '#ef5350',
    green: '#22da6e',
    yellow: '#addb67',
    blue: '#82aaff',
    magenta: '#c792ea',
    cyan: '#21c7a8',
    white: '#d6deeb',
    brightBlack: '#575656',
    brightRed: '#ef5350',
    brightGreen: '#22da6e',
    brightYellow: '#ffeb95',
    brightBlue: '#82aaff',
    brightMagenta: '#c792ea',
    brightCyan: '#7fdbca',
    brightWhite: '#ffffff',
  },
  'github-dark': {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#c9d1d9',
    cursorAccent: '#0d1117',
    selectionBackground: '#3b5070',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
  'monokai': {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#272822',
    selectionBackground: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  'nord': {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    cursorAccent: '#2e3440',
    selectionBackground: '#434c5e',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
  'synthwave-84': {
    background: '#262335',
    foreground: '#ffffff',
    cursor: '#ff7edb',
    cursorAccent: '#262335',
    selectionBackground: '#463465',
    black: '#262335',
    red: '#fe4450',
    green: '#72f1b8',
    yellow: '#fede5d',
    blue: '#03edf9',
    magenta: '#ff7edb',
    cyan: '#03edf9',
    white: '#ffffff',
    brightBlack: '#614d85',
    brightRed: '#fe4450',
    brightGreen: '#72f1b8',
    brightYellow: '#f97e72',
    brightBlue: '#03edf9',
    brightMagenta: '#ff7edb',
    brightCyan: '#03edf9',
    brightWhite: '#ffffff',
  },
  'cobalt2': {
    background: '#193549',
    foreground: '#ffffff',
    cursor: '#ffc600',
    cursorAccent: '#193549',
    selectionBackground: '#0050a4',
    black: '#000000',
    red: '#ff628c',
    green: '#3ad900',
    yellow: '#ffc600',
    blue: '#0088ff',
    magenta: '#ff628c',
    cyan: '#80fcff',
    white: '#ffffff',
    brightBlack: '#323232',
    brightRed: '#ff628c',
    brightGreen: '#3ad900',
    brightYellow: '#ffc600',
    brightBlue: '#0088ff',
    brightMagenta: '#ff628c',
    brightCyan: '#80fcff',
    brightWhite: '#ffffff',
  },
  'material': {
    background: '#263238',
    foreground: '#eeffff',
    cursor: '#ffcc00',
    cursorAccent: '#263238',
    selectionBackground: '#455a64',
    black: '#263238',
    red: '#ff5370',
    green: '#c3e88d',
    yellow: '#ffcb6b',
    blue: '#82aaff',
    magenta: '#c792ea',
    cyan: '#89ddff',
    white: '#eeffff',
    brightBlack: '#546e7a',
    brightRed: '#ff5370',
    brightGreen: '#c3e88d',
    brightYellow: '#ffcb6b',
    brightBlue: '#82aaff',
    brightMagenta: '#c792ea',
    brightCyan: '#89ddff',
    brightWhite: '#ffffff',
  },
  'hc-black': {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    cursorAccent: '#000000',
    selectionBackground: '#264f78',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff0000',
    brightGreen: '#00ff00',
    brightYellow: '#ffff00',
    brightBlue: '#0000ff',
    brightMagenta: '#ff00ff',
    brightCyan: '#00ffff',
    brightWhite: '#ffffff',
  },
  'hc-light': {
    background: '#ffffff',
    foreground: '#000000',
    cursor: '#000000',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000',
    red: '#ff0000',
    green: '#008000',
    yellow: '#808000',
    blue: '#0000ff',
    magenta: '#800080',
    cyan: '#008080',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff0000',
    brightGreen: '#008000',
    brightYellow: '#808000',
    brightBlue: '#0000ff',
    brightMagenta: '#800080',
    brightCyan: '#008080',
    brightWhite: '#ffffff',
  },
}

// Default terminal theme fallback
const defaultDarkTheme: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
}

// Get terminal theme from app theme
function getTerminalTheme(appTheme: AppTheme | undefined): ITheme {
  if (!appTheme) {
    return defaultDarkTheme
  }
  // Try to find exact match
  const exactMatch = terminalThemes[appTheme.id]
  if (exactMatch) {
    return exactMatch
  }
  // Fallback to mode-based theme
  const modeTheme = appTheme.mode === 'dark' ? terminalThemes['vs-dark'] : terminalThemes['vs']
  return modeTheme ?? defaultDarkTheme
}

export function useXterm(options: UseXtermOptions = {}) {
  const {
    fontSize = 14,
    fontFamily = 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    cwd,
    shell,
    onData,
    onResize,
    onTitleChange,
  } = options

  const containerRef = ref<HTMLElement | null>(null)
  const instance = ref<XtermInstance | null>(null)
  const isConnected = ref(false)
  const sessionId = ref<string | null>(null)

  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let searchAddon: SearchAddon | null = null
  let webLinksAddon: WebLinksAddon | null = null
  let resizeObserver: ResizeObserver | null = null
  let cleanupListener: (() => void) | null = null

  // Get app theme
  const { currentTheme } = useAppTheme()

  let isMounted = true

  const initTerminal = async () => {
    // Only run on client side
    if (typeof window === 'undefined') return
    if (!containerRef.value || terminal) return

    // Dynamic imports for SSR compatibility
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')
    const { WebLinksAddon } = await import('@xterm/addon-web-links')
    const { SearchAddon } = await import('@xterm/addon-search')

    // Import CSS
    await import('@xterm/xterm/css/xterm.css')

    // After async imports, verify container is still mounted
    if (!isMounted || !containerRef.value) return

    // Get initial theme
    const xtermTheme = getTerminalTheme(currentTheme.value)

    terminal = new Terminal({
      fontSize,
      fontFamily,
      theme: xtermTheme,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    })

    // Load addons
    fitAddon = new FitAddon()
    searchAddon = new SearchAddon()
    webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    terminal.loadAddon(webLinksAddon)

    // Open terminal in container
    terminal.open(containerRef.value)
    fitAddon.fit()

    // Handle user input - send to PTY
    terminal.onData((data) => {
      if (sessionId.value) {
        sendToPty(sessionId.value, data)
      }
      onData?.(data)
    })

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      if (sessionId.value) {
        resizePty(sessionId.value, cols, rows)
      }
      onResize?.(cols, rows)
    })

    // Handle title changes
    terminal.onTitleChange((title) => {
      onTitleChange?.(title)
    })

    // Setup resize observer
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
    })
    resizeObserver.observe(containerRef.value)

    instance.value = {
      terminal,
      fitAddon,
      searchAddon,
      sessionId: null,
    }

    // Connect to PTY backend
    await connectPty()
  }

  const connectPty = async () => {
    if (!terminal) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')

      // After async imports, verify still mounted
      if (!isMounted || !terminal) return

      // Ensure we never keep stale listeners/sessions around.
      await disconnectPtySession(true)

      // Generate session ID
      const id = `pty-${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionId.value = id

      // Get working directory
      const workingDir = cwd || (await getDefaultCwd())

      // Spawn PTY session
      const result = await invoke('pty_spawn', {
        sessionId: id,
        shell: shell || getDefaultShell(),
        cwd: workingDir,
        cols: terminal.cols,
        rows: terminal.rows,
      })

      if (result) {
        isConnected.value = true
        const thisSessionId = id

        // Listen for PTY output
        const unlisten = await listen<{ session_id: string; data: string }>('pty-output', (event) => {
          if (event.payload.session_id === thisSessionId && terminal) {
            terminal.write(event.payload.data)
          }
        })

        // Listen for PTY exit
        const unlistenExit = await listen<{ session_id: string; code: number }>('pty-exit', (event) => {
          if (event.payload.session_id === thisSessionId) {
            isConnected.value = false
            if (sessionId.value === thisSessionId) {
              sessionId.value = null
              if (instance.value) instance.value.sessionId = null
            }
            terminal?.write(`\r\n\x1b[90m[Process exited with code ${event.payload.code}]\x1b[0m\r\n`)
          }
        })

        cleanupListener = () => {
          unlisten()
          unlistenExit()
        }

        if (instance.value) {
          instance.value.sessionId = id
        }
      }
    } catch (error) {
      console.error('Failed to connect PTY:', error)
      // Fallback: show error in terminal
      terminal?.write(`\x1b[31mFailed to start terminal: ${error}\x1b[0m\r\n`)
      terminal?.write(`\x1b[90mMake sure PTY support is enabled in the backend.\x1b[0m\r\n`)
    }
  }

  const disconnectPtySession = async (kill: boolean) => {
    // Stop existing listeners first so old sessions can't still write to terminal.
    cleanupListener?.()
    cleanupListener = null

    if (sessionId.value && kill) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('pty_kill', { sessionId: sessionId.value })
      } catch (error) {
        console.error('Failed to kill PTY:', error)
      }
    }

    if (instance.value) instance.value.sessionId = null
    sessionId.value = null
    isConnected.value = false
  }

  const sendToPty = async (id: string, data: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('pty_write', { sessionId: id, data })
    } catch (error) {
      console.error('Failed to write to PTY:', error)
    }
  }

  const resizePty = async (id: string, cols: number, rows: number) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('pty_resize', { sessionId: id, cols, rows })
    } catch (error) {
      console.error('Failed to resize PTY:', error)
    }
  }

  const getDefaultShell = (): string => {
    // Default shells by platform
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform.toLowerCase()
      if (platform.includes('mac')) return '/bin/zsh'
      if (platform.includes('win')) return 'powershell.exe'
    }
    return '/bin/bash'
  }

  const getDefaultCwd = async (): Promise<string> => {
    try {
      const { homeDir } = await import('@tauri-apps/api/path')
      return await homeDir()
    } catch {
      return '~'
    }
  }

  const write = (data: string) => {
    terminal?.write(data)
  }

  const writeln = (data: string) => {
    terminal?.writeln(data)
  }

  const clear = () => {
    terminal?.clear()
  }

  const reset = () => {
    terminal?.reset()
  }

  const focus = () => {
    terminal?.focus()
  }

  const blur = () => {
    terminal?.blur()
  }

  const fit = () => {
    fitAddon?.fit()
  }

  const search = (term: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }) => {
    searchAddon?.findNext(term, options)
  }

  const searchNext = () => {
    searchAddon?.findNext('')
  }

  const searchPrevious = () => {
    searchAddon?.findPrevious('')
  }

  const applyTheme = (appTheme: AppTheme | undefined) => {
    if (terminal) {
      terminal.options.theme = getTerminalTheme(appTheme)
    }
  }

  const setFontSize = (size: number) => {
    if (terminal) {
      terminal.options.fontSize = size
      fitAddon?.fit()
    }
  }

  const dispose = async () => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Kill PTY session + cleanup listeners
    await disconnectPtySession(true)

    // Cleanup resize observer
    resizeObserver?.disconnect()
    resizeObserver = null

    // Dispose terminal
    terminal?.dispose()
    terminal = null
    fitAddon = null
    searchAddon = null
    webLinksAddon = null
    instance.value = null
  }

  // Auto-init when container is available (client-side only)
  if (typeof window !== 'undefined') {
    watch(containerRef, (el) => {
      if (el && !terminal) {
        initTerminal()
      }
    })

    // Watch for theme changes
    watch(currentTheme, (theme) => {
      applyTheme(theme)
    })

    // Cleanup on unmount
    onUnmounted(() => {
      isMounted = false
      dispose()
    })
  }

  return {
    containerRef,
    instance,
    isConnected,
    sessionId,
    write,
    writeln,
    clear,
    reset,
    focus,
    blur,
    fit,
    search,
    searchNext,
    searchPrevious,
    applyTheme,
    setFontSize,
    dispose,
    reconnect: connectPty,
  }
}
