# 0006. Storage forecasting and what if simulator

**Date**: 2026-08-17
**Status**: Accepted

## Summary

Horizon provides explainable storage forecasting using robust Theil-Sen median regression across historical disk snapshots. A first-run bootstrap pass reconstructs synthetic history anchored to actual operating system storage metrics, allowing meaningful projections from day one. Users can explore hypothetical cleanups in an interactive what-if simulator that re-anchors projections without mutating stored data and deep-links directly to cleanup tabs with pre-selected files.

## Context

Laptops frequently run out of storage without warning because modern operating systems only alert users at critical capacity. Traditional cleaner utilities report static point-in-time statistics rather than trajectory, leaving users unable to anticipate when or why their drive will fill up.

Forecasting storage requires handling real-world data characteristics:
1. One-off download spikes or burst events can heavily distort ordinary least-squares regression.
2. Fresh application installs lack historical data points, risking an empty or unhelpful interface on initial launch.
3. Cleanups and file deletions introduce structural discontinuities in storage history that invalidate single continuous trends.

Horizon solves this with robust trend estimation, anchored synthetic history, category-level segmentation, and interactive what-if simulation.

## Requirements

**User stories**:
- As a storage-constrained user, I want to know when my disk will fill up and which categories are growing fastest so that I can take proactive action before my machine stalls.
- As a user reviewing cleanable files, I want to simulate how much extra runway a cleanup buys me so that I can decide what is worth deleting or archiving.
- As a user on first launch, I want to see an immediate estimated forecast based on file history rather than waiting weeks for snapshots to accumulate.

**Acceptance criteria**:
- **AC-1**: Daily usage snapshot scheduler captures total, used, and free disk bytes plus per-category breakdown and stores one row per calendar day.
- **AC-2**: First-run bootstrap pass creates synthetic historical snapshots by subtracting indexed file sizes backward from current operating system disk metrics, tagged as synthetic.
- **AC-3**: Theil-Sen median slope regression computes growth rates and confidence bounds (10th and 90th percentiles) per category and overall drive capacity.
- **AC-4**: Real cleanup and archive actions increment category segment identifiers and capture an out-of-cycle snapshot to re-seed trend estimation.
- **AC-5**: IPC channel `forecast:get` returns latest category forecasts, overall projection, historical snapshot series, and data source indicator (`bootstrap`, `blended`, or `tracked`).
- **AC-6**: IPC channel `forecast:whatIf` computes in-memory projected runway gains for arbitrary category byte reductions without persisting changes.
- **AC-7**: Forecast tab renders a Recharts composed chart displaying historical line, projected trend, and shaded confidence band, accompanied by per-category growth rates.
- **AC-8**: What-if simulator renders quick scenario buttons and cleanable item checklists, updating projected runway delta dynamically and deep-linking to cleanup tabs with pre-selected files via "Apply this plan".
- **AC-9**: Overview tab surfaces a forecast headline below the disk summary chip with projected days to full, fastest growing category, and runway impact of safe cleanable items.

## Options considered

### Option 1: Ordinary Least Squares (OLS) Linear Regression

Fits a standard linear regression line over historical points.

**Pros**:
- Trivial to compute and widely understood.

**Cons**:
- Highly sensitive to single-day burst downloads, producing wild swings in projected full dates.
- Lacks native confidence bounds without assuming normal residual distribution.

### Option 2: Theil-Sen Robust Median Regression (Chosen)

Calculates the median of slopes between all sample pairs over a rolling window.

**Pros**:
- Resistant to outliers (up to 29.3% breakdown point).
- Pairwise slope distribution yields natural 10th and 90th percentile confidence bounds without parametric assumptions.
- Explainable in plain terms: median daily growth rate projected forward.

**Cons**:
- Computes in $O(n^2)$ time over sample pairs (negligible for 30 to 90 daily snapshots).

### Option 3: Exponential Smoothing (Holt-Winters)

Models trend and level with exponential weighting.

**Pros**:
- Adapts to accelerating growth curves.

**Cons**:
- Requires extensive data history before parameters stabilize.
- Harder to explain transparently to end users.

## Decision

**Chosen option**: Option 2: Theil-Sen Robust Median Regression.

Horizon uses Theil-Sen median regression calculated per category and across total disk usage over a rolling 30 to 45 day window, with segment resets on verified file cleanups.

**Implementation skills**: `forecasting` (`apps/desktop/src/main/services/forecasting.ts`), `scheduler` (`apps/desktop/src/main/services/scheduler.ts`), `recharts` (UI).

## Rationale

Theil-Sen provides optimal stability for personal disk usage where large temporary downloads (game installs, video exports, dataset downloads) create outlier spikes. Pairwise slope percentiles directly yield explainable confidence ranges (e.g. "between 18 and 26 days"). Segmenting by category and resetting trend windows upon verified cleanup actions prevents historical deletions from distorting future growth rates.

## Feature design

**Data model sketch**:

