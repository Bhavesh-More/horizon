import { z } from "zod";

export const FileCategoryEnum = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "dev_artifact",
  "other",
]);
export type FileCategory = z.infer<typeof FileCategoryEnum>;

export const FileItemSchema = z.object({
  id: z.number().optional(),
  scanRunId: z.number().optional(),
  path: z.string(),
  sizeBytes: z.number(),
  extension: z.string().optional(),
  category: FileCategoryEnum,
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
  accessedAt: z.string().optional(),
});
export type FileItem = z.infer<typeof FileItemSchema>;

export const CategoryStatSchema = z.object({
  files: z.number(),
  bytes: z.number(),
});
export type CategoryStat = z.infer<typeof CategoryStatSchema>;

export const ScanSummarySchema = z.object({
  totalFiles: z.number(),
  totalBytes: z.number(),
  categories: z.record(z.string(), CategoryStatSchema).optional(),
});
export type ScanSummary = z.infer<typeof ScanSummarySchema>;

export const ScanStartRequest = z.object({
  scope: z.array(z.string()),
});
export type ScanStartRequest = z.infer<typeof ScanStartRequest>;

export const ScanProgressEvent = z.object({
  event: z.enum(["started", "found", "batch", "complete", "cancelled", "failed"]),
  scanRunId: z.number().optional(),
  file: FileItemSchema.optional(),
  files: z.array(FileItemSchema).optional(),
  summary: ScanSummarySchema.optional(),
  error: z.string().optional(),
});
export type ScanProgressEvent = z.infer<typeof ScanProgressEvent>;

export const GetLatestScanResponseSchema = z.object({
  scanRun: z
    .object({
      id: z.number(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
      status: z.string(),
      totalFiles: z.number(),
      totalBytes: z.number(),
    })
    .nullable(),
  recentFiles: z.array(FileItemSchema),
  categories: z.record(z.string(), CategoryStatSchema),
});
export type GetLatestScanResponse = z.infer<typeof GetLatestScanResponseSchema>;

