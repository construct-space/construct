<script setup lang="ts">
/**
 * Chat Space - Slack-like team chat with AI integration
 * Uses component-based architecture with ChatRoomList, ChatMessages, ChatInput, ChatMembersList
 */
import type { ChatRoom, ChatMessage, ChatMember } from '../composables/useChat'
import { useChatRoomAgent } from '../composables/useChatRoomAgent'
import {
  connectChatWebSocketWithFallback,
  type ChatWebSocketMode,
} from '../composables/chatWebSocket'
import SplitPane from '@/components/panels/SplitPane.vue'
import type { Project } from '~/stores/project'
import { appConfig } from '~/utils/config'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const usersStore = useUsersStore()
const { setPageItems, setSearch, clearToolbar } = useToolbar()
const api = useApi()
const { canRun: canRunRoomAgent, generateReply: generateRoomAgentReply } = useChatRoomAgent()

const routeProjectId = computed(() => {
  const id = route.params.id
  if (typeof id !== 'string') return null
  const parsed = Number.parseInt(id, 10)
  return Number.isNaN(parsed) ? null : parsed
})
const isProjectScope = computed(() => routeProjectId.value !== null)
const companyProjects = ref<Project[]>([])

// State
const rooms = ref<ChatRoom[]>([])
const currentRoom = ref<ChatRoom | null>(null)
const messages = ref<ChatMessage[]>([])
const members = ref<ChatMember[]>([])
const companyMembers = ref<ChatMember[]>([])
const loading = ref(false)
const connected = ref(false)
const typingUsers = ref<{ user_id: number; first_name: string }[]>([])
const showMembers = ref(false)

// Room search/filter
const roomSearch = ref('')
const filteredRooms = computed(() => {
  const q = roomSearch.value.trim().toLowerCase()
  if (!q) return rooms.value
  return rooms.value.filter(r => r.name.toLowerCase().includes(q))
})

// Component refs
const messagesRef = ref<InstanceType<typeof import('../components/ChatMessages.vue').default> | null>(null)
const inputRef = ref<InstanceType<typeof import('../components/ChatInput.vue').default> | null>(null)

// WebSocket
const authStore = useAuthStore()
const API_BASE = appConfig.apiBase || 'https://api.construct.ninja/api'
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let localAIMessageId = -1
let companyMembersLoadedForProject: number | null = null
let wsConnectAttempt = 0
let preferredChatWsMode: ChatWebSocketMode = 'generic'

const LEGACY_AI_PLACEHOLDER_RE = /AI integration coming soon/i

// New room dialog
const showNewRoom = ref(false)
const newRoomName = ref('')
const newRoomType = ref<'channel' | 'ai-assist'>('channel')
const newRoomAI = ref(true)

function isGeneralRoom(room: ChatRoom | null): boolean {
  if (!room) return false
  return room.type === 'channel' && room.name.trim().toLowerCase() === 'general'
}

function isLegacyAIPlaceholderMessage(message: ChatMessage): boolean {
  return message.sender.type === 'ai' && LEGACY_AI_PLACEHOLDER_RE.test(message.content)
}

const mentionMembers = computed<ChatMember[]>(() => {
  if (!isGeneralRoom(currentRoom.value)) {
    return members.value
  }

  const merged = new Map<number, ChatMember>()
  for (const member of members.value) {
    merged.set(member.id, member)
  }
  for (const member of companyMembers.value) {
    if (!merged.has(member.id)) {
      merged.set(member.id, member)
    }
  }
  return Array.from(merged.values())
})

const chatProjects = computed(() =>
  companyProjects.value.filter(project => !project.spaces || project.spaces.includes('chat'))
)

async function loadCompanyProjects() {
  try {
    if (projectStore.projects.length === 0) {
      await projectStore.fetchProjects()
    }
    companyProjects.value = projectStore.projects
  } catch (error) {
    console.error('[Chat] Failed to load company projects:', error)
    companyProjects.value = []
  }
}

function openProjectChat(projectId: number) {
  router.push(`/app/projects/${projectId}/chat`)
}

async function ensureCompanyMembers() {
  const projectId = projectStore.currentProject?.id
  if (!projectId) return
  if (companyMembersLoadedForProject === projectId && companyMembers.value.length > 0) return

  try {
    if (usersStore.users.length === 0) {
      await usersStore.fetchUsers(1, 200)
    }
    companyMembers.value = usersStore.users.map(user => ({
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar: user.avatar_url || undefined,
      role: 'member',
      is_online: false,
    }))
    companyMembersLoadedForProject = projectId
  } catch (error) {
    console.error('[Chat] Failed to load company members:', error)
  }
}

