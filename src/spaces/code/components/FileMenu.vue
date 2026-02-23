<script setup lang="ts">
import { useCodeEditor } from '../composables/useCodeEditor'

/**
 * FileMenu - VS Code-like file menu dropdown
 * Provides New, Open, Save, Save As, Close actions
 */

const {
  state,
  newFile,
  openFolder,
  saveFile,
  saveFileAs,
  closeFile
} = useCodeEditor()

const toast = useToast()

// Handle save with feedback
async function handleSave() {
  if (!state.currentFile) {
    // No file open, do Save As
    await handleSaveAs()
    return
  }

  const success = await saveFile()
  if (success) {
    toast.add({
      title: 'File saved',
      description: state.currentFile.split('/').pop(),
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Failed to save',
      color: 'error'
    })
  }
}

// Handle save as with feedback
async function handleSaveAs() {
  const success = await saveFileAs()
  if (success) {
    toast.add({
      title: 'File saved',
      description: state.currentFile.split('/').pop(),
      color: 'success'
    })
  }
}

// Handle new file
function handleNewFile() {
  if (state.isDirty) {
    if (!confirm('You have unsaved changes. Create new file anyway?')) {
      return
    }
  }
  newFile()
}

// Handle close file
function handleCloseFile() {
  if (state.isDirty) {
    if (!confirm('You have unsaved changes. Close anyway?')) {
      return
    }
  }
  closeFile()
}

// Menu items
const menuItems = computed(() => [
  [
    {
      label: 'New File',
      icon: 'i-lucide-file-plus',
      kbds: ['meta', 'n'],
      onSelect: handleNewFile
    },
    {
      label: 'Open Folder...',
      icon: 'i-lucide-folder-open',
      kbds: ['meta', 'o'],
      onSelect: openFolder
    }
  ],
  [
    {
      label: 'Save',
      icon: 'i-lucide-save',
      kbds: ['meta', 's'],
      disabled: !state.currentFile && !state.fileContent,
      onSelect: handleSave
    },
    {
      label: 'Save As...',
      icon: 'i-lucide-save-all',
      kbds: ['shift', 'meta', 's'],
      disabled: !state.fileContent,
      onSelect: handleSaveAs
    }
  ],
  [
    {
      label: 'Close File',
      icon: 'i-lucide-x',
      kbds: ['meta', 'w'],
      disabled: !state.currentFile,
      onSelect: handleCloseFile
    }
  ]
])

// Register keyboard shortcuts from menu items (Nuxt compat stubs)
if (typeof defineShortcuts === 'function' && typeof extractShortcuts === 'function') {
  defineShortcuts(extractShortcuts(menuItems.value as unknown[]))
}
</script>

<template>
  <DropdownMenu :items="menuItems">
    <Button icon="i-lucide-file" label="File" variant="ghost" color="neutral" size="xs"
      trailing-icon="i-lucide-chevron-down" class="text-app-muted hover:text-app" />
  </DropdownMenu>
</template>
