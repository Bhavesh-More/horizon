/**
 * @file forecasting.ts
 * @description Theil-Sen robust median regression and storage forecasting service.
 * Invariant: Responsible for explainable time-series trend fitting, confidence range estimation,
 * and in-memory what-if simulations.
 */

import { eq, sql, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  usageSnapshots,
  usageSnapshotCategories,
  forecasts,
  fileIndex,
} from "../db/schema";
import {
  ForecastGetResponse,
  CategoryForecast,
  TotalForecast,
  UsageSnapshotPoint,
  ForecastWhatIfResponse,
  DataSource,
  ForecastStatus,
  UsagePattern,
} from "@horizon/shared-types";
import { getDiskVolumeStats, formatLocalDate } from "./scheduler";

export interface DataPoint {
  x: number; // day offset
  y: number; // bytes
}

export interface TheilSenResult {
  slope: number; // bytes per day (median)
  slopeLow: number; // 10th percentile
  slopeHigh: number; // 90th percentile
  intercept: number;
  sampleCount: number;
}

/**
 * Computes Theil-Sen robust linear regression:
 * Median of all pairwise slopes: (y_j - y_i) / (x_j - x_i) for i < j.
 * 10th and 90th percentiles of the slope distribution provide non-parametric confidence bounds.
 */
export function computeTheilSenRegression(points: DataPoint[]): TheilSenResult {
  if (points.length < 2) {
    return {
      slope: 0,
      slopeLow: 0,
      slopeHigh: 0,
      intercept: points[0]?.y || 0,
      sampleCount: points.length,
    };
  }

  const slopes: number[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx !== 0) {
        const slope = (points[j].y - points[i].y) / dx;
        slopes.push(slope);
      }
    }
  }

  if (slopes.length === 0) {
    return {
      slope: 0,
      slopeLow: 0,
      slopeHigh: 0,
      intercept: points[0].y,
      sampleCount: points.length,
    };
  }

  slopes.sort((a, b) => a - b);

  const getPercentile = (p: number): number => {
    const idx = (slopes.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    return slopes[lower] * (1 - weight) + slopes[upper] * weight;
  };

  const slope = getPercentile(0.5); // median
  const slopeLow = getPercentile(0.1); // 10th percentile
  const slopeHigh = getPercentile(0.9); // 90th percentile

  // Compute intercepts for each point: y_i - slope * x_i, then take median intercept
  const intercepts = points.map((p) => p.y - slope * p.x).sort((a, b) => a - b);
  const midIdx = Math.floor(intercepts.length / 2);
  const intercept =
    intercepts.length % 2 === 0
      ? (intercepts[midIdx - 1] + intercepts[midIdx]) / 2
      : intercepts[midIdx];

  return {
    slope,
    slopeLow,
    slopeHigh,
    intercept,
    sampleCount: points.length,
  };
}

/**
 * Calculates a future date by adding days to a base date.
 */
export function addDaysToDate(baseDate: Date, days: number): string {
  const target = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return formatLocalDate(target);
}

/**
 * Fits Theil-Sen models across all categories and the whole disk (__total__),
 * and persists the results to the forecasts table.
 */