// Fetch rooms for current project
async function fetchRooms() {
  loading.value = true
  try {
    const projectId = projectStore.currentProject?.id
    if (!projectId) {
      loading.value = false
      return
    }

    const data = await api.get<{ data?: ChatRoom[] }>('/chat/rooms', {
      params: { project_id: projectId }
    })
    rooms.value = data.data || (data as unknown as ChatRoom[]) || []

    // Create default rooms if none exist
    if (rooms.value.length === 0) {
      await ensureDefaultRooms(projectId)
    }

    // Auto-select first room if none selected
    if (rooms.value.length > 0 && !currentRoom.value) {
      selectRoom(rooms.value[0]!)
    }
  } catch (e) {
    console.error('[Chat] Failed to fetch rooms:', e)
  } finally {
    loading.value = false
  }
}

// Create default rooms
async function ensureDefaultRooms(projectId: number) {
  try {
    const data = await api.post<ChatRoom[]>(`/chat/rooms/ensure-defaults?project_id=${projectId}`)
    rooms.value = data || []
  } catch (e) {
    console.error('[Chat] Failed to create default rooms:', e)
  }
}

// Select a room
async function selectRoom(room: ChatRoom) {
  currentRoom.value = room
  loading.value = true
  messages.value = []

  try {
    // Fetch messages
    const msgData = await api.get<ChatMessage[]>(
      `/chat/rooms/${room.id}/messages`,
      { params: { limit: 100 } }
    )
    messages.value = (msgData || []).filter(m => !isLegacyAIPlaceholderMessage(m))

    // Fetch members
    const memData = await api.get<ChatMember[]>(
      `/chat/rooms/${room.id}/members`
    )
    members.value = memData || []
    if (isGeneralRoom(room)) {
      await ensureCompanyMembers()
    }

    // Mark as read
    api.post(`/chat/rooms/${room.id}/read`).catch(err => {
      console.warn('Failed to mark room as read:', err)
    })

    // Update unread count in sidebar
    const roomIndex = rooms.value.findIndex(r => r.id === room.id)
    if (roomIndex >= 0 && rooms.value[roomIndex]) {
      rooms.value[roomIndex]!.unread_count = 0
    }

    // Connect WebSocket
    connectWebSocket(room.id)

  } catch (e) {
    console.error('[Chat] Failed to load room:', e)
  } finally {
    loading.value = false
    nextTick(() => {
      messagesRef.value?.scrollToBottom()
      inputRef.value?.focus()
    })
  }
}

// Create room
async function createRoom() {
  const name = newRoomName.value.trim()
  if (!name) return

  try {
    const room = await api.post<ChatRoom>('/chat/rooms', {
      name,
      type: newRoomType.value,
      project_id: projectStore.currentProject?.id,
      ai_enabled: newRoomAI.value,
    })
    rooms.value.unshift(room)
    selectRoom(room)

    // Reset form
    newRoomName.value = ''
    newRoomType.value = 'channel'
    newRoomAI.value = true
    showNewRoom.value = false
  } catch (e) {
    console.error('[Chat] Failed to create room:', e)
  }
}

// Send message
async function handleSendMessage(content: string, mentionAI: boolean) {
  if (!currentRoom.value) return

  const shouldUseLocalAgent = mentionAI && currentRoom.value.ai_enabled && canRunRoomAgent.value

  try {
    const msg = await api.post<ChatMessage>(
      `/chat/rooms/${currentRoom.value.id}/messages`,
      {
        content,
        // Use local room agent when available; otherwise fallback to backend mention_ai behavior.
        mention_ai: mentionAI && !shouldUseLocalAgent,
      }
    )
    if (!isLegacyAIPlaceholderMessage(msg) && !messages.value.find(m => m.id === msg.id)) {
      messages.value.push(msg)
    }
    nextTick(() => messagesRef.value?.scrollToBottom())
    if (shouldUseLocalAgent) {
      runLocalRoomAgentReply()
    }
  } catch (e) {
    console.error('[Chat] Failed to send message:', e)
  }
}

