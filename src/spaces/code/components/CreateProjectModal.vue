<script setup lang="ts">
/**
 * CreateProjectModal - Multi-step project scaffolding from templates
 * Step 1: Template selection (search + category filter + grid)
 * Step 2: Configure (tool status, name, location, modules, git)
 * Step 3: Creating (progress bar + streaming output)
 * Step 4: Done / Error
 */
import type { TemplateConfig } from '../templates.config'
import { useProjectScaffold } from '../composables/useProjectScaffold'
import { useCodeEditor } from '../composables/useCodeEditor'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const {
  state: scaffoldState,
  step,
  selectedTemplate,
  projectName,
  projectPath,
  initGit,
  sanitizedName,
  toolStatus,
  allToolsInstalled,
  hasToolsMissing,
  isChecking,
  canCreate,
  progress,
  progressMessage,
  creationOutput,
  error,
  selectedModules,
  availableModules,
  allTemplates,
  registry,
  selectTemplate,
  pickDirectory,
  toggleModule,
  scaffold,
  cancel,
  goBack,
  reset,
} = useProjectScaffold()

const { loadDirectory } = useCodeEditor()

// Search & filter
const searchQuery = ref('')
const activeCategory = ref<'all' | 'frontend' | 'mobile' | 'backend' | 'fullstack' | 'custom'>('all')

const categories = [
  { id: 'all' as const, label: 'All' },
  { id: 'frontend' as const, label: 'Frontend' },
  { id: 'mobile' as const, label: 'Mobile' },
  { id: 'backend' as const, label: 'Backend' },
  { id: 'fullstack' as const, label: 'Fullstack' },
  { id: 'custom' as const, label: 'Custom' },
]

const filteredTemplates = computed(() => {
  let result = allTemplates.value

  // Category filter
  if (activeCategory.value === 'custom') {
    result = result.filter(t => t.custom)
  } else if (activeCategory.value !== 'all') {
    result = result.filter(t => t.category === activeCategory.value)
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.category.includes(q) ||
      t.id.includes(q)
    )
  }

  return result
})

// ---- Custom template form state ----
const showAddForm = ref(false)
const editingTemplateId = ref<string | null>(null)
const formError = ref('')

const defaultForm = () => ({
  name: '',
  icon: 'i-lucide-box',
  category: 'frontend' as TemplateConfig['category'],
  description: '',
  createCommand: '',
  packageManager: 'none' as TemplateConfig['packageManager'],
  requiredToolsStr: '',
  installCmd: '',
  devCmd: '',
  buildCmd: '',
  startCmd: '',
})

const customForm = ref(defaultForm())

function resetForm() {
  customForm.value = defaultForm()
  formError.value = ''
  editingTemplateId.value = null
}

function openAddForm() {
  resetForm()
  showAddForm.value = true
}

function openEditForm(template: TemplateConfig) {
  editingTemplateId.value = template.id
  customForm.value = {
    name: template.name,
    icon: template.icon,
    category: template.category,
    description: template.description || '',
    createCommand: `${template.create.cmd} ${template.create.args.join(' ')}`,
    packageManager: template.packageManager,
    requiredToolsStr: template.requiredTools?.map(t => t.command).join(', ') || '',
    installCmd: template.commands.install?.join(' ') || '',
    devCmd: template.commands.dev?.join(' ') || '',
    buildCmd: template.commands.build?.join(' ') || '',
    startCmd: template.commands.start?.join(' ') || '',
  }
  formError.value = ''
  showAddForm.value = true
}

function parseCommandString(cmdStr: string): { cmd: string; args: string[] } | null {
  const parts = cmdStr.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return null
  return { cmd: parts[0], args: parts.slice(1) }
}

