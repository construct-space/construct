/**
 * SceneRenderer — DesignNode[] → PixiJS scene sync
 *
 * Maintains a Map<nodeId, Container> and diffs against incoming DesignNode[].
 * Creates, updates, or removes PixiJS objects as needed.
 *
 * Parent-child hierarchy is built using parentId references.
 */
import { Container } from 'pixi.js'
import type { DesignNode } from '~/types/design'
import {
  createRect, updateRect,
  createEllipse, updateEllipse,
  createTextNode, updateTextNode,
  createImage, updateImage,
  createPath, updatePath,
  createLine, updateLine,
  createGroup, updateGroup,
  createScreen, updateScreen,
} from './renderers'

export class SceneRenderer {
  /** nodeId → PixiJS object */
  private objects = new Map<string, Container>()
  /** PixiJS object → nodeId (reverse lookup) */
  private objectIds = new WeakMap<Container, string>()
  /** The scene container to add root objects to */
  private scene: Container

  constructor(scene: Container) {
    this.scene = scene
  }

  /**
   * Full sync: diff incoming nodes against current objects.
   * Creates new, updates existing, removes stale.
   */
  sync(nodes: DesignNode[]): void {
    const incomingIds = new Set<string>()

    // First pass: create or update objects (flat — no parenting yet)
    for (const node of nodes) {
      incomingIds.add(node.id)
      const existing = this.objects.get(node.id)

      try {
        if (existing) {
          this.updateObject(existing, node)
        } else {
          const obj = this.createObject(node)
          if (obj) {
            this.objects.set(node.id, obj)
            this.objectIds.set(obj, node.id)
          }
        }
      } catch (e) {
        console.warn(`[SceneRenderer] Failed to render node ${node.id} (${node.type}):`, e)
      }
    }

    // Second pass: remove objects not in incoming set
    for (const [id, obj] of this.objects) {
      if (!incomingIds.has(id)) {
        this.removeFromParent(obj)
        obj.destroy({ children: true })
        this.objects.delete(id)
      }
    }

    // Third pass: build parent-child hierarchy and add to scene
    this.rebuildHierarchy(nodes)
  }

  /**
   * Create a single PixiJS object for a DesignNode.
   */
  createObject(node: DesignNode): Container | null {
    switch (node.type) {
      case 'rectangle':
        return createRect(node)
      case 'ellipse':
        return createEllipse(node)
      case 'text':
        return createTextNode(node)
      case 'image':
        return createImage(node)
      case 'path':
        return createPath(node)
      case 'line':
      case 'arrow':
        return createLine(node)
      case 'group':
      case 'component-instance':
        return createGroup(node)
      case 'screen':
        return createScreen(node)
      case 'polygon':
      case 'star':
      case 'heart':
        // Render as path or rect fallback for now
        return createRect(node)
      default:
        console.warn(`[SceneRenderer] Unknown node type: ${node.type}`)
        return null
    }
  }

  /**
   * Update a PixiJS object from node data.
   */
  updateObject(obj: Container, node: DesignNode): void {
    switch (node.type) {
      case 'rectangle':
      case 'polygon':
      case 'star':
      case 'heart':
        updateRect(obj as any, node)
        break
      case 'ellipse':
        updateEllipse(obj as any, node)
        break
      case 'text':
        updateTextNode(obj as any, node)
        break
      case 'image':
        updateImage(obj, node)
        break
      case 'path':
        updatePath(obj as any, node)
        break
      case 'line':
      case 'arrow':
        updateLine(obj as any, node)
        break
      case 'group':
      case 'component-instance':
        updateGroup(obj, node)
        break
      case 'screen':
        updateScreen(obj, node)
        break
    }
  }

  /**
   * Remove a specific node's object.
   */
  removeObject(id: string): void {
    const obj = this.objects.get(id)
    if (!obj) return
    this.removeFromParent(obj)
    obj.destroy({ children: true })
    this.objects.delete(id)
  }

  /**
   * Get the PixiJS object for a node ID.
   */
  getObject(id: string): Container | undefined {
    return this.objects.get(id)
  }

  /**
   * Get the node ID for a PixiJS object (walks up parent chain).
   */
  getNodeId(obj: Container): string | undefined {
    let current: Container | null = obj
    while (current) {
      const id = this.objectIds.get(current)
      if (id) return id
      current = current.parent as Container | null
    }
    return undefined
  }

  /**
   * Get all objects.
   */
  getAllObjects(): Map<string, Container> {
    return this.objects
  }

  /**
   * Add a single node to the scene.
   */
  addNode(node: DesignNode): Container | null {
    const obj = this.createObject(node)
    if (!obj) return null

    this.objects.set(node.id, obj)
    this.objectIds.set(obj, node.id)

    // Add to parent or scene
    if (node.parentId) {
      const parent = this.objects.get(node.parentId)
      if (parent) {
        parent.addChild(obj)
        return obj
      }
    }
    this.scene.addChild(obj)
    return obj
  }

  /**
   * Update a single node in the scene.
   */
  updateNode(id: string, updates: Partial<DesignNode>): void {
    const obj = this.objects.get(id)
    if (!obj) return

    // We need the full node data to update, so merge with what we know
    // The caller should provide the full node or we get it from the update
    // For now, we'll do a partial update on position/transform props
    if (updates.x !== undefined) obj.x = updates.x
    if (updates.y !== undefined) obj.y = updates.y
    if (updates.opacity !== undefined) obj.alpha = updates.opacity
    if (updates.visible !== undefined) obj.visible = updates.visible
    if (updates.rotation !== undefined) obj.angle = updates.rotation
  }

  /**
   * Destroy all objects and clear the scene.
   */
  destroy(): void {
    for (const [, obj] of this.objects) {
      obj.destroy({ children: true })
    }
    this.objects.clear()
  }

  /**
   * Rebuild parent-child hierarchy based on parentId.
   */
  private rebuildHierarchy(nodes: DesignNode[]): void {
    // Build parentId → nodeId[] map
    const childrenOf = new Map<string | null, string[]>()
    for (const node of nodes) {
      const parentKey = node.parentId || null
      if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, [])
      childrenOf.get(parentKey)!.push(node.id)
    }

    // First, detach all objects from scene
    for (const [, obj] of this.objects) {
      this.removeFromParent(obj)
    }

    // Add root-level objects to scene (parentId is null/undefined)
    const rootIds = childrenOf.get(null) || []
    for (const id of rootIds) {
      const obj = this.objects.get(id)
      if (obj) this.scene.addChild(obj)
    }

    // Add children to their parents
    for (const [parentId, childIds] of childrenOf) {
      if (!parentId) continue
      const parentObj = this.objects.get(parentId)
      if (!parentObj) continue

      for (const childId of childIds) {
        const childObj = this.objects.get(childId)
        if (childObj) parentObj.addChild(childObj)
      }
    }
  }

  private removeFromParent(obj: Container): void {
    if (obj.parent) {
      obj.parent.removeChild(obj)
    }
  }
}
