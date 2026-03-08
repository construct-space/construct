// Design types for canvas-based design documents

// Gradient types
export interface GradientStop {
  offset: number  // 0-1
  color: string   // hex color
}

export interface LinearGradient {
  type: 'linear'
  angle: number   // 0-360 degrees
  // Optional normalized endpoints (0-1). When present, these take precedence over angle.
  startX?: number
  startY?: number
  endX?: number
  endY?: number
  stops: GradientStop[]
}

export interface RadialGradient {
  type: 'radial'
  centerX: number // 0-1 (percentage)
  centerY: number // 0-1 (percentage)
  radius: number  // 0-1 (percentage)
  stops: GradientStop[]
}

export type Gradient = LinearGradient | RadialGradient

// Fill can be solid color or gradient
export type Fill = string | Gradient

// Shadow types
export interface Shadow {
  type: 'drop' | 'inner'
  color: string
  offsetX: number
  offsetY: number
  blur: number
  spread: number
}

// Component override path format: 'childId.property' or just 'property' for root
export type OverridePath = string

export interface ComponentOverrides {
  [path: OverridePath]: unknown  // e.g., 'btn-text.text': 'Click Me'
}

// A named interactive state with property overrides
export interface ComponentState {
  id: string        // e.g., "state-abc123"
  name: string      // e.g., "Hover", "Active", "Disabled"
  overrides: ComponentOverrides  // Same format: { 'childId.fill': '#3b82f6' }
}

// Prototype interaction types
export type PrototypeTrigger = 'click' | 'hover' | 'mouseEnter' | 'mouseLeave' | 'afterDelay'
export type PrototypeAction = 'navigate' | 'back' | 'openUrl'
export type PrototypeTransition = 'instant' | 'dissolve' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'push'
export type PrototypeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

// Constraint types for child positioning when parent resizes
export type HorizontalConstraint = 'left' | 'right' | 'center' | 'scale' | 'leftAndRight'
export type VerticalConstraint = 'top' | 'bottom' | 'center' | 'scale' | 'topAndBottom'

export interface Constraints {
  horizontal: HorizontalConstraint
  vertical: VerticalConstraint
}

export interface NineSliceInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PrototypeInteraction {
  trigger: PrototypeTrigger
  action: PrototypeAction
  target?: string           // "pageId:screenId" or "pageId" (for navigate)
  url?: string              // for openUrl
  transition?: PrototypeTransition  // default 'instant'
  duration?: number         // ms, default 300
  easing?: PrototypeEasing  // default 'easeInOut'
  delay?: number            // ms, for afterDelay trigger
}

export interface DesignNode {
  id: string
  type: 'screen' | 'rectangle' | 'text' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'heart' | 'path' | 'image' | 'group' | 'component-instance'
  name: string
  x: number
  y: number
  width: number
  height: number
  fill?: Fill
  stroke?: string
  strokeWidth?: number
  strokeSides?: { top: boolean; right: boolean; bottom: boolean; left: boolean }
  strokeDashArray?: number[]  // e.g., [5, 5] for dashed, [2, 2] for dotted
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
  strokeMiterLimit?: number  // Miter limit for 'miter' join (default 4)
  strokeDashOffset?: number
  strokeUniform?: boolean  // Keep stroke width constant when scaling
  paintFirst?: 'fill' | 'stroke'  // Which renders first
  rotation?: number
  opacity?: number
  cornerRadius?: number | [number, number, number, number]
  locked?: boolean
  visible?: boolean

  // Transform
  flipX?: boolean
  flipY?: boolean
  skewX?: number
  skewY?: number

  // Blending
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'

  // Effects
  shadows?: Shadow[]
  blur?: number

  // Layer hierarchy
  parentId?: string | null
  childIds?: string[]
  zIndex?: number
  prototypeLinkTarget?: string
  prototypeLinkPageId?: string
  prototypeTrigger?: 'click'
  prototypeInteractions?: PrototypeInteraction[]

  // Nested children (for tree structure)
  children?: DesignNode[]