async function runLocalRoomAgentReply() {
  if (!currentRoom.value) return

  const room = currentRoom.value
  const historySnapshot = messages.value.filter(m => !isLegacyAIPlaceholderMessage(m))
  const localId = localAIMessageId--
  const localAIMessage: ChatMessage = {
    id: localId,
    created_at: new Date().toISOString(),
    content: '',
    sender: {
      type: 'ai',
      first_name: 'AI',
      last_name: '',
      ai_model: 'chat',
    },
  }

  messages.value.push(localAIMessage)
  nextTick(() => messagesRef.value?.scrollToBottom())

  let didError = false
  try {
    await generateRoomAgentReply({
      roomName: room.name,
      roomId: room.id,
      history: historySnapshot,
      onChunk: (chunk) => {
        if (chunk.error) {
          localAIMessage.content = `I hit an error: ${chunk.error}`
          didError = true
          return
        }
        if (chunk.content) {
          localAIMessage.content += chunk.content
          nextTick(() => messagesRef.value?.scrollToBottom())
        }
      },
    })
  } catch (error) {
    localAIMessage.content = `I hit an error: ${error instanceof Error ? error.message : 'Unknown error'}`
    didError = true
  } finally {
    localAIMessage.content = localAIMessage.content.trim()
    if (!didError && !localAIMessage.content) {
      messages.value = messages.value.filter(m => m.id !== localId)
    }
    nextTick(() => messagesRef.value?.scrollToBottom())
  }
}

// Handle typing indicator
function handleTyping(isTyping: boolean) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: isTyping ? 'typing' : 'stop_typing' }))
  }
}

// WebSocket connection
function connectWebSocket(roomId: number) {
  const attemptId = ++wsConnectAttempt
  if (ws) ws.close()
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const user = authStore.user
  const token = authStore.token
  if (!user || !token) return

  connectChatWebSocketWithFallback({
    apiBase: API_BASE,
    roomId,
    token,
    preferredMode: preferredChatWsMode,
    user: {
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
    },
  })
    .then(({ socket, mode }) => {
      if (attemptId !== wsConnectAttempt) {
        socket.close()
        return
      }

      ws = socket
      preferredChatWsMode = mode
      connected.value = true

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.room_id !== currentRoom.value?.id) return

          switch (data.type) {
            case 'message':
              if (isLegacyAIPlaceholderMessage(data.payload)) break
              if (!messages.value.find(m => m.id === data.payload.id)) {
                messages.value.push(data.payload)
                nextTick(() => messagesRef.value?.scrollToBottom())
              }
              break

            case 'message_edited': {
              const editIdx = messages.value.findIndex(m => m.id === data.payload.id)
              if (editIdx >= 0) {
                messages.value[editIdx] = data.payload
              }
              break
            }

            case 'message_deleted':
              messages.value = messages.value.filter(m => m.id !== data.payload.id)
              break

            case 'typing':
              if (data.payload.is_typing) {
                if (!typingUsers.value.find(u => u.user_id === data.payload.user_id)) {
                  typingUsers.value.push({
                    user_id: data.payload.user_id,
                    first_name: data.payload.first_name,
                  })
                }
              } else {
                typingUsers.value = typingUsers.value.filter(u => u.user_id !== data.payload.user_id)
              }
              break

            case 'presence': {
              const member = members.value.find(m => m.id === data.payload.user_id)
              if (member) {
                member.is_online = data.payload.online
              }
              break
            }
          }
        } catch (e) {
          console.error('[Chat] WS parse error:', e)
        }
      }

      socket.onclose = () => {
        connected.value = false
        // Reconnect if still viewing the same room.
        if (currentRoom.value?.id === roomId) {
          if (reconnectTimer) clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(() => connectWebSocket(roomId), 3000)
        }
      }

      socket.onerror = (e) => {
        console.error('[Chat] WebSocket error:', e)
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.close()
        }
      }
    })
    .catch((e) => {
      if (attemptId !== wsConnectAttempt) return
      connected.value = false
      console.warn('[Chat] WebSocket connect failed:', e)
      if (currentRoom.value?.id === roomId) {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => connectWebSocket(roomId), 3000)
      }
    })
}

// Toggle members panel
function toggleMembers() {
  showMembers.value = !showMembers.value
}

// Handle load more messages
async function handleLoadMore() {
  if (!currentRoom.value || messages.value.length === 0) return
  const oldestId = messages.value[0]?.id
  if (!oldestId) return

  try {
    const older = await api.get<ChatMessage[]>(
      `/chat/rooms/${currentRoom.value.id}/messages`,
      { params: { before: oldestId, limit: 50 } }
    )
    if (older && older.length > 0) {
      messages.value = [...older.filter(m => !isLegacyAIPlaceholderMessage(m)), ...messages.value]
    }
  } catch (e) {
    console.error('[Chat] Failed to load older messages:', e)
  }
}

