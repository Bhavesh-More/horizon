import { describe, it, expect } from "vitest";
import {
  LargeFilesListRequestSchema,
  LargeFileItemSchema,
  LargeFilesListResponseSchema,
  SystemShowInFolderRequestSchema,
} from "./large-files";

describe("Large files schemas", () => {
  describe("LargeFilesListRequestSchema", () => {
    it("provides correct default values", () => {
      const parsed = LargeFilesListRequestSchema.parse({});
      expect(parsed.minSizeBytes).toBe(52428800); // 50 MB
      expect(parsed.sortBy).toBe("size");
      expect(parsed.sortOrder).toBe("desc");
      expect(parsed.limit).toBe(500);
      expect(parsed.category).toBeUndefined();
    });

    it("accepts valid custom filter options", () => {
      const parsed = LargeFilesListRequestSchema.parse({
        minSizeBytes: 104857600, // 100 MB
        category: "video",
        sortBy: "date",
        sortOrder: "asc",
        limit: 100,
        scanRunId: 5,
      });
      expect(parsed.minSizeBytes).toBe(104857600);
      expect(parsed.category).toBe("video");
      expect(parsed.sortBy).toBe("date");
      expect(parsed.sortOrder).toBe("asc");
      expect(parsed.limit).toBe(100);
      expect(parsed.scanRunId).toBe(5);
    });

    it("rejects negative minSizeBytes", () => {
      expect(() =>
        LargeFilesListRequestSchema.parse({ minSizeBytes: -1 })
      ).toThrow();
    });

    it("rejects invalid sortBy value", () => {
      expect(() =>
        LargeFilesListRequestSchema.parse({ sortBy: "invalid" })
      ).toThrow();
    });
  });

  describe("SystemShowInFolderRequestSchema", () => {
    it("accepts non-empty path string", () => {
      const parsed = SystemShowInFolderRequestSchema.parse({
        path: "/Users/test/file.zip",
      });
      expect(parsed.path).toBe("/Users/test/file.zip");
    });

    it("rejects empty path string", () => {
      expect(() =>
        SystemShowInFolderRequestSchema.parse({ path: "" })
      ).toThrow();
    });
  });

  describe("LargeFilesListResponseSchema", () => {
    it("validates full large files response payload", () => {
      const payload = {
        files: [
          {
            fileId: 10,
            path: "/Users/test/Movies/recording.mov",
            sizeBytes: 1073741824,
            extension: "mov",
            category: "video" as const,
            modifiedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        totalFiles: 1,
        totalSizeBytes: 1073741824,
      };

      const parsed = LargeFilesListResponseSchema.parse(payload);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.totalSizeBytes).toBe(1073741824);
    });
  });
});
