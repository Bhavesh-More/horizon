# 0003. Large file management

**Date**: 2026-08-17
**Status**: Proposed

## Summary

Large file management provides a browser for high capacity files queried directly from the existing `file_index` table, sorted and filtered across size thresholds, categories, and dates. It includes native operating system file reveal capabilities, Quick Look style previews, multi select batch trashing, and completes the table stakes MVP tier for Horizon. Like unused files, this is a query driven view requiring no new database tables and no new worker threads.

## Context

Phases 0 through 4 established the scanning engine, the deletion safety core, duplicate detection, and unused file detection. Large file management (Phase 5) is the third and final query driven tab over `file_index` that completes the MVP checkpoint defined in the build plan.

Users frequently have a small handful of oversized files (installers, virtual machine disks, screen recordings, media caches, database dumps) occupying disproportionate disk space. Purge app established an intuitive large files browser pattern with size thresholds (such as 5 MB, 50 MB, 100 MB, 500 MB, 1 GB), category filter chips, sorting by size or date or name, and quick file inspection before deletion.

This feature requires two operating system integrations from Electron: revealing the file in Finder (macOS) or File Explorer (Windows) via `shell.showItemInFolder`, and previewing files safely. It connects to the deletion safety core built in Phase 2 for reversible trashing.

## Requirements

**User stories**:
- As a user, I want to filter and find the largest files on my disk so that I can quickly free up substantial storage.
- As a user, I want to sort large files by size, date, or name and filter them by category.
- As a user, I want to reveal a file in Finder or File Explorer to see its enclosing folder before making a cleanup decision.
- As a user, I want to select multiple large files and safely move them to Trash with confirmation.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Files in `file_index` where `size_bytes` is greater than or equal to `minSizeBytes` and `removed_at IS NULL` appear in the Large Files list.
- **AC-2**: Users can filter large files by minimum size presets (such as 5 MB, 50 MB, 100 MB, 500 MB, 1 GB) or a custom threshold with immediate UI updates and no re scan.
- **AC-3**: Users can filter by file category (image, video, audio, document, archive, dev_artifact, other).
- **AC-4**: Users can sort results by `size` (descending/ascending), `date` (modified/accessed descending/ascending), or `name` (alphabetical ascending/descending).
- **AC-5**: Each file row provides a "Reveal in Finder" (or File Explorer) action that invokes `shell.showItemInFolder` in the main process without throwing errors if the file was moved externally.
- **AC-6**: Multi select with "Select All" / "Deselect All" enables bulk "Move to Trash" using the existing `cleanup:trash` flow with `ConfirmationModal` showing exact paths and total size.
- **AC-7**: The tab header displays a summary with total matching file count and total reclaimable bytes.
- **AC-8**: An "Archive" button is present and disabled with guidance indicating archive bundle creation arrives in Phase 11.

## Options considered

### Option 1: Direct SQL query over file_index with indexed filters (Recommended)

Query the `file_index` table directly with dynamic SQL conditions (`size_bytes >= ?`, `category = ?`, `removed_at IS NULL`) and ordering clauses (`ORDER BY size_bytes DESC` or `ORDER BY modified_at DESC` or `ORDER BY path ASC`).

**Pros**:
- Zero database migrations or new tables
- Always consistent with latest scan data
- Fast query execution using SQLite indexes on `size_bytes` and `category`

**Cons**:
- Sorting by file name requires in memory or table scan sorting if not indexed, but acceptable for filtered sets (typically < 1,000 large files)

### Option 2: Precomputed large files cache table

Maintain a separate `large_files` table updated on every scan run.

**Pros**:
- Marginal microsecond read speed gains

**Cons**:
- Violates architecture §4.5 specification ("a filtered/sorted query over `file_index`")
- Requires migration, invalidation logic, and sync overhead

## Decision

**Chosen option**: Option 1: Direct SQL query over `file_index` with indexed filters

Aligns with architecture §4.5 and the pattern proven in Phase 4 (Unused files). SQLite effortlessly handles filtered ordering over single user index sizes.

## Rationale

The `file_index` table is already indexed and populated during scanning. High performance desktop disk optimization tools like Purge perform dynamic queries over indexed file metadata rather than maintaining redundant tables. This keeps code simple, maintainable, and free of cache synchronization bugs.

## Feature design

**Data model sketch**:

Reads from existing `file_index` table:
- `id` (integer, primary key)
- `path` (text, unique)
- `sizeBytes` (integer)
- `extension` (text, nullable)
- `category` (text)
- `modifiedAt` (text, nullable)
- `accessedAt` (text, nullable)
- `createdAt` (text, nullable)
- `removedAt` (text, nullable, filter out non null)

**API surface**:

