# Spaces Marketplace & Remote Installation Plan

## Overview

Enable spaces and the context service (Go backend) to exist as separate repositories, installable remotely via a marketplace UI. Users start at the dashboard, browse/search available spaces, install them, and they appear in the sidebar immediately.

This plan covers three separations:
1. **Spaces as separate repos** — each space is its own Git repository
2. **Context service as a separate repo** — the Go backend becomes independently distributable
3. **Marketplace UI** — browse, search, install, uninstall, update

---

## Current Architecture (What We Have)

### Spaces (Vue Frontend)
- **11 hardcoded spaces** in `src/spaces/` — code, design, kanban, chat, architect, ai, docs, notes, git, calendar, terminal
- **Static imports** in `src/composables/useSpaces.ts` (lines 6-16) — each space imported directly
- **Static routes** in `src/router/routes.ts` (lines 4-80) — `spaceRoutes` array with hardcoded `import()` paths
- **SpaceConfig interface** in `useSpaces.ts` (line 36) — name, displayName, description, icon, scope, pages, toolbar, navigation, permission
- **Project.spaces** in `src/stores/project.ts` — array of enabled space name strings per project

### Skills System (Go Backend)
- **SkillManifest** in `context/skills/types.go` (line 166) — id, name, category, description, version, author, homepage, dependencies, permissions, config
- **SkillMarkdown** in `context/skills/loader.go` (line 228) — YAML frontmatter + markdown body, already supports loading from any directory via `loadMarkdownFromDir()`
- **Loader.AddSearchPath()** in `context/skills/loader.go` (line 52) — adds directories to scan for skills
- **SkillPermissions** in `context/skills/types.go` (line 110) — canRegisterHooks, canProvideTools, canAccessNetwork, canAccessFilesystem, allowedHookTypes, blockedHookTypes
- **Progressive loading** — summaries (~100 tokens each), full content on-demand
- **Relevance search** — keyword + tool name matching with scoring

### Context Service (Go Backend)
- **Single binary** at `context/main.go` — TCP server on localhost:9999
- **SQLite DB** at `~/.construct/context.db`
- **Handlers** dispatched by prefix: `skills.*`, `hooks.*`, `ai.*`, `rag.*`, `mcp.*`, etc.
- **Embedded builtins** via `//go:embed builtin/*.md` in `context/skills/loader.go` (line 20)
- **KV store** for settings persistence — `kv_store` table with category + userID + companyID scoping

---

## Part 1: Space Package Format

### 1.1 Space Manifest (`space.manifest.json`)

Every space repo must have this file at root. It combines `SpaceConfig` metadata with registry/distribution fields.

```json
{
  "$schema": "https://construct.dev/schemas/space-manifest-v1.json",
  "id": "analytics",
  "name": "Analytics",
  "version": "1.2.0",
  "description": "Project analytics, code metrics, and team insights",
  "author": {
    "name": "Flaker Rimi",
    "email": "flaker@example.com",
    "url": "https://github.com/flakerimi"
  },
  "repository": "https://github.com/construct-spaces/analytics",
  "license": "MIT",
  "icon": "i-lucide-bar-chart-3",
  "scope": "project",
  "minConstructVersion": "0.2.0",

  "navigation": {
    "label": "Analytics",
    "icon": "i-lucide-bar-chart-3",
    "to": "analytics",
    "order": 55
  },

  "pages": [
    {
      "path": "",
      "label": "Dashboard",
      "icon": "i-lucide-layout-dashboard",
      "default": true,
      "component": "pages/index.vue"
    },
    {
      "path": "metrics",
      "label": "Metrics",
      "icon": "i-lucide-activity",
      "component": "pages/metrics.vue"
    }
  ],

  "toolbar": [
    {
      "id": "analytics-refresh",
      "icon": "i-lucide-refresh-cw",
      "label": "Refresh",
      "action": "refresh-analytics"
    }
  ],

  "agent": "agent.md",
  "skills": ["skill.md"],

  "dependencies": {
    "spaces": [],
    "skills": []
  },

  "permissions": {
    "canAccessNetwork": false,
    "canAccessFilesystem": true,
    "canRegisterHooks": true,
    "canProvideTools": true
  },

  "screenshots": [
    "screenshots/dashboard.png",
    "screenshots/metrics.png"
  ],

  "keywords": ["analytics", "metrics", "insights", "code-quality", "team"]
}
```

### 1.2 Space Repo Structure

