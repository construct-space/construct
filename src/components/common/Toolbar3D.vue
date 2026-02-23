<script setup lang="ts">
/**
 * Toolbar3D - Unified 3D rotating toolbar
 *
 * Uses useToolbar for everything:
 * - Space detection and items (auto from route)
 * - Page-specific items (set by pages)
 * - 3D rotation animation
 */
import ToolbarBreadcrumb from '../toolbar/Breadcrumb.vue'
import ToolbarSearch from '../toolbar/Search.vue'

const router = useRouter()
const { isOpen: isAssistantOpen, toggle: toggleAssistant } = useAssistant()
const { isOpen: isChatOpen, isPinned: isChatPinned, toggle: toggleChat } = useChatPanel()
const { connectionStatus, retry: retryConnection } = useNotifications()
const {
  frontPanel,
  bottomPanel,
  rotationTransform,
  isRotating,
  toolbarItems,
  bottomToolbarItems,
  initToolbar
} = useToolbar()

const chatTooltip = computed(() => {
  if (isChatPinned.value) return 'Chat (Pinned Sidebar)'
  if (isChatOpen.value) return 'Chat (Open)'
  return 'Chat'
})

onMounted(async () => {
  await initToolbar()
})

function handleItemClick(item: { id: string; onClick?: () => void; to?: string; action?: string }) {
  if (item.onClick) {
    item.onClick()
  } else if (item.to) {
    router.push(item.to)
  } else if (item.action) {
    console.log('Toolbar action:', item.action)
  }
}
</script>

