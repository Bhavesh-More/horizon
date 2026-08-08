import { inArray, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { fileIndex, cleanupActions } from "../db/schema";
import { validatePathsForDeletion } from "./deletion-policy";
import { trashFiles } from "./trash";
import type { CleanupTrashResponse, TrashResultItem } from "@horizon/shared-types";

export async function processTrashCleanup(fileIds: number[]): Promise<CleanupTrashResponse> {
  if (!fileIds || fileIds.length === 0) {
    return {
      trashedCount: 0,
      blockedCount: 0,
      failedCount: 0,
      freedBytes: 0,
      results: [],
    };
  }

  // 1. Fetch file index rows matching requested IDs that have not already been removed
  const targetFiles = await db
    .select()
    .from(fileIndex)
    .where(and(inArray(fileIndex.id, fileIds), isNull(fileIndex.removedAt)));

  if (targetFiles.length === 0) {
    return {
      trashedCount: 0,
      blockedCount: 0,
      failedCount: fileIds.length,
      freedBytes: 0,
      results: fileIds.map((id) => ({
        fileId: id,
        path: "",
        sizeBytes: 0,
        status: "failed" as const,
        reason: "File record not found or already removed",
      })),
    };
  }


  const pathToFileMap = new Map(targetFiles.map((f) => [f.path, f]));
  const pathsToValidate = targetFiles.map((f) => f.path);

  // 2. Validate paths against policy engine (Invariant I-2)
  const { approved, blocked } = validatePathsForDeletion(pathsToValidate);

  const results: TrashResultItem[] = [];

  // Register blocked files
  for (const b of blocked) {
    const fileRecord = pathToFileMap.get(b.originalPath);
    if (fileRecord) {
      results.push({
        fileId: fileRecord.id,
        path: fileRecord.path,
        sizeBytes: fileRecord.sizeBytes,
        status: "blocked",
        reason: b.reason,
      });
    }
  }

  // 3. Move approved paths to Trash via single sanctioned entry point (Invariant I-1)
  const approvedPaths = approved.map((a) => a.originalPath);
  const trashBatchResult = await trashFiles(approvedPaths);

  const successfulFileIds: number[] = [];
  const trashedPaths: string[] = [];
  let freedBytes = 0;

  for (const res of trashBatchResult.results) {
    const fileRecord = pathToFileMap.get(res.path);
    if (!fileRecord) continue;

    if (res.ok) {
      successfulFileIds.push(fileRecord.id);
      trashedPaths.push(fileRecord.path);
      freedBytes += fileRecord.sizeBytes;

      results.push({
        fileId: fileRecord.id,
        path: fileRecord.path,
        sizeBytes: fileRecord.sizeBytes,
        status: "trashed",
      });
    } else {
      results.push({
        fileId: fileRecord.id,
        path: fileRecord.path,
        sizeBytes: fileRecord.sizeBytes,
        status: "failed",
        reason: res.error,
      });
    }
  }

  const nowIso = new Date().toISOString();

  // 4. Update file_index.removedAt for successfully trashed files
  if (successfulFileIds.length > 0) {
    await db
      .update(fileIndex)
      .set({ removedAt: nowIso })
      .where(inArray(fileIndex.id, successfulFileIds));

    // 5. Create cleanup_actions audit log record (Invariant I-14)
    await db.insert(cleanupActions).values({
      actionType: "trash",
      filePathsJson: JSON.stringify(trashedPaths),
      bytesFreed: freedBytes,
      performedAt: nowIso,
    });
  }

  const trashedCount = successfulFileIds.length;
  const blockedCount = blocked.length;
  const failedCount = trashBatchResult.failedCount;

  return {
    trashedCount,
    blockedCount,
    failedCount,
    freedBytes,
    results,
  };
}
