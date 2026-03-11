<script setup lang="ts">
/**
 * AssistantPage — Full-page AI assistant for popout Tauri windows.
 *
 * Frameless window (no native title bar). Custom titlebar with
 * macOS-style traffic lights and drag region.
 *
 * Context (project, space) received via BroadcastChannel from main window.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useAssistant } from '@/composables/useAssistant'
import { useProjectStore } from '@/stores/project'
import { isTauriEnv } from '@/utils/tauri'
import AssistantFloat from '@/components/ai/AssistantFloat.vue'

const { isPoppedOut } = useAssistant()
const projectStore = useProjectStore()
const ready = ref(false)
const spaceName = ref<string | null>(null)

// BroadcastChannel for cross-window communication
const channel = new BroadcastChannel('construct-assistant')

function applyContext(data: { project?: { id: string; name: string; path: string } | null; space?: string | null }) {
  if (data.space) spaceName.value = data.space
  if (data.project?.path && !projectStore.currentProject) {
    if (projectStore.projects.length === 0) {
      projectStore.loadProjects().then(() => {
        projectStore.openProject(data.project!.path)
      })
    } else {
      projectStore.openProject(data.project.path)
    }
  }
  ready.value = true
}

channel.onmessage = (event) => {
  if (event.data?.type === 'assistant-context') {
    applyContext(event.data)
  }
}

onMounted(() => {
  isPoppedOut.value = true
  // Fallback: if no context arrives within 2s, show without context
  setTimeout(() => { if (!ready.value) ready.value = true }, 2000)
})

onUnmounted(() => {
  isPoppedOut.value = false
  // Notify main window that popout is closing
  channel.postMessage({ type: 'assistant-closed' })
  channel.close()
})

async function closeWindow() {
  if (!isTauriEnv()) return
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  await getCurrentWebviewWindow().close()
}

async function minimizeWindow() {
  if (!isTauriEnv()) return
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  await getCurrentWebviewWindow().minimize()
}

async function maximizeWindow() {
  if (!isTauriEnv()) return
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const win = getCurrentWebviewWindow()
  if (await win.isMaximized()) {
    await win.unmaximize()
  } else {
    await win.maximize()
  }
}
</script>

<template>
  <div class="assistant-window h-screen w-screen overflow-hidden bg-app rounded-xl">
    <!-- Custom titlebar with traffic lights -->
    <div
      class="titlebar flex items-center gap-2 px-3 bg-app border-b border-white/5"
      data-tauri-drag-region
    >
      <!-- Traffic lights -->
      <div class="flex items-center gap-1.5" @mousedown.stop>
        <button
          class="traffic-light traffic-close"
          title="Close"
          @click="closeWindow"
        >
          <svg class="traffic-icon" viewBox="0 0 12 12"><path d="M3.172 3.172a.5.5 0 0 1 .707 0L6 5.293l2.121-2.121a.5.5 0 0 1 .707.707L6.707 6l2.121 2.121a.5.5 0 0 1-.707.707L6 6.707 3.879 8.828a.5.5 0 0 1-.707-.707L5.293 6 3.172 3.879a.5.5 0 0 1 0-.707Z" fill="currentColor"/></svg>
        </button>
        <button
          class="traffic-light traffic-minimize"
          title="Minimize"
          @click="minimizeWindow"
        >
          <svg class="traffic-icon" viewBox="0 0 12 12"><path d="M3 6a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 3 6Z" fill="currentColor"/></svg>
        </button>
        <button
          class="traffic-light traffic-maximize"
          title="Maximize"
          @click="maximizeWindow"
        >
          <svg class="traffic-icon" viewBox="0 0 12 12"><path d="M4 3.5a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5H4Z" fill="currentColor"/></svg>
        </button>
      </div>

      <!-- Window title -->
      <span class="text-xs text-app-muted select-none ml-1" data-tauri-drag-region>
        Construct AI
        <template v-if="projectStore.currentProject">
          — {{ projectStore.currentProject.name }}
        </template>
      </span>
    </div>

    <!-- Assistant content -->
    <div class="flex-1 overflow-hidden" style="height: calc(100vh - 36px)">
      <AssistantFloat v-if="ready" :popout-mode="true" :popout-space="spaceName" />
    </div>
  </div>
</template>

<style scoped>
.assistant-window {
  display: flex;
  flex-direction: column;
}

.titlebar {
  -webkit-app-region: drag;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.traffic-light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
  transition: filter 0.15s;
}

.traffic-light:active {
  filter: brightness(0.8);
}

.traffic-icon {
  width: 8px;
  height: 8px;
  opacity: 0;
  color: rgba(0, 0, 0, 0.5);
  transition: opacity 0.1s;
}

.titlebar:hover .traffic-icon,
.traffic-light:hover .traffic-icon {
  opacity: 1;
}

.traffic-close { background: #ff5f57; }
.traffic-minimize { background: #febc2e; }
.traffic-maximize { background: #28c840; }

.assistant-window:not(:focus-within) .traffic-close,
.assistant-window:not(:focus-within) .traffic-minimize,
.assistant-window:not(:focus-within) .traffic-maximize {
  background: rgba(128, 128, 128, 0.3);
}
.assistant-window:not(:focus-within) .traffic-icon {
  opacity: 0 !important;
}
</style>
