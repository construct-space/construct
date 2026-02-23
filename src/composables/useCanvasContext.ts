/**
 * Canvas Context Composable
 *
 * Shares current canvas state (nodes/layers) with AssistantFloat
 * so the AI can reference existing elements.
 */

import type { DesignNode, DesignPage } from '~/types/design'

// Global state for current canvas context
const currentNodes = ref<DesignNode[]>([])
const currentDesignName = ref<string>('')
const currentPageId = ref<string>('')

// Cache of all designs for cross-space reference
// Supports both flat names ("LoginScreen") and paths ("Hydrate/Product Page")
// Now includes pages for multi-screen designs
interface CachedDesign {
  name: string
  path?: string
  nodes: DesignNode[]  // Current/default page nodes
  pages?: DesignPage[] // All pages/screens in this design
  currentPageId?: string
}
const designsCache = ref<Map<string, CachedDesign>>(new Map())

/**
 * Set the current canvas nodes (called by UI editor)
 */
export function setCanvasContext(nodes: DesignNode[], designName?: string, pageId?: string) {
  currentNodes.value = nodes
  if (designName) {
    currentDesignName.value = designName
  }
  if (pageId) {
    currentPageId.value = pageId
  }
}

/**
 * Clear canvas context (called when leaving UI editor)
 */
export function clearCanvasContext() {
  currentNodes.value = []
  currentDesignName.value = ''
  currentPageId.value = ''
}

/**
 * Get canvas context for AI prompt
 */
export function getCanvasContextForPrompt(): string {
  if (currentNodes.value.length === 0) {
    return ''
  }

  const nodeDescriptions = currentNodes.value.map(node => {
    let desc = `- ${node.name} (${node.type}, id: ${node.id})`
    if (node.type === 'text' && node.text) {
      desc += ` text: "${node.text}"`
    }
    if (node.fill) {
      desc += ` fill: ${node.fill}`
    }
    if (node.parentId) {
      const parent = currentNodes.value.find(n => n.id === node.parentId)
      if (parent) {
        desc += ` inside: ${parent.name}`
      }
    }
    return desc
  })

  // Calculate canvas bounding box for placement hints
  let maxRight = 0
  let maxBottom = 0
  for (const node of currentNodes.value) {
    if (!node.parentId) {
      const right = (node.x || 0) + (node.width || 0)
      const bottom = (node.y || 0) + (node.height || 0)
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
  }

  return `\n\n## Current Canvas Elements
Design: ${currentDesignName.value || 'Untitled'}
Canvas bounds: rightmost edge at x=${maxRight}, bottommost edge at y=${maxBottom}
**When creating new screens/elements, place them at x=${maxRight + 80} to avoid overlapping existing content.**

${nodeDescriptions.join('\n')}

You can reference these elements by their ID when using update_design_element or delete_design_element tools.`
}

/**
 * Register a design for cross-space reference
 * Supports paths like "Hydrate/Product Page" for hierarchical organization
 * Now accepts pages for multi-screen designs
 */
export function registerDesign(
  name: string,
  nodes: DesignNode[],
  parentPath?: string,
  pages?: DesignPage[],
  currentPageId?: string
) {
  const fullPath = parentPath ? `${parentPath}/${name}` : name
  const key = fullPath.toLowerCase()
  designsCache.value.set(key, { name, path: fullPath, nodes, pages, currentPageId })

  // Also register by just the name for simple lookups
  if (parentPath) {
    const simpleKey = name.toLowerCase()
    if (!designsCache.value.has(simpleKey)) {
      designsCache.value.set(simpleKey, { name, path: fullPath, nodes, pages, currentPageId })
    }
  }
}

/**
 * Get a design by name or path for code generation
 * Supports: "LoginScreen", "Hydrate/Product Page", or partial matches
 */
export function getDesignByName(nameOrPath: string): CachedDesign | null {
  const key = nameOrPath.toLowerCase()

  // Direct match
  const direct = designsCache.value.get(key)
  if (direct) return direct

  // Try partial match - find designs where name or path contains the search term
  for (const [, design] of designsCache.value) {
    if (design.name.toLowerCase() === key) return design
    if (design.path?.toLowerCase() === key) return design
    // Partial match on path
    if (design.path?.toLowerCase().includes(key)) return design
  }

  return null
}

/**
 * List all available designs with their full paths
 */
export function listAvailableDesigns(): string[] {
  const seen = new Set<string>()
  const designs: string[] = []

  for (const [, design] of designsCache.value) {
    const displayName = design.path || design.name
    if (!seen.has(displayName.toLowerCase())) {
      seen.add(displayName.toLowerCase())
      designs.push(displayName)
    }
  }

  return designs
}

/**
 * Convert nodes to a structured format for AI/code generation
 */
function nodesToDetails(nodes: DesignNode[]): Record<string, unknown>[] {
  return nodes.map(node => {
    const details: Record<string, unknown> = {
      id: node.id,
      type: node.type,
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    }
    if (node.fill) details.fill = node.fill
    if (node.stroke) details.stroke = node.stroke
    if (node.cornerRadius) details.cornerRadius = node.cornerRadius
    if (node.text) details.text = node.text
    if (node.fontSize) details.fontSize = node.fontSize
    if (node.fontWeight) details.fontWeight = node.fontWeight
    if (node.parentId) details.parentId = node.parentId
    if (node.imageUrl) details.imageUrl = node.imageUrl
    return details
  })
}

/**
 * Get design context for code generation prompt
 * Now includes all pages/screens in the design
 */
export function getDesignForCodeGeneration(designNameOrPath: string): string {
  const design = getDesignByName(designNameOrPath)
  if (!design) {
    const available = listAvailableDesigns()
    return `Design "${designNameOrPath}" not found. Available designs: ${available.length > 0 ? available.join(', ') : 'none (open a design in UI space first)'}`
  }

  const displayName = design.path || design.name

  // If design has multiple pages/screens, include all of them
  if (design.pages && design.pages.length > 0) {
    const pagesData = design.pages.map(page => ({
      id: page.id,
      name: page.name,
      width: page.width,
      height: page.height,
      nodes: nodesToDetails(page.nodes)
    }))

    return `## Design: ${displayName}

This design has ${design.pages.length} screen(s)/page(s):
${design.pages.map(p => `- ${p.name}`).join('\n')}

\`\`\`json
${JSON.stringify(pagesData, null, 2)}
\`\`\`

Use this design data to generate code. Each screen/page has its own nodes with position, size, and styling information.`
  }

  // Single page/legacy format
  const nodeDetails = nodesToDetails(design.nodes)

  return `## Design: ${displayName}

\`\`\`json
${JSON.stringify(nodeDetails, null, 2)}
\`\`\`

Use this design data to generate code. Each element has position, size, and styling information.`
}

/**
 * Composable for canvas context
 */
export function useCanvasContext() {
  return {
    currentNodes: readonly(currentNodes),
    currentDesignName: readonly(currentDesignName),
    currentPageId: readonly(currentPageId),
    designsCache: readonly(designsCache),
    setCanvasContext,
    clearCanvasContext,
    getCanvasContextForPrompt,
    registerDesign,
    getDesignByName,
    listAvailableDesigns,
    getDesignForCodeGeneration,
  }
}

// Export the CachedDesign type for external use
export type { CachedDesign }
