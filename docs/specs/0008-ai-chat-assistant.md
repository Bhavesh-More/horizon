# 0008. AI chat assistant

**Date**: 2026-08-18
**Status**: Complete

## Summary

Phase 10 adds a free form Assistant chat below the recommendation cards. Each answer is generated from fresh local retrieval against scans, files, duplicates, recommendations, and forecast data. The chat is streamed to the renderer, but no chat history is stored in the database for this phase.

## Context

Horizon already has local scan data, derived duplicate and file views, forecasts, and AI recommendation cards. The missing Assistant behavior is the user asking a direct question such as what is filling Downloads or how much space a category uses. If this is built as a generic chat box, it will damage trust because the model can answer with general advice that is not grounded in Horizon data.

The existing architecture chooses a local first Electron main process, typed IPC, and a provider agnostic `llm-client.ts`. That means chat retrieval and provider calls must stay in the main process, the renderer must only send a message and subscribe to stream events, and prompts must contain metadata only. Phase 10 should not introduce a new database table because the architecture explicitly says MVP chat history is not persisted.

The build approach is a thin end to end slice first. Add the smallest working chat path through shared types, retrieval, prompt, IPC, preload, and Assistant UI, then harden validation, errors, and tests.

## Requirements

**User stories**:
- As a storage constrained user, I want to ask Horizon questions about my own disk so that I can understand what to review next.
- As a privacy conscious user, I want chat answers grounded in local metadata only so that raw file contents are never sent to an AI provider.
- As a cautious cleanup user, I want chat answers to hedge when evidence is missing so that the app does not invent certainty.

**Acceptance criteria**:
- **AC-1**: The Assistant tab renders a chat input below recommendation cards and keeps Phase 9 card behavior intact.
- **AC-2**: Sending a message calls `assistant:chat`, starts a unique chat request, and streams answer chunks over `assistant:stream`.
- **AC-3**: Retrieval includes the latest completed scan, recent scan summary, duplicate group summary, latest forecast, active recommendation summary, and file rows matched by keywords or path fragments from the message.
- **AC-4**: Prompts contain only metadata such as paths, file names, sizes, categories, dates, hashes, counts, and forecast values. They never include raw file contents.
- **AC-5**: Chat uses the existing active AI provider through `llm-client.ts` with no silent cloud fallback.
- **AC-6**: Provider unavailable, no completed scan, empty retrieval, timeout, and invalid payload states return clear user visible responses without crashing the renderer.
- **AC-7**: No chat history is persisted to SQLite in Phase 10. Each message is answered independently with fresh retrieval.
- **AC-8**: Answers visibly hedge when retrieved evidence is weak or missing and do not recommend direct deletion, archiving, or cleanup execution.
- **AC-9**: Every new IPC payload and stream event is defined in `packages/shared-types` and validated in the main process.

## Options considered

### Option 1: One shot invoke response

The renderer sends a message and waits for one full answer from `assistant:chat`.

**Pros**:
- Smallest implementation.
- Simple tests and no event lifecycle to manage.

**Cons**:
- Slow providers make the UI feel frozen.
- It does not satisfy the planned `assistant:stream` surface.

### Option 2: Invoke plus streamed chunks

The renderer invokes `assistant:chat` to start one request, then receives chunks on `assistant:stream` until a final event arrives.

**Pros**:
- Matches the architecture and scan progress pattern.
- Gives the user visible progress during slow local model calls.
- Keeps all provider work in the main process.

**Cons**:
- Requires request ids, cancellation safe UI state, and event validation.

### Option 3: Persisted chat sessions

The app stores conversations, message rows, and retrieval references for later replay.

**Pros**:
- Better long term product surface.
- Enables conversation continuity.

**Cons**:
- Contradicts the MVP architecture for Phase 10.
- Adds schema, retention, privacy, and migration decisions that are not needed for the demo path.

## Decision

**Chosen option**: Option 2: Invoke plus streamed chunks

Horizon will answer each Assistant chat message with fresh local retrieval and streamed IPC chunks, without storing chat history.

**Implementation skills**: `develop` (`horizon`, `.agents/skills/develop/`) · `tailwind` (`horizon`, `.agents/skills/tailwind-css/`)

## Rationale

Streaming gives the user feedback while local Ollama or a cloud BYOK provider thinks, and it matches the IPC pattern the app already uses for scan progress. Keeping each request independent avoids a Phase 10 database migration and reduces privacy surface. Retrieval from existing tables is enough for the questions Phase 10 promises, while a later Phase can add persisted conversations if the product needs them.

## Feature design

**Data model sketch**:
- No new SQLite tables in Phase 10.
- In memory request only:
  - `requestId`: required string UUID.
  - `message`: required user text, trimmed, maximum 1000 characters.
  - `startedAt`: required ISO timestamp.
  - `state`: `started`, `chunk`, `completed`, or `failed`.

**State transitions**:

