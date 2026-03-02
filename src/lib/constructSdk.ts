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

// === Stores ===
export { useActivitiesStore } from '@/stores/activities'
export { useAuthStore } from '@/stores/auth'
export { useAuthorizationStore } from '@/stores/authorization'
export { useConversationsStore } from '@/stores/conversations'
export { useDocumentsStore } from '@/stores/documents'
export { useEventsStore } from '@/stores/events'
export { useNotesStore, NOTE_COLORS } from '@/stores/notes'
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
export { usePRDsStore } from '@/stores/prds'
export { useProjectStore } from '@/stores/project'
export { useSettingsStore } from '@/stores/settings'
export { useTasksStore, TASK_PRIORITIES, TASK_STATUSES } from '@/stores/tasks'
export { useTranslationsStore } from '@/stores/translations'
export { useUsersStore } from '@/stores/users'

// === Composables ===
export { useAICompletion } from '@/composables/useAICompletion'
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
export { useDashboard } from '@/composables/useDashboard'
export { useDashboardState } from '@/composables/useDashboardState'
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
export { getLucideIconUrl, hasLucideIcon, searchLucideIcons } from '@/composables/useLucideIcons'
export { useMarkdown, renderMarkdown, renderStreamingMarkdown } from '@/composables/useMarkdown'
export { useMonaco } from '@/composables/useMonaco'
export {
  useMonacoTheme,
  customThemes,
  registerMonacoThemes,
} from '@/composables/useMonacoThemes'
export { showContextMenu } from '@/composables/useNativeContextMenu'
export { useNotifications } from '@/composables/useNotifications'
export { usePanelLayout, PRESET_LAYOUTS } from '@/composables/usePanelLayout'
export { usePanelResize } from '@/composables/usePanelResize'
export { usePanels } from '@/composables/usePanels'
export { usePermissions } from '@/composables/usePermissions'
export { useProjectContext } from '@/composables/useProjectContext'
export { useProjectDirectory } from '@/composables/useProjectDirectory'
export { useProjectsView } from '@/composables/useProjectsView'
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

// === Utilities ===
export { appConfig } from '@/utils/config'
export { db, deleteDatabase } from '@/utils/db'
export { isTauriEnv } from '@/utils/tauri'
export { randomFrom, randomInt } from '@/utils/index'
