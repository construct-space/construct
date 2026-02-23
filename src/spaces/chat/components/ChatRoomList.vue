<script setup lang="ts">
/**
 * ChatRoomList - Sidebar list of chat rooms/conversations
 * Shows room names, icons, unread counts, and AI indicators
 */
import type { ChatRoom } from '../composables/useChat'

defineProps<{
  rooms: ChatRoom[]
  currentRoomId: number | null
  loading: boolean
  search?: string
}>()

const emit = defineEmits<{
  select: [room: ChatRoom]
  create: []
  'update:search': [value: string]
}>()

function getRoomIcon(room: ChatRoom): string {
  if (room.type === 'ai-assist') return 'i-lucide-sparkles'
  if (room.type === 'direct') return 'i-lucide-user'
  return 'i-lucide-hash'
}

function getRoomIconColor(room: ChatRoom): string {
  if (room.type === 'ai-assist') return 'text-purple-400'
  if (room.type === 'direct') return 'text-blue-400'
  return 'text-app-accent'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Search + Create -->
    <div class="p-2 flex-shrink-0">
      <div class="relative">
        <Icon name="i-lucide-search" class="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
        <input
          :value="search"
          type="text"
          placeholder="Filter rooms..."
          class="w-full pl-8 pr-8 py-1.5 text-xs bg-white/[0.03] rounded-lg text-app placeholder:text-white/20 focus:outline-none focus:bg-white/[0.06] transition-colors"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        >
        <button
          class="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 rounded flex items-center justify-center text-white/20 hover:text-app hover:bg-white/[0.06] transition-colors"
          title="New Room"
          @click="emit('create')"
        >
          <Icon name="i-lucide-plus" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && rooms.length === 0" class="flex items-center justify-center py-8">
      <Icon name="i-lucide-loader-2" class="size-5 animate-spin text-white/20" />
    </div>

    <!-- Empty State -->
    <div v-else-if="rooms.length === 0" class="flex flex-col items-center justify-center flex-1 px-4 text-center">
      <Icon name="i-lucide-message-square-plus" class="size-10 mb-3 text-white/15" />
      <p class="text-sm text-white/30 mb-3">{{ search ? 'No matching rooms' : 'No chat rooms yet' }}</p>
      <Button
        v-if="!search"
        label="Create Room"
        icon="i-lucide-plus"
        variant="soft"
        size="sm"
        @click="emit('create')"
      />
    </div>

    <!-- Room List -->
    <div v-else class="flex-1 overflow-y-auto py-0.5">
      <button
        v-for="room in rooms"
        :key="room.id"
        class="w-full px-2.5 py-2 text-left transition-colors flex items-center gap-2.5 group rounded-lg mx-1"
        style="width: calc(100% - 0.5rem)"
        :class="[
          currentRoomId === room.id
            ? 'bg-white/10'
            : 'hover:bg-white/[0.04]'
        ]"
        @click="emit('select', room)"
      >
        <!-- Room Icon -->
        <Icon
          :name="getRoomIcon(room)"
          class="size-4 flex-shrink-0"
          :class="[
            currentRoomId === room.id ? getRoomIconColor(room) : 'text-white/25',
          ]"
        />

        <!-- Room Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="truncate text-sm"
              :class="[
                currentRoomId === room.id ? 'font-semibold text-app' : 'text-app',
                room.unread_count > 0 ? 'font-semibold' : ''
              ]"
            >
              {{ room.name }}
            </span>
            <Icon v-if="room.ai_enabled" name="i-lucide-sparkles" class="size-3 text-purple-400 flex-shrink-0" />
          </div>
        </div>

        <!-- Unread badge -->
        <span
          v-if="room.unread_count > 0"
          class="px-1.5 py-0.5 text-[10px] leading-none rounded-full bg-app-accent text-white font-medium flex-shrink-0"
        >
          {{ room.unread_count > 99 ? '99+' : room.unread_count }}
        </span>
      </button>
    </div>
  </div>
</template>
