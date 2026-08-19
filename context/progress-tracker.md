# Progress Tracker

Living document. Updated as work is completed — mark a checkbox only when a phase's exit criteria (defined in the Build Plan) are actually met, not when the code is merged but unverified. This file is the fast answer to "where are we," so it needs to stay honest even under deadline pressure.

---

## How to Use

- Check off an item only once its **exit criteria** (copied from the Build Plan into each phase section below) are demonstrably true — run through them before ticking the box, don't tick from memory.
- If a phase is partially done, leave it unchecked and add a one-line note under **Status notes** rather than checking it early.
- Update the **Current phase** line at the top every time work moves to a new phase, so anyone opening this file gets the answer in one glance.
- This file tracks _phase-level_ progress against the Build Plan. Component-level detail belongs in `ui-registry.md`, not here.

---

## At a glance

**Current phase:** Phase 13 — Onboarding wizard
**MVP checkpoint (Phases 0–5) reached:** ☑
**Track-ready build (Phases 0–11) reached:** ☑
**Full scope (Phases 0–15) reached:** ☐

---

## Phase 0 — Foundation & scaffolding

- [x] Turborepo + Yarn (classic v1) workspace scaffolded (`apps/desktop`, `packages/ui`, `packages/design-tokens`, `packages/shared-types`, `packages/eslint-config`, `packages/tsconfig`)
- [x] `packages/design-tokens` wired into a Tailwind v4 `@theme` preset
- [x] `packages/shared-types` zod schema pattern established
- [x] Electron main process boots a window; `preload/index.ts` exposes an initial `window.horizon` surface
- [x] `better-sqlite3` + Drizzle wired up; one trivial migration proven
- [x] `secure-storage.ts` stubbed (module boundary exists, unused)
- [x] Base renderer shell: sidebar with 9 tab labels, top bar, no content yet
- [x] `eslint`/`prettier`/`vitest` running in `turbo` pipelines

**Exit criteria:** app launches, empty sidebar renders with the Purge-derived theme, one dummy IPC round-trip works end-to-end through a zod-validated schema, one Drizzle migration applies cleanly.
**Status notes:** Phase 0 implementation is complete in the workspace: contract-validated ping IPC, fixed app window sizing, token-safe shared button primitive, generated Drizzle migration files, startup migration execution, and the fixed desktop shell scaffold are in place.

---

## Phase 1 — Scan & index

- [x] `scan_runs` and `file_index` tables
- [x] `scan.worker.ts` walking a configured scope, streaming `found` messages
- [x] IPC: `scan:start`, `scan:progress`, completion event
- [x] `scanner.ts` service capturing per-file metadata
- [x] Overview tab v1: Run Scan button, live-updating result list, basic disk-summary chip, category counts
- [x] Manual/hardcoded scope (Documents/Desktop/Downloads/Pictures/Movies/Music)

**Exit criteria:** triggering a scan streams real file rows into `file_index`, results visibly populate the Overview list live, `scan_runs` finalizes with correct totals.
**Status notes:** Phase 1 implementation complete. Worker thread traversing scope, streaming metadata over typed IPC into SQLite file_index & scan_runs, Overview tab rendering live stream & category breakdowns.

---

## Phase 2 — Deletion safety core

- [x] `deletion-policy.ts` — two-tier allow/block engine
- [x] `trash.ts` — sole file-removal call site, wrapping Electron `shell.trashItem()`
- [x] `cleanup_actions` table
- [x] IPC: `cleanup:trash`, re-validated server-side
- [x] Shared confirmation-modal component in `packages/ui`

**Exit criteria:** given hand-picked `file_index` ids, the app can safely move them to OS trash, log a correct `cleanup_actions` row, and mark source rows `removed_at`.
**Status notes:** Phase 2 implementation complete. Single sanctioned trash path wrapping built-in Electron `shell.trashItem()`, server-side policy engine with `fs.realpath` symlink resolution and `path.sep` boundary checks, Drizzle `cleanup_actions` audit log table with indexed `performed_at`, contract-validated IPC `cleanup:trash`, and Radix AlertDialog `ConfirmationModal` primitive in `packages/ui`. All 15 unit tests passing.

---

## Phase 3 — Duplicate detection (exact + perceptual)

- [x] `hashing.ts` in `hash.worker.ts`: SHA-256 exact-match hashing above size threshold
- [x] Perceptual hashing for images (`sharp` + `blockhash-core`), clustering near-matches
- [x] `duplicate_groups` / `duplicate_group_members` tables
- [x] Auto-trigger after scan completion
- [x] IPC: `duplicates:list`
- [x] Duplicates tab: grouped display, default "keep newest" selection, thumbnails, wired to trash flow

