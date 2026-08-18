import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow } from "electron";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { db } from "../db/client";
import { scanRuns, fileIndex, duplicateGroups, duplicateGroupMembers } from "../db/schema";
import {
  DuplicateGroup,
  DuplicateGroupMember,
  DuplicatesListResponse,
  DuplicateDetectionProgress,
} from "@horizon/shared-types";
import {
  clusterDocumentEmbeddings,
  isTextDocumentCandidate,
  ClusteredEmbeddingGroup,
} from "./embeddings";

// ---------------------------------------------------------------------------
// Singleton detection lock — prevents concurrent runs
// ---------------------------------------------------------------------------
let isRunning = false;

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------
function broadcastDuplicateProgress(event: DuplicateDetectionProgress) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send("duplicates:progress", event);
    }
  }
}

// ---------------------------------------------------------------------------
// Worker path resolution — robust for dev (electron-vite) and prod (packaged)
// ---------------------------------------------------------------------------
function resolveWorkerPath(): string {
  const candidates = [
    path.join(__dirname, "hash.worker.js"),                          // prod / out/main/
    path.join(app.getAppPath(), "out/main/hash.worker.js"),          // prod alt
    path.join(app.getAppPath(), "src/main/workers/hash.worker.ts"),  // dev source
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Last resort — let Node throw a meaningful error
  return candidates[0];
}

function spawnHashWorker(): Worker {
  const workerPath = resolveWorkerPath();
  const isTs = workerPath.endsWith(".ts");
  return new Worker(workerPath, isTs ? { execArgv: ["-r", "ts-node/register"] } : undefined);
}

/**
 * Promise wrapper around a single worker message exchange.
 * Wires listeners, then posts the trigger message — so no event is ever missed.
 * Always terminates the worker on completion or error.
 */
function runWorkerExchange<T>(
  worker: Worker,
  payload: object,
  resultEvent: string,
  onProgress: (msg: { processedFiles: number; totalFiles: number; phase: string }) => void
): Promise<T[]> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      console.warn(`[hash.worker] Timeout waiting for ${resultEvent}. Terminating worker.`);
      done([]);
    }, 60000);

    function done(results: T[]) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try { worker.terminate(); } catch {}
      resolve(results);
    }

    worker.on("message", (msg) => {
      if (msg.event === "progress") {
        onProgress(msg);
      } else if (msg.event === resultEvent) {
        done(msg.results || []);
      }
    });
    worker.on("error", (err) => {
      console.error(`[hash.worker] error:`, err);
      done([]);
    });
    worker.on("exit", (code) => {
      if (code !== 0 && !resolved) done([]);
    });

    // Post the trigger message AFTER listeners are attached
    worker.postMessage(payload);
  });
}

// ---------------------------------------------------------------------------
// Bulk DB helpers — use tx inside transaction
// ---------------------------------------------------------------------------
function bulkUpdateContentHash(items: Array<{ id: number; hash: string }>) {
  if (items.length === 0) return;
  db.transaction((tx) => {
    for (const item of items) {
      tx.update(fileIndex).set({ contentHash: item.hash }).where(eq(fileIndex.id, item.id)).run();
    }
  });
}

function bulkUpdatePerceptualHash(items: Array<{ id: number; hash: string }>) {
  if (items.length === 0) return;
  db.transaction((tx) => {
    for (const item of items) {
      tx.update(fileIndex).set({ perceptualHash: item.hash }).where(eq(fileIndex.id, item.id)).run();
    }
  });
}

