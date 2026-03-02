/**
 * SpaceLoader — Runtime loader for pre-built space IIFE bundles.
 *
 * Production path: reads from ~/.construct/spaces/{name}/
 * Dev path: falls back to Vite dynamic imports from src/spaces/{name}/
 *
 * Flow:
 *   1. Read manifest.json from space directory via Tauri FS
 *   2. Read the .iife.js bundle
 *   3. Execute via new Function() — IIFE assigns to window.__CONSTRUCT_SPACE_{id}
 *   4. Extract page components from the global
 *   5. Inject CSS via <style data-space="{id}">
 *   6. Cache in memory Map
 */

import type { Component } from 'vue'

export interface LoadedSpace {
  id: string
  manifest: SpaceManifest
  pages: Record<string, Component>
  components?: Record<string, Component>
  cssInjected: boolean
}

export interface SpaceManifest {
  id: string
  name: string
  version: string
  description: string
  icon: string
  scope: string
  navigation: {
    label: string
    icon: string
    to: string
    order: number
  }
  pages: Array<{
    path: string
    label: string
    icon?: string
    default?: boolean
    requiresContext?: boolean
    toolbar?: Array<{
      id: string
      icon: string
      label: string
      action?: string
      to?: string
    }>
  }>
  toolbar?: Array<{
    id: string
    icon: string
    label: string
    action?: string
    to?: string
  }>
  theme?: {
    color: string
    bg: string
  }
  recommended?: boolean
  agent?: string
  skills?: string[]
  build?: {
    checksum: string
    size: number
    hostApiVersion: string
    builtAt: string
  }
}

/** In-memory cache of loaded space bundles */
const loadedSpaces = new Map<string, LoadedSpace>()

/** Check if we're in dev mode (Vite dev server) */
const isDev = import.meta.env.DEV

/** Base path for installed spaces */
function getSpacesDir(): string {
  // Tauri FS resolves ~ to the user home directory
  return '/.construct/spaces'
}

/**
 * Load a space by ID. Returns cached version if already loaded.
 */
export async function loadSpace(spaceId: string): Promise<LoadedSpace | null> {
  // Return from cache
  if (loadedSpaces.has(spaceId)) {
    return loadedSpaces.get(spaceId)!
  }

  // In dev mode, try Vite dynamic imports first, fall back to disk
  if (isDev) {
    const devSpace = await loadSpaceDev(spaceId)
    if (devSpace) {
      loadedSpaces.set(spaceId, devSpace)
      return devSpace
    }
    console.log(`[SpaceLoader] No dev source for "${spaceId}", trying disk...`)
  }

  // Load from ~/.construct/spaces/
  const prodSpace = await loadSpaceFromDisk(spaceId)
  if (prodSpace) {
    loadedSpaces.set(spaceId, prodSpace)
    return prodSpace
  }

  return null
}

/**
 * Dev mode: load space via Vite's dynamic import from src/spaces/.
 * These are compiled as part of the main Vite build in dev.
 */
async function loadSpaceDev(spaceId: string): Promise<LoadedSpace | null> {
  try {
    // Dynamic import of space pages from src/spaces/{id}/pages/
    // Vite resolves these at compile time in dev mode
    const pageModules = import.meta.glob<{ default: Component }>(
      '../spaces/*/pages/*.vue'
    )

    const pages: Record<string, Component> = {}
    const prefix = `../spaces/${spaceId}/pages/`

    for (const [path, loader] of Object.entries(pageModules)) {
      if (path.startsWith(prefix)) {
        const fileName = path.slice(prefix.length).replace('.vue', '')
        const pagePath = fileName === 'index' ? '' : fileName
        const mod = await loader()
        pages[pagePath] = mod.default
      }
    }

    if (Object.keys(pages).length === 0) {
      return null
    }

    // Try to load manifest from space.manifest.json in the space dir
    let manifest: SpaceManifest
    try {
      const manifestModule = await import(`../spaces/${spaceId}/space.manifest.json`)
      manifest = manifestModule.default
    } catch {
      // Fall back to reading space.config.ts
      try {
        const configModule = await import(`../spaces/${spaceId}/space.config.ts`)
        const config = configModule.default || configModule[`${spaceId}Space`]
        manifest = configToManifest(spaceId, config)
      } catch {
        // Minimal fallback manifest
        manifest = {
          id: spaceId,
          name: spaceId.charAt(0).toUpperCase() + spaceId.slice(1),
          version: '0.0.0-dev',
          description: '',
          icon: 'i-lucide-box',
          scope: 'both',
          navigation: { label: spaceId, icon: 'i-lucide-box', to: spaceId, order: 100 },
          pages: [{ path: '', label: 'Home', default: true }],
        }
      }
    }

    return {
      id: spaceId,
      manifest,
      pages,
      cssInjected: true, // Vite handles CSS in dev
    }
  } catch {
    return null
  }
}