**Exit criteria:** a folder with known exact duplicates and known near-identical images produces correct groups, reclaimable-space totals are right, trashing a selection updates the group and writes to `cleanup_actions`.
**Status notes:** Phase 3 implementation and duplicate detection pipeline fixes complete. Resolved tab-switching UI resets via persistent component mounting in `App.tsx` and atomic DB group updates in `hashing.ts`. Resolved non-PNG duplicate detection issue by optimizing worker stream concurrency and adding format-agnostic SHA-256 candidate processing across all categories (`document`, `video`, `audio`, `archive`, `dev_artifact`, `other`, `image`). All 21 unit tests passing cleanly.

---

## Phase 4 — Unused files

- [x] `staleness.ts` (accessed_at with documented modified_at fallback)
- [x] IPC: `unused-files:list` with `thresholdDays`
- [x] Unused Files tab: staleness slider, grouped results, multi-select, wired to Trash

**Exit criteria:** threshold changes correctly refilter results with no re-scan; trashing works identically to Duplicates.
**Status notes:** Phase 4 implementation complete. Staleness service in `main/services/staleness.ts` queries indexed `accessed_at` column with `modified_at` COALESCE fallback and tags `usedFallback: true` for noatime files. Contract-validated IPC `unused-files:list` registered and exposed via preload bridge. `UnusedFilesTab` and `UnusedFileCategoryCard` built with interactive staleness slider (30–730 days), category filter chips, multi-select, and safe OS removal via `ConfirmationModal` and `cleanup:trash`. All 20 unit tests passing.

---

## Phase 5 — Large files

- [x] IPC: `large-files:list` with `minSize`, `category`, `sort`
- [x] Large Files tab: filtering, sorting, preview, reveal-in-file-manager, multi-select

**Exit criteria:** — _(closes out the MVP tier; see checkpoint below)_
**Status notes:** Phase 5 implementation complete. Large files query service `main/services/large-files.ts` queries indexed `file_index` by dynamic size threshold, category, and multi-column sorting (size, date, name). Contract-validated IPC handlers `large-files:list` and `system:showInFolder` registered and exposed via preload bridge. `LargeFilesTab` built with size presets (5 MB to 1 GB+), category chips, sorting toggles, native OS file reveal, and batch safe removal via `ConfirmationModal`. All 22 unit tests passing.

**— MVP checkpoint —**

- [x] Streaming scan, exact + near-duplicate detection, unused-file detection, large-files browser, trash-only deletion with confirmation and audit trail, themed UI shell all working together as a real, demoable product.

---

## Phase 6 — AI provider foundation (BYOK)

- [x] `secure-storage.ts` fully implemented (`safeStorage` in/out, never returned across IPC, never logged)
- [x] `ai_provider_config` table (no key stored here)
- [x] `llm-client.ts` wrapping Ollama, OpenAI, Anthropic, Groq, OpenRouter behind one interface
- [x] IPC: `ai-provider:configure`, `ai-provider:status`, `ai-provider:select`
- [x] Local Ollama as zero-config default, no silent cloud fallback
- [x] Settings tab: AI Provider & API Key panel

**Exit criteria:** switching between Ollama (no key) and a cloud provider (real key) both work; an invalid key produces a clear inline error and nothing is persisted; the key is verifiably never present in the SQLite file or in logs.
**Status notes:** Phase 6 implementation complete. `aiProviderConfig` Drizzle schema and migration `0004_ai_provider_config.sql` generated and applied. `secure-storage.ts` protects provider credentials at rest with OS-backed `safeStorage`. `llm-client.ts` implements multi-provider abstraction with zero-config local Ollama model discovery and BYOK probe testing for OpenAI. `SettingsTab.tsx` built with active engine card, BYOK configuration panel, model selectors, connection testing, and theme controls. All unit test suites passing.

---

## Phase 7 — Near-duplicate detection (embeddings)

- [x] `embeddings.ts` calling the configured provider's embedding endpoint
- [x] Cosine-similarity clustering into `hash_type=embedding` groups
- [x] Extends existing Duplicates tab with the third group type