// ---------------------------------------------------------------------------
// Hamming distance (XOR popcount over hex strings)
// ---------------------------------------------------------------------------
function popcountHex(hex1: string, hex2: string): number {
  if (hex1.length !== hex2.length) return 256;
  let dist = 0;
  for (let i = 0; i < hex1.length; i++) {
    const val = parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16);
    dist += (val & 1) + ((val >> 1) & 1) + ((val >> 2) & 1) + ((val >> 3) & 1);
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Union-Find for perceptual clustering
// ---------------------------------------------------------------------------
function makeUnionFind() {
  const parent = new Map<number, number>();
  function find(i: number): number {
    if (!parent.has(i)) parent.set(i, i);
    if (parent.get(i) !== i) parent.set(i, find(parent.get(i)!));
    return parent.get(i)!;
  }
  function union(i: number, j: number) {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent.set(ri, rj);
  }
  return { find, union };
}

// ---------------------------------------------------------------------------
// Main detection pipeline
// ---------------------------------------------------------------------------
export async function runDuplicateDetection(
  targetScanRunId?: number
): Promise<{ groupsCount: number }> {
  // Singleton guard — only one detection run at a time
  if (isRunning) return { groupsCount: 0 };
  isRunning = true;

  // Throttled progress broadcast (max 1 per 250 ms)
  let lastBroadcast = 0;
  function throttledProgress(event: DuplicateDetectionProgress) {
    const now = Date.now();
    if (event.event === "started" || event.event === "complete" || event.event === "failed") {
      broadcastDuplicateProgress(event);
      lastBroadcast = now;
    } else if (now - lastBroadcast >= 250) {
      broadcastDuplicateProgress(event);
      lastBroadcast = now;
    }
  }

  throttledProgress({ event: "started", phase: "exact", processedFiles: 0 });

  let totalGroups = 0;

  try {
    // ── Fetch active files ────────────────────────────────────────────────
    // Search across ALL non-removed active files in the database
    const activeFiles = await db
      .select({
        id: fileIndex.id,
        path: fileIndex.path,
        sizeBytes: fileIndex.sizeBytes,
        extension: fileIndex.extension,
        category: fileIndex.category,
        createdAt: fileIndex.createdAt,
        modifiedAt: fileIndex.modifiedAt,
      })
      .from(fileIndex)
      .where(isNull(fileIndex.removedAt));

    console.log(`[hashing] Starting duplicate detection across ${activeFiles.length} active files.`);

    if (activeFiles.length === 0) {
      throttledProgress({ event: "complete", groupsFound: 0 });
      return { groupsCount: 0 };
    }

    // ── EXACT DUPLICATE DETECTION ─────────────────────────────────────────
    // Tier-1 pre-filter: group files by size, skip unique sizes and 0-byte empty files
    const sizeMap = new Map<number, typeof activeFiles>();
    for (const file of activeFiles) {
      const numSize = Number(file.sizeBytes);
      if (!numSize || numSize === 0) continue;
      const list = sizeMap.get(numSize) ?? [];
      list.push(file);
      sizeMap.set(numSize, list);
    }

    const exactCandidates = [...sizeMap.values()]
      .filter((list) => list.length > 1)
      .flat()
      .map((f) => ({ id: f.id, path: f.path, sizeBytes: f.sizeBytes }));

    console.log(`[hashing] Identified ${exactCandidates.length} candidate files sharing identical size bytes across categories.`);

    let exactHashGroups = new Map<string, number[]>();
    const exactGroupedFileIds = new Set<number>();
    let hashResultsList: Array<{ id: number; hash: string }> = [];

    if (exactCandidates.length > 0) {
      const worker = spawnHashWorker();

      hashResultsList = await runWorkerExchange<{ id: number; hash: string }>(
        worker,
        { action: "hashExact", files: exactCandidates },
        "exactResult",
        (msg) => {
          throttledProgress({
            event: "progress",
            phase: "exact",
            processedFiles: msg.processedFiles,
            totalFiles: msg.totalFiles,
          });
        }
      );

      // Bulk-write content hashes into file_index
      bulkUpdateContentHash(hashResultsList);

      // Group by hash
      for (const item of hashResultsList) {
        const list = exactHashGroups.get(item.hash) ?? [];
        list.push(item.id);
        exactHashGroups.set(item.hash, list);
      }

      for (const [hash, fileIds] of exactHashGroups.entries()) {
        if (fileIds.length >= 2) {
          for (const id of fileIds) {
            exactGroupedFileIds.add(id);
          }
        }
      }
      console.log(`[hashing] Exact matching generated ${exactGroupedFileIds.size} duplicate file matches.`);
    }

    // ── PERCEPTUAL IMAGE DUPLICATE DETECTION ──────────────────────────────
    throttledProgress({ event: "progress", phase: "perceptual", processedFiles: 0 });

    // Exclude images that are already in an exact match group
    const imageFiles = activeFiles.filter(
      (f) => f.category === "image" && !exactGroupedFileIds.has(f.id)
    );

    let perceptualClusters = new Map<number, number[]>();
    let pHashResultsList: Array<{ id: number; hash: string }> = [];

    if (imageFiles.length > 1) {
      console.log(`[hashing] Running perceptual hashing on ${imageFiles.length} candidate images.`);
      const worker = spawnHashWorker();

      pHashResultsList = await runWorkerExchange<{ id: number; hash: string }>(
        worker,
        { action: "hashPerceptual", files: imageFiles.map((f) => ({ id: f.id, path: f.path })) },
        "perceptualResult",
        (msg) => {
          throttledProgress({
            event: "progress",
            phase: "perceptual",
            processedFiles: msg.processedFiles,
            totalFiles: msg.totalFiles,
          });
        }
      );

      // Bulk-write perceptual hashes
      bulkUpdatePerceptualHash(pHashResultsList);

      // Union-Find clustering (Hamming threshold ≤ 10 / 256 bits ≈ 96% similar)
      const HAMMING_THRESHOLD = 10;
      const { find, union } = makeUnionFind();

      for (let i = 0; i < pHashResultsList.length; i++) {
        for (let j = i + 1; j < pHashResultsList.length; j++) {
          if (popcountHex(pHashResultsList[i].hash, pHashResultsList[j].hash) <= HAMMING_THRESHOLD) {
            union(pHashResultsList[i].id, pHashResultsList[j].id);
          }
        }
      }

      for (const item of pHashResultsList) {
        const root = find(item.id);
        const list = perceptualClusters.get(root) ?? [];
        list.push(item.id);
        perceptualClusters.set(root, list);
      }
    }

    // ── STEP 3: SEMANTIC DOCUMENT EMBEDDINGS ───────────────────────────
    // Pre-filter: only un-grouped eligible text documents with meaningful size (100 B - 2 MB)
    const eligibleDocFiles = activeFiles.filter((f) => {
      if (exactGroupedFileIds.has(f.id)) return false;
      if (f.sizeBytes < 100 || f.sizeBytes > 2 * 1024 * 1024) return false;
      return isTextDocumentCandidate(f.path, f.category);
    });

    // Take top 200 candidates by size to prevent CPU overload and thermal throttling
    const documentCandidates = eligibleDocFiles
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 200)
      .map((f) => ({
        fileId: f.id,
        path: f.path,
        sizeBytes: f.sizeBytes,
        extension: f.extension,
        category: f.category,
        modifiedAt: f.modifiedAt,
        createdAt: f.createdAt,
      }));

    throttledProgress({
      event: "progress",
      phase: "embedding",
      processedFiles: 0,
      totalFiles: documentCandidates.length,
    });

    let embeddingGroups: ClusteredEmbeddingGroup[] = [];
    if (documentCandidates.length > 1) {
      console.log(`[hashing] Running semantic embeddings on ${documentCandidates.length} candidate documents.`);
      try {
        embeddingGroups = await clusterDocumentEmbeddings(
          documentCandidates,
          0.85,
          (processed, total) => {
            throttledProgress({
              event: "progress",
              phase: "embedding",
              processedFiles: processed,
              totalFiles: total,
            });
          }
        );
      } catch (embErr) {
        console.warn("[hashing] Semantic embedding clustering skipped or failed:", embErr);
      }
    }

    // ── ATOMIC DATABASE UPDATE ───────────────────────────────────────────
    // Atomically replace old duplicate groups and members in a single transaction
    const nowIso = new Date().toISOString();
    const activeFileMap = new Map(activeFiles.map((f) => [f.id, f]));
    const pHashMap = new Map(pHashResultsList.map((r) => [r.id, r.hash]));

    let exactGroupsCreated = 0;
    let perceptualGroupsCreated = 0;
    let embeddingGroupsCreated = 0;

    db.transaction((tx) => {
      // Clear old results atomically right before inserting fresh results
      tx.delete(duplicateGroupMembers).run();
      tx.delete(duplicateGroups).run();

      // Insert Exact Match Groups
      for (const [hash, fileIds] of exactHashGroups.entries()) {
        if (fileIds.length < 2) continue;
        const totalSize = fileIds.reduce((acc, id) => acc + (activeFileMap.get(id)?.sizeBytes ?? 0), 0);
        const createdGroup = tx
          .insert(duplicateGroups)
          .values({ hashType: "exact", representativeHash: hash, totalSizeBytes: totalSize, memberCount: fileIds.length, createdAt: nowIso })
          .returning()
          .get();

        if (createdGroup) {
          tx.insert(duplicateGroupMembers)
            .values(fileIds.map((fileId) => ({ groupId: createdGroup.id, fileId, similarityScore: 1.0 })))
            .run();
          exactGroupsCreated++;
        }
      }

      // Insert Perceptual Image Groups
      for (const fileIds of perceptualClusters.values()) {
        if (fileIds.length < 2) continue;
        const representativeHash = pHashMap.get(fileIds[0]) ?? "";
        const totalSize = fileIds.reduce((acc, id) => acc + (activeFileMap.get(id)?.sizeBytes ?? 0), 0);
        const createdGroup = tx
          .insert(duplicateGroups)
          .values({ hashType: "perceptual", representativeHash, totalSizeBytes: totalSize, memberCount: fileIds.length, createdAt: nowIso })
          .returning()
          .get();

        if (createdGroup) {
          tx.insert(duplicateGroupMembers)
            .values(
              fileIds.map((fileId) => {
                const h = pHashMap.get(fileId) ?? representativeHash;
                const dist = popcountHex(representativeHash, h);
                return { groupId: createdGroup.id, fileId, similarityScore: Math.max(0, parseFloat((1 - dist / 256).toFixed(2))) };
              })
            )
            .run();
          perceptualGroupsCreated++;
        }
      }

      // Insert Semantic Embedding Groups
      for (const embGroup of embeddingGroups) {
        if (embGroup.members.length < 2) continue;
        const createdGroup = tx
          .insert(duplicateGroups)
          .values({
            hashType: "embedding",
            representativeHash: embGroup.representativeHash,
            totalSizeBytes: embGroup.totalSizeBytes,
            memberCount: embGroup.memberCount,
            createdAt: nowIso,
          })
          .returning()
          .get();

        if (createdGroup) {
          tx.insert(duplicateGroupMembers)
            .values(
              embGroup.members.map((m) => ({
                groupId: createdGroup.id,
                fileId: m.fileId,
                similarityScore: m.similarityScore,
              }))
            )
            .run();
          embeddingGroupsCreated++;
        }
      }
    });

    totalGroups = exactGroupsCreated + perceptualGroupsCreated + embeddingGroupsCreated;
    console.log(`[hashing] Duplicate detection complete. Created ${exactGroupsCreated} exact groups, ${perceptualGroupsCreated} perceptual groups, and ${embeddingGroupsCreated} embedding groups (${totalGroups} total groups).`);
    return { groupsCount: totalGroups };
  } catch (err) {
    console.error("[hashing] Detection failed:", err);
    throttledProgress({ event: "failed", error: String(err) });
    return { groupsCount: 0 };
  } finally {
    isRunning = false;
    // Always fire complete — even if failed event was already sent, the UI needs this
    throttledProgress({ event: "complete", groupsFound: totalGroups });
  }
}

