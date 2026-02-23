/**
 * Design Space Configuration
 *
 * PixiJS 8-powered visual design canvas.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const designSpace: SpaceConfig = {
  name: 'design',
  displayName: 'Design',
  description: 'Visual design with PixiJS — Figma-like design tool',
  icon: 'i-lucide-pen-tool',
  scope: 'both',

  pages: [
    {
      path: '', label: 'Blueprints', icon: 'i-lucide-layout-dashboard', default: true,
      toolbar: [
        { id: 'design-new',    icon: 'i-lucide-plus',         label: 'New Design',        action: 'new-design' },
        { id: 'design-import', icon: 'i-lucide-upload',       label: 'Import',            action: 'import' },
      ],
    },
    {
      path: 'editor', label: 'Editor', icon: 'i-lucide-pen-tool', requiresContext: true,
      toolbar: [
        { id: 'design-undo',   icon: 'i-lucide-undo-2',       label: 'Undo',              action: 'undo' },
        { id: 'design-redo',   icon: 'i-lucide-redo-2',       label: 'Redo',              action: 'redo' },
        { id: 'design-layers', icon: 'i-lucide-layers',       label: 'Layers',            action: 'layers' },
        { id: 'design-assets', icon: 'i-lucide-image',        label: 'Assets',            action: 'assets' },
        { id: 'design-export', icon: 'i-lucide-download',     label: 'Export',            action: 'export' },
      ],
    },
  ],

  // Space-level toolbar — empty, each page defines its own
  toolbar: [],

  navigation: {
    label: 'Design',
    icon: 'i-lucide-pen-tool',
    to: 'design',
    order: 21,
  },
}

export default designSpace
