/**
 * TextRenderer — DesignNode(text) → PixiJS Text
 */
import { Text, TextStyle } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyCommonProps } from './shared'

export function createTextNode(node: DesignNode): Text {
  const style = buildTextStyle(node)
  const text = new Text({ text: node.text || '', style })
  text.label = node.id
  applyCommonProps(text, node)
  return text
}

export function updateTextNode(text: Text, node: DesignNode): void {
  text.text = node.text || ''
  text.style = buildTextStyle(node)
  applyCommonProps(text, node)
}

function buildTextStyle(node: DesignNode): TextStyle {
  const fill = typeof node.fill === 'string' ? node.fill : '#000000'

  return new TextStyle({
    fontFamily: node.fontFamily || 'Inter, sans-serif',
    fontSize: node.fontSize || 16,
    fontWeight: (node.fontWeight || 'normal') as TextStyle['fontWeight'],
    fontStyle: node.fontStyle || 'normal',
    fill,
    align: node.textAlign || 'left',
    wordWrap: true,
    wordWrapWidth: node.width,
    lineHeight: node.lineHeight ? node.fontSize! * node.lineHeight : undefined,
    letterSpacing: node.letterSpacing || 0,
  })
}
