import { and, isNull, eq, gte, asc, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { fileIndex } from "../db/schema";
import {
  FileCategory,
  LargeFileItem,
  LargeFilesListRequest,
  LargeFilesListResponse,
} from "@horizon/shared-types";

/**
 * Queries file_index for large files matching size, category, and sorting criteria.
 *
 * Invariant I-4: Files marked removed_at are never included.
 */
export async function getLargeFiles(
  options: Partial<LargeFilesListRequest> = {}
): Promise<LargeFilesListResponse> {
  const minSizeBytes = options.minSizeBytes ?? 52428800; // 50 MB
  const category = options.category;
  const sortBy = options.sortBy ?? "size";
  const sortOrder = options.sortOrder ?? "desc";
  const limit = options.limit ?? 500;
  const scanRunId = options.scanRunId;

  const conditions = [
    isNull(fileIndex.removedAt),
    gte(fileIndex.sizeBytes, minSizeBytes),
  ];

  if (category && (category as string) !== "all") {
    conditions.push(eq(fileIndex.category, category));
  }

  if (scanRunId) {
    conditions.push(eq(fileIndex.scanRunId, scanRunId));
  }

  // Determine sort expression
  let orderExpr;
  if (sortBy === "size") {
    orderExpr = sortOrder === "asc" ? asc(fileIndex.sizeBytes) : desc(fileIndex.sizeBytes);
  } else if (sortBy === "date") {
    orderExpr =
      sortOrder === "asc"
        ? sql`COALESCE(${fileIndex.modifiedAt}, ${fileIndex.accessedAt}, ${fileIndex.createdAt}) ASC`
        : sql`COALESCE(${fileIndex.modifiedAt}, ${fileIndex.accessedAt}, ${fileIndex.createdAt}) DESC`;
  } else if (sortBy === "name") {
    orderExpr = sortOrder === "asc" ? asc(fileIndex.path) : desc(fileIndex.path);
  } else {
    orderExpr = desc(fileIndex.sizeBytes);
  }

  const rows = await db
    .select({
      id: fileIndex.id,
      path: fileIndex.path,
      sizeBytes: fileIndex.sizeBytes,
      extension: fileIndex.extension,
      category: fileIndex.category,
      modifiedAt: fileIndex.modifiedAt,
      accessedAt: fileIndex.accessedAt,
      createdAt: fileIndex.createdAt,
    })
    .from(fileIndex)
    .where(and(...conditions))
    .orderBy(orderExpr)
    .limit(limit);

  let totalSizeBytes = 0;
  const files: LargeFileItem[] = rows.map((row) => {
    totalSizeBytes += row.sizeBytes;
    return {
      fileId: row.id,
      path: row.path,
      sizeBytes: row.sizeBytes,
      extension: row.extension,
      category: row.category as FileCategory,
      modifiedAt: row.modifiedAt,
      accessedAt: row.accessedAt,
      createdAt: row.createdAt,
    };
  });

  return {
    files,
    totalFiles: files.length,
    totalSizeBytes,
  };
}
