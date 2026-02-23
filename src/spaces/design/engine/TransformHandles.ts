/**
 * TransformHandles — 8 scale handles + rotation handle
 *
 * Renders on the overlay container (always on top).
 * Supports: resize, rotation, multi-selection scale, rotation-aware resize, Alt+skew.
 *
 * GPU-optimized: during drag, only PixiJS objects are modified directly.
 * On pointerup, final state is committed to Vue state via onUpdate().
 */
import { Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import type { SceneRenderer } from './SceneRenderer'

/** Handle positions */
type HandlePosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br'

const HANDLE_SIZE = 8
const HANDLE_COLOR = 0xffffff
const HANDLE_BORDER = 0x2563eb
const ROTATION_OFFSET = 20

const CURSORS: Record<HandlePosition, string> = {
  tl: 'nwse-resize',
  tc: 'ns-resize',
  tr: 'nesw-resize',
  ml: 'ew-resize',
  mr: 'ew-resize',
  bl: 'nesw-resize',
  bc: 'ns-resize',
  br: 'nwse-resize',
}

/** Per-object snapshot taken at drag start */
interface DragObjectState {
  x: number       // obj.x (PixiJS position)
  y: number       // obj.y (PixiJS position)
  boundsX: number // overlay bounds x (may differ from obj.x due to stroke, child offsets, etc.)
  boundsY: number // overlay bounds y
  width: number   // overlay bounds width (visual size)
  height: number  // overlay bounds height
  rotation: number
  skewX: number
  skewY: number
  initialScaleX: number // 1 or -1 (flip)
  initialScaleY: number
}

export class TransformHandles {
  private overlay: Container
  private container: Container
  private handles: Map<HandlePosition, Graphics> = new Map()
  private boundingBox: Graphics
  private rotationHandle: Graphics
  private rotationLine: Graphics
  private angleBadge: Text

  private onUpdate: (id: string, updates: Partial<DesignNode>) => void
  private onTransformEnd: () => void

  /** Current selection state */
  private selectedIds: string[] = []
  private bounds: { x: number; y: number; width: number; height: number } | null = null

  /** Current zoom level (used to keep handles screen-size constant) */
  private zoom = 1

  /** Renderer reference for GPU-direct access */
  private renderer: SceneRenderer | null = null

  /** Drag state */
  private dragging: HandlePosition | 'rotate' | null = null
  private dragStartPoint = { x: 0, y: 0 }
  private dragStartBounds = { x: 0, y: 0, width: 0, height: 0 }

  /** Per-object start state captured at drag start */
  private dragStartObjects: Map<string, DragObjectState> = new Map()

  /** Rotation drag state */
  private rotationStartAngle = 0 // angle from center to start pointer (radians)

  /** Whether Alt was held during this drag (for skew mode) */
  private isSkewMode = false

  constructor(
    overlay: Container,
    onUpdate: (id: string, updates: Partial<DesignNode>) => void,
    onTransformEnd: () => void,
  ) {
    this.overlay = overlay
    this.onUpdate = onUpdate
    this.onTransformEnd = onTransformEnd

    this.container = new Container()
    this.container.label = '__transformHandles'
    this.overlay.addChild(this.container)

    // Bounding box
    this.boundingBox = new Graphics()
    this.boundingBox.label = '__bbox'
    this.boundingBox.eventMode = 'none'
    this.container.addChild(this.boundingBox)

    // Rotation line (from center to rotation handle)
    this.rotationLine = new Graphics()
    this.rotationLine.label = '__rotationLine'
    this.rotationLine.eventMode = 'none'
    this.container.addChild(this.rotationLine)

    // Create 8 scale handles
    const positions: HandlePosition[] = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
    for (const pos of positions) {
      const handle = this.createHandle(pos)
      this.handles.set(pos, handle)
      this.container.addChild(handle)
    }

    // Rotation handle
    this.rotationHandle = this.createRotationHandle()
    this.container.addChild(this.rotationHandle)

    // Angle badge (hidden by default)
    this.angleBadge = new Text({
      text: '0°',
      style: new TextStyle({
        fontSize: 11,
        fill: 0xffffff,
        fontFamily: 'system-ui, sans-serif',
      }),
    })
    this.angleBadge.label = '__angleBadge'
    this.angleBadge.visible = false
    this.angleBadge.eventMode = 'none'
    this.container.addChild(this.angleBadge)

    this.container.visible = false
  }

  /**
   * Update handle positions based on selected objects.
   * @param zoom Current viewport zoom level — handles are inverse-scaled to stay constant screen size.
   */
  update(selectedIds: string[], renderer: SceneRenderer, zoom = 1): void {
    this.selectedIds = selectedIds
    this.zoom = zoom
    this.renderer = renderer

    if (selectedIds.length === 0) {
      this.container.visible = false
      this.bounds = null
      return
    }

    // Compute group bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const id of selectedIds) {
      const obj = renderer.getObject(id)
      if (!obj) continue
      const b = this.getOverlayBounds(obj)
      if (!b) continue
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width)
      maxY = Math.max(maxY, b.y + b.height)
    }

    if (!isFinite(minX)) {
      this.container.visible = false
      return
    }

    this.bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    this.container.visible = true

    this.redraw()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }

  // --- Private ---

  private redraw(): void {
    if (!this.bounds) return
    const { x, y, width, height } = this.bounds
    const inv = 1 / this.zoom

    // Bounding box — stroke width stays constant on screen
    this.boundingBox.clear()
    this.boundingBox.rect(x, y, width, height)
    this.boundingBox.stroke({ color: HANDLE_BORDER, width: 1 * inv })

    // Position handles and counter-scale so they stay constant screen size
    const positions: Record<HandlePosition, { x: number; y: number }> = {
      tl: { x, y },
      tc: { x: x + width / 2, y },
      tr: { x: x + width, y },
      ml: { x, y: y + height / 2 },
      mr: { x: x + width, y: y + height / 2 },
      bl: { x, y: y + height },
      bc: { x: x + width / 2, y: y + height },
      br: { x: x + width, y: y + height },
    }

    for (const [pos, handle] of this.handles) {
      const p = positions[pos]
      handle.x = p.x
      handle.y = p.y
      handle.scale.set(inv)
    }

    // Rotation handle (above top-center) — offset stays constant on screen
    const rotHandleX = x + width / 2
    const rotHandleY = y - ROTATION_OFFSET * inv
    this.rotationHandle.x = rotHandleX
    this.rotationHandle.y = rotHandleY
    this.rotationHandle.scale.set(inv)

    // Rotation line from top-center to rotation handle
    this.rotationLine.clear()
    this.rotationLine.moveTo(x + width / 2, y)
    this.rotationLine.lineTo(rotHandleX, rotHandleY)
    this.rotationLine.stroke({ color: HANDLE_BORDER, width: 1 * inv })
  }

  private createHandle(position: HandlePosition): Graphics {
    const g = new Graphics()
    g.label = `__handle_${position}`
    const half = HANDLE_SIZE / 2

    g.rect(-half, -half, HANDLE_SIZE, HANDLE_SIZE)
    g.fill({ color: HANDLE_COLOR })
    g.stroke({ color: HANDLE_BORDER, width: 1.5 })

    g.eventMode = 'static'
    g.cursor = CURSORS[position]

    g.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      this.startDrag(position, e)
    })

    return g
  }

  private createRotationHandle(): Graphics {
    const g = new Graphics()
    g.label = '__rotationHandle'

    g.circle(0, 0, 5)
    g.fill({ color: HANDLE_COLOR })
    g.stroke({ color: HANDLE_BORDER, width: 1.5 })

    g.eventMode = 'static'
    g.cursor = 'grab'

    g.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      this.startDrag('rotate', e)
    })

    return g
  }

  /**
   * Capture per-object start state from PixiJS objects (for GPU-optimized drag).
   */
  private captureStartState(): void {
    this.dragStartObjects.clear()
    if (!this.renderer) return

    for (const id of this.selectedIds) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue

      // Get the axis-aligned bounds in overlay space for width/height
      const overlayBounds = this.getOverlayBounds(obj)

      this.dragStartObjects.set(id, {
        x: obj.x,
        y: obj.y,
        boundsX: overlayBounds?.x ?? obj.x,
        boundsY: overlayBounds?.y ?? obj.y,
        width: overlayBounds?.width ?? 0,
        height: overlayBounds?.height ?? 0,
        rotation: obj.angle,
        skewX: obj.skew.x,
        skewY: obj.skew.y,
        initialScaleX: obj.scale.x < 0 ? -1 : 1,
        initialScaleY: obj.scale.y < 0 ? -1 : 1,
      })
    }
  }

  private startDrag(which: HandlePosition | 'rotate', e: FederatedPointerEvent): void {
    if (!this.bounds) return
    const start = this.toOverlayPoint(e.globalX, e.globalY)
    this.dragging = which
    this.dragStartPoint = start
    this.dragStartBounds = { ...this.bounds }
    this.isSkewMode = false

    // Capture per-object start state
    this.captureStartState()

    // For rotation: compute start angle from selection center
    if (which === 'rotate') {
      const cx = this.bounds.x + this.bounds.width / 2
      const cy = this.bounds.y + this.bounds.height / 2
      this.rotationStartAngle = Math.atan2(start.y - cy, start.x - cx)
      this.rotationHandle.cursor = 'grabbing'
      this.angleBadge.visible = true
    }

    const stage = this.overlay.parent
    if (!stage) return

    const onMove = (e: FederatedPointerEvent) => {
      if (!this.dragging || !this.bounds) return
      this.onDrag(e)
    }

    const onUp = () => {
      stage.off('pointermove', onMove)
      stage.off('pointerup', onUp)
      stage.off('pointerupoutside', onUp)

      if (this.dragging === 'rotate') {
        this.rotationHandle.cursor = 'grab'
        this.angleBadge.visible = false
      }

      // Commit final transform to Vue state
      this.commitTransform()
      this.dragging = null
      this.dragStartObjects.clear()
    }

    stage.on('pointermove', onMove)
    stage.on('pointerup', onUp)
    stage.on('pointerupoutside', onUp)
  }

  private onDrag(e: FederatedPointerEvent): void {
    if (!this.dragging || !this.bounds || !this.renderer) return

    const pointer = this.toOverlayPoint(e.globalX, e.globalY)
    const dx = pointer.x - this.dragStartPoint.x
    const dy = pointer.y - this.dragStartPoint.y

    // Handle rotation
    if (this.dragging === 'rotate') {
      this.onDragRotate(pointer)
      return
    }

    // Check for Alt+drag skew on edge handles
    const isEdgeHandle = this.dragging === 'tc' || this.dragging === 'bc' || this.dragging === 'ml' || this.dragging === 'mr'
    if (isEdgeHandle && e.altKey) {
      this.isSkewMode = true
      this.onDragSkew(dx, dy)
      return
    }

    // If we were in skew mode but Alt was released, reset skew and continue with resize
    if (this.isSkewMode && !e.altKey) {
      this.isSkewMode = false
      // Reset skew on objects
      for (const [id, startState] of this.dragStartObjects) {
        const obj = this.renderer.getObject(id)
        if (!obj) continue
        obj.skew.x = startState.skewX
        obj.skew.y = startState.skewY
      }
    }

    // Handle resize modifiers
    const isCorner = this.dragging === 'tl' || this.dragging === 'tr' || this.dragging === 'bl' || this.dragging === 'br'
    const proportional = e.shiftKey && isCorner
    // Alt on corner/edge handles = resize from center (mirror both sides)
    const mirror = e.altKey

    if (this.selectedIds.length === 1) {
      this.onDragResizeSingle(dx, dy, proportional, mirror)
    } else {
      this.onDragResizeMulti(dx, dy, proportional, mirror)
    }
  }

  /**
   * Rotation drag: compute angle delta and apply to all selected objects.
   */
  private onDragRotate(pointer: { x: number; y: number }): void {
    if (!this.renderer || !this.bounds) return
    const sb = this.dragStartBounds

    const cx = sb.x + sb.width / 2
    const cy = sb.y + sb.height / 2
    const currentAngle = Math.atan2(pointer.y - cy, pointer.x - cx)
    const deltaRad = currentAngle - this.rotationStartAngle
    const deltaDeg = (deltaRad * 180) / Math.PI

    // Apply rotation directly to PixiJS objects (GPU-only)
    for (const [id, startState] of this.dragStartObjects) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue
      obj.angle = startState.rotation + deltaDeg
    }

    // Update angle badge
    const firstStart = this.dragStartObjects.values().next().value
    if (firstStart) {
      const displayAngle = ((firstStart.rotation + deltaDeg) % 360 + 360) % 360
      this.angleBadge.text = `${Math.round(displayAngle)}°`
      const inv = 1 / this.zoom
      this.angleBadge.x = sb.x + sb.width / 2 + 15 * inv
      this.angleBadge.y = sb.y - ROTATION_OFFSET * inv - 8 * inv
      this.angleBadge.scale.set(inv)
    }

    // Update the bounding box visuals (bounds don't change for rotation)
    this.redraw()
  }

  /**
   * Alt+drag skew on edge handles.
   * tc/bc → skewX (horizontal shear), ml/mr → skewY (vertical shear)
   */
  private onDragSkew(dx: number, dy: number): void {
    if (!this.renderer || !this.dragging) return

    for (const [id, startState] of this.dragStartObjects) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue

      if (this.dragging === 'tc' || this.dragging === 'bc') {
        // Horizontal skew from dx
        const height = startState.height || 1
        const skewRad = Math.atan2(dx, height)
        obj.skew.x = startState.skewX + skewRad
      } else if (this.dragging === 'ml' || this.dragging === 'mr') {
        // Vertical skew from dy
        const width = startState.width || 1
        const skewRad = Math.atan2(dy, width)
        obj.skew.y = startState.skewY + skewRad
      }
    }
  }

  /**
   * Single-selection resize: rotation-aware if object is rotated.
   * Modifies PixiJS objects directly (GPU-only).
   */
  private onDragResizeSingle(dx: number, dy: number, proportional: boolean, mirror: boolean): void {
    if (!this.renderer || !this.dragging) return
    const sb = this.dragStartBounds
    const id = this.selectedIds[0]
    if (!id) return

    const obj = this.renderer.getObject(id)
    const startState = this.dragStartObjects.get(id)
    if (!obj || !startState) return

    const rotation = startState.rotation
    const hasRotation = Math.abs(rotation) > 0.01

    let localDx = dx
    let localDy = dy

    // If rotated, transform pointer delta into the object's local space
    if (hasRotation) {
      const rad = (rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      localDx = dx * cos + dy * sin
      localDy = -dx * sin + dy * cos
    }

    let newX = sb.x
    let newY = sb.y
    let newW = sb.width
    let newH = sb.height

    switch (this.dragging) {
      case 'tl':
        newX = sb.x + localDx
        newY = sb.y + localDy
        newW = sb.width - localDx
        newH = sb.height - localDy
        break
      case 'tc':
        newY = sb.y + localDy
        newH = sb.height - localDy
        break
      case 'tr':
        newY = sb.y + localDy
        newW = sb.width + localDx
        newH = sb.height - localDy
        break
      case 'ml':
        newX = sb.x + localDx
        newW = sb.width - localDx
        break
      case 'mr':
        newW = sb.width + localDx
        break
      case 'bl':
        newX = sb.x + localDx
        newW = sb.width - localDx
        newH = sb.height + localDy
        break
      case 'bc':
        newH = sb.height + localDy
        break
      case 'br':
        newW = sb.width + localDx
        newH = sb.height + localDy
        break
    }

    // Shift+corner → lock aspect ratio
    if (proportional && sb.width > 0 && sb.height > 0) {
      const aspect = sb.width / sb.height
      const candidateH = newW / aspect
      const candidateW = newH * aspect

      switch (this.dragging) {
        case 'tl': {
          if (Math.abs(localDx) > Math.abs(localDy)) {
            newH = candidateH; newY = sb.y + sb.height - newH
          } else {
            newW = candidateW; newX = sb.x + sb.width - newW
          }
          break
        }
        case 'tr': {
          if (Math.abs(localDx) > Math.abs(localDy)) {
            newH = candidateH; newY = sb.y + sb.height - newH
          } else {
            newW = candidateW
          }
          break
        }
        case 'bl': {
          if (Math.abs(localDx) > Math.abs(localDy)) {
            newH = candidateH
          } else {
            newW = candidateW; newX = sb.x + sb.width - newW
          }
          break
        }
        case 'br': {
          if (Math.abs(localDx) > Math.abs(localDy)) {
            newH = candidateH
          } else {
            newW = candidateW
          }
          break
        }
      }
    }

    // Alt → resize from center (mirror the delta to the opposite side)
    if (mirror) {
      const dw = newW - sb.width
      const dh = newH - sb.height
      newW = sb.width + dw * 2
      newH = sb.height + dh * 2
      newX = sb.x - dw
      newY = sb.y - dh
    }

    // Enforce minimum size
    if (newW < 1) { newW = 1; newX = sb.x + sb.width - 1 }
    if (newH < 1) { newH = 1; newY = sb.y + sb.height - 1 }

    // Apply position using DELTA from start bounds, not absolute bounds position.
    // obj.x may differ from sb.x due to stroke offsets, child positioning (screens), etc.
    obj.x = startState.x + (newX - sb.x)
    obj.y = startState.y + (newY - sb.y)

    // Use scale to achieve resize without redrawing the graphics
    // Preserve flip sign from initial state
    const scaleX = newW / (startState.width || 1)
    const scaleY = newH / (startState.height || 1)
    obj.scale.x = scaleX * startState.initialScaleX
    obj.scale.y = scaleY * startState.initialScaleY

    // Update bounds and redraw handles
    this.bounds = { x: newX, y: newY, width: newW, height: newH }
    this.redraw()
  }

  /**
   * Multi-selection resize: scale all objects proportionally.
   * Modifies PixiJS objects directly (GPU-only).
   */
  private onDragResizeMulti(dx: number, dy: number, proportional: boolean, mirror: boolean): void {
    if (!this.renderer || !this.dragging) return
    const sb = this.dragStartBounds

    let newX = sb.x
    let newY = sb.y
    let newW = sb.width
    let newH = sb.height

    switch (this.dragging) {
      case 'tl':
        newX = sb.x + dx; newY = sb.y + dy
        newW = sb.width - dx; newH = sb.height - dy
        break
      case 'tc':
        newY = sb.y + dy; newH = sb.height - dy
        break
      case 'tr':
        newY = sb.y + dy; newW = sb.width + dx; newH = sb.height - dy
        break
      case 'ml':
        newX = sb.x + dx; newW = sb.width - dx
        break
      case 'mr':
        newW = sb.width + dx
        break
      case 'bl':
        newX = sb.x + dx; newW = sb.width - dx; newH = sb.height + dy
        break
      case 'bc':
        newH = sb.height + dy
        break
      case 'br':
        newW = sb.width + dx; newH = sb.height + dy
        break
    }

    // Shift+corner → lock aspect ratio
    if (proportional && sb.width > 0 && sb.height > 0) {
      const aspect = sb.width / sb.height
      const candidateH = newW / aspect
      const candidateW = newH * aspect

      switch (this.dragging) {
        case 'tl': {
          if (Math.abs(dx) > Math.abs(dy)) {
            newH = candidateH; newY = sb.y + sb.height - newH
          } else {
            newW = candidateW; newX = sb.x + sb.width - newW
          }
          break
        }
        case 'tr': {
          if (Math.abs(dx) > Math.abs(dy)) {
            newH = candidateH; newY = sb.y + sb.height - newH
          } else { newW = candidateW }
          break
        }
        case 'bl': {
          if (Math.abs(dx) > Math.abs(dy)) {
            newH = candidateH
          } else {
            newW = candidateW; newX = sb.x + sb.width - newW
          }
          break
        }
        case 'br': {
          if (Math.abs(dx) > Math.abs(dy)) { newH = candidateH }
          else { newW = candidateW }
          break
        }
      }
    }

    // Alt → resize from center (mirror)
    if (mirror) {
      const dw = newW - sb.width
      const dh = newH - sb.height
      newW = sb.width + dw * 2
      newH = sb.height + dh * 2
      newX = sb.x - dw
      newY = sb.y - dh
    }

    // Enforce minimum size
    if (newW < 1) { newW = 1; newX = sb.x + sb.width - 1 }
    if (newH < 1) { newH = 1; newY = sb.y + sb.height - 1 }

    const scaleX = newW / (sb.width || 1)
    const scaleY = newH / (sb.height || 1)

    // Apply to each object: scale and reposition relative to group
    for (const [id, startState] of this.dragStartObjects) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue

      // Compute relative position using overlay BOUNDS position (not obj position)
      const relX = (startState.boundsX - sb.x) / (sb.width || 1)
      const relY = (startState.boundsY - sb.y) / (sb.height || 1)

      // Map to new group bounds, then convert back to obj position via delta
      const newBoundsX = newX + relX * newW
      const newBoundsY = newY + relY * newH
      obj.x = startState.x + (newBoundsX - startState.boundsX)
      obj.y = startState.y + (newBoundsY - startState.boundsY)

      // Scale the object, preserving flip sign
      obj.scale.x = scaleX * startState.initialScaleX
      obj.scale.y = scaleY * startState.initialScaleY
    }

    // Update bounds and redraw handles
    this.bounds = { x: newX, y: newY, width: newW, height: newH }
    this.redraw()
  }

  /**
   * Commit final GPU transform state to Vue state.
   * Resets PixiJS scale back to 1 and writes geometry (x, y, width, height, rotation, skew).
   */
  private commitTransform(): void {
    if (!this.renderer) {
      this.onTransformEnd()
      return
    }

    let hadChanges = false

    for (const [id, startState] of this.dragStartObjects) {
      const obj = this.renderer.getObject(id)
      if (!obj) continue

      const updates: Partial<DesignNode> = {}

      // Position
      if (obj.x !== startState.x) updates.x = obj.x
      if (obj.y !== startState.y) updates.y = obj.y

      // Rotation (degrees)
      const finalRotation = obj.angle
      if (Math.abs(finalRotation - startState.rotation) > 0.01) {
        updates.rotation = Math.round(finalRotation * 100) / 100
      }

      // Skew (convert from radians to degrees for DesignNode)
      if (Math.abs(obj.skew.x - startState.skewX) > 0.001) {
        updates.skewX = Math.round((obj.skew.x * 180) / Math.PI * 100) / 100
      }
      if (Math.abs(obj.skew.y - startState.skewY) > 0.001) {
        updates.skewY = Math.round((obj.skew.y * 180) / Math.PI * 100) / 100
      }

      // Scale → convert back to width/height geometry
      // The absolute scale relative to the initial (flip-only) scale tells us the size factor
      const absScaleX = Math.abs(obj.scale.x)
      const absScaleY = Math.abs(obj.scale.y)
      if (Math.abs(absScaleX - 1) > 0.001 || Math.abs(absScaleY - 1) > 0.001) {
        updates.width = Math.round(startState.width * absScaleX * 100) / 100
        updates.height = Math.round(startState.height * absScaleY * 100) / 100

        // Reset scale back to initial (preserving flip sign)
        obj.scale.x = startState.initialScaleX
        obj.scale.y = startState.initialScaleY
      }

      if (Object.keys(updates).length > 0) {
        hadChanges = true
        this.onUpdate(id, updates)
      }
    }

    if (hadChanges) {
      this.onTransformEnd()
    }
  }

  private getOverlayBounds(obj: Container): Rectangle | null {
    const target = this.getRenderedBoundsTarget(obj)
    return this.getBoundsFromRenderedCorners(target, this.overlay) ?? this.getFallbackOverlayBounds(target)
  }

  private getFallbackOverlayBounds(obj: Container): Rectangle | null {
    const bounds = obj.getBounds()
    if (
      !isFinite(bounds.x) || !isFinite(bounds.y) ||
      !isFinite(bounds.width) || !isFinite(bounds.height)
    ) {
      return null
    }

    const topLeft = this.overlay.toLocal({ x: bounds.x, y: bounds.y })
    const bottomRight = this.overlay.toLocal({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    const minX = Math.min(topLeft.x, bottomRight.x)
    const minY = Math.min(topLeft.y, bottomRight.y)

    return new Rectangle(
      minX,
      minY,
      Math.abs(bottomRight.x - topLeft.x),
      Math.abs(bottomRight.y - topLeft.y),
    )
  }

  private getBoundsFromRenderedCorners(target: Container, space: Container): Rectangle | null {
    const localBounds = target.getLocalBounds()
    if (
      !isFinite(localBounds.x) || !isFinite(localBounds.y) ||
      !isFinite(localBounds.width) || !isFinite(localBounds.height)
    ) {
      return null
    }

    const corners = [
      { x: localBounds.x, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
      { x: localBounds.x, y: localBounds.y + localBounds.height },
    ]

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const corner of corners) {
      const global = target.toGlobal(corner)
      const local = space.toLocal(global)
      minX = Math.min(minX, local.x)
      minY = Math.min(minY, local.y)
      maxX = Math.max(maxX, local.x)
      maxY = Math.max(maxY, local.y)
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null
    }

    return new Rectangle(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  }

  private getRenderedBoundsTarget(obj: Container): Container {
    // For screens, use only the frame graphics and exclude the title label.
    const background = obj.getChildByLabel('__bg') as Container | null
    const title = obj.getChildByLabel('__name')
    if (background && title) return background
    return obj
  }

  private toOverlayPoint(globalX: number, globalY: number): { x: number; y: number } {
    const local = this.overlay.toLocal({ x: globalX, y: globalY })
    return { x: local.x, y: local.y }
  }
}
