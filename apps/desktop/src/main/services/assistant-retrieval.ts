/**
 * assistant-retrieval.ts
 * Owns: Fresh metadata retrieval for one Assistant chat request.
 * Upholds:
 * - Invariant I-6: returns file metadata only, never raw file contents.
 * - Renderer isolation: all SQLite access stays in the main process.
 */
import path from "node:path";
import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { fileIndex, scanRuns } from "../db/schema";
import { getDuplicateGroups } from "./hashing";
import { getForecastData } from "./forecasting";
import {
  getActiveRecommendations,
  getLatestCompletedScanRunId,
} from "./recommendation-repository";
import {
  AssistantRetrievedFile,
  AssistantRetrievalContext,
} from "@horizon/shared-types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "assistant",
  "before",
  "between",
  "could",
  "delete",
  "files",
  "folder",
  "from",
  "horizon",
  "large",
  "please",
  "remove",
  "show",
  "space",
  "that",
  "their",
  "there",
  "these",
  "this",
  "what",
  "where",
  "which",
  "with",
  "would",
]);

function fileName(filePath: string): string {
  return path.basename(filePath) || filePath;
}

function toRetrievedFile(row: {
  id: number;
  path: string;
  sizeBytes: number;
  category: string;
  extension?: string | null;
  modifiedAt?: string | null;
  accessedAt?: string | null;
}): AssistantRetrievedFile {
  return {
    fileId: row.id,
    name: fileName(row.path),
    path: row.path,
    sizeBytes: row.sizeBytes,
    category: row.category,
    extension: row.extension ?? null,
    modifiedAt: row.modifiedAt ?? null,
    accessedAt: row.accessedAt ?? null,
  };
}

export function extractAssistantSearchTerms(message: string): string[] {
  const seen = new Set<string>();
  const tokens = message
    .toLowerCase()
    .replace(/['"]/g, "")
    .split(/[^a-z0-9._-]+/)
    .flatMap((token) => token.split(/[._-]+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  for (const token of tokens) {
    seen.add(token);
    if (seen.size >= 10) break;
  }

  return [...seen];
}

function parseScopePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function getMatchedFiles(
  scanRunId: number,
  terms: string[]
): Promise<AssistantRetrievedFile[]> {
  if (terms.length === 0) return [];

  const conditions = terms.flatMap((term) => {
    const pattern = `%${term}%`;
    return [
      like(fileIndex.path, pattern),
      like(fileIndex.category, pattern),
      like(fileIndex.extension, pattern),
    ];
  });

  const rows = await db
    .select({
      id: fileIndex.id,
      path: fileIndex.path,
      sizeBytes: fileIndex.sizeBytes,
      extension: fileIndex.extension,
      category: fileIndex.category,
      modifiedAt: fileIndex.modifiedAt,
      accessedAt: fileIndex.accessedAt,
    })
    .from(fileIndex)
    .where(
      and(
        eq(fileIndex.scanRunId, scanRunId),
        isNull(fileIndex.removedAt),
        or(...conditions)
      )
    )
    .orderBy(desc(fileIndex.sizeBytes))
    .limit(12);

  return rows.map(toRetrievedFile);
}

export async function buildAssistantRetrievalContext(
  message: string,
  scanRunId?: number
): Promise<AssistantRetrievalContext> {
  const resolvedScanRunId = scanRunId ?? getLatestCompletedScanRunId();
  const generatedAt = new Date().toISOString();
  const emptyContext: AssistantRetrievalContext = {
    generatedAt,
    evidenceStrength: "none",
    searchTerms: extractAssistantSearchTerms(message),
    scan: null,
    matchedFiles: [],
    duplicates: [],
    forecast: null,
    recommendations: [],
  };

  if (!resolvedScanRunId) return emptyContext;

  const scan = db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.id, resolvedScanRunId))
    .get();

  if (!scan || scan.status !== "complete" || !scan.completedAt) {
    return emptyContext;
  }

  const searchTerms = emptyContext.searchTerms;
  const matchedFiles = await getMatchedFiles(resolvedScanRunId, searchTerms);
  const duplicateData = await getDuplicateGroups(resolvedScanRunId);
  const forecastData = getForecastData();
  const activeRecommendations = getActiveRecommendations(resolvedScanRunId);

  const duplicates = duplicateData.groups.slice(0, 5).map((group) => ({
    groupId: group.groupId,
    type: group.hashType === "exact" ? ("exact" as const) : ("near" as const),
    memberCount: group.memberCount,
    reclaimableBytes: group.reclaimableBytes,
    members: group.members.slice(0, 4).map((member) =>
      toRetrievedFile({
        id: member.fileId,
        path: member.path,
        sizeBytes: member.sizeBytes,
        category: member.category,
        extension: member.extension ?? null,
        modifiedAt: member.modifiedAt ?? null,
      })
    ),
  }));

  const fastestGrowingCategories = forecastData.categoryForecasts
    .slice(0, 4)
    .map((item) => ({
      category: item.category,
      growthBytesPerDay: item.slopeBytesPerDay,
    }));

  const context: AssistantRetrievalContext = {
    generatedAt,
    evidenceStrength:
      matchedFiles.length > 0 ||
      duplicates.length > 0 ||
      activeRecommendations.length > 0 ||
      !!forecastData.totalForecast
        ? "useful"
        : "weak",
    searchTerms,
    scan: {
      scanId: scan.id,
      completedAt: scan.completedAt,
      totalFiles: scan.totalFiles ?? 0,
      totalBytes: scan.totalBytes ?? 0,
      scopePaths: parseScopePaths(scan.scopePaths),
    },
    matchedFiles,
    duplicates,
    forecast: forecastData.totalForecast
      ? {
          projectedFullDate: forecastData.totalForecast.projectedFullDate,
          daysToFull: forecastData.totalForecast.horizonDays,
          confidence: forecastData.totalForecast.confidenceScore,
          fastestGrowingCategories,
        }
      : null,
    recommendations: activeRecommendations.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      reason: item.reason,
      targetTab: item.targetTab,
      relatedFileIds: item.relatedFileIds,
    })),
  };

  return context;
}
