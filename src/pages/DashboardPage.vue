<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { Calendar, CheckSquare, Zap, Users, Key, FolderPlus } from 'lucide-vue-next'

const authStore = useAuthStore()
const api = useApi()

const userName = computed(() => authStore.user?.first_name || 'User')

interface Company { id: number; name: string; invite_code?: string }
interface TeamMember { id: number; first_name: string; last_name: string; email: string; company_id?: number }

const company = ref<Company | null>(null)
const teamMembers = ref<TeamMember[]>([])
const teamMembersCount = computed(() => teamMembers.value.length)
const companyName = computed(() => company.value?.name || 'Company')
const inviteCode = computed(() => company.value?.invite_code || '------')

const today = new Date()
const dayNumber = today.getDate().toString().padStart(2, '0')
const monthYear = today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

const loadCompany = async () => {
  if (!authStore.user?.company_id) return
  try {
    company.value = await api.get<Company>(`/companies/${authStore.user.company_id}`)
  } catch { /* ignore */ }
}

const loadTeamMembers = async () => {
  if (!authStore.user?.company_id) return
  try {
    const response = await api.get<{ data: TeamMember[] }>('/users?limit=100')
    if (response.data) {
      teamMembers.value = response.data.filter(u => u.company_id === authStore.user?.company_id)
    }
  } catch { /* ignore */ }
}

const getInitials = (f: string, l: string) => `${f.charAt(0)}${l.charAt(0)}`.toUpperCase()
const getFullName = (f: string, l: string) => `${f} ${l}`.trim()

onMounted(() => {
  loadCompany()
  loadTeamMembers()
})
</script>

<template>
  <div class="h-screen overflow-hidden flex items-center justify-center px-6">
    <div class="w-full max-w-5xl">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-16">
        <!-- LEFT - Company -->
        <div class="space-y-8">
          <div class="text-right">
            <p class="text-2xl">
              <span class="text-app-muted">BASECODE:</span><span class="font-bold text-app">{{ companyName.toUpperCase() }}</span>
            </p>
          </div>
          <div class="text-right space-y-3">
            <div class="flex items-center justify-end gap-3">
              <span class="text-sm text-app-muted uppercase tracking-wider">Team</span>
              <span class="text-3xl font-bold text-app">{{ teamMembersCount }}</span>
              <Users class="size-5 text-app-muted" />
            </div>
            <div class="flex items-center justify-end gap-3">
              <span class="text-sm text-app-muted uppercase tracking-wider">Invite</span>
              <span class="text-xl font-bold font-mono text-app tracking-wider">{{ inviteCode }}</span>
              <Key class="size-5 text-app-muted" />
            </div>
          </div>
          <div class="text-right space-y-3">
            <span class="font-bold text-app">TEAM</span>
            <span class="text-app-muted ml-1">MEMBERS</span>
            <div class="space-y-2 mt-2">
              <div v-for="member in teamMembers.slice(0, 4)" :key="member.id" class="flex items-center justify-end gap-3">
                <p class="font-medium text-app text-sm">{{ getFullName(member.first_name, member.last_name) }}</p>
                <div class="w-8 h-8 rounded-md bg-white/50 dark:bg-white/10 flex items-center justify-center text-xs font-medium text-app-muted">
                  {{ getInitials(member.first_name, member.last_name) }}
                </div>
              </div>
              <p v-if="teamMembers.length === 0" class="text-sm text-app-muted">No team members yet</p>
            </div>
          </div>
        </div>

        <!-- RIGHT - Personal -->
        <div class="space-y-8">
          <div>
            <p class="text-sm text-app-muted tracking-wider">WELCOME BACK,</p>
            <h1 class="text-5xl font-bold text-app mt-1">{{ userName }}</h1>
          </div>
          <div class="flex items-start gap-4">
            <div>
              <p class="text-6xl font-bold text-app">{{ dayNumber }}</p>
              <p class="text-sm text-app-muted uppercase tracking-wider">{{ monthYear }}</p>
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <Calendar class="size-4 text-app-muted" />
                <span class="text-sm text-app-muted uppercase tracking-wider">My Calendar</span>
              </div>
              <p class="text-sm text-app-muted">No events today</p>
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <CheckSquare class="size-4 text-app-muted" />
              <span class="text-sm text-app-muted uppercase tracking-wider">My Todos</span>
            </div>
            <p class="text-sm text-app-muted">No tasks assigned to you</p>
          </div>
          <div class="pt-4 border-t border-app-muted/20">
            <div class="flex items-center gap-2 mb-3">
              <Zap class="size-4 text-app-muted" />
              <span class="text-sm text-app-muted uppercase tracking-wider">Quick Actions</span>
            </div>
            <div class="flex flex-wrap gap-3">
              <RouterLink to="/app/code" class="flex items-center gap-2 px-3 py-2 rounded-md bg-white/50 dark:bg-white/10 text-app hover:bg-app-accent hover:text-app-accent-foreground transition-colors text-sm">
                <FolderPlus class="size-4" />
                <span class="font-medium">NEW PROJECT</span>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
