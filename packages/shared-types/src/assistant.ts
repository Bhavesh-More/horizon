import { z } from "zod";

export const AssistantChatErrorSchema = z.enum([
  "waiting_for_scan",
  "provider_unavailable",
  "not_configured",
  "authentication_failed",
  "quota_exceeded",
  "network_error",
  "timeout",
  "invalid_response",
  "unknown",
]);
export type AssistantChatError = z.infer<typeof AssistantChatErrorSchema>;

export const AssistantChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  scanRunId: z.number().int().positive().optional(),
});
export type AssistantChatRequest = z.infer<typeof AssistantChatRequestSchema>;

export const AssistantChatStartResponseSchema = z.object({
  requestId: z.string().min(1),
  state: z.enum(["started", "provider_unavailable", "waiting_for_scan", "error"]),
});
export type AssistantChatStartResponse = z.infer<
  typeof AssistantChatStartResponseSchema
>;

export const AssistantStreamEventSchema = z.object({
  requestId: z.string().min(1),
  event: z.enum(["started", "chunk", "completed", "failed"]),
  chunk: z.string().optional(),
  message: z.string().optional(),
  errorCategory: AssistantChatErrorSchema.optional(),
});
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEventSchema>;

export const AssistantRetrievedFileSchema = z.object({
  fileId: z.number().int().positive(),
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  category: z.string(),
  extension: z.string().nullable().optional(),
  modifiedAt: z.string().nullable().optional(),
  accessedAt: z.string().nullable().optional(),
});
export type AssistantRetrievedFile = z.infer<
  typeof AssistantRetrievedFileSchema
>;

export const AssistantRetrievalContextSchema = z.object({
  generatedAt: z.string(),
  evidenceStrength: z.enum(["none", "weak", "useful"]),
  searchTerms: z.array(z.string()),
  scan: z
    .object({
      scanId: z.number().int().positive(),
      completedAt: z.string(),
      totalFiles: z.number().int().nonnegative(),
      totalBytes: z.number().int().nonnegative(),
      scopePaths: z.array(z.string()),
    })
    .nullable(),
  matchedFiles: z.array(AssistantRetrievedFileSchema),
  duplicates: z.array(
    z.object({
      groupId: z.number().int().positive(),
      type: z.enum(["exact", "near"]),
      memberCount: z.number().int().nonnegative(),
      reclaimableBytes: z.number().int().nonnegative(),
      members: z.array(AssistantRetrievedFileSchema),
    })
  ),
  forecast: z
    .object({
      projectedFullDate: z.string().nullable(),
      daysToFull: z.number().int().nullable(),
      confidence: z.number().nullable(),
      fastestGrowingCategories: z.array(
        z.object({
          category: z.string(),
          growthBytesPerDay: z.number(),
        })
      ),
    })
    .nullable(),
  recommendations: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      reason: z.string(),
      targetTab: z.string(),
      relatedFileIds: z.array(z.number().int().positive()),
    })
  ),
});
export type AssistantRetrievalContext = z.infer<
  typeof AssistantRetrievalContextSchema
>;