```
construct-space-analytics/            # A standalone space repo
├── space.manifest.json               # REQUIRED: manifest (see above)
├── agent.md                          # OPTIONAL: custom agent (YAML frontmatter + instructions)
├── skill.md                          # OPTIONAL: skill with tools/hooks
├── pages/                            # OPTIONAL: Vue SFC pages
│   ├── index.vue                     #   Default page
│   └── metrics.vue                   #   Sub-page
├── components/                       # OPTIONAL: space-specific Vue components
│   └── MetricsChart.vue
├── composables/                      # OPTIONAL: space-specific composables
│   └── useAnalytics.ts
├── types.ts                          # OPTIONAL: TypeScript types
├── screenshots/                      # OPTIONAL: for marketplace listing
│   ├── dashboard.png
│   └── metrics.png
├── README.md                         # OPTIONAL: documentation
└── CHANGELOG.md                      # OPTIONAL: version history
```

### 1.3 Two Space Tiers

| Tier | Has Custom UI (Vue) | Complexity | Install Method |
|------|---------------------|------------|----------------|
| **Config-only** | No — uses generic space renderer | Low | Download manifest + agent.md only |
| **Full** | Yes — ships pre-compiled Vue bundle | Medium | Download + extract compiled assets |

**Phase 1 implements Config-only.** A generic space page renderer displays content driven by the agent. This already works — the chat/ai spaces are essentially this pattern.

**Phase 2 implements Full.** Spaces ship as pre-compiled JS bundles loaded via dynamic `import()`.

---

## Part 2: Context Service as Separate Repo

### 2.1 Why Separate

The Go context service (`context/`) is already a standalone TCP server with its own `go.mod`. Separating it:
- Allows independent versioning and releases
- Enables the context service to be updated without rebuilding the Tauri app
- Opens the door for context service plugins/extensions from third parties
- Allows headless/CLI usage without the Vue frontend

### 2.2 Context Repo Structure

```
construct-context/                    # Separate repository
├── main.go                           # TCP server entry point
├── go.mod                            # Go module (already exists)
├── go.sum
├── Makefile                          # Build targets per platform
├── version.go                        # Version info, injected at build time
│
├── svc/                              # Core service layer
│   ├── service.go                    # Service struct, initialization
│   ├── storage.go                    # SQLite schema + operations
│   ├── types.go                      # Request/Response, Context types
│   ├── config.go                     # Configuration
│   └── skills_service.go             # Skill runtime management
│
├── handlers/                         # Request handlers
│   ├── system.go                     # system.*, context.*, agent.*
│   ├── ai.go                         # ai.*, code.complete
│   ├── conversation.go               # conversation.*
│   ├── storage.go                    # kv.*, storage.*, designs.*
│   ├── auth.go                       # auth.*, user.*, settings.*
│   ├── hooks_skills.go               # hooks.*, skills.*
│   ├── spaces.go                     # spaces.* (NEW — marketplace handlers)
│   └── rag.go                        # rag.*
│
├── agents/                           # Agent system
│   ├── builtin/                      # Built-in agent .md files
│   ├── custom/                       # User-defined agents
│   ├── conductor.go
│   ├── registry.go
│   └── specialized.go
│
├── skills/                           # Skills/extension system
│   ├── types.go
│   ├── registry.go
│   ├── loader.go
│   └── builtin/                      # Built-in skill .md files
│
├── providers/                        # LLM providers
├── rag/                              # RAG system
├── hooks/                            # Hook system
├── mcp/                              # Model Context Protocol
├── tools/                            # Tool implementations
│
├── spaces/                           # NEW: Space management
│   ├── manager.go                    # Install, uninstall, update lifecycle
│   ├── registry_client.go            # HTTP client for remote registry
│   ├── validator.go                  # Manifest validation, permission checks
│   ├── downloader.go                 # Git clone / tarball download
│   └── installed/                    # Runtime: installed space data
│
└── releases/                         # Build artifacts
    ├── darwin-arm64/
    ├── darwin-amd64/
    ├── linux-amd64/
    └── windows-amd64/
```

### 2.3 Context Service Versioning

```go
// version.go
package main

var (
    Version   = "dev"     // Set via -ldflags at build time
    Commit    = "unknown"
    BuildDate = "unknown"
)
```

The Tauri app embeds a compatible context binary. On startup, it checks if a newer context binary exists at `~/.construct/bin/context` and uses that if the version is compatible.

### 2.4 Context Service Communication Protocol

No changes needed — the existing TCP JSON protocol remains:

```
Vue → Tauri (invoke) → Go (TCP :9999)
Request:  { "id": "uuid", "type": "spaces.install", "payload": {...} }
Response: { "id": "uuid", "success": true, "data": {...} }
```

### 2.5 Migration Steps

