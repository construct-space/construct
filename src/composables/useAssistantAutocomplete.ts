/**
 * useAssistantAutocomplete — Autocomplete system for the AI Assistant input.
 *
 * Handles trigger detection (@, #, ~, $, !, ^, /), suggestion filtering,
 * keyboard navigation, and selection insertion.
 *
 * Extracted from AssistantFloat.vue.
 */
import { computed, nextTick, ref, type Ref, type ComputedRef } from 'vue'
import type { DesignNode } from '~/types/design'
import type { DocumentListItem, UIDesign, ProjectFile, TaskCacheItem } from '~/types/assistant'
import type { Agent as AgentInfo } from '~/composables/useContextService'
import { listAvailableDesigns } from '~/composables/useCanvasContext'
import { useContextService } from '~/composables/useContextService'
import { getFileIcon, taskStatusIcons } from '~/composables/useAssistantData'

interface AutocompleteDeps {
  message: Ref<string>
  inputRef: Ref<HTMLInputElement | null>
  isLoading: Ref<boolean>
  projectDesigns: Ref<UIDesign[]>
  syncApiDesigns: Ref<UIDesign[]>
  projectDocs: Ref<DocumentListItem[]>
  localDocs: Ref<{ title: string; path: string; type: string }[]>
  projectFiles: Ref<ProjectFile[]>
  busTasksCache: Ref<TaskCacheItem[]>
  codeEditorRootPath: ComputedRef<string> | Ref<string>
  stopGeneration: () => void
  sendMessage: () => void
}

