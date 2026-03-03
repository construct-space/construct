/**
 * Construct SDK Provider
 *
 * Exposes host app stores, composables, and utilities to space IIFE bundles
 * via window.__CONSTRUCT__['@construct/sdk'].
 *
 * Space builds externalize '@construct/sdk' → this global.
 * Auto-import generates: import { useProjectStore } from '@construct/sdk'
 * Rollup maps to: window.__CONSTRUCT__["@construct/sdk"].useProjectStore
 */

// === Stores (host-owned only — domain stores live in their respective spaces) ===
export { useAuthStore } from '@/stores/auth'
export { useNotificationsStore } from '@/stores/notifications'
export { usePanelsStore } from '@/stores/panels'
export {
  usePinnedStore,
  createFolderPin,
  createLinkPin,
  createPagePin,
  createProjectPin,
  createSpacePin,
  createTaskPin,
} from '@/stores/pinned'
export { usePreferencesStore } from '@/stores/preferences'
export { useProjectStore } from '@/stores/project'
export { useSettingsStore } from '@/stores/settings'
export { useTranslationsStore } from '@/stores/translations'

// === Composables ===
export { useAIModel, isVisionModel } from '@/composables/useAIModel'
export { useAnthropicOAuth } from '@/composables/useAnthropicOAuth'
export { useApi } from '@/composables/useApi'
export { useApiHealth } from '@/composables/useApiHealth'
export { useAppMenu } from '@/composables/useAppMenu'
export { useAppTheme, appThemes } from '@/composables/useAppTheme'
export { useAssistant } from '@/composables/useAssistant'
export { useAuth } from '@/composables/useAuth'
export { useAuthorization } from '@/composables/useAuthorization'
export { useBilling } from '@/composables/useBilling'
export {
  useCanvasContext,
  clearCanvasContext,
  getCanvasContextForPrompt,
  getDesignByName,
  getDesignForCodeGeneration,
  listAvailableDesigns,
  registerDesign,
  setCanvasContext,
} from '@/composables/useCanvasContext'
export { useChatPanel } from '@/composables/useChatPanel'
export { useConstructAuth } from '@/composables/useConstructAuth'
export { useContextDB } from '@/composables/useContextDB'
export {
  useContextService,
  useContextMode,
  useComponentContext,
} from '@/composables/useContextService'
export { useCredits } from '@/composables/useCredits'
export { useDateFormat } from '@/composables/useDateFormat'
export { useDeepLink } from '@/composables/useDeepLink'
export {
  useDesignActions,
  consumeDesignActions,
  parseToolResult,
  queueDesignAction,
} from '@/composables/useDesignActions'
export { useDraggableWindow } from '@/composables/useDraggableWindow'
export { useDropdownPosition } from '@/composables/useDropdownPosition'
export { useFreepikApi } from '@/composables/useFreepikApi'
export {
  useGoogleFonts,
  isFontLoaded,
  loadGoogleFont,
  preloadCachedFonts,
  searchFonts,
  POPULAR_FONTS,
} from '@/composables/useGoogleFonts'
export { useMarkdown, renderMarkdown, renderStreamingMarkdown } from '@/composables/useMarkdown'
export { showContextMenu } from '@/composables/useNativeContextMenu'
export { useNotifications } from '@/composables/useNotifications'
export { usePanelLayout, PRESET_LAYOUTS } from '@/composables/usePanelLayout'
export { usePanelResize } from '@/composables/usePanelResize'
export { usePanels } from '@/composables/usePanels'
export { usePermissions } from '@/composables/usePermissions'
export { useProjectContext } from '@/composables/useProjectContext'
export { useProjectDirectory } from '@/composables/useProjectDirectory'
export { useRoundRobin } from '@/composables/useRoundRobin'
export {
  useShortcutStore,
  getKey,
  setKey,
  resetKey,
  resetAll,
  hasOverride,
  exportJson,
  importJson,
  SHORTCUT_REGISTRY,
} from '@/composables/useShortcutStore'
export { useSidebar } from '@/composables/useSidebar'
export { useSkills } from '@/composables/useSkills'
export { useSpaceContext } from '@/composables/useSpaceContext'
export { useSpaceMarketplace } from '@/composables/useSpaceMarketplace'
export { useSpaceShortcuts } from '@/composables/useSpaceShortcuts'
export { useSpaces } from '@/composables/useSpaces'
export {
  useStorage,
  migrateFromLocalStorage,
  migratePinnedItems,
} from '@/composables/useStorage'
export { useTauriContext } from '@/composables/useTauriContext'
export { useToast } from '@/composables/useToast'
export { useToolbar } from '@/composables/useToolbar'
export {
  useTranslation,
  SUPPORTED_LANGUAGES,
} from '@/composables/useTranslation'
export { useUpdater } from '@/composables/useUpdater'
export { useUserModule } from '@/composables/useUserModule'

// === UI Components ===
export { default as Accordion } from '@/components/ui/Accordion.vue'
export { default as Avatar } from '@/components/ui/Avatar.vue'
export { default as Badge } from '@/components/ui/Badge.vue'
export { default as Button } from '@/components/ui/Button.vue'
export { default as Card } from '@/components/ui/Card.vue'
export { default as Checkbox } from '@/components/ui/Checkbox.vue'
export { default as ContextMenu } from '@/components/ui/ContextMenu.vue'
export { default as DashboardPanel } from '@/components/ui/DashboardPanel.vue'
export { default as Dropdown } from '@/components/ui/Dropdown.vue'
export { default as DropdownMenu } from '@/components/ui/DropdownMenu.vue'
export { default as DropdownMenuItem } from '@/components/ui/DropdownMenuItem.vue'
export { default as FormField } from '@/components/ui/FormField.vue'
export { default as Icon } from '@/components/ui/Icon.vue'
export { default as Input } from '@/components/ui/Input.vue'
export { default as Modal } from '@/components/ui/Modal.vue'
export { default as Pagination } from '@/components/ui/Pagination.vue'
export { default as PanelSection } from '@/components/ui/PanelSection.vue'
export { default as Popover } from '@/components/ui/Popover.vue'
export { default as ScrollArea } from '@/components/ui/ScrollArea.vue'
export { default as Select } from '@/components/ui/Select.vue'
export { default as SelectMenu } from '@/components/ui/SelectMenu.vue'
export { default as Slideover } from '@/components/ui/Slideover.vue'
export { default as Slider } from '@/components/ui/Slider.vue'
export { default as Switch } from '@/components/ui/Switch.vue'
export { default as Tabs } from '@/components/ui/Tabs.vue'
export { default as Textarea } from '@/components/ui/Textarea.vue'
export { default as Toast } from '@/components/ui/Toast.vue'
export { default as Tooltip } from '@/components/ui/Tooltip.vue'

// === Common Components ===
export { default as ConfirmationModal } from '@/components/common/ConfirmationModal.vue'
export { default as SplitPane } from '@/components/panels/SplitPane.vue'

// === Space Context Bus ===
export {
  publishSpaceContext,
  subscribeSpaceContext,
  getLatestSpaceContext,
  registerContextHandler,
  requestSpaceData,
} from '@/lib/spaceContextBus'
export type {
  SpaceContextPayload,
  SpaceContextCallback,
  ContextHandler,
} from '@/lib/spaceContextBus'

// === Utilities ===
export { appConfig } from '@/utils/config'
export { db, deleteDatabase } from '@/utils/db'
export { isTauriEnv } from '@/utils/tauri'
export { randomFrom, randomInt } from '@/utils/index'