// Watch for project changes
watch(() => projectStore.currentProject?.id, (projectId) => {
  if (!isProjectScope.value) {
    currentRoom.value = null
    rooms.value = []
    messages.value = []
    members.value = []
    companyMembers.value = []
    companyMembersLoadedForProject = null
    return
  }

  if (projectId) {
    currentRoom.value = null
    messages.value = []
    members.value = []
    companyMembers.value = []
    companyMembersLoadedForProject = null
    fetchRooms()
  }
}, { immediate: true })

const syncToolbar = () => {
  if (isProjectScope.value) {
    setPageItems([
      {
        id: 'chat-new',
        icon: 'i-lucide-plus',
        label: 'New Room',
        type: 'action',
        category: 'space',
        onClick: () => showNewRoom.value = true,
      },
      {
        id: 'chat-members',
        icon: 'i-lucide-users',
        label: 'Members',
        type: 'action',
        category: 'space',
        onClick: toggleMembers,
      },
    ])

    setSearch('Search rooms...', (query) => {
      roomSearch.value = query
    })
    return
  }

  setPageItems([
    {
      id: 'chat-open-projects',
      icon: 'i-lucide-folder-open',
      label: 'Projects',
      type: 'action',
      category: 'space',
      onClick: () => router.push('/app/projects'),
    },
    {
      id: 'chat-refresh-projects',
      icon: 'i-lucide-refresh-cw',
      label: 'Refresh',
      type: 'action',
      category: 'space',
      onClick: loadCompanyProjects,
    },
  ])

  setSearch('Search projects...', (query) => {
    const q = query.trim().toLowerCase()
    if (!q) {
      companyProjects.value = [...projectStore.projects]
      return
    }
    companyProjects.value = projectStore.projects.filter(project =>
      project.name.toLowerCase().includes(q) ||
      (project.description || '').toLowerCase().includes(q)
    )
  })
}

// Toolbar
onMounted(() => {
  syncToolbar()
  if (!isProjectScope.value) {
    loadCompanyProjects()
  }
})

watch(isProjectScope, (scope, previousScope) => {
  if (scope === previousScope) return
  syncToolbar()
  if (!scope) {
    loadCompanyProjects()
  }
})

onUnmounted(() => {
  clearToolbar()
  wsConnectAttempt++
  if (ws) ws.close()
  if (reconnectTimer) clearTimeout(reconnectTimer)
})
</script>