function handleSaveTemplate() {
  const form = customForm.value
  formError.value = ''

  if (!form.name.trim()) {
    formError.value = 'Name is required'
    return
  }

  const parsed = parseCommandString(form.createCommand)
  if (!parsed) {
    formError.value = 'Create command is required (e.g. "bun create vite {name}")'
    return
  }

  // Build required tools from comma-separated string
  const requiredTools = form.requiredToolsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(cmd => ({ command: cmd, name: cmd }))

  const templateId = editingTemplateId.value || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const template: TemplateConfig = {
    id: templateId,
    name: form.name.trim(),
    icon: form.icon.trim() || 'i-lucide-box',
    category: form.category,
    packageManager: form.packageManager,
    requiredTools: requiredTools.length > 0 ? requiredTools : undefined,
    create: {
      cmd: parsed.cmd,
      args: parsed.args,
      initsGit: false,
    },
    commands: {
      install: form.installCmd.trim() ? form.installCmd.trim().split(/\s+/) : undefined,
      dev: form.devCmd.trim() ? form.devCmd.trim().split(/\s+/) : undefined,
      build: form.buildCmd.trim() ? form.buildCmd.trim().split(/\s+/) : undefined,
      start: form.startCmd.trim() ? form.startCmd.trim().split(/\s+/) : undefined,
    },
    description: form.description.trim() || undefined,
    custom: true,
  }

  if (editingTemplateId.value) {
    const result = registry.updateCustomTemplate(editingTemplateId.value, template)
    if (!result.success) {
      formError.value = result.error || 'Failed to update template'
      return
    }
  } else {
    const result = registry.addCustomTemplate(template)
    if (!result.success) {
      formError.value = result.error || 'Failed to add template'
      return
    }
  }

  showAddForm.value = false
  resetForm()
}

// Context menu for custom templates
const contextMenuTemplate = ref<TemplateConfig | null>(null)
const contextMenuPos = ref({ x: 0, y: 0 })
const showContextMenu = ref(false)

function handleTemplateContextMenu(event: MouseEvent, template: TemplateConfig) {
  if (!template.custom) return
  event.preventDefault()
  contextMenuTemplate.value = template
  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
}

function closeContextMenu() {
  showContextMenu.value = false
  contextMenuTemplate.value = null
}

// Confirm remove
const confirmingRemoveId = ref<string | null>(null)

function handleRemoveTemplate(id: string) {
  closeContextMenu()
  confirmingRemoveId.value = id
}

function confirmRemove() {
  if (confirmingRemoveId.value) {
    registry.removeCustomTemplate(confirmingRemoveId.value)
    confirmingRemoveId.value = null
  }
}

function handleEditTemplate(template: TemplateConfig) {
  closeContextMenu()
  openEditForm(template)
}

// Close context menu on click outside
function handleGlobalClick() {
  if (showContextMenu.value) closeContextMenu()
}

// Output auto-scroll
const outputRef = ref<HTMLElement | null>(null)
watch(creationOutput, () => {
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  })
})

// Strip ANSI codes for display
const stripAnsi = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|.)/g, '')
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const colorizeOutput = (text: string): string => {
  if (!text) return ''
  const clean = stripAnsi(text)
  return clean.split('\n').map(line => {
    if (line.startsWith('$ ')) return `<span class="text-yellow-400">${escapeHtml(line)}</span>`
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) return `<span class="text-red-400">${escapeHtml(line)}</span>`
    if (line.toLowerCase().includes('warning')) return `<span class="text-yellow-400">${escapeHtml(line)}</span>`
    if (line.includes('✓') || line.includes('✔') || line.toLowerCase().includes('success')) return `<span class="text-green-400">${escapeHtml(line)}</span>`
    return `<span class="text-app-muted">${escapeHtml(line)}</span>`
  }).join('\n')
}

// Copy text to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback
  }
}

// Handle template click
const handleSelectTemplate = (template: TemplateConfig) => {
  selectTemplate(template)
}

// Handle create
const handleCreate = () => {
  scaffold()
}

// Handle open project after done
const handleOpenProject = async () => {
  if (projectPath.value) {
    await loadDirectory(projectPath.value)
  }
  close()
}