export function generateForecasts(): void {
  const snapshots = db
    .select()
    .from(usageSnapshots)
    .orderBy(asc(usageSnapshots.snapshotDate))
    .all();

  if (snapshots.length === 0) return;

  const firstDateMs = new Date(snapshots[0].snapshotDate).getTime();
  const latestSnapshot = snapshots[snapshots.length - 1];
  const totalVolumeBytes = latestSnapshot.volumeTotalBytes;
  const currentUsedBytes = latestSnapshot.volumeUsedBytes;

  const realCount = snapshots.filter((s) => s.isSynthetic === 0).length;
  const dataSource: DataSource =
    realCount >= 3 ? "tracked" : realCount >= 1 ? "blended" : "bootstrap";

  // Minimum real tracked days required before showing any projection.
  // Below this threshold the slope estimate is too noisy to be useful.
  const MIN_REAL_DAYS_FOR_PROJECTION = 5;
  const hasEnoughRealData = realCount >= MIN_REAL_DAYS_FOR_PROJECTION;

  // Always use LIVE OS free space for horizon calculation, not stale snapshot data.
  const liveDisk = getDiskVolumeStats();
  const liveFreeBytesNow = liveDisk.freeBytes;

  // 1. Total disk fit
  const totalPoints: DataPoint[] = snapshots.map((s) => {
    const dayOffset = Math.round(
      (new Date(s.snapshotDate).getTime() - firstDateMs) / (24 * 60 * 60 * 1000)
    );
    return { x: dayOffset, y: s.volumeUsedBytes };
  });

  const totalFit = computeTheilSenRegression(totalPoints);

  let horizonDays: number | null = null;
  let projectedFullDate: string | null = null;
  let projectedFullDateLow: string | null = null;
  let projectedFullDateHigh: string | null = null;

  // Only produce a projection once enough real data is available.
  // Before that, the slope is noise from synthetic bootstrap history.
  if (hasEnoughRealData) {
    const MIN_SLOPE_BYTES_PER_DAY = 1024 * 1024; // 1 MB/day noise floor
    const effectiveSlope = Math.max(totalFit.slope, 0);

    if (effectiveSlope >= MIN_SLOPE_BYTES_PER_DAY) {
      horizonDays = Math.max(1, Math.round(liveFreeBytesNow / effectiveSlope));
      const now = new Date();
      projectedFullDate = addDaysToDate(now, horizonDays);

      if (totalFit.slopeHigh >= MIN_SLOPE_BYTES_PER_DAY) {
        const minDays = Math.max(1, Math.round(liveFreeBytesNow / totalFit.slopeHigh));
        projectedFullDateLow = addDaysToDate(now, minDays);
      }
      if (totalFit.slopeLow >= MIN_SLOPE_BYTES_PER_DAY) {
        const maxDays = Math.max(1, Math.round(liveFreeBytesNow / totalFit.slopeLow));
        projectedFullDateHigh = addDaysToDate(now, maxDays);
      }
    } else if (liveFreeBytesNow < 5 * 1024 * 1024 * 1024) {
      // Slope is noise but free space is critically low — surface with fallback
      const fallbackSlope = 100 * 1024 * 1024;
      horizonDays = Math.max(1, Math.round(liveFreeBytesNow / fallbackSlope));
      const now = new Date();
      projectedFullDate = addDaysToDate(now, horizonDays);
    }
  }

  // Clear existing forecasts
  db.delete(forecasts).run();

  const nowIso = new Date().toISOString();
  const confidenceScore = dataSource === "tracked" ? 0.85 : dataSource === "blended" ? 0.6 : 0.4;

  // Insert __total__ forecast
  db.insert(forecasts)
    .values({
      generatedAt: nowIso,
      category: "__total__",
      modelType: "theil_sen",
      dataSource,
      sampleCount: totalFit.sampleCount,
      slopeBytesPerDay: totalFit.slope,
      slopeLowBytesPerDay: totalFit.slopeLow,
      slopeHighBytesPerDay: totalFit.slopeHigh,
      projectedFullDate,
      projectedFullDateLow,
      projectedFullDateHigh,
      horizonDays,
      confidenceScore,
    })
    .run();

  // 2. Per-category fits
  const catRows = db
    .select({
      snapshotId: usageSnapshotCategories.snapshotId,
      category: usageSnapshotCategories.category,
      sizeBytes: usageSnapshotCategories.sizeBytes,
      segmentId: usageSnapshotCategories.segmentId,
      snapshotDate: usageSnapshots.snapshotDate,
    })
    .from(usageSnapshotCategories)
    .innerJoin(usageSnapshots, eq(usageSnapshotCategories.snapshotId, usageSnapshots.id))
    .orderBy(asc(usageSnapshots.snapshotDate))
    .all();

  // Group by category
  const catMap: Record<string, { x: number; y: number; seg: number }[]> = {};
  for (const row of catRows) {
    if (!catMap[row.category]) catMap[row.category] = [];
    const dayOffset = Math.round(
      (new Date(row.snapshotDate).getTime() - firstDateMs) / (24 * 60 * 60 * 1000)
    );
    catMap[row.category].push({
      x: dayOffset,
      y: row.sizeBytes,
      seg: row.segmentId,
    });
  }

  for (const [category, points] of Object.entries(catMap)) {
    if (points.length < 2) continue;

    // Use only points from the latest segment
    const maxSeg = Math.max(...points.map((p) => p.seg));
    const activePoints = points.filter((p) => p.seg === maxSeg);
    const catFit = computeTheilSenRegression(
      activePoints.length >= 2 ? activePoints : points
    );

    db.insert(forecasts)
      .values({
        generatedAt: nowIso,
        category,
        modelType: "theil_sen",
        dataSource,
        sampleCount: catFit.sampleCount,
        slopeBytesPerDay: catFit.slope,
        slopeLowBytesPerDay: catFit.slopeLow,
        slopeHighBytesPerDay: catFit.slopeHigh,
        projectedFullDate: null,
        projectedFullDateLow: null,
        projectedFullDateHigh: null,
        horizonDays: null,
        confidenceScore,
      })
      .run();
  }
}

/**
 * Calculates total safe cleanable bytes from current database state.
 */
