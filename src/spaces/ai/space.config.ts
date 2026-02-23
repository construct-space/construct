/**
 * AI Space Configuration
 *
 * AI-powered assistant for project development.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const aiSpace: SpaceConfig = {
  name: 'ai',
  displayName: 'AI',
  description: 'AI-powered project assistant',
  icon: 'i-lucide-sparkles',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Chat', icon: 'i-lucide-message-square', default: true,
      toolbar: [
        { id: 'ai-new-chat', icon: 'i-lucide-plus',     label: 'New Chat',  action: 'new-chat' },
        { id: 'ai-history',  icon: 'i-lucide-history',  label: 'History',   action: 'history' },
        { id: 'ai-models',   icon: 'i-lucide-cpu',      label: 'Models',    action: 'models' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'AI',
    icon: 'i-lucide-sparkles',
    to: '/app/ai',
    order: 15,
  },
}

export default aiSpace
