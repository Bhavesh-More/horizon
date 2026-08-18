/**
 * recommendation-repository.ts
 * Owns: SQLite persistence for AI recommendation batches and cards.
 * Upholds:
 * - Invariant I-6: stores only metadata based recommendations, never raw file contents.
 * - Invariant I-14 style audit discipline: generation history is retained, never hard deleted.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import {
  recommendationBatches,
  recommendations,
  scanRuns,
} from "../db/schema";
import {
  RecommendationBatch,
  RecommendationOutputItem,
  RecommendationProviderError,
  RecommendationRecord,
  RecommendationStatus,
} from "@horizon/shared-types";

type BatchStatus = "running" | "complete" | "no_results" | "failed" | "stale";

function parseRelatedFileIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

function toBatch(row: typeof recommendationBatches.$inferSelect): RecommendationBatch {
  return {
    id: row.id,
    scanRunId: row.scanRunId,
    generationId: row.generationId,
    sourceForecastId: row.sourceForecastId,
    status: row.status,
    errorCategory: row.errorCategory as RecommendationProviderError | null,
    errorMessage: row.errorMessage,
    provider: row.provider,
    modelName: row.modelName,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function toRecord(row: typeof recommendations.$inferSelect): RecommendationRecord {
  return {
    id: row.id,
    scanRunId: row.scanRunId,
    batchId: row.batchId,
    generationId: row.generationId,
    recommendationType: row.recommendationType,
    title: row.title,
    reason: row.reason,
    priority: row.priority,
    relatedFileIds: parseRelatedFileIds(row.relatedFileIdsJson),
    targetTab: row.targetTab,
    action: row.action,
    status: row.status,
    provider: row.provider,
    modelName: row.modelName,
    createdAt: row.createdAt,
  };
}

export function getLatestCompletedScanRunId(): number | null {
  const row = db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.status, "complete"))
    .orderBy(desc(scanRuns.completedAt))
    .get();

  return row?.id ?? null;
}

export function hasRunningBatch(scanRunId: number): boolean {
  const row = db
    .select({ id: recommendationBatches.id })
    .from(recommendationBatches)
    .where(
      and(
        eq(recommendationBatches.scanRunId, scanRunId),
        eq(recommendationBatches.status, "running")
      )
    )
    .get();

  return !!row;
}

export function markRunningBatchesStaleExcept(scanRunId: number): void {
  db.update(recommendationBatches)
    .set({ status: "stale", completedAt: new Date().toISOString() })
    .where(
      and(
        eq(recommendationBatches.status, "running"),
        eq(recommendationBatches.scanRunId, scanRunId)
      )
    )
    .run();
}

export function createRecommendationBatch(params: {
  scanRunId: number;
  generationId: string;
  sourceForecastId?: number | null;
  provider?: string | null;
  modelName?: string | null;
}): RecommendationBatch {
  const now = new Date().toISOString();
  const row = db
    .insert(recommendationBatches)
    .values({
      scanRunId: params.scanRunId,
      generationId: params.generationId,
      sourceForecastId: params.sourceForecastId ?? null,
      status: "running",
      provider: params.provider ?? null,
      modelName: params.modelName ?? null,
      startedAt: now,
    })
    .returning()
    .get();

  return toBatch(row);
}

export function completeRecommendationBatch(params: {
  batchId: number;
  status: Extract<BatchStatus, "complete" | "no_results">;
}): void {
  db.update(recommendationBatches)
    .set({
      status: params.status,
      completedAt: new Date().toISOString(),
      errorCategory: null,
      errorMessage: null,
    })
    .where(eq(recommendationBatches.id, params.batchId))
    .run();
}

export function failRecommendationBatch(params: {
  batchId: number;
  errorCategory: RecommendationProviderError;
  errorMessage: string;
}): void {
  db.update(recommendationBatches)
    .set({
      status: "failed",
      errorCategory: params.errorCategory,
      errorMessage: params.errorMessage,
      completedAt: new Date().toISOString(),
    })
    .where(eq(recommendationBatches.id, params.batchId))
    .run();
}

export function insertRecommendations(params: {
  scanRunId: number;
  batchId: number;
  generationId: string;
  provider?: string | null;
  modelName?: string | null;
  items: RecommendationOutputItem[];
}): RecommendationRecord[] {
  if (params.items.length === 0) return [];

  const now = new Date().toISOString();
  const rows = params.items.map((item) => ({
    scanRunId: params.scanRunId,
    batchId: params.batchId,
    generationId: params.generationId,
    recommendationType: item.recommendation_type,
    title: item.title,
    reason: item.reason,
    priority: item.priority,
    relatedFileIdsJson: JSON.stringify(item.related_file_ids),
    targetTab: item.target_tab,
    action: item.action,
    status: "pending" as const,
    provider: params.provider ?? null,
    modelName: params.modelName ?? null,
    createdAt: now,
  }));

  return db.transaction((tx) =>
    tx.insert(recommendations).values(rows).returning().all().map(toRecord)
  );
}

export function getLatestBatchForScan(
  scanRunId: number,
  statuses: Array<BatchStatus> = ["complete", "no_results", "failed"]
): RecommendationBatch | null {
  const row = db
    .select()
    .from(recommendationBatches)
    .where(
      and(
        eq(recommendationBatches.scanRunId, scanRunId),
        inArray(recommendationBatches.status, statuses)
      )
    )
    .orderBy(desc(recommendationBatches.startedAt))
    .get();

  return row ? toBatch(row) : null;
}

export function getActiveRecommendations(
  scanRunId: number
): RecommendationRecord[] {
  const batch = getLatestBatchForScan(scanRunId, ["complete"]);
  if (!batch) return [];

  const rows = db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.batchId, batch.id),
        eq(recommendations.status, "pending")
      )
    )
    .orderBy(desc(recommendations.priority), desc(recommendations.createdAt))
    .all();

  return rows.map(toRecord);
}

export function getRecommendationById(
  recommendationId: number
): RecommendationRecord | null {
  const row = db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .get();

  return row ? toRecord(row) : null;
}

export function updateRecommendationStatus(
  recommendationId: number,
  status: RecommendationStatus
): RecommendationRecord | null {
  const row = db
    .update(recommendations)
    .set({ status })
    .where(eq(recommendations.id, recommendationId))
    .returning()
    .get();

  return row ? toRecord(row) : null;
}

export function getLastFailedBatch(
  scanRunId: number
): RecommendationBatch | null {
  const row = db
    .select()
    .from(recommendationBatches)
    .where(
      and(
        eq(recommendationBatches.scanRunId, scanRunId),
        eq(recommendationBatches.status, "failed"),
        isNotNull(recommendationBatches.errorCategory)
      )
    )
    .orderBy(desc(recommendationBatches.startedAt))
    .get();

  return row ? toBatch(row) : null;
}
