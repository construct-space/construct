/**
 * useUIExport - Export composable for UI Designer
 * Handles export to SVG, PNG, CSS, HTML, Vue, React, and Tailwind
 */
import type { DesignNode, Fill } from '~/types/design'

export type ExportFormat = 'svg' | 'png' | 'json' | 'css' | 'html' | 'vue' | 'react' | 'tailwind'
export type PNGScale = 1 | 2 | 3

export interface ExportOptions {
  format: ExportFormat
  scale?: PNGScale
  includeBackground?: boolean
  selectedOnly?: boolean
}

/**
 * Escape special XML characters in text content and attributes
 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Sanitize ID for use in SVG (remove invalid characters)
 */
function sanitizeId(id: string): string {
  // Replace any non-alphanumeric characters with underscores
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Convert fill to CSS value
 */
function fillToCSS(fill: Fill | undefined): string {
  if (!fill) return 'transparent'
  if (typeof fill === 'string') return fill

  const stops = fill.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')

  if (fill.type === 'linear') {
    return `linear-gradient(${fill.angle}deg, ${stops})`
  } else {
    return `radial-gradient(circle, ${stops})`
  }
}

/**
 * Convert fill to Tailwind classes (simplified)
 */
function fillToTailwind(fill: Fill | undefined): string {
  if (!fill) return 'bg-transparent'
  if (typeof fill === 'string') {
    // Try to map common colors to Tailwind
    const colorMap: Record<string, string> = {
      '#ffffff': 'bg-white',
      '#000000': 'bg-black',
      '#e5e7eb': 'bg-gray-200',
      '#d1d5db': 'bg-gray-300',
      '#9ca3af': 'bg-gray-400',
      '#6b7280': 'bg-gray-500',
      '#374151': 'bg-gray-700',
      '#1f2937': 'bg-gray-800',
      '#ef4444': 'bg-red-500',
      '#3b82f6': 'bg-blue-500',
      '#22c55e': 'bg-green-500',
      '#eab308': 'bg-yellow-500',
    }
    return colorMap[fill.toLowerCase()] || `bg-[${fill}]`
  }
  // Gradients use arbitrary values
  return `bg-gradient-to-r from-[${fill.stops[0]?.color}] to-[${fill.stops[fill.stops.length - 1]?.color}]`
}

/**
 * Generate CSS for a node
 */
function nodeToCSS(node: DesignNode, className: string): string {
  const styles: string[] = []

  styles.push(`  position: absolute;`)
  styles.push(`  left: ${node.x}px;`)
  styles.push(`  top: ${node.y}px;`)
  styles.push(`  width: ${node.width}px;`)
  styles.push(`  height: ${node.height}px;`)

  if (node.fill) {
    const fill = fillToCSS(node.fill)
    if (fill.includes('gradient')) {
      styles.push(`  background: ${fill};`)
    } else {
      styles.push(`  background-color: ${fill};`)
    }
  }

  if (node.stroke && node.strokeWidth) {
    styles.push(`  border: ${node.strokeWidth}px solid ${node.stroke};`)
  }

  if (node.cornerRadius) {
    const radius = typeof node.cornerRadius === 'number'
      ? `${node.cornerRadius}px`
      : `${node.cornerRadius[0]}px ${node.cornerRadius[1]}px ${node.cornerRadius[2]}px ${node.cornerRadius[3]}px`
    styles.push(`  border-radius: ${radius};`)
  }

  if (node.opacity !== undefined && node.opacity !== 1) {
    styles.push(`  opacity: ${node.opacity};`)
  }

  if (node.rotation) {
    styles.push(`  transform: rotate(${node.rotation}deg);`)
  }

  // Text-specific
  if (node.type === 'text') {
    if (node.fontSize) styles.push(`  font-size: ${node.fontSize}px;`)
    if (node.fontFamily) styles.push(`  font-family: '${node.fontFamily}', sans-serif;`)
    if (node.fontWeight && node.fontWeight !== 'normal') styles.push(`  font-weight: ${node.fontWeight};`)
    if (node.textAlign) styles.push(`  text-align: ${node.textAlign};`)
    if (node.lineHeight) styles.push(`  line-height: ${node.lineHeight};`)
    if (node.letterSpacing) styles.push(`  letter-spacing: ${node.letterSpacing}px;`)
  }

  // Shape-specific
  if (node.type === 'ellipse') {
    styles.push(`  border-radius: 50%;`)
  }

  return `.${className} {\n${styles.join('\n')}\n}`
}

/**
 * Generate Tailwind classes for a node
 */
function nodeToTailwind(node: DesignNode): string {
  const classes: string[] = ['absolute']

  classes.push(`left-[${node.x}px]`)
  classes.push(`top-[${node.y}px]`)
  classes.push(`w-[${node.width}px]`)
  classes.push(`h-[${node.height}px]`)

  if (node.fill) {
    classes.push(fillToTailwind(node.fill))
  }

  if (node.stroke && node.strokeWidth) {
    classes.push(`border-[${node.strokeWidth}px]`)
    classes.push(`border-[${node.stroke}]`)
  }

  if (node.cornerRadius) {
    if (typeof node.cornerRadius === 'number') {
      if (node.cornerRadius >= 9999) {
        classes.push('rounded-full')
      } else {
        classes.push(`rounded-[${node.cornerRadius}px]`)
      }
    } else {
      classes.push(`rounded-[${node.cornerRadius[0]}px_${node.cornerRadius[1]}px_${node.cornerRadius[2]}px_${node.cornerRadius[3]}px]`)
    }
  }

  if (node.opacity !== undefined && node.opacity !== 1) {
    classes.push(`opacity-[${node.opacity}]`)
  }

  if (node.rotation) {
    classes.push(`rotate-[${node.rotation}deg]`)
  }

  if (node.type === 'ellipse') {
    classes.push('rounded-full')
  }

  // Text-specific
  if (node.type === 'text') {
    if (node.fontSize) classes.push(`text-[${node.fontSize}px]`)
    if (node.fontWeight === 'bold') classes.push('font-bold')
    if (node.fontWeight === '500') classes.push('font-medium')
    if (node.fontWeight === '600') classes.push('font-semibold')
    if (node.textAlign === 'center') classes.push('text-center')
    if (node.textAlign === 'right') classes.push('text-right')
  }

  return classes.join(' ')
}

/**
 * Generate HTML element for a node
 */
function nodeToHTML(node: DesignNode, useClasses = true): string {
  const className = `node-${node.id.replace(/[^a-zA-Z0-9]/g, '-')}`
  const tag = node.type === 'text' ? 'p' : 'div'
  const content = node.type === 'text' ? (node.text || '') : ''

  if (useClasses) {
    return `<${tag} class="${className}">${content}</${tag}>`
  } else {
    const styles = [
      `position: absolute`,
      `left: ${node.x}px`,
      `top: ${node.y}px`,
      `width: ${node.width}px`,
      `height: ${node.height}px`,
    ]

    if (node.fill) {
      styles.push(`background: ${fillToCSS(node.fill)}`)
    }
    if (node.stroke && node.strokeWidth) {
      styles.push(`border: ${node.strokeWidth}px solid ${node.stroke}`)
    }
    if (node.cornerRadius) {
      const radius = typeof node.cornerRadius === 'number' ? node.cornerRadius : node.cornerRadius[0]
      styles.push(`border-radius: ${radius}px`)
    }
    if (node.type === 'ellipse') {
      styles.push(`border-radius: 50%`)
    }

    return `<${tag} style="${styles.join('; ')}">${content}</${tag}>`
  }
}

/**
 * Generate SVG gradient definitions
 */
function generateGradientDef(fill: Fill, id: string): string {
  if (typeof fill === 'string') return ''

  if (fill.type === 'linear') {
    const hasCustomEndpoints =
      Number.isFinite(fill.startX) &&
      Number.isFinite(fill.startY) &&
      Number.isFinite(fill.endX) &&
      Number.isFinite(fill.endY)

    let x1: number
    let y1: number
    let x2: number
    let y2: number

    if (hasCustomEndpoints) {
      x1 = (fill.startX as number) * 100
      y1 = (fill.startY as number) * 100
      x2 = (fill.endX as number) * 100
      y2 = (fill.endY as number) * 100
    } else {
      // Convert angle to x1,y1,x2,y2 coordinates
      const angle = (fill.angle || 0) * Math.PI / 180
      x1 = 50 - Math.cos(angle) * 50
      y1 = 50 + Math.sin(angle) * 50
      x2 = 50 + Math.cos(angle) * 50
      y2 = 50 - Math.sin(angle) * 50
    }

    const stops = fill.stops.map(s =>
      `<stop offset="${s.offset * 100}%" stop-color="${s.color}" />`
    ).join('\n      ')

    return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
      ${stops}
    </linearGradient>`
  } else if (fill.type === 'radial') {
    const cx = (fill.centerX ?? 0.5) * 100
    const cy = (fill.centerY ?? 0.5) * 100
    const r = (fill.radius ?? 0.5) * 100

    const stops = fill.stops.map(s =>
      `<stop offset="${s.offset * 100}%" stop-color="${s.color}" />`
    ).join('\n      ')

    return `<radialGradient id="${id}" cx="${cx}%" cy="${cy}%" r="${r}%">
      ${stops}
    </radialGradient>`
  }

  return ''
}

/**
 * Generate SVG element for a node
 */
function nodeToSVG(node: DesignNode, gradientId?: string): string {
  let fill: string
  if (typeof node.fill === 'string') {
    fill = escapeXML(node.fill)
  } else if (node.fill && gradientId) {
    fill = `url(#${gradientId})`
  } else {
    fill = 'none'
  }

  const stroke = escapeXML(node.stroke || 'none')
  const strokeWidth = node.strokeWidth || 0
  const opacity = node.opacity ?? 1

  // Build transform attribute if needed
  const transforms: string[] = []
  if (node.rotation) {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    transforms.push(`rotate(${node.rotation} ${cx} ${cy})`)
  }
  if (node.flipX || node.flipY) {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const scaleX = node.flipX ? -1 : 1
    const scaleY = node.flipY ? -1 : 1
    transforms.push(`translate(${cx} ${cy}) scale(${scaleX} ${scaleY}) translate(${-cx} ${-cy})`)
  }
  const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : ''

  // Stroke dash array
  const strokeDashAttr = node.strokeDashArray?.length
    ? ` stroke-dasharray="${node.strokeDashArray.join(' ')}"`
    : ''
  const strokeLinecap = node.strokeLineCap ? ` stroke-linecap="${node.strokeLineCap}"` : ''
  const strokeLinejoin = node.strokeLineJoin ? ` stroke-linejoin="${node.strokeLineJoin}"` : ''

  let element = ''

  switch (node.type) {
    case 'rectangle':
    case 'screen': {
      const rx = typeof node.cornerRadius === 'number' ? node.cornerRadius : (node.cornerRadius?.[0] || 0)
      element = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDashAttr}${strokeLinecap}${strokeLinejoin} opacity="${opacity}"${transformAttr} />`
      break
    }

    case 'ellipse': {
      const cx = node.x + node.width / 2
      const cy = node.y + node.height / 2
      element = `<ellipse cx="${cx}" cy="${cy}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDashAttr} opacity="${opacity}"${transformAttr} />`
      break
    }

    case 'text': {
      const fontSize = node.fontSize || 16
      const fontFamily = escapeXML(node.fontFamily || 'sans-serif')
      const fontWeight = node.fontWeight || 'normal'
      const lineHeight = node.lineHeight || 1.2
      const textAnchor = node.textAlign === 'center' ? 'middle' : node.textAlign === 'right' ? 'end' : 'start'
      const textX = node.textAlign === 'center' ? node.x + node.width / 2 : node.textAlign === 'right' ? node.x + node.width : node.x

      // Split text into lines (handle explicit newlines and estimate word wrap)
      const text = node.text || ''
      const lines = text.split('\n')

      // Estimate characters per line based on width and font size (rough approximation)
      const avgCharWidth = fontSize * 0.5 // rough estimate
      const charsPerLine = Math.floor(node.width / avgCharWidth)

      // Word wrap each line
      const wrappedLines: string[] = []
      for (const line of lines) {
        if (line.length <= charsPerLine) {
          wrappedLines.push(line)
        } else {
          // Word wrap
          const words = line.split(' ')
          let currentLine = ''
          for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= charsPerLine) {
              currentLine = (currentLine + ' ' + word).trim()
            } else {
              if (currentLine) wrappedLines.push(currentLine)
              currentLine = word
            }
          }
          if (currentLine) wrappedLines.push(currentLine)
        }
      }

      // Generate tspan elements for each line
      const lineHeightPx = fontSize * lineHeight
      const tspans = wrappedLines.map((line, i) => {
        const escapedLine = escapeXML(line)
        const dy = i === 0 ? fontSize : lineHeightPx
        return `<tspan x="${textX}" dy="${dy}">${escapedLine}</tspan>`
      }).join('')

      element = `<text x="${textX}" y="${node.y}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="${fontWeight}" text-anchor="${textAnchor}" fill="${fill}" opacity="${opacity}"${transformAttr}>${tspans}</text>`
      break
    }

    case 'line':
      element = `<line x1="${node.x}" y1="${node.y}" x2="${node.x + node.width}" y2="${node.y + node.height}" stroke="${stroke || fill}" stroke-width="${strokeWidth || 2}"${strokeDashAttr}${strokeLinecap} opacity="${opacity}"${transformAttr} />`
      break

    case 'polygon': {
      const sides = node.sides || 6
      const polyRadius = Math.min(node.width, node.height) / 2
      const polyCx = node.x + node.width / 2
      const polyCy = node.y + node.height / 2
      const polyPoints = Array.from({ length: sides }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides
        return `${polyCx + polyRadius * Math.cos(angle)},${polyCy + polyRadius * Math.sin(angle)}`
      }).join(' ')
      element = `<polygon points="${polyPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDashAttr}${strokeLinejoin} opacity="${opacity}"${transformAttr} />`
      break
    }

    case 'star': {
      const numPoints = node.points || 5
      const outerRadius = Math.min(node.width, node.height) / 2
      const innerRadiusRatio = (node.innerRadius ?? 50) / 100
      const innerRadius = outerRadius * innerRadiusRatio
      const starCx = node.x + node.width / 2
      const starCy = node.y + node.height / 2
      const starPoints = Array.from({ length: numPoints * 2 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / numPoints
        const r = i % 2 === 0 ? outerRadius : innerRadius
        return `${starCx + r * Math.cos(angle)},${starCy + r * Math.sin(angle)}`
      }).join(' ')
      element = `<polygon points="${starPoints}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeDashAttr}${strokeLinejoin} opacity="${opacity}"${transformAttr} />`
      break
    }

    case 'path':
      if (node.pathData) {
        // Translate path to node position (escape path data for safety)
        element = `<g transform="translate(${node.x} ${node.y})"${transformAttr}>
    <path d="${escapeXML(node.pathData)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 2}"${strokeDashAttr}${strokeLinecap}${strokeLinejoin} opacity="${opacity}" />
  </g>`
      }
      break

    case 'image':
      if (node.imageUrl) {
        // For data URLs, don't escape (base64 doesn't contain XML special chars)
        // For regular URLs, escape & for query params
        const isDataUrl = node.imageUrl.startsWith('data:')
        const escapedUrl = isDataUrl ? node.imageUrl : escapeXML(node.imageUrl)
        const hasCrop = node.cropTop || node.cropRight || node.cropBottom || node.cropLeft

        if (hasCrop) {
          // Calculate crop values (as decimals)
          const cropTop = (node.cropTop || 0) / 100
          const cropRight = (node.cropRight || 0) / 100
          const cropBottom = (node.cropBottom || 0) / 100
          const cropLeft = (node.cropLeft || 0) / 100

          // The visible frame dimensions (node.width/height) represent what's visible after cropping
          // We need to calculate the actual image size before cropping
          const visibleWidthRatio = 1 - cropLeft - cropRight
          const visibleHeightRatio = 1 - cropTop - cropBottom

          // Avoid division by zero
          if (visibleWidthRatio > 0 && visibleHeightRatio > 0) {
            const actualImageWidth = node.width / visibleWidthRatio
            const actualImageHeight = node.height / visibleHeightRatio

            // Calculate image position (offset by crop amount)
            const imgX = node.x - (cropLeft * actualImageWidth)
            const imgY = node.y - (cropTop * actualImageHeight)

            // Create unique clip path ID
            const clipId = `clip-${sanitizeId(node.id)}`

            const cropRx = node.cornerRadius ? (typeof node.cornerRadius === 'number' ? node.cornerRadius : node.cornerRadius[0]) : 0
            element = `<defs>
      <clipPath id="${clipId}">
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${cropRx ? ` rx="${cropRx}"` : ''} />
      </clipPath>
    </defs>
    <image x="${imgX}" y="${imgY}" width="${actualImageWidth}" height="${actualImageHeight}" href="${escapedUrl}" xlink:href="${escapedUrl}" preserveAspectRatio="none" opacity="${opacity}" clip-path="url(#${clipId})"${transformAttr} />`
          } else {
            // Fallback: no visible area
            element = `<!-- Image fully cropped: ${sanitizeId(node.id)} -->`
          }
        } else if (node.cornerRadius) {
          // No cropping but has corner radius - clip with rounded rect
          const clipId = `clip-${sanitizeId(node.id)}`
          const rx = typeof node.cornerRadius === 'number' ? node.cornerRadius : node.cornerRadius[0]
          element = `<defs>
      <clipPath id="${clipId}">
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${rx}" />
      </clipPath>
    </defs>
    <image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${escapedUrl}" xlink:href="${escapedUrl}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}" clip-path="url(#${clipId})"${transformAttr} />`
        } else {
          // No cropping, no corner radius - render normally
          element = `<image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${escapedUrl}" xlink:href="${escapedUrl}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"${transformAttr} />`
        }
      }
      break

    default:
      element = `<!-- Unsupported type: ${node.type} -->`
  }

  return element
}

