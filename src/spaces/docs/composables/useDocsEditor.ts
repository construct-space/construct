/**
 * Docs Editor Composable
 * Handles auto-save, content management, and markdown toolbar actions
 */
import { useDebounceFn } from '@vueuse/core'

export function useDocsEditor() {
  const documentsStore = useDocumentsStore()
  const saving = ref(false)
  const lastSaved = ref<Date | null>(null)

  // Debounced save function
  const debouncedSave = useDebounceFn(async (id: number, content: string) => {
    saving.value = true
    try {
      await documentsStore.updateDocument(id, { content })
      lastSaved.value = new Date()
    } finally {
      saving.value = false
    }
  }, 1000)

  // Handle content changes with auto-save
  function handleContentChange(documentId: number, content: string) {
    debouncedSave(documentId, content)
  }

  // Save title
  async function saveTitle(documentId: number, title: string) {
    saving.value = true
    try {
      await documentsStore.updateDocument(documentId, { title })
      lastSaved.value = new Date()
    } finally {
      saving.value = false
    }
  }

  // Calculate word count
  function getWordCount(content: string): number {
    if (!content) return 0
    return content.trim().split(/\s+/).filter(Boolean).length
  }

  // Calculate character count
  function getCharCount(content: string): number {
    if (!content) return 0
    return content.length
  }

  /**
   * Insert markdown formatting around the current selection in a textarea.
   * Returns the new content string and the new cursor position.
   */
  function insertMarkdown(
    textarea: HTMLTextAreaElement,
    content: string,
    action: string
  ): { newContent: string; cursorStart: number; cursorEnd: number } {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    const before = content.substring(0, start)
    const after = content.substring(end)

    let insertion: string
    let cursorStart: number
    let cursorEnd: number

    switch (action) {
      case 'bold': {
        insertion = `**${selectedText || 'bold text'}**`
        cursorStart = selectedText ? start : start + 2
        cursorEnd = selectedText ? start + insertion.length : start + 2 + 9
        break
      }
      case 'italic': {
        insertion = `*${selectedText || 'italic text'}*`
        cursorStart = selectedText ? start : start + 1
        cursorEnd = selectedText ? start + insertion.length : start + 1 + 11
        break
      }
      case 'strikethrough': {
        insertion = `~~${selectedText || 'strikethrough'}~~`
        cursorStart = selectedText ? start : start + 2
        cursorEnd = selectedText ? start + insertion.length : start + 2 + 13
        break
      }
      case 'heading1': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}# ${selectedText || 'Heading'}`
        cursorStart = start + prefix.length + 2
        cursorEnd = start + insertion.length
        break
      }
      case 'heading2': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}## ${selectedText || 'Heading'}`
        cursorStart = start + prefix.length + 3
        cursorEnd = start + insertion.length
        break
      }
      case 'heading3': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}### ${selectedText || 'Heading'}`
        cursorStart = start + prefix.length + 4
        cursorEnd = start + insertion.length
        break
      }
      case 'bulletList': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        if (selectedText) {
          const lines = selectedText.split('\n')
          insertion = prefix + lines.map(line => `- ${line}`).join('\n')
        } else {
          insertion = `${prefix}- `
        }
        cursorStart = start + insertion.length
        cursorEnd = cursorStart
        break
      }
      case 'numberedList': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        if (selectedText) {
          const lines = selectedText.split('\n')
          insertion = prefix + lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
        } else {
          insertion = `${prefix}1. `
        }
        cursorStart = start + insertion.length
        cursorEnd = cursorStart
        break
      }
      case 'taskList': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        if (selectedText) {
          const lines = selectedText.split('\n')
          insertion = prefix + lines.map(line => `- [ ] ${line}`).join('\n')
        } else {
          insertion = `${prefix}- [ ] `
        }
        cursorStart = start + insertion.length
        cursorEnd = cursorStart
        break
      }
      case 'link': {
        if (selectedText) {
          insertion = `[${selectedText}](url)`
          cursorStart = start + selectedText.length + 3
          cursorEnd = start + selectedText.length + 6
        } else {
          insertion = '[link text](url)'
          cursorStart = start + 1
          cursorEnd = start + 10
        }
        break
      }
      case 'image': {
        insertion = `![${selectedText || 'alt text'}](url)`
        cursorStart = selectedText ? start + selectedText.length + 4 : start + 2
        cursorEnd = selectedText ? start + selectedText.length + 7 : start + 10
        break
      }
      case 'code': {
        if (selectedText.includes('\n')) {
          const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
          insertion = `${prefix}\`\`\`\n${selectedText}\n\`\`\``
          cursorStart = start + prefix.length + 4
          cursorEnd = start + prefix.length + 4 + selectedText.length
        } else {
          insertion = `\`${selectedText || 'code'}\``
          cursorStart = selectedText ? start : start + 1
          cursorEnd = selectedText ? start + insertion.length : start + 5
        }
        break
      }
      case 'codeBlock': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}\`\`\`\n${selectedText || ''}\n\`\`\``
        cursorStart = start + prefix.length + 4
        cursorEnd = start + prefix.length + 4 + (selectedText?.length || 0)
        break
      }
      case 'quote': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        if (selectedText) {
          const lines = selectedText.split('\n')
          insertion = prefix + lines.map(line => `> ${line}`).join('\n')
        } else {
          insertion = `${prefix}> `
        }
        cursorStart = start + insertion.length
        cursorEnd = cursorStart
        break
      }
      case 'horizontalRule': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}---\n`
        cursorStart = start + insertion.length
        cursorEnd = cursorStart
        break
      }
      case 'table': {
        const prefix = before.endsWith('\n') || before === '' ? '' : '\n'
        insertion = `${prefix}| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n`
        cursorStart = start + prefix.length + 2
        cursorEnd = start + prefix.length + 10
        break
      }
      default: {
        insertion = selectedText
        cursorStart = start
        cursorEnd = end
      }
    }

    const newContent = before + insertion + after
    return { newContent, cursorStart, cursorEnd }
  }

  return {
    saving,
    lastSaved,
    handleContentChange,
    saveTitle,
    getWordCount,
    getCharCount,
    insertMarkdown
  }
}
