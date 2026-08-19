import { describe, expect, it } from "vitest";
import {
  ArchiveCreateRequestSchema,
  ArchiveRecordSchema,
  ArchiveRestoreRequestSchema,
} from "./archive";

describe("Archive schemas", () => {
  it("validates create requests with file ids and optional destination", () => {
    const result = ArchiveCreateRequestSchema.parse({
      fileIds: [1, 2],
      destinationDir: " /Users/example/Horizon Archives ",
    });

    expect(result.fileIds).toEqual([1, 2]);
    expect(result.destinationDir).toBe("/Users/example/Horizon Archives");
  });

  it("rejects empty create requests", () => {
    const result = ArchiveCreateRequestSchema.safeParse({ fileIds: [] });
    expect(result.success).toBe(false);
  });

  it("validates archive records with contents", () => {
    const result = ArchiveRecordSchema.safeParse({
      id: 1,
      bundlePath: "/Users/example/Horizon Archives/archive.zip",
      destinationDir: "/Users/example/Horizon Archives",
      contents: [
        {
          fileId: 10,
          originalPath: "/Users/example/Downloads/a.mov",
          entryPath: "files/10/a.mov",
          sizeBytes: 100,
          category: "video",
          modifiedAt: null,
        },
      ],
      originalFileCount: 1,
      originalBytes: 100,
      archiveSizeBytes: 80,
      status: "active",
      createdAt: "2026-08-19T00:00:00.000Z",
      restoredAt: null,
    });

    expect(result.success).toBe(true);
  });

  it("validates restore requests", () => {
    const result = ArchiveRestoreRequestSchema.parse({
      archiveId: 1,
      restoreRoot: " /Users/example/Restored ",
    });

    expect(result.restoreRoot).toBe("/Users/example/Restored");
  });
});
