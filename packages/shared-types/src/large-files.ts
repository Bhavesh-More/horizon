import { z } from "zod";
import { FileCategoryEnum } from "./scan";

export const LargeFilesListRequestSchema = z.object({
  minSizeBytes: z.number().int().nonnegative().default(52428800), // 50 MB default
  category: FileCategoryEnum.optional(),
  sortBy: z.enum(["size", "date", "name"]).default("size"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().positive().max(1000).default(500),
  scanRunId: z.number().int().positive().optional(),
});
export type LargeFilesListRequest = z.infer<typeof LargeFilesListRequestSchema>;

export const LargeFileItemSchema = z.object({
  fileId: z.number().int().positive(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  extension: z.string().nullable().optional(),
  category: FileCategoryEnum,
  modifiedAt: z.string().nullable().optional(),
  accessedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});
export type LargeFileItem = z.infer<typeof LargeFileItemSchema>;

export const LargeFilesListResponseSchema = z.object({
  files: z.array(LargeFileItemSchema),
  totalFiles: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
});
export type LargeFilesListResponse = z.infer<typeof LargeFilesListResponseSchema>;

export const SystemShowInFolderRequestSchema = z.object({
  path: z.string().min(1),
});
export type SystemShowInFolderRequest = z.infer<typeof SystemShowInFolderRequestSchema>;
