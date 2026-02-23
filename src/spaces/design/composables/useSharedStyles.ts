/**
 * useSharedStyles - Design token management for UI Designer
 * Handles color styles, text styles, and effect styles
 */
import type { ColorStyle, TextStyle, EffectStyle, SharedStyles, Fill, Shadow } from '~/types/design'

export function useSharedStyles() {
  const colorStyles = ref<ColorStyle[]>([])
  const textStyles = ref<TextStyle[]>([])
  const effectStyles = ref<EffectStyle[]>([])

  // Load styles from canvas data
  function loadStyles(data?: SharedStyles) {
    if (data) {
      colorStyles.value = data.colors || []
      textStyles.value = data.texts || []
      effectStyles.value = data.effects || []
    }
  }

  // Export styles for saving
  function exportStyles(): SharedStyles {
    return {
      colors: JSON.parse(JSON.stringify(colorStyles.value)),
      texts: JSON.parse(JSON.stringify(textStyles.value)),
      effects: JSON.parse(JSON.stringify(effectStyles.value)),
    }
  }

  // === Color Styles ===
  function addColorStyle(name: string, color: Fill): ColorStyle {
    const style: ColorStyle = {
      id: `color-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      color,
    }
    colorStyles.value.push(style)
    return style
  }

  function updateColorStyle(id: string, updates: Partial<Omit<ColorStyle, 'id'>>) {
    const style = colorStyles.value.find(s => s.id === id)
    if (style) {
      Object.assign(style, updates)
    }
  }

  function deleteColorStyle(id: string) {
    const index = colorStyles.value.findIndex(s => s.id === id)
    if (index !== -1) {
      colorStyles.value.splice(index, 1)
    }
  }

  function getColorStyle(id: string): ColorStyle | undefined {
    return colorStyles.value.find(s => s.id === id)
  }

  // === Text Styles ===
  function addTextStyle(
    name: string,
    options: {
      fontFamily?: string
      fontSize?: number
      fontWeight?: TextStyle['fontWeight']
      lineHeight?: number
      letterSpacing?: number
      textAlign?: TextStyle['textAlign']
    } = {}
  ): TextStyle {
    const style: TextStyle = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      fontFamily: options.fontFamily || 'Inter',
      fontSize: options.fontSize || 16,
      fontWeight: options.fontWeight || 'normal',
      lineHeight: options.lineHeight,
      letterSpacing: options.letterSpacing,
      textAlign: options.textAlign,
    }
    textStyles.value.push(style)
    return style
  }

  function updateTextStyle(id: string, updates: Partial<Omit<TextStyle, 'id'>>) {
    const style = textStyles.value.find(s => s.id === id)
    if (style) {
      Object.assign(style, updates)
    }
  }

  function deleteTextStyle(id: string) {
    const index = textStyles.value.findIndex(s => s.id === id)
    if (index !== -1) {
      textStyles.value.splice(index, 1)
    }
  }

  function getTextStyle(id: string): TextStyle | undefined {
    return textStyles.value.find(s => s.id === id)
  }

  // === Effect Styles ===
  function addEffectStyle(
    name: string,
    options: {
      shadows?: Shadow[]
      blur?: number
    } = {}
  ): EffectStyle {
    const style: EffectStyle = {
      id: `effect-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      shadows: options.shadows,
      blur: options.blur,
    }
    effectStyles.value.push(style)
    return style
  }

  function updateEffectStyle(id: string, updates: Partial<Omit<EffectStyle, 'id'>>) {
    const style = effectStyles.value.find(s => s.id === id)
    if (style) {
      Object.assign(style, updates)
    }
  }

  function deleteEffectStyle(id: string) {
    const index = effectStyles.value.findIndex(s => s.id === id)
    if (index !== -1) {
      effectStyles.value.splice(index, 1)
    }
  }

  function getEffectStyle(id: string): EffectStyle | undefined {
    return effectStyles.value.find(s => s.id === id)
  }

  // Create style from current selection
  function createColorStyleFromFill(name: string, fill: Fill): ColorStyle {
    return addColorStyle(name, fill)
  }

  function createTextStyleFromNode(
    name: string,
    node: {
      fontFamily?: string
      fontSize?: number
      fontWeight?: TextStyle['fontWeight']
      lineHeight?: number
      letterSpacing?: number
      textAlign?: TextStyle['textAlign']
    }
  ): TextStyle {
    return addTextStyle(name, node)
  }

  function createEffectStyleFromNode(
    name: string,
    node: {
      shadows?: Shadow[]
      blur?: number
    }
  ): EffectStyle {
    return addEffectStyle(name, node)
  }

  return {
    // State
    colorStyles: readonly(colorStyles),
    textStyles: readonly(textStyles),
    effectStyles: readonly(effectStyles),

    // Load/Export
    loadStyles,
    exportStyles,

    // Color styles
    addColorStyle,
    updateColorStyle,
    deleteColorStyle,
    getColorStyle,
    createColorStyleFromFill,

    // Text styles
    addTextStyle,
    updateTextStyle,
    deleteTextStyle,
    getTextStyle,
    createTextStyleFromNode,

    // Effect styles
    addEffectStyle,
    updateEffectStyle,
    deleteEffectStyle,
    getEffectStyle,
    createEffectStyleFromNode,
  }
}

// Singleton instance for global state
let instance: ReturnType<typeof useSharedStyles> | null = null

export function useSharedStylesState() {
  if (!instance) {
    instance = useSharedStyles()
  }
  return instance
}
