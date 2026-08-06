# Horizon — Build Plan

**Source of truth:** `architecture.md` (contract — what lives where, invariants) + `project_overview.md` (product — tabs, flows, scope) + the Purge migration/roadmap doc (why, and the MVP/differentiator/stretch tiering).
**Timeline:** 2–4 weeks, single Electron/TypeScript codebase, no separate backend.

This document exists to answer one question at each point in the build: **what do we build next, and why that and not something else.** Phases are ordered by data and safety dependency, not by tab number — several tabs (Duplicates, Unused Files, Large Files) are thin UI layers over one shared table (`file_index`) and can't be started before the scanner exists; the deletion-safety core has to exist before _any_ feature that trashes a file, including the very first one; AI features can't be built before the provider abstraction they all share.

---

## Sequencing principles

1. **Data before views.** `file_index`/`scan_runs` (Phase 1) gate every feature that reads scan results — Duplicates, Unused Files, Large Files, Forecast bootstrap, Recommendations.
2. **Safety before destruction.** `deletion-policy.ts` + `trash.ts` (Phase 2) must exist before Duplicates, Unused Files, Large Files, or Archive ship a working "remove" button — Invariants I-1 to I-4 are non-negotiable from the first destructive action onward, not retrofitted later.
3. **Provider abstraction before any AI call.** `llm-client.ts` + secure key storage (Phase 6) must exist before embedding-based near-duplicates, Recommendations, or the Chat Assistant — all three call the same abstraction.
4. **One demoable slice early.** By the end of Phase 5 the app scans, shows duplicates/unused/large files, and can safely trash — a real (if not yet AI-powered) product, matching the roadmap's "MVP = table stakes" tier.
5. **Differentiators after table stakes.** Forecasting and AI reasoning are what win the track per the roadmap doc, but they're sequenced _after_ the scan/safety/query foundation because they depend on it (forecasting bootstraps from `file_index`; recommendations are grounded in scan + duplicate + forecast data).
6. **Onboarding last, not first.** The onboarding wizard orchestrates scan-scope selection and AI-provider setup — it's built once both of those subsystems actually exist, not stubbed early. Before it exists, phases are validated via a dev shortcut (skip wizard, hit tabs directly).

---

## Phase 0 — Foundation & scaffolding

**Goal:** a running, empty Electron app with the full monorepo shape, DB, and IPC contract system in place — nothing user-facing yet.

**Scope:**

- Turborepo + Yarn (classic v1) workspace: `apps/desktop`, `packages/ui`, `packages/design-tokens`, `packages/shared-types`, `packages/eslint-config`, `packages/tsconfig`.
- `packages/design-tokens`: Purge-derived CSS variables and type scale (§2 of the roadmap doc) as the single source of truth, wired into a Tailwind preset.
- `packages/shared-types`: zod schema pattern established (even with just one or two placeholder schemas) — this is the contract every later IPC channel must be defined through (Invariant I-9).
- Electron main process boots a window; `preload/index.ts` exposes an initial (empty) `window.horizon` surface via `contextBridge`.
- `better-sqlite3` + Drizzle ORM wired up; `drizzle-kit` migration flow proven with one trivial table.
- `apps/desktop/src/main/core/secure-storage.ts` stubbed (wraps `safeStorage`) — not used yet, but the module boundary exists from day one so no other code is ever tempted to touch secrets directly.
- Base renderer shell: sidebar with the 9 tab labels (non-functional), top bar, no content yet.
- Lint/format/test tooling (`eslint`, `prettier`, `vitest`) running in CI/`turbo` pipelines.

**Depends on:** nothing.

**Exit criteria:** app launches, empty sidebar renders with the Purge-derived theme, one dummy IPC round-trip (renderer → main → back) works end-to-end through a zod-validated schema, one Drizzle migration applies cleanly.

---

## Phase 1 — Scan & index (the data backbone)

**Goal:** the app can scan real folders and show results streaming in. This is the single most load-bearing feature — nearly everything else reads `file_index`.

**Scope (maps to `architecture.md` §4.2, `project_overview.md` §5.2/§6):**

