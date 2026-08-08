import { z } from "zod";

/** Safety tier classification for files */
export const SafetyTierEnum = z.enum(["safe", "check", "blocked"]);
export type SafetyTier = z.infer<typeof SafetyTierEnum>;

/** Request to trash files by their file_index IDs */
export const CleanupTrashRequestSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1).max(500),
});
export type CleanupTrashRequest = z.infer<typeof CleanupTrashRequestSchema>;

/** Individual file result in a trash response */
export const TrashResultItemSchema = z.object({
  fileId: z.number(),
  path: z.string(),
  sizeBytes: z.number(),
  status: z.enum(["trashed", "blocked", "failed"]),
  reason: z.string().optional(),
});
export type TrashResultItem = z.infer<typeof TrashResultItemSchema>;

/** Response from cleanup:trash */
export const CleanupTrashResponseSchema = z.object({
  trashedCount: z.number(),
  blockedCount: z.number(),
  failedCount: z.number(),
  freedBytes: z.number(),
  results: z.array(TrashResultItemSchema),
});
export type CleanupTrashResponse = z.infer<typeof CleanupTrashResponseSchema>;
