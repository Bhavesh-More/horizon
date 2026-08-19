# 0009. Archiving

**Date**: 2026-08-19
**Status**: Complete

## Summary

Phase 11 adds archive bundles as a reversible storage action. Horizon writes selected files into a verified zip bundle, and only then moves originals to operating system Trash. Archive records can be listed, inspected without extraction, and restored to the original paths.

## Context

Horizon already has safe trashing, file index rows, duplicate views, unused file views, and large file views. Archiving must reuse those safety boundaries rather than creating a second removal path. The feature also needs its own database record so a bundle can be found and restored later.

The architecture names zip or tar zst bundles. Zip is chosen for this phase because it can be implemented with Node built in modules and the app does not need a new native dependency.

## Requirements

**User stories**:
- As a cautious storage user, I want to archive selected files before removing originals so that I can reclaim space without losing the content path.
- As a user reviewing old files, I want to see archive bundles and their contents so that I know what Horizon stored.
- As a user who needs a file back, I want to restore an archive to the original paths so that the action is reversible.

**Acceptance criteria**:
- **AC-1**: Creating an archive compresses selected active `file_index` rows into a dated zip bundle at the archive destination.
- **AC-2**: Originals are moved to Trash only after the archive is opened and its entry listing is verified against the selected files.
- **AC-3**: A compression or verification failure leaves source rows unmodified and does not call `trash.ts`.
- **AC-4**: Successful archiving writes an `archives` row with `status=active` and a paired `cleanup_actions` row with `action_type=archive`.
- **AC-5**: `archive:list` returns active and restored bundles with path, size, original bytes, contents count, created time, and status.
- **AC-6**: `archive:restore` extracts bundle entries to their original paths by default, updates `archives.status=restored`, clears restored `file_index.removed_at` rows, and writes a `cleanup_actions` row with `action_type=restore`.
- **AC-7**: The Archive tab renders bundle list, contents preview, empty, loading, error, and restore states.
- **AC-8**: Duplicates, Unused Files, and Large Files expose real Archive actions for the selected file ids.
- **AC-9**: Every archive IPC request is validated through `packages/shared-types`.

## Options considered

### Option 1: Zip bundle with internal writer

Write zip files with Node `zlib`, a small central directory writer, and a matching reader for verification and restore.

**Pros**:
- No new package or native module.
- Cross platform bundle format.
- Easy to inspect without extracting.

**Cons**:
- The app owns a small zip implementation and tests.

### Option 2: Add an archive dependency

Use a package such as `yazl`, `archiver`, or `adm-zip`.

**Pros**:
- Less custom archive format code.
- More mature edge case handling.

**Cons**:
- New dependency decision and packaging risk in a destructive path.
- More review surface near file removal.

### Option 3: Use platform commands

Call `zip`, `ditto`, or PowerShell compression.

**Pros**:
- Small TypeScript surface.
- Native tools are usually fast.

**Cons**:
- Not consistently available across macOS, Windows, and Linux.
- Harder to test and package predictably.

## Decision

**Chosen option**: Option 1: Zip bundle with internal writer

Horizon will create and verify zip bundles using Node built in modules, without adding a third party archive package in Phase 11.

**Implementation skills**: `develop` (`horizon`, `.agents/skills/develop/`) · `tailwind` (`horizon`, `.agents/skills/tailwind-css/`)

## Rationale

Phase 11 sits directly next to destructive safety invariants. Avoiding a new archive dependency keeps the build predictable and gives tests full control over the failure points. Zip also satisfies the build plan and gives users a familiar bundle file they can move or inspect outside the app.

## Feature design

**Data model sketch**:
- `archives`
  - `id`: integer primary key.
  - `bundle_path`: required unique text path to the zip file.
  - `destination_dir`: required text.
  - `contents_json`: required JSON array of file id, original path, archive entry path, size, modified time, and category.
  - `original_file_count`: required integer.
  - `original_bytes`: required integer.
  - `archive_size_bytes`: required integer.
  - `status`: required text, `active`, `restored`, or `deleted`.
  - `created_at`: required ISO timestamp.
  - `restored_at`: nullable ISO timestamp.

