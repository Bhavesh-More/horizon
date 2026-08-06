/**
 * scanner.ts
 * Owns: Filesystem scanning, file metadata indexing, and persisting scan results.
 * Responsibilities & Invariants:
 * - Offloads scanning CPU work to worker threads (Invariant I-12).
 * - Persists scan runs and indexed files into SQLite (file_index & scan_runs tables).
 * - Performs high-throughput bulk SQLite inserts via transactions.
 * - Emits 10Hz-throttled, batched IPC scan progress events to renderer.
 */

import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { BrowserWindow } from "electron";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { scanRuns, fileIndex } from "../db/schema";
import {
  FileItem,
  GetLatestScanResponse,
  ScanProgressEvent,
} from "@horizon/shared-types";

let currentWorker: Worker | null = null;
let currentScanRunId: number | null = null;

// Throttled IPC Dispatcher (10Hz / 100ms debounce)
let pendingIpcBatch: FileItem[] = [];
let ipcThrottleTimer: NodeJS.Timeout | null = null;

function broadcastProgress(event: ScanProgressEvent) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send("scan:progress", event);
    }
  }
}

function flushIpcBatch(scanRunId: number) {
  if (pendingIpcBatch.length === 0) return;
  const filesToSend = [...pendingIpcBatch];
  pendingIpcBatch = [];
  broadcastProgress({
    event: "batch",
    scanRunId,
    files: filesToSend,
  });
}

function queueIpcFiles(scanRunId: number, files: FileItem[]) {
  pendingIpcBatch.push(...files);
  if (!ipcThrottleTimer) {
    ipcThrottleTimer = setTimeout(() => {
      ipcThrottleTimer = null;
      flushIpcBatch(scanRunId);
    }, 100);
  }
}

