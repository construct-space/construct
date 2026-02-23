/**
 * Chat Space Configuration
 *
 * Slack-like team chat with AI integration.
 * Accessible via CTRL+CTRL shortcut or navigation.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const chatSpace: SpaceConfig = {
  name: 'chat',
  displayName: 'Chat',
  description: 'Team chat with AI',
  icon: 'i-lucide-messages-square',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Chat', icon: 'i-lucide-messages-square', default: true,
      toolbar: [
        { id: 'chat-new-room', icon: 'i-lucide-plus',     label: 'New Room',   action: 'new-room' },
        { id: 'chat-members',  icon: 'i-lucide-users',    label: 'Members',    action: 'members' },
        { id: 'chat-ai',       icon: 'i-lucide-sparkles', label: 'AI Settings', action: 'ai-settings' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Chat',
    icon: 'i-lucide-messages-square',
    to: 'chat',
    order: 15, // Before terminal
  },
}

export default chatSpace
