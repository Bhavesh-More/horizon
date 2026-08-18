import { z } from "zod";

export const DataSourceSchema = z.enum(["bootstrap", "blended", "tracked"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const ForecastStatusSchema = z.enum(["ready", "calculating", "insufficient_data", "building_baseline"]);
export type ForecastStatus = z.infer<typeof ForecastStatusSchema>;

export const CategoryForecastSchema = z.object({
  category: z.string(),
  slopeBytesPerDay: z.number(),
  slopeLowBytesPerDay: z.number(),
  slopeHighBytesPerDay: z.number(),
  monthlyGrowthBytes: z.number(),
  dataSource: DataSourceSchema,
  sampleCount: z.number(),
  confidenceScore: z.number(),
  isSynthetic: z.boolean(),
});
export type CategoryForecast = z.infer<typeof CategoryForecastSchema>;

export const TotalForecastSchema = z.object({
  category: z.literal("__total__"),
  slopeBytesPerDay: z.number(),
  slopeLowBytesPerDay: z.number(),
  slopeHighBytesPerDay: z.number(),
  monthlyGrowthBytes: z.number(),
  dataSource: DataSourceSchema,
  sampleCount: z.number(),
  confidenceScore: z.number(),
  horizonDays: z.number().nullable(),
  projectedFullDate: z.string().nullable(),
  projectedFullDateLow: z.string().nullable(),
  projectedFullDateHigh: z.string().nullable(),
  isSynthetic: z.boolean(),
});
export type TotalForecast = z.infer<typeof TotalForecastSchema>;

export const UsageSnapshotPointSchema = z.object({
  snapshotDate: z.string(),
  capturedAt: z.string(),
  volumeTotalBytes: z.number(),
  volumeUsedBytes: z.number(),
  volumeFreeBytes: z.number(),
  isSynthetic: z.boolean(),
  categories: z.record(z.string(), z.number()).optional(),
});
export type UsageSnapshotPoint = z.infer<typeof UsageSnapshotPointSchema>;

export const UsagePatternSchema = z.enum(["growing", "shrinking", "stable", "high_churn"]);
export type UsagePattern = z.infer<typeof UsagePatternSchema>;

export const ForecastGetResponseSchema = z.object({
  status: ForecastStatusSchema,
  totalForecast: TotalForecastSchema.nullable(),
  categoryForecasts: z.array(CategoryForecastSchema),
  fastestGrowing: CategoryForecastSchema.nullable(),
  history: z.array(UsageSnapshotPointSchema),
  currentVolumeTotalBytes: z.number(),
  currentVolumeUsedBytes: z.number(),
  currentVolumeFreeBytes: z.number(),
  safeCleanableBytes: z.number().default(0),
  safeCleanableDaysGained: z.number().default(0),
  /** Minimum free bytes observed across all real (non-synthetic) snapshots */
  minObservedFreeBytes: z.number().default(0),
  /** Maximum free bytes observed across all real (non-synthetic) snapshots */
  maxObservedFreeBytes: z.number().default(0),
  /** Std-dev of free bytes across real snapshots — indicates churn volatility */
  usageVolatilityBytes: z.number().default(0),
  /** Detected usage pattern based on slope and volatility */
  usagePattern: UsagePatternSchema.default("stable"),
  /** Number of real (non-synthetic) daily snapshots collected so far */
  realTrackedDays: z.number().default(0),
  /** Minimum real days required before a projection is shown */
  minDaysForProjection: z.number().default(14),
});
export type ForecastGetResponse = z.infer<typeof ForecastGetResponseSchema>;

export const ForecastWhatIfAdjustmentSchema = z.object({
  category: z.string(),
  bytesToRemove: z.number(),
});
export type ForecastWhatIfAdjustment = z.infer<typeof ForecastWhatIfAdjustmentSchema>;

export const ForecastWhatIfRequestSchema = z.object({
  adjustments: z.array(ForecastWhatIfAdjustmentSchema),
});
export type ForecastWhatIfRequest = z.infer<typeof ForecastWhatIfRequestSchema>;

export const ForecastWhatIfResponseSchema = z.object({
  baselineHorizonDays: z.number().nullable(),
  projectedHorizonDays: z.number().nullable(),
  daysGained: z.number(),
  baselineFullDate: z.string().nullable(),
  projectedFullDate: z.string().nullable(),
  totalBytesRemoved: z.number(),
});
export type ForecastWhatIfResponse = z.infer<typeof ForecastWhatIfResponseSchema>;
