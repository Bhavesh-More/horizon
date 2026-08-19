/**
 * hierarchy.ts
 * Owns: Shared contracts and Zod schemas for the Disk Hierarchy (Tree Explorer) tab.
 * Upholds:
 * - Invariant I-9: single source of truth for hierarchy types.
 * - Invariant I-15: runtime Zod validation at IPC boundary.
 */
import { z } from "zod";

/**
 * Clean categories for "safe to clean" indicators.
 * Only assigned when we are CERTAIN the folder is safe to remove.
 */
export const CleanCategorySchema = z.enum([
  "cache",           // App caches, XDG caches, browser caches
  "build_artifact",  // Xcode DerivedData, Gradle build, node_modules, .expo
  "log",             // Log files, crash reports
  "package_cache",   // npm, yarn, pip, pub, cocoapods caches
  "trash",           // User trash
]).nullable();

export type CleanCategory = z.infer<typeof CleanCategorySchema>;

/** Single node in the disk hierarchy tree (file or folder) */
export const HierarchyNodeSchema: z.ZodType<HierarchyNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    isDirectory: z.boolean(),
    sizeBytes: z.number().nonnegative(),
    allocatedBytes: z.number().nonnegative(),
    fileCount: z.number().int().nonnegative(),
    folderCount: z.number().int().nonnegative(),
    percentOfParent: z.number().min(0).max(100),
    lastModified: z.string(),
    isHidden: z.boolean(),
    hasChildren: z.boolean(),
    cleanCategory: CleanCategorySchema.optional().default(null),
    cleanLabel: z.string().nullable().optional().default(null),
    children: z.array(HierarchyNodeSchema).optional(),
  })
);

export type HierarchyNode = {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  allocatedBytes: number;
  fileCount: number;
  folderCount: number;
  percentOfParent: number;
  lastModified: string;
  isHidden: boolean;
  hasChildren: boolean;
  cleanCategory?: CleanCategory | null;
  cleanLabel?: string | null;
  children?: HierarchyNode[];
};

/** Information about an available disk/volume or root folder */
export const HierarchyDiskInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  totalBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  isRemovable: z.boolean().optional(),
});

export type HierarchyDiskInfo = z.infer<typeof HierarchyDiskInfoSchema>;

/** Request to list available drives / volumes */
export const HierarchyListDrivesResponseSchema = z.object({
  drives: z.array(HierarchyDiskInfoSchema),
  defaultPath: z.string().min(1),
});

export type HierarchyListDrivesResponse = z.infer<
  typeof HierarchyListDrivesResponseSchema
>;

/** Request to scan a directory for its hierarchy tree */
export const HierarchyScanDirectoryRequestSchema = z.object({
  path: z.string().min(1),
  showHidden: z.boolean().default(false),
  depth: z.number().int().min(1).max(10).default(2),
});

export type HierarchyScanDirectoryRequest = z.infer<
  typeof HierarchyScanDirectoryRequestSchema
>;

/** Response containing the scanned hierarchy tree node */
export const HierarchyScanDirectoryResponseSchema = z.object({
  root: HierarchyNodeSchema,
  scannedAt: z.string(),
  showHidden: z.boolean(),
});

export type HierarchyScanDirectoryResponse = z.infer<
  typeof HierarchyScanDirectoryResponseSchema
>;

/** Response when user selects a folder via native dialog */
export const HierarchyPickDirectoryResponseSchema = z.object({
  canceled: z.boolean(),
  selectedPath: z.string().nullable(),
});

export type HierarchyPickDirectoryResponse = z.infer<
  typeof HierarchyPickDirectoryResponseSchema
>;
