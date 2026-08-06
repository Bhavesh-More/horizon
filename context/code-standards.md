# Code Standards — Horizon

This document defines *how* code gets written, day to day — naming, structure, error handling, testing, review, and commit conventions. `architecture.md` defines the contract (what lives where, the schema, the invariants); `project_overview.md` defines the product; the Build Plan defines the sequencing. This doc exists so that code written in Phase 1 and code written in Phase 14 look like they came from the same hand, and so that an invariant from `architecture.md` §6 is never violated by accident just because a convention for avoiding it wasn't written down anywhere.

Treat this as binding for any code merged into the repo, human-written or agent-written. Where this document is silent, default to `eslint`/`prettier`'s configured rules rather than personal preference.

---

## 1. Guiding principles

1. **The invariants in `architecture.md` §6 are the actual law; this document is how you don't accidentally break them.** Every section below that touches safety, secrets, or boundaries links back to the specific invariant it exists to protect.
2. **Boring and explicit beats clever.** This is a codebase where a wrong assumption can delete a user's files. Prefer a verbose, obviously-correct 10 lines over a clever 3.
3. **One thing owns each responsibility.** If you're about to write logic that duplicates something `deletion-policy.ts` or `trash.ts` already does, you're in the wrong file — go use the existing one.
4. **The main process is the trust boundary, always.** Nothing the renderer says about what's "safe" or "already validated" is ever taken at face value in `main`. See I-2 and I-15.

---

## 2. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| TypeScript source files | `kebab-case.ts` | `deletion-policy.ts`, `llm-client.ts` |
| Worker entry files | `kebab-case.worker.ts` | `scan.worker.ts`, `hash.worker.ts` |
| Test files | Colocated, same name + `.test.ts`/`.test.tsx` | `deletion-policy.test.ts` next to `deletion-policy.ts` |
| React components | `PascalCase.tsx`, filename matches the component | `DiskUsageBar.tsx`, `SafetyTagPill.tsx` |
| Hooks | `useThing.ts`, always starts with `use` | `useScanProgress.ts` |
| IPC handler files | Match the feature domain exactly, matching `architecture.md` §2 `ipc/` listing | `scan.ts`, `duplicates.ts`, `ai-provider.ts` |
| IPC channel names | `<domain>:<verb>`, domain matches the handler filename | `scan:start`, `duplicates:list`, `cleanup:trash`, `ai-provider:configure` |
| Zod schemas | `PascalCase` + `Schema` suffix; inferred type drops the suffix | `ScanStartRequestSchema` → `type ScanStartRequest = z.infer<typeof ScanStartRequestSchema>` |
| Streamed event payloads | `<Domain><Noun>Event` | `ScanProgressEvent`, `AssistantStreamChunk` |
| Functions / variables | `camelCase` | `computeReclaimableBytes()` |
| Types / interfaces | `PascalCase`, no `I` prefix | `FileIndexRow`, not `IFileIndexRow` |
| DB tables / columns (SQL) | `snake_case`, matching `architecture.md` §5 exactly | `content_hash`, `usage_snapshots` |
| DB fields in Drizzle schema (TS) | `camelCase`, explicitly mapped to the `snake_case` column | `contentHash` → `content_hash` |
| React props types | `<ComponentName>Props` | `SafetyTagPillProps` |

**Rule:** a schema name and its IPC channel name must be traceable to each other on sight — `scan:start` is validated by `ScanStartRequestSchema`, not `StartScanSchema` or `ScanStartPayload`. Consistency here is what makes `packages/shared-types` actually function as documentation (I-9).

---

## 3. TypeScript standards

