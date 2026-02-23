/**
 * Tasks Space Configuration
 *
 * Project management space - kanban boards, lists, calendar views.
 * Tasks are assigned based on user access to other spaces.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const kanbanSpace: SpaceConfig = {
  name: 'kanban',
  displayName: 'Tasks',
  description: 'Project management with boards, lists, and calendar',
  icon: 'i-lucide-check-square',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Board', icon: 'i-lucide-kanban', default: true,
      toolbar: [
        { id: 'kanban-add-task',  icon: 'i-lucide-plus',      label: 'Add Task',  action: 'add-task' },
        { id: 'kanban-filter',    icon: 'i-lucide-filter',    label: 'Filter',    action: 'filter' },
        { id: 'kanban-calendar',  icon: 'i-lucide-calendar',  label: 'Calendar',  action: 'calendar' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Tasks',
    icon: 'i-lucide-check-square',
    to: 'kanban',
    order: 50,
  },
}

export default kanbanSpace
