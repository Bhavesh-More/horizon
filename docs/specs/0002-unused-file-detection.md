# 0002. Unused file detection

**Date**: 2026-08-17
**Status**: Proposed

## Summary

Unused file detection surfaces files that have not been accessed (or modified, as a documented fallback) beyond a user configurable staleness threshold, queried directly from the existing `file_index` table with no new scan or worker. The feature adds a staleness service in the main process, a typed IPC channel, and a full Unused Files tab with a threshold slider, category grouping, multi select, and integration with the existing trash flow. This is a query only feature: no new database tables, no new workers, no new scan passes.

## Context

Phases 0 through 3 established the data backbone (`file_index` with `accessed_at` indexed), the deletion safety core (`deletion-policy.ts`, `trash.ts`, `cleanup.ts`, `cleanup_actions`), and the first query driven tab (Duplicates). Phase 4 is the second tab that reads `file_index`, and it is sequenced here because it depends on both the scan data and the trash flow, both of which now exist and are proven.

The `file_index` table already stores `accessed_at` (nullable) and `modified_at` for every indexed file, and `accessed_at` is already indexed (`idx_file_index_accessed`). The staleness query is a filtered read over this existing data, making this the cheapest remaining feature to ship. The Duplicates tab provides a proven UI pattern (grouped results, multi select, confirmation modal, trash integration) that this tab replicates with a different data source and a different grouping axis (category instead of hash).

One OS level caveat shapes the design: macOS with `noatime` mounts (common on APFS SSDs) does not reliably update `atime`. The architecture document (§4.4) and project overview (§6) both require that when `accessed_at` is null or unreliable, `modified_at` is used as a documented fallback, and the fallback is made visible to the user (not silently substituted).

## Requirements

**User stories**:
- As a user, I want to see which files I have not opened in a long time so that I can decide whether to trash or archive them.
- As a user, I want to adjust the staleness threshold so that I can control how aggressively unused files are surfaced.
- As a user, I want to filter unused files by category so that I can focus on one type at a time (for example, just videos or just documents).

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Files in `file_index` where `accessed_at` (or `modified_at` fallback) is older than the specified `thresholdDays` and `removed_at IS NULL` appear in the Unused Files list.
- **AC-2**: When `accessed_at` is null for a file, `modified_at` is used instead, and the UI displays a visible indicator (tooltip or badge) stating "Last modified used as fallback" for that file.
- **AC-3**: The staleness threshold is adjustable via a slider (range: 30 days to 730 days, default 180 days), and changing it re queries results without triggering a new scan.
- **AC-4**: Results are grouped by file category (matching `FileCategoryEnum`: image, video, audio, document, archive, dev_artifact, other), each group header showing file count and total size.
- **AC-5**: Users can optionally filter to a single category, which hides all other groups.
- **AC-6**: Multi select with "Select All" / "Deselect All" enables bulk "Move to Trash" using the existing `cleanup:trash` IPC flow, with the Phase 2 confirmation modal displaying exact file names and total size.
- **AC-7**: The tab header shows a summary: total unused file count and total reclaimable bytes across all groups.
- **AC-8**: An "Archive" button is present but disabled (or shows a "coming soon" tooltip), since archive infrastructure is Phase 11.

## Options considered

### Option 1: Query only (no new table, no caching)

Run the staleness query directly against `file_index` on every request. The `accessed_at` column is already indexed. No new tables, no denormalization.

**Pros**:
- Zero schema changes, zero migration
- Always fresh (no stale cache to invalidate)
- Matches the architecture document's explicit direction (§4.4: "No dedicated table, this is a query, not a stored result")

**Cons**:
- On very large indexes (100k+ files) the filtered query could take tens of milliseconds, though the existing index makes this unlikely to be a real bottleneck

### Option 2: Materialized staleness table

Precompute stale files into a dedicated `unused_files` table after each scan, read the tab from that table.

**Pros**:
- Instant reads from a pre filtered table

**Cons**:
- Contradicts the architecture document (§4.4 explicitly says "a query, not a stored result")
- Adds a new table, a new migration, and a new invalidation lifecycle to maintain
- Introduces a staleness window (the cached result diverges from the real `file_index` until the next scan)

## Decision

**Chosen option**: Option 1: Query only (no new table, no caching)

The architecture document explicitly prescribes this approach. The `idx_file_index_accessed` index already exists. A filtered query on an indexed column over a table of 10k to 100k rows completes in single digit milliseconds in SQLite. There is no measured performance problem to solve with denormalization.

