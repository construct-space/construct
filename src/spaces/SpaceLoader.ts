/**
 * SpaceLoader — Runtime loader for pre-built space IIFE bundles.
 *
 * All spaces are loaded from ~/.construct/spaces/{name}/ via Tauri FS.
 * In dev mode, if VITE_SPACE_DEV_DIR is set, that directory is also
 * checked (for `construct space dev` linking).
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

/** Whether the space host globals have been initialized */
let spaceHostReady = false

/** Ensure space host is initialized (lazy — only when first space loads) */
async function ensureSpaceHost(): Promise<void> {
  if (spaceHostReady) return
  const { initSpaceHost } = await import('@/lib/spaceHost')
  initSpaceHost()
  spaceHostReady = true
}

/** Compute SHA-256 hex digest of a string */
async function sha256Hex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}

/** Base path for installed spaces */
function getSpacesDir(): string {
  return '/.construct/spaces'
}

/** Optional dev override directory from env */
const devOverrideDir = import.meta.env.VITE_SPACE_DEV_DIR || ''

/**
 * Load a space by ID. Returns cached version if already loaded.
 */
export async function loadSpace(spaceId: string): Promise<LoadedSpace | null> {
  // Return from cache
  if (loadedSpaces.has(spaceId)) {
    return loadedSpaces.get(spaceId)!
  }

  // If dev override dir is set, try that first
  if (devOverrideDir) {
    const devSpace = await loadSpaceFromDir(spaceId, devOverrideDir)
    if (devSpace) {
      loadedSpaces.set(spaceId, devSpace)
      return devSpace
    }
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
 * Load pre-built IIFE bundle from ~/.construct/spaces/{id}/
 */
async function loadSpaceFromDisk(spaceId: string): Promise<LoadedSpace | null> {
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const spaceDir = `${home}${getSpacesDir()}/${spaceId}`
    return await loadSpaceFromDir(spaceId, spaceDir)
  } catch (err) {
    console.error(`[SpaceLoader] Failed to load space "${spaceId}" from disk:`, err)
    return null
  }
}

/**
 * Load a space from an arbitrary directory path.
 */
async function loadSpaceFromDir(spaceId: string, baseDir: string): Promise<LoadedSpace | null> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')

    const spaceDir = baseDir.endsWith(`/${spaceId}`) ? baseDir : `${baseDir}/${spaceId}`
    console.log(`[SpaceLoader] Loading "${spaceId}" from: ${spaceDir}`)

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

    // Verify bundle integrity against manifest checksum
    if (manifest.build?.checksum) {
      const actual = await sha256Hex(jsContent)
      if (actual !== manifest.build.checksum) {
        console.error(`[SpaceLoader] Checksum mismatch for "${spaceId}": expected ${manifest.build.checksum}, got ${actual}`)
        return null
      }
    }

    // Ensure host globals are ready before executing space code
    await ensureSpaceHost()

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
    console.error(`[SpaceLoader] Failed to load space "${spaceId}" from dir:`, err)
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
 * Reload a space — clears cache, re-reads bundle from disk, re-executes.
 * Used by dev mode HMR when the bundle file changes.
 */
export async function reloadSpace(spaceId: string): Promise<LoadedSpace | null> {
  unloadSpace(spaceId)
  return loadSpace(spaceId)
}

/**
 * Watch a space's bundle for changes (dev mode only).
 * Polls the manifest's build.builtAt timestamp to detect rebuilds.
 * Only active when VITE_SPACE_DEV_DIR is set (i.e. `construct space dev` is running).
 * Returns an unwatch function.
 */
export async function watchSpace(
  spaceId: string,
  onReload: (space: LoadedSpace | null) => void
): Promise<(() => void) | null> {
  // Only poll when actively developing a space (construct space dev sets this)
  if (!devOverrideDir) return null

  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const manifestPath = `${home}${getSpacesDir()}/${spaceId}/manifest.json`

    // Read initial builtAt timestamp
    let lastBuiltAt = ''
    try {
      const json = JSON.parse(await readTextFile(manifestPath))
      lastBuiltAt = json.build?.builtAt || ''
    } catch { /* ignore */ }

    let stopped = false
    const poll = async () => {
      if (stopped) return
      try {
        const json = JSON.parse(await readTextFile(manifestPath))
        const builtAt = json.build?.builtAt || ''
        if (builtAt && builtAt !== lastBuiltAt) {
          lastBuiltAt = builtAt
          console.log(`[SpaceLoader] HMR: Reloading "${spaceId}"...`)
          const reloaded = await reloadSpace(spaceId)
          onReload(reloaded)
        }
      } catch { /* file may be mid-write */ }
      if (!stopped) setTimeout(poll, 3000)
    }

    // Start polling
    setTimeout(poll, 3000)
    console.log(`[SpaceLoader] Watching "${spaceId}" for changes (polling)`)
    return () => { stopped = true }
  } catch (err) {
    console.warn('[SpaceLoader] Could not set up file watcher:', err)
    return null
  }
}
