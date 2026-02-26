<script setup lang="ts">
/**
 * ChatInput - Message input area with send button
 * Supports Shift+Enter for new lines, Enter to send, @mentions, and typing indicators
 */
import type { ChatRoom, ChatMember } from '../composables/useChat'

const props = defineProps<{
  currentRoom: ChatRoom | null
  members: ChatMember[]
  mentionMembers?: ChatMember[]
  connected: boolean
}>()

const emit = defineEmits<{
  send: [content: string, mentionAI: boolean]
  typing: [isTyping: boolean]
}>()

const messageInput = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showMentions = ref(false)
const mentionQuery = ref('')
const mentionStartPos = ref(0)
const selectedMentionIndex = ref(0)

// Typing state
let typingTimer: ReturnType<typeof setTimeout> | null = null
let isCurrentlyTyping = false

const mentionCandidates = computed(() => {
  if (props.mentionMembers && props.mentionMembers.length > 0) {
    return props.mentionMembers
  }
  return props.members
})

// Filtered mention suggestions
const mentionSuggestions = computed(() => {
  const query = mentionQuery.value.toLowerCase()
  const suggestions: { label: string; value: string; icon?: string }[] = []

  // Always show AI option
  if ('ai'.startsWith(query) || query === '') {
    suggestions.push({ label: 'AI Assistant', value: 'ai', icon: 'i-lucide-sparkles' })
  }

  // Filter members
  for (const member of mentionCandidates.value) {
    const name = `${member.first_name} ${member.last_name}`.toLowerCase()
    const firstName = (member.first_name || '').toLowerCase()
    if (firstName.startsWith(query) || name.includes(query)) {
      suggestions.push({
        label: `${member.first_name} ${member.last_name}`,
        value: member.first_name || String(member.id),
      })
    }
  }

  return suggestions.slice(0, 8)
})

// Handle input
function handleInput() {
  autoResize()
  checkForMention()
  handleTyping()
}

// Auto-resize textarea
function autoResize() {
  const textarea = textareaRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  const maxHeight = 150
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
}

// Check for @ mention trigger
function checkForMention() {
  const textarea = textareaRef.value
  if (!textarea) return

  const cursorPos = textarea.selectionStart
  const text = messageInput.value.substring(0, cursorPos)

  // Find the last @ that is either at start or preceded by space
  const lastAtIndex = text.lastIndexOf('@')
  if (lastAtIndex >= 0 && (lastAtIndex === 0 || text[lastAtIndex - 1] === ' ')) {
    const query = text.substring(lastAtIndex + 1)
    // Only show if query doesn't contain spaces (simple mention)
    if (!query.includes(' ') || query.length < 15) {
      mentionQuery.value = query
      mentionStartPos.value = lastAtIndex
      showMentions.value = true
      selectedMentionIndex.value = 0
      return
    }
  }

  showMentions.value = false
}

// Select a mention
function selectMention(suggestion: { label: string; value: string }) {
  const before = messageInput.value.substring(0, mentionStartPos.value)
  const after = messageInput.value.substring(
    mentionStartPos.value + mentionQuery.value.length + 1
  )
  messageInput.value = `${before}@${suggestion.value} ${after}`
  showMentions.value = false

  nextTick(() => {
    const pos = before.length + suggestion.value.length + 2
    textareaRef.value?.setSelectionRange(pos, pos)
    textareaRef.value?.focus()
  })
}

// Handle typing indicators
function handleTyping() {
  if (!isCurrentlyTyping) {
    isCurrentlyTyping = true
    emit('typing', true)
  }

  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    isCurrentlyTyping = false
    emit('typing', false)
  }, 2000)
}

// Handle keydown
function handleKeydown(e: KeyboardEvent) {
  // Handle mention navigation
  if (showMentions.value && mentionSuggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % mentionSuggestions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedMentionIndex.value = selectedMentionIndex.value === 0
        ? mentionSuggestions.value.length - 1
        : selectedMentionIndex.value - 1
      return
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && showMentions.value)) {
      e.preventDefault()
      const selected = mentionSuggestions.value[selectedMentionIndex.value]
      if (selected) selectMention(selected)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      showMentions.value = false
      return
    }
  }

  // Send on Enter (without Shift)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    return
  }
}