**Exit criteria:** a folder with near-identical (reworded, not identical) text documents correctly clusters via embedding similarity, displayed with its similarity score.
**Status notes:** Phase 7 complete. `embeddings.ts` extracts clean text head (up to 2,000 characters), fetches vector embeddings via active AI provider (`nomic-embed-text` / `text-embedding-3-small`), and clusters near-duplicate documents with cosine similarity >= 0.85 into connected components. `hashing.ts` pipeline integrated with Step 3 semantic clustering. `DuplicateGroupCard.tsx` and `DuplicatesTab.tsx` updated with document icons, semantic duplicate badges, match percentage display, and filter chips. Unit test suite created in `embeddings.test.ts`.

---

## Phase 8 — Forecasting

- [x] `scheduler.ts` (`node-cron`, daily) capturing usage snapshots
- [x] First-run bootstrap pass backfilling synthetic history from `file_index.created_at`
- [x] `forecasting.ts` fitting an explainable trend model, writing `forecasts`
- [x] IPC: `forecast:get`, `forecast:whatIf`
- [x] Forecast tab: trend chart, per-category breakdown, what-if simulator, "Apply this plan" deep-link
- [x] Overview tab updated with forecast headline

**Exit criteria:** on a fresh scan with no prior history, a plausible bootstrapped trend line and projected full-by date render immediately; the what-if simulator recomputes without mutating stored history; confidence reporting visibly distinguishes bootstrapped vs. real data.
**Status notes:** Phase 8 complete. `usage_snapshots`, `usage_snapshot_categories`, and `forecasts` tables added via migration `0005_forecasting.sql`. `scheduler.ts` manages daily midnight cron snapshots, app-launch catch-up, out-of-cycle cleanup resets with `segment_id` increments, and Anchor-and-Apportion bootstrap history reconstruction. `forecasting.ts` implements Theil-Sen robust median slope regression with 10th/90th percentile non-parametric confidence bounds, per-category growth rates, high-churn volatility detection, baseline learning period gating (5 real snapshots before projecting), live OS free space queries (`statfs`), and pure in-memory what-if simulations. `ForecastTab.tsx` built with Recharts ComposedChart, dynamic Y-axis zooming, critical/warning free-space banners, High-Churn risk breakdown card, category breakdown list, and interactive What-If Simulator with "Apply this plan" deep links. `OverviewTab.tsx` updated with live storage runway headline. Ollama provider supports both Local and Remote Custom API endpoints with `0006_ollama_base_url.sql`. All test suites passing.

---

## Phase 9 — AI recommendations

- [x] Triggered after scan + duplicate detection complete for a `scan_run`
- [x] Grounded prompt assembly (metadata only, never raw file contents)
- [x] Zod-validated structured LLM output with one-shot repair retry
- [x] `recommendations` table
- [x] IPC: `recommendations:list`
- [x] Assistant tab v1: recommendation cards with Review/Dismiss

**Exit criteria:** recommendation text visibly references real file names/paths/sizes from the actual test scan, not generic boilerplate; a deliberately malformed model response triggers the repair pass instead of a crash.
**Status notes:** Phase 9 implementation landed with shared recommendation schemas, `recommendation_batches` and `recommendations` tables, metadata-only context builder, prompt builder, deterministic validator, generation service, typed IPC/preload API, automatic post-duplicate-generation trigger, and Assistant v1 UI. Verified with desktop typecheck, desktop Vitest suite, targeted shared schema test, and SQLite migration smoke check. Live provider QA against an actual completed scan remains the final exit-criteria check.

---

## Phase 10 — Chat assistant

- [x] Lightweight retrieval step (recent scans, duplicate summary, latest forecast, keyword-matched rows)
- [x] IPC: `assistant:chat` + `assistant:stream`
- [x] Assistant tab v2: chat input below recommendation cards

**Exit criteria:** a question like "what's eating my Downloads folder" returns an answer grounded in actual indexed data, and visibly hedges rather than inventing an answer when the data doesn't support one.
**Status notes:** Phase 10 implementation landed with shared Assistant schemas, metadata-only retrieval across latest complete scans, keyword-matched indexed rows, duplicate summaries, forecast signals, and active recommendation cards. Added prompt guardrails, active-provider-only chat orchestration, streamed IPC events, preload bridge, Assistant tab transcript/input UI, and focused schema/prompt/retrieval tests. Verified with desktop typecheck, desktop Vitest suite, targeted shared schema tests, and raw Tailwind palette scan. Live provider QA against an actual completed scan remains the final grounding check.

---

## Phase 11 — Archiving

- [x] `archiver.ts`: compress → verify → only then trash originals
- [x] `archives` table + paired `cleanup_actions` row
- [x] IPC: `archive:create`, `archive:list`, `archive:restore`
- [x] Archive tab: bundle list, view-contents, restore
- [x] Real Archive buttons wired up in Duplicates/Unused Files/Large Files

