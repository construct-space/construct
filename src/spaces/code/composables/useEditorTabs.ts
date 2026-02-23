/**
 * Editor tabs composable — open tabs, dirty tracking, tab operations + context menu.
 */

interface CodeEditorState {
  currentFile: string
  isDirty: boolean
  rootPath: string
}

interface TabEntry {
  path: string
  name: string
  isDirty: boolean
}

export function useEditorTabs(
  state: CodeEditorState,
  openFile: (path: string) => Promise<void>,
  closeFileEditor: () => void,
  copyPath: (path: string) => void,
  copyRelativePath: (path: string) => void,
  revealInFinder: (path: string) => void,
  getFileIcon: (entry: { name: string; path: string; isDirectory: boolean }) => string,
) {
  const openTabs = ref<TabEntry[]>([])
  const activeTabPath = computed(() => state.currentFile)

  const getTabIcon = (tab: { path: string; name: string }) => {
    return getFileIcon({ name: tab.name, path: tab.path, isDirectory: false })
  }

  // Add tab when file is opened
  watch(() => state.currentFile, (newFile) => {
    if (newFile && !openTabs.value.find(t => t.path === newFile)) {
      openTabs.value.push({
        path: newFile,
        name: newFile.split('/').pop() || 'Untitled',
        isDirty: false,
      })
    }
  }, { immediate: true })

  // Update tab dirty state
  watch(() => state.isDirty, (isDirty) => {
    const tab = openTabs.value.find(t => t.path === state.currentFile)
    if (tab) tab.isDirty = isDirty
  })

  const switchTab = (path: string) => {
    if (path !== state.currentFile) {
      openFile(path)
    }
  }

  const closeTab = (path: string, event?: Event) => {
    event?.stopPropagation()
    const index = openTabs.value.findIndex(t => t.path === path)
    if (index === -1) return

    openTabs.value.splice(index, 1)

    if (path === state.currentFile) {
      if (openTabs.value.length > 0) {
        const nextTab = openTabs.value[Math.min(index, openTabs.value.length - 1)]
        if (nextTab) openFile(nextTab.path)
      } else {
        closeFileEditor()
      }
    }
  }

  const closeOtherTabs = (path: string) => {
    openTabs.value = openTabs.value.filter(t => t.path === path)
    if (path !== state.currentFile) {
      openFile(path)
    }
  }

  const closeAllTabs = () => {
    openTabs.value = []
    closeFileEditor()
  }

  const closeTabsToRight = (path: string) => {
    const index = openTabs.value.findIndex(t => t.path === path)
    if (index !== -1) {
      openTabs.value = openTabs.value.slice(0, index + 1)
      if (!openTabs.value.find(t => t.path === state.currentFile)) {
        openFile(path)
      }
    }
  }

  const getTabContextMenuItems = (tabPath: string) => [
    [
      {
        label: 'Close',
        icon: 'i-lucide-x',
        shortcut: '⌘W',
        onSelect: () => closeTab(tabPath),
      },
      {
        label: 'Close Others',
        icon: 'i-lucide-x-circle',
        onSelect: () => closeOtherTabs(tabPath),
        disabled: openTabs.value.length <= 1,
      },
      {
        label: 'Close All',
        icon: 'i-lucide-x-square',
        onSelect: closeAllTabs,
      },
      {
        label: 'Close to the Right',
        icon: 'i-lucide-arrow-right-to-line',
        onSelect: () => closeTabsToRight(tabPath),
        disabled: openTabs.value.findIndex(t => t.path === tabPath) === openTabs.value.length - 1,
      },
    ],
    [
      {
        label: 'Copy Path',
        icon: 'i-lucide-copy',
        onSelect: () => copyPath(tabPath),
      },
      {
        label: 'Copy Relative Path',
        icon: 'i-lucide-file-text',
        onSelect: () => copyRelativePath(tabPath),
      },
    ],
    [
      {
        label: 'Reveal in Finder',
        icon: 'i-lucide-folder-search',
        onSelect: () => revealInFinder(tabPath),
      },
    ],
  ]

  return {
    openTabs,
    activeTabPath,
    getTabIcon,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    closeTabsToRight,
    getTabContextMenuItems,
  }
}
