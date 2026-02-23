/**
 * ScreenRenderer — DesignNode(screen) → Container + background Graphics
 *
 * A screen is a frame/artboard — a Container with a background rectangle
 * and a name label. Children are placed inside.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { DesignNode } from '~/types/design'

export function createScreen(node: DesignNode): Container {
  const container = new Container()
  container.label = node.id

  // Background
  const bg = new Graphics()
  bg.label = '__bg'
  container.addChild(bg)

  // Name label (above the screen)
  const nameStyle = new TextStyle({
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#8b8b8b',
  })
  const nameText = new Text({ text: node.name || 'Screen', style: nameStyle })
  nameText.label = '__name'
  nameText.y = -24
  container.addChild(nameText)

  updateScreen(container, node)
  return container
}

export function updateScreen(container: Container, node: DesignNode): void {
  // Update background
  const bg = container.getChildByLabel('__bg') as Graphics | null
  if (bg) {
    bg.clear()
    bg.rect(0, 0, node.width, node.height)

    const fill = typeof node.fill === 'string' ? node.fill : '#ffffff'
    bg.fill({ color: fill })

    if (node.stroke && node.strokeWidth) {
      bg.stroke({ color: node.stroke, width: node.strokeWidth })
    }
  }

  // Update name
  const nameText = container.getChildByLabel('__name') as Text | null
  if (nameText) {
    nameText.text = node.name || 'Screen'
  }

  // Apply position, visibility, etc. but NOT to children (they manage themselves)
  container.x = node.x
  container.y = node.y
  container.alpha = node.opacity ?? 1
  container.visible = node.visible !== false
  container.eventMode = 'static'
  container.cursor = 'pointer'
}
