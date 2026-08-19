import { describe, expect, it } from "vitest";
import {
  HierarchyDiskInfoSchema,
  HierarchyNodeSchema,
  HierarchyScanDirectoryRequestSchema,
  HierarchyScanDirectoryResponseSchema,
} from "./hierarchy";

describe("Hierarchy contracts", () => {
  it("validates a leaf file node and a parent folder node recursively", () => {
    const leafFile = {
      id: "/root/file.txt",
      name: "file.txt",
      path: "/root/file.txt",
      isDirectory: false,
      sizeBytes: 1024,
      allocatedBytes: 4096,
      fileCount: 1,
      folderCount: 0,
      percentOfParent: 50.0,
      lastModified: "2026-08-19T10:00:00.000Z",
      isHidden: false,
      hasChildren: false,
    };

    const parentFolder = {
      id: "/root",
      name: "root",
      path: "/root",
      isDirectory: true,
      sizeBytes: 2048,
      allocatedBytes: 8192,
      fileCount: 2,
      folderCount: 1,
      percentOfParent: 100.0,
      lastModified: "2026-08-19T10:00:00.000Z",
      isHidden: false,
      hasChildren: true,
      children: [leafFile],
    };

    const parsed = HierarchyNodeSchema.safeParse(parentFolder);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.children).toHaveLength(1);
      expect(parsed.data.children?.[0].name).toBe("file.txt");
    }
  });

  it("validates hierarchy scan directory request with defaults", () => {
    const parsed = HierarchyScanDirectoryRequestSchema.safeParse({
      path: "/Users/test/Documents",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.showHidden).toBe(false);
      expect(parsed.data.depth).toBe(2);
    }
  });

  it("validates disk info schema", () => {
    const parsed = HierarchyDiskInfoSchema.safeParse({
      id: "disk-1",
      name: "Macintosh HD",
      path: "/",
      totalBytes: 500000000000,
      freeBytes: 200000000000,
      usedBytes: 300000000000,
      isRemovable: false,
    });
    expect(parsed.success).toBe(true);
  });
});