// ---------------------------------------------------------------------------
// Public status API
// ---------------------------------------------------------------------------
export function isDetectionRunning() {
  return isRunning;
}

// ---------------------------------------------------------------------------
// getDuplicateGroups — query existing results
// ---------------------------------------------------------------------------
export async function getDuplicateGroups(
  scanRunId?: number,
  hashTypeFilter?: string
): Promise<DuplicatesListResponse> {
  const conditions = [];
  if (hashTypeFilter && hashTypeFilter !== "all") {
    conditions.push(eq(duplicateGroups.hashType, hashTypeFilter as any));
  }

  const groups = await db
    .select()
    .from(duplicateGroups)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(duplicateGroups.totalSizeBytes));

  if (groups.length === 0) {
    return { groups: [], totalGroups: 0, totalReclaimableBytes: 0 };
  }

  const groupIds = groups.map((g) => g.id);
  const memberRows: Array<{
    groupId: number;
    similarityScore: number | null;
    fileId: number;
    path: string;
    sizeBytes: number;
    extension: string | null;
    category: string;
    modifiedAt: string | null;
    removedAt: string | null;
  }> = [];
  const groupIdChunkSize = 500;

  for (let i = 0; i < groupIds.length; i += groupIdChunkSize) {
    const groupIdChunk = groupIds.slice(i, i + groupIdChunkSize);
    const rows = await db
      .select({
        groupId: duplicateGroupMembers.groupId,
        similarityScore: duplicateGroupMembers.similarityScore,
        fileId: fileIndex.id,
        path: fileIndex.path,
        sizeBytes: fileIndex.sizeBytes,
        extension: fileIndex.extension,
        category: fileIndex.category,
        modifiedAt: fileIndex.modifiedAt,
        removedAt: fileIndex.removedAt,
      })
      .from(duplicateGroupMembers)
      .innerJoin(fileIndex, eq(duplicateGroupMembers.fileId, fileIndex.id))
      .where(and(inArray(duplicateGroupMembers.groupId, groupIdChunk), isNull(fileIndex.removedAt)));

    memberRows.push(...rows);
  }

  const groupMembersMap = new Map<number, typeof memberRows>();
  for (const m of memberRows) {
    const list = groupMembersMap.get(m.groupId) ?? [];
    list.push(m);
    groupMembersMap.set(m.groupId, list);
  }

  const formattedGroups: DuplicateGroup[] = [];
  let totalReclaimableBytes = 0;

  for (const g of groups) {
    const members = groupMembersMap.get(g.id) ?? [];
    if (members.length < 2) continue;

    // Recommend keeping the newest file
    let keepIndex = 0;
    let newestDate = members[0].modifiedAt ? new Date(members[0].modifiedAt).getTime() : 0;
    for (let i = 1; i < members.length; i++) {
      const mDate = members[i].modifiedAt ? new Date(members[i].modifiedAt!).getTime() : 0;
      if (mDate > newestDate) { newestDate = mDate; keepIndex = i; }
    }

    const groupTotalBytes = members.reduce((acc, m) => acc + m.sizeBytes, 0);
    const reclaimableBytes = groupTotalBytes - members[keepIndex].sizeBytes;
    totalReclaimableBytes += reclaimableBytes;

    const formattedMembers: DuplicateGroupMember[] = members.map((m, idx) => ({
      fileId: m.fileId,
      path: m.path,
      sizeBytes: m.sizeBytes,
      extension: m.extension ?? undefined,
      category: m.category,
      modifiedAt: m.modifiedAt ?? undefined,
      similarityScore: m.similarityScore ?? 1.0,
      isRecommendedKeep: idx === keepIndex,
    }));

    formattedGroups.push({
      groupId: g.id,
      hashType: g.hashType as DuplicateGroup["hashType"],
      representativeHash: g.representativeHash,
      memberCount: members.length,
      totalSizeBytes: groupTotalBytes,
      reclaimableBytes,
      members: formattedMembers,
    });
  }

  return { groups: formattedGroups, totalGroups: formattedGroups.length, totalReclaimableBytes };
}
