import { z } from "zod";

/** Recommendation category chosen from the controlled Horizon vocabulary */
export const RecommendationTypeSchema = z.enum([
  "duplicate",
  "unused",
  "large_file",
  "archive",
  "forecast",
  "cleanup",
]);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

/** Recommendation lifecycle state */
export const RecommendationStatusSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

/** Assistant review target tab */
export const RecommendationTargetTabSchema = z.enum([
  "duplicates",
  "unused",
  "large_files",
  "forecast",
  "overview",
]);
export type RecommendationTargetTab = z.infer<
  typeof RecommendationTargetTabSchema
>;

/** Batch generation lifecycle state */
export const RecommendationGenerationStateSchema = z.enum([
  "idle",
  "waiting_for_scan",
  "preparing_context",
  "generating",
  "validating",
  "ready",
  "no_results",
  "provider_unavailable",
  "error",
]);
export type RecommendationGenerationState = z.infer<
  typeof RecommendationGenerationStateSchema
>;

/** Normalized provider error category for Assistant UI */
export const RecommendationProviderErrorSchema = z.enum([
  "not_configured",
  "provider_unavailable",
  "authentication_failed",
  "quota_exceeded",
  "network_error",
  "timeout",
  "invalid_response",
  "unknown",
]);
export type RecommendationProviderError = z.infer<
  typeof RecommendationProviderErrorSchema
>;

/** Recommendation batch persisted in SQLite */
export const RecommendationBatchSchema = z.object({
  id: z.number().int().positive(),
  scanRunId: z.number().int().positive(),
  generationId: z.string(),
  sourceForecastId: z.number().int().positive().nullable().optional(),
  status: z.enum(["running", "complete", "no_results", "failed", "stale"]),
  errorCategory: RecommendationProviderErrorSchema.nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
});
export type RecommendationBatch = z.infer<typeof RecommendationBatchSchema>;