```text
idle
  -> sending, when the renderer invokes assistant:chat
  -> streaming, when the first assistant:stream chunk arrives
  -> completed, when the final assistant:stream completed event arrives
  -> failed, when assistant:chat rejects or assistant:stream sends failed
```

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `assistant:chat` | IPC invoke | `message:string`, `scanRunId?:number` | `requestId`, `state` | internal IPC | invalid payload, no scan, provider unavailable |
| `assistant:stream` | IPC event | none | `requestId`, `event`, `chunk?`, `message?`, `errorCategory?` | internal IPC | provider unavailable, timeout, generation failed |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Validate message | Trimmed message and length | `AssistantChatRequestSchema.message` |
| Resolve scan | Current scan id | `scanRunId` input, else latest complete `scan_runs.id` |
| Retrieve scan summary | file count, total bytes, scope paths, completion time | `scan_runs` |
| Retrieve duplicate summary | group count, type, member count, reclaimable bytes, member metadata | `duplicate_groups`, `duplicate_group_members`, `file_index` |
| Retrieve forecast | projected full date, runway, confidence, fastest categories | latest `forecasts` rows through `forecasting.ts` |
| Retrieve recommendations | active recommendation titles and target tabs | Phase 9 recommendation repository |
| Retrieve keyword rows | file ids, paths, names, categories, sizes, dates | `file_index` rows matched by parsed message tokens |
| Build prompt | context JSON | retrieval output only |
| Stream answer | chunks and final status | `llm-client.ts` completion text split for IPC streaming |
| Render chat | user message, assistant text, error text, loading state | renderer local component state plus stream events |

**Key invariants**:
- The prompt never contains raw file contents.
- Chat cannot execute cleanup, archive, trash, reveal, or file system actions.
- No cloud provider call occurs unless that provider is already active and configured.
- Every stream event carries a `requestId`, and the renderer ignores stale request ids.
- Empty retrieval must produce a hedged answer, not invented facts.

**Security model**:

The renderer can submit a text question and receive text chunks only. The renderer cannot access the database, filesystem, provider clients, or secrets. The main process validates the message, performs retrieval, calls the active provider, and streams only answer text and normalized error categories. No chat content or answer is persisted.

**Configuration required**:

No new environment variables or credentials are required. Phase 10 uses the existing AI provider configuration from Phase 6.

**Critical test scenarios**:
- Happy path: a question about Downloads retrieves matching indexed rows and streams a grounded answer, verifies **AC-1**, **AC-2**, **AC-3**, **AC-5**.
- Privacy path: prompt context includes metadata only and no raw content field, verifies **AC-4**.
- No evidence path: a question with no matching local data produces a hedged answer, verifies **AC-6**, **AC-8**.
- Provider failure: unavailable provider sends a failed stream event and the UI shows a clear error, verifies **AC-6**.
- Contract path: invalid payload fails schema validation before retrieval starts, verifies **AC-9**.
- Persistence path: sending chat messages creates no chat tables or rows, verifies **AC-7**.

## Build plan

1. Add shared Assistant chat schemas and stream event types in `packages/shared-types`, satisfies **AC-2**, **AC-6**, **AC-9**.
2. Implement `assistant-retrieval.ts` to collect bounded metadata from scans, duplicate groups, forecasts, recommendations, and keyword matched files, satisfies **AC-3**, **AC-4**, **AC-8**.
3. Implement `assistant-prompt.ts` and `assistant.ts` service orchestration using `llm-client.ts`, request ids, provider checks, and stream event broadcasting, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-8**.
4. Add `apps/desktop/src/main/ipc/assistant.ts`, register it in `main/index.ts`, and expose `window.horizon.assistant.chat` plus `onStream`, satisfies **AC-2**, **AC-6**, **AC-9**.
5. Extend `AssistantTab.tsx` with chat transcript state, input, send button, streaming answer rendering, and error states below recommendation cards, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-8**.
6. Add focused tests for retrieval token parsing, prompt privacy, no evidence behavior, and IPC schema validation, satisfies **AC-3**, **AC-4**, **AC-6**, **AC-8**, **AC-9**.
7. Update `context/ui-registry.md` and `context/progress-tracker.md` after verification, satisfies **AC-1**.

## Consequences

**Positive**:
- The Assistant becomes useful for direct user questions without adding a server or new storage.
- The privacy story stays consistent because prompts use bounded metadata only.
- Streaming improves perceived speed for slow local providers.

**Negative / tradeoffs**:
- There is no conversation memory in Phase 10.
- Splitting a completed provider response into chunks is not true token streaming for every provider.
- Retrieval is keyword based, so some natural language questions may need careful hedging.

**Neutral**:
- Later persisted chat can reuse the request and event shapes but will need its own spec and migration.

## Follow-up

- [ ] A later chat memory phase should decide retention, redaction, and local history controls before adding persistence.
- [ ] A later provider streaming phase can upgrade `llm-client.ts` to native token streaming for providers that support it.
