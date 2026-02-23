<script setup lang="ts">
/**
 * Code Space - Responsive Preview
 * Shows the currently running localhost app in multiple viewport sizes.
 */
import { invoke } from '@tauri-apps/api/core'
import { useProcessManager } from '../composables/useProcessManager'
import { stripAnsi } from '../composables/useAnsiStrip'

interface BreakpointPreset {
  id: string
  name: string
  width: number
  height: number
  icon: string
  scale: number
}

const route = useRoute()
const projectId = computed(() => route.params.id as string)

const viewMode = ref<'side-by-side' | 'stacked' | 'single'>('side-by-side')
const showDeviceFrame = ref(true)
const activeBreakpoint = ref<string | null>(null)
const manualUrl = ref('')
const refreshKey = ref(0)

const breakpoints = ref<BreakpointPreset[]>([
  { id: 'mobile', name: 'Mobile', width: 390, height: 844, icon: 'i-lucide-smartphone', scale: 0.36 },
  { id: 'tablet', name: 'Tablet', width: 768, height: 1024, icon: 'i-lucide-tablet', scale: 0.3 },
  { id: 'desktop', name: 'Desktop', width: 1280, height: 800, icon: 'i-lucide-monitor', scale: 0.34 },
  { id: 'wide', name: 'Wide', width: 1440, height: 900, icon: 'i-lucide-tv', scale: 0.3 },
])

const selectedBreakpoints = ref<string[]>(['mobile', 'tablet', 'desktop'])

const { runningProcesses } = useProcessManager()

// stripAnsi imported from composables/useAnsiStrip

const extractPreviewUrl = (output: string): string | null => {
  const cleanOutput = stripAnsi(output || '')
  const localhostMatches = cleanOutput.match(/https?:\/\/localhost:\d+\/?/gi)
  if (localhostMatches && localhostMatches.length > 0) {
    return localhostMatches[localhostMatches.length - 1] || null
  }

  const ipMatches = cleanOutput.match(/https?:\/\/127\.0\.0\.1:\d+\/?/gi)
  if (ipMatches && ipMatches.length > 0) {
    return ipMatches[ipMatches.length - 1] || null
  }

  return null
}

const detectedUrl = computed(() => {
  const withUrl = runningProcesses.value
    .map((process) => ({ process, url: extractPreviewUrl(process.output) }))
    .filter((item): item is { process: typeof runningProcesses.value[number]; url: string } => Boolean(item.url))
    .sort((a, b) => new Date(b.process.startedAt).getTime() - new Date(a.process.startedAt).getTime())

  return withUrl[0]?.url || null
})

const activeUrl = computed(() => {
  const trimmed = manualUrl.value.trim()
  if (trimmed) return trimmed
  return detectedUrl.value
})

const hasPreviewUrl = computed(() => Boolean(activeUrl.value))

const visibleBreakpoints = computed(() => {
  if (viewMode.value === 'single' && activeBreakpoint.value) {
    return breakpoints.value.filter(bp => bp.id === activeBreakpoint.value)
  }
  return breakpoints.value.filter(bp => selectedBreakpoints.value.includes(bp.id))
})

const toggleBreakpoint = (id: string) => {
  const idx = selectedBreakpoints.value.indexOf(id)
  if (idx === -1) {
    selectedBreakpoints.value.push(id)
  } else if (selectedBreakpoints.value.length > 1) {
    selectedBreakpoints.value.splice(idx, 1)
  }
}

const refreshPreviews = () => {
  refreshKey.value += 1
}

const openExternal = async () => {
  if (!activeUrl.value) return
  try {
    await invoke('browser_open_standalone', {
      url: activeUrl.value,
      title: 'Responsive Preview',
      width: 1280,
      height: 800,
    })
  } catch (e) {
    console.error('[ResponsivePreview] Failed to open external preview:', e)
  }
}

const useDetectedUrl = () => {
  if (detectedUrl.value) {
    manualUrl.value = detectedUrl.value
  }
}

watch(viewMode, (mode) => {
  if (mode === 'single' && !activeBreakpoint.value) {
    activeBreakpoint.value = selectedBreakpoints.value[0] || 'mobile'
  }
})

const { setPageItems, clearToolbar } = useToolbar()

onMounted(() => {
  setPageItems([
    {
      id: 'code-responsive-refresh',
      icon: 'i-lucide-refresh-cw',
      label: 'Refresh',
      type: 'action',
      category: 'space',
      onClick: refreshPreviews,
    },
  ])
})

onUnmounted(() => {
  clearToolbar()
})
</script>

