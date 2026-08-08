# 0001. Deletion safety core

**Date**: 2026-08-07  
**Status**: Proposed

## Summary

This specification defines the deletion safety subsystem for Horizon. It establishes a main process policy engine, a single sanctioned file removal service, an audit log table, and a shared renderer confirmation modal. All file removal operations strictly move files to operating system trash, and every request is revalidated in the main process before execution.

## Context

Desktop storage cleaning tools often suffer from low user trust because of risky or unrecoverable file deletions. Users worry that an automated scanner will permanently delete critical system files or personal documents. To earn user confidence, Horizon separates safety evaluation from file removal and strictly enforces reversible deletions. The renderer interface is never trusted as the sole authority for file safety. Every file removal request must pass a main process policy evaluation that enforces safety tiers and system location blocklists.

## Requirements

**User stories**:
- As a user, I want all deleted files moved to my operating system trash so that I can recover anything deleted by mistake.
- As a user, I want clear confirmation modals displaying exactly what will be removed, how much space is freed, and the safety level of the items.
- As a system component, I want all deletion requests validated on the main process before execution so that unsafe renderer requests are blocked.

**Acceptance criteria**:
- **AC-1**: Every file deletion request is evaluated by `deletion-policy.ts` in the main process, blocking protected system locations and dangerous paths regardless of renderer parameters.
- **AC-2**: File removal is exclusively executed by `trash.ts` calling the `trash` npm package to send files to operating system trash, with zero direct unlinks or unrecoverable delete calls.
- **AC-3**: Successful trash operations record an audit row in `cleanup_actions` and set `removed_at` on target `file_index` rows, executed only after file removal succeeds.
- **AC-4**: The `cleanup:trash` IPC handler validates request payloads against `CleanupTrashRequestSchema` in `packages/shared-types` and returns standardized ok or error response envelopes.
- **AC-5**: A shared `ConfirmationModal` component in `packages/ui` renders file counts, total reclaimable bytes, safety tier indicators, and clear undo guidance using design system tokens.
- **AC-6**: Vitest unit tests verify `deletion-policy.ts` allow and block rules, system path blocklists, `trash.ts` failure handling, and audit record creation.

## Options considered

### Option 1: Main process policy engine with native trash wrapper and IPC revalidation

The main process evaluates every deletion request using a dedicated policy engine, forwards approved paths to the `trash` package, and logs the result to an audit table. The renderer interface acts only as a presentation layer.

**Pros**:
- Guarantees complete safety enforcement regardless of client side bugs or tampered IPC calls.
- Preserves user files in operating system trash for full reversibility.
- Maintains an accurate audit trail of all destructive actions.

**Cons**:
- Requires an additional IPC round trip for policy validation and execution.

### Option 2: Renderer side policy filtering with direct node filesystem unlinking

The renderer filters files based on local state and directly invokes main process filesystem unlink commands.

**Pros**:
- Slightly simpler IPC handler setup.

**Cons**:
- Violates core architectural safety invariants by trusting renderer UI state.
- Permanent file unlinking causes unrecoverable data loss if a wrong path is passed.

## Decision

**Chosen option**: Option 1: Main process policy engine with native trash wrapper and IPC revalidation.

This option enforces safety invariants I-1, I-2, I-14, and I-15, guaranteeing that user files are never permanently unlinked and every destructive action is audited.

## Feature design

**Data model sketch**:
Table `cleanup_actions`:
- `id` (INTEGER, Primary Key, Auto Increment)
- `action_type` (TEXT, Not Null, CHECK action_type IN ('trash', 'archive', 'restore'))
- `file_paths_json` (TEXT, Not Null)
- `bytes_freed` (INTEGER, Not Null)
- `performed_at` (TEXT, Not Null)
- `related_archive_id` (INTEGER, Foreign Key to archives.id, Nullable)

Table `file_index` modification on cleanup:
- `removed_at` (TEXT, set to UTC timestamp on successful trash)

