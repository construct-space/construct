<script setup lang="ts">
/**
 * TaskFilters - Filter bar for the Kanban board
 * Supports filtering by priority, assignee, and due date range
 */
import { TASK_PRIORITIES } from '~/stores/tasks'
import type { Task } from '~/stores/tasks'

interface Props {
  tasks: Task[]
}

const props = defineProps<Props>()

const filterPriority = defineModel<string>('filterPriority', { default: '' })
const filterAssignee = defineModel<number | null>('filterAssignee', { default: null })
const filterDueDateFrom = defineModel<string>('filterDueDateFrom', { default: '' })
const filterDueDateTo = defineModel<string>('filterDueDateTo', { default: '' })

// Visibility toggle
const showFilters = ref(false)

// Priority options
const priorityOptions = [
  { label: 'All Priorities', value: '' },
  ...TASK_PRIORITIES.map(p => ({
    label: p.charAt(0).toUpperCase() + p.slice(1),
    value: p
  }))
]

// Derive unique assignees from tasks
const assigneeOptions = computed(() => {
  const assignees = new Map<number, { id: number; name: string }>()
  for (const task of props.tasks) {
    if (task.assignee && task.assignee_id) {
      assignees.set(task.assignee_id, {
        id: task.assignee_id,
        name: `${task.assignee.first_name} ${task.assignee.last_name}`.trim()
      })
    }
  }
  return [
    { label: 'All Assignees', value: null as number | null },
    ...Array.from(assignees.values()).map(a => ({
      label: a.name,
      value: a.id as number | null
    }))
  ]
})

// Active filter count
const activeFilterCount = computed(() => {
  let count = 0
  if (filterPriority.value) count++
  if (filterAssignee.value) count++
  if (filterDueDateFrom.value) count++
  if (filterDueDateTo.value) count++
  return count
})

// Clear all filters
const clearFilters = () => {
  filterPriority.value = ''
  filterAssignee.value = null
  filterDueDateFrom.value = ''
  filterDueDateTo.value = ''
}

// Toggle filter visibility
const toggleFilters = () => {
  showFilters.value = !showFilters.value
}

// Expose toggle for parent to use
defineExpose({ toggleFilters, showFilters })
</script>

<template>
  <div>
    <!-- Filter Toggle Button (optional inline usage) -->
    <Transition name="expand">
      <div
        v-if="showFilters"
        class="px-4 py-3 border-b border-app bg-white/[0.02]"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Icon name="i-lucide-filter" class="size-4 text-app-muted" />
            <span class="text-sm font-medium text-app">Filters</span>
            <span
              v-if="activeFilterCount > 0"
              class="text-[10px] font-bold bg-app-accent/20 text-app-accent px-1.5 py-0.5 rounded-full"
            >
              {{ activeFilterCount }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="activeFilterCount > 0"
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              label="Clear"
              @click="clearFilters"
            />
            <Button
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-chevron-up"
              @click="showFilters = false"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <!-- Priority Filter -->
          <div class="min-w-[160px]">
            <label class="text-[10px] text-app-muted uppercase tracking-wider font-medium mb-1 block">Priority</label>
            <SelectMenu
              v-model="filterPriority"
              :items="priorityOptions"
              value-key="value"
              size="sm"
              class="w-full"
            />
          </div>

          <!-- Assignee Filter -->
          <div class="min-w-[180px]">
            <label class="text-[10px] text-app-muted uppercase tracking-wider font-medium mb-1 block">Assignee</label>
            <SelectMenu
              v-model="filterAssignee"
              :items="assigneeOptions"
              value-key="value"
              size="sm"
              class="w-full"
            />
          </div>

          <!-- Due Date From -->
          <div class="min-w-[150px]">
            <label class="text-[10px] text-app-muted uppercase tracking-wider font-medium mb-1 block">Due From</label>
            <Input
              v-model="filterDueDateFrom"
              type="date"
              size="sm"
            />
          </div>

          <!-- Due Date To -->
          <div class="min-w-[150px]">
            <label class="text-[10px] text-app-muted uppercase tracking-wider font-medium mb-1 block">Due To</label>
            <Input
              v-model="filterDueDateTo"
              type="date"
              size="sm"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}
.expand-enter-to,
.expand-leave-from {
  max-height: 200px;
}
</style>
