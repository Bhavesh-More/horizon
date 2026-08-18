# 0007. AI recommendations

**Date**: 2026-08-18
**Status**: In Progress

## Summary

Horizon will add Assistant v1 as a recommendation card surface powered by the existing AI provider layer. The model will turn local scan evidence into a small set of specific cards, while deterministic Horizon services remain the source of truth for files, sizes, forecasts, and actions. The build must keep AI advice separate from real filesystem actions.

## Context

Phase 9 is the first user visible AI reasoning layer after the provider foundation, embedding duplicate detection, and forecasting work. The scanner, duplicate detector, unused file query, large file query, and forecasting service already produce the evidence Horizon needs. The missing piece is a service that assembles that evidence into a bounded prompt, asks the configured provider for structured JSON, validates the result, and stores only grounded recommendations.

The trust boundary is the central constraint. Horizon is a storage cleanup app, so a false or overconfident card can damage trust even when no file is deleted. The model must not invent file IDs, paths, sizes, scan results, forecasts, or action capabilities. It must also never turn advice into cleanup. Review opens the relevant tab. Only a later user confirmed action can mark a recommendation accepted.

The feature must preserve the local first and BYOK design from spec 0004. Local Ollama remains the default. Cloud calls happen only when the user has explicitly configured a cloud provider. Prompts contain summarized metadata only, never raw file contents. Provider failures should not create fake recommendation rows.

No project default build approach is recorded. This spec assumes a thin end to end approach: first create one working scan to cards path through database, service, IPC, and UI, then add regeneration, state handling, hard validation, and polish.

## Requirements

**User stories**:
- As a storage constrained user, I want Horizon to generate a few specific recommendations after a scan so that I know what to review first.
- As a cautious cleanup user, I want each recommendation to link to real files and open the right review tab so that I stay in control before any action happens.
- As a privacy conscious user, I want recommendations to use summarized metadata only so that raw file contents are never sent to an AI provider.
- As a user with a slow or unavailable provider, I want clear setup, loading, retry, and error states without losing previous useful recommendations.

**Acceptance criteria**:
- **AC-1**: A completed scan automatically triggers recommendation generation only after duplicate detection for that scan has completed.
- **AC-2**: The generated context uses the latest completed scan, top 10 duplicate groups, top 10 unused candidates, top 10 large files, and the latest forecast when available.
- **AC-3**: The prompt contains summarized metadata only and never includes raw file contents.
- **AC-4**: Recommendation generation uses the existing provider agnostic `llm-client.ts` structured output path.
- **AC-5**: LLM output is parsed, schema validated, repaired once on malformed JSON, then validated again before persistence.
- **AC-6**: The validator rejects recommendations with invalid enum values, unknown related file IDs, unsupported target tabs, unsupported destructive wording, contradictory evidence, or more than five cards.
- **AC-7**: Valid recommendations are persisted in SQLite with scan ID, generation ID, type, title, reason, priority, related file IDs JSON, target tab, action, status, provider, model name, and creation time.
- **AC-8**: Regenerate starts a new generation for the current stable scan, prevents concurrent generations for the same scan, and keeps the previous successful batch visible until a new valid batch is ready.
- **AC-9**: Assistant v1 displays recommendation cards, Review, Dismiss, Regenerate, loading, provider setup, provider error, no results, and retry states.
- **AC-10**: Review navigates to the target tab with related file IDs available for preselection or highlighting and does not mark the recommendation accepted.
- **AC-11**: Dismiss updates the recommendation row to `dismissed` without deleting it from SQLite.
- **AC-12**: Archive recommendations may be generated in Phase 9, but the UI exposes them as Review only and never shows Archive Now until Phase 11.
- **AC-13**: Provider unavailable or invalid response failures create no fake recommendation rows and keep previous successful recommendations visible when present.
- **AC-14**: Phase 9 does not add an active chat input. Conversational assistant work remains Phase 10.

## Options considered

### Option 1: Manual recommendation generation only

The Assistant tab would expose a Generate button. No background generation would happen after scans.

**Pros**:
- Simple trigger model and fewer background tasks.
- The user explicitly controls every AI call.

**Cons**:
- The app feels less intelligent because the user must know when to ask.
- Recommendations can easily lag behind the latest scan.

