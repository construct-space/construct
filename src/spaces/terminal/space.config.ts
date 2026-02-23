/**
 * Terminal Space Configuration
 *
 * Terminal emulator that can be used at company or project level.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const terminalSpace: SpaceConfig = {
  name: 'terminal',
  displayName: 'Terminal',
  description: 'Terminal emulator',
  icon: 'i-lucide-terminal',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Terminal', icon: 'i-lucide-terminal', default: true,
      toolbar: [
        { id: 'terminal-new',   icon: 'i-lucide-plus',     label: 'New Terminal',  action: 'new-terminal' },
        { id: 'terminal-split', icon: 'i-lucide-split',    label: 'Split',         action: 'split' },
        { id: 'terminal-clear', icon: 'i-lucide-trash-2',  label: 'Clear',         action: 'clear' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Terminal',
    icon: 'i-lucide-terminal',
    to: 'terminal',
    order: 16,
  },
}

export default terminalSpace
