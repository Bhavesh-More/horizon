/**
 * embeddings.ts
 * Owns: Extracting document text, computing vector embeddings via active AI provider,
 * calculating cosine similarities, and clustering near-duplicate documents (Phase 7).
 *
 * Invariants:
 * - Invariant I-6: Reads up to first 2,000 characters of clean text excerpt only.
 * - Invariant I-7: Uses local Ollama by default, no silent cloud calls.
 * - Invariant I-12: Non-blocking asynchronous execution.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Ollama } from "ollama";
import OpenAI from "openai";
import { getProvidersStatus, getOllamaHost } from "./llm-client";
import { getProviderKey } from "../core/secure-storage";

export const SUPPORTED_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "log",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "html",
  "css",
  "yaml",
  "yml",
  "xml",
  "sql",
  "sh",
]);

export interface DocumentCandidate {
  fileId: number;
  path: string;
  sizeBytes: number;
  extension?: string | null;
  category: string;
  modifiedAt?: string | null;
  createdAt?: string | null;
}

export interface ClusteredEmbeddingMember {
  fileId: number;
  path: string;
  sizeBytes: number;
  extension?: string;
  category: string;
  modifiedAt?: string;
  similarityScore: number;
  isRecommendedKeep: boolean;
}

export interface ClusteredEmbeddingGroup {
  representativeHash: string;
  memberCount: number;
  totalSizeBytes: number;
  reclaimableBytes: number;
  members: ClusteredEmbeddingMember[];
}

// Ignored noise directories and files that should not be embedded
const IGNORED_PATH_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "vendor",
  "__pycache__",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".min.",
];

// In-memory cache for computed document embeddings across runs
const embeddingCache = new Map<string, number[]>();

/**
 * Checks if a file candidate is eligible for text embedding analysis
 */
export function isTextDocumentCandidate(
  filePath: string,
  category: string
): boolean {
  // Exclude noise paths
  const normPath = filePath.toLowerCase();
  for (const pattern of IGNORED_PATH_PATTERNS) {
    if (normPath.includes(pattern)) {
      return false;
    }
  }

  if (category === "document" || category === "dev_artifact" || category === "other") {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    return SUPPORTED_TEXT_EXTENSIONS.has(ext);
  }
  return false;
}

/**
 * Safely extracts up to maxChars (default 2,000) of clean UTF-8 text from file head
 */
export async function extractDocumentText(
  filePath: string,
  maxChars: number = 2000
): Promise<string | null> {
  try {
    const fileHandle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxChars * 2); // Allocate buffer for multi-byte UTF-8
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
    await fileHandle.close();

    if (bytesRead === 0) return null;

    const raw = buffer.toString("utf-8", 0, bytesRead);

    // Quick binary check (null bytes)
    if (raw.includes("\0")) {
      return null;
    }

    // Clean whitespace and limit to maxChars
    const cleaned = raw.replace(/\r\n/g, "\n").trim().slice(0, maxChars);
    return cleaned.length > 20 ? cleaned : null;
  } catch (err) {
    return null;
  }
}

/**
 * Computes vector cosine similarity between two numeric arrays
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Fetches embedding vector for a text string using the currently active AI provider
 */
export async function getEmbeddingVector(text: string): Promise<number[]> {
  const status = await getProvidersStatus();
  const active = status.providers.find((p) => p.isActive) || status.providers[0];

  if (!active || active.providerName === "ollama") {
    const ollama = new Ollama({ host: getOllamaHost() });
    try {
      // First try standard nomic-embed-text
      const res = await ollama.embeddings({
        model: "nomic-embed-text",
        prompt: text,
      });
      return res.embedding;
    } catch {
      // Fallback to active model embedding
      const res = await ollama.embeddings({
        model: active?.modelName || "llama3.2:3b",
        prompt: text,
      });
      return res.embedding;
    }
  }

  if (active.providerName === "openai") {
    const key = getProviderKey("openai");
    if (!key) {
      throw new Error("OpenAI API key missing in secure storage");
    }
    const client = new OpenAI({ apiKey: key });
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0].embedding;
  }

  throw new Error(`Embedding generation not supported for provider ${active.providerName}`);
}

/**
 * Clusters document candidates based on pairwise cosine similarity threshold
 */