### Option 2: Automatic generation after stable scan state, plus manual Regenerate

The scanner completes, duplicate detection completes, derived summaries are read, then recommendations are generated automatically. Assistant also exposes Regenerate.

**Pros**:
- Produces the strongest user experience with no prompting burden.
- Uses stable evidence rather than partial scan data.
- Keeps user control through manual regeneration.

**Cons**:
- Requires explicit idempotency, stale generation protection, and async state handling.

### Option 3: Generate on Assistant open

The app waits until the user opens Assistant, then builds context and calls the provider.

**Pros**:
- Avoids provider calls for users who never open Assistant.
- Simple to reason about in the renderer.

**Cons**:
- Assistant first open can feel slow.
- It couples UI navigation to background intelligence and increases the chance of stale or partial context.

## Decision

**Chosen option**: Option 2: Automatic generation after stable scan state, plus manual Regenerate

Horizon will generate Assistant v1 recommendations automatically after a completed scan and completed duplicate detection, then let users regenerate the newest batch from Assistant.

**Implementation skills**: none beyond the project context files and existing specs.

## Rationale

Automatic generation is the right default because Horizon is meant to surface storage insight without requiring users to understand prompts. Waiting for duplicate detection prevents the common failure where recommendations are generated from incomplete evidence. Regenerate gives users control without making AI discovery a manual workflow.

The service should persist both a batch row and recommendation rows. A batch row records operational state, provider, model, source scan, source forecast, and error category. Recommendation rows contain only actual cards. This preserves the rule that the recommendation table contains recommendations, while still giving the UI a reliable way to show generation state and recover after provider failure.

Review only navigation is deliberate. It keeps the AI in an advisory role and keeps deterministic cleanup, archive, and safety policy flows in charge of actual file actions. That distinction is the core trust principle for Phase 9.

## Feature design

**Data model sketch**:

```text
recommendation_batches
  id: integer primary key
  scan_run_id: integer required, foreign key scan_runs.id
  generation_id: text required, unique
  source_forecast_id: integer nullable, foreign key forecasts.id
  status: text required, enum running, complete, no_results, failed, stale
  error_category: text nullable, enum not_configured, provider_unavailable, authentication_failed, quota_exceeded, network_error, timeout, invalid_response, unknown
  error_message: text nullable
  provider: text nullable
  model_name: text nullable
  started_at: text required
  completed_at: text nullable

recommendations
  id: integer primary key
  scan_run_id: integer required, foreign key scan_runs.id
  batch_id: integer required, foreign key recommendation_batches.id
  generation_id: text required
  recommendation_type: text required, enum duplicate, unused, large_file, archive, forecast, cleanup
  title: text required
  reason: text required
  priority: integer required, 0 to 100
  related_file_ids_json: text required
  target_tab: text required, enum duplicates, unused, large_files, forecast, overview
  action: text required, enum review
  status: text required, enum pending, accepted, dismissed
  provider: text nullable
  model_name: text nullable
  created_at: text required
```

Indexes:
- `idx_recommendation_batches_scan_run_id` on `recommendation_batches.scan_run_id`
- `idx_recommendation_batches_generation_id` on `recommendation_batches.generation_id`
- `idx_recommendation_batches_status` on `recommendation_batches.status`
- `idx_recommendations_scan_run_id` on `recommendations.scan_run_id`
- `idx_recommendations_generation_id` on `recommendations.generation_id`
- `idx_recommendations_status` on `recommendations.status`
- `idx_recommendations_created_at` on `recommendations.created_at`

**State transitions**:

```text
batch running
  -> complete, when one or more valid recommendations are persisted
  -> no_results, when evidence or valid model output yields zero cards
  -> failed, when provider or validation failure prevents a successful batch
  -> stale, when a newer scan supersedes an in flight generation

recommendation pending
  -> dismissed, when the user clicks Dismiss
  -> accepted, only after the later user confirmed cleanup or archive action succeeds
```

