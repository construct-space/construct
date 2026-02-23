/**
 * Design space types — tool definitions and space-specific types
 */

export type UITool = 'select' | 'hand' | 'screen' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'pen' | 'pencil' | 'line' | 'arrow' | 'polygon' | 'star' | 'heart' | 'image'
export type TextPreset = 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'caption' | 'label'

export interface TextPresetStyle {
  fontSize: number
  fontWeight: string
  lineHeight?: number
}

export const TEXT_PRESET_STYLES: Record<TextPreset, TextPresetStyle> = {
  heading1: { fontSize: 48, fontWeight: 'bold', lineHeight: 1.2 },
  heading2: { fontSize: 36, fontWeight: 'bold', lineHeight: 1.2 },
  heading3: { fontSize: 24, fontWeight: '600', lineHeight: 1.3 },
  paragraph: { fontSize: 16, fontWeight: 'normal', lineHeight: 1.5 },
  caption: { fontSize: 12, fontWeight: 'normal', lineHeight: 1.4 },
  label: { fontSize: 11, fontWeight: '500', lineHeight: 1.3 },
}

export const TEXT_PRESET_DEFAULTS: Record<TextPreset, { text: string; width: number; height: number }> = {
  heading1: { text: 'Heading', width: 400, height: 58 },
  heading2: { text: 'Heading', width: 350, height: 44 },
  heading3: { text: 'Heading', width: 300, height: 32 },
  paragraph: { text: 'Type something...', width: 280, height: 24 },
  caption: { text: 'Caption text', width: 200, height: 18 },
  label: { text: 'LABEL', width: 100, height: 14 },
}