1. Copy `context/` to new repo `construct-context`
2. Update `go.mod` module path to `github.com/construct-app/construct-context`
3. Add `Makefile` with build targets: `make build-darwin-arm64`, `make build-linux-amd64`, etc.
4. Add `version.go` with ldflags injection
5. In the main repo, replace `context/` with a git submodule or download the binary at build time
6. Update `src-tauri/src/lib.rs` to look for context binary at:
   - First: `~/.construct/bin/context` (user-updated version)
   - Fallback: bundled binary in app resources

---

## Part 3: Installation Infrastructure (Go Backend)

### 3.1 Local Storage Layout

Installed spaces live under `~/.construct/spaces/`:

```
~/.construct/
├── context.db                        # SQLite database
├── bin/
│   └── context                       # Context service binary (if updated separately)
├── spaces/                           # Installed spaces directory
│   ├── registry.json                 # Local cache of remote registry
│   ├── analytics/                    # Installed space
│   │   ├── space.manifest.json
│   │   ├── agent.md
│   │   ├── skill.md
│   │   ├── pages/                    # (Phase 2: compiled Vue components)
│   │   └── .space-meta.json          # Install metadata (installed_at, source, version, checksum)
│   └── crm/
│       ├── space.manifest.json
│       ├── agent.md
│       └── .space-meta.json
├── logs/
│   └── context.log
└── mcp.json
```

### 3.2 Space Meta File (`.space-meta.json`)

Created during installation, tracks provenance:

```json
{
  "installed_at": "2026-02-23T14:30:00Z",
  "updated_at": "2026-02-23T14:30:00Z",
  "source": {
    "type": "registry",
    "registry_url": "https://registry.construct.dev",
    "repository": "https://github.com/construct-spaces/analytics",
    "commit": "abc123f",
    "tarball_url": "https://registry.construct.dev/spaces/analytics/1.2.0.tar.gz",
    "checksum": "sha256:abcdef1234567890..."
  },
  "version": "1.2.0",
  "enabled": true,
  "installed_by": "user:42"
}
```

### 3.3 New Go Package: `spaces/manager.go`

File: `context/spaces/manager.go`

```go
package spaces

// SpaceManager handles the lifecycle of installable spaces
type SpaceManager struct {
    spacesDir    string              // ~/.construct/spaces/
    installed    map[string]*InstalledSpace
    registry     *RegistryClient
    mu           sync.RWMutex
}

type InstalledSpace struct {
    Manifest  *SpaceManifest  `json:"manifest"`
    Meta      *SpaceMeta      `json:"meta"`
    LocalPath string          `json:"localPath"`
}

// Core operations:
func (m *SpaceManager) Init() error                                    // Scan spacesDir, load all installed
func (m *SpaceManager) ListInstalled() []*InstalledSpace               // Return all installed spaces
func (m *SpaceManager) GetInstalled(spaceID string) *InstalledSpace    // Get specific installed space
func (m *SpaceManager) Install(ctx context.Context, req InstallRequest) error  // Download + validate + store
func (m *SpaceManager) Uninstall(ctx context.Context, spaceID string) error    // Remove from disk
func (m *SpaceManager) Update(ctx context.Context, spaceID string) error       // Re-download latest version
func (m *SpaceManager) Enable(spaceID string) error                    // Toggle .space-meta.json enabled=true
func (m *SpaceManager) Disable(spaceID string) error                   // Toggle .space-meta.json enabled=false
func (m *SpaceManager) Validate(manifest *SpaceManifest) []string      // Validate manifest, return issues
```

### 3.4 New Go Package: `spaces/registry_client.go`

File: `context/spaces/registry_client.go`

```go
package spaces

// RegistryClient fetches space listings from the remote registry
type RegistryClient struct {
    baseURL    string    // https://registry.construct.dev or GitHub raw URL
    httpClient *http.Client
    cache      *RegistryCache
}

type RegistryEntry struct {
    ID          string   `json:"id"`
    Name        string   `json:"name"`
    Description string   `json:"description"`
    Version     string   `json:"version"`
    Author      Author   `json:"author"`
    Icon        string   `json:"icon"`
    Repository  string   `json:"repository"`
    Downloads   int      `json:"downloads"`
    Stars       int      `json:"stars"`
    Keywords    []string `json:"keywords"`
    Category    string   `json:"category"`
    Screenshots []string `json:"screenshots"`
    CreatedAt   string   `json:"createdAt"`
    UpdatedAt   string   `json:"updatedAt"`
}

type RegistrySearchResult struct {
    Entries    []RegistryEntry `json:"entries"`
    Total      int             `json:"total"`
    Page       int             `json:"page"`
    PerPage    int             `json:"perPage"`
}

// Core operations:
func (c *RegistryClient) ListAll() ([]RegistryEntry, error)                          // GET /spaces
func (c *RegistryClient) Search(query string, category string) (*RegistrySearchResult, error)  // GET /spaces/search?q=...&category=...
func (c *RegistryClient) GetEntry(spaceID string) (*RegistryEntry, error)             // GET /spaces/{id}
func (c *RegistryClient) GetManifest(spaceID string) (*SpaceManifest, error)          // GET /spaces/{id}/manifest
func (c *RegistryClient) DownloadURL(spaceID, version string) (string, error)         // GET /spaces/{id}/download
func (c *RegistryClient) RefreshCache() error                                          // Refresh local registry.json cache
```

