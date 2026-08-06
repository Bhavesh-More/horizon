# Architecture — Horizon

This document is the technical ground truth for how Horizon is built. It sits alongside `project_overview.md` (what the product is and does) and the Purge-to-AI-Storage-Optimizer plan (why these choices were made). Where those two explain intent, this one is the contract: what lives where, what's allowed to talk to what, what the schema is, and what must never be broken regardless of which feature is being worked on. Any agent or contributor implementing a feature should treat §6 (Invariants) as non-negotiable even under time pressure.

**Revision note:** this version replaces an earlier draft that split the app into an Electron/React frontend and a separate Python/FastAPI local backend. That split was inherited from thinking of this as "a web app with a local server," which doesn't hold up for a desktop app that already ships with a full Node runtime via Electron. Every responsibility the Python backend had — filesystem scanning, hashing, forecasting, AI provider calls, secret storage — has a solid Node equivalent, and running one runtime instead of two removes a real class of packaging and demo-day risk for no offsetting benefit. See the "why" discussion in-thread; this document reflects the resulting single-runtime design.

---

## 1. Tech stack

| Layer                           | Choice                                                                                                                                          | Notes                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo tooling**            | Turborepo + Yarn (classic v1) workspaces                                                                                                        | Task orchestration and caching across `apps/desktop` and the shared packages.                                                                                                                     |
| **Runtime**                     | Node.js, bundled with Electron                                                                                                                  | One runtime for the entire app — main process, renderer, and all business logic.                                                                                                                  |
| **Language**                    | TypeScript everywhere                                                                                                                           | Renderer, Electron main/preload, all services, all shared packages. No second language, no cross-language boundary to keep in sync.                                                               |
| **Desktop shell**               | Electron + `electron-builder`                                                                                                                   | Window/process lifecycle, tray icon, native OS dialogs, packaging into `.dmg`/`.exe`/AppImage.                                                                                                    |
| **UI framework**                | React 19 + Vite                                                                                                                                 | Renderer process. See `libraries.md` for exact current versions of every dependency in this table.                                                                                                |
| **Styling**                     | Tailwind CSS, configured from `packages/design-tokens`                                                                                          | Single source of truth for the Purge-derived palette/type scale/radii.                                                                                                                            |
| **UI primitives**               | Radix UI (unstyled) wrapped by `packages/ui`                                                                                                    | Accessible base, styled to spec once, reused everywhere.                                                                                                                                          |
| **Data fetching (renderer)**    | TanStack Query, backed by IPC instead of HTTP                                                                                                   | Same caching/loading-state ergonomics, just a different transport under the hood (see §4).                                                                                                        |
| **Charts**                      | Recharts                                                                                                                                        | Forecast trend line, category treemap.                                                                                                                                                            |
| **Icons**                       | `lucide-react` + `simple-icons`                                                                                                                 | Generic glyphs + real app brand icons.                                                                                                                                                            |
| **DB driver**                   | `better-sqlite3`                                                                                                                                | Synchronous, fast, the standard choice for embedded SQLite in a Node/Electron app.                                                                                                                |
| **ORM / schema**                | Drizzle ORM                                                                                                                                     | Typed queries and typed schema definitions in TypeScript, matching the rest of the codebase.                                                                                                      |
| **Migrations**                  | `drizzle-kit`                                                                                                                                   | Versioned schema changes — still required even for a single-file local DB, since users upgrade app versions without losing history (Invariant I-11).                                              |
| **Background jobs**             | `node-cron`                                                                                                                                     | Daily usage snapshot, optional recurring scans — in-process, no external broker.                                                                                                                  |
| **CPU-heavy work offload**      | Node `worker_threads` (optionally pooled via `piscina`)                                                                                         | Filesystem scanning and hashing run off the main process so the app never freezes mid-scan (Invariant I-12).                                                                                      |
| **Deletion**                    | `trash` (npm)                                                                                                                                   | The only sanctioned path to removing a user file — Invariant I-1.                                                                                                                                 |
| **Hashing (exact)**             | Node built-in `crypto` (SHA-256)                                                                                                                |                                                                                                                                                                                                   |
| **Perceptual hashing (images)** | `sharp` + `blockhash-core`                                                                                                                      | Near-duplicate image detection.                                                                                                                                                                   |
| **Text similarity**             | Embeddings via the configured LLM provider (Ollama's `nomic-embed-text` by default)                                                             | Reuses the same provider abstraction as recommendations/chat — no separate ML dependency.                                                                                                         |
| **Forecasting**                 | `simple-statistics` (linear regression) or a small hand-rolled exponential-smoothing function                                                   | Chosen for explainability and near-zero fit time over a heavier time-series library.                                                                                                              |
| **AI provider abstraction**     | Thin internal wrapper (`llm-client.ts`) over `ollama`, `openai`, `@anthropic-ai/sdk`, `groq-sdk` npm packages, and plain `fetch` for OpenRouter | One interface, provider swapped by config — see §4.7 and `project_overview.md` §10.                                                                                                               |
| **Secret storage**              | Electron's built-in `safeStorage` API                                                                                                           | OS-backed encryption (Keychain / DPAPI / libsecret) with zero extra dependency — simpler than the earlier Python-`keyring` approach.                                                              |
| **Renderer ↔ logic transport**  | Electron IPC (`ipcMain`/`ipcRenderer` + `contextBridge`), typed via `packages/shared-types`                                                     | Replaces the local HTTP/WebSocket API entirely — no server process, no port, no firewall prompt.                                                                                                  |
| **Schema/contract validation**  | `zod`                                                                                                                                           | Defines every IPC payload/response shape once in `packages/shared-types`; TypeScript types are inferred from the same schema, and the schema is used to validate at runtime (see Invariant I-15). |
| **Packaging**                   | `electron-builder` only                                                                                                                         | No second packaging step, no bundling a Python interpreter — the whole app is one Node/Electron build.                                                                                            |
| **Testing**                     | `vitest` + React Testing Library, across main-process logic and renderer                                                                        | One test runner for the whole codebase.                                                                                                                                                           |
| **Lint/format**                 | `eslint` + `prettier`                                                                                                                           | One toolchain, shared config in `packages/eslint-config`.                                                                                                                                         |

---

## 2. Folder structure

```
horizon/
├── apps/
│   └── desktop/                       # The one deployable unit — Electron shell, all logic, and the renderer
│       ├── src/
│       │   ├── main/                  # Electron main process — owns everything the old "backend" owned
│       │   │   ├── index.ts           # App lifecycle, window creation
│       │   │   ├── tray.ts            # "Horizon Mini" tray popover
│       │   │   ├── ipc/               # One handler module per feature — thin, delegates to services/
│       │   │   │   ├── scan.ts
│       │   │   │   ├── duplicates.ts
│       │   │   │   ├── unused-files.ts
│       │   │   │   ├── large-files.ts
│       │   │   │   ├── forecast.ts
│       │   │   │   ├── recommendations.ts
│       │   │   │   ├── assistant.ts
│       │   │   │   ├── archive.ts
│       │   │   │   ├── activity.ts
│       │   │   │   ├── settings.ts
│       │   │   │   └── ai-provider.ts
│       │   │   ├── services/          # All real logic lives here — equivalent to Purge's Services/ layer
│       │   │   │   ├── scanner.ts
│       │   │   │   ├── hashing.ts
│       │   │   │   ├── embeddings.ts
│       │   │   │   ├── staleness.ts
│       │   │   │   ├── forecasting.ts
│       │   │   │   ├── llm-client.ts       # Provider-agnostic AI wrapper
│       │   │   │   ├── archiver.ts
│       │   │   │   ├── trash.ts             # `trash` npm wrapper — single call site for all deletion
│       │   │   │   ├── deletion-policy.ts   # Safety-tier rules engine — single source of truth, mirrors Purge's DeletionSafetyPolicy
│       │   │   │   └── scheduler.ts         # node-cron job definitions
│       │   │   ├── workers/            # worker_threads entry points for CPU-heavy tasks
│       │   │   │   ├── scan.worker.ts
│       │   │   │   └── hash.worker.ts
│       │   │   ├── db/
│       │   │   │   ├── schema.ts       # Drizzle schema — the TypeScript source of truth for §5
│       │   │   │   ├── client.ts
│       │   │   │   └── migrations/     # drizzle-kit output
│       │   │   └── core/
│       │   │       ├── config.ts
│       │   │       └── secure-storage.ts   # Wraps Electron's safeStorage — the only module allowed to touch secrets
│       │   ├── preload/
│       │   │   └── index.ts            # contextBridge surface exposed to renderer — deliberately minimal, typed via packages/shared-types
│       │   └── renderer/               # React app
│       │       ├── main.tsx
│       │       ├── app.tsx
│       │       ├── tabs/               # Overview, Duplicates, UnusedFiles, LargeFiles, Forecast, Assistant, Archive, Activity, Settings
│       │       ├── components/         # App-specific compositions built from packages/ui primitives
│       │       ├── hooks/
│       │       ├── lib/
│       │       │   └── ipc-client.ts   # Typed wrapper around window.horizon.* (the contextBridge surface)
│       │       └── state/              # TanStack Query cache config + any local UI state
│       ├── electron-builder.yml
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── ui/                            # Shared, styled React component library (SafetyTagPill, DiskUsageBar, ScanResultRow, RecommendationCard, …)
│   ├── design-tokens/                 # The Purge-derived palette, type scale, radii — CSS vars + Tailwind preset, single source of truth
│   ├── shared-types/                  # zod schemas for every IPC payload/response, with TS types inferred from them — imported by both main and renderer, never redefined locally
│   ├── eslint-config/
│   └── tsconfig/
│
├── turbo.json                         # Pipeline definitions: dev, build, lint, test, typecheck
├── package.json                       # Root workspace manifest
├── (workspace managed by Yarn classic workspaces; no pnpm-workspace.yaml)
├── .env.example
└── README.md
```

Only one `apps/*` package now. The monorepo is still worth it: `packages/ui` and `packages/design-tokens` are independently testable/reusable (e.g. if a marketing site or a future onboarding-only surface is ever added), and `packages/shared-types` gives main and renderer one shared contract instead of two copies of the same shape drifting apart.

---

## 3. System boundaries

Each top-level folder **owns** a specific responsibility and specific data. Ownership is exclusive — no other folder is permitted to duplicate or reach around it.

| Folder                                              | Owns                                                                                                                                                                                  | Explicitly does NOT own                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/main` (excluding `ipc/`)          | Window/process lifecycle, tray icon, **all** filesystem access, **all** database access, **all** AI provider calls, **all** secret storage, the deletion-safety policy, the scheduler | Any UI concerns, any knowledge of how results are displayed                                                                                                               |
| `apps/desktop/src/main/ipc`                         | Translating a typed IPC request into a call on the relevant service, and validating the payload against `packages/shared-types` before doing so                                       | Business logic itself — handlers stay thin and delegate to `services/`                                                                                                    |
| `apps/desktop/src/main/services/deletion-policy.ts` | The single allow/block decision for any destructive action                                                                                                                            | Actually performing deletion — that's `trash.ts`'s job, called only after policy approval                                                                                 |
| `apps/desktop/src/main/services/trash.ts`           | The single call site for removing a file from the active filesystem                                                                                                                   | Deciding _whether_ something should be removed — that's the policy's job, and the _user's_ confirmation                                                                   |
| `apps/desktop/src/main/core/secure-storage.ts`      | Reading/writing API keys via `safeStorage`                                                                                                                                            | Ever returning a raw key value across the IPC boundary, or logging one                                                                                                    |
| `apps/desktop/src/preload`                          | The narrow, explicit bridge between main and renderer                                                                                                                                 | Anything beyond what's declared on the exposed `window.horizon` surface — no generic passthrough of `ipcRenderer.invoke` with an arbitrary channel string                 |
| `apps/desktop/src/renderer`                         | All UI rendering and presentation state                                                                                                                                               | Any filesystem access, any direct AI provider calls, any direct DB access, any `node:*` import — renderer talks to `main` exclusively through the preload-exposed IPC API |
| `packages/ui`                                       | Presentation-only, styled components with no data-fetching or business logic                                                                                                          | Any awareness of IPC channels or app-specific state                                                                                                                       |
| `packages/design-tokens`                            | Colors, type scale, radii, spacing — values only                                                                                                                                      | Component logic or markup                                                                                                                                                 |
| `packages/shared-types`                             | zod schemas (and their inferred TS types) for every IPC contract                                                                                                                      | Any runtime logic beyond schema definition/validation helpers                                                                                                             |

**Cross-cutting rule:** `packages/*` never imports from `apps/*` (packages are consumed, not consumers). The renderer never imports anything from `main/` directly, even though they now live in the same package and the same process tree — the only contract between them is the typed IPC surface declared in `preload/`, backed by `packages/shared-types`. This boundary is a discipline choice, not a technical necessity of Electron, and it's kept deliberately strict because it's what makes the deletion-safety re-validation in Invariant I-2 actually mean something.

---

## 4. Data flow per feature

Each flow below states the concrete IPC channel/module/table path, not just the user-facing behavior already covered in `project_overview.md` §5.

### 4.1 Onboarding & permissions

`renderer` invokes `settings:requestScanScope` → `main` shows a native folder-picker dialog and, on macOS, the Full Disk Access prompt → chosen paths sent back via the same invoke's return value → `renderer` calls `settings:save` with the scope → written to `settings` table → renderer proceeds to AI provider setup → `ai-provider:select` (default: `ollama`, no key) → renderer triggers first scan.

### 4.2 Scan

`renderer` → `ipcRenderer.invoke('scan:start', {scope})` (validated against the `ScanStartRequest` zod schema in `packages/shared-types`) → `main` hands the scope to a `scan.worker.ts` `worker_thread`, which walks each path and posts `found` messages back to the main thread → main writes each to `file_index` and re-emits it to the renderer via `webContents.send('scan:progress', event)` → renderer's `ipc-client.ts` turns that into a live-updating TanStack Query cache, so results stream into the UI exactly as they did in the HTTP/WebSocket version, just over a different transport → on completion, the `scan_runs` row is finalized and a final `scan:progress` event with `{event: "complete", summary}` is sent.

### 4.3 Duplicate detection

Triggered automatically in `main` right after a scan completes (not a separate user action) → a `hash.worker.ts` worker reads `file_index` rows above the size threshold and computes SHA-256 for exact matches → groups written to `duplicate_groups`/`duplicate_group_members` → for images, the same worker computes a perceptual hash via `sharp`/`blockhash-core` and clusters near-matches into a `hash_type=perceptual` group → for text/documents, `embeddings.ts` calls the configured provider's embedding endpoint and clusters by cosine similarity into `hash_type=embedding` groups → `renderer` reads current groups via `ipcRenderer.invoke('duplicates:list')`.

### 4.4 Unused file detection

No separate scan — a filtered query over the same `file_index` populated in 4.2. `staleness.ts` compares `accessed_at` (or the documented fallback field) against the configured threshold; `ipcRenderer.invoke('unused-files:list', {thresholdDays})` returns matches. No dedicated table — this is a query, not a stored result.

### 4.5 Large files

Same pattern as 4.4 — a filtered/sorted query over `file_index` via `ipcRenderer.invoke('large-files:list', {minSize, category, sort})`.

### 4.6 Forecasting

`scheduler.ts` (`node-cron`, daily) captures total/used/free + per-category breakdown → writes one row to `usage_snapshots`. On first run only, a bootstrap pass buckets existing `file_index` rows by `created_at` to backfill a synthetic history so the trend line isn't empty on day one. `forecasting.ts` reads the full `usage_snapshots` history, fits the trend model, and writes the result to `forecasts`. `ipcRenderer.invoke('forecast:get')` returns the latest row; `ipcRenderer.invoke('forecast:whatIf', {excludedCategories})` recomputes a hypothetical projection **without writing to `forecasts`** — a pure computation, not a persisted alternate history.

### 4.7 AI recommendations

Triggered in `main` after 4.2 and 4.3 complete for a given `scan_runs.id` → assembles a grounded prompt from that scan's summary (category totals, duplicate group sizes, staleness candidates, the latest `forecasts` row) — **never raw file contents** (Invariant I-6) → calls `llm-client.ts`, which dispatches to whichever provider is configured in `ai_provider_config` → the response is parsed and validated against a zod schema; on failure, one repair re-prompt is attempted before surfacing a partial/empty result rather than a malformed one → validated cards are written to `recommendations`, read via `ipcRenderer.invoke('recommendations:list', {scanRunId})`.

### 4.8 Chat assistant

`renderer` → `ipcRenderer.invoke('assistant:chat', {message})` → `main` performs a lightweight retrieval step (recent `scan_runs`, `duplicate_groups` summary, latest `forecasts`, and any DB rows matched by keywords/paths in the message) → assembles those into the prompt context alongside the message → `llm-client.ts` call → response streamed back to the renderer via repeated `webContents.send('assistant:stream', chunk)` events on the same channel pattern used for scan progress. No chat history is persisted to a table in the MVP scope — each message is answered independently with fresh retrieval.

### 4.9 Cleanup (trash)

`renderer` → user confirms a selection → `ipcRenderer.invoke('cleanup:trash', {fileIds})` → `main` re-validates each file against `deletion-policy.ts` **in the main process**, even though the renderer already filtered to policy-allowed items (never trust the renderer as the sole gate — Invariant I-2) → approved paths passed to `trash.ts` (`trash` npm package) → on success, a `cleanup_actions` row is written and the corresponding `file_index` rows are marked removed → the invoke resolves, and the renderer updates the relevant tab's list from the response.

### 4.10 Archive

`renderer` → `ipcRenderer.invoke('archive:create', {fileIds, destination})` → `archiver.ts` compresses the selected files into a dated bundle at `destination` → **only after** the write is confirmed (archive opened and listing verified) does it call `trash.ts` on the originals (Invariant I-3) → an `archives` row is written (`status=active`) alongside a `cleanup_actions` row (`action_type=archive`) → `ipcRenderer.invoke('archive:list')` lists bundles; `ipcRenderer.invoke('archive:restore', {id})` extracts back to the original (or a chosen) path, updates `archives.status=restored`, and writes a `cleanup_actions` row (`action_type=restore`).

### 4.11 Settings — AI provider key

`renderer` → `ipcRenderer.invoke('ai-provider:configure', {provider, model, apiKey})` → `main` immediately performs one lightweight validation call against the provider → on success, the key is written **only** via `secure-storage.ts` (Electron `safeStorage`, backed by the OS credential store); `ai_provider_config` stores only `{provider, model, isActive}` → on failure, nothing is persisted and a specific error reason is returned (invalid key / quota / network) → `ipcRenderer.invoke('ai-provider:status')` never returns the key itself, only `{provider, model, configured: true}`.

---

## 5. Database schema

Single SQLite file (via `better-sqlite3`), managed with Drizzle ORM + `drizzle-kit` migrations. The schema itself is language-agnostic and unchanged by the runtime switch — only the ORM/migration tooling generating and applying it changed (Drizzle instead of SQLModel/Alembic). All timestamps are UTC.

```sql
-- One row per scan invocation
CREATE TABLE scan_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    scope_paths     TEXT NOT NULL,          -- JSON array of scanned root paths
    status          TEXT NOT NULL CHECK (status IN ('running','complete','cancelled','failed')),
    total_files     INTEGER DEFAULT 0,
    total_bytes     INTEGER DEFAULT 0
);

-- One row per indexed file, tied to the scan that (re-)discovered it
CREATE TABLE file_index (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_run_id         INTEGER NOT NULL REFERENCES scan_runs(id),
    path                TEXT NOT NULL,
    size_bytes          INTEGER NOT NULL,
    extension           TEXT,
    category            TEXT NOT NULL,       -- image | video | audio | document | archive | dev_artifact | other
    created_at          TEXT,
    modified_at         TEXT,
    accessed_at          TEXT,                -- nullable; see staleness fallback behavior in §4.4
    content_hash        TEXT,                -- SHA-256, only computed above the size threshold
    perceptual_hash     TEXT,                -- images only
    removed_at          TEXT,                -- set on trash/archive; row kept for audit trail, not hard-deleted
    UNIQUE(path)
);
CREATE INDEX idx_file_index_hash ON file_index(content_hash);
CREATE INDEX idx_file_index_category ON file_index(category);
CREATE INDEX idx_file_index_accessed ON file_index(accessed_at);

-- Duplicate groupings, exact or near-duplicate
CREATE TABLE duplicate_groups (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    hash_type           TEXT NOT NULL CHECK (hash_type IN ('exact','perceptual','embedding')),
    representative_hash TEXT NOT NULL,
    total_size_bytes    INTEGER NOT NULL,
    member_count        INTEGER NOT NULL,
    created_at          TEXT NOT NULL
);

CREATE TABLE duplicate_group_members (
    group_id            INTEGER NOT NULL REFERENCES duplicate_groups(id),
    file_id             INTEGER NOT NULL REFERENCES file_index(id),
    similarity_score     REAL,                -- 1.0 for exact; <1.0 for perceptual/embedding matches
    PRIMARY KEY (group_id, file_id)
);

-- Daily disk-usage history — the raw material forecasting is built on
CREATE TABLE usage_snapshots (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at             TEXT NOT NULL,
    volume_total_bytes      INTEGER NOT NULL,
    volume_used_bytes       INTEGER NOT NULL,
    volume_free_bytes       INTEGER NOT NULL,
    category_breakdown_json TEXT NOT NULL,   -- {"image": 12345, "video": 67890, ...}
    is_bootstrapped         INTEGER NOT NULL DEFAULT 0  -- 1 for the synthetic first-run backfill, 0 for real daily captures
);

-- Model output, one row per forecast run
CREATE TABLE forecasts (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at            TEXT NOT NULL,
    model_type              TEXT NOT NULL,   -- e.g. "linear_trend", "exponential_smoothing"
    horizon_days            INTEGER NOT NULL,
    projected_full_date     TEXT,
    category_trends_json    TEXT NOT NULL,   -- per-category growth rate
    confidence_metric       REAL
);

-- AI-generated recommendation cards
CREATE TABLE recommendations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at        TEXT NOT NULL,
    scan_run_id         INTEGER NOT NULL REFERENCES scan_runs(id),
    text                TEXT NOT NULL,
    priority            INTEGER NOT NULL,     -- lower = higher priority
    related_file_ids_json TEXT,               -- JSON array of file_index.id
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed'))
);

-- Audit log — every destructive or archival action, no exceptions (Invariant I-14)
CREATE TABLE cleanup_actions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type         TEXT NOT NULL CHECK (action_type IN ('trash','archive','restore')),
    file_paths_json     TEXT NOT NULL,
    bytes_freed         INTEGER NOT NULL,
    performed_at        TEXT NOT NULL,
    related_archive_id  INTEGER REFERENCES archives(id)
);

-- Archive bundles
CREATE TABLE archives (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at          TEXT NOT NULL,
    archive_path        TEXT NOT NULL,
    original_paths_json TEXT NOT NULL,
    total_bytes         INTEGER NOT NULL,
    compression_type    TEXT NOT NULL,       -- "zip" | "tar.zst"
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restored','deleted'))
);

-- Simple key-value app preferences
CREATE TABLE settings (
    key                 TEXT PRIMARY KEY,
    value                TEXT NOT NULL        -- JSON-encoded
);

-- AI provider metadata ONLY — the key itself never lives here (Invariant I-4)
CREATE TABLE ai_provider_config (
    provider_name       TEXT PRIMARY KEY,     -- "ollama" | "openai" | "anthropic" | "groq" | "openrouter"
    model_name          TEXT NOT NULL,
    is_active           INTEGER NOT NULL DEFAULT 0,
    added_at            TEXT NOT NULL
);
```

**Notes:**

- `file_index` rows are never hard-deleted when a file is trashed/archived — `removed_at` is set instead, so duplicate groups, recommendations, and the activity log retain valid historical references (see Invariant I-13 on double-counting, which this also protects against).
- `usage_snapshots.is_bootstrapped` lets the forecasting model (and the UI) distinguish real observed history from the synthetic first-run backfill, so confidence reporting can be honest about it rather than presenting day-one data as equally reliable.
- `db/schema.ts` (Drizzle) is the actual source of truth in code; the SQL above is the human-readable reference and should stay in sync with it — a schema change updates `schema.ts` first, then a `drizzle-kit` migration is generated from the diff.

---

## 6. Invariants — rules that must never be violated

These hold regardless of which feature is being built, how much time pressure exists, or what a well-intentioned shortcut might suggest. If a change requires breaking one of these, the change is wrong, not the invariant.

**Destructive-action safety**

- **I-1.** No code path may call an unrecoverable delete (`fs.rm`, `fs.unlink`, `fs.rmSync` on user content, etc.) on a user's file. The _only_ sanctioned removal path is `trash.ts`'s call into the `trash` package.
- **I-2.** Every destructive request is re-validated against `deletion-policy.ts` **in the main process**, even if the renderer already filtered to allowed items. The renderer's UI state is never trusted as the sole authority for what's safe to act on.
- **I-3.** For archiving, original files are removed **only after** the archive write is confirmed and verified. The order is always compress → verify → remove. It is never remove → compress.
- **I-4.** No batch destructive action (trash, archive, scheduled cleanup) executes without an explicit, per-action user confirmation. There is no "fully automatic, trust the AI" mode — not even for items the AI labels high-confidence.

**Privacy & secrets**

- **I-5.** API keys are stored only via `secure-storage.ts` (Electron `safeStorage`). They are never written to SQLite, never returned across the IPC boundary once saved, and never logged, including in error logs or crash reports.
- **I-6.** Prompts sent to any AI provider (local or cloud) contain only metadata — paths, sizes, dates, hashes, category labels — never raw file contents.
- **I-7.** No network call to a cloud AI provider occurs unless the user has explicitly configured that specific provider with their own key. Local Ollama is the zero-config default and the app never silently falls back to a cloud provider on Ollama failure — a failure surfaces as a clear error, not a silent, unconsented network call.

**Architectural boundaries**

- **I-8.** `apps/desktop/renderer` never accesses the filesystem, the database, or any AI provider directly, and never imports a `node:*` module. All of it goes through the typed IPC surface exposed by `preload/`.
- **I-9.** `packages/shared-types` is the single source of truth for every IPC contract. Neither `main` nor `renderer` redefines a payload/response shape locally — if a shape needs to change, it changes there first.
- **I-10.** `packages/*` never imports from `apps/*`.

**Data integrity**

- **I-11.** Any schema change goes through a `drizzle-kit` migration. No destructive schema change ships without a corresponding migration file — a user upgrading Horizon must never silently lose their scan/usage history.
- **I-12.** Filesystem scanning and hashing never run on the Electron main thread — they run inside `worker_threads` (`scan.worker.ts`, `hash.worker.ts`), so the app's window, tray, and any in-flight IPC calls stay responsive throughout a large scan.
- **I-13.** Any aggregate figure shown to the user (reclaimable space totals, category breakdown, forecast inputs) must not double-count a file that appears in more than one result set (e.g., a file that's both a duplicate and unused counts its bytes once, not once per category). `file_index.id` is the single unit of truth for byte accounting across all features.
- **I-14.** Every action recorded in `cleanup_actions` corresponds to a real, completed filesystem operation. The audit log is never written speculatively before the action succeeds, and a failed action is never silently dropped without a corresponding failure record the user can see.
- **I-15.** Every IPC handler in `main` validates its incoming payload against the matching `packages/shared-types` zod schema before using it. The renderer's TypeScript types are a development-time convenience, not a security boundary — the main process is the actual trust boundary and must never assume a well-typed caller implies a well-formed payload.
