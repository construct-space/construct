/**
 * Git Space Configuration
 *
 * Git repository management with branches, commits, and PRs.
 */

import type { SpaceConfig } from '~/composables/useSpaces'

export const gitSpace: SpaceConfig = {
  name: 'git',
  displayName: 'Git',
  description: 'Git repository management',
  icon: 'i-lucide-git-branch',
  scope: 'both',

  // Pages this space provides
  pages: [
    {
      path: '', label: 'Overview', icon: 'i-lucide-git-branch', default: true,
      toolbar: [
        { id: 'git-commit',   icon: 'i-lucide-git-commit',  label: 'Commit',    action: 'commit' },
        { id: 'git-push',     icon: 'i-lucide-upload',      label: 'Push',      action: 'push' },
        { id: 'git-pull',     icon: 'i-lucide-download',    label: 'Pull',      action: 'pull' },
        { id: 'git-branches', icon: 'i-lucide-git-branch',  label: 'Branches',  action: 'branches' },
      ],
    },
  ],

  toolbar: [],

  // Navigation menu item
  navigation: {
    label: 'Git',
    icon: 'i-lucide-git-branch',
    to: 'git',
    order: 15,
  },
}

export default gitSpace
