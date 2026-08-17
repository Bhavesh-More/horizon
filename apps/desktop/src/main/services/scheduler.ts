/**
 * @file scheduler.ts
 * @description Storage snapshot scheduler and bootstrap history service.
 * Invariant: Responsible for daily disk usage snapshots, anchor-and-apportion bootstrap history,
 * and category segment tracking upon cleanups.
 */

import fs from "node:fs";
import { app } from "electron";
import cron from "node-cron";
import { eq, sql, desc, max } from "drizzle-orm";
import { db } from "../db/client";
import {
  usageSnapshots,
  usageSnapshotCategories,
  fileIndex,
} from "../db/schema";

export interface DiskStats {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

/**
 * Reads real volume disk usage from the OS filesystem.
 */
export function getDiskVolumeStats(): DiskStats {
  try {
    const rootPath = process.platform === "win32" ? "C:\\" : "/";
    const stat = fs.statfsSync(rootPath);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bfree) * Number(stat.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    if (totalBytes > 0) {
      return { totalBytes, usedBytes, freeBytes };
    }
  } catch (err) {
    console.warn("Failed to get disk stats via statfsSync:", err);
  }

  // Fallback if statfs fails
  return {
    totalBytes: 500 * 1024 * 1024 * 1024, // 500 GB default
    usedBytes: 350 * 1024 * 1024 * 1024,
    freeBytes: 150 * 1024 * 1024 * 1024,
  };
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Retrieves current storage total per category from file_index.
 */
export function getCategoryTotals(): Record<string, number> {
  const rows = db
    .select({
      category: fileIndex.category,
      totalBytes: sql<number>`SUM(${fileIndex.sizeBytes})`,
    })
    .from(fileIndex)
    .where(sql`${fileIndex.removedAt} IS NULL`)
    .groupBy(fileIndex.category)
    .all();

  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.category) {
      map[r.category] = Number(r.totalBytes || 0);
    }
  }
  return map;
}

/**
 * Gets the current active segment ID for a category.
 */