function getSafeCleanableBytes(): number {
  // Approximate safe items (e.g. caches, archives, exact duplicate duplicates)
  const exactDupes = db
    .select({
      totalBytes: sql<number>`SUM(${fileIndex.sizeBytes})`,
    })
    .from(fileIndex)
    .where(
      sql`${fileIndex.removedAt} IS NULL AND ${fileIndex.category} IN ('archive', 'dev_artifact')`
    )
    .get();

  return Number(exactDupes?.totalBytes || 0);
}

/**
 * Retrieves the complete forecast response payload for UI presentation.
 */
export function getForecastData(): ForecastGetResponse {
  const disk = getDiskVolumeStats();
  const snapshots = db
    .select()
    .from(usageSnapshots)
    .orderBy(asc(usageSnapshots.snapshotDate))
    .all();

  if (snapshots.length === 0) {
    return {
      status: "calculating",
      totalForecast: null,
      categoryForecasts: [],
      fastestGrowing: null,
      history: [],
      currentVolumeTotalBytes: disk.totalBytes,
      currentVolumeUsedBytes: disk.usedBytes,
      currentVolumeFreeBytes: disk.freeBytes,
      safeCleanableBytes: 0,
      safeCleanableDaysGained: 0,
      minObservedFreeBytes: disk.freeBytes,
      maxObservedFreeBytes: disk.freeBytes,
      usageVolatilityBytes: 0,
      usagePattern: "stable" as const,
      realTrackedDays: 0,
      minDaysForProjection: 5,
    };
  }

  // Fetch forecast rows
  const forecastRows = db.select().from(forecasts).all();

  if (forecastRows.length === 0) {
    generateForecasts();
  }

  const refreshedRows = db.select().from(forecasts).all();
  const totalRow = refreshedRows.find((r) => r.category === "__total__");
  const categoryRows = refreshedRows.filter((r) => r.category !== "__total__");

  const totalForecast: TotalForecast | null = totalRow
    ? {
        category: "__total__",
        slopeBytesPerDay: totalRow.slopeBytesPerDay,
        slopeLowBytesPerDay: totalRow.slopeLowBytesPerDay,
        slopeHighBytesPerDay: totalRow.slopeHighBytesPerDay,
        monthlyGrowthBytes: Math.round(totalRow.slopeBytesPerDay * 30),
        dataSource: totalRow.dataSource as DataSource,
        sampleCount: totalRow.sampleCount,
        confidenceScore: totalRow.confidenceScore,
        horizonDays: totalRow.horizonDays,
        projectedFullDate: totalRow.projectedFullDate,
        projectedFullDateLow: totalRow.projectedFullDateLow,
        projectedFullDateHigh: totalRow.projectedFullDateHigh,
        isSynthetic: totalRow.dataSource === "bootstrap",
      }
    : null;

  const categoryForecasts: CategoryForecast[] = categoryRows
    .map((r) => ({
      category: r.category,
      slopeBytesPerDay: r.slopeBytesPerDay,
      slopeLowBytesPerDay: r.slopeLowBytesPerDay,
      slopeHighBytesPerDay: r.slopeHighBytesPerDay,
      monthlyGrowthBytes: Math.round(r.slopeBytesPerDay * 30),
      dataSource: r.dataSource as DataSource,
      sampleCount: r.sampleCount,
      confidenceScore: r.confidenceScore,
      isSynthetic: r.dataSource === "bootstrap",
    }))
    .sort((a, b) => b.slopeBytesPerDay - a.slopeBytesPerDay);

  const fastestGrowing = categoryForecasts.length > 0 ? categoryForecasts[0] : null;

  // Build snapshot history points
  const history: UsageSnapshotPoint[] = snapshots.map((s) => {
    const catEntries = db
      .select({
        category: usageSnapshotCategories.category,
        sizeBytes: usageSnapshotCategories.sizeBytes,
      })
      .from(usageSnapshotCategories)
      .where(eq(usageSnapshotCategories.snapshotId, s.id))
      .all();

    const catObj: Record<string, number> = {};
    for (const c of catEntries) {
      catObj[c.category] = c.sizeBytes;
    }

    return {
      snapshotDate: s.snapshotDate,
      capturedAt: s.capturedAt,
      volumeTotalBytes: s.volumeTotalBytes,
      volumeUsedBytes: s.volumeUsedBytes,
      volumeFreeBytes: s.volumeFreeBytes,
      isSynthetic: s.isSynthetic === 1,
      categories: catObj,
    };
  });

  const safeCleanableBytes = getSafeCleanableBytes();
  let safeCleanableDaysGained = 0;
  if (totalForecast && totalForecast.slopeBytesPerDay > 0 && safeCleanableBytes > 0) {
    safeCleanableDaysGained = Math.max(
      1,
      Math.round(safeCleanableBytes / totalForecast.slopeBytesPerDay)
    );
  }

  // Compute churn / volatility metrics from real (non-synthetic) snapshots only
  const realSnapshots = snapshots.filter((s) => s.isSynthetic === 0);
  const realFreeValues = realSnapshots.map((s) => s.volumeFreeBytes);

  let minObservedFreeBytes = disk.freeBytes;
  let maxObservedFreeBytes = disk.freeBytes;
  let usageVolatilityBytes = 0;

  if (realFreeValues.length >= 2) {
    minObservedFreeBytes = Math.min(...realFreeValues);
    maxObservedFreeBytes = Math.max(...realFreeValues);
    const mean = realFreeValues.reduce((a, b) => a + b, 0) / realFreeValues.length;
    const variance = realFreeValues.reduce((a, b) => a + (b - mean) ** 2, 0) / realFreeValues.length;
    usageVolatilityBytes = Math.round(Math.sqrt(variance));
  }

  // Classify usage pattern:
  // high_churn: large swings (std-dev > 2 GB) with near-zero net slope
  // growing: measurable positive slope
  // shrinking: measurable negative slope
  // stable: low volatility, flat slope
  const slope = totalForecast?.slopeBytesPerDay ?? 0;
  const HIGH_VOLATILITY_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB std-dev
  const MEANINGFUL_SLOPE = 5 * 1024 * 1024; // 5 MB/day

  let usagePattern: UsagePattern;
  if (usageVolatilityBytes > HIGH_VOLATILITY_THRESHOLD && Math.abs(slope) < MEANINGFUL_SLOPE) {
    usagePattern = "high_churn";
  } else if (slope > MEANINGFUL_SLOPE) {
    usagePattern = "growing";
  } else if (slope < -MEANINGFUL_SLOPE) {
    usagePattern = "shrinking";
  } else {
    usagePattern = "stable";
  }

  const MIN_REAL_DAYS_FOR_PROJECTION = 5;
  const isBuildingBaseline = realSnapshots.length < MIN_REAL_DAYS_FOR_PROJECTION;

  let status: ForecastStatus = "ready";
  if (snapshots.length < 2) {
    status = "insufficient_data";
  } else if (isBuildingBaseline) {
    status = "building_baseline";
  }

  return {
    status,
    totalForecast,
    categoryForecasts,
    fastestGrowing,
    history,
    currentVolumeTotalBytes: disk.totalBytes,
    currentVolumeUsedBytes: disk.usedBytes,
    currentVolumeFreeBytes: disk.freeBytes,
    safeCleanableBytes,
    safeCleanableDaysGained,
    minObservedFreeBytes,
    maxObservedFreeBytes,
    usageVolatilityBytes,
    usagePattern,
    realTrackedDays: realSnapshots.length,
    minDaysForProjection: MIN_REAL_DAYS_FOR_PROJECTION,
  };
}

