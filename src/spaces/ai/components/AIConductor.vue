<script setup lang="ts">
/**
 * AIConductor - Visual indicator for agent dispatch activity
 * Shows when the Conductor dispatches sub-agents and their progress
 */
import type { Agent } from '~/composables/useContextService'

interface AgentActivity {
  id: string
  agentId: string
  agentName: string
  agentIcon: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: string
  startedAt: number
  completedAt?: number
}

const props = defineProps<{
  visible?: boolean
}>()

// State
const activities = ref<AgentActivity[]>([])
const agents = ref<Agent[]>([])
const expanded = ref(true)

const contextService = useContextService()

// Load available agents
async function loadAgents() {
  try {
    const response = await contextService.listAgents()
    agents.value = response.agents
  } catch {
    // Use fallback agents
    agents.value = []
  }
}

// Get agent icon in i-lucide format
function getAgentIcon(agent: Agent | undefined): string {
  if (!agent?.icon) return 'i-lucide-bot'
  return `i-${agent.icon.replace(':', '-')}`
}

// Get agent by ID
function getAgent(agentId: string): Agent | undefined {
  return agents.value.find(a => a.id === agentId)
}

// Dispatch to agent and track activity
async function dispatch(agentId: string, task: string, context?: Record<string, unknown>) {
  const agent = getAgent(agentId)
  const activity: AgentActivity = {
    id: `${Date.now()}-${agentId}`,
    agentId,
    agentName: agent?.name || agentId,
    agentIcon: getAgentIcon(agent),
    task,
    status: 'running',
    startedAt: Date.now(),
  }

  activities.value.unshift(activity)

  try {
    const result = await contextService.dispatchToAgent(agentId, task, context)
    activity.status = 'completed'
    activity.result = typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
    activity.completedAt = Date.now()
  } catch (err) {
    activity.status = 'error'
    activity.result = err instanceof Error ? err.message : 'Agent dispatch failed'
    activity.completedAt = Date.now()
  }

  return activity
}

// Clear all activities
function clearActivities() {
  activities.value = []
}

// Format elapsed time
function formatElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now()
  const elapsed = end - startedAt
  if (elapsed < 1000) return `${elapsed}ms`
  if (elapsed < 60000) return `${(elapsed / 1000).toFixed(1)}s`
  return `${(elapsed / 60000).toFixed(1)}m`
}

// Status styling
function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return 'text-blue-400'
    case 'completed': return 'text-green-400'
    case 'error': return 'text-red-400'
    default: return 'text-app-muted'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return 'i-lucide-clock'
    case 'running': return 'i-lucide-loader-2'
    case 'completed': return 'i-lucide-check-circle'
    case 'error': return 'i-lucide-x-circle'
    default: return 'i-lucide-circle'
  }
}

// Count active
const activeCount = computed(() => activities.value.filter(a => a.status === 'running').length)
const hasActivities = computed(() => activities.value.length > 0)

onMounted(() => {
  loadAgents()
})

// Expose dispatch for parent
defineExpose({ dispatch, clearActivities, activities })
</script>

<template>
  <div
    v-if="props.visible !== false && hasActivities"
    class="border-t border-app bg-white/3"
  >
    <!-- Header -->
    <button
      class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/3 transition-colors"
      @click="expanded = !expanded"
    >
      <Icon
        name="i-lucide-workflow"
        class="size-4"
        :class="activeCount > 0 ? 'text-blue-400 animate-pulse' : 'text-app-muted'"
      />
      <span class="text-xs font-medium text-app flex-1">
        Agent Activity
        <span v-if="activeCount > 0" class="text-blue-400">({{ activeCount }} running)</span>
      </span>
      <Button
        v-if="activities.length > 0 && !activeCount"
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Clear"
        @click.stop="clearActivities"
      />
      <Icon
        :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-3 text-app-muted"
      />
    </button>

    <!-- Activity Log -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="expanded" class="overflow-hidden">
        <div class="max-h-48 overflow-y-auto">
          <div
            v-for="activity in activities"
            :key="activity.id"
            class="px-3 py-2 border-t border-app/50 first:border-t-0"
          >
            <div class="flex items-center gap-2">
              <!-- Agent Icon -->
              <div
                class="size-6 rounded flex items-center justify-center shrink-0"
                :class="activity.status === 'running' ? 'bg-blue-500/20' : activity.status === 'error' ? 'bg-red-500/20' : 'bg-green-500/20'"
              >
                <Icon :name="activity.agentIcon" class="size-3.5" :class="getStatusColor(activity.status)" />
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-medium text-app">{{ activity.agentName }}</span>
                  <Icon
                    :name="getStatusIcon(activity.status)"
                    class="size-3"
                    :class="[getStatusColor(activity.status), activity.status === 'running' ? 'animate-spin' : '']"
                  />
                </div>
                <p class="text-[10px] text-app-muted truncate">{{ activity.task }}</p>
              </div>

              <!-- Elapsed -->
              <span class="text-[10px] text-app-muted shrink-0">
                {{ formatElapsed(activity.startedAt, activity.completedAt) }}
              </span>
            </div>

            <!-- Result (collapsible) -->
            <div
              v-if="activity.result && activity.status !== 'running'"
              class="mt-1.5 ml-8 text-[11px] text-app-muted bg-white/3 rounded px-2 py-1.5 max-h-20 overflow-y-auto"
            >
              <pre class="whitespace-pre-wrap break-words font-mono">{{ activity.result }}</pre>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
