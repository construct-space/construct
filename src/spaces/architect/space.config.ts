/**
 * Architect Space Configuration
 *
 * AI-powered project architecture space with chat interface.
 * Discuss project ideas, create plans, and generate project structure.
 *
 * Note: Architect is an app-level space (not project-level), so pages
 * are in pages/app/architect/ rather than spaces/architect/pages/
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const architectSpace: SpaceConfig = {
  name: 'architect',
  displayName: 'Architect',
  description: 'AI-powered project architecture and blueprints',
  icon: 'i-lucide-compass',
  scope: 'both',

  // Pages this space provides (app-level, not project-level)
  pages: [
    {
      path: '', label: 'Architect', icon: 'i-lucide-compass', default: true,
      toolbar: [
        { id: 'architect-new',       icon: 'i-lucide-plus',            label: 'New Project',  action: 'new-project' },
        { id: 'architect-templates', icon: 'i-lucide-layout-template', label: 'Blueprints',   action: 'templates' },
        { id: 'architect-export',    icon: 'i-lucide-download',        label: 'Export',       action: 'export' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Architect',
    icon: 'i-lucide-compass',
    to: '/app/architect',
    order: 10, // High priority - architect comes first
  },
}

export default architectSpace