Review does not change recommendation status.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `recommendations:getActive` | IPC invoke | `scanRunId?: number` | `batch`, `recommendations`, `generationState` | internal IPC | no scan, provider unavailable, internal error |
| `recommendations:regenerate` | IPC invoke | `scanRunId?: number` | `batchId`, `generationId`, `state` | internal IPC | generation already running, no stable scan, provider unavailable |
| `recommendations:dismiss` | IPC invoke | `recommendationId: number` | `recommendationId`, `status` | internal IPC | not found, invalid status |
| `recommendations:getById` | IPC invoke | `recommendationId: number` | recommendation record | internal IPC | not found |
| `recommendations:getGenerationState` | IPC invoke | `scanRunId?: number` | `state`, `activeBatch`, `lastError` | internal IPC | internal error |
| `recommendations:generationStarted` | IPC event | none | `scanRunId`, `generationId` | internal IPC | none |
| `recommendations:generationCompleted` | IPC event | none | `scanRunId`, `generationId`, `count` | internal IPC | none |
| `recommendations:generationFailed` | IPC event | none | `scanRunId`, `generationId`, `errorCategory`, `message` | internal IPC | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Build context | Latest completed scan ID, completion time, file count, total bytes | `scan_runs` row with newest `completed_at` and status `complete` |
| Build context | Duplicate count, reclaimable bytes, member file IDs, group type | `duplicate_groups`, `duplicate_group_members`, `file_index` |
| Build context | Unused candidates, age days, category, last activity | `file_index` through `staleness.ts` logic |
| Build context | Large file candidates, category, size, modified time | `file_index` through `large-files.ts` logic |
| Build context | Forecast ID, projected full date, confidence, growth rates | latest `forecasts` rows |
| Build prompt | Prompt version | constant `recommendation_prompt_v1` in prompt builder |
| Generate recommendations | Provider and model | active provider status from `llm-client.ts` |
| Validate output | Allowed file IDs and source sizes | the exact context object sent to the model |
| Persist batch | `generation_id` | generated UUID in recommendation service |
| Persist recommendation | Type, title, reason, priority, target tab, action | validated structured LLM output |
| Get active recommendations | Visible batch | newest successful `recommendation_batches` row for the latest stable scan |
| Review | Target tab and related file IDs | `recommendations.target_tab` and `related_file_ids_json` |
| Dismiss | New status | validated IPC request and `recommendations.status` update |
| Assistant loading state | Current generation state | in memory generation lock plus latest batch row |
| Assistant error state | Error category and message | failed `recommendation_batches` row, mapped provider error |

**Key invariants**:
- Prompts contain metadata only and never raw file contents.
- The LLM cannot create an actionable file reference unless that file ID exists in the context.
- A scan has at most one active recommendation generation job.
- A failed regeneration never hides the previous successful batch.
- Recommendation text cannot contain permanent deletion, empty trash, immediate removal, or action already happened claims.
- A card count above five is invalid.
- `action` is `review` for all Phase 9 cards.
- `accepted` is written only after a real user confirmed action succeeds, not on Review.
- Old recommendation rows are retained for history.

**Security model**:

The renderer can read recommendation records and request dismiss or regenerate through typed IPC only. The renderer never calls an AI provider, never reads API keys, never reads the database directly, and never accesses the filesystem directly. Provider calls remain in the main process through `llm-client.ts`. Cloud provider calls happen only for the user selected active provider, using credentials managed by `secure-storage.ts`.

**Configuration required**:

No new environment variables or credentials are required. Phase 9 uses the existing AI provider configuration from Phase 6.

**Critical test scenarios**:
- Happy path: scan completes, duplicate detection completes, context is assembled, provider returns valid JSON, cards appear in Assistant, verifies **AC-1**, **AC-2**, **AC-4**, **AC-7**, **AC-9**.
- Privacy path: prompt builder receives files with names and metadata and includes no raw contents, verifies **AC-3**.
- Malformed model output: invalid JSON triggers one repair pass and only the repaired valid output is persisted, verifies **AC-5**.
- Hard validation: unknown file IDs, invalid tabs, excessive count, and destructive wording are rejected, verifies **AC-6**.
- Regenerate failure: previous successful batch remains visible after provider failure, verifies **AC-8**, **AC-13**.
- Review action: clicking Review opens the target tab with related file IDs and leaves status pending, verifies **AC-10**.
- Dismiss action: Dismiss marks the row dismissed and hides the card without deleting it, verifies **AC-11**.
- Archive card: archive recommendation renders Review only, verifies **AC-12**.
- Scope guard: Assistant v1 renders no active chat input, verifies **AC-14**.

