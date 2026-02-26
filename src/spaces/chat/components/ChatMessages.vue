<script setup lang="ts">
/**
 * ChatMessages - Displays message thread with avatars, timestamps, and markdown
 * Supports auto-scroll, date separators, and AI message styling
 */
import type { ChatMessage, ChatRoom } from '../composables/useChat'
import { useMarkdown } from '~/composables/useMarkdown'

const props = defineProps<{
  messages: ChatMessage[]
  currentRoom: ChatRoom | null
  loading: boolean
  typingUsers: { user_id: number; first_name: string }[]
}>()

const emit = defineEmits<{
  scrollTop: []
}>()

const messagesContainer = ref<HTMLElement | null>(null)
const isNearBottom = ref(true)

const { renderMarkdown, initModules } = useMarkdown()

// Check if message content looks like it has markdown
function hasMarkdown(content: string): boolean {
  return /[*_`#[\]!>~|]/.test(content) || content.includes('```')
}

// Scroll to bottom
function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      })
    }
  })
}

// Check if user is near bottom of scroll
function checkScrollPosition() {
  if (!messagesContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  isNearBottom.value = scrollHeight - scrollTop - clientHeight < 100
}

// Handle scroll event
function handleScroll() {
  checkScrollPosition()

  // Emit scroll top for loading more messages
  if (messagesContainer.value && messagesContainer.value.scrollTop < 50) {
    emit('scrollTop')
  }
}

// Auto-scroll when new messages arrive (if near bottom)
watch(
  () => props.messages.length,
  () => {
    if (isNearBottom.value) {
      scrollToBottom(true)
    }
  }
)

// Scroll to bottom on room change
watch(
  () => props.currentRoom?.id,
  () => {
    scrollToBottom()
  }
)

// Format time from date string
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Format date for separator
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

// Check if a date separator should be shown before this message
function shouldShowDateSeparator(index: number): boolean {
  if (index === 0) return true
  const prev = props.messages[index - 1]
  const curr = props.messages[index]
  if (!prev || !curr) return false
  const prevDate = new Date(prev.created_at).toDateString()
  const currDate = new Date(curr.created_at).toDateString()
  return prevDate !== currDate
}

// Check if this message should be grouped with previous (same sender within 5 mins)
function isGroupedWithPrevious(index: number): boolean {
  if (index === 0) return false
  const prev = props.messages[index - 1]
  const curr = props.messages[index]
  if (!prev || !curr) return false
  if (shouldShowDateSeparator(index)) return false

  const sameSender =
    prev.sender.type === curr.sender.type &&
    prev.sender.id === curr.sender.id

  if (!sameSender) return false

  const prevTime = new Date(prev.created_at).getTime()
  const currTime = new Date(curr.created_at).getTime()
  return currTime - prevTime < 5 * 60 * 1000
}

// Get sender display name
function getSenderName(sender: ChatMessage['sender']): string {
  if (sender.type === 'ai') {
    return `AI ${sender.ai_model ? `(${sender.ai_model})` : 'Assistant'}`
  }
  return `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Unknown'
}

// Get sender initials for avatar
function getSenderInitials(sender: ChatMessage['sender']): string {
  if (sender.type === 'ai') return 'AI'
  const first = sender.first_name?.[0] || ''
  const last = sender.last_name?.[0] || ''
  return (first + last).toUpperCase() || '?'
}

// Get avatar color based on sender
function getAvatarColor(sender: ChatMessage['sender']): string {
  if (sender.type === 'ai') return 'bg-purple-600 text-white'

  // Generate consistent color from name
  const name = `${sender.first_name || ''}${sender.last_name || ''}`
  const colors = [
    'bg-blue-600 text-white',
    'bg-green-600 text-white',
    'bg-orange-600 text-white',
    'bg-pink-600 text-white',
    'bg-teal-600 text-white',
    'bg-indigo-600 text-white',
    'bg-red-600 text-white',
    'bg-cyan-600 text-white',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length] || colors[0]!
}

// Format typing indicator text
const typingText = computed(() => {
  if (props.typingUsers.length === 0) return ''
  if (props.typingUsers.length === 1) return `${props.typingUsers[0]!.first_name} is typing...`
  if (props.typingUsers.length === 2) return `${props.typingUsers[0]!.first_name} and ${props.typingUsers[1]!.first_name} are typing...`
  return `${props.typingUsers[0]!.first_name} and ${props.typingUsers.length - 1} others are typing...`
})

// Expose scrollToBottom for parent
defineExpose({ scrollToBottom })

onMounted(() => {
  initModules()
  scrollToBottom()
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Messages container -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 pb-2"
      @scroll="handleScroll"
    >
      <!-- Loading state -->
      <div v-if="loading && messages.length === 0" class="flex items-center justify-center h-full">
        <div class="flex flex-col items-center gap-3">
          <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-app-muted" />
          <span class="text-sm text-app-muted">Loading messages...</span>
        </div>
      </div>

      <!-- No room selected -->
      <div v-else-if="!currentRoom" class="flex flex-col items-center justify-center h-full text-app-muted">
        <Icon name="i-lucide-messages-square" class="size-16 mb-4 opacity-30" />
        <p class="text-lg font-medium">Select a room to start chatting</p>
        <p class="text-sm mt-2 opacity-70">Pick a channel from the sidebar or create a new one</p>
      </div>

      <!-- Empty room -->
      <div v-else-if="messages.length === 0 && !loading" class="flex flex-col items-center justify-center h-full text-app-muted">
        <div class="size-16 rounded-2xl bg-app-accent/10 flex items-center justify-center mb-4">
          <Icon name="i-lucide-message-circle" class="size-8 text-app-accent opacity-60" />
        </div>
        <p class="text-lg font-medium text-app">Welcome to #{{ currentRoom.name }}</p>
        <p class="text-sm mt-2 opacity-70">This is the start of the conversation. Say something!</p>
        <p v-if="currentRoom.ai_enabled" class="text-sm mt-1 opacity-70 flex items-center gap-1">
          <Icon name="i-lucide-sparkles" class="size-3" />
          Type @ai to ask the AI assistant
        </p>
      </div>

      <!-- Messages -->
      <div v-else class="py-4 space-y-0.5">
        <template v-for="(msg, index) in messages" :key="msg.id">
          <!-- Date separator -->
          <div v-if="shouldShowDateSeparator(index)" class="flex items-center gap-4 py-4">
            <div class="flex-1 h-px bg-white/10" />
            <span class="text-xs text-app-muted font-medium px-2">
              {{ formatDate(msg.created_at) }}
            </span>
            <div class="flex-1 h-px bg-white/10" />
          </div>

          <!-- Message -->
          <div
            class="flex gap-3 px-2 py-1 rounded-lg transition-colors hover:bg-white/[0.03] group"
            :class="[
              msg.sender.type === 'ai' ? 'bg-purple-500/[0.04]' : '',
              isGroupedWithPrevious(index) ? 'mt-0' : 'mt-3'
            ]"
          >
            <!-- Avatar (only show if not grouped) -->
            <div class="w-9 flex-shrink-0">
              <div
                v-if="!isGroupedWithPrevious(index)"
                class="size-9 rounded-full flex items-center justify-center text-xs font-semibold"
                :class="getAvatarColor(msg.sender)"
              >
                <img
                  v-if="msg.sender.avatar"
                  :src="msg.sender.avatar"
                  class="size-full rounded-full object-cover"
                  :alt="getSenderName(msg.sender)"
                >
                <span v-else>{{ getSenderInitials(msg.sender) }}</span>
              </div>
              <!-- Show timestamp on hover for grouped messages -->
              <span
                v-else
                class="text-[10px] text-app-muted opacity-0 group-hover:opacity-100 transition-opacity leading-[36px] block text-center"
              >
                {{ formatTime(msg.created_at) }}
              </span>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Header (only show if not grouped) -->
              <div v-if="!isGroupedWithPrevious(index)" class="flex items-baseline gap-2 mb-0.5">
                <span
                  class="font-semibold text-sm"
                  :class="msg.sender.type === 'ai' ? 'text-purple-400' : 'text-app'"
                >
                  {{ getSenderName(msg.sender) }}
                </span>
                <span v-if="msg.sender.type === 'ai'" class="text-[10px] text-purple-400/60 flex items-center gap-0.5">
                  <Icon name="i-lucide-sparkles" class="size-2.5" />
                  AI
                </span>
                <span class="text-xs text-app-muted">{{ formatTime(msg.created_at) }}</span>
                <span v-if="msg.is_edited" class="text-[10px] text-app-muted">(edited)</span>
              </div>

              <!-- Message body -->
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="hasMarkdown(msg.content) || msg.sender.type === 'ai'"
                class="text-sm text-app prose prose-invert prose-sm max-w-none
                  prose-p:my-1 prose-pre:my-2 prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10
                  prose-code:text-pink-400 prose-code:bg-black/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                  prose-a:text-app-accent prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-app prose-em:text-app
                  prose-ul:my-1 prose-ol:my-1 prose-li:my-0
                  prose-blockquote:border-app-accent/50 prose-blockquote:text-app-muted"
                v-html="renderMarkdown(msg.content)"
              />
              <!-- eslint-enable vue/no-v-html -->
              <div
                v-else
                class="text-sm text-app whitespace-pre-wrap break-words"
              >
                {{ msg.content }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Typing indicator -->
    <div
      v-if="typingText"
      class="px-6 py-1.5 text-xs text-app-muted flex items-center gap-2 flex-shrink-0"
    >
      <span class="flex gap-0.5">
        <span class="size-1.5 rounded-full bg-app-muted animate-bounce [animation-delay:0ms]" />
        <span class="size-1.5 rounded-full bg-app-muted animate-bounce [animation-delay:150ms]" />
        <span class="size-1.5 rounded-full bg-app-muted animate-bounce [animation-delay:300ms]" />
      </span>
      <span>{{ typingText }}</span>
    </div>

    <!-- Scroll to bottom button -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-if="!isNearBottom && messages.length > 0"
        class="absolute bottom-20 right-8 size-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10
          flex items-center justify-center hover:bg-white/20 transition-colors shadow-lg"
        @click="scrollToBottom(true)"
      >
        <Icon name="i-lucide-chevron-down" class="size-5 text-app" />
      </button>
    </Transition>
  </div>
</template>
