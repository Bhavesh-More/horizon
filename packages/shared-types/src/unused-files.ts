import { z } from "zod";
import { FileCategoryEnum } from "./scan";

export const UnusedFilesListRequestSchema = z.object({
  thresholdDays: z.number().int().min(30).max(730).default(180),
  category: FileCategoryEnum.optional(),
  scanRunId: z.number().int().positive().optional(),
});
export type UnusedFilesListRequest = z.infer<typeof UnusedFilesListRequestSchema>;

export const UnusedFileItemSchema = z.object({
  fileId: z.number().int().positive(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  extension: z.string().nullable().optional(),
  category: FileCategoryEnum,
  lastActivity: z.string(),
  usedFallback: z.boolean(),
});
export type UnusedFileItem = z.infer<typeof UnusedFileItemSchema>;

export const UnusedFileGroupSchema = z.object({
  category: FileCategoryEnum,
  fileCount: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  files: z.array(UnusedFileItemSchema),
});
export type UnusedFileGroup = z.infer<typeof UnusedFileGroupSchema>;

export const UnusedFilesListResponseSchema = z.object({
  groups: z.array(UnusedFileGroupSchema),
  totalFiles: z.number().int().nonnegative(),
  totalReclaimableBytes: z.number().int().nonnegative(),
});
export type UnusedFilesListResponse = z.infer<typeof UnusedFilesListResponseSchema>;
