/**
 * Inline AI edit composable — Cmd+K edit selection, diff review, accept/reject.
 */
import type * as Monaco from 'monaco-editor'

interface CodeEditorState {
  currentFile: string
  currentLanguage: string
}

export function useInlineAiEdit(
  editorRef: Ref<Monaco.editor.IStandaloneCodeEditor | null>,
  monacoInstance: Ref<typeof Monaco | null>,
  state: CodeEditorState,
  monacoTheme: ComputedRef<string>,
  editorSettings: { fontSize: number; fontFamily: string },
  isMounted: Ref<boolean>,
) {
  const showInlineEdit = ref(false)
  const inlineEditInstruction = ref('')
  const inlineEditLoading = ref(false)
  const inlineEditOriginal = ref('')
  const inlineEditModified = ref('')
  const inlineEditRange = ref<{ startLine: number; endLine: number } | null>(null)
  const showDiffReview = ref(false)
  const diffEditorRef = ref<HTMLElement | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let diffEditorInstance: any = null

  async function submitInlineEdit() {
    if (!inlineEditInstruction.value.trim() || !editorRef.value || inlineEditLoading.value) return

    const editor = editorRef.value
    const selection = editor.getSelection()
    if (!selection || selection.isEmpty()) return

    const model = editor.getModel()
    if (!model) return

    const selectedText = model.getValueInRange(selection)
    inlineEditOriginal.value = selectedText
    inlineEditRange.value = { startLine: selection.startLineNumber, endLine: selection.endLineNumber }
    inlineEditLoading.value = true

    try {
      const { chatStream } = useContextService()
      const authStore = useAuthStore()
      const { defaultModelId, resolveModelId } = useAIModel()

      const prompt = `[INLINE_EDIT]
File: ${state.currentFile} (${state.currentLanguage})

Selected code (lines ${selection.startLineNumber}-${selection.endLineNumber}):
\`\`\`${state.currentLanguage}
${selectedText}
\`\`\`

Instruction: ${inlineEditInstruction.value}

Return ONLY the modified code. No explanation, no markdown fences, just the code.`

      let result = ''
      const token = authStore.token || undefined
      const modelId = resolveModelId(defaultModelId.value, { allowAuto: true, fallbackModelId: 'auto' })

      await chatStream(
        {
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          token,
          agent_id: 'code-assistant',
          space: 'code',
        },
        (chunk: { content: string; done: boolean }) => {
          if (chunk.content) result += chunk.content
        }
      )

      if (!isMounted.value) return

      const cleaned = result
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()

      if (cleaned) {
        inlineEditModified.value = cleaned
        showInlineEdit.value = false
        showDiffReview.value = true
        nextTick(() => createDiffEditor())
      }
    } catch (err) {
      console.error('[Code] Inline edit failed:', err)
    } finally {
      if (isMounted.value) {
        inlineEditLoading.value = false
      }
    }
  }

  function createDiffEditor() {
    if (!diffEditorRef.value || !monacoInstance.value) return

    const monaco = monacoInstance.value

    if (diffEditorInstance) {
      diffEditorInstance.dispose()
      diffEditorInstance = null
    }

    diffEditorInstance = monaco.editor.createDiffEditor(diffEditorRef.value, {
      theme: monacoTheme.value,
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      fontSize: editorSettings.fontSize,
      fontFamily: `${editorSettings.fontFamily}, Menlo, Monaco, Consolas, monospace`,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
    })

    const originalModel = monaco.editor.createModel(inlineEditOriginal.value, state.currentLanguage)
    const modifiedModel = monaco.editor.createModel(inlineEditModified.value, state.currentLanguage)

    diffEditorInstance.setModel({
      original: originalModel,
      modified: modifiedModel,
    })
  }

  function acceptDiff() {
    if (!editorRef.value || !inlineEditRange.value || !monacoInstance.value) return

    const editor = editorRef.value
    const model = editor.getModel()
    if (!model) return

    const range = new monacoInstance.value.Range(
      inlineEditRange.value.startLine,
      1,
      inlineEditRange.value.endLine,
      model.getLineMaxColumn(inlineEditRange.value.endLine)
    )

    editor.executeEdits('ai-inline-edit', [{
      range,
      text: inlineEditModified.value,
    }])

    closeDiffReview()
  }

  function rejectDiff() {
    closeDiffReview()
  }

  function closeDiffReview() {
    showDiffReview.value = false
    inlineEditOriginal.value = ''
    inlineEditModified.value = ''
    inlineEditRange.value = null

    if (diffEditorInstance) {
      diffEditorInstance.dispose()
      diffEditorInstance = null
    }
  }

  function dispose() {
    if (diffEditorInstance) {
      diffEditorInstance.dispose()
      diffEditorInstance = null
    }
  }

  return {
    showInlineEdit,
    inlineEditInstruction,
    inlineEditLoading,
    inlineEditRange,
    showDiffReview,
    diffEditorRef,
    submitInlineEdit,
    acceptDiff,
    rejectDiff,
    closeDiffReview,
    dispose,
  }
}