/**
 * Production: load pre-built IIFE bundle from ~/.construct/spaces/{id}/
 */
async function loadSpaceFromDisk(spaceId: string): Promise<LoadedSpace | null> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const { homeDir } = await import('@tauri-apps/api/path')

    const home = await homeDir()
    const spaceDir = `${home}${getSpacesDir()}/${spaceId}`
    console.log(`[SpaceLoader] Loading "${spaceId}" from disk: ${spaceDir}`)

    // Read manifest
    const manifestPath = `${spaceDir}/manifest.json`
    if (!(await exists(manifestPath))) {
      return null
    }
    const manifestJson = await readTextFile(manifestPath)
    const manifest: SpaceManifest = JSON.parse(manifestJson)

    // Read JS bundle
    const bundlePath = `${spaceDir}/space-${spaceId}.iife.js`
    if (!(await exists(bundlePath))) {
      return null
    }
    const jsContent = await readTextFile(bundlePath)

    // Execute IIFE — sets window.__CONSTRUCT_SPACE_{id}
    // Indirect eval runs in global scope so `var` creates a window property
    ;(0, eval)(jsContent)

    // Extract the space export
    const globalKey = `__CONSTRUCT_SPACE_${spaceId}` as `__CONSTRUCT_SPACE_${string}`
    const spaceExport = window[globalKey]
    if (!spaceExport?.pages) {
      console.warn(`[SpaceLoader] Space "${spaceId}" bundle did not export pages`)
      return null
    }

    // Inject CSS if present
    let cssInjected = false
    const cssPath = `${spaceDir}/space-${spaceId}.css`
    if (await exists(cssPath)) {
      const cssContent = await readTextFile(cssPath)
      injectCSS(spaceId, cssContent)
      cssInjected = true
    }

    // Verify brain files if referenced in manifest
    if (manifest.agent) {
      const agentPath = `${spaceDir}/${manifest.agent}`
      if (!(await exists(agentPath))) {
        console.warn(`[SpaceLoader] Space "${spaceId}" references agent "${manifest.agent}" but file not found`)
      }
    }
    if (manifest.skills?.length) {
      for (const skill of manifest.skills) {
        const skillPath = `${spaceDir}/${skill}`
        if (!(await exists(skillPath))) {
          console.warn(`[SpaceLoader] Space "${spaceId}" references skill "${skill}" but file not found`)
        }
      }
    }

    return {
      id: spaceId,
      manifest,
      pages: spaceExport.pages as Record<string, Component>,
      components: spaceExport.components as Record<string, Component> | undefined,
      cssInjected,
    }
  } catch (err) {
    console.error(`[SpaceLoader] Failed to load space "${spaceId}" from disk:`, err)
    return null
  }
}

/**
 * Inject CSS into the document for a space.
 */
function injectCSS(spaceId: string, css: string): void {
  // Remove existing style if re-loading
  const existing = document.querySelector(`style[data-space="${spaceId}"]`)
  if (existing) {
    existing.remove()
  }

  const style = document.createElement('style')
  style.setAttribute('data-space', spaceId)
  style.textContent = css
  document.head.appendChild(style)
}

/**
 * Unload a space — remove CSS, clean up globals, clear cache.
 */
export function unloadSpace(spaceId: string): void {
  // Remove CSS
  const style = document.querySelector(`style[data-space="${spaceId}"]`)
  if (style) {
    style.remove()
  }

  // Clean up global
  const globalKey = `__CONSTRUCT_SPACE_${spaceId}` as `__CONSTRUCT_SPACE_${string}`
  delete window[globalKey]

  // Clear cache
  loadedSpaces.delete(spaceId)
}

/**
 * Get all currently loaded spaces.
 */
export function getLoadedSpaces(): Map<string, LoadedSpace> {
  return loadedSpaces
}

/**
 * Check if a space is loaded.
 */
export function isSpaceLoaded(spaceId: string): boolean {
  return loadedSpaces.has(spaceId)
}

/**
 * Convert a space.config.ts config to a SpaceManifest (dev mode compat).
 */
function configToManifest(id: string, config: Record<string, unknown>): SpaceManifest {
  return {
    id,
    name: (config.displayName as string) || id,
    version: '0.0.0-dev',
    description: (config.description as string) || '',
    icon: (config.icon as string) || 'i-lucide-box',
    scope: (config.scope as string) || 'both',
    navigation: config.navigation as SpaceManifest['navigation'],
    pages: (config.pages as SpaceManifest['pages']) || [{ path: '', label: 'Home', default: true }],
    toolbar: config.toolbar as SpaceManifest['toolbar'],
  }
}
