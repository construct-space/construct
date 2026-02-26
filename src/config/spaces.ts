/**
 * Space definitions — shared across the app
 *
 * Jewel-tone palette for space identity colors.
 */
export interface SpaceConfig {
  icon: string
  label: string
  description: string
  color: string   // Tailwind text color class
  bg: string      // Tailwind bg color class (low opacity, for chips/badges)
}

export const spaces: Record<string, SpaceConfig> = {
  code: {
    icon: 'i-lucide-code',
    label: 'Code',
    description: 'Source code and development tools',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  design: {
    icon: 'i-lucide-pen-tool',
    label: 'UI Designer',
    description: 'Visual UI blueprints and prototypes',
    color: 'text-rose-400',
    bg: 'bg-rose-400/10',
  },
  kanban: {
    icon: 'i-lucide-kanban',
    label: 'Tasks',
    description: 'Tasks and workflows',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  docs: {
    icon: 'i-lucide-book-open',
    label: 'Docs',
    description: 'Documents and PRDs',
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
  },
  notes: {
    icon: 'i-lucide-file-text',
    label: 'Notes',
    description: 'Quick notes and scratch pads',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
  },
  architect: {
    icon: 'i-lucide-compass',
    label: 'Architect',
    description: 'Project planning and architecture',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
  },
  terminal: {
    icon: 'i-lucide-terminal',
    label: 'Terminal',
    description: 'Command line and shell access',
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
  },
  git: {
    icon: 'i-lucide-git-branch',
    label: 'Git',
    description: 'Version control and branches',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
  calendar: {
    icon: 'i-lucide-calendar',
    label: 'Calendar',
    description: 'Events and scheduling',
    color: 'text-indigo-400',
    bg: 'bg-indigo-400/10',
  },
  ai: {
    icon: 'i-lucide-sparkles',
    label: 'AI',
    description: 'AI-powered project assistant',
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
  },
  chat: {
    icon: 'i-lucide-messages-square',
    label: 'Chat',
    description: 'Team chat with AI',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
  },
}

export function getSpace(name: string): SpaceConfig {
  return spaces[name] ?? {
    icon: 'i-lucide-box',
    label: name,
    description: '',
    color: 'text-[var(--app-muted)]',
    bg: 'bg-[var(--app-muted)]/10',
  }
}
