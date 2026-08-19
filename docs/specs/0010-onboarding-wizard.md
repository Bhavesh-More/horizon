# 0010 · Onboarding Wizard

**Status**: Complete
**Date**: 2026-08-19

## Requirements

- **AC-1**: On a fresh install, Horizon shows a full screen `FirstRunGate` overlay before normal navigation can be used.
- **AC-2**: The wizard presents the product flow in order: welcome, permission and folder selection, AI provider setup, scan scope review, first scan, results summary.
- **AC-3**: Folder selection uses a main process native directory picker through typed IPC, not renderer file system access.
- **AC-4**: The selected scan scope is persisted and replaces the previous hardcoded Overview scan scope.
- **AC-5**: The AI setup step uses the existing Phase 6 provider state, keeps Ollama as the default, and never exposes or stores API keys in the wizard.
- **AC-6**: The first scan uses the real `scan:start` and `scan:progress` IPC channels and blocks completion until a terminal scan event is received.
- **AC-7**: Completing the wizard persists onboarding completion and returns the user to Overview with the scan results visible.

## Decision

Build Phase 13 as an end to end slice across shared contracts, main process settings persistence, preload bridge, and renderer UI.

The onboarding state and scan scope live in the existing architecture's `settings` table as simple key value rows:

- `onboarding.completed`
- `onboarding.completed_at`
- `scan.scope`
- `onboarding.ai_provider_skipped`

The renderer can only access this through typed preload methods under `window.horizon.settings`.

## Feature Design

The wizard is a full screen modal overlay rendered above the existing shell. The shell remains mounted so the final step can land on Overview without rebuilding tab state, but pointer interaction is blocked by the overlay while onboarding is incomplete.

The wizard uses compact desktop utility styling from the Horizon tokens:

- One modal panel on `bg-background`
- Token only surfaces, borders, text, and buttons
- Step rail with six fixed steps
- Folder rows as scannable list rows
- Scan progress as counts and a token storage bar

The AI step reads provider status with `ai-provider:getStatus`. It offers the active default provider if available and allows the user to continue without a working AI daemon, because scans and cleanup remain useful without live AI during setup.

## Value Sourcing

| Value | Source |
|---|---|
| `completed` | `settings` table row `onboarding.completed` |
| `completedAt` | `settings` table row `onboarding.completed_at` |
| `scanScope` | `settings` table row `scan.scope`, or default user folders from `settings.ts` |
| folder picker paths | Electron `dialog.showOpenDialog` in `settings:requestScanScope` |
| AI provider status | Existing `ai-provider:getStatus` IPC |
| first scan progress | Existing `scan:progress` stream |
| first scan summary | `ScanProgressEvent.summary` on the complete event |

## Build Plan

- [x] Add shared settings and onboarding schemas, satisfying AC-3, AC-4, AC-7.
- [x] Add the `settings` table migration and Drizzle schema, satisfying AC-4, AC-7.
- [x] Add main process settings service and IPC handlers, satisfying AC-3, AC-4, AC-7.
- [x] Expose the typed settings bridge through preload and renderer global types, satisfying AC-3.
- [x] Build `FirstRunGate` and wire it into `App.tsx`, satisfying AC-1, AC-2, AC-5, AC-6, AC-7.
- [x] Replace Overview's hardcoded scan scope with persisted scope, satisfying AC-4.
- [x] Add focused tests for shared schemas and settings persistence, satisfying AC-3, AC-4, AC-7.
- [x] Update project context registry and progress tracker, satisfying AC-1 through AC-7.

## Consequences

- No new third party package is introduced.
- The renderer remains inside the IPC boundary and does not read folders directly.
- Skipping AI setup is allowed, but the existing Settings tab remains the place for BYOK key entry.
- A failed first scan keeps the wizard open and does not mark onboarding complete.