// Send message
function sendMessage() {
  const content = messageInput.value.trim()
  if (!content || !props.currentRoom) return

  const mentionAI = content.includes('@ai') || content.startsWith('/ai ')
  messageInput.value = ''
  showMentions.value = false

  // Stop typing indicator
  if (typingTimer) clearTimeout(typingTimer)
  if (isCurrentlyTyping) {
    isCurrentlyTyping = false
    emit('typing', false)
  }

  // Reset textarea height
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })

  emit('send', content, mentionAI)
}

// Focus input when room changes
watch(
  () => props.currentRoom?.id,
  () => {
    nextTick(() => textareaRef.value?.focus())
  }
)

// Expose focus method
defineExpose({
  focus: () => textareaRef.value?.focus(),
})
</script>

<template>
  <div v-if="currentRoom" class="border-t border-default p-4 flex-shrink-0 relative">
    <!-- Mention suggestions popup -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      leave-active-class="transition-all duration-100 ease-in"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showMentions && mentionSuggestions.length > 0"
        class="absolute bottom-full left-4 right-4 mb-2 bg-[var(--app-surface)] border border-default rounded-lg shadow-xl overflow-hidden z-10"
      >
        <div class="py-1 max-h-48 overflow-y-auto">
          <button
            v-for="(suggestion, i) in mentionSuggestions"
            :key="suggestion.value"
            class="w-full px-3 py-2 text-left flex items-center gap-3 transition-colors"
            :class="i === selectedMentionIndex ? 'bg-white/10 text-app' : 'text-app-muted hover:bg-white/5'"
            @mousedown.prevent="selectMention(suggestion)"
            @mouseenter="selectedMentionIndex = i"
          >
            <div
              class="size-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
              :class="suggestion.icon ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-app'"
            >
              <Icon v-if="suggestion.icon" :name="suggestion.icon" class="size-3.5" />
              <span v-else>{{ suggestion.label[0] }}</span>
            </div>
            <span class="text-sm">{{ suggestion.label }}</span>
            <span v-if="suggestion.value === 'ai'" class="text-xs text-purple-400 ml-auto">@ai</span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Input area -->
    <div class="flex gap-3 items-end">
      <div class="flex-1 relative">
        <textarea
          ref="textareaRef"
          v-model="messageInput"
          :placeholder="currentRoom.ai_enabled
            ? `Message #${currentRoom.name} (type @ai to ask AI)`
            : `Message #${currentRoom.name}`"
          class="w-full bg-white/5 border border-default rounded-lg px-4 py-3 text-sm text-app placeholder:text-app-muted
            resize-none focus:outline-none focus:ring-2 focus:ring-app-accent/50 focus:border-app-accent/50
            transition-colors min-h-[44px] max-h-[150px]"
          rows="1"
          @input="handleInput"
          @keydown="handleKeydown"
        />
      </div>

      <Button
        icon="i-lucide-send"
        color="primary"
        size="lg"
        class="flex-shrink-0 mb-0.5"
        :disabled="!messageInput.trim()"
        @click="sendMessage"
      />
    </div>

    <!-- Footer hints -->
    <div class="flex items-center justify-between mt-2 text-[11px] text-app-muted">
      <div class="flex items-center gap-3">
        <span>
          <kbd class="px-1 py-0.5 bg-white/5 rounded text-[10px]">Enter</kbd> send
        </span>
        <span>
          <kbd class="px-1 py-0.5 bg-white/5 rounded text-[10px]">Shift+Enter</kbd> new line
        </span>
        <span>
          <kbd class="px-1 py-0.5 bg-white/5 rounded text-[10px]">@</kbd> mention
        </span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="connected" class="flex items-center gap-1 text-green-500/80">
          <span class="size-1.5 rounded-full bg-green-500" />
          Connected
        </span>
        <span v-else class="flex items-center gap-1 text-yellow-500/80">
          <span class="size-1.5 rounded-full bg-yellow-500" />
          Reconnecting...
        </span>
      </div>
    </div>
  </div>
</template>
