/**
 * Tool interface — base contract for all design tools
 */
import type { FederatedPointerEvent } from 'pixi.js'

export interface Tool {
  name: string
  cursor: string
  onActivate(): void
  onDeactivate(): void
  onPointerDown(e: FederatedPointerEvent): void
  onPointerMove(e: FederatedPointerEvent): void
  onPointerUp(e: FederatedPointerEvent): void
  onKeyDown?(e: KeyboardEvent): void
  onKeyUp?(e: KeyboardEvent): void
}