### 3.5 New Go Package: `spaces/downloader.go`

File: `context/spaces/downloader.go`

```go
package spaces

// Download methods (try in order):
// 1. Tarball from registry (fastest)
// 2. Git clone with --depth=1 (fallback)
// 3. GitHub API archive download (alternative)

func (m *SpaceManager) downloadFromTarball(url, destDir string) error
func (m *SpaceManager) downloadFromGit(repoURL, destDir string) error
func (m *SpaceManager) downloadFromGitHub(owner, repo, destDir string) error
```

### 3.6 New Go Package: `spaces/validator.go`

File: `context/spaces/validator.go`

Validates a space manifest before installation:

```go
func ValidateManifest(manifest *SpaceManifest) []ValidationError {
    // Required fields: id, name, version, description, navigation
    // ID format: lowercase alphanumeric + hyphens, 3-50 chars
    // Version: valid semver
    // No collision with built-in space names: code, design, kanban, chat, etc.
    // Permission sanity: canAccessNetwork=true requires explicit user approval
    // Pages: at least one page with default=true
    // Icon: valid Lucide icon name format
}
```

### 3.7 New Handler: `handlers/spaces.go`

File: `context/handlers/spaces.go`

New request types routed via `spaces.*` prefix in `main.go`:

```go
func HandleSpaces(s *svc.Service, req svc.Request) svc.Response {
    switch req.Type {
    case "spaces.list_installed":     // List all installed spaces
    case "spaces.list_remote":        // List available spaces from registry
    case "spaces.search":             // Search remote registry
    case "spaces.get_remote":         // Get details for a specific remote space
    case "spaces.install":            // Download + install a space
    case "spaces.uninstall":          // Remove an installed space
    case "spaces.update":             // Update an installed space to latest
    case "spaces.enable":             // Enable an installed space
    case "spaces.disable":            // Disable an installed space
    case "spaces.check_updates":      // Check for available updates
    case "spaces.get_manifest":       // Read manifest of an installed space
    }
}
```

Add to `main.go` dispatch:

```go
// In dispatch() function, add before the default case:
case strings.HasPrefix(req.Type, "spaces."):
    return handlers.HandleSpaces(s, req)
```

---

## Part 4: Vue Frontend Changes

### 4.1 New Composable: `src/composables/useSpaceMarketplace.ts`

```typescript
export interface RemoteSpace {
  id: string
  name: string
  description: string
  version: string
  author: { name: string; email?: string; url?: string }
  icon: string
  repository: string
  downloads: number
  stars: number
  keywords: string[]
  category: string
  screenshots: string[]
}

export interface InstalledSpace {
  manifest: SpaceManifest
  meta: {
    installed_at: string
    updated_at: string
    version: string
    enabled: boolean
    source: { type: string; repository: string }
  }
  localPath: string
  hasUpdate: boolean
  latestVersion?: string
}

export function useSpaceMarketplace() {
  const installed = ref<InstalledSpace[]>([])
  const remote = ref<RemoteSpace[]>([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const selectedCategory = ref<string | null>(null)

  // Remote registry
  const fetchRemote = async () => { /* invoke spaces.list_remote */ }
  const searchRemote = async (query: string, category?: string) => { /* invoke spaces.search */ }
  const getRemoteDetails = async (spaceId: string) => { /* invoke spaces.get_remote */ }

  // Installed management
  const fetchInstalled = async () => { /* invoke spaces.list_installed */ }
  const install = async (spaceId: string) => { /* invoke spaces.install */ }
  const uninstall = async (spaceId: string) => { /* invoke spaces.uninstall — with confirm */ }
  const update = async (spaceId: string) => { /* invoke spaces.update */ }
  const enable = async (spaceId: string) => { /* invoke spaces.enable */ }
  const disable = async (spaceId: string) => { /* invoke spaces.disable */ }
  const checkUpdates = async () => { /* invoke spaces.check_updates */ }

  // Computed
  const isInstalled = (spaceId: string) => boolean
  const installedCount = computed(() => installed.value.length)
  const categories = computed(() => unique list from remote entries)

  return { installed, remote, isLoading, searchQuery, selectedCategory, ... }
}
```