// Handle close
function close() {
  emit('update:open', false)
  showAddForm.value = false
  showContextMenu.value = false
  confirmingRemoveId.value = null
  // Delay reset to avoid flash during close animation
  setTimeout(() => reset(), 300)
}

// Handle try again from error
const handleRetry = () => {
  const template = selectedTemplate.value
  if (template) {
    selectTemplate(template)
  } else {
    reset()
  }
}

// Reset when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    reset()
    searchQuery.value = ''
    activeCategory.value = 'all'
    showAddForm.value = false
    showContextMenu.value = false
    confirmingRemoveId.value = null
  }
})

// Truncate path for display
const displayPath = computed(() => {
  const p = projectPath.value
  if (!p) return 'No location selected'
  // Show last 2 segments with ~/ prefix if home dir
  const home = '/Users/'
  if (p.startsWith(home)) {
    const afterHome = p.slice(home.length)
    const parts = afterHome.split('/')
    if (parts.length > 0) {
      return `~/${parts.join('/')}`
    }
  }
  return p
})
</script>

<template>
  <Modal
    :open="open"
    :prevent-close="step === 'creating'"
    :ui="{ content: 'max-w-2xl max-h-[85vh]' }"
    @update:open="(val) => val ? null : close()"
  >
    <!-- STEP 1: Template Selection -->
    <template v-if="step === 'select'" #header>
      <div class="flex items-center gap-3 pr-8">
        <div class="p-1.5 rounded-lg bg-[var(--app-accent)]/10">
          <Icon name="i-lucide-plus" class="size-5 text-[var(--app-accent)]" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)]">New Project</h2>
          <p class="text-xs text-[var(--app-muted)]">Choose a template to get started</p>
        </div>
      </div>
    </template>

    <template v-if="step === 'select'" #body>
      <div class="space-y-4 -mt-2" @click="handleGlobalClick">
        <!-- Search -->
        <div class="relative">
          <Icon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--app-muted)]" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search templates..."
            class="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
          >
        </div>

        <!-- Category pills -->
        <div class="flex items-center gap-1.5">
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            :class="activeCategory === cat.id
              ? 'bg-[var(--app-accent)] text-white'
              : 'bg-white/5 text-[var(--app-muted)] hover:bg-white/10 hover:text-[var(--app-foreground)]'"
            @click="activeCategory = cat.id"
          >
            {{ cat.label }}
          </button>
        </div>

        <!-- Add Template Form (inline) -->
        <div v-if="showAddForm" class="rounded-lg border border-[var(--app-accent)]/30 bg-[var(--app-accent)]/5 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-[var(--app-foreground)]">
              {{ editingTemplateId ? 'Edit Template' : 'Add Custom Template' }}
            </h3>
            <button class="p-1 rounded hover:bg-white/10 text-[var(--app-muted)]" @click="showAddForm = false">
              <Icon name="i-lucide-x" class="size-4" />
            </button>
          </div>

          <div v-if="formError" class="text-xs text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded">
            {{ formError }}
          </div>

          <!-- Row: Name + Category -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Name *</label>
              <input
                v-model="customForm.name"
                type="text"
                placeholder="My Framework"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Category</label>
              <select
                v-model="customForm.category"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs text-[var(--app-foreground)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
                <option value="frontend">Frontend</option>
                <option value="backend">Backend</option>
                <option value="fullstack">Fullstack</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
          </div>

          <!-- Row: Icon + Package Manager -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Icon (Iconify name)</label>
              <input
                v-model="customForm.icon"
                type="text"
                placeholder="i-lucide-box"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Package Manager</label>
              <select
                v-model="customForm.packageManager"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs text-[var(--app-foreground)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
                <option value="none">None</option>
                <option value="bun">Bun</option>
                <option value="npm">npm</option>
                <option value="yarn">Yarn</option>
                <option value="pnpm">pnpm</option>
                <option value="pip">pip</option>
                <option value="composer">Composer</option>
                <option value="flutter">Flutter</option>
              </select>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Description</label>
            <input
              v-model="customForm.description"
              type="text"
              placeholder="Short description of this template"
              class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
            >
          </div>

          <!-- Create command -->
          <div>
            <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Create Command * <span class="normal-case opacity-60">({name} = project name)</span></label>
            <input
              v-model="customForm.createCommand"
              type="text"
              placeholder="bun create my-framework {name}"
              class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
            >
          </div>

          <!-- Required tools -->
          <div>
            <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Required Tools <span class="normal-case opacity-60">(comma-separated commands)</span></label>
            <input
              v-model="customForm.requiredToolsStr"
              type="text"
              placeholder="bun, node"
              class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
            >
          </div>

          <!-- Commands row -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Install Command</label>
              <input
                v-model="customForm.installCmd"
                type="text"
                placeholder="bun install"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Dev Command</label>
              <input
                v-model="customForm.devCmd"
                type="text"
                placeholder="bun run dev"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Build Command</label>
              <input
                v-model="customForm.buildCmd"
                type="text"
                placeholder="bun run build"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
            <div>
              <label class="text-[10px] text-[var(--app-muted)] uppercase tracking-wider">Start Command</label>
              <input
                v-model="customForm.startCmd"
                type="text"
                placeholder="bun run start"
                class="w-full h-8 px-2.5 mt-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
              >
            </div>
          </div>

          <!-- Save -->
          <div class="flex justify-end gap-2 pt-1">
            <button
              class="px-3 py-1.5 rounded-md text-xs text-[var(--app-muted)] hover:text-[var(--app-foreground)] hover:bg-white/5 transition-colors"
              @click="showAddForm = false"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--app-accent)] text-white hover:opacity-90 transition-opacity"
              @click="handleSaveTemplate"
            >
              {{ editingTemplateId ? 'Save Changes' : 'Add Template' }}
            </button>
          </div>
        </div>

        <!-- Template grid -->
        <div v-if="!showAddForm" class="grid grid-cols-3 gap-2">
          <button
            v-for="template in filteredTemplates"
            :key="template.id"
            class="relative flex flex-col items-center gap-2 p-3 rounded-lg border border-white/10 hover:border-[var(--app-accent)]/50 hover:bg-white/5 transition-all text-center group"
            @click="handleSelectTemplate(template)"
            @contextmenu="handleTemplateContextMenu($event, template)"
          >
            <!-- Custom badge -->
            <span v-if="template.custom" class="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[var(--app-accent)]/15 text-[var(--app-accent)] font-medium">
              Custom
            </span>
            <Icon :name="template.icon" class="size-8 text-[var(--app-muted)] group-hover:text-[var(--app-foreground)] transition-colors" />
            <div>
              <div class="text-sm font-medium text-[var(--app-foreground)]">{{ template.name }}</div>
              <div class="text-[10px] text-[var(--app-muted)] mt-0.5 line-clamp-1">{{ template.description }}</div>
            </div>
          </button>

          <!-- Add Template card -->
          <button
            class="flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-white/10 hover:border-[var(--app-accent)]/50 hover:bg-white/5 transition-all text-center group"
            @click="openAddForm"
          >
            <Icon name="i-lucide-plus" class="size-8 text-[var(--app-muted)] group-hover:text-[var(--app-accent)] transition-colors" />
            <div class="text-sm font-medium text-[var(--app-muted)] group-hover:text-[var(--app-foreground)]">Add Template</div>
          </button>
        </div>

        <!-- Empty state for Custom tab -->
        <p v-if="activeCategory === 'custom' && filteredTemplates.length === 0 && !showAddForm" class="text-center text-sm text-[var(--app-muted)] py-8">
          No custom templates yet.
          <button class="text-[var(--app-accent)] hover:underline ml-1" @click="openAddForm">
            Add one
          </button>
        </p>

        <p v-else-if="filteredTemplates.length === 0 && !showAddForm" class="text-center text-sm text-[var(--app-muted)] py-8">
          No templates match your search
        </p>

        <!-- Context menu -->
        <Teleport to="body">
          <div
            v-if="showContextMenu && contextMenuTemplate"
            class="fixed z-[9999] min-w-[140px] rounded-lg border border-white/10 bg-[var(--app-background)] shadow-xl py-1"
            :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
          >
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--app-foreground)] hover:bg-white/10 transition-colors"
              @click="handleEditTemplate(contextMenuTemplate!)"
            >
              <Icon name="i-lucide-pencil" class="size-3.5" />
              Edit
            </button>
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              @click="handleRemoveTemplate(contextMenuTemplate!.id)"
            >
              <Icon name="i-lucide-trash-2" class="size-3.5" />
              Remove
            </button>
          </div>
        </Teleport>

        <!-- Remove confirmation dialog -->
        <div v-if="confirmingRemoveId" class="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
          <p class="text-sm text-[var(--app-foreground)]">Remove this custom template? This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <button
              class="px-3 py-1.5 rounded-md text-xs text-[var(--app-muted)] hover:text-[var(--app-foreground)] hover:bg-white/5 transition-colors"
              @click="confirmingRemoveId = null"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500 text-white hover:opacity-90 transition-opacity"
              @click="confirmRemove"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- STEP 2: Configure -->
    <template v-if="step === 'configure'" #header>
      <div class="flex items-center gap-3 pr-8">
        <button
          class="p-1 rounded-md hover:bg-white/10 text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
          @click="goBack"
        >
          <Icon name="i-lucide-arrow-left" class="size-5" />
        </button>
        <Icon v-if="selectedTemplate" :name="selectedTemplate.icon" class="size-6 text-[var(--app-foreground)]" />
        <div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)]">{{ selectedTemplate?.name }}</h2>
          <p class="text-xs text-[var(--app-muted)]">{{ selectedTemplate?.description }}</p>
        </div>
      </div>
    </template>

    <template v-if="step === 'configure'" #body>
      <div class="space-y-5 -mt-2">
        <!-- Tool Status -->
        <div v-if="selectedTemplate?.requiredTools?.length" class="space-y-2">
          <label class="text-xs font-medium text-[var(--app-muted)] uppercase tracking-wider">Required Tools</label>
          <div class="space-y-1.5">
            <div
              v-for="tool in selectedTemplate.requiredTools"
              :key="tool.command"
              class="flex items-center gap-3 p-2.5 rounded-lg border"
              :class="toolStatus.get(tool.command) === 'installed'
                ? 'border-green-500/20 bg-green-500/5'
                : toolStatus.get(tool.command) === 'missing'
                  ? 'border-red-500/20 bg-red-500/5'
                  : 'border-white/10 bg-white/5'"
            >
              <!-- Status icon -->
              <div class="shrink-0">
                <Icon
                  v-if="toolStatus.get(tool.command) === 'checking'"
                  name="i-lucide-loader-2"
                  class="size-4 animate-spin text-[var(--app-muted)]"
                />
                <Icon
                  v-else-if="toolStatus.get(tool.command) === 'installed'"
                  name="i-lucide-check-circle"
                  class="size-4 text-green-400"
                />
                <Icon
                  v-else
                  name="i-lucide-x-circle"
                  class="size-4 text-red-400"
                />
              </div>

              <!-- Tool info -->
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-[var(--app-foreground)]">{{ tool.name }}</div>
                <div v-if="toolStatus.get(tool.command) === 'missing' && tool.installHint" class="flex items-center gap-1.5 mt-1">
                  <code class="text-xs bg-black/30 px-2 py-0.5 rounded font-mono text-orange-300 select-all">{{ tool.installHint }}</code>
                  <button
                    class="p-0.5 rounded hover:bg-white/10 text-[var(--app-muted)] hover:text-[var(--app-foreground)] transition-colors"
                    title="Copy install command"
                    @click="copyToClipboard(tool.installHint!)"
                  >
                    <Icon name="i-lucide-copy" class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Project Name -->
        <div class="space-y-2">
          <label class="text-xs font-medium text-[var(--app-muted)] uppercase tracking-wider">Project Name</label>
          <input
            v-model="projectName"
            type="text"
            placeholder="My Awesome App"
            class="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--app-foreground)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-accent)]/50"
          >
          <p v-if="projectName && sanitizedName" class="text-xs text-[var(--app-muted)]">
            Will create: <code class="text-[var(--app-accent)] font-mono">{{ sanitizedName }}</code>
          </p>
        </div>

        <!-- Location -->
        <div class="space-y-2">
          <label class="text-xs font-medium text-[var(--app-muted)] uppercase tracking-wider">Location</label>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-9 px-3 flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden">
              <span class="text-sm text-[var(--app-muted)] truncate">{{ displayPath }}</span>
            </div>
            <button
              class="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-[var(--app-foreground)] hover:bg-white/10 transition-colors shrink-0"
              @click="pickDirectory"
            >
              Browse
            </button>
          </div>
        </div>

        <!-- Options -->
        <div class="space-y-3">
          <label class="text-xs font-medium text-[var(--app-muted)] uppercase tracking-wider">Options</label>

          <!-- Init git -->
          <label class="flex items-center gap-2.5 cursor-pointer">
            <input
              v-model="initGit"
              type="checkbox"
              class="size-4 rounded border border-white/20 bg-white/5 text-[var(--app-accent)] focus:ring-[var(--app-accent)]/50"
            >
            <span class="text-sm text-[var(--app-foreground)]">Initialize Git repository</span>
          </label>
        </div>

        <!-- Modules -->
        <div v-if="availableModules.length > 0" class="space-y-2">
          <label class="text-xs font-medium text-[var(--app-muted)] uppercase tracking-wider">Modules</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="mod in availableModules"
              :key="mod.id"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all"
              :class="selectedModules.has(mod.id)
                ? 'border-[var(--app-accent)]/50 bg-[var(--app-accent)]/10 text-[var(--app-foreground)]'
                : 'border-white/10 bg-white/5 text-[var(--app-muted)] hover:border-white/20'"
              :title="mod.description"
              @click="toggleModule(mod.id)"
            >
              <Icon v-if="mod.icon" :name="mod.icon" class="size-3.5" />
              <span>{{ mod.name }}</span>
              <Icon
                v-if="selectedModules.has(mod.id)"
                name="i-lucide-check"
                class="size-3 text-[var(--app-accent)]"
              />
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="step === 'configure'" #footer>
      <div class="flex items-center justify-between w-full">
        <p v-if="hasToolsMissing" class="text-xs text-red-400 flex items-center gap-1.5">
          <Icon name="i-lucide-alert-triangle" class="size-3.5" />
          Install required tools first
        </p>
        <span v-else />
        <div class="flex gap-2">
          <Button label="Cancel" variant="ghost" color="neutral" size="sm" @click="close" />
          <Button
            label="Create Project"
            icon="i-lucide-rocket"
            size="sm"
            :disabled="!canCreate"
            @click="handleCreate"
          />
        </div>
      </div>
    </template>

    <!-- STEP 3: Creating -->
    <template v-if="step === 'creating'" #header>
      <div class="flex items-center gap-3 pr-8">
        <div class="p-1.5 rounded-lg bg-blue-500/10">
          <Icon name="i-lucide-loader-2" class="size-5 text-blue-400 animate-spin" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)]">Creating Project</h2>
          <p class="text-xs text-[var(--app-muted)]">{{ progressMessage }}</p>
        </div>
      </div>
    </template>

    <template v-if="step === 'creating'" #body>
      <div class="space-y-4 -mt-2">
        <!-- Progress bar -->
        <div class="space-y-2">
          <div class="flex justify-between text-xs text-[var(--app-muted)]">
            <span>{{ progressMessage }}</span>
            <span>{{ progress }}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full rounded-full bg-[var(--app-accent)] transition-all duration-300"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <!-- Output -->
        <div
          ref="outputRef"
          class="h-64 overflow-auto rounded-lg bg-black/30 border border-white/10 p-3 font-mono text-xs leading-relaxed"
        >
          <!-- eslint-disable vue/no-v-html -->
          <pre
            v-if="creationOutput"
            class="whitespace-pre-wrap break-words"
            v-html="colorizeOutput(creationOutput)"
          />
          <!-- eslint-enable vue/no-v-html -->
          <pre v-else class="text-[var(--app-muted)]">Waiting for output...</pre>
        </div>
      </div>
    </template>

    <template v-if="step === 'creating'" #footer>
      <Button
        label="Cancel"
        icon="i-lucide-x"
        variant="ghost"
        color="error"
        size="sm"
        @click="cancel"
      />
    </template>

    <!-- STEP 4: Done -->
    <template v-if="step === 'done'" #header>
      <div class="flex items-center gap-3 pr-8">
        <div class="p-1.5 rounded-lg bg-green-500/10">
          <Icon name="i-lucide-check-circle" class="size-5 text-green-400" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)]">Project Created!</h2>
          <p class="text-xs text-[var(--app-muted)]">{{ selectedTemplate?.name }} project "{{ sanitizedName }}" is ready</p>
        </div>
      </div>
    </template>

    <template v-if="step === 'done'" #body>
      <div class="flex flex-col items-center justify-center py-6 gap-4">
        <div class="p-4 rounded-full bg-green-500/10">
          <Icon name="i-lucide-folder-check" class="size-10 text-green-400" />
        </div>
        <div class="text-center">
          <p class="text-sm text-[var(--app-foreground)]">Your project is ready at:</p>
          <code class="text-xs text-[var(--app-muted)] font-mono mt-1 block">{{ projectPath }}</code>
        </div>
      </div>
    </template>

    <template v-if="step === 'done'" #footer>
      <div class="flex gap-2 justify-end w-full">
        <Button label="Close" variant="ghost" color="neutral" size="sm" @click="close" />
        <Button
          label="Open Project"
          icon="i-lucide-folder-open"
          size="sm"
          @click="handleOpenProject"
        />
      </div>
    </template>

    <!-- STEP 4: Error -->
    <template v-if="step === 'error'" #header>
      <div class="flex items-center gap-3 pr-8">
        <div class="p-1.5 rounded-lg bg-red-500/10">
          <Icon name="i-lucide-alert-circle" class="size-5 text-red-400" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-[var(--app-foreground)]">Creation Failed</h2>
          <p class="text-xs text-[var(--app-muted)]">Something went wrong</p>
        </div>
      </div>
    </template>

    <template v-if="step === 'error'" #body>
      <div class="space-y-4 -mt-2">
        <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p class="text-sm text-red-400">{{ error }}</p>
        </div>
        <div
          v-if="creationOutput"
          class="h-40 overflow-auto rounded-lg bg-black/30 border border-white/10 p-3 font-mono text-xs leading-relaxed"
        >
          <!-- eslint-disable vue/no-v-html -->
          <pre class="whitespace-pre-wrap break-words" v-html="colorizeOutput(creationOutput)" />
          <!-- eslint-enable vue/no-v-html -->
        </div>
      </div>
    </template>

    <template v-if="step === 'error'" #footer>
      <div class="flex gap-2 justify-end w-full">
        <Button label="Close" variant="ghost" color="neutral" size="sm" @click="close" />
        <Button
          label="Try Again"
          icon="i-lucide-refresh-cw"
          size="sm"
          @click="handleRetry"
        />
      </div>
    </template>
  </Modal>
</template>
