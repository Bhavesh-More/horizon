# 0004. AI provider foundation (BYOK)

**Date**: 2026-08-17
**Status**: Accepted

## Summary

Horizon requires an intelligent AI provider subsystem that powers future near duplicate embeddings, scan recommendations, and grounded chat assistance. This specification establishes local Ollama as the zero configuration default engine while enabling a Bring Your Own Key model for cloud providers (OpenAI, and later Anthropic, Groq, and OpenRouter). All API credentials are encrypted at rest using operating system credential stores via Electron safeStorage, never touching SQLite or plain logs. The Settings tab provides a unified management view for provider selection, model discovery, and connection testing.

## Context

Previous phases delivered the core scanning engine, deletion safety policy, duplicate detection, unused files inspection, and large files management (Phases 0 through 5). The upcoming differentiators (Phase 7 near duplicate embeddings, Phase 8 forecasting integration, Phase 9 AI recommendations, and Phase 10 chat assistant) all depend on a single, reliable AI provider abstraction.

The application architecture demands strict privacy boundaries. User files and disk metadata must remain private. A shared embedded API key would risk key leakage in public repositories, introduce billing liabilities, and hit shared rate limits during evaluations. Therefore, Horizon adopts a Bring Your Own Key architecture. Local Ollama runs completely offline with no credentials needed. When users choose cloud providers such as OpenAI, credentials must be stored with operating system level encryption (macOS Keychain, Windows DPAPI, or Linux Secret Service via Electron safeStorage) rather than plain database records.

Furthermore, Invariant I-7 mandates that the system must never silently fall back to a cloud provider when local Ollama is unreachable. Network calls to cloud providers may occur only when explicitly configured and activated by the user.

## Requirements

**User stories**:
- As a user, I want Horizon to run AI features using local Ollama by default so that my storage analysis remains completely offline and private.
- As a user, I want to connect my own cloud AI provider (such as OpenAI) with an API key when my machine lacks local GPU capacity.
- As a user, I want my API keys securely protected by the operating system credential store so that credentials are never leaked or stored in plain text.
- As a user, I want to test my provider connection in Settings and see clear latency and error feedback before activating it.

**Acceptance criteria**:
- **AC-1**: Local Ollama is configured as the active default provider on initial launch, requiring no API key and triggering no external cloud network traffic.
- **AC-2**: The system queries local Ollama (`http://127.0.0.1:11434/api/tags`) to discover installed local models (such as `llama3.2:3b` or `llama3.2`), defaulting to `llama3.2:3b` if available.
- **AC-3**: Cloud provider API keys (such as OpenAI) are encrypted via Electron `safeStorage` and stored exclusively in a secure encrypted file (`secrets.enc`), never written to SQLite, never returned over IPC, and never logged.
- **AC-4**: The `ai_provider_config` SQLite table stores metadata only (`provider_name`, `model_name`, `is_active`, `added_at`).
- **AC-5**: Saving a cloud provider configuration triggers an immediate 1-token probe request; if the validation fails (invalid key, quota exceeded, network timeout), the configuration is rejected with an explanatory error and no credentials are saved.
- **AC-6**: Switching active providers updates `ai_provider_config.is_active` atomically in the database so that subsequent AI requests route to the chosen provider.
- **AC-7**: The unified `llm-client.ts` exposes standard completion and structured generation methods (`generateCompletion`, `generateStructured`) with automatic retry and error handling.
- **AC-8**: The Settings tab renders a clean vertical layout with an Active Provider status badge, a Provider Selection card with masked API key inputs, an Appearance theme toggle, and a Scan Scope overview.

## Options considered

### Option 1: Multi-provider abstraction with OS-backed safeStorage and local Ollama default

Use a unified `llm-client.ts` service in the Electron main process wrapping the official SDKs (`ollama`, `openai`). Store secrets in encrypted form using Electron's built-in `safeStorage` API. Manage active configuration state in SQLite.

**Pros**:
- Strictly upholds privacy and security invariants (I-5, I-6, I-7).
- Zero-configuration local execution with Ollama.
- High flexibility for users wanting stronger cloud models.
- No external secret management dependencies needed beyond Electron core.

**Cons**:
- Requires managing encryption key fallbacks for test environments lacking OS keychain access.

### Option 2: Hardcoded shared cloud API key

Embed a team-managed API key inside the desktop build for all cloud completions.

**Pros**:
- Users do not need to supply keys or run Ollama locally.

**Cons**:
- Directly violates security and privacy requirements; risks catastrophic key leaks in public repos.
- Incurs ongoing billing costs and rate limit bottlenecks across testers.

### Option 3: Plaintext API key storage in SQLite

Store user provided API keys directly in the `settings` or `ai_provider_config` SQLite tables.

**Pros**:
- Simpler implementation without encryption layers.

**Cons**:
- Violates Invariant I-5; exposes sensitive credentials to any process or inspection of the local database file.

## Decision

**Chosen option**: Option 1: Multi-provider abstraction with OS-backed safeStorage and local Ollama default.

Horizon will implement a unified TypeScript LLM service in the main process with zero-config local Ollama and Bring Your Own Key support for OpenAI, storing secrets exclusively via Electron safeStorage.

## Rationale

Option 1 provides the ideal balance of privacy, security, and developer ergonomics. Local Ollama ensures that the app functions out of the box with zero setup for users with local AI runtimes. The Bring Your Own Key architecture completely eliminates team billing liability and API key exposure risks. Utilizing Electron safeStorage leverages the native operating system keychain and DPAPI with zero third-party binary dependencies.

