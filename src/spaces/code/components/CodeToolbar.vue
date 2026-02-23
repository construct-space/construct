<script setup lang="ts">
/**
 * CodeToolbar - Tool selection and actions bar for Code space
 * Matches UIToolbar style with icon-only buttons and dropdowns
 */

type ProjectType = 'flutter' | 'nuxt' | 'bun' | 'node' | 'python' | 'rust' | 'go' | 'html' | 'unknown'

interface Props {
  fileName?: string
  filePath?: string
  isDirty?: boolean
  isRunning?: boolean
  hasFolder?: boolean
  projectType?: ProjectType
  availableScripts?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  fileName: 'Untitled',
  filePath: '',
  isDirty: false,
  isRunning: false,
  hasFolder: false,
  projectType: 'unknown',
  availableScripts: () => [],
})

const emit = defineEmits<{
  // File operations
  'new-file': []
  'open-file': []
  'open-folder': []
  'save': []
  'save-as': []
  'close-file': []
  // Edit operations
  'undo': []
  'redo': []
  'find': []
  'replace': []
  'format': []
  // Run operations
  'run': []
  'run-script': [script: string]
  'build': []
  'install': []
  'stop': []
  'hot-reload': []
  'hot-restart': []
  // View operations
  'toggle-terminal': []
  'toggle-explorer': []
  'toggle-minimap': []
  // Settings
  'open-settings': []
}>()

// Project type icon and color
const projectTypeInfo = computed(() => {
  switch (props.projectType) {
    case 'flutter':
      return { icon: 'i-simple-icons-flutter', color: 'text-cyan-400', label: 'Flutter' }
    case 'nuxt':
      return { icon: 'i-simple-icons-nuxtdotjs', color: 'text-green-400', label: 'Nuxt' }
    case 'bun':
      return { icon: 'i-simple-icons-bun', color: 'text-orange-400', label: 'Bun' }
    case 'node':
      return { icon: 'i-simple-icons-nodedotjs', color: 'text-green-500', label: 'Node.js' }
    case 'python':
      return { icon: 'i-simple-icons-python', color: 'text-yellow-400', label: 'Python' }
    case 'rust':
      return { icon: 'i-simple-icons-rust', color: 'text-orange-600', label: 'Rust' }
    case 'go':
      return { icon: 'i-simple-icons-go', color: 'text-cyan-500', label: 'Go' }
    case 'html':
      return { icon: 'i-lucide-file-code', color: 'text-orange-500', label: 'HTML' }
    default:
      return { icon: 'i-lucide-code', color: 'text-app-muted', label: 'Code' }
  }
})

// File actions dropdown
const fileDropdownItems = computed(() => [
  { label: 'New File', icon: 'i-lucide-file-plus', shortcut: '⌘N', onSelect: () => emit('new-file') },
  { label: 'Open Folder...', icon: 'i-lucide-folder-open', shortcut: '⌘O', onSelect: () => emit('open-folder') },
  { type: 'separator' as const },
  { label: 'Save', icon: 'i-lucide-save', shortcut: '⌘S', disabled: !props.isDirty, onSelect: () => emit('save') },
  { label: 'Save As...', icon: 'i-lucide-save-all', shortcut: '⌘⇧S', onSelect: () => emit('save-as') },
  { type: 'separator' as const },
  { label: 'Close File', icon: 'i-lucide-x', shortcut: '⌘W', onSelect: () => emit('close-file') },
])

