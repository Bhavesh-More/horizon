/**
 * recommendation-context.ts
 * Owns: building bounded metadata evidence for AI recommendations.
 * Upholds:
 * - Invariant I-6: prompts use paths, sizes, dates, categories, and hashes only.
 * - Invariant I-13: reclaimable totals are deduplicated by file_index.id.
 */
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { forecasts, scanRuns } from "../db/schema";
import {
  RecommendationContext,
  RecommendationDuplicateSummary,
  RecommendationForecastSummary,
  RecommendationLargeFileSummary,
  RecommendationUnusedSummary,
} from "@horizon/shared-types";
import { getDuplicateGroups } from "./hashing";
import { getLargeFiles } from "./large-files";
import { getUnusedFiles } from "./staleness";
import { getForecastData } from "./forecasting";

const EVIDENCE_LIMIT = 10;

function basename(filePath: string): string {
  return path.basename(filePath) || filePath;
}

function ageDays(dateText?: string | null): number {
  if (!dateText) return 0;
  const ms = Date.now() - new Date(dateText).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function scoreBytes(bytes: number, maxBytes: number): number {
  if (maxBytes <= 0) return 0;
  return Math.min(70, Math.round((bytes / maxBytes) * 70));
}

function scoreAge(days: number): number {
  return Math.min(30, Math.round(days / 12));
}

function duplicateEvidenceType(hashType: string): "exact" | "near" {
  return hashType === "exact" ? "exact" : "near";
}

export interface BuiltRecommendationContext {
  context: RecommendationContext;
  sourceForecastId: number | null;
}

export async function buildRecommendationContext(
  scanRunId: number
): Promise<BuiltRecommendationContext> {
  const scanRun = db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.id, scanRunId))
    .get();

  if (!scanRun || scanRun.status !== "complete" || !scanRun.completedAt) {
    throw new Error("No stable completed scan is available for recommendations");
  }

  const duplicateData = await getDuplicateGroups(scanRunId);
  const unusedData = await getUnusedFiles(180, undefined, scanRunId);
  const largeFileData = await getLargeFiles({
    scanRunId,
    limit: EVIDENCE_LIMIT,
    minSizeBytes: 50 * 1024 * 1024,
    sortBy: "size",
    sortOrder: "desc",
  });
  const forecastData = getForecastData();

  const maxDuplicateBytes = Math.max(
    1,
    ...duplicateData.groups.map((group) => group.reclaimableBytes)
  );
  const duplicates: RecommendationDuplicateSummary[] = duplicateData.groups
    .slice(0, EVIDENCE_LIMIT)
    .map((group) => ({
      groupId: group.groupId,
      type: duplicateEvidenceType(group.hashType),
      fileCount: group.memberCount,
      totalBytes: group.totalSizeBytes,
      reclaimableBytes: group.reclaimableBytes,
      opportunityScore:
        scoreBytes(group.reclaimableBytes, maxDuplicateBytes) +
        (group.hashType === "exact" ? 30 : 20),
      members: group.members.slice(0, 6).map((member) => ({
        fileId: member.fileId,
        name: basename(member.path),
        path: member.path,
        sizeBytes: member.sizeBytes,
        modifiedAt: member.modifiedAt ?? null,
      })),
    }))
    .map((item) => ({
      ...item,
      opportunityScore: Math.min(100, item.opportunityScore),
    }));

  const unusedFiles = unusedData.groups.flatMap((group) => group.files);
  const maxUnusedBytes = Math.max(
    1,
    ...unusedFiles.map((file) => file.sizeBytes)
  );
  const unused: RecommendationUnusedSummary[] = unusedFiles
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, EVIDENCE_LIMIT)
    .map((file) => {
      const lastActivity = file.lastActivity;
      const days = ageDays(lastActivity);
      return {
        fileId: file.fileId,
        name: basename(file.path),
        path: file.path,
        sizeBytes: file.sizeBytes,
        category: file.category,
        lastAccessedAt: file.usedFallback ? null : lastActivity,
        lastModifiedAt: file.usedFallback ? lastActivity : null,
        ageDays: days,
        opportunityScore: Math.min(
          100,
          scoreBytes(file.sizeBytes, maxUnusedBytes) + scoreAge(days)
        ),
      };
    });

  const maxLargeBytes = Math.max(
    1,
    ...largeFileData.files.map((file) => file.sizeBytes)
  );
  const largeFiles: RecommendationLargeFileSummary[] = largeFileData.files
    .slice(0, EVIDENCE_LIMIT)
    .map((file) => ({
      fileId: file.fileId,
      name: basename(file.path),
      path: file.path,
      sizeBytes: file.sizeBytes,
      category: file.category,
      lastAccessedAt: file.accessedAt ?? null,
      lastModifiedAt: file.modifiedAt ?? null,
      opportunityScore: Math.min(
        100,
        scoreBytes(file.sizeBytes, maxLargeBytes) +
          scoreAge(ageDays(file.accessedAt ?? file.modifiedAt))
      ),
    }));

  const latestTotalForecast = db
    .select()
    .from(forecasts)
    .where(eq(forecasts.category, "__total__"))
    .orderBy(desc(forecasts.generatedAt))
    .get();

  const forecast: RecommendationForecastSummary | null =
    forecastData.totalForecast || forecastData.fastestGrowing
      ? {
          forecastId: latestTotalForecast?.id ?? null,
          projectedFullDate:
            forecastData.totalForecast?.projectedFullDate ?? null,
          daysToFull: forecastData.totalForecast?.horizonDays ?? null,
          modelType: forecastData.totalForecast ? "theil_sen" : "none",
          confidence: forecastData.totalForecast?.confidenceScore ?? null,
          fastestGrowingCategories: forecastData.categoryForecasts
            .slice(0, 3)
            .map((category) => ({
              category: category.category,
              growthBytesPerDay: category.slopeBytesPerDay,
            })),
        }
      : null;

  const reclaimableByFileId = new Map<number, number>();
  for (const group of duplicateData.groups) {
    const removable = group.members.filter((member) => !member.isRecommendedKeep);
    for (const member of removable) {
      reclaimableByFileId.set(member.fileId, member.sizeBytes);
    }
  }
  for (const file of unusedFiles) {
    reclaimableByFileId.set(file.fileId, file.sizeBytes);
  }

  const reclaimableBytes = [...reclaimableByFileId.values()].reduce(
    (sum, sizeBytes) => sum + sizeBytes,
    0
  );

  return {
    context: {
      generatedAt: new Date().toISOString(),
      scan: {
        scanId: scanRun.id,
        completedAt: scanRun.completedAt,
        filesIndexed: scanRun.totalFiles ?? 0,
        totalBytes: scanRun.totalBytes ?? 0,
        reclaimableBytes,
        duplicateGroupCount: duplicateData.totalGroups,
        unusedCandidateCount: unusedData.totalFiles,
        largeFileCount: largeFileData.totalFiles,
      },
      duplicates,
      unused,
      largeFiles,
      forecast,
    },
    sourceForecastId: latestTotalForecast?.id ?? null,
  };
}
