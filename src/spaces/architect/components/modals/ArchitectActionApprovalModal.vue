<script setup lang="ts">
/**
 * ArchitectActionApprovalModal - Approve/reject pending AI actions
 */
import type { PendingAction } from '../../composables/useArchitectActions'

defineProps<{
  open: boolean
  pendingActions: PendingAction[]
  executingActions: Set<string>
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'approve' | 'reject', actionId: string): void
  (e: 'approveAll'): void
}>()

const actionTypeIcons: Record<string, string> = {
  kanban: 'i-lucide-kanban',
  code: 'i-lucide-git-branch',
  design: 'i-lucide-palette',
  project: 'i-lucide-folder'
}

const actionTypeColors: Record<string, string> = {
  kanban: 'text-blue-500',
  code: 'text-green-500',
  design: 'text-purple-500',
  project: 'text-orange-500'
}

function formatActionData(data: Record<string, unknown>): string {
  if (data.tasks) {
    const tasks = data.tasks as { title: string }[]
    return `${tasks.length} tasks: ${tasks.slice(0, 3).map(t => t.title).join(', ')}${tasks.length > 3 ? '...' : ''}`
  }
  if (data.name) {
    return `Name: ${data.name}`
  }
  if (data.projectPath) {
    return `Path: ${data.projectPath}`
  }
  return JSON.stringify(data).slice(0, 50)
}
</script>

<template>
  <Modal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <Card class="w-[500px]">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon name="i-lucide-shield-check" class="size-5 text-blue-500" />
              <h3 class="font-medium text-app">Pending Actions</h3>
            </div>
            <Button
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              @click="emit('update:open', false)"
            />
          </div>
        </template>

        <div class="space-y-3">
          <p class="text-sm text-app-muted mb-4">
            The AI wants to perform the following actions. Review and approve or reject each one.
          </p>

          <div
            v-for="pending in pendingActions"
            :key="pending.id"
            class="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
          >
            <div class="flex items-start gap-3">
              <div
                class="shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                :class="actionTypeColors[pending.action.type]"
              >
                <Icon :name="actionTypeIcons[pending.action.type] || 'i-lucide-zap'" class="size-4" />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-app">{{ pending.action.description }}</p>
                <p class="text-xs text-app-muted mt-0.5">
                  {{ formatActionData(pending.action.data) }}
                </p>
              </div>

              <div class="flex gap-1">
                <Button
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="error"
                  :disabled="executingActions.has(pending.id)"
                  @click="emit('reject', pending.id)"
                />
                <Button
                  icon="i-lucide-check"
                  variant="ghost"
                  size="xs"
                  color="success"
                  :loading="executingActions.has(pending.id)"
                  @click="emit('approve', pending.id)"
                />
              </div>
            </div>
          </div>

          <div v-if="pendingActions.length === 0" class="text-center py-8 text-app-muted">
            <Icon name="i-lucide-check-circle" class="size-12 mx-auto mb-2 opacity-50" />
            <p>No pending actions</p>
          </div>
        </div>

        <template v-if="pendingActions.length > 1" #footer>
          <div class="flex justify-between">
            <Button
              label="Reject All"
              color="error"
              variant="ghost"
              @click="pendingActions.forEach(p => emit('reject', p.id))"
            />
            <Button
              label="Approve All"
              color="primary"
              @click="emit('approveAll')"
            />
          </div>
        </template>
      </Card>
    </template>
  </Modal>
</template>
