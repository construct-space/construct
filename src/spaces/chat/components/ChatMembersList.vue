<script setup lang="ts">
/**
 * ChatMembersList - Collapsible sidebar showing room members with online status
 * Supports add/remove actions and online/offline indicators
 */
import type { ChatMember, ChatRoom } from '../composables/useChat'

const props = defineProps<{
  members: ChatMember[]
  currentRoom: ChatRoom | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  addMember: []
  removeMember: [memberId: number]
}>()

// Separate online and offline members
const onlineMembers = computed(() =>
  props.members.filter(m => m.is_online)
)

const offlineMembers = computed(() =>
  props.members.filter(m => !m.is_online)
)

// Get member initials
function getInitials(member: ChatMember): string {
  const first = member.first_name?.[0] || ''
  const last = member.last_name?.[0] || ''
  return (first + last).toUpperCase() || '?'
}

// Get member avatar color
function getAvatarColor(member: ChatMember): string {
  const name = `${member.first_name || ''}${member.last_name || ''}`
  const colors = [
    'bg-blue-600',
    'bg-green-600',
    'bg-orange-600',
    'bg-pink-600',
    'bg-teal-600',
    'bg-indigo-600',
    'bg-red-600',
    'bg-cyan-600',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length] || colors[0]!
}

// Get role badge
function getRoleBadge(role: string): { label: string; color: string } | null {
  if (role === 'admin') return { label: 'Admin', color: 'text-amber-400 bg-amber-400/10' }
  return null
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <div
      v-if="visible && currentRoom"
      class="w-64 flex-shrink-0 border-l border-default flex flex-col h-full"
      style="background: var(--app-background)"
    >
      <!-- Header -->
      <div class="p-4 border-b border-default flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2">
          <Icon name="i-lucide-users" class="size-4 text-app-muted" />
          <span class="font-medium text-app text-sm">Members</span>
          <span class="text-xs text-app-muted">({{ members.length }})</span>
        </div>
        <Button
          icon="i-lucide-x"
          variant="ghost"
          size="xs"
          @click="emit('close')"
        />
      </div>

      <!-- Add member button -->
      <div class="p-3 border-b border-default flex-shrink-0">
        <Button
          icon="i-lucide-user-plus"
          label="Add Member"
          variant="soft"
          size="sm"
          block
          @click="emit('addMember')"
        />
      </div>

      <!-- Members list -->
      <div class="flex-1 overflow-y-auto">
        <!-- Online members -->
        <div v-if="onlineMembers.length > 0" class="p-3">
          <div class="text-xs text-app-muted uppercase tracking-wide font-medium mb-2 flex items-center gap-2">
            <span class="size-2 rounded-full bg-green-500" />
            Online -- {{ onlineMembers.length }}
          </div>
          <div class="space-y-1">
            <div
              v-for="member in onlineMembers"
              :key="member.id"
              class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <!-- Avatar with status -->
              <div class="relative flex-shrink-0">
                <div
                  class="size-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  :class="getAvatarColor(member)"
                >
                  <img
                    v-if="member.avatar"
                    :src="member.avatar"
                    class="size-full rounded-full object-cover"
                    :alt="`${member.first_name} ${member.last_name}`"
                  >
                  <span v-else>{{ getInitials(member) }}</span>
                </div>
                <span class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 border-2 border-[var(--app-background)]" />
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm text-app truncate">
                    {{ member.first_name }} {{ member.last_name }}
                  </span>
                  <span
                    v-if="getRoleBadge(member.role)"
                    class="text-[10px] px-1 py-0.5 rounded leading-none"
                    :class="getRoleBadge(member.role)?.color"
                  >
                    {{ getRoleBadge(member.role)?.label }}
                  </span>
                </div>
              </div>

              <!-- Remove button (hidden by default) -->
              <Button
                icon="i-lucide-x"
                variant="ghost"
                size="xs"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="emit('removeMember', member.id)"
              />
            </div>
          </div>
        </div>

        <!-- Offline members -->
        <div v-if="offlineMembers.length > 0" class="p-3">
          <div class="text-xs text-app-muted uppercase tracking-wide font-medium mb-2 flex items-center gap-2">
            <span class="size-2 rounded-full bg-gray-500" />
            Offline -- {{ offlineMembers.length }}
          </div>
          <div class="space-y-1">
            <div
              v-for="member in offlineMembers"
              :key="member.id"
              class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group opacity-60"
            >
              <!-- Avatar with status -->
              <div class="relative flex-shrink-0">
                <div
                  class="size-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  :class="getAvatarColor(member)"
                >
                  <img
                    v-if="member.avatar"
                    :src="member.avatar"
                    class="size-full rounded-full object-cover"
                    :alt="`${member.first_name} ${member.last_name}`"
                  >
                  <span v-else>{{ getInitials(member) }}</span>
                </div>
                <span class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-gray-500 border-2 border-[var(--app-background)]" />
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm text-app truncate">
                    {{ member.first_name }} {{ member.last_name }}
                  </span>
                  <span
                    v-if="getRoleBadge(member.role)"
                    class="text-[10px] px-1 py-0.5 rounded leading-none"
                    :class="getRoleBadge(member.role)?.color"
                  >
                    {{ getRoleBadge(member.role)?.label }}
                  </span>
                </div>
              </div>

              <!-- Remove button -->
              <Button
                icon="i-lucide-x"
                variant="ghost"
                size="xs"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="emit('removeMember', member.id)"
              />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="members.length === 0" class="flex flex-col items-center justify-center py-8 px-4 text-center">
          <Icon name="i-lucide-users" class="size-10 text-app-muted mb-3 opacity-50" />
          <p class="text-sm text-app-muted">No members yet</p>
          <p class="text-xs text-app-muted mt-1">Add members to this room</p>
        </div>
      </div>
    </div>
  </Transition>
</template>
