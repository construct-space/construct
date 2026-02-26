/**
 * Chat Composable
 * Handles chat API calls and WebSocket connection for real-time messaging
 */

import type { Ref } from 'vue'
import { appConfig } from '~/utils/config'
import {
  connectChatWebSocketWithFallback,
  type ChatWebSocketMode,
} from './chatWebSocket'

export interface ChatRoom {
  id: number
  name: string
  type: 'channel' | 'direct' | 'ai-assist'
  icon?: string
  ai_enabled: boolean
  ai_model?: string
  last_message?: string
  member_count: number
  unread_count: number
  is_archived?: boolean
}

export interface ChatMessageSender {
  id?: number
  type: 'user' | 'ai'
  first_name?: string
  last_name?: string
  avatar?: string
  ai_model?: string
}

export interface ChatMessage {
  id: number
  created_at: string
  content: string
  sender: ChatMessageSender
  is_edited?: boolean
  reply_to_id?: number
  reactions?: string
}

export interface ChatMember {
  id: number
  first_name: string
  last_name: string
  avatar?: string
  role: 'admin' | 'member'
  is_online: boolean
}

// WebSocket message types
interface WSMessage {
  type: 'message' | 'message_edited' | 'message_deleted' | 'typing' | 'presence'
  room_id: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

export function useChat() {
  const authStore = useAuthStore()

  const API_BASE = appConfig.apiBase || 'https://api.construct.ninja/api'

  // State
  const rooms: Ref<ChatRoom[]> = ref([])
  const currentRoom: Ref<ChatRoom | null> = ref(null)
  const messages: Ref<ChatMessage[]> = ref([])
  const members: Ref<ChatMember[]> = ref([])
  const loading = ref(false)
  const connected = ref(false)
  const typingUsers: Ref<{ user_id: number; first_name: string }[]> = ref([])

  // WebSocket
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let wsConnectAttempt = 0
  let preferredChatWsMode: ChatWebSocketMode = 'generic'

  // API helpers
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authStore.token}`,
  })

  // Fetch rooms
  async function fetchRooms(projectId?: number) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('project_id', String(projectId))

      const res = await fetch(`${API_BASE}/chat/rooms?${params}`, {
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        rooms.value = data.data || data || []
      }
    } catch (e) {
      console.error('[Chat] Failed to fetch rooms:', e)
    } finally {
      loading.value = false
    }
  }

  // Create room
  async function createRoom(name: string, options: {
    type?: string
    description?: string
    project_id?: number
    ai_enabled?: boolean
    ai_model?: string
    ai_context?: string
  } = {}) {
    try {
      const res = await fetch(`${API_BASE}/chat/rooms`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name,
          type: options.type || 'channel',
          description: options.description || '',
          project_id: options.project_id,
          ai_enabled: options.ai_enabled ?? true,
          ai_model: options.ai_model || '',
          ai_context: options.ai_context || '',
        }),
      })

      if (res.ok) {
        const room = await res.json()
        rooms.value.unshift(room)
        return room
      }
    } catch (e) {
      console.error('[Chat] Failed to create room:', e)
    }
    return null
  }

  // Join room and load messages
  async function joinRoom(roomId: number) {
    loading.value = true
    try {
      // Get room details
      const roomRes = await fetch(`${API_BASE}/chat/rooms/${roomId}`, {
        headers: getHeaders(),
      })
      if (roomRes.ok) {
        currentRoom.value = await roomRes.json()
      }

      // Get messages
      const msgRes = await fetch(`${API_BASE}/chat/rooms/${roomId}/messages?limit=50`, {
        headers: getHeaders(),
      })
      if (msgRes.ok) {
        messages.value = await msgRes.json()
      }

      // Get members
      const memRes = await fetch(`${API_BASE}/chat/rooms/${roomId}/members`, {
        headers: getHeaders(),
      })
      if (memRes.ok) {
        members.value = await memRes.json()
      }

      // Mark as read
      fetch(`${API_BASE}/chat/rooms/${roomId}/read`, {
        method: 'POST',
        headers: getHeaders(),
      })

      // Connect WebSocket for this room
      connectWebSocket(roomId)

    } catch (e) {
      console.error('[Chat] Failed to join room:', e)
    } finally {
      loading.value = false
    }
  }

  // Send message
  async function sendMessage(content: string, mentionAI = false) {
    if (!currentRoom.value) return null

    try {
      const res = await fetch(`${API_BASE}/chat/rooms/${currentRoom.value.id}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          content,
          mention_ai: mentionAI,
        }),
      })

      if (res.ok) {
        const msg = await res.json()
        // Message will also come via WebSocket, but add immediately for responsiveness
        if (!messages.value.find(m => m.id === msg.id)) {
          messages.value.push(msg)
        }
        return msg
      }
    } catch (e) {
      console.error('[Chat] Failed to send message:', e)
    }
    return null
  }

  // Load more messages (pagination)
  async function loadMoreMessages() {
    if (!currentRoom.value || messages.value.length === 0) return

    const oldestId = messages.value[0]?.id
    try {
      const res = await fetch(
        `${API_BASE}/chat/rooms/${currentRoom.value.id}/messages?before=${oldestId}&limit=50`,
        { headers: getHeaders() }
      )

      if (res.ok) {
        const older = await res.json()
        messages.value = [...older, ...messages.value]
      }
    } catch (e) {
      console.error('[Chat] Failed to load more messages:', e)
    }
  }

  // WebSocket connection
  function connectWebSocket(roomId: number) {
    const attemptId = ++wsConnectAttempt
    if (ws) {
      ws.close()
    }
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
        console.log('[Chat] WebSocket connected')

        socket.onmessage = (event) => {
          try {
            const msg: WSMessage = JSON.parse(event.data)
            handleWSMessage(msg)
          } catch (e) {
            console.error('[Chat] Failed to parse WS message:', e)
          }
        }

        socket.onclose = () => {
          connected.value = false
          console.log('[Chat] WebSocket disconnected')

          // Reconnect after delay.
          if (currentRoom.value?.id === roomId) {
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
          reconnectTimer = setTimeout(() => connectWebSocket(roomId), 3000)
        }
      })
  }

  function handleWSMessage(msg: WSMessage) {
    if (msg.room_id !== currentRoom.value?.id) return

    switch (msg.type) {
      case 'message':
        // Add new message if not already present
        if (!messages.value.find(m => m.id === msg.payload.id)) {
          messages.value.push(msg.payload)
        }
        break

      case 'message_edited': {
        const editIdx = messages.value.findIndex(m => m.id === msg.payload.id)
        if (editIdx >= 0) {
          messages.value[editIdx] = msg.payload
        }
        break
      }

      case 'message_deleted':
        messages.value = messages.value.filter(m => m.id !== msg.payload.id)
        break

      case 'typing':
        if (msg.payload.is_typing) {
          if (!typingUsers.value.find(u => u.user_id === msg.payload.user_id)) {
            typingUsers.value.push({
              user_id: msg.payload.user_id,
              first_name: msg.payload.first_name,
            })
          }
        } else {
          typingUsers.value = typingUsers.value.filter(u => u.user_id !== msg.payload.user_id)
        }
        break

      case 'presence': {
        const member = members.value.find(m => m.id === msg.payload.user_id)
        if (member) {
          member.is_online = msg.payload.online
        }
        break
      }
    }
  }

  // Send typing indicator
  function sendTyping(isTyping: boolean) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: isTyping ? 'typing' : 'stop_typing',
      }))
    }
  }

  // Disconnect
  function disconnect() {
    wsConnectAttempt++
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    connected.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    // State
    rooms,
    currentRoom,
    messages,
    members,
    loading,
    connected,
    typingUsers,

    // Actions
    fetchRooms,
    createRoom,
    joinRoom,
    sendMessage,
    loadMoreMessages,
    sendTyping,
    disconnect,
  }
}
