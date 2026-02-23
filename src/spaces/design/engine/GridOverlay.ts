/**
 * GridOverlay — Grid lines, rulers, and snap guides
 * Renders on a dedicated Container above the scene.
 */
import { Container, Graphics } from 'pixi.js'

export interface GridConfig {
  enabled: boolean
  snapEnabled: boolean
  showRulers: boolean
  gridSize: number
  rulerSize: number
  gridColor: number
  gridAlpha: number
}

const DEFAULT_CONFIG: GridConfig = {
  enabled: false,
  snapEnabled: false,
  showRulers: false,
  gridSize: 20,
  rulerSize: 24,
  gridColor: 0xcccccc,
  gridAlpha: 0.3,
}

export class GridOverlay {
  private container: Container
  private gridGraphics: Graphics
  private rulerH: Graphics
  private rulerV: Graphics
  private rulerCorner: Graphics
  config: GridConfig

  constructor(parent: Container) {
    this.config = { ...DEFAULT_CONFIG }
    this.container = new Container()
    this.container.label = '__grid'
    this.container.eventMode = 'none'
    parent.addChild(this.container)

    this.gridGraphics = new Graphics()
    this.gridGraphics.label = '__gridLines'
    this.container.addChild(this.gridGraphics)

    this.rulerH = new Graphics()
    this.rulerH.label = '__rulerH'
    this.container.addChild(this.rulerH)

    this.rulerV = new Graphics()
    this.rulerV.label = '__rulerV'
    this.container.addChild(this.rulerV)

    this.rulerCorner = new Graphics()
    this.rulerCorner.label = '__rulerCorner'
    this.container.addChild(this.rulerCorner)
  }

  toggle(): void {
    this.config.enabled = !this.config.enabled
    this.redraw(0, 0, 0, 0, 1)
  }

  toggleSnap(): void {
    this.config.snapEnabled = !this.config.snapEnabled
  }

  toggleRulers(): void {
    this.config.showRulers = !this.config.showRulers
    this.redraw(0, 0, 0, 0, 1)
  }

  /**
   * Snap a value to the grid.
   */
  snap(value: number): number {
    if (!this.config.snapEnabled) return value
    return Math.round(value / this.config.gridSize) * this.config.gridSize
  }

  /**
   * Redraw grid and rulers for the current viewport.
   */
  redraw(
    viewX: number,
    viewY: number,
    screenWidth: number,
    screenHeight: number,
    zoom: number,
  ): void {
    this.gridGraphics.clear()
    this.rulerH.clear()
    this.rulerV.clear()
    this.rulerCorner.clear()

    if (!this.config.enabled && !this.config.showRulers) {
      this.container.visible = false
      return
    }

    this.container.visible = true

    if (this.config.enabled) {
      this.drawGrid(viewX, viewY, screenWidth, screenHeight, zoom)
    }

    if (this.config.showRulers) {
      this.drawRulers(viewX, viewY, screenWidth, screenHeight, zoom)
    }
  }

  private drawGrid(
    viewX: number,
    viewY: number,
    screenWidth: number,
    screenHeight: number,
    zoom: number,
  ): void {
    const g = this.gridGraphics
    const gridSize = this.config.gridSize * zoom

    // Skip if grid too small to see
    if (gridSize < 4) return

    const offsetX = (-viewX * zoom) % gridSize
    const offsetY = (-viewY * zoom) % gridSize

    // Vertical lines
    for (let x = offsetX; x < screenWidth; x += gridSize) {
      g.moveTo(x, 0)
      g.lineTo(x, screenHeight)
    }

    // Horizontal lines
    for (let y = offsetY; y < screenHeight; y += gridSize) {
      g.moveTo(0, y)
      g.lineTo(screenWidth, y)
    }

    g.stroke({ color: this.config.gridColor, width: 1, alpha: this.config.gridAlpha })
  }

  private drawRulers(
    viewX: number,
    viewY: number,
    screenWidth: number,
    screenHeight: number,
    _zoom: number,
  ): void {
    const size = this.config.rulerSize

    // Horizontal ruler background
    this.rulerH.rect(0, 0, screenWidth, size)
    this.rulerH.fill({ color: 0xf5f5f5 })
    this.rulerH.moveTo(0, size)
    this.rulerH.lineTo(screenWidth, size)
    this.rulerH.stroke({ color: 0xdddddd, width: 1 })

    // Vertical ruler background
    this.rulerV.rect(0, 0, size, screenHeight)
    this.rulerV.fill({ color: 0xf5f5f5 })
    this.rulerV.moveTo(size, 0)
    this.rulerV.lineTo(size, screenHeight)
    this.rulerV.stroke({ color: 0xdddddd, width: 1 })

    // Corner
    this.rulerCorner.rect(0, 0, size, size)
    this.rulerCorner.fill({ color: 0xf0f0f0 })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
