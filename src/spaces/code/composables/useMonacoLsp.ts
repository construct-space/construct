/**
 * Monaco LSP Integration
 * Provides Language Server Protocol support for Monaco editor via Tauri
 */

import type * as Monaco from 'monaco-editor'

// LSP Server configuration
export interface LspServerConfig {
  languageId: string
  serverCommand: string
  serverArgs: string[]
  fileExtensions: string[]
  initializationOptions?: Record<string, unknown>
}

// Supported language servers
// Users need to have these installed on their system
export const LSP_SERVERS: Record<string, LspServerConfig> = {
  typescript: {
    languageId: 'typescript',
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  vue: {
    languageId: 'vue',
    serverCommand: 'vue-language-server',
    serverArgs: ['--stdio'],
    fileExtensions: ['.vue'],
    initializationOptions: {
      typescript: {
        tsdk: 'node_modules/typescript/lib',
      },
    },
  },
  dart: {
    languageId: 'dart',
    serverCommand: 'dart',
    serverArgs: ['language-server', '--protocol=lsp'],
    fileExtensions: ['.dart'],
    initializationOptions: {
      // Enable Flutter-specific features when Flutter SDK is detected
      suggestFromUnimportedLibraries: true,
      closingLabels: true,
      outline: true,
      flutterOutline: true,
    },
  },
  python: {
    languageId: 'python',
    serverCommand: 'pylsp',
    serverArgs: [],
    fileExtensions: ['.py', '.pyw'],
  },
  rust: {
    languageId: 'rust',
    serverCommand: 'rust-analyzer',
    serverArgs: [],
    fileExtensions: ['.rs'],
  },
  go: {
    languageId: 'go',
    serverCommand: 'gopls',
    serverArgs: [],
    fileExtensions: ['.go'],
  },
  json: {
    languageId: 'json',
    serverCommand: 'vscode-json-language-server',
    serverArgs: ['--stdio'],
    fileExtensions: ['.json', '.jsonc'],
  },
  css: {
    languageId: 'css',
    serverCommand: 'vscode-css-language-server',
    serverArgs: ['--stdio'],
    fileExtensions: ['.css', '.scss', '.less'],
  },
  html: {
    languageId: 'html',
    serverCommand: 'vscode-html-language-server',
    serverArgs: ['--stdio'],
    fileExtensions: ['.html', '.htm'],
  },
}

// LSP Message types
interface LspMessage {
  jsonrpc: string
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// Pending request tracking
interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

// Connection state
interface LspConnection {
  languageId: string
  isConnected: boolean
  isInitialized: boolean
  pendingRequests: Map<number | string, PendingRequest>
  capabilities?: unknown
  unlisten?: () => void
}

const connections = reactive<Map<string, LspConnection>>(new Map())
const isInitialized = ref(false)
let monacoInstance: typeof Monaco | null = null
let rootPath = ''

export const useMonacoLsp = () => {
  /**
   * Initialize Monaco with LSP support
   */
  const initializeMonaco = async (): Promise<typeof Monaco | null> => {
    if (isInitialized.value && monacoInstance) {
      return monacoInstance
    }

    try {
      if (typeof window === 'undefined') return null

      const monaco = await import('monaco-editor')
      monacoInstance = monaco
      isInitialized.value = true

      console.log('[Monaco LSP] Initialized Monaco editor')
      return monaco
    } catch (error) {
      console.error('[Monaco LSP] Failed to initialize Monaco:', error)
      return null
    }
  }

  /**
   * Set the workspace root path
   */
  const setRootPath = (path: string) => {
    rootPath = path
  }

  /**
   * Start a language server for a specific language
   */
  const startLanguageServer = async (languageId: string): Promise<boolean> => {
    const config = LSP_SERVERS[languageId]
    if (!config) {
      console.warn(`[Monaco LSP] No LSP server configured for: ${languageId}`)
      return false
    }

    if (!rootPath) {
      console.warn('[Monaco LSP] No root path set')
      return false
    }

    // Check if already connected
    const existing = connections.get(languageId)
    if (existing?.isConnected) {
      console.log(`[Monaco LSP] Server already running for: ${languageId}`)
      return true
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')

      // Listen for LSP messages from this server
      const unlistenFn = await listen<LspMessage>(`lsp-message-${languageId}`, (event) => {
        handleServerMessage(languageId, event.payload)
      })

      // Start the server via Tauri
      await invoke('lsp_start_server', {
        languageId,
        serverCommand: config.serverCommand,
        serverArgs: config.serverArgs,
        rootPath,
      })

      // Create connection state
      connections.set(languageId, {
        languageId,
        isConnected: true,
        isInitialized: false,
        pendingRequests: new Map(),
        unlisten: unlistenFn,
      })

      // Send initialize request
      const initResult = await sendRequest(languageId, 'initialize', {
        processId: null,
        rootUri: `file://${rootPath}`,
        capabilities: getClientCapabilities(),
        initializationOptions: config.initializationOptions || {},
        workspaceFolders: [
          {
            uri: `file://${rootPath}`,
            name: rootPath.split('/').pop(),
          },
        ],
      })

      // Send initialized notification
      await sendNotification(languageId, 'initialized', {})

      const conn = connections.get(languageId)
      if (conn) {
        conn.isInitialized = true
        conn.capabilities = (initResult as { capabilities?: unknown })?.capabilities
      }

      console.log(`[Monaco LSP] Server initialized for: ${languageId}`)
      return true
    } catch (error) {
      console.error(`[Monaco LSP] Failed to start server for ${languageId}:`, error)
      connections.delete(languageId)
      return false
    }
  }

  /**
   * Get client capabilities for LSP
   */
  const getClientCapabilities = () => ({
    textDocument: {
      synchronization: {
        dynamicRegistration: true,
        willSave: true,
        willSaveWaitUntil: true,
        didSave: true,
      },
      completion: {
        dynamicRegistration: true,
        completionItem: {
          snippetSupport: true,
          commitCharactersSupport: true,
          documentationFormat: ['markdown', 'plaintext'],
          deprecatedSupport: true,
          preselectSupport: true,
        },
        contextSupport: true,
      },
      hover: {
        dynamicRegistration: true,
        contentFormat: ['markdown', 'plaintext'],
      },
      signatureHelp: {
        dynamicRegistration: true,
        signatureInformation: {
          documentationFormat: ['markdown', 'plaintext'],
          parameterInformation: {
            labelOffsetSupport: true,
          },
        },
      },
      definition: {
        dynamicRegistration: true,
        linkSupport: true,
      },
      references: {
        dynamicRegistration: true,
      },
      documentHighlight: {
        dynamicRegistration: true,
      },
      documentSymbol: {
        dynamicRegistration: true,
        hierarchicalDocumentSymbolSupport: true,
      },
      codeAction: {
        dynamicRegistration: true,
        codeActionLiteralSupport: {
          codeActionKind: {
            valueSet: [
              'quickfix',
              'refactor',
              'refactor.extract',
              'refactor.inline',
              'refactor.rewrite',
              'source',
              'source.organizeImports',
            ],
          },
        },
      },
      formatting: {
        dynamicRegistration: true,
      },
      rangeFormatting: {
        dynamicRegistration: true,
      },
      rename: {
        dynamicRegistration: true,
        prepareSupport: true,
      },
      publishDiagnostics: {
        relatedInformation: true,
        tagSupport: {
          valueSet: [1, 2],
        },
      },
    },
    workspace: {
      applyEdit: true,
      workspaceEdit: {
        documentChanges: true,
      },
      didChangeConfiguration: {
        dynamicRegistration: true,
      },
      workspaceFolders: true,
      configuration: true,
    },
  })

  /**
   * Handle incoming LSP messages from server
   */
  const handleServerMessage = (languageId: string, message: LspMessage) => {
    const conn = connections.get(languageId)
    if (!conn) return

    // Handle responses to our requests (has id but no method)
    if (message.id !== undefined && !message.method) {
      const pending = conn.pendingRequests.get(message.id)
      if (pending) {
        conn.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
        return
      }
    }

    // Handle server-initiated requests (has both id and method)
    if (message.id !== undefined && message.method) {
      handleServerRequest(languageId, message.id, message.method, message.params)
      return
    }

    // Handle notifications from server (has method but no id)
    if (message.method) {
      handleNotification(languageId, message.method, message.params)
    }
  }

  /**
   * Handle server-initiated requests (requires a response)
   */
  const handleServerRequest = async (
    languageId: string,
    id: number | string,
    method: string,
    params: unknown
  ) => {
    let result: unknown

    switch (method) {
      case 'workspace/configuration': {
        // Server is asking for configuration settings
        const configParams = params as { items: Array<{ section?: string }> }
        result = configParams.items.map((item) => {
          // Return empty config for each requested section
          // gopls will use defaults
          if (item.section === 'gopls') {
            return {
              // gopls settings - use defaults
            }
          }
          return {}
        })
        break
      }
      case 'client/registerCapability':
      case 'client/unregisterCapability':
        // Acknowledge capability registration
        result = null
        break
      case 'window/workDoneProgress/create':
        // Acknowledge progress creation
        result = null
        break
      default:
        console.log(`[LSP ${languageId}] Unhandled server request: ${method}`)
        result = null
    }

    // Send response back to server
    await sendResponse(languageId, id, result)
  }

  /**
   * Send response to server request
   */
  const sendResponse = async (
    languageId: string,
    id: number | string,
    result: unknown
  ): Promise<void> => {
    const conn = connections.get(languageId)
    if (!conn?.isConnected) return

    const { invoke } = await import('@tauri-apps/api/core')

    const message: LspMessage = {
      jsonrpc: '2.0',
      id,
      result,
    }

    await invoke('lsp_send_message', {
      languageId,
      message,
    })
  }

  /**
   * Handle LSP notifications from server
   */
  const handleNotification = (languageId: string, method: string, params: unknown) => {
    if (!monacoInstance) return

    switch (method) {
      case 'textDocument/publishDiagnostics': {
        const diagParams = params as { uri: string; diagnostics: unknown[] }
        updateDiagnostics(diagParams.uri, diagParams.diagnostics)
        break
      }
      case 'window/showMessage': {
        const msgParams = params as { type: number; message: string }
        console.log(`[LSP ${languageId}] ${msgParams.message}`)
        break
      }
      case 'window/logMessage': {
        const logParams = params as { type: number; message: string }
        console.log(`[LSP ${languageId}] ${logParams.message}`)
        break
      }
    }
  }

  /**
   * Update Monaco diagnostics/markers
   */
  const updateDiagnostics = (uri: string, diagnostics: unknown[]) => {
    if (!monacoInstance) return

    const model = monacoInstance.editor.getModels().find(m => m.uri.toString() === uri)
    if (!model) return

    const markers = diagnostics.map((d: unknown) => {
      const diag = d as {
        range: { start: { line: number; character: number }; end: { line: number; character: number } }
        message: string
        severity?: number
        source?: string
        code?: string | number
      }
      return {
        severity: diag.severity === 1
          ? monacoInstance!.MarkerSeverity.Error
          : diag.severity === 2
            ? monacoInstance!.MarkerSeverity.Warning
            : diag.severity === 3
              ? monacoInstance!.MarkerSeverity.Info
              : monacoInstance!.MarkerSeverity.Hint,
        startLineNumber: diag.range.start.line + 1,
        startColumn: diag.range.start.character + 1,
        endLineNumber: diag.range.end.line + 1,
        endColumn: diag.range.end.character + 1,
        message: diag.message,
        source: diag.source,
        code: diag.code?.toString(),
      }
    })

    monacoInstance.editor.setModelMarkers(model, 'lsp', markers)
  }

  /**
   * Send LSP request to server
   */
  const sendRequest = async (
    languageId: string,
    method: string,
    params: unknown
  ): Promise<unknown> => {
    const conn = connections.get(languageId)
    if (!conn?.isConnected) {
      throw new Error(`No connection for: ${languageId}`)
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const id = await invoke<number>('lsp_next_id')

    const message: LspMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      conn.pendingRequests.set(id, { resolve, reject })

      invoke('lsp_send_message', {
        languageId,
        message,
      }).catch((error) => {
        conn.pendingRequests.delete(id)
        reject(error)
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (conn.pendingRequests.has(id)) {
          conn.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Send LSP notification to server (no response expected)
   */
  const sendNotification = async (
    languageId: string,
    method: string,
    params: unknown
  ): Promise<void> => {
    const conn = connections.get(languageId)
    if (!conn?.isConnected) {
      throw new Error(`No connection for: ${languageId}`)
    }

    const { invoke } = await import('@tauri-apps/api/core')

    const message: LspMessage = {
      jsonrpc: '2.0',
      method,
      params,
    }

    await invoke('lsp_send_message', {
      languageId,
      message,
    })
  }

  /**
   * Notify server of document open
   */
  const didOpen = async (languageId: string, uri: string, text: string, version: number = 1) => {
    await sendNotification(languageId, 'textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    })
  }

  /**
   * Notify server of document change
   */
  const didChange = async (languageId: string, uri: string, text: string, version: number) => {
    await sendNotification(languageId, 'textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    })
  }

  /**
   * Notify server of document close
   */
  const didClose = async (languageId: string, uri: string) => {
    await sendNotification(languageId, 'textDocument/didClose', {
      textDocument: { uri },
    })
  }

  /**
   * Request completions
   */
  const getCompletions = async (
    languageId: string,
    uri: string,
    position: { line: number; character: number }
  ) => {
    return sendRequest(languageId, 'textDocument/completion', {
      textDocument: { uri },
      position,
    })
  }

  /**
   * Request hover information
   */
  const getHover = async (
    languageId: string,
    uri: string,
    position: { line: number; character: number }
  ) => {
    return sendRequest(languageId, 'textDocument/hover', {
      textDocument: { uri },
      position,
    })
  }

  /**
   * Request go to definition
   */
  const getDefinition = async (
    languageId: string,
    uri: string,
    position: { line: number; character: number }
  ) => {
    return sendRequest(languageId, 'textDocument/definition', {
      textDocument: { uri },
      position,
    })
  }

  /**
   * Stop a language server
   */
  const stopLanguageServer = async (languageId: string) => {
    try {
      const conn = connections.get(languageId)
      if (conn) {
        if (conn.unlisten) {
          conn.unlisten()
        }
        // Reject all pending requests to prevent stale timeout callbacks
        for (const [id, pending] of conn.pendingRequests) {
          pending.reject(new Error('Server stopped'))
          conn.pendingRequests.delete(id)
        }
      }

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('lsp_stop_server', { languageId })
      connections.delete(languageId)
      console.log(`[Monaco LSP] Stopped server for: ${languageId}`)
    } catch (error) {
      console.error(`[Monaco LSP] Failed to stop server:`, error)
    }
  }

  /**
   * Stop all language servers
   */
  const stopAllServers = async () => {
    try {
      // Unlisten all event listeners and reject pending requests
      for (const conn of connections.values()) {
        if (conn.unlisten) {
          conn.unlisten()
        }
        // Reject all pending requests to prevent stale timeout callbacks
        for (const [id, pending] of conn.pendingRequests) {
          pending.reject(new Error('All servers stopped'))
          conn.pendingRequests.delete(id)
        }
      }

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('lsp_stop_all')
      connections.clear()
      console.log('[Monaco LSP] Stopped all servers')
    } catch (error) {
      console.error('[Monaco LSP] Failed to stop servers:', error)
    }
  }

  /**
   * Get Monaco instance
   */
  const getMonaco = () => monacoInstance

  /**
   * Check if LSP is available for a language
   */
  const isLspAvailable = (languageId: string): boolean => {
    return languageId in LSP_SERVERS
  }

  /**
   * Get connection status for a language
   */
  const getConnectionStatus = (languageId: string): boolean => {
    return connections.get(languageId)?.isConnected ?? false
  }

  /**
   * Get language ID for file extension
   */
  const getLanguageForFile = (filePath: string): string | null => {
    const ext = '.' + filePath.split('.').pop()?.toLowerCase()

    for (const [langId, config] of Object.entries(LSP_SERVERS)) {
      if (config.fileExtensions.includes(ext)) {
        return langId
      }
    }

    return null
  }

  /**
   * Check if a command/binary exists on the system
   */
  const checkCommandExists = async (command: string): Promise<boolean> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<boolean>('lsp_check_command', { command })
    } catch {
      return false
    }
  }

  /**
   * Install an LSP server for a language
   */
  const installServer = async (languageId: string): Promise<boolean> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke<string>('lsp_install_server', { languageId })
      console.log(`[Monaco LSP] Installed server for: ${languageId}`)
      return true
    } catch (error) {
      console.error(`[Monaco LSP] Failed to install server for ${languageId}:`, error)
      return false
    }
  }

  /**
   * Detect languages used in a project
   */
  const detectProjectLanguages = async (projectPath: string): Promise<string[]> => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string[]>('lsp_detect_languages', { rootPath: projectPath })
    } catch (error) {
      console.error('[Monaco LSP] Failed to detect languages:', error)
      return []
    }
  }

  /**
   * Ensure all required LSP servers are installed for a project
   * Auto-installs missing servers in background
   */
  const ensureServersInstalled = async (projectPath: string): Promise<void> => {
    const languages = await detectProjectLanguages(projectPath)
    console.log(`[Monaco LSP] Project languages: ${languages.join(', ')}`)

    // Map languages to their server commands
    const serverCommands: Record<string, string> = {
      typescript: 'typescript-language-server',
      vue: 'vue-language-server',
      dart: 'dart',  // Dart SDK includes the language server
      python: 'pylsp',
      go: 'gopls',
      rust: 'rust-analyzer',
      json: 'vscode-json-language-server',
      css: 'vscode-css-language-server',
      html: 'vscode-html-language-server',
    }

    for (const lang of languages) {
      const serverCommand = serverCommands[lang]
      if (!serverCommand) continue

      const exists = await checkCommandExists(serverCommand)
      if (!exists) {
        console.log(`[Monaco LSP] Installing missing server for: ${lang}`)
        // Install in background - don't await
        installServer(lang).catch(err =>
          console.error(`[Monaco LSP] Background install failed for ${lang}:`, err)
        )
      } else {
        console.log(`[Monaco LSP] Server already installed: ${serverCommand}`)
      }
    }
  }

  /**
   * Pre-install common LSP servers (called on app startup)
   */
  const preinstallCommonServers = async (): Promise<void> => {
    const commonServers = ['typescript', 'json']
    const serverCommands: Record<string, string> = {
      typescript: 'typescript-language-server',
      json: 'vscode-json-language-server',
    }

    for (const lang of commonServers) {
      const serverCommand = serverCommands[lang]
      if (!serverCommand) continue

      const exists = await checkCommandExists(serverCommand)
      if (!exists) {
        console.log(`[Monaco LSP] Pre-installing common server: ${lang}`)
        installServer(lang).catch(err =>
          console.error(`[Monaco LSP] Pre-install failed for ${lang}:`, err)
        )
      }
    }
  }

  return {
    // Initialization
    initializeMonaco,
    setRootPath,

    // Server management
    startLanguageServer,
    stopLanguageServer,
    stopAllServers,

    // Document sync
    didOpen,
    didChange,
    didClose,

    // Language features
    getCompletions,
    getHover,
    getDefinition,

    // Utilities
    getMonaco,
    isLspAvailable,
    getConnectionStatus,
    getLanguageForFile,

    // Auto-install
    checkCommandExists,
    installServer,
    detectProjectLanguages,
    ensureServersInstalled,
    preinstallCommonServers,

    // State
    isInitialized: readonly(isInitialized),
    connections: readonly(connections),
  }
}