| Channel | Direction | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `large-files:list` | invoke (renderer → main) | `minSizeBytes?: number`, `category?: string`, `sortBy?: "size" \| "date" \| "name"`, `sortOrder?: "asc" \| "desc"`, `limit?: number` | `{ files: LargeFileItem[], totalFiles: number, totalSizeBytes: number }` | n/a (local) | `LARGE_FILES_LIST_FAILED` |
| `system:showInFolder` | invoke (renderer → main) | `path: string` | `{ ok: boolean }` | n/a (local) | `SYSTEM_SHOW_FAILED` |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `large-files:list` | `totalFiles` | COUNT of rows matching filters |
| `large-files:list` | `totalSizeBytes` | SUM of `sizeBytes` of matching rows |
| `large-files:list` | `files[].path` | `file_index.path` column |
| `large-files:list` | `files[].sizeBytes` | `file_index.size_bytes` column |
| `large-files:list` | `files[].category` | `file_index.category` column |
| `large-files:list` | `files[].modifiedAt` | `file_index.modified_at` or `accessed_at` |
| `system:showInFolder` | native window highlight | Electron `shell.showItemInFolder(path)` |
| Size preset filter | `minSizeBytes` | User button click (5MB, 50MB, 100MB, 500MB, 1GB) |
| Sort filter | `sortBy`, `sortOrder` | User dropdown/pill selection |
| Category filter | `category` | User category filter pill selection |

**Key invariants**:
- I-1: All file deletion goes through `trash.ts` only
- I-2: Server side re validation via `deletion-policy.ts` on every trash request
- I-4: Files with non null `removed_at` are never returned
- I-15: IPC payload validated using Zod schemas at the IPC boundary

**Security model**:
Local only, single user. Path strings sent to `system:showInFolder` are checked to ensure they are valid non empty strings before passing to Electron shell APIs.

**Critical test scenarios**:
- Happy path: Querying with `minSizeBytes = 52428800` (50 MB) returns only files >= 50 MB, sorted descending by size, verifies **AC-1**, **AC-2**, **AC-4**, **AC-7**
- Category filter: Filtering by `category = "video"` returns only large videos, verifies **AC-3**
- Sort options: Sorting by `date` orders newest files first; sorting by `name` orders alphabetically, verifies **AC-4**
- Reveal in Finder: Clicking reveal sends valid path to main and executes `shell.showItemInFolder`, verifies **AC-5**
- Trash flow: Selecting large files and confirming deletion calls `cleanup:trash`, moves them to OS trash, records in `cleanup_actions`, and updates UI, verifies **AC-6**

## Build plan

1. **Create `packages/shared-types/src/large-files.ts`**: Define `LargeFilesListRequestSchema`, `LargeFileItemSchema`, and `LargeFilesListResponseSchema`. Re-export in `packages/shared-types/src/index.ts`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
2. **Create `apps/desktop/src/main/services/large-files.ts`**: Implement `getLargeFiles(options)` querying `file_index` with dynamic `minSizeBytes`, `category`, `sortBy`, `sortOrder`, and `limit`. Calculate `totalFiles` and `totalSizeBytes`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**.
3. **Create `apps/desktop/src/main/ipc/large-files.ts` & `apps/desktop/src/main/ipc/system.ts`**: Implement `large-files:list` and `system:showInFolder` IPC handlers. Register in `apps/desktop/src/main/index.ts`. Satisfies **AC-1**, **AC-5**.
4. **Update `apps/desktop/src/preload/index.ts` & `global.d.ts`**: Expose `window.horizon.largeFiles.list()` and `window.horizon.system.showInFolder()` on preload bridge and Window interface. Satisfies **AC-1**, **AC-5**.
5. **Create `apps/desktop/src/renderer/src/components/LargeFilesTab.tsx`**: Build Large Files tab with size preset pills (5MB, 50MB, 100MB, 500MB, 1GB+), category filter chips, sorting controls, file item rows with "Reveal in Folder" action, multi-select, and `ConfirmationModal` integration. Satisfies **AC-1** through **AC-8**.
6. **Wire `LargeFilesTab` into `App.tsx`**: Replace placeholder tab container with persistent `LargeFilesTab` component.
7. **Testing & Verification**: Add unit tests for `large-files.ts` service and shared schemas, run `yarn test`, `yarn typecheck`, and update progress tracker and UI registry.

## Consequences

**Positive**:
- Reaches the Phase 5 MVP checkpoint where all table stakes storage cleaning features are complete.
- Adds native operating system file manager inspection (`showItemInFolder`).
- Purely additive with zero database schema migrations.

**Negative / tradeoffs**:
- Custom threshold input requires debounce to avoid unnecessary rapid SQLite queries.

## Follow-up

- [ ] Connect Quick Look preview shortcut (`Spacebar`) when a file row is focused (Phase 15 polish)
- [ ] Connect Archive action in Phase 11