// Run/Build actions dropdown - dynamic based on project type
const runDropdownItems = computed(() => {
  const items: Array<{ label?: string; icon?: string; shortcut?: string; disabled?: boolean; type?: 'separator'; onSelect?: () => void }> = []

  // Primary run action
  items.push({
    label: props.isRunning ? 'Stop' : 'Run Dev Server',
    icon: props.isRunning ? 'i-lucide-square' : 'i-lucide-play',
    shortcut: props.isRunning ? '⌘.' : '⌘R',
    onSelect: () => props.isRunning ? emit('stop') : emit('run'),
  })

  items.push({ type: 'separator' as const })

  // Project-type specific actions
  if (props.projectType === 'flutter') {
    items.push(
      { label: 'Hot Reload', icon: 'i-lucide-refresh-cw', shortcut: 'R', disabled: !props.isRunning, onSelect: () => emit('hot-reload') },
      { label: 'Hot Restart', icon: 'i-lucide-rotate-cw', shortcut: '⇧R', disabled: !props.isRunning, onSelect: () => emit('hot-restart') },
      { type: 'separator' as const },
      { label: 'Flutter Clean', icon: 'i-lucide-trash-2', onSelect: () => emit('run-script', 'clean') },
      { label: 'Pub Get', icon: 'i-lucide-download', onSelect: () => emit('install') },
    )
  } else if (props.projectType === 'nuxt') {
    items.push(
      { label: 'Build', icon: 'i-lucide-hammer', onSelect: () => emit('build') },
      { label: 'Generate Static', icon: 'i-lucide-file-output', onSelect: () => emit('run-script', 'generate') },
      { label: 'Preview', icon: 'i-lucide-eye', onSelect: () => emit('run-script', 'preview') },
      { type: 'separator' as const },
      { label: 'Type Check', icon: 'i-lucide-check-circle', onSelect: () => emit('run-script', 'typecheck') },
      { label: 'Lint', icon: 'i-lucide-shield-check', onSelect: () => emit('run-script', 'lint') },
      { label: 'Install', icon: 'i-lucide-download', onSelect: () => emit('install') },
    )
  } else if (props.projectType === 'bun' || props.projectType === 'node') {
    items.push(
      { label: 'Build', icon: 'i-lucide-hammer', onSelect: () => emit('build') },
      { label: 'Install', icon: 'i-lucide-download', onSelect: () => emit('install') },
    )
    // Add available scripts
    if (props.availableScripts.length > 0) {
      const scriptItems = props.availableScripts
        .filter(s => !['dev', 'start', 'build', 'install'].includes(s))
        .slice(0, 5)
      if (scriptItems.length > 0) {
        items.push({ type: 'separator' as const })
        scriptItems.forEach(script => {
          items.push({ label: `Run: ${script}`, icon: 'i-lucide-terminal', onSelect: () => emit('run-script', script) })
        })
      }
    }
  } else if (props.projectType === 'python') {
    items.push(
      { label: 'Install Requirements', icon: 'i-lucide-download', onSelect: () => emit('install') },
    )
  } else if (props.projectType === 'rust') {
    items.push(
      { label: 'Cargo Build', icon: 'i-lucide-hammer', onSelect: () => emit('build') },
      { label: 'Cargo Check', icon: 'i-lucide-check-circle', onSelect: () => emit('run-script', 'check') },
      { label: 'Cargo Test', icon: 'i-lucide-test-tube', onSelect: () => emit('run-script', 'test') },
    )
  } else if (props.projectType === 'go') {
    items.push(
      { label: 'Go Build', icon: 'i-lucide-hammer', onSelect: () => emit('build') },
      { label: 'Go Test', icon: 'i-lucide-test-tube', onSelect: () => emit('run-script', 'test') },
      { label: 'Go Mod Tidy', icon: 'i-lucide-package', onSelect: () => emit('run-script', 'tidy') },
    )
  } else if (props.projectType === 'html') {
    items.push(
      { label: 'Open in Browser', icon: 'i-lucide-external-link', onSelect: () => emit('run-script', 'open-browser') },
    )
  }

  return items
})

// View actions dropdown
const viewDropdownItems = computed(() => [
  { label: 'Toggle Explorer', icon: 'i-lucide-panel-left', shortcut: '⌘B', onSelect: () => emit('toggle-explorer') },
  { label: 'Toggle Terminal', icon: 'i-lucide-terminal', shortcut: '⌘`', onSelect: () => emit('toggle-terminal') },
  { label: 'Toggle Minimap', icon: 'i-lucide-map', onSelect: () => emit('toggle-minimap') },
])
</script>