- `strict: true` in every `tsconfig.json` across the monorepo, inherited from `packages/tsconfig`. No package opts out.
- `any` is not allowed. If a type genuinely can't be known yet, use `unknown` and narrow it explicitly — this is almost always the case at an IPC boundary before zod validation runs.
- **Never hand-write a type that duplicates a zod-inferred one.** If `packages/shared-types` already defines `ScanStartRequest`, importing and reusing it is mandatory; redefining `{ scope: string[] }` locally anywhere is a review-blocking issue (I-9).
- Prefer discriminated unions over optional-field soup for anything with meaningfully different states — e.g. a service result is `{ ok: true; data: T } | { ok: false; error: ServiceError }`, not `{ data?: T; error?: string }`.
- No non-null assertions (`!`) outside of test files. If you're confident a value exists, prove it with a narrowing check or a documented invariant, not a suppressed compiler warning.
- Exports are named, not default, everywhere except framework-mandated entry points (`main.tsx`, worker entry files that a `new Worker(...)` call loads by path).

---

## 4. IPC contract standards

This is the layer that replaced the old HTTP API, and it gets treated with the same rigor a real network API boundary would get — because from the renderer's point of view, it is one (I-8).

- **Schema-first, always.** No IPC channel is implemented in `main` or called from `renderer` until its request/response (and, if streaming, its event) shapes exist in `packages/shared-types`.
- **Every handler in `main` validates before doing anything else.** The first line of every `ipcMain.handle(...)` callback is `SomeSchema.parse(payload)` (or `.safeParse` if a typed error response is preferable to a thrown one — see §8). This is I-15, not optional, not "the renderer already checked."
- **Response envelope is consistent.** Every invoke-style IPC call resolves to `{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }` — never a bare value on success and a thrown exception on failure. Thrown errors don't serialize predictably across the Electron IPC boundary; an explicit envelope does.
- **Streaming channels follow one pattern.** A `start`-style invoke kicks things off; progress arrives via `webContents.send('<domain>:<event>', payload)` on a channel the renderer subscribed to before invoking `start`; a final event with a `done: true` (or equivalent) discriminant closes the stream. `scan:progress` and `assistant:stream` are the reference implementations — new streaming features copy their shape, not invent a new one.
- **The preload surface is an explicit allowlist, not a passthrough.** `preload/index.ts` exposes named functions (`window.horizon.scan.start(...)`, `window.horizon.duplicates.list(...)`) each wrapping exactly one channel — never a generic `invoke(channel, payload)` escape hatch that would let renderer code call an arbitrary channel string.

---

## 5. Main-process service standards

- **One service file, one responsibility**, matching the `services/` listing in `architecture.md` §2. If a function in `scanner.ts` starts making decisions about whether something is safe to delete, that logic belongs in `deletion-policy.ts` — move it, don't duplicate it.
- **IPC handlers are thin.** A handler validates the payload, calls exactly one (occasionally two, for something like "validate then perform") service function, and shapes the response envelope. Business logic does not live in `ipc/*.ts` files.
- **Services are the only code that touches `better-sqlite3`/Drizzle directly.** `ipc/` and `renderer/` never issue a query themselves.
- **CPU-heavy work happens in a worker, never inline in a service called from an IPC handler on the main thread** (I-12). If you're adding a new hashing/scanning-adjacent operation, ask first whether it belongs in `workers/`, not after a demo freezes.
- **`trash.ts` is the only module that removes a file, and it's only ever called after `deletion-policy.ts` has approved the action inside the same request** (I-1, I-2). A new feature needing to delete something does not call `trash` directly — it calls the policy, gets an `allow`, then calls `trash`. This is a straight-line, unskippable sequence; no service is allowed to cache or assume a prior approval.
- **`secure-storage.ts` is the only module that reads or writes a secret** (I-5). No service reaches into `safeStorage` directly, and no service function is permitted to accept an API key as a plain parameter and pass it onward without going through this module — the fewer places a key value exists as a variable in memory, the better.

---

## 6. Renderer / React standards