<template>
  <div v-if="!isProjectScope" class="h-full flex items-center justify-center p-6 bg-app">
    <div class="max-w-3xl w-full rounded-2xl bg-white/[0.03] p-6">
      <div class="flex items-center gap-3 mb-3">
        <Icon name="i-lucide-buildings-2" class="size-6 text-app-accent" />
        <h2 class="text-xl font-semibold text-app">Company Chat Scope</h2>
      </div>
      <p class="text-sm text-white/30 mb-6">
        Chat rooms are project-based. Pick a project to open its chat workspace.
      </p>

      <div v-if="chatProjects.length === 0" class="text-center py-10 rounded-xl bg-white/[0.02]">
        <Icon name="i-lucide-messages-square" class="size-12 mx-auto text-white/15 mb-3" />
        <p class="text-white/30 mb-4">No chat-enabled projects found.</p>
        <Button
          icon="i-lucide-folder-open"
          label="Open Projects"
          @click="router.push('/app/projects')"
        />
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
        <button
          v-for="project in chatProjects"
          :key="project.id"
          class="text-left rounded-xl bg-white/[0.03] hover:bg-white/[0.07] px-4 py-3 transition-colors"
          @click="openProjectChat(project.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="font-medium text-app truncate">{{ project.name }}</p>
            <Icon name="i-lucide-arrow-up-right" class="size-4 text-white/20" />
          </div>
          <p class="text-xs text-white/25 mt-1 line-clamp-2">
            {{ project.description || 'Open project chat rooms' }}
          </p>
        </button>
      </div>
    </div>
  </div>

  <template v-else>
    <SplitPane
      direction="horizontal"
      :initial-size="20"
      :min-size="12"
      :max-size="35"
    >
      <template #first>
        <div class="h-full">
          <ChatRoomList
            :rooms="filteredRooms"
            :current-room-id="currentRoom?.id ?? null"
            :loading="loading"
            :search="roomSearch"
            @select="selectRoom"
            @create="showNewRoom = true"
            @update:search="roomSearch = $event"
          />
        </div>
      </template>

      <template #second>
        <div class="h-full flex flex-col min-w-0 relative">
          <!-- Room Header -->
          <div v-if="currentRoom" class="px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-3">
              <Icon
                :name="currentRoom.type === 'ai-assist' ? 'i-lucide-sparkles' : 'i-lucide-hash'"
                class="size-5 text-white/25"
              />
              <div>
                <h2 class="font-semibold text-app text-sm">{{ currentRoom.name }}</h2>
                <p
                  v-if="currentRoom.ai_enabled"
                  class="text-xs text-white/30 flex items-center gap-1"
                >
                  <Icon name="i-lucide-sparkles" class="size-3 text-purple-400" />
                  AI enabled -- mention @ai to ask
                </p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-xs text-white/25 mr-2">{{ members.length }} member{{ members.length !== 1 ? 's' : '' }}</span>
              <Button
                icon="i-lucide-users"
                variant="ghost"
                size="xs"
                :class="showMembers ? 'bg-white/10' : ''"
                @click="toggleMembers"
              />
            </div>
          </div>

          <!-- No room selected -->
          <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <Icon name="i-lucide-messages-square" class="size-12 mx-auto text-white/10 mb-3" />
              <p class="text-white/25 text-sm">Select a room to start chatting</p>
            </div>
          </div>

          <!-- Messages Area -->
          <ChatMessages
            v-if="currentRoom"
            ref="messagesRef"
            :messages="messages"
            :current-room="currentRoom"
            :loading="loading"
            :typing-users="typingUsers"
            @scroll-top="handleLoadMore"
          />

          <!-- Input Area -->
          <ChatInput
            v-if="currentRoom"
            ref="inputRef"
            :current-room="currentRoom"
            :members="members"
            :mention-members="mentionMembers"
            :connected="connected"
            @send="handleSendMessage"
            @typing="handleTyping"
          />

          <!-- Members Panel (overlay) -->
          <ChatMembersList
            :members="members"
            :current-room="currentRoom"
            :visible="showMembers"
            @close="showMembers = false"
            @add-member="() => {}"
            @remove-member="() => {}"
          />
        </div>
      </template>
    </SplitPane>

    <!-- New Room Modal -->
    <Modal v-model:open="showNewRoom">
      <template #content>
        <div class="p-5 space-y-4">
          <!-- Header -->
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-lg bg-app-accent/20 flex items-center justify-center">
              <Icon name="i-lucide-plus" class="size-5 text-app-accent" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-app">Create Chat Room</h2>
              <p class="text-xs text-app-muted">Add a new channel for your team</p>
            </div>
          </div>
 

        <!-- Room name -->
        <FormField label="Room Name">
          <Input
            v-model="newRoomName"
            placeholder="e.g., design-feedback, bug-reports, general"
            icon="i-lucide-hash"
            autofocus
            @keydown.enter="createRoom"
          />
        </FormField>

        <!-- Room type -->
        <FormField label="Room Type">
          <div class="flex gap-2">
            <button
              class="flex-1 p-3 rounded-lg transition-colors text-left"
              :class="newRoomType === 'channel'
                ? 'bg-app-accent/10 text-app ring-1 ring-app-accent/30'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06]'"
              @click="newRoomType = 'channel'"
            >
              <Icon name="i-lucide-hash" class="size-5 mb-1" />
              <div class="text-sm font-medium">Channel</div>
              <div class="text-xs opacity-70 mt-0.5">General discussion</div>
            </button>
            <button
              class="flex-1 p-3 rounded-lg transition-colors text-left"
              :class="newRoomType === 'ai-assist'
                ? 'bg-purple-500/10 text-app ring-1 ring-purple-500/30'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06]'"
              @click="newRoomType = 'ai-assist'; newRoomAI = true"
            >
              <Icon name="i-lucide-sparkles" class="size-5 mb-1 text-purple-400" />
              <div class="text-sm font-medium">AI Assist</div>
              <div class="text-xs opacity-70 mt-0.5">AI-focused room</div>
            </button>
          </div>
        </FormField>

        <!-- AI toggle -->
        <label
          v-if="newRoomType === 'channel'"
          class="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] cursor-pointer"
        >
          <div class="flex items-center gap-3">
            <Icon name="i-lucide-sparkles" class="size-4 text-purple-400" />
            <div>
              <div class="text-sm text-app">Enable AI</div>
              <div class="text-xs text-app-muted">Members can @ai to ask questions</div>
            </div>
          </div>
          <input
            v-model="newRoomAI"
            type="checkbox"
            class="size-4 rounded border-default accent-[var(--app-accent)]"
          >
        </label>

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-2">
          <Button
            label="Cancel"
            variant="ghost"
            @click="showNewRoom = false"
          />
          <Button
            label="Create Room"
            icon="i-lucide-plus"
            color="primary"
            :disabled="!newRoomName.trim()"
            @click="createRoom"
          />
        </div>
        </div>
      </template>
    </Modal>
  </template>
</template>