### 4.2 Modify `src/composables/useSpaces.ts`

Change from static imports to hybrid loading (built-in + installed):

```typescript
// BEFORE (current):
import codeSpace from '~/spaces/code/space.config'
// ... 10 more static imports
const allSpaces: SpaceConfig[] = [ codeSpace, designSpace, ... ]

// AFTER:
import { builtinSpaces } from '~/spaces/builtin'  // Move all 11 to a barrel export

export function useSpaces() {
  const spaces = ref<SpaceConfig[]>([])

  const loadSpaces = async () => {
    // 1. Load built-in spaces (always available)
    const builtin = builtinSpaces

    // 2. Load installed spaces from context service
    let installed: SpaceConfig[] = []
    try {
      const result = await invoke<{ spaces: InstalledSpaceConfig[] }>('send_context_request', {
        requestType: 'spaces.list_installed',
        payload: {},
      })
      installed = (result.spaces || [])
        .filter(s => s.meta.enabled)
        .map(s => manifestToSpaceConfig(s.manifest))
    } catch (e) {
      console.warn('[useSpaces] Failed to load installed spaces:', e)
    }

    // 3. Merge and sort
    spaces.value = [...builtin, ...installed]
      .sort((a, b) => (a.navigation.order || 0) - (b.navigation.order || 0))
  }

  // ... rest stays the same
}

// Convert manifest to SpaceConfig
function manifestToSpaceConfig(manifest: SpaceManifest): SpaceConfig {
  return {
    name: manifest.id,
    displayName: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    scope: manifest.scope || 'project',
    pages: manifest.pages.map(p => ({
      path: p.path,
      label: p.label,
      icon: p.icon,
      default: p.default,
    })),
    toolbar: manifest.toolbar || [],
    navigation: manifest.navigation,
  }
}
```

### 4.3 Modify `src/router/routes.ts`

Add a catch-all dynamic route for installed spaces:

```typescript
// Keep existing spaceRoutes for built-in spaces (they have specific component imports)

// Add after the static spaceRoutes spread:
// Dynamic route for installed spaces — uses a generic renderer
{
  path: ':spaceName',
  component: () => import('@/spaces/_dynamic/DynamicSpacePage.vue'),
  props: true,
  beforeEnter: (to) => {
    // Only allow if spaceName matches an installed space
    // Reject if it matches a built-in space (those have their own routes)
    const builtinNames = ['code', 'design', 'kanban', 'terminal', 'calendar', 'git', 'docs', 'notes', 'chat', 'architect', 'ai']
    if (builtinNames.includes(to.params.spaceName as string)) {
      return false // Let the static route handle it
    }
    return true
  },
},
{
  path: ':spaceName/:subPage',
  component: () => import('@/spaces/_dynamic/DynamicSpacePage.vue'),
  props: true,
},
```

### 4.4 New Component: `src/spaces/_dynamic/DynamicSpacePage.vue`

A generic renderer for installed spaces that don't have custom Vue components (Config-only tier):

```vue
<!-- Renders installed space pages using the agent + chat pattern -->
<!-- Props: spaceName, subPage (optional) -->
<!-- Layout: space header + agent-powered chat/content area -->
<!-- Loads manifest from installed space to determine page layout -->
<!-- Uses the space's agent.md for AI-powered content -->
```

This component:
1. Reads the space manifest to get page info (title, icon, toolbar)
2. Loads the space's agent for AI interactions
3. Renders a standard layout: header bar + content area + chat panel
4. For Config-only spaces, content is driven by the agent (similar to chat/ai spaces)

### 4.5 New Page: `src/pages/MarketplacePage.vue`

Main marketplace UI accessible from dashboard and sidebar.

**Route:** `/app/marketplace`

**Layout:**
```
┌──────────────────────────────────────────────────┐
│  Marketplace                          Search [___]│
├──────────────────────────────────────────────────┤
│ Categories:  All | Development | Analytics |      │
│              Design | AI | Integration | Comm     │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ [icon]   │ │ [icon]   │ │ [icon]   │         │
│  │ Analytics│ │ CRM      │ │ Database │         │
│  │ v1.2.0   │ │ v2.0.1   │ │ v1.0.0   │         │
│  │ ★ 4.8    │ │ ★ 4.5    │ │ ★ 4.2    │         │
│  │ 342 DLs  │ │ 128 DLs  │ │ 89 DLs   │         │
│  │[Install] │ │[Install] │ │[Installed]│         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ ...      │ │ ...      │ │ ...      │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                   │
└──────────────────────────────────────────────────┘
```