<template>
  <div class="h-full flex flex-col bg-app">
    <div class="h-12 px-4 border-b border-app-border flex items-center justify-between bg-app-panel">
      <div class="flex items-center gap-3">
        <Icon name="i-lucide-smartphone" class="size-5 text-app-accent" />
        <div>
          <p class="text-sm font-medium text-app">Responsive Preview</p>
          <p class="text-xs text-app-muted">
            {{ hasPreviewUrl ? (activeUrl || '') : 'Run your web app to start previewing' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 bg-app-hover rounded-lg p-1">
          <button
            class="px-2 py-1 rounded text-xs transition-colors"
            :class="viewMode === 'side-by-side' ? 'bg-app-panel text-app' : 'text-app-muted'"
            @click="viewMode = 'side-by-side'"
          >
            Side by Side
          </button>
          <button
            class="px-2 py-1 rounded text-xs transition-colors"
            :class="viewMode === 'stacked' ? 'bg-app-panel text-app' : 'text-app-muted'"
            @click="viewMode = 'stacked'"
          >
            Stacked
          </button>
          <button
            class="px-2 py-1 rounded text-xs transition-colors"
            :class="viewMode === 'single' ? 'bg-app-panel text-app' : 'text-app-muted'"
            @click="viewMode = 'single'"
          >
            Single
          </button>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="bp in breakpoints"
            :key="bp.id"
            class="p-2 rounded-lg transition-colors"
            :class="selectedBreakpoints.includes(bp.id)
              ? 'bg-app-accent/10 text-app-accent'
              : 'text-app-muted hover:bg-app-hover'"
            :title="`${bp.name} (${bp.width}x${bp.height})`"
            @click="viewMode === 'single' ? (activeBreakpoint = bp.id) : toggleBreakpoint(bp.id)"
          >
            <Icon :name="bp.icon" class="size-4" />
          </button>
        </div>

        <Button
          size="xs"
          variant="soft"
          color="neutral"
          :icon="showDeviceFrame ? 'i-lucide-frame' : 'i-lucide-square'"
          :label="showDeviceFrame ? 'Bezels On' : 'Bezels Off'"
          @click="showDeviceFrame = !showDeviceFrame"
        />
      </div>
    </div>

    <div class="h-14 px-4 border-b border-app-border flex items-center gap-3 bg-app-panel">
      <Input
        v-model="manualUrl"
        placeholder="http://localhost:3000"
        class="flex-1 max-w-xl"
      />
      <Button
        v-if="detectedUrl"
        variant="soft"
        color="neutral"
        size="sm"
        label="Use Detected"
        @click="useDetectedUrl"
      />
      <Button
        variant="soft"
        color="neutral"
        size="sm"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        @click="refreshPreviews"
      />
      <Button
        :disabled="!hasPreviewUrl"
        variant="soft"
        color="neutral"
        size="sm"
        icon="i-lucide-external-link"
        label="Open External"
        @click="openExternal"
      />
    </div>

    <div v-if="!hasPreviewUrl" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center max-w-xl">
        <Icon name="i-lucide-monitor-smartphone" class="size-12 text-app-muted/40 mx-auto mb-4" />
        <p class="text-sm text-app mb-2">No running web preview detected</p>
        <p class="text-xs text-app-muted mb-4">
          Start your app from Code Editor (Run/Preview). Once localhost appears in output,
          this view will auto-detect it.
        </p>
        <RouterLink :to="`/app/projects/${projectId}/code/editor`" class="text-sm text-app-accent hover:underline">
          Go to Code Editor
        </RouterLink>
      </div>
    </div>

    <div v-else class="flex-1 overflow-auto p-6">
      <div
        class="flex gap-8 min-h-full"
        :class="{
          'flex-row items-start justify-center': viewMode === 'side-by-side',
          'flex-col items-center': viewMode === 'stacked',
          'justify-center items-center': viewMode === 'single',
        }"
      >
        <div v-for="bp in visibleBreakpoints" :key="bp.id" class="flex flex-col items-center shrink-0">
          <div class="flex items-center gap-2 mb-3">
            <Icon :name="bp.icon" class="size-4 text-app-muted" />
            <span class="text-sm font-medium text-app">{{ bp.name }}</span>
            <span class="text-xs text-app-muted">{{ bp.width }} x {{ bp.height }}</span>
          </div>

          <div class="relative" :class="showDeviceFrame ? 'device-frame' : ''" :data-device="bp.id">
            <div
              class="overflow-hidden bg-white shadow-2xl"
              :class="showDeviceFrame ? 'rounded-[24px]' : 'rounded-lg border border-app-border'"
              :style="{ width: `${bp.width * bp.scale}px`, height: `${bp.height * bp.scale}px` }"
            >
              <iframe
                :key="`${bp.id}-${refreshKey}`"
                :src="activeUrl || undefined"
                :title="`${bp.name} preview`"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                class="border-0 origin-top-left bg-white"
                :style="{
                  width: `${bp.width}px`,
                  height: `${bp.height}px`,
                  transform: `scale(${bp.scale})`,
                }"
              />
            </div>
          </div>
          <p class="text-xs text-app-muted mt-2">{{ Math.round(bp.scale * 100) }}%</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-frame[data-device="mobile"] {
  padding: 12px;
  background: linear-gradient(145deg, #2d2d2d, #1a1a1a);
  border-radius: 36px;
}

.device-frame[data-device="tablet"] {
  padding: 14px;
  background: linear-gradient(145deg, #363636, #232323);
  border-radius: 28px;
}

.device-frame[data-device="desktop"],
.device-frame[data-device="wide"] {
  padding: 8px;
  background: linear-gradient(180deg, #414141, #292929);
  border-radius: 10px;
}
</style>
