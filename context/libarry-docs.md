# Libraries — Horizon

Every third-party dependency the project uses, with the version that was actually current on npm at the time this file was last verified (see the timestamp at the bottom of each table — check `registry.npmjs.org` again before trusting an old number here).

---

## Before Using Any Library

Before implementing any feature that uses a third-party library:

1. **Check `AGENTS.md` at the project root** — it lists every skill installed for this project and how to use them. Skills contain up-to-date API documentation, usage patterns, and best practices specific to this codebase.
2. **Check if an MCP server is configured for that library.** Some tools have MCP servers that give the AI agent direct access to documentation, logs, and debugging tools. If an MCP server is available, use it before falling back to general knowledge.
3. **Read this file** for project-specific patterns that override general library knowledge.

The order of authority is:

**MCP server (real-time docs) → Skills via AGENTS.md → This file (project rules) → General training knowledge**

Never rely on general training knowledge alone for library APIs — they change frequently and training data may be outdated. (The version table below exists precisely because of this: every number in it was pulled from the live npm registry, not recalled from memory — see the verification note at the end of the doc.)

---

## How to use this file

Each entry below has four things: the package, its currently-latest version, what it's used for in Horizon specifically, and a pointer to check `AGENTS.md` for that library's installed skill before writing code against it. This file tells you _what_ we use and _why_; the skill (if one is installed) tells you _how_ its API actually works right now. Don't substitute this file's one-line purpose description for reading the actual skill/docs before implementing.

---

## Monorepo tooling

| Library             | Version | Used for                                                          |
| ------------------- | ------- | ----------------------------------------------------------------- |
| `turbo`             | 2.10.8  | Task orchestration/caching across `apps/desktop` and `packages/*` |
| `yarn` (classic v1) | 1.22.x  | Package manager / workspace management                            |

→ Check `AGENTS.md` for the `turbo` and `yarn` skills before changing `turbo.json` or workspace config.

---

## Runtime & language

| Library      | Version                          | Used for                                                                                                                                                             |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | 24.x (Active LTS as of Aug 2026) | The runtime — main process, workers, and build tooling. Bundled inside Electron for the packaged app; a matching local Node version is still needed for development. |
| `typescript` | 7.0.2                            | Language for the entire codebase — main, preload, renderer, all packages                                                                                             |

→ Check `AGENTS.md` for the `typescript` skill before relying on remembered compiler behavior — TS 7 changed enough internally (the native-compiler rewrite) that older mental models of tsconfig/perf behavior may not hold.

---

## Desktop shell & packaging

| Library            | Version | Used for                                                                |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| `electron`         | 43.3.0  | The desktop shell — window/process lifecycle, tray, native dialogs, IPC |
| `electron-builder` | 26.15.3 | Packaging into `.dmg`/`.exe`/AppImage                                   |

→ Check `AGENTS.md` for the `electron` skill before writing anything touching `BrowserWindow`, `contextBridge`, `safeStorage`, or IPC setup — Electron's security defaults and recommended patterns shift between majors.

---

## UI framework & styling