- **Functional components only**, using hooks. No class components anywhere in the codebase.
- **No `node:*` imports, no direct filesystem/database/AI-provider calls, ever** (I-8). If a component seems to need one, it needs a new IPC channel instead — that's a `main`-side change, not a workaround in the renderer.
- **Server/async state lives in TanStack Query, not component state.** Scan results, duplicate groups, forecasts, recommendations — anything that ultimately comes from `main` — is fetched and cached through a query, keyed via a single shared query-key factory (e.g. `queryKeys.duplicates.list()`) so invalidation after a cleanup action is consistent across tabs rather than each screen inventing its own cache key.
- **Local-only UI state** (selected filters, which modal is open, sidebar collapse) uses `useState`/`useReducer`, or React Context if it's genuinely shared across distant components — introducing a new state-management dependency requires the justification in §15, not a default reach.
- **Styling only through `packages/design-tokens` and Tailwind utilities generated from it.** No hardcoded hex values, no inline `style={{ color: '#... }}` for anything that has a token. If a needed color/radius/spacing value doesn't exist as a token yet, add it to `packages/design-tokens` first — don't one-off it in a component.
- **All shared visual primitives come from `packages/ui`.** A component that re-implements a pill/badge/card/button style that already exists there is a review-blocking issue, not a style preference — this is what keeps the Purge-derived visual consistency from eroding tab by tab.
- **Long lists get list-row memoization.** `ScanResultRow`-style components used in Duplicates/Unused Files/Large Files are wrapped in `React.memo`; if a list can realistically exceed a few hundred rows (Large Files, in particular), use windowed rendering rather than rendering every row unconditionally.

---

## 7. Database & migration standards

- **`db/schema.ts` (Drizzle) is the actual source of truth**, not the SQL reference block in `architecture.md` §5 — that block exists for human readability and must be kept in sync manually whenever the schema changes, but the generated migration is what ships.
- **No schema change without a `drizzle-kit` migration in the same PR** (I-11). A hand-edited production DB file, or a schema change with no migration file, is a review-blocking issue.
- **No raw string-concatenated SQL, ever.** All queries go through Drizzle's query builder. If something genuinely can't be expressed that way, a parameterized raw query is acceptable — string interpolation of any user-influenced value into a query is not.
- **Soft-delete, never hard-delete, `file_index` rows.** Setting `removed_at` is the only way a cleanup action reflects in this table — this preserves the historical references duplicate groups, recommendations, and the activity log depend on, and is part of what makes I-13 (no double-counted bytes) enforceable at all.
- **Avoid N+1 query patterns**, particularly around `duplicate_group_members` → `file_index` lookups and `cleanup_actions` → `archives` joins — batch or join these, don't loop a query per row in a service function.

---

## 8. Error handling & logging

- **Service functions return a typed result, they don't throw for expected failure modes.** A missing lockfile, an unreachable AI provider, an invalid archive destination — these are `{ ok: false; error }` returns, not exceptions. Reserve `throw` for genuinely unexpected/programmer-error conditions (a null that the types promised couldn't happen).
- **IPC handlers catch anything that does throw** and translate it into the standard error envelope (§4) — a renderer call must never see an unhandled main-process exception as a hung promise.
- **No `console.log` left in committed code.** Use the shared logger utility; it exists so log level, formatting, and — critically — redaction are consistent.
- **Redaction is automatic, not manual.** The logger strips any field named `apiKey`, `key`, `token`, or `secret` before writing, so a developer adding a new log line can't accidentally leak a credential by forgetting to scrub it by hand (I-5). Logging the `ai_provider_config` object is fine; logging anything that touched `secure-storage.ts` is not, redaction or no redaction — don't log secret-adjacent code paths at all.
- **Renderer has a top-level error boundary** around the tab content area, so a single tab throwing doesn't blank the whole window — sidebar and top bar stay usable, with a recoverable "something went wrong in this view" state.

---

## 9. Security coding checklist

A condensed, day-to-day version of `architecture.md` §6 — check this while writing the code, not just at review time.

