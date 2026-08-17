import { z } from "zod";

/** Discriminator for duplicate detection strategy */
export const DuplicateHashTypeEnum = z.enum(["exact", "perceptual", "embedding"]);
export type DuplicateHashType = z.infer<typeof DuplicateHashTypeEnum>;

/** Individual member inside a duplicate group */
export const DuplicateGroupMemberSchema = z.object({
  fileId: z.number(),
  path: z.string(),
  sizeBytes: z.number(),
  extension: z.string().optional(),
  category: z.string(),
  modifiedAt: z.string().optional(),
  similarityScore: z.number(), // 1.0 for exact, <1.0 for perceptual
  isRecommendedKeep: z.boolean(), // Recommended to keep (newest / highest quality)
});
export type DuplicateGroupMember = z.infer<typeof DuplicateGroupMemberSchema>;

/** Duplicate group containing candidate duplicates */
export const DuplicateGroupSchema = z.object({
  groupId: z.number(),
  hashType: DuplicateHashTypeEnum,
  representativeHash: z.string(),
  memberCount: z.number(),
  totalSizeBytes: z.number(),
  reclaimableBytes: z.number(),
  members: z.array(DuplicateGroupMemberSchema),
});
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

/** Request schema for listing duplicate groups */
export const DuplicatesListRequestSchema = z.object({
  scanRunId: z.number().optional(),
  hashType: z.enum(["all", "exact", "perceptual", "embedding"]).optional(),
});
export type DuplicatesListRequest = z.infer<typeof DuplicatesListRequestSchema>;

/** Response schema for listing duplicate groups */
export const DuplicatesListResponseSchema = z.object({
  groups: z.array(DuplicateGroupSchema),
  totalGroups: z.number(),
  totalReclaimableBytes: z.number(),
});
export type DuplicatesListResponse = z.infer<typeof DuplicatesListResponseSchema>;

/** Progress event for hashing calculation */
export const DuplicateDetectionProgressSchema = z.object({
  event: z.enum(["started", "progress", "complete", "failed"]),
  phase: z.enum(["exact", "perceptual", "embedding"]).optional(),
  processedFiles: z.number().optional(),
  totalFiles: z.number().optional(),
  groupsFound: z.number().optional(),
  error: z.string().optional(),
});
export type DuplicateDetectionProgress = z.infer<typeof DuplicateDetectionProgressSchema>;