```typescript
export const usageSnapshots = sqliteTable("usage_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotDate: text("snapshot_date").notNull().unique(), // YYYY-MM-DD
  capturedAt: text("captured_at").notNull(), // ISO timestamp
  volumeTotalBytes: integer("volume_total_bytes").notNull(),
  volumeUsedBytes: integer("volume_used_bytes").notNull(),
  volumeFreeBytes: integer("volume_free_bytes").notNull(),
  isSynthetic: integer("is_synthetic").notNull().default(0),
});

export const usageSnapshotCategories = sqliteTable("usage_snapshot_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => usageSnapshots.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  segmentId: integer("segment_id").notNull().default(0),
});

export const forecasts = sqliteTable("forecasts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  generatedAt: text("generated_at").notNull(),
  category: text("category").notNull(), // '__total__' or category name
  modelType: text("model_type").notNull(), // 'theil_sen'
  dataSource: text("data_source").notNull(), // 'bootstrap' | 'blended' | 'tracked'
  sampleCount: integer("sample_count").notNull(),
  slopeBytesPerDay: real("slope_bytes_per_day").notNull(),
  slopeLowBytesPerDay: real("slope_low_bytes_per_day").notNull(),
  slopeHighBytesPerDay: real("slope_high_bytes_per_day").notNull(),
  projectedFullDate: text("projected_full_date"),
  projectedFullDateLow: text("projected_full_date_low"),
  projectedFullDateHigh: text("projected_full_date_high"),
  horizonDays: integer("horizon_days"),
  confidenceScore: real("confidence_score").notNull(),
});
```

**State transitions**:
- Fresh install: `bootstrap` data source (synthetic history from file creation dates).
- 1 to 2 real snapshots: `blended` data source.
- 3+ real daily snapshots: `tracked` data source (full Theil-Sen calculation on real observations).
- File cleanup executed: `segment_id` increments for affected categories, triggering immediate snapshot to re-seed trend line.

**API surface**:

| Channel | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `forecast:get` | invoke | `category?: string` | `status`, `forecasts`, `history`, `fastestGrowing` | IPC main | 500 error |
| `forecast:whatIf` | invoke | `adjustments: { category: string, bytesToRemove: number }[]` | `baselineHorizonDays`, `projectedHorizonDays`, `daysGained`, `projectedFullDate` | IPC main | 400 invalid schema |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `forecast:get` | Historical usage points | `usage_snapshots` and `usage_snapshot_categories` query |
| `forecast:get` | Growth rates and projected full dates | Theil-Sen computation stored in `forecasts` table |
| `forecast:get` | Data source badge | `forecasts.data_source` (`bootstrap`, `blended`, `tracked`) |
| `forecast:whatIf` | Days gained delta | In-memory re-anchoring of Theil-Sen slope: `(used_now - removedBytes) / total_capacity` |
| Overview headline | Fastest growing category | `forecasts` sorted by `slope_bytes_per_day` descending |

**Key invariants**:
- **I-8 / I-9**: Renderer accesses forecasting solely through typed IPC in `@horizon/shared-types`.
- **I-11**: Schema updates managed via Drizzle migration.
- **I-13**: Unique calendar date per snapshot (`UNIQUE(snapshot_date)`); duplicate runs on the same date are rejected.
- **In-Memory What-If**: `forecast:whatIf` never modifies stored database snapshots or forecasts.

**Security model**:
- Pure local-first execution. Disk metrics and forecast parameters remain strictly on the local machine within SQLite.

**Critical test scenarios**:
- Bootstrap pass anchors properly against current disk metrics, verifies **AC-2**.
- Theil-Sen computes correct median slopes and percentile bounds on test fixture vectors, verifies **AC-3**.
- What-if projection accurately reflects byte reduction deltas without altering database records, verifies **AC-6**.
- Cleanup action increments category segment identifier and seeds new snapshot point, verifies **AC-4**.

## Build plan

1. Define database tables in `apps/desktop/src/main/db/schema.ts` (`usageSnapshots`, `usageSnapshotCategories`, `forecasts`) and generate migration `0005_forecasting.sql`, satisfies **AC-1**, **AC-3**.
2. Add shared schemas and types in `packages/shared-types/src/forecast.ts`, satisfies **AC-5**, **AC-6**.
3. Implement bootstrap history generator and scheduler service in `apps/desktop/src/main/services/scheduler.ts` with `node-cron`, satisfies **AC-1**, **AC-2**, **AC-4**.
4. Implement Theil-Sen regression and what-if simulation in `apps/desktop/src/main/services/forecasting.ts` with unit tests, satisfies **AC-3**, **AC-5**, **AC-6**.
5. Wire IPC handlers in `apps/desktop/src/main/ipc/forecast.ts` and expose via preload bridge, satisfies **AC-5**, **AC-6**.
6. Build `ForecastTab.tsx` with Recharts composed chart, confidence band, category growth breakdown, and interactive what-if simulator with "Apply this plan" deep links, satisfies **AC-7**, **AC-8**.
7. Update `OverviewTab.tsx` and `App.tsx` with live forecast headline and tab navigation, satisfies **AC-9**.
8. Update `ui-registry.md` and `progress-tracker.md`, satisfies **AC-7**, **AC-9**.

## Consequences

**Positive**:
- Users receive early warning weeks before running out of disk space.
- Outlier resilience prevents panic alerts from single large downloads.
- Cleanups connect directly to tangible runway improvements.

**Negative / tradeoffs**:
- Reconstructing bootstrap history cannot account for files deleted before Horizon installation.

## Follow-up

- [ ] Connect forecast alerts to background OS notifications in Phase 10.