**API surface**:
| Channel | Type | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| cleanup:trash | IPC invoke | fileIds: number[] | freedBytes: number, trashedCount: number | Local IPC | INVALID_PAYLOAD, POLICY_BLOCKED, TRASH_FAILED |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| cleanup:trash | Request file IDs | Payload fileIds validated against CleanupTrashRequestSchema |
| deletion-policy evaluation | Safety approval state (allow / block) | deletion-policy.ts evaluation against system blocklists |
| cleanup:trash | Freed bytes and trashed count | Calculated from matching file_index rows approved by policy |
| cleanup_actions entry | Audit record | Written to SQLite cleanup_actions table after trash call succeeds |

**Key invariants**:
- **I-1**: No unrecoverable deletes on user files. Removal goes strictly through `trash.ts`.
- **I-2**: Re-validation in main process via `deletion-policy.ts` before any file is removed.
- **I-14**: Every `cleanup_actions` row corresponds to a real, completed filesystem operation.
- **I-15**: Payload validated against `CleanupTrashRequestSchema` before processing.

**Security model**:
The Electron main process serves as the trust boundary. Input arrays are validated with Zod and evaluated against system path blocklists (for example `/System`, `/Library`, `/bin`, `/usr`, `/Windows`, `/Program Files`). Unauthorized or system paths are rejected immediately.

**Configuration required**:
None. Uses standard operating system trash facilities.

**Critical test scenarios**:
- Happy path: Valid user file IDs approved by policy, successfully trashed, audit row created, `file_index.removed_at` updated, satisfies **AC-1**, **AC-2**, **AC-3**.
- System path block: Attempt to trash a file located in a system directory is blocked by `deletion-policy.ts`, returns error code `POLICY_BLOCKED`, satisfies **AC-1**, **AC-4**.
- Trash failure: Operating system trash command failure is caught, error response returned, no audit entry written, satisfies **AC-3**, **AC-4**, **AC-6**.

## Build plan

1. Define `CleanupTrashRequestSchema` and `CleanupTrashResponseSchema` in `packages/shared-types/src/index.ts`, satisfies **AC-4**.
2. Implement `deletion-policy.ts` in `apps/desktop/src/main/services/deletion-policy.ts` with two-tier evaluation and path blocklists, satisfies **AC-1**.
3. Implement `trash.ts` service in `apps/desktop/src/main/services/trash.ts` wrapping `trash` npm package, satisfies **AC-2**.
4. Define `cleanup_actions` table in `apps/desktop/src/main/db/schema.ts` and run Drizzle migration, satisfies **AC-3**.
5. Implement IPC handler `cleanup:trash` in `apps/desktop/src/main/ipc/cleanup.ts` with schema validation, policy evaluation, trashing, and audit logging, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
6. Create shared `ConfirmationModal` primitive in `packages/ui/src/ConfirmationModal.tsx` utilizing design tokens and safety tags, satisfies **AC-5**.
7. Write unit test suites in `apps/desktop/src/main/services/deletion-policy.test.ts` and `trash.test.ts`, satisfies **AC-6**.

## Consequences

**Positive**:
- Guarantees complete reversibility for all file deletion actions.
- Prevents accidental deletion of operating system files or system directories.
- Provides a clear audit trail for all cleanup activities.

**Negative / tradeoffs**:
- Trashing large numbers of files requires operating system trash storage availability.

**Neutral**:
- Files remain in OS trash until the user explicitly empties OS trash.

## References

**Project sources**:
- `AGENTS.md` and `context/architecture.md` (Invariants I-1, I-2, I-14, I-15)
- `context/ui-tokens.md` and `context/ui-rules.md` (Design tokens for `ConfirmationModal`)
- `context/build-plan.md` (Phase 2 requirements)

**Practices & standards**:
- Principle of least privilege / trust boundary isolation in Electron main process
- Reversible destructive action design pattern
