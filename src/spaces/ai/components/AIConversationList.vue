<script setup lang="ts">
/**
 * AIConversationList - Sidebar showing conversation history
 * Uses useContextDB for persistence, supports search, rename, delete
 */
import type { AIConversation } from '~/composables/useContextDB'

const emit = defineEmits<{
  (e: 'select', conversation: AIConversation): void
  (e: 'new'): void
}>()

const props = defineProps<{
  activeId?: string | null
  contextKey?: string
}>()

const contextDB = useContextDB()
const toast = useToast()

// State
const conversations = ref<AIConversation[]>([])
const loading = ref(false)
const searchQuery = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const confirmDeleteId = ref<string | null>(null)

// Filtered conversations
const filteredConversations = computed(() => {
  if (!searchQuery.value.trim()) return conversations.value
  const q = searchQuery.value.toLowerCase()
  return conversations.value.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.model?.toLowerCase().includes(q)
  )
})

// Group conversations by date
const groupedConversations = computed(() => {
  const groups: { label: string; items: AIConversation[] }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const todayItems: AIConversation[] = []
  const yesterdayItems: AIConversation[] = []
  const weekItems: AIConversation[] = []
  const olderItems: AIConversation[] = []

  for (const conv of filteredConversations.value) {
    const date = new Date(conv.updated_at || conv.created_at)
    date.setHours(0, 0, 0, 0)

    if (date >= today) {
      todayItems.push(conv)
    } else if (date >= yesterday) {
      yesterdayItems.push(conv)
    } else if (date >= weekAgo) {
      weekItems.push(conv)
    } else {
      olderItems.push(conv)
    }
  }

  if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems })
  if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems })
  if (weekItems.length > 0) groups.push({ label: 'This Week', items: weekItems })
  if (olderItems.length > 0) groups.push({ label: 'Older', items: olderItems })

  return groups
})

// Load conversations
async function loadConversations() {
  loading.value = true
  try {
    conversations.value = await contextDB.conversationList(props.contextKey)
  } catch (err) {
    console.error('[AIConversationList] Failed to load:', err)
  } finally {
    loading.value = false
  }
}

// Start rename
function startRename(conv: AIConversation) {
  editingId.value = conv.id
  editingName.value = conv.name
}

// Save rename
async function saveRename(conv: AIConversation) {
  if (!editingName.value.trim()) {
    editingId.value = null
    return
  }
  try {
    await contextDB.conversationSave({
      id: conv.id,
      context_key: conv.context_key,
      name: editingName.value.trim(),
      model: conv.model,
      messages_json: conv.messages_json,
    })
    conv.name = editingName.value.trim()
    editingId.value = null
  } catch {
    toast.add({ title: 'Error', description: 'Failed to rename conversation', color: 'error' })
  }
}

// Delete conversation
async function deleteConversation(conv: AIConversation) {
  try {
    const success = await contextDB.conversationDelete(conv.id)
    if (success) {
      conversations.value = conversations.value.filter(c => c.id !== conv.id)
      confirmDeleteId.value = null
      toast.add({ title: 'Deleted', description: 'Conversation removed', color: 'success' })
    }
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete conversation', color: 'error' })
  }
}

// Get invited model count for roundtable conversations
function getInvitedModelCount(conv: AIConversation): number {
  if (!conv.invited_models) return 0
  try {
    const models = JSON.parse(conv.invited_models)
    return Array.isArray(models) ? models.length : 0
  } catch {
    return 0
  }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

onMounted(() => {
  loadConversations()
})

watch(() => props.contextKey, () => {
  loadConversations()
})

function setSearchQuery(query: string) {
  searchQuery.value = query
}

// Expose refresh method
defineExpose({ loadConversations, setSearchQuery })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-app-muted uppercase tracking-wider">Conversations</span>
        <Button
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          title="New conversation"
          @click="emit('new')"
        />
      </div>

      <!-- Search -->
      <Input
        v-model="searchQuery"
        placeholder="Search..."
        size="xs"
        :ui="{ base: 'bg-white/5' }"
      >
        <template #leading>
          <Icon name="i-lucide-search" class="size-3.5 text-app-muted" />
        </template>
      </Input>
    </div>

    <!-- Conversation List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-app-muted" />
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredConversations.length === 0" class="px-3 py-8 text-center">
        <Icon name="i-lucide-message-square" class="size-8 text-app-muted mx-auto mb-2 opacity-40" />
        <p class="text-sm text-app-muted">
          {{ searchQuery ? 'No matching conversations' : 'No conversations yet' }}
        </p>
        <Button
          v-if="!searchQuery"
          label="Start a conversation"
          variant="soft"
          size="xs"
          class="mt-3"
          @click="emit('new')"
        />
      </div>

      <!-- Grouped List -->
      <div v-else>
        <div
          v-for="group in groupedConversations"
          :key="group.label"
        >
          <div class="px-3 py-1.5 text-[10px] font-medium text-app-muted uppercase tracking-wider">
            {{ group.label }}
          </div>

          <button
            v-for="conv in group.items"
            :key="conv.id"
            class="w-full px-3 py-2 text-left transition-colors group relative"
            :class="props.activeId === conv.id ? 'bg-app-accent/10' : 'hover:bg-white/5'"
            @click="editingId !== conv.id && emit('select', conv)"
          >
            <!-- Normal display -->
            <template v-if="editingId !== conv.id">
              <div class="flex items-start gap-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="text-sm text-app truncate">{{ conv.name }}</p>
                    <Icon
                      v-if="conv.mode === 'roundrobin'"
                      name="i-lucide-users"
                      class="size-3.5 text-app-accent shrink-0"
                      title="Roundtable"
                    />
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span v-if="conv.mode === 'roundrobin' && conv.invited_models" class="text-[10px] text-app-accent">
                      {{ getInvitedModelCount(conv) }} models
                    </span>
                    <span v-else class="text-[10px] text-app-muted">{{ conv.model || 'default' }}</span>
                    <span class="text-[10px] text-app-muted">{{ formatRelativeTime(conv.updated_at || conv.created_at) }}</span>
                  </div>
                </div>

                <!-- Actions (visible on hover) -->
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    class="p-1 rounded hover:bg-white/10 text-app-muted hover:text-app"
                    title="Rename"
                    @click.stop="startRename(conv)"
                  >
                    <Icon name="i-lucide-pencil" class="size-3" />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-red-500/20 text-app-muted hover:text-red-400"
                    title="Delete"
                    @click.stop="confirmDeleteId = conv.id"
                  >
                    <Icon name="i-lucide-trash-2" class="size-3" />
                  </button>
                </div>
              </div>

              <!-- Delete confirmation -->
              <div
                v-if="confirmDeleteId === conv.id"
                class="mt-2 flex items-center gap-2 bg-red-500/10 rounded px-2 py-1.5"
                @click.stop
              >
                <span class="text-xs text-red-400 flex-1">Delete?</span>
                <Button
                  label="Yes"
                  size="xs"
                  color="error"
                  variant="soft"
                  @click.stop="deleteConversation(conv)"
                />
                <Button
                  label="No"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click.stop="confirmDeleteId = null"
                />
              </div>
            </template>

            <!-- Rename mode -->
            <template v-else>
              <div class="flex items-center gap-2" @click.stop>
                <input
                  v-model="editingName"
                  class="flex-1 text-sm bg-white/5 border border-app rounded px-2 py-1 text-app focus:outline-none focus:ring-1 focus:ring-app-accent"
                  autofocus
                  @keydown.enter="saveRename(conv)"
                  @keydown.escape="editingId = null"
                  @blur="saveRename(conv)"
                >
              </div>
            </template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