- `scan_runs` and `file_index` tables (schema §5).
- `scan.worker.ts` (`worker_threads`) walking a configured scope, posting `found` messages back (Invariant I-12 — never block the main thread).
- IPC: `scan:start` (validated against `ScanStartRequest` in `shared-types`), `scan:progress` (streamed), completion event with summary.
- `scanner.ts` service: per-file metadata capture (size, extension/category, created/modified/accessed timestamps).
- Overview tab v1: "Run Scan" button, live-updating streamed result list (via TanStack Query cache fed by IPC events, per §4.2), a basic disk-summary chip (used/free), category counts.
- Manual scope input for now (hardcoded common folders: Documents/Desktop/Downloads/Pictures/Movies/Music) — the real folder-picker onboarding flow comes later in Phase 13.

**Explicitly not in this phase:** incremental re-scan (nice-to-have per project_overview §6, not MVP-blocking), cancellation UI polish, permission-prompt UX (macOS Full Disk Access dialog copy — that's onboarding, Phase 13).

**Depends on:** Phase 0 (IPC/DB/worker infra).

**Exit criteria:** triggering a scan streams real file rows into `file_index`, results visibly populate the Overview list live, `scan_runs` finalizes with correct totals.

---

## Phase 2 — Deletion safety core

**Goal:** the one subsystem every destructive feature after this point depends on. Built once, trusted everywhere.

**Scope (maps to `architecture.md` §3, §4.9, Invariants I-1–I-4):**

- `deletion-policy.ts`: the single allow/block decision engine (two-tier: Safe to Clean / Check First, per the Purge-derived safety model — no fabricated confidence scores).
- `trash.ts`: the _only_ call site in the whole app permitted to remove a file, wrapping the `trash` npm package (Invariant I-1 — no `fs.rm`/`fs.unlink` on user content anywhere else).
- `cleanup_actions` table + the invariant that every entry corresponds to a real, completed operation, never written speculatively (I-14).
- IPC: `cleanup:trash` — re-validates every file against `deletion-policy.ts` **in main**, even though callers will eventually pre-filter client-side (I-2, never trust the renderer as sole gate).
- A shared, reusable confirmation-modal component in `packages/ui` (states exactly what will be trashed, how to undo) — used by every feature that deletes, starting now.

**Depends on:** Phase 1 (needs real `file_index` rows to test against).

**Exit criteria:** given a hand-picked set of `file_index` ids, the app can safely move them to OS trash, log a correct `cleanup_actions` row, and mark the source rows `removed_at` (never hard-deleted, per the schema notes) — provable via a temp test folder, no UI polish required yet.

---

## Phase 3 — Duplicate detection (exact + perceptual)

**Goal:** first real differentiator vs. Purge (which has none of this) and the first fully-shipped tab.

**Scope (maps to `architecture.md` §4.3; `project_overview.md` §5.3):**

- `hashing.ts` in a `hash.worker.ts` thread: SHA-256 exact-match hashing above the configured size threshold.
- Perceptual hashing for images via `sharp` + `blockhash-core`, clustering near-matches.
- `duplicate_groups` / `duplicate_group_members` tables, `hash_type` distinguishing `exact` vs `perceptual` (the `embedding` type comes in Phase 7, once the AI provider exists).
- Auto-trigger right after a scan completes (not a separate user action, per §4.3).
- IPC: `duplicates:list`.
- Duplicates tab: exact-hash groups first, then perceptual, visually distinguished; per-group "keep newest" default selection, fully editable; thumbnails for image groups; wired to the Phase 2 trash flow + confirmation modal.

**Explicitly not in this phase:** embedding-based document near-duplicates (needs `llm-client.ts` — Phase 7).

**Depends on:** Phase 1 (file_index), Phase 2 (trash/confirm flow for the "move selected to trash" action).

**Exit criteria:** a folder with known exact duplicates and known near-identical images produces correct groups, reclaimable-space totals are right, and trashing a selection updates the group and writes to `cleanup_actions`.

---

## Phase 4 — Unused files

**Goal:** second tab, cheap to build since it's a query over data that already exists — no new scan, no new worker.

**Scope (maps to `architecture.md` §4.4; `project_overview.md` §5.4):**

- `staleness.ts`: compares `accessed_at` (falling back to `modified_at` where the OS doesn't reliably report access time — documented in-UI, not silently substituted, per project_overview §6).
- IPC: `unused-files:list` with a configurable `thresholdDays`.
- Unused Files tab: staleness slider, results grouped by folder/category, multi-select, wired to both `Move to Trash` (Phase 2) and `Archive` (stubbed until Phase 11 — button present, disabled or routes to a "coming soon" state if Archive isn't built yet, developer's call based on actual sequencing).

**Depends on:** Phase 1 (file_index), Phase 2 (trash flow).

**Exit criteria:** threshold changes correctly refilter results with no re-scan; trashing works identically to Duplicates.

---

## Phase 5 — Large files

**Goal:** third tab, same pattern as Phase 4 — cheapest remaining query-only view. Completing this closes out the roadmap doc's "MVP / table stakes" tier entirely.

**Scope (maps to `architecture.md` §4.5; `project_overview.md` §5.5):**

- IPC: `large-files:list` with `minSize`, `category`, `sort`.
- Large Files tab: size/date/category filtering, sort by size/date/name, Quick Look-style preview, reveal-in-Finder/Explorer, multi-select → Trash or Archive (same caveat as Phase 4 on Archive).

**Depends on:** Phase 1, Phase 2.

**— MVP checkpoint —**
At this point the app satisfies the roadmap's MVP tier in full: streaming scan, exact + near-duplicate detection, unused-file detection, large-files browser, trash-only deletion with confirmation and an audit trail, themed UI shell. It is a real, demoable product even before any AI or forecasting exists.

---

## Phase 6 — AI provider foundation (BYOK)

**Goal:** the shared abstraction every remaining feature (near-dup embeddings, Recommendations, Chat Assistant) calls through. Built once, as its own phase, precisely so it isn't half-built three separate times.

**Scope (maps to `architecture.md` §4.11, §4.7; `project_overview.md` §10; Invariants I-5, I-6, I-7):**

- `secure-storage.ts` fully implemented (was stubbed in Phase 0): keys in/out via `safeStorage` only, never returned across IPC once saved, never logged.
- `ai_provider_config` table — provider/model/active flag only, key never stored here (I-5).
- `llm-client.ts`: thin wrapper over `ollama`, `openai`, `@anthropic-ai/sdk`, `groq-sdk`, and `fetch` for OpenRouter — one interface, provider swapped by config.
- IPC: `ai-provider:configure` (one lightweight validation call on save, specific error reasons on failure — invalid key / quota / network), `ai-provider:status` (never returns the key, only `{provider, model, configured}`), `ai-provider:select`.
- Local Ollama as the zero-config default — no key required, no network call unless the user explicitly configures a cloud provider (I-7 — never a silent fallback to cloud on Ollama failure).
- Settings tab: AI Provider & API Key panel.

**Depends on:** Phase 0 (secure-storage module boundary already exists to fill in).

**Exit criteria:** switching between Ollama (no key) and a cloud provider (real key) both work; an invalid key produces a clear inline error and nothing is persisted; the key is verifiably never present in the SQLite file or in logs.

---

## Phase 7 — Near-duplicate detection (embeddings)

**Goal:** close out Duplicate detection with its final tier — the clearest "actually AI, not just automation" moment per the roadmap doc, and the reason Phase 3 was split from this.

**Scope (maps to `architecture.md` §4.3):**

- `embeddings.ts`: calls the configured provider's embedding endpoint (`nomic-embed-text` via Ollama by default), clusters text/document files by cosine similarity into `hash_type=embedding` duplicate groups.
- Extends the existing Duplicates tab — no new UI surface, just a third group type rendered alongside exact/perceptual.

**Depends on:** Phase 3 (duplicate groups infra), Phase 6 (llm-client).

**Exit criteria:** a folder with near-identical text documents (reworded, not identical) correctly clusters via embedding similarity, displayed with its similarity score.

---

## Phase 8 — Forecasting

**Goal:** the roadmap doc's stated headline differentiator ("show the forecast chart first" in the demo narrative) and the track brief's most literally-required-and-least-commonly-built feature.

**Scope (maps to `architecture.md` §4.6; `project_overview.md` §5.8, §6):**

- `scheduler.ts` (`node-cron`, daily): captures total/used/free + per-category breakdown → `usage_snapshots`.
- Bootstrap pass on first run: buckets existing `file_index` rows by `created_at` to backfill synthetic history (`is_bootstrapped=1`) so the trend line isn't empty on day one — critical for demo credibility, not a nice-to-have.
- `forecasting.ts`: fits an explainable model (`simple-statistics` linear regression, or hand-rolled exponential smoothing) over `usage_snapshots`, writes `forecasts`.
- IPC: `forecast:get` (latest row), `forecast:whatIf` (pure computation, never written to `forecasts` — this is a hypothetical, not an alternate persisted history).
- Forecast tab: historical + projected trend chart (Recharts), per-category growth breakdown, interactive what-if simulator, "Apply this plan" deep-link to the relevant tab(s) with implicated items pre-selected (per project_overview §4 cross-tab deep links).
- Overview tab updated to surface the forecast headline (e.g., "~18 days to full").

**Depends on:** Phase 1 (file_index for bootstrap), Phase 0 (scheduler infra can be added any time after core app boot, but needs real data to be meaningful).

**Exit criteria:** on a fresh scan with no prior history, a plausible bootstrapped trend line and projected full-by date render immediately; the what-if simulator recomputes without mutating stored history; confidence reporting visibly distinguishes bootstrapped vs. real data.

---

## Phase 9 — AI recommendations

**Goal:** the "intelligent cleanup/archiving recommendations" half of the track brief, and the second demo beat per the roadmap's narrative.

**Scope (maps to `architecture.md` §4.7; `project_overview.md` §5.9):**

- Triggered in `main` after scan + duplicate detection complete for a given `scan_run.id`.
- Grounded prompt assembly from that scan's summary — category totals, duplicate group sizes, staleness candidates, latest `forecasts` row — **never raw file contents** (I-6).
- Structured, zod-validated LLM output with a one-shot repair re-prompt on malformed responses (never breaks the UI mid-demo).
- `recommendations` table (text, priority, related file ids, pending/accepted/dismissed status).
- IPC: `recommendations:list`.
- Assistant tab v1: auto-generated recommendation cards with `Review` (deep-links to the relevant tab, pre-filtered) and `Dismiss` actions.

**Depends on:** Phase 3 (duplicate data to ground on), Phase 6 (llm-client), Phase 8 (forecast data to ground on — recommendations read the latest forecast row).

**Exit criteria:** recommendation text visibly references real file names/paths/sizes from the actual test scan, not generic boilerplate; a deliberately malformed model response triggers the repair pass instead of a crash.

---

## Phase 10 — Chat assistant

**Goal:** the free-form half of the Assistant tab; lower priority than Recommendations since it's explicitly a stretch item in the roadmap doc, but grouped here because it shares the same tab and the same `llm-client.ts`.

**Scope (maps to `architecture.md` §4.8; `project_overview.md` §5.9):**

- Lightweight retrieval step in `main`: recent `scan_runs`, `duplicate_groups` summary, latest `forecasts`, DB rows matched by keywords/paths in the message.
- IPC: `assistant:chat` (invoke) + `assistant:stream` (repeated `webContents.send`, same streaming pattern as scan progress).
- No persisted chat history in MVP scope — each message answered independently with fresh retrieval, per architecture §4.8.
- Assistant tab v2: chat input below the recommendation cards.

**Depends on:** Phase 6 (llm-client), Phase 9 (shares the tab and the retrieval-grounding pattern, though not a hard data dependency).

**Exit criteria:** a question like "what's eating my Downloads folder" returns an answer grounded in actual indexed data, and visibly hedges rather than inventing an answer when the data doesn't support one.

---

## Phase 11 — Archiving

**Goal:** the feature that most cleanly differentiates Horizon from Purge (which only deletes) and satisfies "archiving recommendations" from the brief as a first-class action, not a rebrand of delete.

**Scope (maps to `architecture.md` §4.10; `project_overview.md` §5.6/§5.7; Invariant I-3):**

- `archiver.ts`: compress selected files into a dated bundle (`.zip`/`.tar.zst`) at a configured destination.
- Strict ordering: compress → **verify** (archive opened, listing checked) → only then call `trash.ts` on originals — archive-then-trash, never trash-then-archive (I-3, a failed compression must never lose data).
- `archives` table (`status`: active/restored/deleted) + a paired `cleanup_actions` row (`action_type=archive`).
- IPC: `archive:create`, `archive:list`, `archive:restore` (extracts back to original or chosen path, updates `status=restored`, writes a `restore` cleanup action).
- Archive tab: bundle list, view-contents-without-extracting, restore action.
- Now-real "Archive" buttons wired up in Duplicates/Unused Files/Large Files (previously stubbed in Phases 3–5).

**Depends on:** Phase 2 (trash.ts, called only after verified archive write), Phases 4/5 (the buttons that trigger it).

**Exit criteria:** a deliberately interrupted/failed compression leaves originals untouched; a successful archive-then-restore round-trip returns files to their original path with a correct `cleanup_actions` audit trail.

---

## Phase 12 — Activity / audit log tab

**Goal:** pure UI phase — every action has been written to `cleanup_actions` since Phase 2, this just surfaces it. Deliberately sequenced last among the "real feature" phases because it has no independent logic to build, only a read view.

**Scope (maps to `project_overview.md` §5.10; Invariant I-14):**

- Activity tab: reverse-chronological log of scans, cleans, archives, restores, bytes affected, timestamp.
- `Undo` affordance on recently-trashed items pointing to OS trash for as long as it's recoverable there.

**Depends on:** Phases 2, 3/4/5, 11 (needs real `cleanup_actions` rows from all destructive flows to be meaningful).

**Exit criteria:** every action taken across the whole app during earlier-phase testing shows up correctly here, in order, with correct byte totals.

---

## Phase 13 — Onboarding wizard

**Goal:** now that scan, AI provider setup, and the tab surfaces all exist for real, wire them into the first-run experience. Building this earlier would mean wiring it to stubs and redoing it.

**Scope (maps to `architecture.md` §4.1; `project_overview.md` §5.1, §4):**

- Full-screen modal wizard, blocks navigation until complete (`FirstRunGate` pattern) — distinguishes fresh install from update.
- Welcome → real native folder-picker + Full Disk Access prompt (macOS) with plain-language explanation → AI provider setup (Ollama pre-selected default, optional BYOK using Phase 6) → scan scope selection (replaces the Phase 1 hardcoded folder list) → triggers the real first scan (Phase 1) → results summary → lands on Overview.
- IPC: `settings:requestScanScope`, `settings:save`.

**Depends on:** Phase 1 (real scan), Phase 6 (real AI provider setup), Phase 0 (settings table).

**Exit criteria:** a completely fresh install, with no prior state, walks a new user end-to-end to a populated Overview tab without needing developer intervention.

---

## Phase 14 — Tray ("Horizon Mini")

**Goal:** secondary entry point, explicitly lightweight — no new backend logic, just a second UI surface over existing IPC calls.

**Scope (maps to `project_overview.md` §5.12, §3):**

- Tray icon + popover: reclaimable space, forecast headline (reuses Phase 8's `forecast:get`), `Clean Safe Files Now` (reuses Phase 2/3's trash flow against policy-safe items only), `Open Horizon` to bring the full window forward.

**Depends on:** Phase 2 (trash), Phase 8 (forecast headline).

**Exit criteria:** the tray popover reflects the same live numbers as the full app without requiring the main window to be open.

---

## Phase 15 — Polish, packaging, and stretch items

**Goal:** everything needed to hand a judge (or any user) a real installer, plus anything left over from the roadmap's "stretch" tier if time remains.

**Scope:**

- `electron-builder` packaging into `.dmg`/`.exe`/AppImage — single build, no bundled interpreter, per architecture §1.
- Keyboard shortcuts `⌘1`–`⌘9` across all tabs.
- Full theme QA pass — light/dark/system, consistent Purge-derived palette across all 9 tabs + tray, per project_overview §6.
- Incremental re-scan (only re-index changed paths) — deferred from Phase 1, now revisited if time allows.
- _Stretch, roadmap doc §4:_ `⌘K` command palette; scheduled/background monitoring with local notifications; further what-if simulator polish.
- Explicitly **not built at all**, per `project_overview.md` §8: mobile companion, multi-device sync/cloud accounts, cloud-storage-provider scanning, multi-user features, fully automatic/unattended deletion, billing infrastructure, deep semantic search beyond near-dup, non-primary-OS polish, telemetry.

**Depends on:** everything else being functionally complete.

**Exit criteria:** a judge installs the packaged app on a clean machine with no manually-installed dependencies and reaches a meaningful first result quickly.

---

## Feature → phase quick reference

| Feature / tab                                 | Phase | Hard dependencies |
| --------------------------------------------- | ----- | ----------------- |
| Monorepo, DB, IPC contract, theme tokens      | 0     | —                 |
| Scan & Overview v1                            | 1     | 0                 |
| Deletion safety core (policy + trash + audit) | 2     | 1                 |
| Duplicates — exact + perceptual               | 3     | 1, 2              |
| Unused Files                                  | 4     | 1, 2              |
| Large Files                                   | 5     | 1, 2              |
| AI provider (BYOK) + Settings panel           | 6     | 0                 |
| Duplicates — embedding near-dup               | 7     | 3, 6              |
| Forecast                                      | 8     | 1                 |
| Assistant — recommendation cards              | 9     | 3, 6, 8           |
| Assistant — chat                              | 10    | 6, 9              |
| Archive                                       | 11    | 2, 4, 5           |
| Activity                                      | 12    | 2, 3/4/5, 11      |
| Onboarding wizard                             | 13    | 1, 6              |
| Tray / Horizon Mini                           | 14    | 2, 8              |
| Packaging & polish                            | 15    | all               |

## Mapping to the roadmap's tiers

- **MVP / table stakes** (roadmap §4, weeks 1–2): Phases 0–5. A real, safe, themed app with scanning, exact + near-duplicate detection, unused-file detection, large-files browsing, and trash-only deletion.
- **Strong differentiators** (roadmap §4, weeks 2–3): Phases 6–11. Forecasting, AI recommendations, embedding-based near-duplicates, and archiving — the features that specifically beat Purge and satisfy the track brief's "predict future storage needs" and "intelligent... recommendations" requirements.
- **Stretch** (roadmap §4, week 4 if ahead of schedule): Chat assistant (Phase 10, if not already folded into the main timeline), tray popover (Phase 14), command palette and scheduled-notification polish (Phase 15).

## Invariant coverage by phase (spot-check before calling any phase "done")

- I-1, I-2, I-3, I-4 (destructive-action safety) → introduced Phase 2, re-verified in every phase that adds a new "Trash" or "Archive" button (3, 4, 5, 11).
- I-5, I-6, I-7 (privacy & secrets) → introduced Phase 6, re-verified in every phase that adds a new LLM call (7, 9, 10).
- I-8, I-9, I-10 (architectural boundaries) → structural, enforced continuously from Phase 0 via lint rules / code review, not tied to a single phase.
- I-11 (migrations) → any schema change in any phase must ship a `drizzle-kit` migration, no exceptions.
- I-12 (worker threads for scan/hash) → Phases 1 and 3.
- I-13 (no double-counting bytes across result sets) → check whenever Overview/Forecast aggregates are touched (Phases 1, 8).
- I-14 (audit log integrity) → Phase 2 onward, verified end-to-end in Phase 12.
- I-15 (IPC payload validation) → every new IPC channel added in every phase, checked against its `packages/shared-types` schema before merge.
