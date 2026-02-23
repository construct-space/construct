# Unified SQLite Storage Plan

## Overview
Centralize all frontend storage (localStorage, IndexedDB) into a single SQLite database managed by the Go context service, with periodic sync to the API server.

## Current State

### localStorage Keys (22 total)
| Key | Type | Files |
|-----|------|-------|
| `construct_auth` | JSON (user, token, roleId) | stores/auth.ts |
| `auth_token` | String | useApi.ts, useContextService.ts |
| `construct_projects_root` | String (path) | useProjectDirectory.ts |
| `construct-editor-${projectId}` | String (path) | code/pages/*.vue |
| `panel-layout-${space}` | JSON (panels config) | usePanelLayout.ts |
| `panel-layout-${projectId}-${space}` | JSON | stores/panels.ts |
| `app-theme-id` | String | useAppTheme.ts |
| `app-default-ai-model` | String | useAIModel.ts |
| `admin-translation-preferences` | JSON | useTranslation.ts |
| `selected_dashboard` | String | useDashboardState.ts |
| `construct_pinned_items` | JSON array | stores/pinned.ts |
| `construct_ai_conversations` | JSON (Map) | AssistantFloat.vue |
| `${tableName}TableColumnVisibility` | JSON | BaseTable.vue |
| `${storageKey}` (window state) | JSON | useDraggableWindow.ts |

### IndexedDB (Dexie)
| Table | Schema | Files |
|-------|--------|-------|
| `ui_designs` | id, localId, projectId, name, nodes, pages, viewport, history | useLocalDesigns.ts |
| `project_settings` | projectId, localPath, updatedAt | project.ts, settings.vue |

### Existing SQLite Tables
- `conversations` - chat history
- `messages` - chat messages
- `context_state` - app context (singleton)
- `token_usage` - token metrics
- `auth_tokens` - auth tokens (just added)

## New Unified Schema

```sql
-- Generic key-value store for settings/preferences
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    user_id TEXT,
    project_id INTEGER,
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kv_category ON kv_store(category);
CREATE INDEX IF NOT EXISTS idx_kv_user ON kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_kv_project ON kv_store(project_id);

-- UI Designs (migrate from IndexedDB)
CREATE TABLE IF NOT EXISTS ui_designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_id TEXT UNIQUE NOT NULL,
    project_id INTEGER,
    name TEXT NOT NULL,
    nodes_json TEXT,
    pages_json TEXT,
    viewport_json TEXT,
    history_json TEXT,
    history_index INTEGER DEFAULT 0,
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_designs_project ON ui_designs(project_id);
CREATE INDEX IF NOT EXISTS idx_designs_local_id ON ui_designs(local_id);

-- Project local settings (migrate from IndexedDB)
CREATE TABLE IF NOT EXISTS project_local_settings (
    project_id INTEGER PRIMARY KEY,
    local_path TEXT,
    editor_path TEXT,
    synced_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pinned items
CREATE TABLE IF NOT EXISTS pinned_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    path TEXT,
    color TEXT,
    metadata_json TEXT,
    sort_order INTEGER DEFAULT 0,
    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync queue for offline changes
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    data_json TEXT,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);
```

## API Endpoints to Add (Go Context Service)

```go
// Key-Value Store
case "storage.get":      // Get single value
case "storage.set":      // Set single value
case "storage.delete":   // Delete key
case "storage.list":     // List keys by category
case "storage.batch_get": // Get multiple keys
case "storage.batch_set": // Set multiple keys

// UI Designs
case "designs.list":     // List designs for project
case "designs.get":      // Get single design
case "designs.save":     // Create/update design
case "designs.delete":   // Delete design

// Project Settings
case "project_settings.get":
case "project_settings.set":

// Pinned Items
case "pinned.list":
case "pinned.add":
case "pinned.remove":
case "pinned.reorder":

// Sync
case "sync.status":      // Get sync status
case "sync.push":        // Push local changes to API
case "sync.pull":        // Pull changes from API
case "sync.queue":       // Get pending sync items
```

## Frontend Composable: useStorage()

```typescript
// Drop-in replacement for localStorage
const storage = useStorage()

// Simple key-value (like localStorage)
await storage.get('key')
await storage.set('key', value)
await storage.remove('key')

// Categorized storage
await storage.get('key', { category: 'ui', projectId: 123 })

// Batch operations
await storage.getMany(['key1', 'key2'])
await storage.setMany({ key1: val1, key2: val2 })

// Reactive (auto-updates when changed)
const theme = storage.reactive('app-theme-id', 'default')
```

## Migration Strategy

1. **Phase 1**: Add new tables and API endpoints (non-breaking)
2. **Phase 2**: Create `useStorage()` composable
3. **Phase 3**: Migrate each localStorage usage one by one
4. **Phase 4**: Migrate IndexedDB (ui_designs, project_settings)
5. **Phase 5**: Remove old Dexie dependency
6. **Phase 6**: Implement API sync

## API Sync Flow

```
[Local SQLite] ←→ [Go Context Service] ←→ [Construct API]
                         ↓
                   [Sync Queue]
                         ↓
              (Periodic background sync)
```

### Sync Endpoints (API side)
- `POST /sync/push` - Push local changes
- `GET /sync/pull?since=timestamp` - Pull server changes
- `GET /sync/status` - Get sync status

### Sync Categories
| Category | Sync Direction | Frequency |
|----------|---------------|-----------|
| auth_tokens | Local only | Never |
| ui_designs | Bidirectional | On save + periodic |
| pinned_items | Bidirectional | On change |
| preferences | Bidirectional | On change |
| conversations | Bidirectional | Periodic |

## File Changes

### Go Context Service
- `storage.go` - Add new tables and methods
- `main.go` - Add new API handlers
- `sync.go` (new) - Sync logic with API

### Frontend
- `composables/useStorage.ts` (new) - Unified storage composable
- `utils/db.ts` - Deprecate, migrate to useStorage
- `stores/auth.ts` - Use useStorage
- `stores/pinned.ts` - Use useStorage
- All localStorage usages - Migrate to useStorage
