import type { SpacePage } from './useSpaces'

export type SidebarPanel = 'main' | 'space'

export interface SpaceNavItem extends SpacePage {
  route: string // Full route path
  requiresContext?: boolean // Inherited from SpacePage
}

export interface SidebarNavItem {
  label: string
  icon: string
  to: string
  spaceName?: string // For spaces with sub-navigation
  pages?: SpaceNavItem[]
}

interface SidebarState {
  panel: SidebarPanel
  mainItems: SidebarNavItem[]
  mainBottomItems: SidebarNavItem[]
  // Space navigation state
  activeSpace: string | null
  activeSpaceItems: SpaceNavItem[]
  spaceBackRoute: string // Route to go back to
}

const sidebarState = reactive<SidebarState>({
  panel: 'main',
  mainItems: [],
  mainBottomItems: [],
  activeSpace: null,
  activeSpaceItems: [],
  spaceBackRoute: ''
})

export function useSidebar() {
  const setPanel = (panel: SidebarPanel) => {
    sidebarState.panel = panel
  }

  const setMainItems = (items: SidebarNavItem[], bottomItems: SidebarNavItem[] = []) => {
    sidebarState.mainItems = items
    sidebarState.mainBottomItems = bottomItems
  }

  // Enter a space - rotate to space panel
  const enterSpace = (spaceName: string, pageItems: SpaceNavItem[], backRoute: string) => {
    sidebarState.activeSpace = spaceName
    sidebarState.activeSpaceItems = pageItems
    sidebarState.spaceBackRoute = backRoute
    sidebarState.panel = 'space'
  }

  // Exit space - rotate back to main panel
  const exitSpace = () => {
    sidebarState.activeSpace = null
    sidebarState.activeSpaceItems = []
    sidebarState.panel = 'main'
  }

  return {
    state: sidebarState,
    setPanel,
    setMainItems,
    enterSpace,
    exitSpace,
  }
}
