import { and, isNull, eq, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { fileIndex } from "../db/schema";
import {
  FileCategory,
  UnusedFileGroup,
  UnusedFileItem,
  UnusedFilesListResponse,
} from "@horizon/shared-types";

/**
 * Queries file_index for files untouched beyond thresholdDays.
 * Uses accessed_at when present; falls back to modified_at when accessed_at is null.
 *
 * Invariant I-4: Files marked removed_at are never included.
 */
export async function getUnusedFiles(
  thresholdDays: number = 180,
  category?: string,
  scanRunId?: number
): Promise<UnusedFilesListResponse> {
  const cutoffDate = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const conditions = [
    isNull(fileIndex.removedAt),
    sql`COALESCE(${fileIndex.accessedAt}, ${fileIndex.modifiedAt}) <= ${cutoffDate}`,
  ];

  if (category && category !== "all") {
    conditions.push(eq(fileIndex.category, category));
  }

  if (scanRunId) {
    conditions.push(eq(fileIndex.scanRunId, scanRunId));
  }

  const rows = await db
    .select({
      id: fileIndex.id,
      path: fileIndex.path,
      sizeBytes: fileIndex.sizeBytes,
      extension: fileIndex.extension,
      category: fileIndex.category,
      createdAt: fileIndex.createdAt,
      modifiedAt: fileIndex.modifiedAt,
      accessedAt: fileIndex.accessedAt,
    })
    .from(fileIndex)
    .where(and(...conditions))
    .orderBy(desc(fileIndex.sizeBytes));

  const groupsMap = new Map<FileCategory, UnusedFileItem[]>();
  let totalFiles = 0;
  let totalReclaimableBytes = 0;

  for (const row of rows) {
    const cat = row.category as FileCategory;
    const lastActivity =
      row.accessedAt || row.modifiedAt || row.createdAt || cutoffDate;
    const usedFallback = !row.accessedAt && !!row.modifiedAt;

    const item: UnusedFileItem = {
      fileId: row.id,
      path: row.path,
      sizeBytes: row.sizeBytes,
      extension: row.extension,
      category: cat,
      lastActivity,
      usedFallback,
    };

    if (!groupsMap.has(cat)) {
      groupsMap.set(cat, []);
    }
    groupsMap.get(cat)!.push(item);

    totalFiles += 1;
    totalReclaimableBytes += row.sizeBytes;
  }

  // Construct structured groups ordered by totalSizeBytes desc
  const groups: UnusedFileGroup[] = Array.from(groupsMap.entries())
    .map(([groupCategory, files]) => {
      const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
      return {
        category: groupCategory,
        fileCount: files.length,
        totalSizeBytes,
        files,
      };
    })
    .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

  return {
    groups,
    totalFiles,
    totalReclaimableBytes,
  };
}