export function useUIExport() {
  /**
   * Calculate bounds of all nodes (converting relative coords to absolute)
   */
  function calculateBounds(nodes: DesignNode[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 }
    }

    const visibleNodes = nodes.filter(n => n.visible !== false)
    if (visibleNodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 }
    }

    // Build node map for parent lookups
    const nodeMap = new Map<string, DesignNode>()
    for (const node of nodes) {
      nodeMap.set(node.id, node)
    }

    // Convert relative coordinates to absolute
    function getAbsolutePosition(node: DesignNode): { x: number; y: number } {
      if (!node.parentId) return { x: node.x, y: node.y }

      const parent = nodeMap.get(node.parentId)
      if (!parent) return { x: node.x, y: node.y }

      const parentPos = getAbsolutePosition(parent)
      const parentRotation = parent.rotation ?? 0

      if (parentRotation !== 0) {
        const radians = (parentRotation * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        return {
          x: parentPos.x + (node.x * cos - node.y * sin),
          y: parentPos.y + (node.x * sin + node.y * cos)
        }
      }

      return {
        x: parentPos.x + node.x,
        y: parentPos.y + node.y
      }
    }

    // Calculate bounds using absolute positions
    const positions = visibleNodes.map(n => {
      const pos = getAbsolutePosition(n)
      return { ...pos, width: n.width, height: n.height }
    })

    const minX = Math.min(...positions.map(p => p.x))
    const minY = Math.min(...positions.map(p => p.y))
    const maxX = Math.max(...positions.map(p => p.x + p.width))
    const maxY = Math.max(...positions.map(p => p.y + p.height))

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * Export nodes to SVG string
   * @param fitToBounds - If true, adjust viewBox to fit content bounds (for preview)
   */
  function exportToSVG(nodes: DesignNode[], width = 800, height = 600, fitToBounds = false): string {
    // Generate gradient definitions for nodes with gradient fills
    const gradientDefs: string[] = []
    const gradientMap = new Map<string, string>()

    nodes.forEach((node, index) => {
      if (node.fill && typeof node.fill !== 'string') {
        const gradId = `gradient-${sanitizeId(node.id) || index}`
        gradientMap.set(node.id, gradId)
        gradientDefs.push(generateGradientDef(node.fill, gradId))
      }
    })

    // Calculate actual bounds of all elements
    const bounds = calculateBounds(nodes)

    // Determine viewBox based on content bounds
    let viewX: number
    let viewY: number
    let viewWidth: number
    let viewHeight: number

    if (nodes.length > 0) {
      if (fitToBounds) {
        // For preview: add padding around content
        const padding = 20
        viewX = bounds.minX - padding
        viewY = bounds.minY - padding
        viewWidth = bounds.width + padding * 2
        viewHeight = bounds.height + padding * 2
      } else {
        // For export: use exact content bounds (no padding)
        viewX = bounds.minX
        viewY = bounds.minY
        viewWidth = bounds.width
        viewHeight = bounds.height
      }
    } else {
      // Fallback for empty export
      viewX = 0
      viewY = 0
      viewWidth = width
      viewHeight = height
    }

    // Build a map of parent -> children for hierarchical rendering
    const childrenMap = new Map<string | null, DesignNode[]>()
    const visibleNodes = nodes.filter(n => n.visible !== false)
    const nodeMap = new Map<string, DesignNode>()

    for (const node of visibleNodes) {
      nodeMap.set(node.id, node)
      const parentId = node.parentId || null
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, [])
      }
      childrenMap.get(parentId)!.push(node)
    }

    // Convert relative coordinates to absolute (children store coords relative to parent)
    function getAbsoluteNode(node: DesignNode): DesignNode {
      if (!node.parentId) return node

      const parent = nodeMap.get(node.parentId)
      if (!parent) return node

      // Get parent's absolute position first (recursive)
      const absoluteParent = getAbsoluteNode(parent)

      // Calculate absolute position
      let absoluteX: number
      let absoluteY: number

      const parentRotation = absoluteParent.rotation ?? 0
      if (parentRotation !== 0) {
        const radians = (parentRotation * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        absoluteX = absoluteParent.x + (node.x * cos - node.y * sin)
        absoluteY = absoluteParent.y + (node.x * sin + node.y * cos)
      } else {
        absoluteX = absoluteParent.x + node.x
        absoluteY = absoluteParent.y + node.y
      }

      return { ...node, x: absoluteX, y: absoluteY }
    }

    // Recursive function to render nodes with hierarchy
    function renderNode(node: DesignNode, indent = '  '): string {
      const children = childrenMap.get(node.id) || []
      // Convert to absolute coordinates for rendering
      const absNode = getAbsoluteNode(node)

      if (node.type === 'screen' && children.length > 0) {
        // Screen with children: create a group with clipping
        const clipId = `screen-clip-${sanitizeId(node.id)}`
        const rx = typeof absNode.cornerRadius === 'number' ? absNode.cornerRadius : (absNode.cornerRadius?.[0] || 0)
        const screenFill = typeof absNode.fill === 'string' ? escapeXML(absNode.fill) : (gradientMap.has(node.id) ? `url(#${gradientMap.get(node.id)})` : 'none')
        const screenStroke = escapeXML(absNode.stroke || 'none')
        const screenStrokeWidth = absNode.strokeWidth || 0
        const opacity = absNode.opacity ?? 1

        // Render children (they will calculate their own absolute positions)
        const childElements = children.map(child => renderNode(child, indent + '    ')).join('\n')

        return `${indent}<defs>
${indent}  <clipPath id="${clipId}">
${indent}    <rect x="${absNode.x}" y="${absNode.y}" width="${absNode.width}" height="${absNode.height}" rx="${rx}" />
${indent}  </clipPath>
${indent}</defs>
${indent}<g clip-path="url(#${clipId})">
${indent}  <!-- Screen: ${escapeXML((absNode.name || node.id).replace(/--/g, '—'))} -->
${indent}  <rect x="${absNode.x}" y="${absNode.y}" width="${absNode.width}" height="${absNode.height}" rx="${rx}" fill="${screenFill}" stroke="${screenStroke}" stroke-width="${screenStrokeWidth}" opacity="${opacity}" />
${childElements}
${indent}</g>`
      } else if (children.length > 0) {
        // Non-screen parent with children (groups)
        const nodeElement = nodeToSVG(absNode, gradientMap.get(node.id))
        const childElements = children.map(child => renderNode(child, indent + '  ')).join('\n')
        return `${indent}${nodeElement}\n${childElements}`
      } else {
        // Leaf node
        return `${indent}${nodeToSVG(absNode, gradientMap.get(node.id))}`
      }
    }

    // Get root nodes (nodes without parent or parent not in export set)
    const exportedIds = new Set(visibleNodes.map(n => n.id))
    const rootNodes = visibleNodes.filter(n => !n.parentId || !exportedIds.has(n.parentId))

    // Generate elements hierarchically
    const elements = rootNodes.map(node => renderNode(node)).join('\n')

    const defsSection = gradientDefs.length > 0
      ? `<defs>\n    ${gradientDefs.join('\n    ')}\n  </defs>\n  `
      : ''

    // For preview (fitToBounds), use 100% to fill container
    // For export (!fitToBounds), use explicit pixel dimensions
    const svgWidth = fitToBounds ? '100%' : `${viewWidth}`
    const svgHeight = fitToBounds ? '100%' : `${viewHeight}`

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgWidth}" height="${svgHeight}" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
  ${defsSection}${elements}
