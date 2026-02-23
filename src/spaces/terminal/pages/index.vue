<script setup lang="ts">
/**
 * Terminal Space - multi-terminal workspace (tmux-like panes)
 */
import Terminal from '../components/Terminal.vue'

interface TerminalPane {
  id: string
  title: string
  connected: boolean
}

interface TerminalExpose {
  clear: () => void
  focus: () => void
  blur: () => void
  fit: () => void
  reconnect: () => void
}

type LayoutMode = 'auto' | 'columns' | 'rows' | 'grid'

const projectStore = useProjectStore()
const { setPageItems, clearToolbar } = useToolbar()

const isMounted = ref(false)
const panes = ref<TerminalPane[]>([])
const activePaneId = ref<string | null>(null)
const layoutMode = ref<LayoutMode>('auto')
const paneRefs = ref(new Map<string, TerminalExpose>())

const workingDir = computed(() => projectStore.currentProject?.local_path || undefined)

const createPaneId = () => `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const getPaneIndex = (id: string) => panes.value.findIndex((pane) => pane.id === id)

const setPaneRef = (id: string, instance: unknown) => {
  if (instance && typeof instance === 'object') {
    paneRefs.value.set(id, instance as TerminalExpose)
  } else {
    paneRefs.value.delete(id)
  }
}

const focusPane = (id: string) => {
  activePaneId.value = id
  nextTick(() => {
    for (const [paneId, paneRef] of paneRefs.value.entries()) {
      if (paneId !== id) paneRef.blur()
    }
    paneRefs.value.get(id)?.focus()
  })
}

const addPane = () => {
  const index = panes.value.length + 1
  const pane: TerminalPane = {
    id: createPaneId(),
    title: `Terminal ${index}`,
    connected: false,
  }
  panes.value.push(pane)
  focusPane(pane.id)
}

const removePane = (id: string) => {
  if (panes.value.length <= 1) return

  const index = getPaneIndex(id)
  panes.value = panes.value.filter((pane) => pane.id !== id)
  paneRefs.value.delete(id)

  if (activePaneId.value === id) {
    const fallback = panes.value[Math.max(0, index - 1)] || panes.value[0]
    if (fallback) {
      focusPane(fallback.id)
    } else {
      activePaneId.value = null
    }
  }
}

const updatePaneTitle = (id: string, title: string) => {
  const pane = panes.value.find((item) => item.id === id)
  if (!pane) return
  pane.title = title?.trim() || pane.title
}

const updatePaneConnection = (id: string, connected: boolean) => {
  const pane = panes.value.find((item) => item.id === id)
  if (!pane) return
  pane.connected = connected
}

const clearActivePane = () => {
  const id = activePaneId.value
  if (!id) return
  paneRefs.value.get(id)?.clear()
}

const reconnectActivePane = () => {
  const id = activePaneId.value
  if (!id) return
  paneRefs.value.get(id)?.reconnect()
}

const cycleLayout = () => {
  const order: LayoutMode[] = ['auto', 'columns', 'rows', 'grid']
  const current = order.indexOf(layoutMode.value)
  layoutMode.value = order[(current + 1) % order.length] || 'auto'
}

const resolvedLayout = computed<'single' | 'columns' | 'rows' | 'grid'>(() => {
  if (panes.value.length <= 1) return 'single'
  if (layoutMode.value === 'auto') {
    if (panes.value.length === 2) return 'columns'
    return 'grid'
  }
  if (layoutMode.value === 'columns') return 'columns'
  if (layoutMode.value === 'rows') return 'rows'
  return 'grid'
})

const paneContainerClass = computed(() => {
  if (resolvedLayout.value === 'single') return 'grid-cols-1 grid-rows-1'
  if (resolvedLayout.value === 'columns') return 'grid-cols-2 grid-rows-1'
  if (resolvedLayout.value === 'rows') return 'grid-cols-1 grid-rows-2'
  return 'grid-cols-2 auto-rows-fr'
})

const paneSubtitle = computed(() => {
  const active = panes.value.find((pane) => pane.id === activePaneId.value)
  return active ? `${active.title} • ${panes.value.length} pane${panes.value.length === 1 ? '' : 's'}` : 'No active pane'
})

const handleKeydown = (event: KeyboardEvent) => {
  const isMeta = event.metaKey || event.ctrlKey
  if (!isMeta) return

  if (event.shiftKey && (event.key === 'T' || event.key === 't')) {
    event.preventDefault()
    addPane()
    return
  }

  if (event.key === 'w' || event.key === 'W') {
    event.preventDefault()
    if (activePaneId.value) removePane(activePaneId.value)
    return
  }

  if (event.key === 'k' || event.key === 'K') {
    event.preventDefault()
    clearActivePane()
    return
  }

  const numeric = Number(event.key)
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 9) {
    const target = panes.value[numeric - 1]
    if (target) {
      event.preventDefault()
      focusPane(target.id)
    }
  }
}

watch(
  panes,
  (value) => {
    if (value.length === 0) {
      addPane()
      return
    }
    if (!activePaneId.value || !value.some((pane) => pane.id === activePaneId.value)) {
      activePaneId.value = value[0]?.id || null
    }
  },
  { immediate: true }
)

const syncToolbar = () => {
  setPageItems([
    {
      id: 'terminal-new',
      icon: 'i-lucide-plus',
      label: 'New Terminal (⌘⇧T)',
      type: 'action',
      category: 'space',
      onClick: addPane,
    },
    {
      id: 'terminal-layout',
      icon: 'i-lucide-split-square-horizontal',
      label: `Layout: ${resolvedLayout.value}`,
      type: 'action',
      category: 'space',
      onClick: cycleLayout,
    },
    {
      id: 'terminal-clear',
      icon: 'i-lucide-trash-2',
      label: 'Clear Active (⌘K)',
      type: 'action',
      category: 'space',
      onClick: clearActivePane,
    },
  ])
}

watch([resolvedLayout, panes], () => {
  syncToolbar()
}, { deep: true })

onMounted(() => {
  isMounted.value = true
  syncToolbar()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  clearToolbar()
})
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden" style="background: var(--app-background)">
    <div
      class="h-10 px-3 shrink-0 flex items-center justify-between"
      style="background: var(--app-background); border-bottom: 1px solid var(--app-border)"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Icon name="i-lucide-terminal-square" class="size-4 shrink-0" style="color: var(--app-muted)" />
        <span class="text-sm truncate" style="color: var(--app-foreground)">
          {{ paneSubtitle }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <Button
          icon="i-lucide-split-square-horizontal"
          variant="ghost"
          color="neutral"
          size="xs"
          :title="`Cycle Layout (${resolvedLayout})`"
          @click="cycleLayout"
        />
        <Button
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="xs"
          title="Reconnect Active Terminal"
          @click="reconnectActivePane"
        />
        <Button
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          title="New Terminal (⌘⇧T)"
          @click="addPane"
        />
      </div>
    </div>

    <div class="h-9 px-2 shrink-0 flex items-center gap-1 overflow-x-auto border-b border-white/10">
      <button
        v-for="(pane, index) in panes"
        :key="pane.id"
        class="group h-7 px-2 rounded-md flex items-center gap-2 min-w-0"
        :class="activePaneId === pane.id ? 'bg-white/10 text-white' : 'text-app-muted hover:bg-white/5'"
        @click="focusPane(pane.id)"
      >
        <span
          class="size-1.5 rounded-full shrink-0"
          :class="pane.connected ? 'bg-green-500' : 'bg-red-500'"
        />
        <span class="text-xs truncate max-w-36">
          {{ index + 1 }}. {{ pane.title }}
        </span>
        <Button
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          class="opacity-0 group-hover:opacity-100"
          :disabled="panes.length <= 1"
          @click.stop="removePane(pane.id)"
        />
      </button>
    </div>

    <div class="flex-1 p-2 overflow-hidden">
      <div v-if="isMounted" class="h-full w-full grid gap-2" :class="paneContainerClass">
        <div
          v-for="pane in panes"
          :key="pane.id"
          class="min-h-0 min-w-0 rounded-md overflow-hidden border"
          :class="activePaneId === pane.id ? 'border-app-accent/70 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]' : 'border-white/10'"
          @mousedown="focusPane(pane.id)"
        >
          <Terminal
            :ref="(el) => setPaneRef(pane.id, el)"
            :cwd="workingDir"
            @title-change="(title) => updatePaneTitle(pane.id, title)"
            @connected="updatePaneConnection(pane.id, true)"
            @disconnected="updatePaneConnection(pane.id, false)"
          />
        </div>
      </div>
      <div v-else class="h-full flex items-center justify-center" style="background: var(--app-background)">
        <div class="flex items-center gap-2" style="color: var(--app-muted)">
          <Icon name="i-lucide-loader-2" class="size-5 animate-spin" />
          <span>Loading terminal...</span>
        </div>
      </div>
    </div>
  </div>
</template>
