/**
 * useComponents - Component and instance management for UI Designer
 * Handles component creation, instancing, overrides, and propagation
 */
import type { DesignNode, Constraints, ComponentState } from '~/types/design'
import { applyConstraintTransform } from './useConstraints'

export interface ComponentInfo {
  id: string
  name: string
  node: DesignNode
  instanceCount: number
}

const DEFAULT_CONSTRAINTS: Constraints = { horizontal: 'left', vertical: 'top' }

export function useComponents(getNodes: () => DesignNode[], updateNode: (id: string, updates: Partial<DesignNode>) => void) {
  // Get all components in the design
  const components = computed((): ComponentInfo[] => {
    const nodes = getNodes()
    const componentNodes = nodes.filter(n => n.isComponent)

    return componentNodes.map(node => ({
      id: node.id,
      name: node.name,
      node,
      instanceCount: nodes.filter(n => n.componentId === node.id).length,
    }))
  })

  // Get component by ID
  function getComponent(componentId: string): DesignNode | undefined {
    return getNodes().find(n => n.id === componentId && n.isComponent)
  }

  // Find all instances of a component
  function findInstances(componentId: string): DesignNode[] {
    return getNodes().filter(n => n.componentId === componentId)
  }

  // Get all children of a node by walking the flat array via parentId
  function getChildrenOfNode(parentId: string): DesignNode[] {
    return getNodes().filter(n => n.parentId === parentId)
  }

  // Get all descendants of a node recursively from the flat array
  function getDescendants(ancestorId: string): DesignNode[] {
    const result: DesignNode[] = []
    const directChildren = getChildrenOfNode(ancestorId)
    for (const child of directChildren) {
      result.push(child)
      result.push(...getDescendants(child.id))
    }
    return result
  }

  // Get all children of a master component (flat array descendants)
  function getChildrenOfMaster(masterId: string): DesignNode[] {
    return getDescendants(masterId)
  }

  // Walk up parentId chain to find nearest ancestor with isComponent: true
  function getMasterForNode(nodeId: string): string | null {
    const nodes = getNodes()
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Check if the node itself is a component
    const node = nodeMap.get(nodeId)
    if (!node) return null
    if (node.isComponent) return node.id

    // Walk up
    let currentId = node.parentId
    const visited = new Set<string>()
    while (currentId) {
      if (visited.has(currentId)) break
      visited.add(currentId)
      const parent = nodeMap.get(currentId)
      if (!parent) break
      if (parent.isComponent) return parent.id
      currentId = parent.parentId
    }
    return null
  }

  // Create a component from a node (marks it as component)
  function createComponent(nodeId: string): DesignNode | null {
    const nodes = getNodes()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return null

    // Mark as component
    updateNode(nodeId, { isComponent: true })

    return { ...node, isComponent: true }
  }

  // Create an instance of a component at a position
  function createInstance(componentId: string, x: number, y: number): DesignNode | null {
    const master = getComponent(componentId)
    if (!master) return null

    const instance: DesignNode = {
      id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'component-instance',
      name: `${master.name}`,
      x,
      y,
      width: master.width,
      height: master.height,
      componentId,
      overrides: {},
      visible: true,
      locked: false,
      opacity: 1,
    }

    return instance
  }

  /**
   * Resolve an instance into a flat array of renderable child nodes.
   * Each child gets a synthetic ID: `${instanceId}__${originalChildId}`
   * Positions are relative to the instance origin.
   * Constraint transforms are applied when instance dimensions differ from master.
   *
   * @param instance - The component-instance node
   * @returns Array of resolved child DesignNodes ready for canvas rendering, or null if master not found
   */
  function resolveInstanceNodes(instance: DesignNode, depth: number = 0): DesignNode[] | null {
    if (instance.type !== 'component-instance' || !instance.componentId) return null
    if (depth > 5) return null // Prevent infinite recursion for nested instances

    const master = getComponent(instance.componentId)
    if (!master) return null

    const masterChildren = getDescendants(master.id)

    // Resolve the active state for this master (if any)
    const activeStateId = master.activeStateId
    const activeState = activeStateId
      ? master.componentStates?.find(s => s.id === activeStateId) ?? null
      : null

    if (masterChildren.length === 0) {
      // Master has no children — resolve the master itself as a single visual
      const resolved: DesignNode = JSON.parse(JSON.stringify(master))
      resolved.id = `${instance.id}__${master.id}`
      resolved.x = 0
      resolved.y = 0
      resolved.isComponent = false

      // Apply size from instance
      const scaleX = instance.width / master.width
      const scaleY = instance.height / master.height
      resolved.width = instance.width
      resolved.height = instance.height
      if (resolved.type === 'text' && resolved.fontSize) {
        resolved.fontSize = Math.round(resolved.fontSize * Math.min(scaleX, scaleY))
      }

      // Apply state overrides (lower priority than instance overrides)
      if (activeState?.overrides) {
        for (const [path, value] of Object.entries(activeState.overrides)) {
          if (!path.includes('.')) {
            (resolved as unknown as Record<string, unknown>)[path] = value
          }
        }
      }

      // Apply root overrides from instance (highest priority)
      if (instance.overrides) {
        for (const [path, value] of Object.entries(instance.overrides)) {
          if (!path.includes('.')) {
            (resolved as unknown as Record<string, unknown>)[path] = value
          }
        }
      }

      return [resolved]
    }

    const result: DesignNode[] = []

    // Build a map of original child IDs to parent IDs for hierarchy navigation
    const childParentMap = new Map<string, string>()
    for (const child of masterChildren) {
      if (child.parentId) {
        childParentMap.set(child.id, child.parentId)
      }
    }

    for (const child of masterChildren) {
      // Deep clone
      const resolved: DesignNode = JSON.parse(JSON.stringify(child))

      // Handle nested component instances recursively
      if (resolved.type === 'component-instance' && resolved.componentId) {
        const nestedChildren = resolveInstanceNodes(resolved, depth + 1)
        if (nestedChildren) {
          for (const nested of nestedChildren) {
            nested.id = `${instance.id}__${nested.id}`
            nested.x += resolved.x
            nested.y += resolved.y
            result.push(nested)
          }
        }
        continue
      }

      // Assign synthetic ID
      resolved.id = `${instance.id}__${child.id}`

      // Remap parentId for hierarchy within the instance
      if (resolved.parentId === master.id) {
        // Direct child of master — no parentId in resolved flat array
        resolved.parentId = undefined
      } else if (resolved.parentId) {
        resolved.parentId = `${instance.id}__${resolved.parentId}`
      }

      // Apply constraint transforms if instance size differs from master
      if (instance.width !== master.width || instance.height !== master.height) {
        // Only apply constraints to direct children of master
        if (child.parentId === master.id) {
          const constraints = child.constraints || DEFAULT_CONSTRAINTS
          const transformed = applyConstraintTransform(
            { x: resolved.x, y: resolved.y, width: resolved.width, height: resolved.height },
            constraints,
            master.width, master.height,
            instance.width, instance.height
          )
          resolved.x = transformed.x
          resolved.y = transformed.y
          resolved.width = transformed.width
          resolved.height = transformed.height
        }
      }

      // Apply state overrides from master (lower priority than instance overrides)
      if (activeState?.overrides) {
        for (const [path, value] of Object.entries(activeState.overrides)) {
          if (path.includes('.')) {
            const [targetId, property] = path.split('.')
            if (targetId === child.id && property) {
              (resolved as unknown as Record<string, unknown>)[property] = value
            }
          }
        }
      }

      // Apply overrides from instance (highest priority)
      if (instance.overrides) {
        for (const [path, value] of Object.entries(instance.overrides)) {
          if (path.includes('.')) {
            const [targetId, property] = path.split('.')
            if (targetId === child.id && property) {
              (resolved as unknown as Record<string, unknown>)[property] = value
            }
          }
        }
      }

      resolved.isComponent = false
      result.push(resolved)
    }

    return result
  }

  // Resolve an instance to its full node data (master + overrides) — used by detachInstance
  function resolveInstance(instance: DesignNode): DesignNode | null {
    if (instance.type !== 'component-instance' || !instance.componentId) {
      return instance
    }

    const master = getComponent(instance.componentId)
    if (!master) return null

    // Deep clone master
    const resolved: DesignNode = JSON.parse(JSON.stringify(master))

    // Always apply instance position and dimensions
    resolved.id = instance.id
    resolved.x = instance.x
    resolved.y = instance.y
    resolved.name = instance.name

    // Apply dimension overrides if present
    if (instance.overrides?.width !== undefined) {
      resolved.width = instance.overrides.width as number
    }
    if (instance.overrides?.height !== undefined) {
      resolved.height = instance.overrides.height as number
    }

    // Apply other overrides
    if (instance.overrides) {
      for (const [path, value] of Object.entries(instance.overrides)) {
        if (path === 'width' || path === 'height') continue // Already handled

        if (path.includes('.')) {
          // Override on child: 'childId.property'
          const parts = path.split('.')
          const targetId = parts[0]
          const property = parts[1]
          if (targetId && property) {
            const child = findChildInFlatArray(targetId)
            if (child) {
              (child as unknown as Record<string, unknown>)[property] = value
            }
          }
        } else {
          // Override on root
          (resolved as unknown as Record<string, unknown>)[path] = value
        }
      }
    }

    // Mark as resolved instance for rendering
    resolved.componentId = instance.componentId
    resolved.isComponent = false

    return resolved
  }

  // Find child in the flat node array by ID
  function findChildInFlatArray(targetId: string): DesignNode | null {
    return getNodes().find(n => n.id === targetId) || null
  }

  // Set an override on an instance
  function setOverride(instanceId: string, path: string, value: unknown): void {
    const nodes = getNodes()
    const instance = nodes.find(n => n.id === instanceId)
    if (!instance || instance.type !== 'component-instance') return

    const overrides = { ...(instance.overrides || {}), [path]: value }
    updateNode(instanceId, { overrides })
  }

  // Clear an override (revert to master value)
  function clearOverride(instanceId: string, path: string): void {
    const nodes = getNodes()
    const instance = nodes.find(n => n.id === instanceId)
    if (!instance || !instance.overrides) return

    const { [path]: _removed, ...overrides } = instance.overrides
    updateNode(instanceId, { overrides })
  }

  // Clear all overrides on an instance
  function clearAllOverrides(instanceId: string): void {
    updateNode(instanceId, { overrides: {} })
  }

  // Check if a property is overridden on an instance
  function isOverridden(instanceId: string, path: string): boolean {
    const nodes = getNodes()
    const instance = nodes.find(n => n.id === instanceId)
    return instance?.overrides?.[path] !== undefined
  }

  // Detach an instance (convert to regular node/group)
  function detachInstance(instance: DesignNode): DesignNode | null {
    if (instance.type !== 'component-instance' || !instance.componentId) {
      return null
    }

    // Resolve to get full data
    const resolved = resolveInstance(instance)
    if (!resolved) return null

    // Remove component-specific properties
    const detached: DesignNode = {
      ...resolved,
      type: resolved.type === 'component-instance' ? 'group' : resolved.type,
      componentId: undefined,
      overrides: undefined,
      isComponent: false,
    }

    return detached
  }

  // Remove component status (convert back to regular node)
  function removeComponent(nodeId: string): void {
    updateNode(nodeId, { isComponent: false })
  }

  // Check if deleting a component would orphan instances
  function hasInstances(componentId: string): boolean {
    return findInstances(componentId).length > 0
  }

  // Get all instance IDs for a component
  function getInstanceIds(componentId: string): string[] {
    return findInstances(componentId).map(i => i.id)
  }

  // --- Component State management ---

  // Properties that can be overridden per state
  const STATE_OVERRIDABLE_PROPS = new Set([
    'fill', 'stroke', 'strokeWidth', 'opacity',
    'text', 'fontSize', 'fontWeight',
    'cornerRadius', 'shadows', 'blur',
  ])

  function isStateOverridable(property: string): boolean {
    return STATE_OVERRIDABLE_PROPS.has(property)
  }

  function addState(componentId: string, name: string): ComponentState | null {
    const node = getComponent(componentId)
    if (!node) return null

    const newState: ComponentState = {
      id: `state-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      overrides: {},
    }

    const states = [...(node.componentStates || []), newState]
    updateNode(componentId, { componentStates: states })
    return newState
  }

  function removeState(componentId: string, stateId: string): void {
    const node = getComponent(componentId)
    if (!node?.componentStates) return

    const states = node.componentStates.filter(s => s.id !== stateId)
    const updates: Partial<DesignNode> = { componentStates: states }

    // If the removed state was active, clear activeStateId
    if (node.activeStateId === stateId) {
      updates.activeStateId = undefined
    }

    updateNode(componentId, updates)

    // Clean up instance overrides that reference this state
    const instances = findInstances(componentId)
    for (const inst of instances) {
      if (!inst.overrides) continue
      const cleaned: Record<string, unknown> = {}
      for (const [path, value] of Object.entries(inst.overrides)) {
        if (!path.startsWith(`${stateId}:`)) {
          cleaned[path] = value
        }
      }
      if (Object.keys(cleaned).length !== Object.keys(inst.overrides).length) {
        updateNode(inst.id, { overrides: cleaned })
      }
    }
  }

  function renameState(componentId: string, stateId: string, name: string): void {
    const node = getComponent(componentId)
    if (!node?.componentStates) return

    const states = node.componentStates.map(s =>
      s.id === stateId ? { ...s, name } : s
    )
    updateNode(componentId, { componentStates: states })
  }

  function setStateOverride(componentId: string, stateId: string, path: string, value: unknown): void {
    const node = getComponent(componentId)
    if (!node?.componentStates) return

    const states = node.componentStates.map(s => {
      if (s.id !== stateId) return s
      return { ...s, overrides: { ...s.overrides, [path]: value } }
    })
    updateNode(componentId, { componentStates: states })
  }

  function clearStateOverride(componentId: string, stateId: string, path: string): void {
    const node = getComponent(componentId)
    if (!node?.componentStates) return

    const states = node.componentStates.map(s => {
      if (s.id !== stateId) return s
      const { [path]: _removed, ...rest } = s.overrides
      return { ...s, overrides: rest }
    })
    updateNode(componentId, { componentStates: states })
  }

  function clearAllStateOverrides(componentId: string, stateId: string): void {
    const node = getComponent(componentId)
    if (!node?.componentStates) return

    const states = node.componentStates.map(s => {
      if (s.id !== stateId) return s
      return { ...s, overrides: {} }
    })
    updateNode(componentId, { componentStates: states })
  }

  function getActiveState(nodeId: string): ComponentState | null {
    const node = getNodes().find(n => n.id === nodeId)
    if (!node) return null

    // If this node IS a component master, check its own activeStateId
    if (node.isComponent && node.activeStateId && node.componentStates) {
      return node.componentStates.find(s => s.id === node.activeStateId) || null
    }

    // If this node is a child of a component master, check the master
    const masterId = getMasterForNode(nodeId)
    if (masterId) {
      const master = getComponent(masterId)
      if (master?.activeStateId && master.componentStates) {
        return master.componentStates.find(s => s.id === master.activeStateId) || null
      }
    }

    return null
  }

  function setActiveState(componentId: string, stateId: string | null): void {
    updateNode(componentId, { activeStateId: stateId || undefined })
  }

  return {
    // State
    components,

    // Component operations
    getComponent,
    createComponent,
    removeComponent,
    hasInstances,
    getInstanceIds,
    getChildrenOfMaster,
    getMasterForNode,

    // Instance operations
    createInstance,
    resolveInstance,
    resolveInstanceNodes,
    detachInstance,
    findInstances,

    // Override operations
    setOverride,
    clearOverride,
    clearAllOverrides,
    isOverridden,

    // State operations
    addState,
    removeState,
    renameState,
    setStateOverride,
    clearStateOverride,
    clearAllStateOverrides,
    getActiveState,
    setActiveState,
    isStateOverridable,
  }
}