export async function clusterDocumentEmbeddings(
  candidates: DocumentCandidate[],
  threshold: number = 0.85,
  onProgress?: (processed: number, total: number) => void
): Promise<ClusteredEmbeddingGroup[]> {
  // Cap candidate pool to avoid CPU/GPU lockup on huge repos
  const cappedCandidates = candidates.slice(0, 200);
  if (cappedCandidates.length < 2) {
    return [];
  }

  // 1. Extract text and compute embeddings for eligible candidates
  const validCandidates: { candidate: DocumentCandidate; embedding: number[] }[] = [];
  let processed = 0;

  for (const c of cappedCandidates) {
    if (isTextDocumentCandidate(c.path, c.category)) {
      const cacheKey = `${c.path}:${c.sizeBytes}:${c.modifiedAt || ""}`;
      let embedding = embeddingCache.get(cacheKey);

      if (!embedding) {
        const text = await extractDocumentText(c.path);
        if (text) {
          try {
            embedding = await getEmbeddingVector(text);
            if (embedding && embedding.length > 0) {
              embeddingCache.set(cacheKey, embedding);
            }
          } catch (err) {
            // If embedding fails (e.g. Ollama offline or busy), continue gracefully
            console.warn(`[embeddings] Failed embedding for ${c.path}:`, err);
          }
        }
      }

      if (embedding && embedding.length > 0) {
        validCandidates.push({ candidate: c, embedding });
      }
    }

    processed++;
    if (onProgress) {
      onProgress(processed, cappedCandidates.length);
    }
    // Yield to event loop to keep UI responsive and prevent thermal throttling
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  if (validCandidates.length < 2) {
    return [];
  }

  // 2. Build adjacency list of connected pairs with similarity >= threshold
  const n = validCandidates.length;
  const adj = new Map<number, { index: number; score: number }[]>();
  for (let i = 0; i < n; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(
        validCandidates[i].embedding,
        validCandidates[j].embedding
      );
      if (sim >= threshold) {
        adj.get(i)!.push({ index: j, score: sim });
        adj.get(j)!.push({ index: i, score: sim });
      }
    }
  }

  // 3. Find connected components (BFS / DFS)
  const visited = new Set<number>();
  const rawClusters: { index: number; avgScore: number }[][] = [];

  for (let i = 0; i < n; i++) {
    if (!visited.has(i) && adj.get(i)!.length > 0) {
      const component: number[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(curr);

        for (const neighbor of adj.get(curr)!) {
          if (!visited.has(neighbor.index)) {
            visited.add(neighbor.index);
            queue.push(neighbor.index);
          }
        }
      }

      if (component.length >= 2) {
        // Calculate average similarity score for each node in component
        const scoredComponent = component.map((idx) => {
          const neighbors = adj.get(idx)!.filter((nb) => component.includes(nb.index));
          const avgScore =
            neighbors.length > 0
              ? neighbors.reduce((acc, curr) => acc + curr.score, 0) / neighbors.length
              : 1.0;
          return { index: idx, avgScore: Math.min(1.0, Math.max(threshold, avgScore)) };
        });
        rawClusters.push(scoredComponent);
      }
    }
  }

  // 4. Transform components into ClusteredEmbeddingGroup format
  const groups: ClusteredEmbeddingGroup[] = rawClusters.map((cluster) => {
    const membersData = cluster.map(({ index, avgScore }) => ({
      candidate: validCandidates[index].candidate,
      similarityScore: Math.round(avgScore * 100) / 100,
    }));

    // Pick recommended keep file: newest modified_at, else largest size
    let bestKeepIndex = 0;
    for (let i = 1; i < membersData.length; i++) {
      const current = membersData[i].candidate;
      const best = membersData[bestKeepIndex].candidate;

      const currentTime = current.modifiedAt ? new Date(current.modifiedAt).getTime() : 0;
      const bestTime = best.modifiedAt ? new Date(best.modifiedAt).getTime() : 0;

      if (currentTime > bestTime || (currentTime === bestTime && current.sizeBytes > best.sizeBytes)) {
        bestKeepIndex = i;
      }
    }

    const members: ClusteredEmbeddingMember[] = membersData.map((m, idx) => ({
      fileId: m.candidate.fileId,
      path: m.candidate.path,
      sizeBytes: m.candidate.sizeBytes,
      extension: m.candidate.extension || path.extname(m.candidate.path).slice(1),
      category: m.candidate.category,
      modifiedAt: m.candidate.modifiedAt || undefined,
      similarityScore: m.similarityScore,
      isRecommendedKeep: idx === bestKeepIndex,
    }));

    const totalSizeBytes = members.reduce((acc, m) => acc + m.sizeBytes, 0);
    const keepSizeBytes = members[bestKeepIndex].sizeBytes;
    const reclaimableBytes = totalSizeBytes - keepSizeBytes;

    // Generate unique representative hash for the cluster
    const clusterHashKey = members.map((m) => m.fileId).sort().join("_");
    const representativeHash = `emb_${crypto.createHash("md5").update(clusterHashKey).digest("hex").slice(0, 16)}`;

    return {
      representativeHash,
      memberCount: members.length,
      totalSizeBytes,
      reclaimableBytes,
      members,
    };
  });

  return groups;
}
