<script setup lang="ts">
/**
 * AI Space - Full AI Assistant page
 * Layout: Left sidebar with conversation history, main area with chat
 */
import type { AIConversation } from '~/composables/useContextDB'

const projectStore = useProjectStore()
const { setPageItems, setSearch, clearToolbar } = useToolbar()

// State
const activeConversationId = ref<string | null>(null)
const sidebarOpen = ref(true)
const chatRef = ref<{ clearMessages: () => void; loadConversation: (id: string) => void; chatMode: 'single' | 'roundrobin' } | null>(null)
const conversationListRef = ref<{ loadConversations: () => void; setSearchQuery: (query: string) => void } | null>(null)
const conductorRef = ref<{ dispatch: (agentId: string, task: string) => void } | null>(null)
const showConductor = ref(false)

// Conversation width
const sidebarWidth = ref(290)

const conversationContextKey = computed(() => {
  const projectId = projectStore.currentProject?.id
  return projectId ? `project:${projectId}` : 'project:global'
})

// New conversation
function startNewConversation() {
  activeConversationId.value = null
  chatRef.value?.clearMessages()
}

// Select conversation from sidebar
function selectConversation(conv: AIConversation) {
  activeConversationId.value = conv.id
  chatRef.value?.loadConversation(conv.id)
}

// When chat creates a new conversation
function onConversationCreated(id: string) {
  activeConversationId.value = id
  conversationListRef.value?.loadConversations()
}

// When chat updates the title
function onTitleUpdated(_title: string) {
  // Refresh sidebar to show new title
  conversationListRef.value?.loadConversations()
}

// Handle search
function handleSearch(query: string) {
  conversationListRef.value?.setSearchQuery(query)
}

// Toggle sidebar
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

// Setup toolbar
onMounted(() => {
  setPageItems([
    {
      id: 'ai-new-chat',
      icon: 'i-lucide-plus',
      label: 'New Chat',
      type: 'action',
      category: 'space',
      onClick: startNewConversation,
    },
    {
      id: 'ai-sidebar',
      icon: 'i-lucide-panel-left',
      label: 'Toggle Sidebar',
      type: 'action',
      category: 'space',
      onClick: toggleSidebar,
    },
    {
      id: 'ai-roundtable',
      icon: 'i-lucide-users',
      label: 'Roundtable Mode',
      type: 'action',
      category: 'space',
      onClick: () => {
        if (chatRef.value) {
          // Toggle mode via the exposed ref — chatMode is a ref on AIChat
          const chat = chatRef.value as unknown as { chatMode: { value: string } }
          chat.chatMode.value = chat.chatMode.value === 'roundrobin' ? 'single' : 'roundrobin'
        }
      },
    },
    {
      id: 'ai-conductor',
      icon: 'i-lucide-workflow',
      label: 'Agent Activity',
      type: 'action',
      category: 'space',
      onClick: () => { showConductor.value = !showConductor.value },
    },
  ])

  setSearch('Search conversations...', handleSearch)
})

watch(() => projectStore.currentProject?.id, () => {
  startNewConversation()
  conversationListRef.value?.loadConversations()
})

onUnmounted(() => {
  clearToolbar()
})
</script>

<template>
  <div class="h-full flex overflow-hidden">
    <!-- Left Sidebar: Conversation History -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-x-4 w-0"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 -translate-x-4 w-0"
    >
      <div
        v-if="sidebarOpen"
        class="shrink-0 border-r border-app overflow-hidden"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <AIConversationList
          ref="conversationListRef"
          :active-id="activeConversationId"
          :context-key="conversationContextKey"
          @select="selectConversation"
          @new="startNewConversation"
        />
      </div>
    </Transition>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <AIChat
        ref="chatRef"
        :project-id="String(projectStore.currentProject?.id || '')"
        :conversation-id="activeConversationId"
        @conversation-created="onConversationCreated"
        @title-updated="onTitleUpdated"
      />

      <!-- Conductor Panel (agent activity) -->
      <AIConductor
        ref="conductorRef"
        :visible="showConductor"
      />
    </div>
  </div>
</template>