</svg>`
  }

  /**
   * Export nodes to PNG (returns data URL)
   */
  async function exportToPNG(nodes: DesignNode[], width = 800, height = 600, scale: PNGScale = 1): Promise<string> {
    const svg = exportToSVG(nodes, width, height)
    const scaledWidth = width * scale
    const scaledHeight = height * scale

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = scaledWidth
        canvas.height = scaledHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Failed to load SVG'))
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
  }

  /**
   * Export nodes to JSON
   */
  function exportToJSON(nodes: DesignNode[]): string {
    return JSON.stringify(nodes, null, 2)
  }

  /**
   * Export nodes to CSS
   */
  function exportToCSS(nodes: DesignNode[]): string {
    const css = nodes.map(node => {
      const className = `node-${node.id.replace(/[^a-zA-Z0-9]/g, '-')}`
      return nodeToCSS(node, className)
    }).join('\n\n')

    return `/* Generated by Construct UI Designer */\n\n${css}`
  }

  /**
   * Export nodes to HTML
   */
  function exportToHTML(nodes: DesignNode[], includeCSS = true): string {
    const html = nodes.map(node => nodeToHTML(node, includeCSS)).join('\n    ')
    const css = includeCSS ? exportToCSS(nodes) : ''

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Design</title>
  ${includeCSS ? `<style>\n${css}\n  </style>` : ''}
</head>
<body>
  <div class="design-container" style="position: relative; width: 100%; height: 100vh;">
    ${html}
  </div>
</body>
</html>`
  }

  /**
   * Export nodes to Vue SFC
   */
  function exportToVue(nodes: DesignNode[], componentName = 'DesignComponent'): string {
    const template = nodes.map(node => {
      const className = `node-${node.id.replace(/[^a-zA-Z0-9]/g, '-')}`
      const tag = node.type === 'text' ? 'p' : 'div'
      const content = node.type === 'text' ? (node.text || '') : ''
      return `    <${tag} class="${className}">${content}</${tag}>`
    }).join('\n')

    const css = nodes.map(node => {
      const className = `node-${node.id.replace(/[^a-zA-Z0-9]/g, '-')}`
      return nodeToCSS(node, className)
    }).join('\n\n')

    return `<script setup lang="ts">
/**
 * ${componentName}
 * Generated by Construct UI Designer
 */
</script>

<template>
  <div class="design-container">
${template}
  </div>
</template>

<style scoped>
.design-container {
  position: relative;
  width: 100%;
  height: 100%;
}

${css}
</style>`
  }

  /**
   * Export nodes to React JSX
   */
  function exportToReact(nodes: DesignNode[], componentName = 'DesignComponent'): string {
    const elements = nodes.map(node => {
      const styles: Record<string, string | number> = {
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }

      if (node.fill) {
        styles.background = fillToCSS(node.fill)
      }
      if (node.stroke && node.strokeWidth) {
        styles.border = `${node.strokeWidth}px solid ${node.stroke}`
      }
      if (node.cornerRadius) {
        const radius = typeof node.cornerRadius === 'number' ? node.cornerRadius : node.cornerRadius[0]
        styles.borderRadius = radius
      }
      if (node.type === 'ellipse') {
        styles.borderRadius = '50%'
      }
      if (node.opacity !== undefined && node.opacity !== 1) {
        styles.opacity = node.opacity
      }
      if (node.rotation) {
        styles.transform = `rotate(${node.rotation}deg)`
      }
      if (node.type === 'text') {
        if (node.fontSize) styles.fontSize = node.fontSize
        if (node.fontFamily) styles.fontFamily = `'${node.fontFamily}', sans-serif`
        if (node.fontWeight) styles.fontWeight = node.fontWeight
        if (node.textAlign) styles.textAlign = node.textAlign
      }

      const styleStr = Object.entries(styles)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`)
        .join(', ')

      const tag = node.type === 'text' ? 'p' : 'div'
      const content = node.type === 'text' ? (node.text || '') : ''

      return `      <${tag} style={{ ${styleStr} }}>${content}</${tag}>`
    }).join('\n')

    return `import React from 'react';

/**
 * ${componentName}
 * Generated by Construct UI Designer
 */
export function ${componentName}() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
${elements}
    </div>
  );
}`
  }

  /**
   * Export nodes to Tailwind HTML
   */
  function exportToTailwind(nodes: DesignNode[]): string {
    const elements = nodes.map(node => {
      const classes = nodeToTailwind(node)
      const tag = node.type === 'text' ? 'p' : 'div'
      const content = node.type === 'text' ? (node.text || '') : ''
      return `    <${tag} class="${classes}">${content}</${tag}>`
    }).join('\n')

    return `<!-- Generated by Construct UI Designer -->
<div class="relative w-full h-full">
${elements}
</div>`
  }

  /**
   * Download content as a file
   */
  function downloadFile(content: string, filename: string, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Download PNG from data URL
   */
  function downloadPNG(dataUrl: string, filename: string) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  /**
   * Export with options
   */
  async function exportDesign(
    nodes: DesignNode[],
    options: ExportOptions,
    filename = 'design',
    canvasWidth = 800,
    canvasHeight = 600
  ): Promise<string> {
    let content: string

    switch (options.format) {
      case 'svg':
        content = exportToSVG(nodes, canvasWidth, canvasHeight)
        downloadFile(content, `${filename}.svg`, 'image/svg+xml')
        break

      case 'png':
        content = await exportToPNG(nodes, canvasWidth, canvasHeight, options.scale || 1)
        downloadPNG(content, `${filename}@${options.scale || 1}x.png`)
        break

      case 'json':
        content = exportToJSON(nodes)
        downloadFile(content, `${filename}.json`, 'application/json')
        break

      case 'css':
        content = exportToCSS(nodes)
        downloadFile(content, `${filename}.css`, 'text/css')
        break

      case 'html':
        content = exportToHTML(nodes)
        downloadFile(content, `${filename}.html`, 'text/html')
        break

      case 'vue':
        content = exportToVue(nodes)
        downloadFile(content, `${filename}.vue`, 'text/plain')
        break

      case 'react':
        content = exportToReact(nodes)
        downloadFile(content, `${filename}.tsx`, 'text/plain')
        break

      case 'tailwind':
        content = exportToTailwind(nodes)
        downloadFile(content, `${filename}.html`, 'text/html')
        break

      default:
        throw new Error(`Unsupported export format: ${options.format}`)
    }

    return content
  }

  /**
   * Export a single element to SVG string
   */
  function exportElementToSVG(node: DesignNode, padding = 10): string {
    const width = node.width + padding * 2
    const height = node.height + padding * 2

    // Create a copy of the node positioned at padding offset
    const offsetNode = { ...node, x: padding, y: padding }

    // Handle gradient if present
    let defsSection = ''
    let gradientId: string | undefined

    if (node.fill && typeof node.fill !== 'string') {
      gradientId = `gradient-${sanitizeId(node.id) || 'single'}`
      const gradientDef = generateGradientDef(node.fill, gradientId)
      if (gradientDef) {
        defsSection = `<defs>\n    ${gradientDef}\n  </defs>\n  `
      }
    }

    const element = nodeToSVG(offsetNode, gradientId)

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defsSection}${element}
</svg>`
  }

  /**
   * Export a single element to PNG (returns data URL)
   */
  async function exportElementToPNG(node: DesignNode, scale: PNGScale = 2, padding = 10): Promise<string> {
    const svg = exportElementToSVG(node, padding)
    const width = node.width + padding * 2
    const height = node.height + padding * 2
    const scaledWidth = width * scale
    const scaledHeight = height * scale

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = scaledWidth
        canvas.height = scaledHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Failed to load SVG'))
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
  }

  /**
   * Export a single element and download it
   */
  async function exportElement(
    node: DesignNode,
    format: 'svg' | 'png' = 'svg',
    scale: PNGScale = 2,
    filename?: string
  ): Promise<string> {
    const name = filename || node.name || `element-${node.id}`
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-')

    if (format === 'svg') {
      const content = exportElementToSVG(node)
      downloadFile(content, `${safeName}.svg`, 'image/svg+xml')
      return content
    } else {
      const content = await exportElementToPNG(node, scale)
      downloadPNG(content, `${safeName}@${scale}x.png`)
      return content
    }
  }

  /**
   * Get SVG string for an element (for clipboard/preview without downloading)
   */
  function getElementSVG(node: DesignNode, padding = 10): string {
    return exportElementToSVG(node, padding)
  }

  /**
   * Copy element as SVG to clipboard
   */
  async function copyElementAsSVG(node: DesignNode, padding = 10): Promise<void> {
    const svg = exportElementToSVG(node, padding)
    await navigator.clipboard.writeText(svg)
  }

  /**
   * Copy element as PNG to clipboard (if supported)
   */
  async function copyElementAsPNG(node: DesignNode, scale: PNGScale = 2, padding = 10): Promise<void> {
    const dataUrl = await exportElementToPNG(node, scale, padding)

    // Convert data URL to blob
    const response = await fetch(dataUrl)
    const blob = await response.blob()

    // Copy to clipboard (requires ClipboardItem support)
    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
    } else {
      throw new Error('PNG clipboard copy not supported in this browser')
    }
  }

  return {
    // Individual exports (multi-node)
    exportToSVG,
    exportToPNG,
    exportToJSON,
    exportToCSS,
    exportToHTML,
    exportToVue,
    exportToReact,
    exportToTailwind,

    // Single element exports
    exportElement,
    exportElementToSVG,
    exportElementToPNG,
    getElementSVG,
    copyElementAsSVG,
    copyElementAsPNG,

    // Unified export
    exportDesign,

    // Utilities
    calculateBounds,

    // Download helpers
    downloadFile,
    downloadPNG,
  }
}
