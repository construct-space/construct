/**
 * Barrel export for all built-in space configurations.
 *
 * Spaces are loaded at runtime from ~/.construct/spaces/ as pre-built
 * IIFE bundles. This file is kept for compatibility but exports empty arrays.
 */

import type { SpaceConfig } from '@/composables/useSpaces'

export const builtinSpaces: SpaceConfig[] = []

export const BUILTIN_SPACE_NAMES = builtinSpaces.map(s => s.name)