| Library                                   | Version                                                                                                                                                 | Used for                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `react` / `react-dom`                     | 19.2.8                                                                                                                                                  | Renderer UI                                                |
| `vite`                                    | 8.2.0                                                                                                                                                   | Renderer build/dev server                                  |
| `tailwindcss`                             | 4.3.3                                                                                                                                                   | Styling, configured from `packages/design-tokens`          |
| `@radix-ui/react-*` (e.g. `react-dialog`) | 1.1.23 (per-primitive; install `-dropdown-menu`, `-tabs`, `-tooltip`, `-popover`, `-switch`, `-slider` etc. as needed, versions track closely together) | Unstyled accessible primitives wrapped by `packages/ui`    |
| `lucide-react`                            | 1.28.0                                                                                                                                                  | Generic icon set                                           |
| `simple-icons`                            | 16.28.0                                                                                                                                                 | Real app/brand icons (mirrors Purge's brand-icon approach) |

→ Check `AGENTS.md` for the `react`, `tailwindcss`, and `radix-ui` skills before writing components. **Tailwind v4 in particular is a meaningfully different config model from v3** (CSS-native `@theme` config rather than a JS config file as the primary mechanism) — don't assume v3-era `tailwind.config.js` patterns apply without checking.

---

## Data fetching, state & visualization

| Library                   | Version | Used for                                                                                    |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `@tanstack/react-query`   | 5.101.4 | Caching/loading-state layer over IPC calls in the renderer                                  |
| `@tanstack/react-virtual` | 3.14.9  | Windowed rendering for long lists (Large Files, in particular) — see `code-standards.md` §6 |
| `recharts`                | 3.10.1  | Forecast trend line, category treemap                                                       |

→ Check `AGENTS.md` for the `tanstack-query` skill before writing query-key factories or invalidation logic — get this wrong and cross-tab cache invalidation after a cleanup action silently breaks.

---

## Database & persistence

| Library          | Version | Used for               |
| ---------------- | ------- | ---------------------- |
| `better-sqlite3` | 13.0.3  | Embedded SQLite driver |
| `drizzle-orm`    | 0.45.2  | Typed schema + queries |
| `drizzle-kit`    | 0.31.10 | Migrations             |

→ Check `AGENTS.md` for the `drizzle` skill before writing schema or migration code — `drizzle-kit`'s migration-generation workflow has changed across minor versions more than once.

---

## Background jobs & concurrency

| Library     | Version | Used for                                                                              |
| ----------- | ------- | ------------------------------------------------------------------------------------- |
| `node-cron` | 4.6.0   | Daily usage snapshot job, optional recurring scans                                    |
| `piscina`   | 5.3.0   | Optional worker-thread pooling for `scan.worker.ts`/`hash.worker.ts` under heavy load |

→ Check `AGENTS.md` for the `node-cron` and `piscina` skills before wiring `scheduler.ts` or pooling worker threads.

---

## Deletion, hashing & similarity

| Library             | Version | Used for                                                                                                                                                                                                                                                             |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trash`             | 10.1.1  | The **only** sanctioned file-removal path (Invariant I-1)                                                                                                                                                                                                            |
| `sharp`             | 0.35.3  | Image processing, feeds perceptual hashing                                                                                                                                                                                                                           |
| `blockhash-core`    | 0.1.0   | Perceptual hashing for near-duplicate images — **note: low version number, has not had a major release; sanity-check maintenance status against `code-standards.md` §15 dependency policy before/while using it, and be ready to swap it if it proves unmaintained** |
| `simple-statistics` | 7.9.3   | Linear-regression trend model for forecasting                                                                                                                                                                                                                        |

→ Check `AGENTS.md` for the `trash`, `sharp`, and `simple-statistics` skills before implementing `trash.ts`, `hashing.ts`, or `forecasting.ts` — `trash.ts` in particular backs a hard invariant, so its usage pattern must match current, correct API behavior exactly, not a remembered one.

---

## AI provider integration

| Library             | Version | Used for                                                                                                                                  |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ollama`            | 0.6.3   | Local model client — the zero-config default provider                                                                                     |
| `openai`            | 7.4.0   | Optional BYOK cloud provider                                                                                                              |
| `@anthropic-ai/sdk` | 0.115.0 | Optional BYOK cloud provider                                                                                                              |
| `groq-sdk`          | 1.5.0   | Optional BYOK cloud provider                                                                                                              |
| — (plain `fetch`)   | n/a     | OpenRouter, as a generic OpenAI-compatible endpoint                                                                                       |
| `zod`               | 4.4.3   | Schema definition/validation for IPC contracts _and_ for validating structured LLM output before it's trusted (§4.7 of `architecture.md`) |

→ Check `AGENTS.md` for each provider's skill (`ollama`, `openai`, `anthropic`, `groq`) before touching `llm-client.ts` — these SDKs' method signatures and streaming APIs change often enough that this is exactly the "don't rely on training knowledge" case the top of this file warns about. Also check the `zod` skill specifically before writing new schemas — v4 has real API differences from the v3 patterns that show up most often in training data (e.g. error-handling and `.parse` behavior changes).

---

## Logging

| Library        | Version | Used for                                                                                                   |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `electron-log` | 5.4.4   | Structured logging with file rotation, used everywhere instead of `console.log` per `code-standards.md` §8 |

→ Check `AGENTS.md` for the `electron-log` skill before wiring the shared logger utility — confirm its redaction/transport config matches the "never log a secret" requirement (Invariant I-5) before it's used anywhere near `secure-storage.ts` or `ai-provider.ts`.

---

## Testing & tooling

| Library                  | Version | Used for                                      |
| ------------------------ | ------- | --------------------------------------------- |
| `vitest`                 | 4.1.10  | Test runner, main-process logic and renderer  |
| `@testing-library/react` | 16.3.2  | Component tests in `packages/ui` and renderer |
| `eslint`                 | 10.8.0  | Linting                                       |
| `prettier`               | 3.9.6   | Formatting                                    |

→ Check `AGENTS.md` for the `vitest` and `eslint` skills before setting up new test config or lint rules — ESLint's flat-config model and Vitest's config surface have both moved past what a lot of older tutorials/training data describe.

---

## Verification note

The version numbers above were fetched directly from `registry.npmjs.org` (each package's `/latest` endpoint) rather than recalled from training data, in line with the authority order at the top of this file. Node.js's LTS status was cross-checked against current release-schedule reporting rather than npm, since it isn't an npm package. Treat this table as a snapshot, not a lockfile — re-verify before starting a new phase of work if meaningful time has passed, and let the actual `package.json`/`yarn.lock` in the repo be the final source of truth for what's really installed at any given moment.