  // Text-specific properties
  text?: string
  textSizingMode?: 'auto-width' | 'auto-height' | 'fixed'
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
  fontStyle?: 'normal' | 'italic' | 'oblique'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  letterSpacing?: number
  // Text decoration
  underline?: boolean
  overline?: boolean
  linethrough?: boolean
  // Text background
  textBackgroundColor?: string
  // Text direction
  direction?: 'ltr' | 'rtl'
  // Text transform
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'

  // Line/Arrow-specific properties
  x2?: number  // End point X (for lines/arrows)
  y2?: number  // End point Y (for lines/arrows)

  // Polygon/Star-specific properties
  sides?: number      // Number of sides for polygon (3=triangle, 5=pentagon, 6=hexagon)
  points?: number     // Number of points for star (default 5)
  innerRadius?: number // Inner radius ratio for star (0-1, default 0.5)

  // Path-specific properties (for pen/pencil drawn paths)
  pathData?: string   // SVG path data string (e.g., "M 0 0 L 100 100")

  // Image-specific properties
  imageUrl?: string   // Image URL (http/https or data:base64)
  objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'  // How image fits in frame
  objectPositionX?: number  // Horizontal position 0-100 (default 50)
  objectPositionY?: number  // Vertical position 0-100 (default 50)
  // Crop insets (percentage of image to crop from each edge) - legacy
  cropTop?: number     // 0-100
  cropRight?: number   // 0-100
  cropBottom?: number  // 0-100
  cropLeft?: number    // 0-100
  // Native Fabric.js crop properties (pixel values)
  cropX?: number       // Pixel offset from left into original image
  cropY?: number       // Pixel offset from top into original image

  // Component properties
  isComponent?: boolean  // True if this node is a component master
  componentStates?: ComponentState[]  // Defined interactive states (hover, active, etc.)
  activeStateId?: string              // Currently previewed state ID (null = default)

  // Instance properties (only for type: 'component-instance')
  componentId?: string   // Reference to the master component ID
  overrides?: ComponentOverrides  // Property overrides
  constraints?: Constraints              // Per-child: how this node repositions when parent resizes
  nineSliceInsets?: NineSliceInsets       // On masters only: guide for auto-assigning child constraints
}

// Layer tree node with computed properties
export interface LayerTreeNode {
  node: DesignNode
  depth: number
  isExpanded: boolean
  absoluteX: number
  absoluteY: number
  children: LayerTreeNode[]
}

// Shared Style types (design tokens)
export interface ColorStyle {
  id: string
  name: string
  color: Fill  // Can be solid or gradient
}

export interface TextStyle {
  id: string
  name: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
}

export interface EffectStyle {
  id: string
  name: string
  shadows?: Shadow[]
  blur?: number
}

export interface SharedStyles {
  colors: ColorStyle[]
  texts: TextStyle[]
  effects: EffectStyle[]
}

// Comment types for annotations
export interface Comment {
  id: string
  x: number           // Canvas position X
  y: number           // Canvas position Y
  text: string        // Comment content
  author: string      // Author name
  createdAt: string   // ISO timestamp
  resolved?: boolean  // Whether comment is resolved
  replies?: CommentReply[]
}

export interface CommentReply {
  id: string
  text: string
  author: string
  createdAt: string
}

// Page type for multi-page designs
export interface DesignPage {
  id: string
  name: string
  nodes: DesignNode[]
  comments?: Comment[]
  width?: number   // Page dimensions (optional)
  height?: number
}

export interface CanvasData {
  nodes: DesignNode[]  // Legacy single-page support
  pages?: DesignPage[] // Multi-page support
  currentPageId?: string
  comments?: Comment[]
  styles?: SharedStyles
  version: number
}

export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface Design {
  id: number
  name: string
  canvas_data: CanvasData | null
  viewport: Viewport | null
  project_id?: number
  owner_id?: number
  owner?: {
    id: number
    first_name: string
    last_name: string
    email: string
  }
  project?: {
    id: number
    name: string
  }
  created_at: string
  updated_at: string
}

export interface CreateDesignRequest {
  name: string
  canvas_data?: CanvasData
  viewport?: Viewport
  project_id?: number
}

export interface UpdateDesignRequest {
  name?: string
  canvas_data?: CanvasData
  viewport?: Viewport
}