/** Recommendation row shown as an Assistant card */
export const RecommendationRecordSchema = z.object({
  id: z.number().int().positive(),
  scanRunId: z.number().int().positive(),
  batchId: z.number().int().positive(),
  generationId: z.string(),
  recommendationType: RecommendationTypeSchema,
  title: z.string(),
  reason: z.string(),
  priority: z.number().int().min(0).max(100),
  relatedFileIds: z.array(z.number().int().positive()),
  targetTab: RecommendationTargetTabSchema,
  action: z.literal("review"),
  status: RecommendationStatusSchema,
  provider: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type RecommendationRecord = z.infer<
  typeof RecommendationRecordSchema
>;

/** Duplicate evidence supplied to the LLM */
export const RecommendationDuplicateSummarySchema = z.object({
  groupId: z.number().int().positive(),
  type: z.enum(["exact", "near"]),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  reclaimableBytes: z.number().int().nonnegative(),
  opportunityScore: z.number().int().min(0).max(100),
  members: z.array(
    z.object({
      fileId: z.number().int().positive(),
      name: z.string(),
      path: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      modifiedAt: z.string().nullable().optional(),
    })
  ),
});
export type RecommendationDuplicateSummary = z.infer<
  typeof RecommendationDuplicateSummarySchema
>;

/** Unused file evidence supplied to the LLM */
export const RecommendationUnusedSummarySchema = z.object({
  fileId: z.number().int().positive(),
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  category: z.string(),
  lastAccessedAt: z.string().nullable().optional(),
  lastModifiedAt: z.string().nullable().optional(),
  ageDays: z.number().int().nonnegative(),
  opportunityScore: z.number().int().min(0).max(100),
});
export type RecommendationUnusedSummary = z.infer<
  typeof RecommendationUnusedSummarySchema
>;

/** Large file evidence supplied to the LLM */
export const RecommendationLargeFileSummarySchema = z.object({
  fileId: z.number().int().positive(),
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  category: z.string(),
  lastAccessedAt: z.string().nullable().optional(),
  lastModifiedAt: z.string().nullable().optional(),
  opportunityScore: z.number().int().min(0).max(100),
});
export type RecommendationLargeFileSummary = z.infer<
  typeof RecommendationLargeFileSummarySchema
>;

/** Forecast evidence supplied to the LLM */
export const RecommendationForecastSummarySchema = z.object({
  forecastId: z.number().int().positive().nullable(),
  projectedFullDate: z.string().nullable(),
  daysToFull: z.number().int().nullable(),
  modelType: z.string(),
  confidence: z.number().nullable(),
  fastestGrowingCategories: z.array(
    z.object({
      category: z.string(),
      growthBytesPerDay: z.number(),
    })
  ),
});
export type RecommendationForecastSummary = z.infer<
  typeof RecommendationForecastSummarySchema
>;

/** Complete metadata context sent to the LLM */
export const RecommendationContextSchema = z.object({
  generatedAt: z.string(),
  scan: z.object({
    scanId: z.number().int().positive(),
    completedAt: z.string(),
    filesIndexed: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    reclaimableBytes: z.number().int().nonnegative(),
    duplicateGroupCount: z.number().int().nonnegative(),
    unusedCandidateCount: z.number().int().nonnegative(),
    largeFileCount: z.number().int().nonnegative(),
  }),
  duplicates: z.array(RecommendationDuplicateSummarySchema),
  unused: z.array(RecommendationUnusedSummarySchema),
  largeFiles: z.array(RecommendationLargeFileSummarySchema),
  forecast: RecommendationForecastSummarySchema.nullable(),
});
export type RecommendationContext = z.infer<
  typeof RecommendationContextSchema
>;

/** Single LLM recommendation output before app side validation */
export const RecommendationOutputItemSchema = z.object({
  recommendation_type: RecommendationTypeSchema,
  title: z.string().min(1),
  reason: z.string().min(1),
  priority: z.number().int().min(0).max(100),
  related_file_ids: z.array(z.number().int().positive()),
  target_tab: RecommendationTargetTabSchema,
  action: z.literal("review"),
});
export type RecommendationOutputItem = z.infer<
  typeof RecommendationOutputItemSchema
>;

/** Structured LLM output contract */
export const RecommendationOutputSchema = z.object({
  recommendations: z.array(RecommendationOutputItemSchema).max(5),
});
export type RecommendationOutput = z.infer<
  typeof RecommendationOutputSchema
>;

/** Request for active recommendations */
export const RecommendationsGetActiveRequestSchema = z
  .object({
    scanRunId: z.number().int().positive().optional(),
  })
  .optional();
export type RecommendationsGetActiveRequest = z.infer<
  typeof RecommendationsGetActiveRequestSchema
>;

/** Response for active recommendations */
export const RecommendationsGetActiveResponseSchema = z.object({
  batch: RecommendationBatchSchema.nullable(),
  recommendations: z.array(RecommendationRecordSchema),
  generationState: RecommendationGenerationStateSchema,
  lastError: z
    .object({
      category: RecommendationProviderErrorSchema,
      message: z.string(),
    })
    .nullable(),
});
export type RecommendationsGetActiveResponse = z.infer<
  typeof RecommendationsGetActiveResponseSchema
>;

/** Request to regenerate recommendations */
export const RecommendationsRegenerateRequestSchema = z
  .object({
    scanRunId: z.number().int().positive().optional(),
  })
  .optional();
export type RecommendationsRegenerateRequest = z.infer<
  typeof RecommendationsRegenerateRequestSchema
>;

/** Response after regeneration starts or completes */
export const RecommendationsRegenerateResponseSchema = z.object({
  batchId: z.number().int().positive().nullable(),
  generationId: z.string().nullable(),
  state: RecommendationGenerationStateSchema,
});
export type RecommendationsRegenerateResponse = z.infer<
  typeof RecommendationsRegenerateResponseSchema
>;

/** Request to dismiss a recommendation */
export const RecommendationsDismissRequestSchema = z.object({
  recommendationId: z.number().int().positive(),
});
export type RecommendationsDismissRequest = z.infer<
  typeof RecommendationsDismissRequestSchema
>;

/** Response after dismissing a recommendation */
export const RecommendationsDismissResponseSchema = z.object({
  recommendationId: z.number().int().positive(),
  status: z.literal("dismissed"),
});
export type RecommendationsDismissResponse = z.infer<
  typeof RecommendationsDismissResponseSchema
>;

/** Request for one recommendation */
export const RecommendationsGetByIdRequestSchema = z.object({
  recommendationId: z.number().int().positive(),
});
export type RecommendationsGetByIdRequest = z.infer<
  typeof RecommendationsGetByIdRequestSchema
>;

/** Generation lifecycle event sent to the renderer */
export const RecommendationGenerationEventSchema = z.object({
  event: z.enum(["started", "completed", "failed"]),
  scanRunId: z.number().int().positive(),
  generationId: z.string(),
  count: z.number().int().nonnegative().optional(),
  errorCategory: RecommendationProviderErrorSchema.optional(),
  message: z.string().optional(),
});
export type RecommendationGenerationEvent = z.infer<
  typeof RecommendationGenerationEventSchema
>;
