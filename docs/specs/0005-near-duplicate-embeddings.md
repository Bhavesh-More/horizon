# 0005. Near duplicate detection with embeddings

**Date**: 2026-08-17
**Status**: Accepted

## Summary

This specification defines the near duplicate document detection engine in Horizon. By connecting to the unified AI provider subsystem established in Phase 6, the engine extracts text embeddings from document files using local Ollama (`nomic-embed-text`) by default or OpenAI (`text-embedding-3-small`) when configured. Documents with high cosine similarity (0.85 or higher) are grouped into semantic duplicate clusters with visual similarity percentages, recommended keep tags, and safe trash actions in the Duplicates tab.

## Context

Phase 3 established exact hash duplicate detection using chunked SHA 256 for all file types and perceptual image hashing (`sharp` plus `blockhash core`) for near duplicate images. However, documents and text files that share substantially identical content with minor wording changes, differing headers, or format variations cannot be caught by exact cryptographic hashes.

Phase 6 delivered the unified AI provider abstraction (`llm-client.ts`). Phase 7 extends this foundation by adding an embedding service (`embeddings.ts`) that extracts high dimensional vector representations of text documents. These embeddings allow fast cosine similarity comparisons to detect near duplicate text documents and source code without transmitting full document contents to external cloud services.

## Requirements

**User stories**:
- As a user, I want Horizon to identify near duplicate documents and code files so that I can clean up redundant drafts, copies, and exports.
- As a user, I want to see a similarity score percentage for each near duplicate file so that I understand why the files were grouped together.
- As a user, I want Horizon to recommend which document to keep (defaulting to newest or largest) while giving me full control to change the selection.
- As a user, I want embedding generation to run efficiently in the background without freezing the desktop user interface.

**Acceptance criteria**:
- **AC-1**: The system identifies text and document candidates (`.txt`, `.md`, `.json`, `.csv`, `.log`, `.js`, `.ts`, `.py`, `.html`, `.css`) from the current scan index.
- **AC-2**: The embedding extractor reads up to the first 2,000 characters of clean text per candidate document to compute vector embeddings, preserving memory and privacy.
- **AC-3**: Embeddings are generated using the active AI provider (local Ollama `nomic-embed-text` by default, or OpenAI `text-embedding-3-small` if cloud provider is active).
- **AC-4**: Pairs of documents with cosine similarity of 0.85 or higher are clustered into `duplicate_groups` with `hash_type = 'embedding'`.
- **AC-5**: Each group member in `duplicate_group_members` receives a computed `similarity_score` between 0.85 and 1.0 and a recommended keep flag.
- **AC-6**: The Duplicates tab displays embedding groups with a distinct badge, document icon, and percentage score, filterable via the existing type filter chips.
- **AC-7**: Trashing selected files from an embedding duplicate group utilizes the standard `cleanup:trash` flow and confirmation modal with zero permanent deletions.

## Options considered

### Option 1: Unified AI provider embeddings with in memory cosine clustering

Leverage the Phase 6 `llm-client.ts` provider integration to generate embeddings (`nomic-embed-text` on Ollama, `text-embedding-3-small` on OpenAI) and compute pairwise cosine similarity in Node.js.

**Pros**:
- Reuses existing provider configuration and BYOK key infrastructure.
- High semantic accuracy across varied wording and minor edits.
- Fully offline and private when using default local Ollama.

**Cons**:
- Requires local Ollama to have an embedding model installed, or needs graceful fallback when missing.

### Option 2: Pure client side TF-IDF or MinHash algorithms

Compute document similarity using word frequency histograms or character n-gram MinHash algorithms in pure JavaScript.

**Pros**:
- No AI provider or external model required.

**Cons**:
- Fails on semantic synonyms, paraphrasing, or structural document edits; produces higher false positives.
- Does not fulfill the AI powered differentiator requirement in the track brief.

### Option 3: Embedded ONNX runtime with bundled model weights

Bundle a local ONNX model file (such as MiniLM) inside the Electron application package.

**Pros**:
- Self contained with no Ollama daemon dependency.

**Cons**:
- Bloats application binary size by hundreds of megabytes.
- Increases build complexity and native compilation friction across platforms.

## Decision

**Chosen option**: Option 1: Unified AI provider embeddings with in memory cosine clustering.

Horizon will compute document embeddings using the active provider in `llm-client.ts` (`nomic-embed-text` for Ollama, `text-embedding-3-small` for OpenAI) and cluster candidates with cosine similarity of 0.85 or above.