- [ ] Does this delete a file? → It must go through `deletion-policy.ts` then `trash.ts`, in that order, in the main process, re-validated even if the caller claims it already checked. (I-1, I-2)
- [ ] Does this archive, then remove originals? → Compress, verify, *then* remove. Never the reverse, never in parallel. (I-3)
- [ ] Does this run a batch action from a recommendation or a schedule? → There is still an explicit user confirmation step. No exceptions for "high-confidence" AI suggestions. (I-4)
- [ ] Does this touch an API key? → Only `secure-storage.ts` reads/writes it; it never appears in a DB row, an IPC response, or a log line. (I-5)
- [ ] Does this build a prompt for an AI provider? → Only metadata (paths, sizes, dates, hashes, categories) — never file contents. (I-6)
- [ ] Does this call a cloud AI provider? → Only if the user explicitly configured that provider; never a silent fallback from a failed local Ollama call. (I-7)
- [ ] Does this run in the renderer? → No `node:*` import, no direct DB/fs/AI call — IPC only. (I-8)
- [ ] Does this define or change a request/response/event shape? → It lives in `packages/shared-types`, nowhere else. (I-9)
- [ ] Does a `packages/*` file import from `apps/*`? → It shouldn't compile; fix the dependency direction. (I-10)
- [ ] Does this change `db/schema.ts`? → There's a `drizzle-kit` migration in the same commit. (I-11)
- [ ] Does this scan or hash files? → It runs in a `worker_threads` worker, not inline on the main thread. (I-12)
- [ ] Does this compute a total shown to the user? → It's deduplicated against `file_index.id`, not summed per result-set independently. (I-13)
- [ ] Does this perform a destructive/archival action? → There's a corresponding `cleanup_actions` row, written only after the action actually succeeds. (I-14)
- [ ] Does this add a new IPC handler? → The first line validates the payload against its `packages/shared-types` schema. (I-15)

---

## 10. Testing standards