## Rationale

The architecture (§4.4) is unambiguous: unused file detection is "a filtered query over the same `file_index`" with "no dedicated table." The existing index on `accessed_at` makes this fast. Introducing a materialized table would contradict the documented architecture, add migration and invalidation complexity, and solve a performance problem that does not exist at the scale this application operates at (a single user's local disk, typically under 500k files, usually under 100k).

## Feature design

**Data model sketch**:

No new tables. Reads from existing `file_index`:
- `id` (PK, integer): file record identifier
- `path` (text, unique): absolute file path
- `sizeBytes` (integer): file size
- `extension` (text, nullable): file extension
- `category` (text): one of FileCategoryEnum values
- `accessedAt` (text, nullable): ISO timestamp of last access, may be null on noatime mounts
- `modifiedAt` (text, nullable): ISO timestamp of last modification, used as fallback when `accessedAt` is null
- `removedAt` (text, nullable): non null means already trashed, excluded from results

Relevant existing index: `idx_file_index_accessed` on `accessedAt`.

**API surface**:

| Channel | Direction | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `unused-files:list` | invoke (renderer → main) | `thresholdDays: number` (required, 30..730), `category?: FileCategoryEnum`, `scanRunId?: number` | `{ groups: UnusedFileGroup[], totalFiles: number, totalReclaimableBytes: number }` | n/a (local) | `UNUSED_FILES_LIST_FAILED` |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `unused-files:list` | `totalFiles` | COUNT of rows matching the staleness query |
| `unused-files:list` | `totalReclaimableBytes` | SUM of `sizeBytes` of rows matching the staleness query |
| `unused-files:list` | `groups[].category` | `file_index.category` column directly |
| `unused-files:list` | `groups[].files[].lastActivity` | `file_index.accessed_at` if non null, else `file_index.modified_at` |
| `unused-files:list` | `groups[].files[].usedFallback` | Boolean: true when `accessed_at` IS NULL and `modified_at` was used instead |
| `unused-files:list` | `groups[].fileCount` | COUNT of files in that category group |
| `unused-files:list` | `groups[].totalSizeBytes` | SUM of `sizeBytes` within that category group |
| Staleness slider | `thresholdDays` | User interaction, local React state, default 180 |
| Category filter | `category` | User interaction, local React state, default undefined (all) |
| Trash action | `fileIds` | `selectedFileIds` Set from multi select UI state |
| Trash confirmation | Item list, total size | Derived from selected files in the current query result |

**Key invariants**:
- I-1: All file removal goes through `trash.ts`, never `fs.rm`/`fs.unlink`
- I-2: Every trash request is re validated by `deletion-policy.ts` in main, even though the renderer pre filters
- I-9: The IPC payload is validated against a zod schema in `shared-types` before any service call
- I-14: Every successful trash operation writes a `cleanup_actions` audit record
- I-15: The `unused-files:list` request is validated against `UnusedFilesListRequestSchema` at the IPC boundary
- Staleness fallback: when `accessed_at` IS NULL, `modified_at` is used and the fallback is surfaced to the user (never silently substituted)

**Security model**:
Local only, single user, no network. The renderer never touches `file_index` directly; all queries go through the IPC bridge. The main process re validates trash requests against `deletion-policy.ts` (Invariant I-2).

**Configuration required**:
None. No new environment variables or secrets. The staleness threshold is a UI control, not a configuration value (it defaults to 180 days and is adjustable per session via the slider, with potential persistence in `settings` table as a future enhancement).

**Critical test scenarios**:
- Happy path: Given files with `accessed_at` older than 180 days and `removed_at IS NULL`, the query returns them grouped by category with correct counts and total sizes, verifies **AC-1**, **AC-4**, **AC-7**
- Fallback case: Given files where `accessed_at` IS NULL but `modified_at` is older than threshold, they appear in results with `usedFallback: true`, verifies **AC-2**
- Threshold change: Changing the slider from 180 to 365 days re queries and returns fewer results (only files untouched for 365+ days), with no re scan triggered, verifies **AC-3**
- Category filter: Setting category filter to "video" shows only video group results, verifies **AC-5**
- Trash flow: Selecting files and confirming trash sends `fileIds` to `cleanup:trash`, which re validates against policy, moves to OS trash, updates `removed_at`, writes `cleanup_actions`, and refreshes the list, verifies **AC-6**
- Already removed: Files with `removed_at` non null never appear in results, verifies **AC-1**

## Build plan

1. **Create `packages/shared-types/src/unused-files.ts`**: Define `UnusedFilesListRequestSchema` (`thresholdDays: z.number().int().min(30).max(730)`, `category?: FileCategoryEnum`, `scanRunId?: z.number().int().positive().optional()`), `UnusedFileItemSchema` (`fileId, path, sizeBytes, extension?, category, lastActivity: string, usedFallback: boolean`), `UnusedFileGroupSchema` (`category, fileCount, totalSizeBytes, files: UnusedFileItem[]`), `UnusedFilesListResponseSchema` (`groups, totalFiles, totalReclaimableBytes`). Export from `packages/shared-types/src/index.ts`. Satisfies **AC-1**, **AC-2** (schema defines `usedFallback` field).

2. **Create `apps/desktop/src/main/services/staleness.ts`**: Implement `getUnusedFiles(thresholdDays: number, category?: string, scanRunId?: number)` that queries `file_index` for rows where COALESCE(`accessed_at`, `modified_at`) is older than `thresholdDays` from now, `removed_at IS NULL`, optionally filtered by `category` and `scanRunId`. Groups results by category, computes per group `fileCount` and `totalSizeBytes`, marks each file's `usedFallback` when `accessed_at` IS NULL. Returns typed response matching `UnusedFilesListResponseSchema`. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-7**.

3. **Create `apps/desktop/src/main/ipc/unused-files.ts`**: Register `unused-files:list` handler following the existing validation + delegation pattern: validate payload with `UnusedFilesListRequestSchema`, delegate to `getUnusedFiles()`, return `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Register in `main/ipc/index.ts` or equivalent. Satisfies **AC-1** (IPC wiring).

4. **Update `apps/desktop/src/preload/index.ts`**: Add `unusedFiles` namespace to `window.horizon` with `list(thresholdDays: number, category?: string)` method that invokes `unused-files:list`. Satisfies **AC-1**, **AC-3** (client can call with different thresholds).

5. **Update `apps/desktop/src/preload/global.d.ts`**: Add TypeScript types for the new `unusedFiles` surface on `Window['horizon']`. Satisfies **AC-1** (type safety).

6. **Create `apps/desktop/src/renderer/src/components/UnusedFilesTab.tsx`**: Build the tab following the DuplicatesTab pattern. Includes: summary header (total count + total reclaimable bytes, **AC-7**), staleness slider (30 to 730 days, default 180, debounced re query on change, **AC-3**), category filter chips (all + each `FileCategoryEnum` value, **AC-5**), grouped result display with category headers showing count and size (**AC-4**), file rows with path, size, last activity date, and fallback indicator (**AC-2**), multi select with "Select All"/"Deselect All" (**AC-6**), "Move to Trash" button wired to `window.horizon.cleanup.trash()` through `ConfirmationModal` (**AC-6**), and a disabled "Archive" button with tooltip (**AC-8**).

7. **Wire `UnusedFilesTab` into `App.tsx`**: Import and render inside the existing "Unused Files" tab container (already present as a placeholder label in the sidebar). Satisfies **AC-1** through **AC-8** (feature accessible).

## Consequences

**Positive**:
- No schema change, no migration, no new worker threads. Purely additive code.
- Reuses the proven trash flow (policy validation, `trash.ts`, `cleanup_actions` audit) with zero modification.
- Follows the exact same IPC + service + preload + tab pattern established in Phases 1 through 3, reducing cognitive load for the developer.
- The `idx_file_index_accessed` index already exists, so no DB performance concern.

**Negative / tradeoffs**:
- The COALESCE fallback means files on noatime mounts whose `accessed_at` is null but `modified_at` is recent will not appear as "unused" even if they genuinely are unused; this is a deliberate conservative choice (false negative is safer than false positive for a cleanup tool).
- No persistence of the threshold preference in this phase. The slider resets to 180 days on tab remount. Persistence via the `settings` table is a follow up.

**Neutral**:
- Archive integration is stubbed (button present, disabled). It becomes functional in Phase 11 with no changes to this spec.

## Follow-up

- [ ] Persist the staleness threshold preference in the `settings` table (Phase 15 polish or Settings tab enhancement)
- [ ] Wire the "Archive" button to the real archive flow once Phase 11 ships
- [ ] Add per category staleness thresholds (project overview §6 mentions "independently settable for different scan categories") as a Settings tab enhancement