## Build plan

1. Add shared recommendation schemas in `packages/shared-types/src/recommendations.ts`, including recommendation enums, context summaries, structured LLM output, IPC requests, IPC responses, generation state, and provider error categories, satisfies **AC-2**, **AC-5**, **AC-6**, **AC-9**.
2. Add `recommendation_batches` and `recommendations` to Drizzle schema and generate migration `0007_recommendations.sql` with the indexes listed above, satisfies **AC-7**, **AC-8**, **AC-11**, **AC-13**.
3. Implement `recommendation-repository.ts` under `apps/desktop/src/main/services/` for batch creation, status transitions, insert many, get active batch, get by ID, and status update, satisfies **AC-7**, **AC-8**, **AC-11**, **AC-13**.
4. Implement `recommendation-context.ts` to assemble bounded metadata from latest scan, duplicate groups, unused candidates, large files, and forecast rows, with top 10 caps per evidence type, satisfies **AC-2**, **AC-3**.
5. Implement `recommendation-prompt.ts` with `recommendation_prompt_v1`, the system prompt rules, deterministic JSON context serialization, and the structured output schema, satisfies **AC-3**, **AC-4**, **AC-5**.
6. Implement `recommendation-validator.ts` for enum checks, related file checks, target tab checks, card count cap, duplicate recommendation collapse by type plus sorted file IDs, priority clamping, action normalization to Review, and destructive wording rejection, satisfies **AC-5**, **AC-6**, **AC-12**.
7. Implement `recommendations.ts` service orchestration with per scan generation locks, stale generation protection, provider error classification, structured generation through `llm-client.ts`, validated persistence, and generation events, satisfies **AC-1**, **AC-4**, **AC-8**, **AC-13**.
8. Integrate automatic generation after `runDuplicateDetection(scanRunId)` completes in `scanner.ts`, without blocking scan completion UI, satisfies **AC-1**, **AC-8**, **AC-13**.
9. Add IPC handlers in `apps/desktop/src/main/ipc/recommendations.ts`, register them in `main/index.ts`, and expose an allowlisted preload API under `window.horizon.recommendations`, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**.
10. Build `AssistantTab.tsx` and `RecommendationCard.tsx` using existing token rules, with cards, Review, Dismiss, Regenerate, provider setup, loading, error, retry, no results, and no active chat input, satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-14**.
11. Update `App.tsx` navigation so Assistant mounts as a real tab and Review can navigate to Duplicates, Unused Files, Large Files, Forecast, or Overview with related file IDs passed for highlighting or preselection, satisfies **AC-9**, **AC-10**.
12. Add unit tests for context assembly, prompt privacy, validator rejection cases, repository state transitions, service regenerate concurrency, IPC schema rejection, and Assistant render states, satisfies **AC-1** through **AC-14**.
13. Update `context/ui-registry.md` with `AssistantTab` and `RecommendationCard`, and update `context/progress-tracker.md` only after Phase 9 exit criteria are demonstrably true, satisfies **AC-9**, **AC-14**.

## Consequences

**Positive**:
- Assistant becomes useful without waiting for Phase 10 chat.
- Recommendations are grounded in real scan evidence and remain auditable by scan and generation.
- Provider failures are visible to users without polluting recommendation rows.
- Phase 11 can attach archive execution later without changing recommendation meaning.

**Negative / tradeoffs**:
- Automatic generation adds background complexity and concurrency state.
- Local models may be slower, so loading and retry states need to be polished.
- The extra batch table adds a little schema complexity, but it keeps operational failures separate from actual recommendations.

**Neutral**:
- The recommendations table stores links back to evidence rather than copying a large evidence payload.
- Old recommendation batches remain in SQLite for history and may need a later retention policy if the database grows.

## Follow-up

- [ ] Phase 11 should update recommendation status to `accepted` only after a real archive or cleanup action succeeds.
- [ ] Phase 10 should reuse the recommendation context builder where appropriate, but must keep chat history and streaming concerns in its own spec.