## Rationale

Option 1 provides superior semantic matching quality while leveraging the single AI provider architecture established in Phase 6. It maintains zero config local privacy by default through Ollama and respects Invariant I-6 by sampling only a small text excerpt (up to 2,000 characters) for embedding calculation.

## Feature design

**Data model sketch**:
Reuses existing tables with `hash_type = 'embedding'`:
```sql
-- duplicate_groups: hash_type is 'embedding', representative_hash is a generated cluster signature
-- duplicate_group_members: similarity_score holds the floating-point cosine similarity (e.g. 0.94)
```

**Pipeline & State Transitions**:
1. Scan Index Query: Query `file_index` for unindexed document files matching supported text extensions.
2. Text Extraction: Read head text (first 2,000 characters) safely with UTF 8 encoding.
3. Embedding Generation: Batch requests to active AI provider embedding endpoint.
4. Cosine Similarity Clustering: Compute dot product of normalized vector pairs; group documents with similarity >= 0.85.
5. DB Persistence: Write groups and members into `duplicate_groups` and `duplicate_group_members`.
6. Progress Streaming: Stream `duplicates:progress` events with `phase: 'embedding'`.

**API surface**:
| IPC Channel | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `duplicates:list` | invoke | `scanRunId?: number`, `hashType?: 'all' \| 'exact' \| 'perceptual' \| 'embedding'` | `groups: DuplicateGroup[]`, `totalGroups: number` | internal | 500 query failed |
| `duplicates:start` | invoke | `scanRunId?: number` | `groupsCount: number` | internal | 500 execution failed |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Embedding duplicate groups | List of clustered document files | `duplicate_groups` and `duplicate_group_members` SQLite tables |
| Similarity score | Percentage (e.g. "94% match") | `duplicate_group_members.similarity_score` computed via vector cosine similarity |
| Recommended keep file | Pre selected file to preserve | Newest file by `modified_at` or largest by `size_bytes` |

**Key invariants**:
- **Invariant I-6**: Embeddings are generated from text excerpts (up to 2,000 characters), never full sensitive binaries or unrestricted file dumps.
- **Invariant I-12**: Embedding generation runs asynchronously and yields to the event loop so the Electron main window remains responsive.

**Security model**:
- Local files are read read-only with size limits.
- If Ollama is offline or embedding model is absent, the system fails gracefully with a descriptive warning without crashing.

**Critical test scenarios**:
- Happy path: Two reworded text files with 90% identical content correctly cluster into an embedding group with score >= 0.85, verifies **AC-1**, **AC-4**, **AC-5**.
- Distinct files rejection: Two completely different documents produce similarity < 0.85 and are NOT grouped, verifies **AC-4**.
- UI rendering and filtering: Duplicates tab filters embedding groups and displays similarity pills, verifies **AC-6**.
- Safe trash removal: Trashing an embedding duplicate member updates the group and writes to `cleanup_actions`, verifies **AC-7**.

## Build plan

1. Extend `packages/shared-types/src/duplicates.ts` to include `embedding` phase in `DuplicateDetectionProgressSchema` and verify contracts, satisfies **AC-4**, **AC-6**.
2. Implement `apps/desktop/src/main/services/embeddings.ts` supporting document text extraction, provider vector generation, cosine similarity math, and group clustering, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.
3. Integrate embedding clustering into `apps/desktop/src/main/services/hashing.ts` duplicate detection pipeline, satisfies **AC-4**, **AC-5**.
4. Update `apps/desktop/src/renderer/src/components/DuplicateGroupCard.tsx` and `DuplicatesTab.tsx` with document iconography, embedding filter chips, and similarity score badges, satisfies **AC-6**.
5. Add comprehensive unit tests in `apps/desktop/src/main/services/embeddings.test.ts`, satisfies **AC-1** through **AC-7**.

## Consequences

**Positive**:
- Completes the third and final tier of duplicate detection (Exact, Perceptual, and Embedding).
- Enables users to discover near duplicate notes, code files, and document drafts that exact hashing misses.

**Negative / tradeoffs**:
- Embedding extraction requires network call to active provider or running local Ollama embedding model.
- Requires candidate files to be text readable (binary files without text extracts are skipped).

**Neutral**:
- Reuses existing `duplicate_groups` schema and `cleanup:trash` safety infrastructure.

## Follow-up

- [ ] Add PDF and DOCX plain text extraction support in future enhancements.