export function getLatestSegmentId(category: string): number {
  try {
    const query = db
      .select({ maxSeg: max(usageSnapshotCategories.segmentId) })
      .from(usageSnapshotCategories)
      .where(eq(usageSnapshotCategories.category, category));

    const res = typeof (query as any).get === "function" ? (query as any).get() : (query as any).all?.()[0];
    return res?.maxSeg ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Captures a disk snapshot for today.
 */
export function captureDailySnapshot(options: {
  isSynthetic?: boolean;
  targetDate?: string;
  diskStats?: DiskStats;
  categoryTotals?: Record<string, number>;
} = {}): { snapshotId: number; snapshotDate: string } | null {
  const today = options.targetDate || formatLocalDate(new Date());
  const nowIso = new Date().toISOString();
  const disk = options.diskStats || getDiskVolumeStats();
  const catTotals = options.categoryTotals || getCategoryTotals();

  // Check if a snapshot already exists for this date
  const existing = db
    .select({ id: usageSnapshots.id })
    .from(usageSnapshots)
    .where(eq(usageSnapshots.snapshotDate, today))
    .get();

  if (existing) {
    // If not synthetic, update it with fresh real metrics
    if (!options.isSynthetic) {
      db.update(usageSnapshots)
        .set({
          capturedAt: nowIso,
          volumeTotalBytes: disk.totalBytes,
          volumeUsedBytes: disk.usedBytes,
          volumeFreeBytes: disk.freeBytes,
          isSynthetic: 0,
        })
        .where(eq(usageSnapshots.id, existing.id))
        .run();

      // Update category rows
      for (const [category, sizeBytes] of Object.entries(catTotals)) {
        const segId = getLatestSegmentId(category);
        const existingCat = db
          .select({ id: usageSnapshotCategories.id })
          .from(usageSnapshotCategories)
          .where(
            sql`${usageSnapshotCategories.snapshotId} = ${existing.id} AND ${usageSnapshotCategories.category} = ${category}`
          )
          .get();

        if (existingCat) {
          db.update(usageSnapshotCategories)
            .set({ sizeBytes })
            .where(eq(usageSnapshotCategories.id, existingCat.id))
            .run();
        } else {
          db.insert(usageSnapshotCategories)
            .values({
              snapshotId: existing.id,
              category,
              sizeBytes,
              segmentId: segId,
            })
            .run();
        }
      }
    }
    return { snapshotId: existing.id, snapshotDate: today };
  }

  // Insert new snapshot
  const inserted = db
    .insert(usageSnapshots)
    .values({
      snapshotDate: today,
      capturedAt: nowIso,
      volumeTotalBytes: disk.totalBytes,
      volumeUsedBytes: disk.usedBytes,
      volumeFreeBytes: disk.freeBytes,
      isSynthetic: options.isSynthetic ? 1 : 0,
    })
    .returning({ id: usageSnapshots.id })
    .get();

  if (!inserted) return null;

  for (const [category, sizeBytes] of Object.entries(catTotals)) {
    const segId = getLatestSegmentId(category);
    db.insert(usageSnapshotCategories)
      .values({
        snapshotId: inserted.id,
        category,
        sizeBytes,
        segmentId: segId,
      })
      .run();
  }

  return { snapshotId: inserted.id, snapshotDate: today };
}

/**
 * Bootstrap history pass using Anchor-and-Apportion algorithm:
 * Works backwards from today's real disk usage stats, subtracting cumulative file sizes
 * created after each historical bucket date (using file_index.createdAt or modifiedAt).
 */
export function bootstrapHistory(): { bootstrappedCount: number } {
  // Check if we already have non-synthetic snapshots
  const realCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(usageSnapshots)
    .where(eq(usageSnapshots.isSynthetic, 0))
    .get();

  if (realCount && Number(realCount.count) >= 3) {
    return { bootstrappedCount: 0 };
  }

  const currentDisk = getDiskVolumeStats();
  const currentCategoryTotals = getCategoryTotals();

  // Find range of file created/modified timestamps
  const files = db
    .select({
      sizeBytes: fileIndex.sizeBytes,
      category: fileIndex.category,
      createdAt: fileIndex.createdAt,
      modifiedAt: fileIndex.modifiedAt,
    })
    .from(fileIndex)
    .where(sql`${fileIndex.removedAt} IS NULL`)
    .all();

  if (files.length === 0) {
    // Just create a single today snapshot if no files indexed
    captureDailySnapshot({ isSynthetic: true });
    return { bootstrappedCount: 1 };
  }

  const now = new Date();
  const timestamps: number[] = [];

  for (const f of files) {
    const tsStr = f.createdAt || f.modifiedAt;
    if (tsStr) {
      const ms = new Date(tsStr).getTime();
      if (!isNaN(ms) && ms <= now.getTime()) {
        timestamps.push(ms);
      }
    }
  }

  if (timestamps.length === 0) {
    captureDailySnapshot({ isSynthetic: true });
    return { bootstrappedCount: 1 };
  }

  timestamps.sort((a, b) => a - b);
  const earliestMs = Math.max(
    timestamps[0],
    now.getTime() - 90 * 24 * 60 * 60 * 1000 // Cap lookback at 90 days
  );

  const totalTimeSpanDays = Math.max(
    1,
    Math.round((now.getTime() - earliestMs) / (24 * 60 * 60 * 1000))
  );

  // Pick 6-8 equal-width interval points (or fewer if span < 7 days)
  const numBuckets = Math.min(7, Math.max(3, Math.floor(totalTimeSpanDays / 4)));
  const bucketDays = Array.from({ length: numBuckets }, (_, i) => {
    const dayOffset = Math.round((totalTimeSpanDays / numBuckets) * (numBuckets - i));
    return dayOffset;
  });

  let createdCount = 0;

  for (const daysAgo of bucketDays) {
    const bucketDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const bucketDateStr = formatLocalDate(bucketDate);
    const bucketMs = bucketDate.getTime();

    // Sum files created after this bucket date
    let filesCreatedAfterBytes = 0;
    const catCreatedAfterBytes: Record<string, number> = {};

    for (const f of files) {
      const tsStr = f.createdAt || f.modifiedAt;
      if (tsStr) {
        const ms = new Date(tsStr).getTime();
        if (!isNaN(ms) && ms > bucketMs) {
          filesCreatedAfterBytes += f.sizeBytes;
          catCreatedAfterBytes[f.category] =
            (catCreatedAfterBytes[f.category] || 0) + f.sizeBytes;
        }
      }
    }

    // Apportion backward: used_then = used_now - files_created_after
    const estimatedUsed = Math.max(
      1024 * 1024 * 1024, // Min 1 GB floor
      currentDisk.usedBytes - filesCreatedAfterBytes
    );
    const estimatedFree = Math.max(0, currentDisk.totalBytes - estimatedUsed);

    const estimatedCatTotals: Record<string, number> = {};
    for (const [cat, currentCatSize] of Object.entries(currentCategoryTotals)) {
      const afterSize = catCreatedAfterBytes[cat] || 0;
      estimatedCatTotals[cat] = Math.max(0, currentCatSize - afterSize);
    }

    const res = captureDailySnapshot({
      isSynthetic: true,
      targetDate: bucketDateStr,
      diskStats: {
        totalBytes: currentDisk.totalBytes,
        usedBytes: estimatedUsed,
        freeBytes: estimatedFree,
      },
      categoryTotals: estimatedCatTotals,
    });

    if (res) createdCount++;
  }

  // Ensure today's snapshot is also captured
  captureDailySnapshot({ isSynthetic: true, targetDate: formatLocalDate(now) });

  return { bootstrappedCount: createdCount + 1 };
}

/**
 * Handles confirmed cleanup/archive action:
 * Increments segment ID for affected categories and captures an immediate out-of-cycle snapshot.
 */
export function notifyCleanupAction(affectedCategories: string[]): void {
  try {
    for (const cat of affectedCategories) {
      const currentSeg = getLatestSegmentId(cat);
      const newSeg = currentSeg + 1;

      // We store a marker category row with the new segment ID in the next snapshot
      if (typeof db.run === "function") {
        db.run(
          sql`UPDATE usage_snapshot_categories SET segment_id = ${newSeg} WHERE category = ${cat} AND snapshot_id = (SELECT MAX(id) FROM usage_snapshots)`
        );
      }
    }

    // Capture immediate real snapshot to re-anchor the trend line
    captureDailySnapshot({ isSynthetic: false });
  } catch (err) {
    console.warn("Failed to complete notifyCleanupAction:", err);
  }
}

let cronTask: cron.ScheduledTask | null = null;

/**
 * Initializes the background daily cron job and runs app-launch catch-up.
 */
export function initSnapshotScheduler(): void {
  // 1. App-launch catch-up check: Ensure today has a snapshot
  try {
    const today = formatLocalDate(new Date());
    const existing = db
      .select({ id: usageSnapshots.id })
      .from(usageSnapshots)
      .where(eq(usageSnapshots.snapshotDate, today))
      .get();

    if (!existing) {
      captureDailySnapshot({ isSynthetic: false });
    }
  } catch (err) {
    console.error("Failed to run app-launch snapshot catch-up:", err);
  }

  // 2. Schedule midnight local time cron job (0 0 * * *)
  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule("0 0 * * *", () => {
    try {
      captureDailySnapshot({ isSynthetic: false });
    } catch (err) {
      console.error("Cron snapshot capture error:", err);
    }
  });
}
