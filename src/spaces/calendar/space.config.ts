/**
 * Calendar Space Configuration
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const calendarSpace: SpaceConfig = {
  name: 'calendar',
  displayName: 'Calendar',
  description: 'Events and scheduling',
  icon: 'i-lucide-calendar',
  scope: 'both',

  pages: [
    {
      path: '', label: 'Calendar', icon: 'i-lucide-calendar', default: true,
      toolbar: [
        { id: 'calendar-prev', icon: 'i-lucide-chevron-left', label: 'Previous', action: 'prev-month' },
        { id: 'calendar-today', icon: 'i-lucide-calendar-check', label: 'Today', action: 'today' },
        { id: 'calendar-next', icon: 'i-lucide-chevron-right', label: 'Next', action: 'next-month' },
        { id: 'calendar-add', icon: 'i-lucide-plus', label: 'Add Event', action: 'add-event' },
      ],
    },
  ],

  toolbar: [],

  navigation: {
    label: 'Calendar',
    icon: 'i-lucide-calendar',
    to: 'calendar',
    order: 12,
  },
}

export default calendarSpace
