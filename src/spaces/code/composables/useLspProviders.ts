/**
 * LSP providers composable — completion, hover, definition providers for Monaco,
 * plus file open/close/change handlers and watchers.
 */
import type * as Monaco from 'monaco-editor'
import { useMonacoLsp } from './useMonacoLsp'

interface CodeEditorState {
  currentFile: string
  fileContent: string
  rootPath: string
  currentLanguage: string
}

export function useLspProviders(
  state: CodeEditorState,
  editorRef: Ref<Monaco.editor.IStandaloneCodeEditor | null>,
  openFile: (path: string) => Promise<void>,
  updateContent: (value: string) => void,
  isMounted: Ref<boolean>,
  trackTimeout: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>,
) {
  const {
    setRootPath: setLspRootPath,
    startLanguageServer,
    stopAllServers,
    didOpen,
    didChange,
    didClose,
    getCompletions,
    getHover,
    getDefinition,
    getConnectionStatus,
    getLanguageForFile,
    ensureServersInstalled,
  } = useMonacoLsp()

  const lspEnabled = ref(true)
  const documentVersion = ref(0)
  const isNavigating = ref(false)

  // ── File lifecycle handlers ────────────────────────────────────────

  const handleLspFileOpen = async (filePath: string, content: string, _languageId: string) => {
    if (!lspEnabled.value) return

    const lspLanguage = getLanguageForFile(filePath)
    if (!lspLanguage) return

    try {
      if (!getConnectionStatus(lspLanguage)) {
        const serverStartPromise = startLanguageServer(lspLanguage)
        const timeoutPromise = new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Server start timeout')), 10000)
        )
        await Promise.race([serverStartPromise, timeoutPromise])
      }

      if (getConnectionStatus(lspLanguage)) {
        documentVersion.value = 1
        await didOpen(lspLanguage, `file://${filePath}`, content, documentVersion.value)
      }
    } catch (err) {
      console.error(`[LSP] Failed to open file with LSP:`, err)
    }
  }

  const handleLspFileChange = async (filePath: string, content: string) => {
    if (!lspEnabled.value) return

    const lspLanguage = getLanguageForFile(filePath)
    if (!lspLanguage || !getConnectionStatus(lspLanguage)) return

    documentVersion.value++
    await didChange(lspLanguage, `file://${filePath}`, content, documentVersion.value)
  }

  const handleLspFileClose = async (filePath: string) => {
    if (!lspEnabled.value) return

    const lspLanguage = getLanguageForFile(filePath)
    if (!lspLanguage || !getConnectionStatus(lspLanguage)) return

    await didClose(lspLanguage, `file://${filePath}`)
  }

  // ── Combined content change handler ────────────────────────────────

  const handleContentChange = (value: string) => {
    updateContent(value)
    if (state.currentFile && lspEnabled.value) {
      handleLspFileChange(state.currentFile, value)
    }
  }

  // ── Watchers ───────────────────────────────────────────────────────

  // Handle LSP file open/close when current file changes
  watch(() => state.currentFile, async (newFile, oldFile) => {
    if (isNavigating.value) {
      await new Promise(resolve => setTimeout(resolve, 150))
      if (!isMounted.value) return
    }

    if (oldFile && lspEnabled.value) {
      try { await handleLspFileClose(oldFile) }
      catch (err) { console.error('[LSP] Error closing file:', err) }
    }

    if (!isMounted.value) return

    if (newFile && lspEnabled.value && state.fileContent) {
      const languageId = getLanguageForFile(newFile)
      if (languageId) {
        try { await handleLspFileOpen(newFile, state.fileContent, languageId) }
        catch (err) { console.error('[LSP] Error opening file:', err) }
      }
    }
  })

  // Set LSP root path when rootPath changes and auto-install missing servers
  watch(() => state.rootPath, async (newPath) => {
    if (newPath && lspEnabled.value) {
      setLspRootPath(newPath)
      ensureServersInstalled(newPath)
    }
  })

  // ── Completion kind mapper ─────────────────────────────────────────

  const mapCompletionKind = (kind: number | undefined, monaco: typeof Monaco): Monaco.languages.CompletionItemKind => {
    if (!kind) return monaco.languages.CompletionItemKind.Text

    const kindMap: Record<number, Monaco.languages.CompletionItemKind> = {
      1: monaco.languages.CompletionItemKind.Text,
      2: monaco.languages.CompletionItemKind.Method,
      3: monaco.languages.CompletionItemKind.Function,
      4: monaco.languages.CompletionItemKind.Constructor,
      5: monaco.languages.CompletionItemKind.Field,
      6: monaco.languages.CompletionItemKind.Variable,
      7: monaco.languages.CompletionItemKind.Class,
      8: monaco.languages.CompletionItemKind.Interface,
      9: monaco.languages.CompletionItemKind.Module,
      10: monaco.languages.CompletionItemKind.Property,
      11: monaco.languages.CompletionItemKind.Unit,
      12: monaco.languages.CompletionItemKind.Value,
      13: monaco.languages.CompletionItemKind.Enum,
      14: monaco.languages.CompletionItemKind.Keyword,
      15: monaco.languages.CompletionItemKind.Snippet,
      16: monaco.languages.CompletionItemKind.Color,
      17: monaco.languages.CompletionItemKind.File,
      18: monaco.languages.CompletionItemKind.Reference,
      19: monaco.languages.CompletionItemKind.Folder,
      20: monaco.languages.CompletionItemKind.EnumMember,
      21: monaco.languages.CompletionItemKind.Constant,
      22: monaco.languages.CompletionItemKind.Struct,
      23: monaco.languages.CompletionItemKind.Event,
      24: monaco.languages.CompletionItemKind.Operator,
      25: monaco.languages.CompletionItemKind.TypeParameter,
    }

    return kindMap[kind] || monaco.languages.CompletionItemKind.Text
  }

  // ── Register providers with Monaco ─────────────────────────────────

  const registerLspProviders = (monaco: typeof Monaco, _editor: Monaco.editor.IStandaloneCodeEditor) => {
    // Completion provider
    monaco.languages.registerCompletionItemProvider('*', {
      triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '#'],
      provideCompletionItems: async (_model, position) => {
        const filePath = state.currentFile
        if (!filePath) return { suggestions: [] }

        const languageId = getLanguageForFile(filePath)
        if (!languageId || !getConnectionStatus(languageId)) {
          return { suggestions: [] }
        }

        try {
          const fileUri = `file://${filePath}`
          const result = await getCompletions(
            languageId,
            fileUri,
            { line: position.lineNumber - 1, character: position.column - 1 }
          ) as { items?: unknown[]; isIncomplete?: boolean } | unknown[] | null

          if (!result) return { suggestions: [] }

          const items = Array.isArray(result) ? result : (result.items || [])

          const suggestions = items.map((item: unknown) => {
            const i = item as {
              label: string | { label: string }
              kind?: number
              detail?: string
              documentation?: string | { value: string }
              insertText?: string
              insertTextFormat?: number
              textEdit?: { newText: string }
            }
            const label = typeof i.label === 'string' ? i.label : i.label?.label || ''
            return {
              label,
              kind: mapCompletionKind(i.kind, monaco),
              detail: i.detail,
              documentation: typeof i.documentation === 'string'
                ? i.documentation
                : i.documentation?.value,
              insertText: i.textEdit?.newText || i.insertText || label,
              insertTextRules: i.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              range: undefined as unknown as Monaco.IRange,
            }
          })

          return { suggestions }
        } catch (error) {
          console.error('[LSP] Completion error:', error)
          return { suggestions: [] }
        }
      },
    })

    // Hover provider
    monaco.languages.registerHoverProvider('*', {
      provideHover: async (_model, position) => {
        const filePath = state.currentFile
        if (!filePath) return null

        const languageId = getLanguageForFile(filePath)
        if (!languageId || !getConnectionStatus(languageId)) {
          return null
        }

        try {
          const fileUri = `file://${filePath}`
          const result = await getHover(
            languageId,
            fileUri,
            { line: position.lineNumber - 1, character: position.column - 1 }
          ) as { contents: unknown; range?: unknown } | null

          if (!result?.contents) return null

          const contents = Array.isArray(result.contents)
            ? result.contents
            : [result.contents]

          return {
            contents: contents.map((c: unknown) => {
              if (typeof c === 'string') {
                return { value: c }
              }
              const content = c as { value?: string; language?: string; kind?: string }
              return {
                value: content.value || '',
                isTrusted: true,
              }
            }),
          }
        } catch (error) {
          console.error('[LSP] Hover error:', error)
          return null
        }
      },
    })

    // Definition provider
    monaco.languages.registerDefinitionProvider('*', {
      provideDefinition: async (_model, position) => {
        if (isNavigating.value) return null

        const filePath = state.currentFile
        if (!filePath) return null

        const languageId = getLanguageForFile(filePath)
        if (!languageId || !getConnectionStatus(languageId)) {
          return null
        }

        try {
          const fileUri = `file://${filePath}`
          const result = await getDefinition(
            languageId,
            fileUri,
            { line: position.lineNumber - 1, character: position.column - 1 }
          ) as unknown

          console.log('[LSP Definition] Raw result:', result)

          if (!result) return null

          const locations = Array.isArray(result) ? result : [result]

          if (locations.length > 0) {
            const firstLoc = locations[0] as {
              uri: string
              range: { start: { line: number; character: number }; end: { line: number; character: number } }
            }

            const targetPath = firstLoc.uri.replace('file://', '')
            const targetLine = firstLoc.range.start.line + 1
            const targetColumn = firstLoc.range.start.character + 1

            console.log('[LSP Definition] Navigating to:', targetPath, 'line:', targetLine)

            if (targetPath !== filePath) {
              isNavigating.value = true

              trackTimeout(async () => {
                if (!isMounted.value) { isNavigating.value = false; return }
                try {
                  await openFile(targetPath)
                  if (!isMounted.value) return
                  await new Promise(resolve => setTimeout(resolve, 100))
                  if (!isMounted.value) return

                  if (editorRef.value) {
                    editorRef.value.setPosition({ lineNumber: targetLine, column: targetColumn })
                    editorRef.value.revealLineInCenter(targetLine)
                  }
                } catch (err) {
                  console.error('[LSP Definition] Failed to open file:', err)
                } finally {
                  trackTimeout(() => { isNavigating.value = false }, 300)
                }
              }, 0)

              return null
            } else {
              if (editorRef.value) {
                editorRef.value.setPosition({ lineNumber: targetLine, column: targetColumn })
                editorRef.value.revealLineInCenter(targetLine)
              }
              return null
            }
          }

          return locations.map((loc: unknown) => {
            const l = loc as {
              uri: string
              range: { start: { line: number; character: number }; end: { line: number; character: number } }
            }
            return {
              uri: monaco.Uri.parse(l.uri),
              range: {
                startLineNumber: l.range.start.line + 1,
                startColumn: l.range.start.character + 1,
                endLineNumber: l.range.end.line + 1,
                endColumn: l.range.end.character + 1,
              },
            }
          })
        } catch (error) {
          console.error('[LSP] Definition error:', error)
          return null
        }
      },
    })
  }

  // ── Init / Dispose ─────────────────────────────────────────────────

  /** Call during onMounted if rootPath is already available */
  function initLsp() {
    if (state.rootPath && lspEnabled.value) {
      setLspRootPath(state.rootPath)
    }
  }

  /** Call during onUnmounted */
  async function disposeLsp() {
    if (lspEnabled.value) {
      await stopAllServers()
    }
  }

  return {
    lspEnabled,
    registerLspProviders,
    handleContentChange,
    initLsp,
    disposeLsp,
  }
}
