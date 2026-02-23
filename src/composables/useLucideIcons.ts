/**
 * Lucide Icon Utility
 *
 * Converts Lucide icon names to SVG data URLs for use on the canvas.
 * Uses @iconify-json/lucide if available, otherwise gracefully degrades.
 */

// Lazy-loaded icon data
let iconsData: Record<string, { body: string }> | null = null

async function loadIconData(): Promise<Record<string, { body: string }>> {
  if (iconsData) return iconsData
  try {
    // @ts-expect-error -- @iconify-json/lucide may not be installed; handled by catch
    const data = await import('@iconify-json/lucide/icons.json')
    iconsData = data.icons || data.default?.icons
    return iconsData!
  } catch {
    console.warn('[LucideIcons] Failed to load icon data')
    return {}
  }
}

/**
 * Get a Lucide icon as an SVG data URL
 */
export async function getLucideIconUrl(
  name: string,
  color: string = '#000000',
  size: number = 24,
): Promise<string | null> {
  const icons = await loadIconData()
  const icon = icons[name]
  if (!icon) return null

  // Replace currentColor with the specified color
  const body = icon.body.replace(/currentColor/g, color)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/**
 * Search Lucide icons by keyword
 */
export async function searchLucideIcons(query: string, limit: number = 10): Promise<string[]> {
  const icons = await loadIconData()
  const q = query.toLowerCase()
  const matches: string[] = []

  for (const name of Object.keys(icons)) {
    if (name.includes(q) || q.includes(name)) {
      matches.push(name)
      if (matches.length >= limit) break
    }
  }

  return matches
}

/**
 * Check if a Lucide icon exists
 */
export async function hasLucideIcon(name: string): Promise<boolean> {
  const icons = await loadIconData()
  return !!icons[name]
}
