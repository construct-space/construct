/**
 * GroupRenderer — DesignNode(group) → PixiJS Container
 *
 * Groups are Containers that hold child objects.
 * Children are added by SceneRenderer based on parentId.
 */
import { Container } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import { applyCommonProps } from './shared'

export function createGroup(node: DesignNode): Container {
  const container = new Container()
  container.label = node.id
  updateGroup(container, node)
  return container
}

export function updateGroup(container: Container, node: DesignNode): void {
  applyCommonProps(container, node)
}