<template>
  <div class="h-12 px-3 flex items-center gap-2 bg-app border-b border-app">
    <!-- Left: Project type & File actions -->
    <div class="flex items-center gap-1">
      <!-- Project type indicator -->
      <div v-if="hasFolder && projectType !== 'unknown'" class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 mr-1">
        <Icon :name="projectTypeInfo.icon" :class="projectTypeInfo.color" class="size-4" />
        <span class="text-xs text-app-muted">{{ projectTypeInfo.label }}</span>
      </div>

      <!-- File dropdown -->
      <DropdownMenu :items="fileDropdownItems">
        <Tooltip text="File">
          <Button
            icon="i-lucide-folder"
            size="sm"
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-chevron-down"
            class="pr-1"
          />
        </Tooltip>
      </DropdownMenu>
    </div>

    <!-- Divider -->
    <div class="h-6 w-px bg-app" />

    <!-- Center: Main tools -->
    <div class="flex-1 flex items-center justify-center gap-1">
      <!-- Run/Stop button -->
      <Tooltip v-if="hasFolder" :text="isRunning ? 'Stop (⌘.)' : 'Run (⌘R)'">
        <Button
          :icon="isRunning ? 'i-lucide-square' : 'i-lucide-play'"
          size="sm"
          :variant="isRunning ? 'soft' : 'solid'"
          :color="isRunning ? 'error' : 'primary'"
          @click="isRunning ? emit('stop') : emit('run')"
        />
      </Tooltip>

      <!-- Run dropdown (more options) -->
      <DropdownMenu v-if="hasFolder" :items="runDropdownItems">
        <Tooltip text="Run Options">
          <Button
            icon="i-lucide-chevron-down"
            size="sm"
            variant="ghost"
            color="neutral"
          />
        </Tooltip>
      </DropdownMenu>

      <!-- Flutter-specific: Hot Reload / Hot Restart -->
      <template v-if="projectType === 'flutter' && isRunning">
        <div class="h-6 w-px bg-app mx-1" />
        <Tooltip text="Hot Reload (R)">
          <Button
            icon="i-lucide-refresh-cw"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="emit('hot-reload')"
          />
        </Tooltip>
        <Tooltip text="Hot Restart (⇧R)">
          <Button
            icon="i-lucide-rotate-cw"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="emit('hot-restart')"
          />
        </Tooltip>
      </template>

      <!-- Nuxt/Node: Quick Build -->
      <template v-if="(projectType === 'nuxt' || projectType === 'bun' || projectType === 'node') && !isRunning">
        <div class="h-6 w-px bg-app mx-1" />
        <Tooltip text="Install Dependencies">
          <Button
            icon="i-lucide-download"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="emit('install')"
          />
        </Tooltip>
        <Tooltip text="Build">
          <Button
            icon="i-lucide-hammer"
            size="sm"
            variant="ghost"
            color="neutral"
            @click="emit('build')"
          />
        </Tooltip>
      </template>

      <!-- Divider -->
      <div class="h-6 w-px bg-app mx-2" />

      <!-- File name & dirty indicator -->
      <div class="flex items-center gap-1.5 px-2">
        <span class="text-sm text-app font-medium truncate max-w-48">{{ fileName }}</span>
        <span v-if="isDirty" class="text-app-accent text-lg leading-none">•</span>
      </div>

      <!-- Divider -->
      <div class="h-6 w-px bg-app mx-2" />

      <!-- Search -->
      <Tooltip text="Find (⌘F)">
        <Button
          icon="i-lucide-search"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="emit('find')"
        />
      </Tooltip>

      <!-- Format -->
      <Tooltip text="Format (⌘⇧F)">
        <Button
          icon="i-lucide-align-left"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="emit('format')"
        />
      </Tooltip>
    </div>

    <!-- Divider -->
    <div class="h-6 w-px bg-app" />

    <!-- Right: View actions -->
    <div class="flex items-center gap-0.5">
      <!-- View dropdown -->
      <DropdownMenu :items="viewDropdownItems">
        <Tooltip text="View">
          <Button
            icon="i-lucide-layout-grid"
            size="sm"
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-chevron-down"
            class="pr-1"
          />
        </Tooltip>
      </DropdownMenu>

      <!-- Terminal toggle -->
      <Tooltip text="Terminal (⌘`)">
        <Button
          icon="i-lucide-terminal"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="emit('toggle-terminal')"
        />
      </Tooltip>

      <!-- Settings -->
      <Tooltip text="Settings">
        <Button
          icon="i-lucide-settings"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="emit('open-settings')"
        />
      </Tooltip>
    </div>
  </div>
</template>
