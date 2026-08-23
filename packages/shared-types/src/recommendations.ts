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

function normalizeRecommendationType(val: unknown): RecommendationType {
  if (typeof val !== "string") return "cleanup";
  const lower = val.toLowerCase().trim();
  if (lower.includes("dup")) return "duplicate";
  if (lower.includes("large")) return "large_file";
  if (lower.includes("unused") || lower.includes("stale") || lower.includes("old")) return "unused";
  if (lower.includes("archive")) return "archive";
  if (lower.includes("forecast")) return "forecast";
  return "cleanup";
}

function normalizeTargetTab(val: unknown, type?: string): RecommendationTargetTab {
  if (typeof val === "string") {
    const lower = val.toLowerCase().trim();
    if (lower.includes("dup")) return "duplicates";
    if (lower.includes("large")) return "large_files";
    if (lower.includes("unused") || lower.includes("stale") || lower.includes("archive")) return "unused";
    if (lower.includes("forecast")) return "forecast";
    if (lower.includes("overview") || lower.includes("summary") || lower.includes("home")) return "overview";
  }
  if (type === "duplicate") return "duplicates";
  if (type === "large_file") return "large_files";
  if (type === "unused" || type === "archive") return "unused";
  if (type === "forecast") return "forecast";
  return "overview";
}

function normalizePriority(val: unknown): number {
  if (typeof val === "number" && !isNaN(val)) {
    return Math.max(0, Math.min(100, Math.round(val)));
  }
  if (typeof val === "string") {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return Math.max(0, Math.min(100, parsed));
    const lower = val.toLowerCase();
    if (lower.includes("high") || lower.includes("urgent") || lower.includes("critical")) return 85;
    if (lower.includes("med")) return 50;
    if (lower.includes("low")) return 25;
  }
  return 50;
}

/** Single LLM recommendation output before app side validation */
export const RecommendationOutputItemSchema = z.preprocess(
  (raw: any) => {
    if (!raw || typeof raw !== "object") return raw;
    const type = normalizeRecommendationType(
      raw.recommendation_type || raw.recommendationType || raw.type || raw.category
    );
    const targetTab = normalizeTargetTab(
      raw.target_tab || raw.targetTab || raw.tab,
      type
    );
    const priority = normalizePriority(raw.priority);
    const title = String(raw.title || raw.name || raw.summary || "Storage cleanup recommendation").trim();
    const reason = String(raw.reason || raw.description || raw.explanation || raw.details || "Review candidate files in Horizon.").trim();

    let relatedFileIds: number[] = [];
    const rawIds = raw.related_file_ids || raw.relatedFileIds || raw.file_ids || raw.fileIds || raw.files;
    if (Array.isArray(rawIds)) {
      relatedFileIds = rawIds
        .map((x) => (typeof x === "object" && x !== null ? Number(x.id || x.fileId) : Number(x)))
        .filter((x) => !isNaN(x) && x > 0);
    } else if (typeof rawIds === "number" && rawIds > 0) {
      relatedFileIds = [rawIds];
    }

    return {
      recommendation_type: type,
      title: title || "Storage cleanup recommendation",
      reason: reason || "Review candidate files in Horizon.",
      priority,
      related_file_ids: relatedFileIds,
      target_tab: targetTab,
      action: "review",
    };
  },
  z.object({
    recommendation_type: RecommendationTypeSchema,
    title: z.string().min(1),
    reason: z.string().min(1),
    priority: z.number().int().min(0).max(100).default(50),
    related_file_ids: z.array(z.number().int().positive()).default([]),
    target_tab: RecommendationTargetTabSchema,
    action: z.literal("review"),
  })
);
export type RecommendationOutputItem = z.infer<
  typeof RecommendationOutputItemSchema
>;

/** Structured LLM output contract */
export const RecommendationOutputSchema = z.preprocess(
  (val: any) => {
    let list: any[] = [];
    if (Array.isArray(val)) {
      list = val;
    } else if (val && typeof val === "object") {
      if (Array.isArray(val.recommendations)) {
        list = val.recommendations;
      } else {
        for (const key of ["items", "data", "result", "suggestions", "cards", "results", "recommendation"]) {
          if (Array.isArray(val[key])) {
            list = val[key];
            break;
          } else if (val[key] && typeof val[key] === "object") {
            list = [val[key]];
            break;
          }
        }
      }
    }
    return { recommendations: list };
  },
  z.object({
    recommendations: z.array(RecommendationOutputItemSchema).max(5),
  })
);
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