**Space Detail View (click a card):**
```
┌──────────────────────────────────────────────────┐
│  ← Back to Marketplace                            │
├──────────────────────────────────────────────────┤
│  [icon] Analytics                    [Install]    │
│  by Flaker Rimi · v1.2.0 · MIT · ★ 4.8          │
│  Project analytics, code metrics, and insights    │
├──────────────────────────────────────────────────┤
│  Screenshots:                                     │
│  [  screenshot1  ] [  screenshot2  ]              │
├──────────────────────────────────────────────────┤
│  Description (from README.md)                     │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  Permissions Requested:                           │
│  ✓ Filesystem access                              │
│  ✓ Register hooks                                 │
│  ✗ Network access                                 │
├──────────────────────────────────────────────────┤
│  Changelog:                                       │
│  v1.2.0 — Added team metrics dashboard            │
│  v1.1.0 — Code complexity analysis                │
│  v1.0.0 — Initial release                         │
└──────────────────────────────────────────────────┘
```

### 4.6 Dashboard Integration

Modify `src/pages/DashboardPage.vue` to add marketplace entry point:

```
Quick Actions section:
  [NEW PROJECT]  [BROWSE SPACES]
                  ↓
           /app/marketplace
```

### 4.7 Sidebar Integration

Installed spaces appear in the sidebar automatically after `useSpaces()` loads them. The existing `Sidebar3D` and `ProjectLayout.vue` already iterate over `spaces.value` — no changes needed there beyond what `useSpaces.ts` returns.

### 4.8 Settings Integration

Add "Installed Spaces" section to `src/pages/SettingsPage.vue` navigation:

```
AI:
  - AI Assistant
  - LLMs & Models
  - MCP Servers
  - Skills & Hooks
  - Spaces (NEW)       ← Manage installed spaces
  - Credits
```

New page `src/pages/settings/SpacesSettings.vue`:
- List installed spaces with enable/disable toggles
- Show version, author, install date
- Update available indicators
- Uninstall button (with confirmation)

---

## Part 5: Remote Registry

### 5.1 Phase 0: Static JSON File

Start with a single JSON file hosted on GitHub or a CDN:

**URL:** `https://raw.githubusercontent.com/construct-app/space-registry/main/registry.json`

```json
{
  "version": 1,
  "updated_at": "2026-02-23T12:00:00Z",
  "spaces": [
    {
      "id": "analytics",
      "name": "Analytics",
      "description": "Project analytics, code metrics, and team insights",
      "version": "1.2.0",
      "author": { "name": "Flaker Rimi" },
      "icon": "i-lucide-bar-chart-3",
      "repository": "https://github.com/construct-spaces/analytics",
      "downloads": 342,
      "stars": 48,
      "keywords": ["analytics", "metrics"],
      "category": "development",
      "screenshots": ["https://...screenshots/dashboard.png"]
    }
  ]
}
```

### 5.2 Phase 1: GitHub Organization as Registry

Each repo in `github.com/construct-spaces/` org is a space. The registry client uses GitHub API:

```
GET https://api.github.com/orgs/construct-spaces/repos → list spaces
GET https://raw.githubusercontent.com/construct-spaces/{id}/main/space.manifest.json → manifest
GET https://api.github.com/repos/construct-spaces/{id}/releases/latest → latest version
```

### 5.3 Phase 2: Dedicated Registry API

Full API when scale requires it:

```
GET    /api/v1/spaces                 → List spaces (paginated, filterable)
GET    /api/v1/spaces/search?q=...    → Full-text search
GET    /api/v1/spaces/:id             → Space details
GET    /api/v1/spaces/:id/manifest    → Download manifest
GET    /api/v1/spaces/:id/versions    → Version history
GET    /api/v1/spaces/:id/download    → Tarball download URL
POST   /api/v1/spaces                 → Publish space (authenticated)
GET    /api/v1/categories             → List categories
```

---

## Part 6: Security

### 6.1 Permission Model

When installing a space, the user sees requested permissions from the manifest:

```
Analytics wants to:
  ✓ Access project files (read-only)
  ✓ Register hooks (session events)
  ✗ Access the network
  ✗ Execute commands

  [Allow & Install]  [Cancel]
```

### 6.2 Manifest Validation

