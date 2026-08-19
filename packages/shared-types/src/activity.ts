import { z } from "zod";

/** Activity item type shown in the Activity tab. */
export const ActivityTypeSchema = z.enum(["scan", "trash", "archive", "restore"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/** Activity status shown in the audit log. */
export const ActivityStatusSchema = z.enum([
  "running",
  "complete",
  "cancelled",
  "failed",
]);
export type ActivityStatus = z.infer<typeof ActivityStatusSchema>;

/** Request payload for activity:list. */
export const ActivityListRequestSchema = z
  .object({
    limit: z.number().int().positive().max(200).default(100),
  })
  .optional();
export type ActivityListRequest = z.infer<typeof ActivityListRequestSchema>;

/** One audit row returned to the Activity tab. */
export const ActivityItemSchema = z.object({
  id: z.string(),
  type: ActivityTypeSchema,
  title: z.string(),
  description: z.string(),
  timestamp: z.string(),
  status: ActivityStatusSchema,
  bytesAffected: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  paths: z.array(z.string()),
  relatedArchiveId: z.number().int().positive().nullable().optional(),
  undoAvailable: z.boolean(),
  undoLabel: z.string().nullable().optional(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

/** Response from activity:list. */
export const ActivityListResponseSchema = z.object({
  items: z.array(ActivityItemSchema),
  totalItems: z.number().int().nonnegative(),
  totalScans: z.number().int().nonnegative(),
  totalActions: z.number().int().nonnegative(),
  totalBytesAffected: z.number().int().nonnegative(),
});
export type ActivityListResponse = z.infer<typeof ActivityListResponseSchema>;

/** Request payload for activity:openTrash. */
export const ActivityOpenTrashRequestSchema = z.object({});
export type ActivityOpenTrashRequest = z.infer<
  typeof ActivityOpenTrashRequestSchema
>;

/** Response from activity:openTrash. */
export const ActivityOpenTrashResponseSchema = z.object({
  success: z.boolean(),
});
export type ActivityOpenTrashResponse = z.infer<
  typeof ActivityOpenTrashResponseSchema
>;