/**
 * Simulates a hypothetical what-if cleanup:
 * Re-anchors total disk usage at used_now - totalBytesRemoved using existing Theil-Sen slope.
 * Pure in-memory computation; does not mutate SQLite records.
 */
export function simulateWhatIf(
  adjustments: Array<{ category: string; bytesToRemove: number }>
): ForecastWhatIfResponse {
  const disk = getDiskVolumeStats();
  const totalRow = db
    .select()
    .from(forecasts)
    .where(eq(forecasts.category, "__total__"))
    .get();

  const totalBytesRemoved = adjustments.reduce(
    (acc, adj) => acc + Math.max(0, adj.bytesToRemove),
    0
  );

  const baselineUsed = disk.usedBytes;
  const baselineRemaining = Math.max(0, disk.totalBytes - baselineUsed);
  const slopePerDay = totalRow ? Math.max(1024 * 1024, totalRow.slopeBytesPerDay) : 50 * 1024 * 1024; // Default 50MB/day fallback

  const baselineHorizonDays =
    slopePerDay > 0 ? Math.max(1, Math.round(baselineRemaining / slopePerDay)) : null;

  const now = new Date();
  const baselineFullDate =
    baselineHorizonDays !== null ? addDaysToDate(now, baselineHorizonDays) : null;

  const projectedUsed = Math.max(0, baselineUsed - totalBytesRemoved);
  const projectedRemaining = Math.max(0, disk.totalBytes - projectedUsed);

  const projectedHorizonDays =
    slopePerDay > 0 ? Math.max(1, Math.round(projectedRemaining / slopePerDay)) : null;

  const projectedFullDate =
    projectedHorizonDays !== null ? addDaysToDate(now, projectedHorizonDays) : null;

  const daysGained =
    projectedHorizonDays !== null && baselineHorizonDays !== null
      ? Math.max(0, projectedHorizonDays - baselineHorizonDays)
      : Math.round(totalBytesRemoved / Math.max(1, slopePerDay));

  return {
    baselineHorizonDays,
    projectedHorizonDays,
    daysGained,
    baselineFullDate,
    projectedFullDate,
    totalBytesRemoved,
  };
}