export function useAssistantAutocomplete(deps: AutocompleteDeps) {
  const {
    message, inputRef, isLoading,
    projectDesigns, syncApiDesigns, projectDocs, localDocs,
    projectFiles, busTasksCache, codeEditorRootPath,
    stopGeneration, sendMessage,
  } = deps

  // Autocomplete state
  const showAutocomplete = ref(false)
  const autocompleteType = ref<'design' | 'task' | 'component' | 'file' | 'codeFile' | 'doc' | 'command' | null>(null)
  const autocompleteQuery = ref('')
  const autocompleteIndex = ref(0)
  const autocompleteStartPos = ref(0)

  // Input history for up/down arrow navigation
  const inputHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const tempInput = ref('')

  // Agents
  const agents = ref<AgentInfo[]>([])

  async function loadAgents() {
    try {
      const { listAgents } = useContextService()
      const response = await listAgents()
      agents.value = response.agents
    } catch {
      agents.value = [
        { id: 'code', name: 'Code Agent', category: 'specialized', description: 'Full codebase access for development', icon: 'lucide:code', isBuiltin: true },
        { id: 'design', name: 'Design Agent', category: 'specialized', description: 'UI/UX design assistant', icon: 'lucide:palette', isBuiltin: true },
        { id: 'kanban', name: 'Kanban Agent', category: 'specialized', description: 'Project management', icon: 'lucide:kanban', isBuiltin: true },
        { id: 'git', name: 'Git Agent', category: 'specialized', description: 'Version control', icon: 'lucide:git-branch', isBuiltin: true },
        { id: 'explorer', name: 'Explorer Agent', category: 'specialized', description: 'Codebase exploration', icon: 'lucide:compass', isBuiltin: true },
        { id: 'planner', name: 'Planner Agent', category: 'specialized', description: 'Technical planning', icon: 'lucide:clipboard-list', isBuiltin: true },
      ]
    }
  }

  // Slash commands
  const slashCommands = computed(() => {
    const commands = [
      { label: 'agents', description: 'List all available specialized agents', icon: 'i-lucide-users', type: 'command' },
      { label: 'analyze', description: 'Analyze intent and suggest best agent', icon: 'i-lucide-search', type: 'command' },
      { label: 'help', description: 'Show all available commands', icon: 'i-lucide-help-circle', type: 'command' },
      { label: 'clear', description: 'Clear conversation history', icon: 'i-lucide-trash-2', type: 'command' },
    ]
    for (const agent of agents.value) {
      const iconName = agent.icon ? `i-${agent.icon.replace(':', '-')}` : 'i-lucide-bot'
      commands.push({ label: agent.id, description: agent.description, icon: iconName, type: 'agent' })
    }
    return commands
  })

  // Autocomplete suggestions
  const autocompleteSuggestions = computed(() => {
    if (!autocompleteType.value) return []
    const query = autocompleteQuery.value.toLowerCase()

    switch (autocompleteType.value) {
      case 'design': {
        const dbDesigns = projectDesigns.value
        const cloudDesigns = syncApiDesigns.value
        const memoryDesigns = listAvailableDesigns()
        const allDesignNames = new Set<string>()
        const allDesigns: { name: string; nodeCount: number; source: 'cloud' | 'local' | 'memory' }[] = []
        for (const d of cloudDesigns) {
          if (!allDesignNames.has(d.name.toLowerCase())) {
            allDesignNames.add(d.name.toLowerCase())
            allDesigns.push({ name: d.name, nodeCount: (d.nodes as DesignNode[] | undefined)?.length || 0, source: 'cloud' })
          }
        }
        for (const d of dbDesigns) {
          if (!allDesignNames.has(d.name.toLowerCase())) {
            allDesignNames.add(d.name.toLowerCase())
            allDesigns.push({ name: d.name, nodeCount: (d.nodes as DesignNode[] | undefined)?.length || 0, source: 'local' })
          }
        }
        for (const name of memoryDesigns) {
          if (!allDesignNames.has(name.toLowerCase())) {
            allDesignNames.add(name.toLowerCase())
            allDesigns.push({ name, nodeCount: 0, source: 'memory' })
          }
        }
        if (allDesigns.length === 0) {
          return [{ label: 'No designs available', icon: 'i-lucide-layout', type: 'design' as const, disabled: true }]
        }
        return allDesigns
          .filter(d => d.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map(d => ({
            label: d.name,
            sublabel: d.nodeCount > 0
              ? `${d.nodeCount} elements${d.source === 'cloud' ? ' (cloud)' : d.source === 'local' ? ' (local)' : ''}`
              : d.source === 'cloud' ? '(cloud)' : d.source === 'local' ? '(local)' : undefined,
            icon: d.source === 'cloud' ? 'i-lucide-cloud' : 'i-lucide-layout',
            type: 'design' as const,
          }))
      }
      case 'task': {
        const tasks = busTasksCache.value
        if (tasks.length === 0) {
          return [{ label: 'No tasks loaded', icon: 'i-lucide-check-square', type: 'task' as const, disabled: true }]
        }
        return tasks
          .filter(t => t.id.toString().includes(query) || t.title.toLowerCase().includes(query))
          .slice(0, 8)
          .map(t => ({
            label: `${t.id}`,
            sublabel: t.title,
            icon: taskStatusIcons[t.status] || 'i-lucide-check-square',
            priority: t.priority,
            type: 'task' as const,
          }))
      }
      case 'doc': {
        const allDocNames = new Set<string>()
        const allDocs: { title: string; docType: string; source: 'cloud' | 'local' }[] = []
        for (const d of projectDocs.value) {
          if (!allDocNames.has(d.title.toLowerCase())) {
            allDocNames.add(d.title.toLowerCase())
            allDocs.push({ title: d.title, docType: d.type, source: 'cloud' })
          }
        }
        for (const d of localDocs.value) {
          if (!allDocNames.has(d.title.toLowerCase())) {
            allDocNames.add(d.title.toLowerCase())
            allDocs.push({ title: d.title, docType: d.type, source: 'local' })
          }
        }
        if (allDocs.length === 0) {
          return [{ label: 'No documents available', icon: 'i-lucide-file-text', type: 'doc' as const, disabled: true }]
        }
        return allDocs
          .filter(d => d.title.toLowerCase().includes(query))
          .slice(0, 8)
          .map(d => ({
            label: d.title,
            sublabel: `${d.docType}${d.source === 'local' ? ' (local)' : ''}`,
            icon: d.docType === 'prd' ? 'i-lucide-clipboard-list' : d.docType === 'architecture' ? 'i-lucide-boxes' : d.docType === 'readme' ? 'i-lucide-book-open' : 'i-lucide-file-text',
            type: 'doc' as const,
          }))
      }
      case 'component':
        return [{ label: 'Components will appear here', icon: 'i-lucide-component', type: 'component' as const, disabled: true }]
      case 'codeFile': {
        if (projectFiles.value.length === 0) {
          return [{ label: 'No project files loaded', icon: 'i-lucide-folder-open', type: 'codeFile' as const, disabled: true }]
        }
        const filtered = projectFiles.value.filter(f =>
          f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query),
        )
        if (filtered.length === 0) {
          return [{ label: 'No matching files', icon: 'i-lucide-file-x', type: 'codeFile' as const, disabled: true }]
        }
        const root = codeEditorRootPath.value
        return filtered.slice(0, 10).map((f) => {
          const relativePath = root && f.path.startsWith(root) ? f.path.slice(root.length + 1) : f.path
          const parentDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/') + 1) : ''
          return {
            label: f.name,
            sublabel: parentDir || '/',
            fullPath: relativePath,
            icon: getFileIcon(f.name),
            type: 'codeFile' as const,
          }
        })
      }
      case 'command': {
        const filtered = slashCommands.value.filter(c => c.label.toLowerCase().includes(query))
        return filtered.map(c => ({
          label: `/${c.label}`,
          sublabel: c.description,
          icon: c.icon,
          type: 'command' as const,
          commandType: c.type,
        }))
      }
      default:
        return []
    }
  })

  // Input handler — detect trigger characters
  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement
    const value = input.value
    const cursorPos = input.selectionStart || 0

    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      autocompleteStartPos.value = 0
      autocompleteQuery.value = slashMatch[1] || ''
      autocompleteIndex.value = 0
      autocompleteType.value = 'command'
      showAutocomplete.value = true
      return
    }

    const textBeforeCursor = value.substring(0, cursorPos)
    const triggerMatch = textBeforeCursor.match(/(?:^|\s)([@#~$!^])(\S*)$/)

    if (triggerMatch) {
      const trigger = triggerMatch[1]
      const q = triggerMatch[2] || ''
      autocompleteStartPos.value = cursorPos - q.length - 1
      autocompleteQuery.value = q
      autocompleteIndex.value = 0

      switch (trigger) {
        case '@': autocompleteType.value = 'design'; break
        case '#': autocompleteType.value = 'task'; break
        case '~': autocompleteType.value = 'component'; break
        case '$': case '!': autocompleteType.value = 'codeFile'; break
        case '^': autocompleteType.value = 'doc'; break
      }
      showAutocomplete.value = true
    } else {
      showAutocomplete.value = false
      autocompleteType.value = null
    }
  }

  // Keyboard handler
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isLoading.value) {
      e.preventDefault()
      stopGeneration()
      return
    }

    if (showAutocomplete.value && autocompleteSuggestions.value.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          autocompleteIndex.value = (autocompleteIndex.value + 1) % autocompleteSuggestions.value.length
          break
        case 'ArrowUp':
          e.preventDefault()
          autocompleteIndex.value = autocompleteIndex.value <= 0
            ? autocompleteSuggestions.value.length - 1
            : autocompleteIndex.value - 1
          break
        case 'Enter':
        case 'Tab': {
          e.preventDefault()
          const suggestion = autocompleteSuggestions.value[autocompleteIndex.value]
          if (suggestion) selectAutocomplete(suggestion)
          break
        }
        case 'Escape':
          e.preventDefault()
          showAutocomplete.value = false
          break
      }
      return
    }

    if (e.key === 'ArrowUp' && inputHistory.value.length > 0) {
      e.preventDefault()
      if (historyIndex.value === -1) {
        tempInput.value = message.value
        historyIndex.value = inputHistory.value.length - 1
      } else if (historyIndex.value > 0) {
        historyIndex.value--
      }
      message.value = inputHistory.value[historyIndex.value] || ''
      return
    }

    if (e.key === 'ArrowDown' && historyIndex.value !== -1) {
      e.preventDefault()
      if (historyIndex.value < inputHistory.value.length - 1) {
        historyIndex.value++
        message.value = inputHistory.value[historyIndex.value] || ''
      } else {
        historyIndex.value = -1
        message.value = tempInput.value
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Select an autocomplete suggestion
  function selectAutocomplete(suggestion: { label: string; sublabel?: string; fullPath?: string; type: string }) {
    if (!suggestion || !autocompleteType.value) return

    if (autocompleteType.value === 'command') {
      message.value = suggestion.label + ' '
      showAutocomplete.value = false
      autocompleteType.value = null
      nextTick(() => inputRef.value?.focus())
      return
    }

    const triggerMap: Record<string, string> = {
      design: '@', task: '#', component: '~', codeFile: '!', doc: '^',
    }
    const trigger = triggerMap[autocompleteType.value] || '@'
    const insertValue = autocompleteType.value === 'codeFile' && suggestion.fullPath
      ? suggestion.fullPath
      : suggestion.label

    const before = message.value.substring(0, autocompleteStartPos.value)
    const after = message.value.substring(autocompleteStartPos.value + autocompleteQuery.value.length + 1)
    message.value = `${before}${trigger}${insertValue} ${after}`
    showAutocomplete.value = false
    autocompleteType.value = null
    nextTick(() => inputRef.value?.focus())
  }

  return {
    showAutocomplete,
    autocompleteType,
    autocompleteQuery,
    autocompleteIndex,
    autocompleteStartPos,
    autocompleteSuggestions,
    inputHistory,
    historyIndex,
    tempInput,
    agents,
    slashCommands,
    handleInput,
    handleKeydown,
    selectAutocomplete,
    loadAgents,
  }
}
