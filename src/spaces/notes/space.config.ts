/**
 * Notes Space Configuration
 *
 * Sticky notes for quick reminders, shared secrets, and temporary info.
 * Like real-life sticky notes - quick to create, easy to share.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const notesSpace: SpaceConfig = {
  name: 'notes',
  displayName: 'Notes',
  description: 'Sticky notes for quick reminders and shared info',
  icon: 'i-lucide-sticky-note',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Board', icon: 'i-lucide-layout-grid', default: true,
      toolbar: [
        { id: 'notes-add',    icon: 'i-lucide-plus',     label: 'Add Note',  action: 'add-note' },
        { id: 'notes-colors', icon: 'i-lucide-palette',  label: 'Colors',    action: 'colors' },
        { id: 'notes-share',  icon: 'i-lucide-share',    label: 'Share',     action: 'share' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Notes',
    icon: 'i-lucide-sticky-note',
    to: 'notes',
    order: 40,
  },
}

export default notesSpace