<template>
  <div class="relative h-10 select-none" style="perspective: 1000px" @contextmenu.prevent>
    <!-- Rotating Container -->
    <div
      class="w-full h-full relative"
      :class="isRotating ? 'transition-transform duration-500 ease-in' : ''"
      :style="{
        transformStyle: 'preserve-3d',
        transform: rotationTransform
      }"
    >
      <!-- Front Panel -->
      <div
        class="absolute inset-0 w-full h-10 pl-4 pr-6 flex items-center gap-2 bg-app border-b border-gray-200/50 dark:border-gray-700/50"
        style="backface-visibility: hidden; transform: translateZ(20px)"
        data-tauri-drag-region>
        <ToolbarBreadcrumb :path="frontPanel.path" />

        <!-- Slot for content after breadcrumb -->
        <div id="toolbar-after-breadcrumb-slot" class="flex items-center" />

        <div class="flex-1" />

        <!-- Separator before toolbar items -->
        <template v-if="toolbarItems.length">
          <div class="w-px h-4 bg-app-muted/30 ml-1" />

          <div class="flex items-center gap-1">
            <Tooltip
              v-for="item in toolbarItems" :key="item.id" :text="item.label">
              <Button
                :icon="item.icon" variant="ghost" color="neutral" size="xs"
                :class="item.active ? 'text-app-accent' : 'text-app-muted hover:text-app'"
                @click="handleItemClick(item)" />
            </Tooltip>
          </div>
        </template>

        <!-- Slot for center tools (via Teleport from pages) -->
        <div id="toolbar-bun-slot" class="flex items-center gap-1" />

        <div class="flex-1" />

        <!-- Page-specific right-side content (via Teleport from pages) -->
        <div id="toolbar-right-slot" class="flex items-center gap-2 mr-2" />

        <!-- Right side items -->
        <ToolbarSearch />
        <Tooltip :text="chatTooltip">
          <div class="relative">
            <Button
              icon="i-lucide-messages-square"
              variant="ghost"
              color="neutral"
              size="xs"
              :class="(isChatOpen || isChatPinned) ? 'text-app-accent!' : 'text-app-muted hover:text-app'"
              @click="toggleChat"
            />
            <span
              v-if="isChatPinned"
              class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-app-accent ring-1 ring-app"
              title="Pinned"
            />
          </div>
        </Tooltip>

        <!-- Slot for package manager commands -->
        <div id="toolbar-package-slot" class="flex items-center gap-1" />

        <!-- WebSocket Connection Status -->
        <Popover>
          <button
            class="relative p-1.5 mr-1 rounded-md transition-colors"
            :class="{
              'text-green-500 hover:text-green-600': connectionStatus === 'connected',
              'text-amber-500 hover:text-amber-600': connectionStatus === 'disconnected',
              'text-red-500 hover:text-red-600': connectionStatus === 'server-offline' || connectionStatus === 'ws-unavailable'
            }"
          >
            <Icon
              :name="connectionStatus === 'connected' ? 'i-lucide-zap' : 'i-lucide-zap-off'"
              class="size-4"
            />
          </button>
          <template #content>
            <div class="p-3 min-w-48">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="size-2 rounded-full"
                  :class="{
                    'bg-green-500': connectionStatus === 'connected',
                    'bg-amber-500': connectionStatus === 'disconnected',
                    'bg-red-500': connectionStatus === 'server-offline' || connectionStatus === 'ws-unavailable'
                  }"
                />
                <span class="font-medium text-sm">
                  {{ connectionStatus === 'connected' ? 'Connected' :
                     connectionStatus === 'disconnected' ? 'Reconnecting' :
                     connectionStatus === 'server-offline' ? 'Server Offline' : 'WebSocket Unavailable' }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {{ connectionStatus === 'connected' ? 'Real-time notifications active' :
                   connectionStatus === 'disconnected' ? 'Reconnecting automatically...' :
                   connectionStatus === 'server-offline' ? 'API server is not reachable' : 'WebSocket endpoint not available' }}
              </p>
              <Button
                v-if="connectionStatus !== 'connected' && connectionStatus !== 'disconnected'"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-refresh-cw"
                class="w-full"
                @click="retryConnection"
              >
                Retry Connection
              </Button>
            </div>
          </template>
        </Popover>
      </div>

      <!-- Bottom Panel (for rotation animation) -->
      <div
        class="absolute inset-0 w-full h-10 pl-4 pr-6 flex items-center gap-2 bg-app border-b border-gray-200/50 dark:border-gray-700/50"
        style="backface-visibility: hidden; transform: rotateX(-90deg) translateZ(20px)"
        data-tauri-drag-region>
        <ToolbarBreadcrumb :path="bottomPanel.path" />

        <div class="flex-1" />

        <template v-if="bottomToolbarItems.length">
          <div class="w-px h-4 bg-app-muted/30 ml-1" />

          <div class="flex items-center gap-1">
            <Tooltip
              v-for="item in bottomToolbarItems" :key="item.id" :text="item.label">
              <Button
                :icon="item.icon" variant="ghost" color="neutral" size="xs"
                :class="item.active ? 'text-app-accent' : 'text-app-muted hover:text-app'"
                @click="handleItemClick(item)" />
            </Tooltip>
          </div>
        </template>

        <div class="flex-1" />

        <ToolbarSearch />
        <Tooltip :text="chatTooltip">
          <div class="relative">
            <Button
              icon="i-lucide-messages-square"
              variant="ghost"
              color="neutral"
              size="xs"
              :class="(isChatOpen || isChatPinned) ? 'text-app-accent!' : 'text-app-muted hover:text-app'"
              @click="toggleChat"
            />
            <span
              v-if="isChatPinned"
              class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-app-accent ring-1 ring-app"
              title="Pinned"
            />
          </div>
        </Tooltip>

        <Popover>
          <button
            class="relative p-1.5 mr-1 rounded-md transition-colors"
            :class="{
              'text-green-500 hover:text-green-600': connectionStatus === 'connected',
              'text-amber-500 hover:text-amber-600': connectionStatus === 'disconnected',
              'text-red-500 hover:text-red-600': connectionStatus === 'server-offline' || connectionStatus === 'ws-unavailable'
            }"
          >
            <Icon
              :name="connectionStatus === 'connected' ? 'i-lucide-zap' : 'i-lucide-zap-off'"
              class="size-4"
            />
          </button>
          <template #content>
            <div class="p-3 min-w-48">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="size-2 rounded-full"
                  :class="{
                    'bg-green-500': connectionStatus === 'connected',
                    'bg-amber-500': connectionStatus === 'disconnected',
                    'bg-red-500': connectionStatus === 'server-offline' || connectionStatus === 'ws-unavailable'
                  }"
                />
                <span class="font-medium text-sm">
                  {{ connectionStatus === 'connected' ? 'Connected' :
                     connectionStatus === 'disconnected' ? 'Reconnecting' :
                     connectionStatus === 'server-offline' ? 'Server Offline' : 'WebSocket Unavailable' }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {{ connectionStatus === 'connected' ? 'Real-time notifications active' :
                   connectionStatus === 'disconnected' ? 'Reconnecting automatically...' :
                   connectionStatus === 'server-offline' ? 'API server is not reachable' : 'WebSocket endpoint not available' }}
              </p>
              <Button
                v-if="connectionStatus !== 'connected' && connectionStatus !== 'disconnected'"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-refresh-cw"
                class="w-full"
                @click="retryConnection"
              >
                Retry Connection
              </Button>
            </div>
          </template>
        </Popover>

        <Button
          icon="i-lucide-sparkles" variant="ghost" color="neutral" size="xs"
          :class="isAssistantOpen ? 'text-app-accent!' : 'text-app-muted hover:text-app'" @click="toggleAssistant" />
      </div>
    </div>
  </div>
</template>