Before installation:
- Schema validation against JSON Schema
- ID collision check (no overwriting built-in spaces)
- Version format validation (semver)
- Permission escalation check (no filesystem+network combo without explicit approval)

### 6.3 Content Verification

- Tarball checksum (SHA-256) verified after download
- Optional GPG signature verification for registry-hosted spaces
- Git commit hash recorded in `.space-meta.json` for audit

### 6.4 Sandboxing

Installed space skills inherit the `SkillPermissions` from the manifest:
- `canAccessFilesystem: false` → skill tools cannot read/write files
- `canAccessNetwork: false` → skill tools cannot make HTTP requests
- `canRegisterHooks: true` → controlled via `allowedHookTypes`
- Agent tools are restricted to the `allowedTools` list in `agent.md`

---

## Part 7: Implementation Phases

### Phase 1: Foundation (Backend)
**Goal:** Spaces can be installed from a Git repo URL and loaded by the context service.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 1.1 | Create `SpaceManifest` type | `context/spaces/types.go` | Go struct matching the JSON schema in §1.1 |
| 1.2 | Create `SpaceManager` | `context/spaces/manager.go` | Init, ListInstalled, Install, Uninstall, Enable, Disable |
| 1.3 | Create `SpaceValidator` | `context/spaces/validator.go` | Validate manifest fields, check ID collisions |
| 1.4 | Create `SpaceDownloader` | `context/spaces/downloader.go` | Git clone with `--depth=1`, tarball extraction |
| 1.5 | Create `HandleSpaces` handler | `context/handlers/spaces.go` | All `spaces.*` request types |
| 1.6 | Add dispatch route | `context/main.go` | `case strings.HasPrefix(req.Type, "spaces."):` |
| 1.7 | Wire SpaceManager into Service | `context/svc/service.go` | Initialize SpaceManager in `NewService()` |
| 1.8 | Load installed space skills on startup | `context/svc/skills_service.go` | After `LoadBuiltinsIdempotent()`, scan `~/.construct/spaces/*/skill.md` |
| 1.9 | Load installed space agents on startup | `context/agents/registry.go` | Scan `~/.construct/spaces/*/agent.md` |

### Phase 2: Vue Integration
**Goal:** Installed spaces appear in the sidebar and can be navigated to.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 2.1 | Create `useSpaceMarketplace` composable | `src/composables/useSpaceMarketplace.ts` | All marketplace operations via Tauri invoke |
| 2.2 | Modify `useSpaces.ts` | `src/composables/useSpaces.ts` | Merge built-in + installed spaces |
| 2.3 | Create barrel export for built-in spaces | `src/spaces/builtin.ts` | Move 11 static imports to one file |
| 2.4 | Add dynamic space route | `src/router/routes.ts` | `:spaceName` catch-all with guard |
| 2.5 | Create `DynamicSpacePage.vue` | `src/spaces/_dynamic/DynamicSpacePage.vue` | Generic renderer for config-only spaces |
| 2.6 | Add marketplace route | `src/router/routes.ts` | `/app/marketplace` route |

### Phase 3: Marketplace UI
**Goal:** Users can browse, search, and install spaces from the UI.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 3.1 | Create `MarketplacePage.vue` | `src/pages/MarketplacePage.vue` | Grid view, search, categories |
| 3.2 | Create `SpaceCard.vue` component | `src/components/marketplace/SpaceCard.vue` | Card for grid view |
| 3.3 | Create `SpaceDetail.vue` component | `src/components/marketplace/SpaceDetail.vue` | Full detail view |
| 3.4 | Create `PermissionPrompt.vue` | `src/components/marketplace/PermissionPrompt.vue` | Permission approval dialog |
| 3.5 | Create `SpacesSettings.vue` | `src/pages/settings/SpacesSettings.vue` | Manage installed spaces |
| 3.6 | Update `DashboardPage.vue` | `src/pages/DashboardPage.vue` | Add "Browse Spaces" quick action |
| 3.7 | Update `SettingsPage.vue` | `src/pages/SettingsPage.vue` | Add "Spaces" to settings nav |

### Phase 4: Remote Registry
**Goal:** Spaces are browsable from a remote registry.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 4.1 | Create `RegistryClient` | `context/spaces/registry_client.go` | HTTP client with cache |
| 4.2 | Create `registry.json` | New repo: `construct-app/space-registry` | Static JSON registry file |
| 4.3 | Add registry URL to config | `context/svc/config.go` | Default URL, configurable via settings |
| 4.4 | Add update checking | `context/spaces/manager.go` | Compare installed vs registry versions |
| 4.5 | Update `HandleSpaces` for remote | `context/handlers/spaces.go` | `spaces.list_remote`, `spaces.search`, `spaces.check_updates` |