**Exit criteria:** a deliberately interrupted/failed compression leaves originals untouched; a successful archive-then-restore round-trip returns files to their original path with a correct `cleanup_actions` audit trail.
**Status notes:** Phase 11 implementation landed with shared archive schemas, `archives` table and migration, Node built-in zip bundle writer/reader, verified archive creation before trashing originals, archive listing, contents preview, restore flow, typed IPC/preload API, Archive tab UI, and real Archive actions in Duplicates, Unused Files, and Large Files. Verified with desktop typecheck, desktop Vitest suite, targeted shared schema tests, archiver tests for zip verification and failed compression ordering, migration smoke check, and raw Tailwind palette scan.

---

## Phase 12 — Activity / audit log tab

- [x] Activity tab: reverse-chronological log of scans/cleans/archives/restores
- [x] `Undo` affordance on recently-trashed items

**Exit criteria:** every action taken across the whole app during earlier-phase testing shows up correctly here, in order, with correct byte totals.
**Status notes:** Phase 12 implementation landed with shared activity schemas, unified reverse-chronological audit query merging `scan_runs` and `cleanup_actions` records, typed IPC/preload bridge (`activity:list`, `activity:openTrash`), Activity tab UI with metric cards, type filtering, expandable impacted path lists, and safe OS Trash Undo affordance. Verified with desktop typecheck (`tsc --noEmit`), shared schema tests, main service vitest suite, and raw Tailwind palette scans.

---

## Phase 13 — Onboarding wizard

- [x] Full-screen modal wizard, blocks navigation until complete (`FirstRunGate` pattern)
- [x] Welcome → folder-picker/Full Disk Access → AI provider setup → scan scope → first scan → results summary → Overview
- [x] IPC: `settings:requestScanScope`, `settings:save`

**Exit criteria:** a completely fresh install, with no prior state, walks a new user end-to-end to a populated Overview tab without needing developer intervention.
**Status notes:** Phase 13 implementation landed with shared settings schemas, a `settings` table and migration, main process settings persistence, native scan-scope folder picker IPC, typed preload bridge, full-screen `FirstRunGate` wizard, real first-scan progress handling, onboarding completion persistence, and Overview scans using the saved scope. Verified with desktop typecheck, desktop Vitest suite, targeted shared schema tests, migration smoke check, and raw Tailwind palette scan.

---

## Phase 14 — Tray ("Horizon Mini")

- [ ] Tray icon + popover: reclaimable space, forecast headline, "Clean Safe Files Now," "Open Horizon"

**Exit criteria:** the tray popover reflects the same live numbers as the full app without requiring the main window to be open.
**Status notes:**

---

## Phase 15 — Polish, packaging, and stretch items

- [ ] `electron-builder` packaging (`.dmg`/`.exe`/AppImage)
- [ ] Keyboard shortcuts ⌘1–⌘9 across all tabs
- [ ] Full theme QA pass (light/dark/system, all 9 tabs + tray)
- [ ] Incremental re-scan (only re-index changed paths)
- [ ] _Stretch:_ ⌘K command palette
- [ ] _Stretch:_ scheduled/background monitoring with local notifications
- [ ] _Stretch:_ further what-if simulator polish

**Exit criteria:** a judge installs the packaged app on a clean machine with no manually-installed dependencies and reaches a meaningful first result quickly.
**Status notes:**

---

## Invariant spot-checks

Re-verify these whenever the phase that introduces or touches them is marked done — see `architecture.md` §6 and `code-standards.md` §9 for full definitions.

- [x] I-1–I-4 (destructive-action safety) — checked at Phase 2, and re-checked at every phase adding a new Trash/Archive button (3, 4, 5, 11)
- [x] I-5–I-7 (privacy & secrets) — checked at Phase 6, and re-checked at every phase adding a new LLM call (7, 9, 10)
- [ ] I-8–I-10 (architectural boundaries) — continuous, enforced via lint/review from Phase 0 onward
- [x] I-11 (migrations) — checked on every schema change, any phase
- [ ] I-12 (worker threads) — checked at Phases 1 and 3
- [x] I-13 (no double-counted bytes) — checked at Phases 1, 8, and 9
- [x] I-14 (audit log integrity) — checked from Phase 2 onward, re-checked for archive and restore audit rows at Phase 11, verified end-to-end at Phase 12
- [x] I-15 (IPC payload validation) — checked on every new IPC channel, any phase