| Module type | Minimum bar |
|---|---|
| `deletion-policy.ts` | Every allow/block rule gets an explicit test case, including the never-delete blocklist and the whitelisted-prefix rules. This is the single most safety-critical file in the codebase — treat its test file as never "good enough" until every branch is covered. |
| `trash.ts` | Test that it's called with exactly the policy-approved set, never more; test failure handling (what happens if the OS trash call itself fails). |
| `archiver.ts` | Explicit test for the interrupted/failed-compression case — originals must remain untouched (mirrors the Build Plan's Phase 11 exit criteria). Explicit test for the full archive → restore round trip. |
| `forecasting.ts` | Test against synthetic `usage_snapshots` fixtures covering flat, growing, and shrinking trends; assert the output shape and that `is_bootstrapped` history doesn't silently overweight the confidence metric. |
| `hashing.ts` / `embeddings.ts` | Test exact-match grouping against known duplicate fixtures; test that a near-identical-but-distinct file does not incorrectly group at the exact tier. |
| Every new IPC handler | Test that an invalid payload is rejected by the zod schema before the handler's business logic runs (proves I-15 isn't accidentally skipped). |
| `llm-client.ts` | Test provider-selection logic and the structured-output validation/repair-retry path using a mocked provider response — not a live call. |
| React components in `packages/ui` | Render + basic interaction tests (React Testing Library) for anything with logic beyond pure presentation (e.g. a confirmation modal's confirm/cancel behavior). |
| Renderer tabs | Not held to the same bar as the modules above — smoke-test that the tab renders and wires up its primary action, full coverage isn't expected given the 2–4 week timeline. |

Run the full suite via `turbo run test`. A PR touching any module in the top half of this table does not merge without a corresponding test change, regardless of how small the diff looks.

---

## 11. Git workflow & commit conventions

- **Branch naming:** `phase-<N>-<short-kebab-description>`, tied to the Build Plan's phase numbering — e.g. `phase-3-duplicate-detection`, `phase-8-forecasting`. Work that doesn't map to a phase (a pure refactor, a doc update) uses `chore/<short-description>` or `docs/<short-description>` instead.
- **Commits follow Conventional Commits**, scoped to the domain touched: `feat(scan): stream progress via worker thread`, `fix(trash): re-validate policy before removal`, `test(deletion-policy): cover never-delete blocklist`, `docs(architecture): update I-13 wording`.
- **A commit that touches a destructive-action path (`deletion-policy.ts`, `trash.ts`, `archiver.ts`) always includes or updates a test in the same commit** — never a follow-up "add tests later" commit for this category of file.
- **PR descriptions state the phase** (from the Build Plan) the work belongs to, and explicitly list which invariants from §6/§9 above were relevant and how they were satisfied — this is what makes the "Invariant coverage by phase" table in the Build Plan actually verifiable rather than aspirational.

---

## 12. Code review checklist

Beyond the security checklist in §9, every review confirms:

- [ ] No `any`, no unexplained non-null assertions.
- [ ] No hardcoded color/spacing/radius values outside `packages/design-tokens`.
- [ ] No new type definition that duplicates a `packages/shared-types` schema-derived type.
- [ ] No `console.log` (structured logger used instead).
- [ ] New IPC channel follows the `<domain>:<verb>` naming pattern and has a matching zod schema.
- [ ] New service function lives in the correct `services/` file per its stated responsibility, not bolted onto an unrelated one.
- [ ] Tests added/updated per the §10 table for anything that touches a listed module.
- [ ] If a `packages/ui` primitive already covers this UI need, it's used rather than re-implemented.

---

## 13. Documentation requirements

- **Every file in `main/services/` opens with a short comment block**: what it owns, and which invariant(s) (if any) it's responsible for upholding. Example:
  ```ts
  /**
   * trash.ts
   * Owns: the single sanctioned path for removing a user file (Invariant I-1).
   * Called only after deletion-policy.ts has approved the action (I-2).
   */
  ```
  This makes the invariant-to-code mapping legible to anyone (or any agent) reading the file in isolation, without needing `architecture.md` open side by side.
- **Every new zod schema in `packages/shared-types` gets a one-line doc comment** describing what it's for — these schemas are the API documentation for the whole app; they should read like it.
- **No requirement for exhaustive JSDoc on every function.** Focus documentation effort on module-level intent and on any function whose correctness isn't obvious from its name and types.

---

## 14. Performance standards

- Filesystem scanning and hashing run in `worker_threads`, never inline in a service invoked from the main thread's IPC handler (I-12, restated here as a day-to-day habit, not just a review gate).
- Drizzle queries touching `file_index` in bulk (duplicate grouping, staleness filtering, large-files sorting) use indexes already defined in `architecture.md` §5 (`idx_file_index_hash`, `idx_file_index_category`, `idx_file_index_accessed`) — a new query pattern that can't use one of these is a signal to add an index, not to accept a slow scan.
- Streamed IPC events (`scan:progress`, `assistant:stream`) are coalesced on the renderer side where a flood of rapid events would otherwise cause a re-render per item — batch into a short interval (matching the coalescing pattern Purge itself uses for its scan results) rather than letting TanStack Query's cache update per single row.
- Large result lists (Large Files, in particular) use windowed/virtualized rendering once list length can realistically exceed a few hundred rows.

---

## 15. Dependency policy

Before adding any new package to the monorepo, confirm:

1. **It doesn't duplicate something already in the stack** (`architecture.md` §1). If `simple-statistics` already covers a regression need, don't add a second stats library for one function.
2. **It's Electron-compatible without native-module pain.** Prefer pure-JS/TS packages; if a native module is unavoidable (rare, given the current stack), confirm it has prebuilt binaries for Electron's target platforms or works cleanly with `electron-rebuild` before adopting it.
3. **It does not introduce a second language or runtime.** This is a hard rule, not a judgment call — the single-runtime decision in `architecture.md`'s revision note exists specifically to avoid the packaging and demo-day risk a second runtime (Python or otherwise) reintroduces. A dependency that would require anything other than Node to execute is rejected regardless of how well it otherwise fits.
4. **It's actively maintained.** Given the app's job is filesystem/security-adjacent work, an abandoned dependency in that path is a real risk, not just a hygiene concern.

Any addition that fails one of these gets discussed before it's added, not after.
