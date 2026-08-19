import { z } from "zod";

/** Archive lifecycle state for a bundle stored by Horizon */
export const ArchiveStatusSchema = z.enum(["active", "restored", "deleted"]);
export type ArchiveStatus = z.infer<typeof ArchiveStatusSchema>;

/** One file recorded inside an archive bundle */
export const ArchiveContentItemSchema = z.object({
  fileId: z.number().int().positive(),
  originalPath: z.string(),
  entryPath: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  category: z.string(),
  modifiedAt: z.string().nullable().optional(),
});
export type ArchiveContentItem = z.infer<typeof ArchiveContentItemSchema>;

/** Archive bundle row returned over IPC */
export const ArchiveRecordSchema = z.object({
  id: z.number().int().positive(),
  bundlePath: z.string(),
  destinationDir: z.string(),
  contents: z.array(ArchiveContentItemSchema),
  originalFileCount: z.number().int().nonnegative(),
  originalBytes: z.number().int().nonnegative(),
  archiveSizeBytes: z.number().int().nonnegative(),
  status: ArchiveStatusSchema,
  createdAt: z.string(),
  restoredAt: z.string().nullable().optional(),
});
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;

/** Request to create an archive from file_index ids */
export const ArchiveCreateRequestSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1).max(500),
  destinationDir: z.string().trim().min(1).optional(),
});
export type ArchiveCreateRequest = z.infer<typeof ArchiveCreateRequestSchema>;

/** Individual file result in an archive create response */
export const ArchiveCreateResultItemSchema = z.object({
  fileId: z.number().int().positive(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum(["archived", "blocked", "failed"]),
  reason: z.string().optional(),
});
export type ArchiveCreateResultItem = z.infer<
  typeof ArchiveCreateResultItemSchema
>;

/** Response from archive:create */
export const ArchiveCreateResponseSchema = z.object({
  archive: ArchiveRecordSchema.nullable(),
  archivedCount: z.number().int().nonnegative(),
  trashedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  freedBytes: z.number().int().nonnegative(),
  results: z.array(ArchiveCreateResultItemSchema),
});
export type ArchiveCreateResponse = z.infer<
  typeof ArchiveCreateResponseSchema
>;

/** Request to list known archive bundles */
export const ArchiveListRequestSchema = z.object({}).optional();
export type ArchiveListRequest = z.infer<typeof ArchiveListRequestSchema>;

/** Response from archive:list */
export const ArchiveListResponseSchema = z.object({
  archives: z.array(ArchiveRecordSchema),
  totalArchives: z.number().int().nonnegative(),
  totalOriginalBytes: z.number().int().nonnegative(),
  totalArchiveBytes: z.number().int().nonnegative(),
});
export type ArchiveListResponse = z.infer<typeof ArchiveListResponseSchema>;

/** Request to read bundle contents without extracting */
export const ArchiveContentsRequestSchema = z.object({
  archiveId: z.number().int().positive(),
});
export type ArchiveContentsRequest = z.infer<
  typeof ArchiveContentsRequestSchema
>;

/** Response from archive:contents */
export const ArchiveContentsResponseSchema = z.object({
  archiveId: z.number().int().positive(),
  contents: z.array(ArchiveContentItemSchema),
});
export type ArchiveContentsResponse = z.infer<
  typeof ArchiveContentsResponseSchema
>;

/** Request to restore an archive */
export const ArchiveRestoreRequestSchema = z.object({
  archiveId: z.number().int().positive(),
  restoreRoot: z.string().trim().min(1).optional(),
});
export type ArchiveRestoreRequest = z.infer<
  typeof ArchiveRestoreRequestSchema
>;

/** Response from archive:restore */
export const ArchiveRestoreResponseSchema = z.object({
  archiveId: z.number().int().positive(),
  restoredCount: z.number().int().nonnegative(),
  restoredBytes: z.number().int().nonnegative(),
  restoredPaths: z.array(z.string()),
});
export type ArchiveRestoreResponse = z.infer<
  typeof ArchiveRestoreResponseSchema
>;