## Feature design

**Data model sketch**:
```sql
CREATE TABLE ai_provider_config (
    provider_name       TEXT PRIMARY KEY,     -- "ollama", "openai", "anthropic", "groq", "openrouter"
    model_name          TEXT NOT NULL,
    is_active           INTEGER NOT NULL DEFAULT 0,
    added_at            TEXT NOT NULL
);
```

**State transitions**:
- Provider Active State: `inactive (0)` → `active (1)`. Exactly one provider is active (`is_active = 1`) at any time.
- Configuration State: `Unconfigured` → `Validating (1-token probe)` → `Configured & Saved` (or `Rejected on Error`).

**API surface**:
| IPC Channel | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `ai-provider:getStatus` | invoke | none | `providers: AiProviderInfo[]`, `activeProvider: string` | internal | 500 internal error |
| `ai-provider:listOllamaModels` | invoke | none | `models: string[]`, `reachable: boolean` | internal | 503 service unavailable |
| `ai-provider:configure` | invoke | `provider: string`, `model: string`, `apiKey?: string`, `setActive?: boolean` | `success: boolean`, `message?: string` | internal | 400 invalid payload, 401 invalid key, 408 timeout |
| `ai-provider:select` | invoke | `provider: string` | `success: boolean` | internal | 404 provider unconfigured |
| `ai-provider:test` | invoke | `provider: string`, `model: string`, `apiKey?: string` | `success: boolean`, `latencyMs?: number`, `error?: string` | internal | 400 invalid request |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Get provider status | List of providers and active model name | `ai_provider_config` SQLite table |
| List local models | Available local model tags | HTTP GET to Ollama daemon (`http://127.0.0.1:11434/api/tags`) |
| Masked key status | Boolean indicator (`hasKey: true/false`) | Query to `secure-storage.ts` (`hasProviderKey`) |
| Active badge | Green / yellow status pill | Status query results comparing active provider and reachability |

**Key invariants**:
- **Invariant I-5**: Plaintext API keys must never be stored in SQLite, never returned across the IPC bridge, and never written to application logs.
- **Invariant I-6**: AI prompts must only include metadata (file names, sizes, timestamps, category tags), never raw file content.
- **Invariant I-7**: No cloud network call occurs without explicit user selection of a cloud provider with their own API key. No silent fallback to cloud on Ollama failure.
- **Invariant I-15**: Every IPC handler strictly parses incoming arguments using Zod schemas defined in `@horizon/shared-types`.

**Security model**:
- Secrets are encrypted with AES-GCM via `safeStorage.encryptString()` and written to `secrets.enc` in the application data directory.
- Test runners mock `safeStorage` using in-memory encryption to ensure fast and isolated test execution.

**Configuration required**:
- Local Ollama daemon: `http://127.0.0.1:11434` (standard local default).

**Critical test scenarios**:
- Happy path: Configure local Ollama, verify model discovery, set as active, verify completion generation, verifies **AC-1**, **AC-2**, **AC-6**, **AC-7**.
- Cloud BYOK path: Configure OpenAI with valid API key, verify 1-token probe succeeds, verify key is saved in encrypted store and absent in SQLite, verifies **AC-3**, **AC-4**, **AC-5**.
- Validation rejection: Configure OpenAI with invalid API key, verify probe fails with descriptive error and nothing is persisted, verifies **AC-5**.
- Offline / unreachable Ollama: Ollama service offline returns descriptive unreachable error without making cloud calls, verifies **AC-1**, **AC-7**.

## Build plan

1. Create Drizzle schema definition for `aiProviderConfig` and generate migration `0004_ai_provider_config.sql`, satisfies **AC-4**.
2. Define Zod schemas and TypeScript types in `packages/shared-types/src/ai-provider.ts` and add contract unit tests, satisfies **AC-1**, **AC-3**, **AC-5**.
3. Implement `apps/desktop/src/main/core/secure-storage.ts` for provider-keyed encryption and credential storage, satisfies **AC-3**.
4. Implement unified `apps/desktop/src/main/services/llm-client.ts` supporting Ollama and OpenAI with probe testing and structured generation, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-7**.
5. Implement IPC handler `apps/desktop/src/main/ipc/ai-provider.ts` and wire preload bridge in `apps/desktop/src/preload/index.ts`, satisfies **AC-1**, **AC-6**.
6. Build `apps/desktop/src/renderer/src/components/SettingsTab.tsx` with provider cards, masked key inputs, connection testing, and theme toggles, satisfies **AC-8**.
7. Connect Settings tab in `App.tsx` and verify complete flow end to end with automated test suite, satisfies **AC-1** through **AC-8**.

## Consequences

**Positive**:
- Establishes a clean, secure foundation for all subsequent AI features (Phases 7, 9, 10).
- Fully preserves user privacy by keeping Ollama local and BYOK credentials encrypted.
- Provides immediate visual feedback in Settings with live probe testing and model discovery.

**Negative / tradeoffs**:
- Requires users wishing to use cloud models to obtain and manage their own API keys.
- Local Ollama features require the user to have Ollama running locally on their machine.

**Neutral**:
- Adds one new SQLite table (`ai_provider_config`) and one encrypted secrets file (`secrets.enc`).

## Follow-up

- [ ] Expand provider presets to include Anthropic, Groq, and OpenRouter in `llm-client.ts` as Phase 9 recommendations and Phase 10 chat demand them.
- [ ] Connect embeddings endpoint in `llm-client.ts` during Phase 7 for document near-duplicate clustering.