**State transitions**:

```text
active -> restored
active -> deleted (reserved for later permanent bundle removal)
restored -> active is not allowed
deleted -> restored is not allowed
```

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `archive:create` | IPC invoke | `fileIds:number[]`, `destinationDir?:string` | archive record, archived count, trashed count, blocked count, failed count | internal IPC | invalid payload, blocked path, archive verification failed, trash failed |
| `archive:list` | IPC invoke | none | archive records | internal IPC | load failed |
| `archive:restore` | IPC invoke | `archiveId:number`, `restoreRoot?:string` | archive id, restored count, restored bytes | internal IPC | invalid payload, archive missing, invalid status, extraction failed |
| `archive:contents` | IPC invoke | `archiveId:number` | content entries | internal IPC | archive missing |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Create archive | selected file paths and bytes | active `file_index` rows for input `fileIds` |
| Create archive | destination directory | input `destinationDir`, else default `~/Horizon Archives` |
| Create archive | bundle file name | current timestamp and archive id safe random suffix |
| Create archive | archive entries | derived relative names from original paths with collision safe prefixes |
| Verify archive | entry names and uncompressed sizes | zip central directory read from created bundle |
| Trash originals | approved paths | `deletion-policy.ts` result over selected paths |
| Audit archive | affected paths and freed bytes | successfully trashed selected rows |
| List archives | bundle summary | `archives` table |
| Preview contents | file list | `archives.contents_json` |
| Restore archive | restore target paths | original paths from `contents_json`, or input `restoreRoot` plus safe relative entry name |
| Audit restore | restored paths and bytes | extracted files from bundle entries |

**Key invariants**:
- No source file is moved to Trash before the zip bundle has been written and verified.
- `trash.ts` remains the only module that removes originals from the active filesystem.
- `file_index` rows are soft removed by `removed_at`, never hard deleted.
- A cleanup audit row is written only after the archive or restore operation succeeds.
- Restore rejects path traversal entries.

**Security model**:

Renderer can request archive operations by file id only. Main process revalidates all file rows, deletion policy, archive destination, and zip entries. No renderer code touches the filesystem directly.

**Configuration required**:

No new environment variables or credentials are required.

**Critical test scenarios**:
- Happy path: archive two files, verify bundle, trash originals, write archive and cleanup rows, verifies **AC-1**, **AC-2**, **AC-4**.
- Failure path: forced verification failure leaves files active and never calls trash, verifies **AC-3**.
- Restore path: restore an active archive to original paths and write restore audit, verifies **AC-6**.
- Contract path: invalid archive payload fails zod validation, verifies **AC-9**.

## Build plan

1. Add archive shared schemas, Drizzle table, and migration, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-9**.
2. Implement zip helpers and `archiver.ts` create, verify, list, contents, and restore service methods, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
3. Add `archive` IPC handlers, register them, and expose the preload bridge, satisfies **AC-5**, **AC-6**, **AC-9**.
4. Build the Archive tab bundle list, content preview, restore action, and states, satisfies **AC-7**.
5. Wire Archive buttons in Duplicates, Unused Files, and Large Files, satisfies **AC-8**.
6. Add focused tests for zip verification, failure ordering, restore, and shared schemas, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-9**.
7. Update context docs after verification, satisfies **AC-7**, **AC-8**.

## Consequences

**Positive**:
- Archiving becomes a real reversible action, not a delete variant.
- Safety invariants remain centralized in the main process.
- No third party archive dependency is added.

**Negative / tradeoffs**:
- The first zip implementation supports regular files only.
- Very large archives are built in process in Phase 11.

**Neutral**:
- The `deleted` archive state is reserved for a later permanent bundle removal flow.

## Follow-up

- [ ] Add archive destination settings in the Settings phase.
- [ ] Add permanent archive bundle deletion when Activity and undo flows exist.