// Non-blocking Bulk SQLite Inserter with Event Loop Yielding
async function bulkInsertFiles(scanRunId: number, files: FileItem[]) {
  if (files.length === 0) return;

  const rows = files.map((f) => ({
    scanRunId,
    path: f.path,
    sizeBytes: f.sizeBytes,
    extension: f.extension,
    category: f.category,
    createdAt: f.createdAt,
    modifiedAt: f.modifiedAt,
    accessedAt: f.accessedAt,
  }));

  try {
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await db
        .insert(fileIndex)
        .values(chunk)
        .onConflictDoUpdate({
          target: fileIndex.path,
          set: {
            scanRunId,
            sizeBytes: sql`excluded.size_bytes`,
            extension: sql`excluded.extension`,
            category: sql`excluded.category`,
            modifiedAt: sql`excluded.modified_at`,
            accessedAt: sql`excluded.accessed_at`,
            removedAt: null,
          },
        });

      // Yield event loop between chunks so main process stays 100% smooth and never hangs OS cursor
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch (err) {
    console.error("Failed to bulk insert file_index rows:", err);
  }
}

export async function startScan(scope: string[]): Promise<{ scanRunId: number }> {
  // Terminate any running scan worker first
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
  if (ipcThrottleTimer) {
    clearTimeout(ipcThrottleTimer);
    ipcThrottleTimer = null;
  }
  pendingIpcBatch = [];

  // Expand relative scope names (e.g. Documents, Desktop) to absolute user home directory paths
  const resolvedScope = scope.map((p) =>
    path.isAbsolute(p) ? p : path.join(os.homedir(), p)
  );

  const now = new Date().toISOString();
  const [newRun] = await db
    .insert(scanRuns)
    .values({
      startedAt: now,
      scopePaths: JSON.stringify(resolvedScope),
      status: "running",
      totalFiles: 0,
      totalBytes: 0,
    })
    .returning();

  const scanRunId = newRun.id;
  currentScanRunId = scanRunId;

  broadcastProgress({
    event: "started",
    scanRunId,
  });

  const workerPath = path.join(__dirname, "scan.worker.js");
  const tsWorkerPath = path.join(__dirname, "../workers/scan.worker.ts");

  let worker: Worker;
  try {
    worker = new Worker(workerPath);
  } catch {
    worker = new Worker(tsWorkerPath, {
      execArgv: ["-r", "ts-node/register"],
    });
  }

  currentWorker = worker;

  let dbBuffer: FileItem[] = [];

  worker.on("message", async (msg: ScanProgressEvent) => {
    if (msg.event === "batch" && msg.files) {
      dbBuffer.push(...msg.files);

      // Queue for throttled IPC emission
      queueIpcFiles(scanRunId, msg.files);

      // Bulk insert into SQLite when buffer reaches 500 items
      if (dbBuffer.length >= 500) {
        const toInsert = [...dbBuffer];
        dbBuffer = [];
        await bulkInsertFiles(scanRunId, toInsert);
      }
    } else if (msg.event === "found" && msg.file) {
      dbBuffer.push(msg.file);
      queueIpcFiles(scanRunId, [msg.file]);

      if (dbBuffer.length >= 500) {
        const toInsert = [...dbBuffer];
        dbBuffer = [];
        await bulkInsertFiles(scanRunId, toInsert);
      }
    } else if (msg.event === "complete") {
      // Flush remaining DB & IPC items
      if (dbBuffer.length > 0) {
        const toInsert = [...dbBuffer];
        dbBuffer = [];
        await bulkInsertFiles(scanRunId, toInsert);
      }

      if (ipcThrottleTimer) {
        clearTimeout(ipcThrottleTimer);
        ipcThrottleTimer = null;
      }
      flushIpcBatch(scanRunId);

      const summary = msg.summary;
      const completedAt = new Date().toISOString();

      await db
        .update(scanRuns)
        .set({
          completedAt,
          status: "complete",
          totalFiles: summary?.totalFiles || 0,
          totalBytes: summary?.totalBytes || 0,
        })
        .where(eq(scanRuns.id, scanRunId));

      broadcastProgress({
        event: "complete",
        scanRunId,
        summary,
      });

      currentWorker = null;
      currentScanRunId = null;
    }
  });

  worker.on("error", async (error) => {
    console.error("Scan worker error:", error);
    await db
      .update(scanRuns)
      .set({
        status: "failed",
      })
      .where(eq(scanRuns.id, scanRunId));

    broadcastProgress({
      event: "failed",
      scanRunId,
      error: error.message,
    });

    currentWorker = null;
    currentScanRunId = null;
  });

  worker.postMessage({
    action: "start",
    scanRunId,
    scope: resolvedScope,
  });

  return { scanRunId };
}

export async function getLatestScan(): Promise<GetLatestScanResponse> {
  const latestRun = await db.query.scanRuns.findFirst({
    orderBy: [desc(scanRuns.id)],
  });

  if (!latestRun) {
    return {
      scanRun: null,
      recentFiles: [],
      categories: {},
    };
  }

  // Fetch recent files indexed in this scan run (up to 100)
  const files = await db.query.fileIndex.findMany({
    where: eq(fileIndex.scanRunId, latestRun.id),
    orderBy: [desc(fileIndex.id)],
    limit: 100,
  });

  // Calculate aggregated categories stats
  const catStats = await db
    .select({
      category: fileIndex.category,
      files: sql<number>`count(*)`,
      bytes: sql<number>`sum(${fileIndex.sizeBytes})`,
    })
    .from(fileIndex)
    .where(eq(fileIndex.scanRunId, latestRun.id))
    .groupBy(fileIndex.category);

  const categories: Record<string, { files: number; bytes: number }> = {};
  for (const stat of catStats) {
    categories[stat.category] = {
      files: Number(stat.files || 0),
      bytes: Number(stat.bytes || 0),
    };
  }

  return {
    scanRun: {
      id: latestRun.id,
      startedAt: latestRun.startedAt,
      completedAt: latestRun.completedAt,
      status: latestRun.status,
      totalFiles: latestRun.totalFiles ?? 0,
      totalBytes: latestRun.totalBytes ?? 0,
    },
    recentFiles: files.map((f) => ({
      id: f.id,
      scanRunId: f.scanRunId,
      path: f.path,
      sizeBytes: f.sizeBytes,
      extension: f.extension ?? undefined,
      category: f.category as FileItem["category"],
      createdAt: f.createdAt ?? undefined,
      modifiedAt: f.modifiedAt ?? undefined,
      accessedAt: f.accessedAt ?? undefined,
    })),
    categories,
  };
}
