/**
 * Barrel export for all built-in space configurations.
 *
 * Separates "what's built-in" from "what's loaded" so the marketplace
 * can merge installed spaces on top of these.
 */

import type { SpaceConfig } from '@/composables/useSpaces'

import codeSpace from '~/spaces/code/space.config'
import designSpace from '~/spaces/design/space.config'
import kanbanSpace from '~/spaces/kanban/space.config'
import docsSpace from '~/spaces/docs/space.config'
import architectSpace from '~/spaces/architect/space.config'
import notesSpace from '~/spaces/notes/space.config'
import gitSpace from '~/spaces/git/space.config'
import terminalSpace from '~/spaces/terminal/space.config'
import calendarSpace from '~/spaces/calendar/space.config'
import aiSpace from '~/spaces/ai/space.config'
import chatSpace from '~/spaces/chat/space.config'

export const builtinSpaces: SpaceConfig[] = [
  codeSpace,
  designSpace,
  kanbanSpace,
  docsSpace,
  architectSpace,
  notesSpace,
  gitSpace,
  terminalSpace,
  calendarSpace,
  aiSpace,
  chatSpace,
]

export const BUILTIN_SPACE_NAMES = builtinSpaces.map(s => s.name)