### Phase 5: Context Service Separation
**Goal:** The Go backend is its own repo with independent builds.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 5.1 | Create `construct-context` repo | New repo | Copy `context/`, update module path |
| 5.2 | Add `Makefile` | `construct-context/Makefile` | Cross-platform build targets |
| 5.3 | Add `version.go` | `construct-context/version.go` | Version injection via ldflags |
| 5.4 | Add GitHub Actions CI | `.github/workflows/build.yml` | Build + release binaries |
| 5.5 | Update Tauri to use external binary | `src-tauri/src/lib.rs` | Check `~/.construct/bin/context` first |
| 5.6 | Add auto-update check | `context/handlers/system.go` | `system.check_update` handler |

### Phase 6: Full Spaces (Custom Vue Components)
**Goal:** Spaces can ship pre-compiled Vue components for custom UI.

| # | Task | File(s) | Details |
|---|------|---------|---------|
| 6.1 | Create space build CLI | `construct-space-cli/` | `construct-space build` compiles Vue SFCs to JS bundle |
| 6.2 | Dynamic component loader | `src/spaces/_dynamic/loader.ts` | Load compiled JS bundle via dynamic `import()` |
| 6.3 | Update `DynamicSpacePage.vue` | `src/spaces/_dynamic/DynamicSpacePage.vue` | Detect and load compiled components |
| 6.4 | Create space project template | `construct-space-template/` | `npx create-construct-space my-space` |
| 6.5 | Add publish command | `construct-space-cli/` | `construct-space publish` → push to registry |

---

## Part 8: Files Changed (Summary)

### New Files

| File | Purpose |
|------|---------|
| `context/spaces/types.go` | SpaceManifest, InstalledSpace, SpaceMeta types |
| `context/spaces/manager.go` | Install, uninstall, update lifecycle |
| `context/spaces/registry_client.go` | HTTP client for remote registry |
| `context/spaces/validator.go` | Manifest validation |
| `context/spaces/downloader.go` | Git clone / tarball download |
| `context/handlers/spaces.go` | `spaces.*` request handler |
| `src/composables/useSpaceMarketplace.ts` | Vue composable for marketplace operations |
| `src/spaces/builtin.ts` | Barrel export of 11 built-in space configs |
| `src/spaces/_dynamic/DynamicSpacePage.vue` | Generic renderer for installed spaces |
| `src/pages/MarketplacePage.vue` | Marketplace browse/search UI |
| `src/pages/settings/SpacesSettings.vue` | Installed spaces management |
| `src/components/marketplace/SpaceCard.vue` | Space card component |
| `src/components/marketplace/SpaceDetail.vue` | Space detail view |
| `src/components/marketplace/PermissionPrompt.vue` | Permission approval dialog |

### Modified Files

| File | Change |
|------|--------|
| `context/main.go` | Add `spaces.*` dispatch route |
| `context/svc/service.go` | Initialize SpaceManager |
| `context/svc/skills_service.go` | Load installed space skills on startup |
| `context/agents/registry.go` | Load installed space agents on startup |
| `src/composables/useSpaces.ts` | Merge built-in + installed spaces |
| `src/router/routes.ts` | Add marketplace route + dynamic space catch-all |
| `src/pages/DashboardPage.vue` | Add "Browse Spaces" quick action |
| `src/pages/SettingsPage.vue` | Add "Spaces" to settings nav |

---

## Key Design Decisions

1. **Config-only spaces first (Phase 1-3), custom UI later (Phase 6):** Config-only spaces require zero code execution risk — they're just JSON manifests + agent markdown. This ships fast and safe. Full Vue component spaces require a build pipeline and sandboxing — that's Phase 6.

2. **Git clone as primary install method:** Most spaces will be GitHub repos. `git clone --depth=1` is simple, universal, and users understand it. Tarball download is a faster alternative for the registry.

3. **Static JSON registry first:** No backend infrastructure needed. A JSON file on GitHub serves as the registry. Upgrade to a full API when there are >50 spaces.

4. **Context service separation is Phase 5:** It's not a blocker for spaces marketplace. The context service works fine embedded. Separation enables independent updates and third-party context service extensions.

5. **Permissions are declarative and shown at install time:** Like Android/iOS app permissions. Users see exactly what a space can do before installing. No runtime permission escalation.

6. **Built-in spaces are not installable/uninstallable:** The 11 built-in spaces remain static imports. They're always available. Installed spaces are additive only.

7. **Space IDs are globally unique, lowercase, alphanumeric + hyphens:** No conflicts between built-in and installed spaces enforced by the validator.
