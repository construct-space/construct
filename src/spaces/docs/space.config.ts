import type { SpaceConfig } from '~/composables/useSpaces'

export const docsSpace: SpaceConfig = {
  name: 'docs',
  displayName: 'Docs',
  description: 'Project documentation with rich text editing',
  icon: 'i-lucide-book-open',
  scope: 'both',
  pages: [
    {
      path: '', label: 'Documents', icon: 'i-lucide-book-open', default: true,
      toolbar: [
        { id: 'docs-new',    icon: 'i-lucide-file-plus',  label: 'New Document',      action: 'new-doc' },
        { id: 'docs-toc',    icon: 'i-lucide-list',       label: 'Table of Contents', action: 'toc' },
        { id: 'docs-export', icon: 'i-lucide-download',   label: 'Export',            action: 'export' },
        { id: 'docs-share',  icon: 'i-lucide-share-2',    label: 'Share',             action: 'share' },
      ],
    },
  ],
  toolbar: [],
  navigation: {
    label: 'Docs',
    icon: 'i-lucide-book-open',
    to: 'docs',
    order: 25
  }
}

export default docsSpace
